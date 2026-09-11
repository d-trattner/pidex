import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { controlledStart } from './start.mjs';
import { readBounded, safePath } from './io.mjs';
import { observeSource, observeInventory, sourceBinding } from './identity.mjs';
import { observeEffectiveConfig, mergeRoute, mergeSandbox } from './config-observation.mjs';
import { previewDigest, canonicalJson, RuntimeBaselineError } from './contracts.mjs';
import { previewBaseline, acceptBaseline, readSelection, readBaseline, validateBaseline, selectBaseline } from './baseline.mjs';
import { evaluateRuntimeStatus, observeRuntime, statusCli } from './status.mjs';

function fixture(t) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'pidex-runtime-test-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const root=path.join(base,'source');
  for(const dir of ['extensions','scripts','modules','agents','prompts','skills','rules','config'])fs.mkdirSync(path.join(root,dir),{recursive:true});
  const write=(rel,data)=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof data==='string'?data:JSON.stringify(data));};
  write('package.json',{name:'pidex',version:'0.5.0',type:'module'});write('pnpm-lock.yaml','lockfileVersion: 9\n');
  write('scripts/helper.mjs','export const marker = 1;\n');
  write('config/agents.json',{defaults:{provider:'pi',model:'test/model'},agents:{'pidex-qa':{effort:'high'}}});
  const git=(...args)=>{const p=spawnSync('git',['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1'},timeout:5000});assert.equal(p.status,0,p.stderr);return p.stdout.trim();};
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','-qm','fixture');
  const roots={bootstrapRoot:root,runtimeRoot:root,stateRoot:path.join(base,'state')};
  const observe=()=>({source:observeSource(roots),config:observeEffectiveConfig({runtimeRoot:root,env:{}})});
  return {base,root,roots,write,git,observe};
}
function evidenceFixture(t) {
  const f=fixture(t),{source,config}=f.observe();
  const candidate={source:sourceBinding(source),config_digest:config.digest};
  const scope={platform:process.platform,arch:process.arch,node_version:process.versions.node,pi_version:'0.85.1',mode:'host-direct'};
  const manifest={schema_version:1,candidate_fingerprint:previewDigest(candidate),scope,commands:[{command:'synthetic fixture validation only',exit_code:0}],limitations:['test fixture, not operational acceptance']};
  const bytes=Buffer.from(JSON.stringify(manifest));fs.writeFileSync(path.join(f.base,'evidence.json'),bytes);
  const evidence={kind:'validation',root:f.base,path:'evidence.json',sha256:createHash('sha256').update(bytes).digest('hex'),candidate_fingerprint:manifest.candidate_fingerprint,scope,exit_code:0,limitations:manifest.limitations};
  const descriptor={schema_version:1,roots:f.roots,accepted_scopes:[scope],evidence:[evidence],rollback:{target_id:null,data_compatibility:'unknown',evidence:''}};
  const deps={env:{}};
  const preview=previewBaseline(descriptor,deps);
  const accept=()=>acceptBaseline({descriptor,confirmedDigest:preview.digest,expectedSelection:'none'},deps);
  return {...f,source,config,candidate,scope,descriptor,deps,preview,accept};
}
test('source observation binds clean Git, bootstrap/runtime independently, no state writes',t=>{
 const f=fixture(t),r=f.observe();assert.equal(r.source.coverage,'complete');assert.equal(r.source.bootstrap.inventory_digest,r.source.runtime.inventory_digest);assert.deepEqual(r.source.runtime.dirty,{tracked:false,untracked:false});assert.equal(fs.existsSync(f.roots.stateRoot),false);
});
test('source add/change/delete updates digest without requiring a commit change',t=>{
 const f=fixture(t),initial=f.observe().source.runtime;
 f.write('scripts/new.mjs','export const x=2');assert.equal(f.observe().source.coverage,'incomplete');f.git('add','scripts/new.mjs');const added=f.observe().source.runtime;
 assert.equal(initial.commit,added.commit);assert.notEqual(initial.inventory_digest,added.inventory_digest);
 f.write('scripts/new.mjs','export const x=3');const edited=f.observe().source.runtime;assert.notEqual(added.inventory_digest,edited.inventory_digest);
 fs.unlinkSync(path.join(f.root,'scripts/new.mjs'));assert.equal(initial.inventory_digest,f.observe().source.runtime.inventory_digest);
});
test('tests, private state, auth JSON and arbitrary local config not opened as runtime sources',t=>{
 const f=fixture(t),before=f.observe().source.runtime.inventory_digest;
 for(const rel of ['scripts/a.test.mjs','state/private.json','agents.output/private.mjs','config/unknown.local.json','modules/private/auth.json'])f.write(rel,'SECRET_SENTINEL');
 assert.equal(f.observe().source.runtime.inventory_digest,before);
});
test('auth helper code is bound, even though auth data is excluded',t=>{
 const f=fixture(t),before=f.observe().source.runtime.inventory_digest;
 f.write('scripts/check-auth.sh','exit 0');f.git('add','scripts/check-auth.sh');assert.equal(f.observe().source.coverage,'complete');assert.notEqual(before,f.observe().source.runtime.inventory_digest);
});
test('bounded IO denies path traversal, alternate data streams, symlink files and oversized data',t=>{
 const f=fixture(t);
 for(const rel of ['../x','/etc/passwd','x:stream','a\\b'])assert.throws(()=>safePath(f.root,rel),{code:'PATH_UNSAFE'});
 fs.symlinkSync(path.join(f.root,'package.json'),path.join(f.root,'scripts/link.mjs'));
 assert.throws(()=>readBounded(f.root,'scripts/link.mjs'),{code:'PATH_UNSAFE'});
 assert.equal(f.observe().source.coverage,'incomplete');
 assert.throws(()=>readBounded(f.root,'package.json',1),{code:'OBSERVATION_LIMIT'});
});
test('missing Git and exhausted inventory budgets cannot report complete',t=>{
 const f=fixture(t);
 const result=observeSource(f.roots,{gitRunner:()=>({status:1,stdout:''})});assert.equal(result.coverage,'incomplete');assert.equal(result.runtime.commit,null);
 assert.throws(()=>observeInventory(f.root,{limits:{files:1,fileBytes:1000,totalBytes:1000,millis:5000}}),{code:'OBSERVATION_LIMIT'});
});
test('config resolves shared route spread and sandbox deep merge without writes',t=>{
 const f=fixture(t),c=f.observe().config;assert.equal(c.coverage,'complete');assert.equal(c.projection.routing.agents['pidex-qa'].model,'test/model');
 assert.deepEqual(mergeRoute({defaults:{a:1,b:2},agents:{x:{b:3}}},'x'),{a:1,b:3});
 assert.deepEqual(mergeSandbox({a:{b:1,c:[1]}},{a:{c:[2]}}),{a:{b:1,c:[2]}});
});
test('config formatting is stable; effective values and principals cause drift',t=>{
 const f=fixture(t),a=f.observe().config.digest;
 f.write('config/agents.json','{ "agents": {"pidex-qa":{"effort":"high"}}, "defaults":{"model":"test/model","provider":"pi"} }');assert.equal(a,f.observe().config.digest);
 f.write('config/agents.json',{defaults:{provider:'pi',model:'test/model'},agents:{'pidex-qa':{effort:'high',principal:'other'}}});assert.notEqual(a,f.observe().config.digest);
});
test('unknown config/overrides do not leak values or get a complete digest',t=>{
 const f=fixture(t);f.write('config/agents.json',{unsupportedFixtureField:'SECRET_SENTINEL'});
 const bad=f.observe().config;assert.equal(bad.digest,null);assert.ok(!JSON.stringify(bad).includes('SECRET_SENTINEL'));
 const external=observeEffectiveConfig({runtimeRoot:f.root,env:{PIDEX_CONFIG_FILE:'/not/read/SECRET_SENTINEL'}});assert.equal(external.coverage,'incomplete');assert.ok(!JSON.stringify(external).includes('SECRET_SENTINEL'));
});
test('flag projection follows actual consumer semantics, including the legacy truthy lifecycle switch',t=>{
 const f=fixture(t),observe=env=>observeEffectiveConfig({runtimeRoot:f.root,env});
 assert.equal(observe({PIDEX_ALLOW_ANTHROPIC:'0'}).digest,observe({PIDEX_ALLOW_ANTHROPIC:'false'}).digest);
 assert.equal(observe({PIDEX_LIFECYCLE_ACTION_ENABLED:'0'}).projection.flags.PIDEX_LIFECYCLE_ACTION_ENABLED,true);
 assert.notEqual(observe({PIDEX_LIFECYCLE_ACTION_ENABLED:'0'}).digest,observe({}).digest);
});
test('optional uncovered pricing is refused by presence, not read into diagnostic output',t=>{
 const f=fixture(t);f.write('config/pricing.json','SECRET_SENTINEL');fs.chmodSync(path.join(f.root,'config/pricing.json'),0);
 const config=f.observe().config;assert.ok(config.issues.some(i=>i.component==='auxiliary'&&i.code==='CONFIG_UNCOVERED'));assert.ok(!JSON.stringify(config).includes('SECRET_SENTINEL'));
});
test('real status and baseline CLI emit one JSON object and do not create a store',t=>{
 const f=evidenceFixture(t),env={PATH:process.env.PATH,PIDEX_ROOT:f.root,PIDEX_STATE_DIR:f.roots.stateRoot};
 for(const [script,args] of [['status.mjs',['--pidex-root',f.root,'--json']],['baseline.mjs',['inspect','--pidex-root',f.root,'--json']]]){
  const p=spawnSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url)),...args],{env,encoding:'utf8',timeout:10000});assert.equal(p.status,0,p.stderr);assert.doesNotThrow(()=>JSON.parse(p.stdout));assert.equal(p.stderr,'');
 }
 const invalid=spawnSync(process.execPath,[fileURLToPath(new URL('baseline.mjs',import.meta.url)),'select'],{env,encoding:'utf8',timeout:10000});assert.equal(invalid.status,2);assert.equal(JSON.parse(invalid.stdout).error,'USAGE');assert.equal(fs.existsSync(f.roots.stateRoot),false);
});
test('parallel status files are not config drift',t=>{
 const f=fixture(t),before=f.observe().config.digest;f.write('state/parallel-agents/status.json',{lanes:{x:{busy:true}}});assert.equal(before,f.observe().config.digest);
});
test('inspect and preview are read-only, exact acceptance produces immutable bound record',t=>{
 const f=evidenceFixture(t);assert.equal(readSelection(f.roots.stateRoot),null);assert.equal(fs.existsSync(f.roots.stateRoot),false);
 const record=f.accept();assert.equal(validateBaseline(record).id,record.id);assert.equal(readSelection(f.roots.stateRoot).id,record.id);assert.deepEqual(readBaseline({stateRoot:f.roots.stateRoot,id:record.id}),record);
 assert.throws(f.accept,{code:'CANDIDATE_CHANGED'});
});
test('wrong confirmation, missing expected selection and changed evidence do not select',t=>{
 const f=evidenceFixture(t);
 assert.throws(()=>acceptBaseline({descriptor:f.descriptor,confirmedDigest:'a'.repeat(64),expectedSelection:'none'},f.deps),{code:'CANDIDATE_CHANGED'});assert.equal(fs.existsSync(f.roots.stateRoot),false);
 assert.throws(()=>acceptBaseline({descriptor:f.descriptor,confirmedDigest:f.preview.digest},f.deps),{code:'SELECTION_CONFLICT'});
 fs.writeFileSync(path.join(f.base,'evidence.json'),'{}');assert.throws(f.accept,{code:'EVIDENCE_MISMATCH'});
});
test('dirty candidate refuses acceptance even outside runtime inventory',t=>{
 const f=evidenceFixture(t);f.write('notes.md','not a runtime input');assert.throws(f.accept,{code:'CANDIDATE_CHANGED'});
});
test('foreign/stale lock is never removed or taken over',t=>{
 const f=evidenceFixture(t),lock=path.join(f.roots.stateRoot,'runtime-baselines/.selection.lock');fs.mkdirSync(lock,{recursive:true});fs.writeFileSync(path.join(lock,'owner.json'),'{}');assert.throws(f.accept,{code:'STORE_LOCKED'});assert.ok(fs.existsSync(lock));
});
test('selection generation is included in preview and prevents ABA confirmation',t=>{
 const f=evidenceFixture(t),record=f.accept(),pointer=path.join(f.roots.stateRoot,'runtime-baselines/selected.json');
 const first=previewBaseline(f.descriptor,f.deps);fs.writeFileSync(pointer,JSON.stringify({schema_version:1,id:record.id,generation:3}));
 assert.notEqual(previewBaseline(f.descriptor,f.deps).digest,first.digest);
});
test('record tampering and unknown fields are rejected',t=>{
 const f=evidenceFixture(t),record=f.accept();assert.throws(()=>validateBaseline({...record,extra:true}),{code:'BASELINE_CORRUPT'});assert.throws(()=>validateBaseline({...record,config_digest:'b'.repeat(64)}),{code:'BASELINE_CORRUPT'});
});
test('state evaluator distinguishes ready, weak load, source/config drift and unsupported mode',t=>{
 const f=evidenceFixture(t),record=f.accept(),load={schema_version:1,pid:1234,launch_id:'11111111-1111-4111-8111-111111111111',generation_id:'22222222-2222-4222-8222-222222222222',baseline_id:record.id,assurance:'controlled_start',source:f.candidate.source,config_digest:f.config.digest};
 const input={source:f.source,config:f.config,load,boundBaseline:record,scope:f.scope};
 assert.equal(evaluateRuntimeStatus(input).status,'ready');
 assert.equal(evaluateRuntimeStatus({...input,load:null}).status,'unconfirmed');
 assert.equal(evaluateRuntimeStatus({...input,load:{...load,assurance:'observed_at_load'}}).can_dispatch,false);
 assert.equal(evaluateRuntimeStatus({...input,scope:{...f.scope,mode:'project-pipeline'}}).status,'scope_not_accepted');
 assert.equal(evaluateRuntimeStatus({...input,config:{...f.config,digest:'b'.repeat(64)}}).status,'configuration_changed');
 f.write('scripts/helper.mjs','export const marker=2');assert.equal(evaluateRuntimeStatus({...input,source:f.observe().source}).status,'restart_required');
});
test('disk-only status never invents live assurance and corrupt binding cannot downgrade to unbound',t=>{
 const f=evidenceFixture(t),record=f.accept();assert.equal(observeRuntime(f.roots,{env:{}}).status,'unregistered');assert.equal(observeRuntime(f.roots,{env:{},boundId:record.id,scope:f.scope}).status,'unconfirmed');
 assert.equal(observeRuntime(f.roots,{env:{},boundId:'baseline:'+'f'.repeat(64)}).can_dispatch,false);
});
test('CLI options reject unknown flags; human formatting is opt-in only',()=>{assert.throws(()=>statusCli(['--load-receipt','anything']),/USAGE/);});

test('inventory access spy never opens excluded secrets or arbitrary untracked resource data',t=>{
 const f=fixture(t),opened=[];f.write('modules/private/auth.json','SECRET');
 observeInventory(f.root,{readFile:(root,rel,max)=>{opened.push(rel);return readBounded(root,rel,max);}});
 assert.ok(!opened.some(p=>p.includes('auth.json')));
 f.write('modules/private/arbitrary.json','SECRET');
 assert.throws(()=>observeInventory(f.root,{readFile:(root,rel,max)=>{opened.push(rel);return readBounded(root,rel,max);}}),{code:'CONFIG_UNCOVERED'});
 assert.ok(!opened.some(p=>p.endsWith('arbitrary.json')));
});
test('code under scripts/wiki is runtime input, not the private project wiki',t=>{
 const f=fixture(t),before=f.observe().source.runtime.inventory_digest;f.write('modules/hygiene/scripts/wiki/check.mjs','export const x=1');f.git('add','.');
 assert.equal(f.observe().source.coverage,'complete');assert.notEqual(before,f.observe().source.runtime.inventory_digest);
});
test('rollback without proved compatibility refuses and preserves the current selection',t=>{
 const f=evidenceFixture(t),a=f.accept(),preview=previewBaseline(f.descriptor,f.deps);
 const b=acceptBaseline({descriptor:f.descriptor,confirmedDigest:preview.digest,expectedSelection:a.id},f.deps);
 assert.throws(()=>selectBaseline({stateRoot:f.roots.stateRoot,id:a.id,confirmedId:a.id,expectedSelection:b.id},{...f.deps,scope:f.scope}),{code:'ROLLBACK_UNPROVEN'});
 assert.equal(readSelection(f.roots.stateRoot).id,b.id);
});
test('rollback requires a digest-bound target claim and rereads that evidence before switching',t=>{
 const f=evidenceFixture(t),a=f.accept();
 const manifest=JSON.parse(fs.readFileSync(path.join(f.base,'evidence.json'),'utf8'));manifest.rollback={target_id:a.id,data_compatibility:'compatible'};
 const bytes=Buffer.from(JSON.stringify(manifest)),sha=createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(f.base,'rollback.json'),bytes);
 const descriptor={...f.descriptor,evidence:[{...f.descriptor.evidence[0],path:'rollback.json',sha256:sha}],rollback:{target_id:a.id,data_compatibility:'compatible',evidence:'sha256:'+sha}};
 assert.throws(()=>previewBaseline({...descriptor,rollback:{...descriptor.rollback,evidence:'a PASS label is not evidence'}},f.deps),{code:'ROLLBACK_UNPROVEN'});
 const preview=previewBaseline(descriptor,f.deps),b=acceptBaseline({descriptor,confirmedDigest:preview.digest,expectedSelection:a.id},f.deps);
 const select=()=>selectBaseline({stateRoot:f.roots.stateRoot,id:a.id,confirmedId:a.id,expectedSelection:b.id},{...f.deps,scope:f.scope});
 fs.writeFileSync(path.join(f.base,'rollback.json'),'{}');assert.throws(select,{code:'EVIDENCE_MISMATCH'});assert.equal(readSelection(f.roots.stateRoot).id,b.id);
 fs.writeFileSync(path.join(f.base,'rollback.json'),bytes);assert.equal(select().id,a.id);
});
for(const stage of ['before-rename','after-rename'])test('writer crash '+stage+' leaves only complete records/pointers and a blocking own lock',t=>{
 const f=evidenceFixture(t),caseFile=path.join(f.base,'case.json');
 fs.writeFileSync(caseFile,JSON.stringify({descriptor:f.descriptor,confirmedDigest:f.preview.digest,expectedSelection:'none'}));
 const program=`import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const rename=fs.renameSync;fs.renameSync=(...args)=>{${stage==='before-rename'?'process.exit(77);':'rename(...args);process.exit(78);'}};syncBuiltinESMExports();const {acceptBaseline}=await import(${JSON.stringify(new URL('./baseline.mjs',import.meta.url).href)});acceptBaseline(JSON.parse(fs.readFileSync(process.argv[1],'utf8')),{env:{}});`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',program,caseFile],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,stage==='before-rename'?77:78,result.stderr);
 const selected=readSelection(f.roots.stateRoot);
 if(stage==='before-rename')assert.equal(selected,null);else assert.equal(readBaseline({stateRoot:f.roots.stateRoot,id:selected.id}).id,selected.id);
 const store=path.join(f.roots.stateRoot,'runtime-baselines');assert.equal(fs.readdirSync(path.join(store,'records')).length,1);assert.ok(fs.existsSync(path.join(store,'.selection.lock/owner.json')));
});
test('two real writer processes cannot both accept the same preview',async t=>{
 const f=evidenceFixture(t),caseFile=path.join(f.base,'case.json');fs.writeFileSync(caseFile,JSON.stringify({descriptor:f.descriptor,confirmedDigest:f.preview.digest,expectedSelection:'none'}));
 const program=`import fs from 'node:fs';const {acceptBaseline}=await import(${JSON.stringify(new URL('./baseline.mjs',import.meta.url).href)});try{acceptBaseline(JSON.parse(fs.readFileSync(process.argv[1],'utf8')),{env:{}});}catch(error){process.exit(['STORE_LOCKED','SELECTION_CONFLICT','CANDIDATE_CHANGED'].includes(error.code)?5:4);}`;
 const run=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',program,caseFile],{stdio:'ignore',timeout:15000});p.on('error',reject);p.on('close',resolve);});
 assert.deepEqual((await Promise.all([run(),run()])).sort(),[0,5]);
 assert.equal(readSelection(f.roots.stateRoot).generation,1);assert.equal(fs.readdirSync(path.join(f.roots.stateRoot,'runtime-baselines/records')).length,1);
});
for(const kind of ['timeout','wrong-pid','wrong-root','valid-then-late-message'])test('controlled start '+kind,async t=>{
 const f=evidenceFixture(t),record=f.accept();let killed=false;
 const child=new EventEmitter();Object.assign(child,{pid:1234,exitCode:null,signalCode:null,kill:()=>{killed=true;queueMicrotask(()=>{child.signalCode='SIGTERM';child.emit('close',null,'SIGTERM');});}});
 const spawnProcess=(_command,_args,{env})=>{
  child.send=message=>queueMicrotask(()=>{
   child.emit('message',{type:'pidex-baseline-ack',launch_id:message.launch_id,generation_id:message.generation_id,pid:child.pid,status:'ready'});
   child.emit('message',{type:'pidex-baseline-hello',pid:0});
   child.exitCode=0;child.emit('close',0,null);
  });
  if(kind!=='timeout')queueMicrotask(()=>child.emit('message',{type:'pidex-baseline-hello',pid:kind==='wrong-pid'?999:child.pid,launch_id:env.PIDEX_BASELINE_LAUNCH_ID,baseline_id:record.id,generation_id:'fixture-generation',source:kind==='wrong-root'?{...f.candidate.source,state_root:'/wrong-root'}:f.candidate.source,config_digest:f.config.digest,scope:f.scope,commands:['pd','pidex','pdstatus'].map(name=>({name,path:path.join(f.root,'extensions/pidex/index.ts')}))}));
  return child;
 };
 const pending=controlledStart({stateRoot:f.roots.stateRoot,id:record.id,project:f.base,env:{}},{spawnProcess,versionRunner:()=>({status:0,stdout:'0.85.1'}),timeoutMs:kind==='timeout'?20:5000});
 if(kind==='valid-then-late-message'){assert.equal((await pending).code,0);assert.equal(killed,false);}else{await assert.rejects(pending,{code:kind==='wrong-root'?'CANDIDATE_CHANGED':'LOAD_UNCONFIRMED'});assert.equal(killed,true);}
});
