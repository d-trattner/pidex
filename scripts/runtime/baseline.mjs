import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { baselineId, previewDigest, canonicalJson, isSha256, isBaselineId, RuntimeBaselineError, parseRecordJson, parseCliOptions, requireCliOptions } from './contracts.mjs';
import { safePath, readJson, readBounded } from './io.mjs';
import { observeSource, sourceBinding } from './identity.mjs';
import { observeEffectiveConfig } from './config-observation.mjs';
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';

const fail=code=>{throw new RuntimeBaselineError(code);};
const exact=(v,keys)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join('\0')!==[...keys].sort().join('\0'))fail('BASELINE_CORRUPT');};
export function validateScope(v) {
  exact(v,['platform','arch','node_version','pi_version','mode']);
  if(!['linux','win32','darwin'].includes(v.platform)||!['x64','arm64'].includes(v.arch)||v.mode!=='host-direct')fail('SCOPE_NOT_ACCEPTED');
  if(!/^\d+\.\d+\.\d+$/.test(v.node_version)||!/^\d+\.\d+\.\d+$/.test(v.pi_version))fail('SCOPE_NOT_ACCEPTED');
  return v;
}
function validateSource(v) {
  exact(v,['bootstrap','runtime','state_root']);
  for(const key of ['bootstrap','runtime']) {
    const s=v[key];exact(s,['root','commit','inventory_version','inventory_digest']);
    if(typeof s.root!=='string'||!path.isAbsolute(s.root)||!(/^[a-f0-9]{40,64}$/).test(s.commit)||s.inventory_version!==1||!isSha256(s.inventory_digest))fail('BASELINE_CORRUPT');
  }
  if(typeof v.state_root!=='string'||!path.isAbsolute(v.state_root))fail('BASELINE_CORRUPT');
}
function validateEvidence(v) {
  exact(v,['kind','root','path','sha256','candidate_fingerprint','scope','exit_code','limitations']);
  if(v.kind!=='validation'||typeof v.root!=='string'||!path.isAbsolute(v.root)||typeof v.path!=='string'||!v.path||!isSha256(v.sha256)||!isSha256(v.candidate_fingerprint)||v.exit_code!==0||!Array.isArray(v.limitations)||!v.limitations.every(s=>typeof s==='string'))fail('EVIDENCE_MISMATCH');
  validateScope(v.scope);
}
function validateRollback(v) {
  exact(v,['target_id','data_compatibility','evidence']);
  if(v.target_id!==null&&!isBaselineId(v.target_id))fail('BASELINE_CORRUPT');
  if(!['compatible','incompatible','unknown'].includes(v.data_compatibility)||typeof v.evidence!=='string')fail('BASELINE_CORRUPT');
  if(v.data_compatibility==='compatible'&&(!v.target_id||!/^sha256:[a-f0-9]{64}$/.test(v.evidence)))fail('ROLLBACK_UNPROVEN');
}
export function validateBaseline(v) {
  exact(v,['schema_version','id','created_at','source','config_digest','accepted_scopes','evidence','previous_id','rollback','operator_confirmation']);
  if(v.schema_version!==1||!isBaselineId(v.id)||!isSha256(v.config_digest)||typeof v.created_at!=='string'||new Date(v.created_at).toISOString()!==v.created_at)fail('BASELINE_CORRUPT');
  validateSource(v.source);
  if(!Array.isArray(v.accepted_scopes)||!v.accepted_scopes.length||v.accepted_scopes.length>8)fail('SCOPE_NOT_ACCEPTED');
  v.accepted_scopes.forEach(validateScope);
  if(!Array.isArray(v.evidence)||!v.evidence.length||v.evidence.length>32)fail('EVIDENCE_MISMATCH');
  v.evidence.forEach(validateEvidence);
  if(v.previous_id!==null&&!isBaselineId(v.previous_id))fail('BASELINE_CORRUPT');
  validateRollback(v.rollback);
  if(v.rollback.data_compatibility==='compatible'&&!v.evidence.some(item=>'sha256:'+item.sha256===v.rollback.evidence))fail('ROLLBACK_UNPROVEN');
  exact(v.operator_confirmation,['preview_digest','explicit','selection_generation']);
  if(!isSha256(v.operator_confirmation.preview_digest)||v.operator_confirmation.explicit!==true||!Number.isSafeInteger(v.operator_confirmation.selection_generation)||v.operator_confirmation.selection_generation<0)fail('BASELINE_CORRUPT');
  const previewPayload={schema_version:v.schema_version,source:v.source,config_digest:v.config_digest,accepted_scopes:v.accepted_scopes,evidence:v.evidence,rollback:v.rollback};
  if(previewDigest({...previewPayload,selection_generation:v.operator_confirmation.selection_generation})!==v.operator_confirmation.preview_digest)fail('BASELINE_CORRUPT');
  const {id,...payload}=v;if(baselineId(payload)!==id)fail('BASELINE_CORRUPT');
  return v;
}
const store=stateRoot=>safePath(stateRoot,'runtime-baselines');
export function readSelection(stateRoot) {
  try {
    const s=readJson(store(stateRoot),'selected.json');exact(s,['schema_version','id','generation']);
    if(s.schema_version!==1||!isBaselineId(s.id)||!Number.isSafeInteger(s.generation)||s.generation<1)fail('BASELINE_CORRUPT');
    return s;
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
export function readBaseline({stateRoot,id}) {
  if(!isBaselineId(id))fail('BASELINE_CORRUPT');
  return validateBaseline(readJson(store(stateRoot),'records/'+id.slice(9)+'.json'));
}
export function currentCandidate({bootstrapRoot,runtimeRoot,stateRoot},env=process.env) {
  const source=observeSource({bootstrapRoot,runtimeRoot,stateRoot});
  const config=observeEffectiveConfig({runtimeRoot,env});
  if(source.coverage!=='complete'||config.coverage!=='complete')fail('LOAD_UNCONFIRMED');
  for(const s of [source.bootstrap,source.runtime])if(!s.dirty||s.dirty.tracked||s.dirty.untracked)fail('CANDIDATE_CHANGED');
  return {source:sourceBinding(source),config_digest:config.digest};
}
function validateCommands(commands) {
  if(!Array.isArray(commands)||!commands.length)fail('EVIDENCE_MISMATCH');
  for(const command of commands){exact(command,['command','exit_code']);if(typeof command.command!=='string'||!command.command.trim()||command.exit_code!==0)fail('EVIDENCE_MISMATCH');}
}
function readEvidenceClaim(item,fingerprint) {
  validateEvidence(item);
  if(item.candidate_fingerprint!==fingerprint)fail('EVIDENCE_MISMATCH');
  if(item.path.split(/[\\/]/).some(part=>/^(auth\.json|credentials\.json|secrets?|\.env(?:\..*)?)$/i.test(part)))fail('PATH_UNSAFE');
  const {bytes}=readBounded(item.root,item.path);
  if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)fail('EVIDENCE_MISMATCH');
  const manifest=parseRecordJson(bytes);
  const keys=['schema_version','candidate_fingerprint','scope','commands','limitations'];
  if(Object.hasOwn(manifest,'rollback')){keys.push('rollback');exact(manifest.rollback,['target_id','data_compatibility']);}
  exact(manifest,keys);
  if(manifest.schema_version!==1||manifest.candidate_fingerprint!==fingerprint||canonicalJson(manifest.scope)!==canonicalJson(item.scope)||canonicalJson(manifest.limitations)!==canonicalJson(item.limitations))fail('EVIDENCE_MISMATCH');
  validateCommands(manifest.commands);
  return manifest.rollback??null;
}
export function verifyEvidence(evidence,candidate,scopes,rollback={target_id:null,data_compatibility:'unknown',evidence:''}) {
  validateRollback(rollback);
  const fingerprint=previewDigest(candidate);
  let proved=rollback.data_compatibility!=='compatible';
  for(const item of evidence) {
    const claim=readEvidenceClaim(item,fingerprint);
    if('sha256:'+item.sha256===rollback.evidence)proved=claim?.target_id===rollback.target_id&&claim?.data_compatibility==='compatible';
  }
  for(const scope of scopes)if(!evidence.some(e=>canonicalJson(e.scope)===canonicalJson(scope)))fail('EVIDENCE_MISMATCH');
  if(!proved)fail('ROLLBACK_UNPROVEN');
}
export function previewBaseline(descriptor,{observe=currentCandidate,env=process.env}={}) {
  exact(descriptor,['schema_version','roots','accepted_scopes','evidence','rollback']);
  if(descriptor.schema_version!==1)fail('BASELINE_CORRUPT');
  exact(descriptor.roots,['bootstrapRoot','runtimeRoot','stateRoot']);
  if(!Object.values(descriptor.roots).every(s=>typeof s==='string'&&path.isAbsolute(s)))fail('PATH_UNSAFE');
  if(!Array.isArray(descriptor.accepted_scopes)||!descriptor.accepted_scopes.length)fail('SCOPE_NOT_ACCEPTED');
  descriptor.accepted_scopes.forEach(validateScope);validateRollback(descriptor.rollback);
  if(!Array.isArray(descriptor.evidence)||!descriptor.evidence.length)fail('EVIDENCE_MISMATCH');
  const candidate=observe(descriptor.roots,env);
  verifyEvidence(descriptor.evidence,candidate,descriptor.accepted_scopes,descriptor.rollback);
  const payload={schema_version:1,...candidate,accepted_scopes:descriptor.accepted_scopes,evidence:descriptor.evidence,rollback:descriptor.rollback};
  const selection_generation=readSelection(descriptor.roots.stateRoot)?.generation??0;
  return {digest:previewDigest({...payload,selection_generation}),payload,selection_generation};
}
function syncDirectory(dir) {
  let fd;
  try{fd=fs.openSync(dir,fs.constants.O_RDONLY);fs.fsyncSync(fd);}
  catch(error){if(process.platform!=='win32'||!['EINVAL','EPERM','EISDIR','EBADF','ENOTSUP'].includes(error.code))throw error;}
  finally{if(fd!==undefined)fs.closeSync(fd);}
}
function writeDurable(file,bytes) {
  const fd=fs.openSync(file,'wx',0o600);
  try{let offset=0;const b=Buffer.from(bytes);while(offset<b.length){const n=fs.writeSync(fd,b,offset,b.length-offset);if(n<=0)fail('BASELINE_CORRUPT');offset+=n;}fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function writeImmutableRecord(root,relative,bytes) {
  const file=safePath(root,relative);
  try{writeDurable(file,bytes);}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    if(!readBounded(root,relative).bytes.equals(Buffer.from(bytes)))fail('BASELINE_CORRUPT');
    const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));
    try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  }
}
function withSelectionLock(stateRoot,expected,operation) {
  const root=store(stateRoot);fs.mkdirSync(root,{recursive:true,mode:0o700});syncDirectory(path.dirname(root));
  const lock=safePath(root,'.selection.lock');
  try{fs.mkdirSync(lock,{mode:0o700});}catch(error){if(error.code==='EEXIST')fail('STORE_LOCKED');throw error;}
  const owner=randomUUID();let owned=false;
  try {
    writeDurable(path.join(lock,'owner.json'),canonicalJson({owner}));owned=true;
    const selected=readSelection(stateRoot);
    if((selected?.id??'none')!==expected)fail('SELECTION_CONFLICT');
    return operation(root,selected);
  }finally{
    if(owned && readJson(lock,'owner.json').owner===owner){fs.unlinkSync(path.join(lock,'owner.json'));fs.rmdirSync(lock);}
  }
}
function updateSelection(root,id,selected) {
  const tmp='.selected-'+randomUUID()+'.tmp';
  try{
    writeDurable(safePath(root,tmp),canonicalJson({schema_version:1,id,generation:(selected?.generation??0)+1}));
    const target=safePath(root,'selected.json');fs.renameSync(path.join(root,tmp),target);syncDirectory(root);
  }finally{try{fs.unlinkSync(path.join(root,tmp));}catch(error){if(error.code!=='ENOENT')throw error;}}
}
export function acceptBaseline({descriptor,confirmedDigest,expectedSelection},deps={}) {
  if(!isSha256(confirmedDigest))fail('CANDIDATE_CHANGED');
  if(expectedSelection!=='none'&&!isBaselineId(expectedSelection))fail('SELECTION_CONFLICT');
  if(previewBaseline(descriptor,deps).digest!==confirmedDigest)fail('CANDIDATE_CHANGED');
  return withSelectionLock(descriptor.roots.stateRoot,expectedSelection,(root,selected)=>{
    const preview=previewBaseline(descriptor,deps);
    if(preview.digest!==confirmedDigest)fail('CANDIDATE_CHANGED');
    const payload={...preview.payload,created_at:new Date().toISOString(),previous_id:selected?.id??null,operator_confirmation:{preview_digest:confirmedDigest,explicit:true,selection_generation:preview.selection_generation}};
    const record={...payload,id:baselineId(payload)};validateBaseline(record);
    fs.mkdirSync(safePath(root,'records'),{recursive:true,mode:0o700});
    const file=safePath(root,'records/'+record.id.slice(9)+'.json');
    writeImmutableRecord(root,'records/'+record.id.slice(9)+'.json',canonicalJson(record));syncDirectory(path.dirname(file));syncDirectory(root);updateSelection(root,record.id,selected);return record;
  });
}
export function observeHostScope({env=process.env,piCommand='pi',runner=spawnSync}={}) {
  const version=runner(piCommand,['--offline','--version'],{shell:false,encoding:'utf8',timeout:3000,maxBuffer:4096,env});
  if(version.error||version.status!==0)fail('SOURCE_UNAVAILABLE');
  return {platform:process.platform,arch:process.arch,node_version:process.versions.node,pi_version:(version.stdout??'').trim(),mode:'host-direct'};
}
export function selectBaseline({stateRoot,id,confirmedId,expectedSelection},deps={}) {
  if(!isBaselineId(id)||id!==confirmedId)fail('CANDIDATE_CHANGED');
  if(expectedSelection!=='none'&&!isBaselineId(expectedSelection))fail('SELECTION_CONFLICT');
  return withSelectionLock(stateRoot,expectedSelection,(root,selected)=>{
    const record=readBaseline({stateRoot,id});
    const scope=deps.scope??observeHostScope({env:deps.env??process.env});
    if(!record.accepted_scopes.some(s=>canonicalJson(s)===canonicalJson(scope)))fail('SCOPE_NOT_ACCEPTED');
    const candidate=(deps.observe??currentCandidate)({bootstrapRoot:record.source.bootstrap.root,runtimeRoot:record.source.runtime.root,stateRoot},deps.env??process.env);
    if(canonicalJson(candidate)!==canonicalJson({source:record.source,config_digest:record.config_digest}))fail('CANDIDATE_CHANGED');
    if(selected&&selected.id!==id){
      const previous=readBaseline({stateRoot,id:selected.id});
      if(previous.rollback.target_id!==id||previous.rollback.data_compatibility!=='compatible')fail('ROLLBACK_UNPROVEN');
      verifyEvidence(previous.evidence,{source:previous.source,config_digest:previous.config_digest},previous.accepted_scopes,previous.rollback);
    }
    verifyEvidence(record.evidence,candidate,record.accepted_scopes);
    updateSelection(root,id,selected);return record;
  });
}
export async function baselineCli(argv) {
  const action=argv[0],opts=parseCliOptions(argv.slice(1),['--id','--candidate','--confirm','--expected-selection','--pidex-root'],['--json']);
  const root=path.resolve(opts['--pidex-root']??process.env.PIDEX_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
  const stateRoot=resolveStateRoot({root});
  if(action==='inspect'){const selected=readSelection(stateRoot);return {selected,record:opts['--id']||selected?readBaseline({stateRoot,id:opts['--id']??selected.id}):null};}
  if(action==='select'){
    requireCliOptions(opts,['--id','--confirm','--expected-selection']);
    return selectBaseline({stateRoot,id:opts['--id'],confirmedId:opts['--confirm'],expectedSelection:opts['--expected-selection']});
  }
  if(!['preview','accept'].includes(action)||!opts['--candidate'])throw new Error('USAGE');
  const file=path.resolve(opts['--candidate']);const descriptor=readJson(path.dirname(file),path.basename(file));
  if(opts['--pidex-root']&&path.resolve(descriptor.roots?.runtimeRoot??'')!==root)fail('ROOT_MISMATCH');
  if(action==='preview')return previewBaseline(descriptor);
  requireCliOptions(opts,['--confirm','--expected-selection']);
  return acceptBaseline({descriptor,confirmedDigest:opts['--confirm'],expectedSelection:opts['--expected-selection']});
}
export function errorExit(error) {
  if(error.message==='USAGE')return 2;
  if(['SELECTION_CONFLICT','STORE_LOCKED'].includes(error.code))return 5;
  if(['CANDIDATE_CHANGED','EVIDENCE_MISMATCH','SCOPE_NOT_ACCEPTED','ROLLBACK_UNPROVEN','LOAD_UNCONFIRMED','SOURCE_DRIFT','CONFIG_DRIFT'].includes(error.code))return 3;
  return 4;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{console.log(JSON.stringify(await baselineCli(process.argv.slice(2))));}
  catch(error){console.log(JSON.stringify({error:error instanceof RuntimeBaselineError?error.code:error.message==='USAGE'?'USAGE':'BASELINE_CORRUPT'}));process.exitCode=errorExit(error);}
}
