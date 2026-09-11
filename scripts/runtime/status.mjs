import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { readJson } from './io.mjs';
import { fileURLToPath } from 'node:url';
import { canonicalJson, RuntimeBaselineError, parseCliOptions } from './contracts.mjs';
import { observeSource, sourceBinding } from './identity.mjs';
import { observeEffectiveConfig } from './config-observation.mjs';
import { readSelection, readBaseline, validateBaseline, errorExit } from './baseline.mjs';
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';

export function resolveRuntimeRoots({bootstrapRoot,env=process.env}) {
  const valid=root=>{try{const p=readJson(fs.realpathSync(root),'package.json');return ['pidex','@d-trattner/pidex'].includes(p.name)&&fs.existsSync(path.join(root,'agents'))&&fs.existsSync(path.join(root,'config/agents.json'))&&fs.existsSync(path.join(root,'scripts'));}catch{return false;}};
  const home=env.PIDEX_HOME_ROOT??path.join(env.HOME??env.USERPROFILE??os.homedir(), 'pidex');
  const runtimeRoot=env.PIDEX_ROOT&&valid(env.PIDEX_ROOT)?path.resolve(env.PIDEX_ROOT):valid(home)?path.resolve(home):bootstrapRoot;
  return {bootstrapRoot,runtimeRoot,stateRoot:resolveStateRoot({root:runtimeRoot,env})};
}
function confirmedLoad(load,baselineId) {
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
  return load?.schema_version===1&&load.assurance==='controlled_start'&&load.baseline_id===baselineId&&Number.isSafeInteger(load.pid)&&load.pid>0&&uuid(load.launch_id)&&uuid(load.generation_id);
}
function boundFacts({source,config,load,boundBaseline,scope}) {
  const current=sourceBinding(source);
  const sourceDrift=canonicalJson(current)!==canonicalJson(boundBaseline.source) || Boolean(load&&canonicalJson(current)!==canonicalJson(load.source));
  const configDrift=config.digest!==boundBaseline.config_digest || Boolean(load&&config.digest!==load.config_digest);
  const accepted=Boolean(scope&&boundBaseline.accepted_scopes.some(s=>canonicalJson(s)===canonicalJson(scope)));
  const rootMismatch=['bootstrap','runtime'].some(key=>current[key].root!==boundBaseline.source[key].root)||current.state_root!==boundBaseline.source.state_root;
  const unconfirmed=!confirmedLoad(load,boundBaseline.id)||source.coverage!=='complete'||config.coverage!=='complete';
  return {sourceDrift,configDrift,accepted,rootMismatch,unconfirmed};
}
function boundStatus(input,reasons) {
  try{validateBaseline(input.boundBaseline);}catch{reasons.push({code:'BASELINE_CORRUPT',component:'baseline'});return 'invalid';}
  const facts=boundFacts(input);
  const conditions=[
    [facts.sourceDrift,'SOURCE_DRIFT','source'],
    [facts.configDrift,'CONFIG_DRIFT','configuration'],
    [!facts.accepted,'SCOPE_NOT_ACCEPTED','scope'],
    [facts.rootMismatch,'ROOT_MISMATCH','source'],
    [facts.unconfirmed,'LOAD_UNCONFIRMED','load'],
  ];
  for(const [applies,code,component] of conditions)if(applies)reasons.push({code,component});
  if(input.issues.length||reasons.some(r=>['BASELINE_CORRUPT','ROOT_MISMATCH','PATH_UNSAFE','CONFIG_INVALID'].includes(r.code)))return 'invalid';
  if(facts.unconfirmed)return 'unconfirmed';
  if(facts.sourceDrift)return 'restart_required';
  if(facts.configDrift)return 'configuration_changed';
  if(!facts.accepted)return 'scope_not_accepted';
  return 'ready';
}
export function evaluateRuntimeStatus({source,config,load=null,boundBaseline=null,selectedId=null,scope=null,experimental=false,issues=[]}) {
  const reasons=[...issues,...source.issues,...config.issues];
  const binding=boundBaseline?'baseline':'unbound';
  const unboundStatus=experimental?'experimental':'unregistered';
  const status=boundBaseline?boundStatus({source,config,load,boundBaseline,scope,issues},reasons):unboundStatus;
  return {schema_version:1,status,binding,bound_baseline_id:boundBaseline?.id??null,selected_baseline_id:selectedId,can_dispatch:binding==='unbound'||status==='ready',reasons,
    next_action:status==='ready'?'Continue within accepted scope.':binding==='unbound'?'Unbound session: inspect before selecting a working baseline.':'Do not dispatch. Inspect differences and start a fresh confirmed session.',source,config,load_assurance:load?.assurance??null};
}
export function observeRuntime(roots,{env=process.env,load=null,boundId=null,scope=null}={}) {
  const source=observeSource(roots),config=observeEffectiveConfig({runtimeRoot:roots.runtimeRoot,env});
  const issues=[];let selectedId=null,boundBaseline=null;
  try {selectedId=readSelection(roots.stateRoot)?.id??null;if(boundId)boundBaseline=readBaseline({stateRoot:roots.stateRoot,id:boundId});}
  catch(error){issues.push({code:error instanceof RuntimeBaselineError?error.code:'BASELINE_CORRUPT',component:'store'});}
  const experimental=['bootstrap','runtime'].some(key=>source[key].dirty?.tracked||source[key].dirty?.untracked);
  const result=evaluateRuntimeStatus({source,config,load,boundBaseline,selectedId,scope,issues,experimental});
  // A missing/corrupt explicitly bound record must not downgrade to unbound.
  if(boundId&&!boundBaseline)Object.assign(result,{status:'invalid',binding:'baseline',bound_baseline_id:boundId,can_dispatch:false});
  return result;
}
export function formatRuntimeStatus(status) {
  return [`PIDEX: ${status.status}`,`Baseline: ${status.bound_baseline_id??'not bound'} (selected: ${status.selected_baseline_id??'none'})`,`Source: ${status.source.runtime.commit??'unknown'} / ${status.source.runtime.root}`,`Loaded: ${status.load_assurance??'not observed in this process'}`,`Config: ${status.config.coverage}`,`Reasons: ${status.reasons.map(r=>r.code).join(', ')||'none'}`,status.next_action].join('\n');
}
export function statusCli(argv) {
  const opts=parseCliOptions(argv,['--pidex-root'],['--json']);
  const bootstrapRoot=path.resolve(opts['--pidex-root']??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
  const json=Boolean(opts['--json']);
  const roots=resolveRuntimeRoots({bootstrapRoot,env:{...process.env,PIDEX_ROOT:bootstrapRoot}});
  return {json,status:observeRuntime(roots)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const {json,status}=statusCli(process.argv.slice(2));console.log(json?JSON.stringify(status):formatRuntimeStatus(status));}
  catch(error){console.log(JSON.stringify({error:error instanceof RuntimeBaselineError?error.code:error.message==='USAGE'?'USAGE':'SOURCE_UNAVAILABLE'}));process.exitCode=errorExit(error);}
}
