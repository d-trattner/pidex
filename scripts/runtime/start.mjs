import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { canonicalJson, RuntimeBaselineError, parseCliOptions, requireCliOptions } from './contracts.mjs';
import { readBaseline, readSelection, currentCandidate, errorExit, observeHostScope } from './baseline.mjs';
import { loadModuleSystem, moduleEnabled } from '../modules/lib.mjs';
import { readJson, safePath } from './io.mjs';
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';

const fail=code=>{throw new RuntimeBaselineError(code);};
function verifyHello(message,{pid,launchId,id,before,scope,entry}) {
  if(message.pid!==pid||message.launch_id!==launchId||message.baseline_id!==id||typeof message.generation_id!=='string')fail('LOAD_UNCONFIRMED');
  if(canonicalJson(message.source)!==canonicalJson(before.source)||message.config_digest!==before.config_digest||canonicalJson(message.scope)!==canonicalJson(scope))fail('CANDIDATE_CHANGED');
  if(!Array.isArray(message.commands))fail('LOAD_UNCONFIRMED');
  for(const name of ['pd','pidex','pdstatus']) {
    const found=message.commands.filter(c=>c.name===name);
    if(found.length!==1||path.resolve(found[0].path)!==entry)fail('ROOT_MISMATCH');
  }
}
function verifyAck(message,hello,pid) {
  if(!hello||message.pid!==pid||message.launch_id!==hello.launch_id||message.generation_id!==hello.generation_id||message.status!=='ready')fail('LOAD_UNCONFIRMED');
}
export async function controlledStart({stateRoot,id,project,piCommand='pi',stdio='inherit',env=process.env},{spawnProcess=spawn,versionRunner=spawnSync,observe=currentCandidate,timeoutMs=15000}={}) {
  const record=readBaseline({stateRoot,id});
  const roots={bootstrapRoot:record.source.bootstrap.root,runtimeRoot:record.source.runtime.root,stateRoot};
  const launchEnv={...env,PIDEX_ROOT:roots.runtimeRoot,PIDEX_HOME_ROOT:roots.runtimeRoot,PIDEX_STATE_DIR:stateRoot,PIDEX_BASELINE_ID:id,PIDEX_BASELINE_LAUNCH_ID:randomUUID()};
  delete launchEnv.PIDEX_CHILD;
  const before=observe(roots,launchEnv);
  if(canonicalJson(before)!==canonicalJson({source:record.source,config_digest:record.config_digest}))fail('CANDIDATE_CHANGED');
  const scope=observeHostScope({piCommand,env:launchEnv,runner:versionRunner});
  if(!record.accepted_scopes.some(s=>canonicalJson(s)===canonicalJson(scope)))fail('SCOPE_NOT_ACCEPTED');
  const entry=path.join(roots.bootstrapRoot,'extensions/pidex/index.ts');
  // Explicit local entry, no discovery, no prompt. Existing user auth remains
  // local; no credential value is read or written by this adapter.
  const args=['--offline','--no-extensions','--no-skills','--no-prompt-templates','--no-themes','-e',entry,'--skill',path.join(roots.runtimeRoot,'skills'),'--prompt-template',path.join(roots.runtimeRoot,'prompts')];
  const system=loadModuleSystem(roots.runtimeRoot);
  for(const item of system.modules) {
    if(!item.manifest.skill_package||!moduleEnabled(system,item.manifest).enabled)continue;
    const pkgRoot=path.resolve(path.dirname(item.file),item.manifest.skill_package.path);
    const relative=path.relative(roots.runtimeRoot,pkgRoot).split(path.sep).join('/');
    safePath(roots.runtimeRoot,relative);
    const pkg=readJson(pkgRoot,'package.json');
    if(!Array.isArray(pkg.pi?.skills))fail('CONFIG_UNCOVERED');
    for(const skill of pkg.pi.skills){if(typeof skill!=='string')fail('CONFIG_UNCOVERED');const target=safePath(pkgRoot,skill.replace(/^\.\//,''));args.push('--skill',target);}
  }
  const child=spawnProcess(piCommand,args,{cwd:path.resolve(project),env:launchEnv,shell:false,stdio:stdio==='inherit'?['inherit','inherit','inherit','ipc']:['pipe','pipe','pipe','ipc']});
  let confirmed=false,released=false,hello=null;
  const deadline=performance.now()+timeoutMs;
  const withinDeadline=()=>{if(performance.now()>=deadline)fail('LOAD_UNCONFIRMED');};
  return await new Promise((resolve,reject)=>{
    let settled=false;
    const killOwn=()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');};
    let hardTimer;
    const timer=setTimeout(()=>rejectStart(new RuntimeBaselineError('LOAD_UNCONFIRMED')),timeoutMs);
    const rejectStart=error=>{
      if(settled)return;
      clearTimeout(timer);
      if(!released){killOwn();hardTimer=setTimeout(()=>child.kill('SIGKILL'),2000);}
      if(!settled){settled=true;reject(error instanceof RuntimeBaselineError?error:new RuntimeBaselineError('LOAD_UNCONFIRMED'));}
    };
    const interrupt=()=>{if(!released)rejectStart(new RuntimeBaselineError('LOAD_UNCONFIRMED'));};
    const terminate=()=>{if(released)child.kill('SIGTERM');else interrupt();};
    process.on('SIGINT',interrupt);process.on('SIGTERM',terminate);
    child.on('error',error=>{if(!confirmed)rejectStart(error);});
    child.on('message',message=>{
      if(confirmed)return; // Receipt is single-use; never kill an active run on a later message.
      try {
        withinDeadline();
        if(message?.type==='pidex-baseline-hello') {
          if(hello)fail('LOAD_UNCONFIRMED');
          verifyHello(message,{pid:child.pid,launchId:launchEnv.PIDEX_BASELINE_LAUNCH_ID,id,before,scope,entry});
          const after=observe(roots,launchEnv);
          withinDeadline();
          if(canonicalJson(before)!==canonicalJson(after))fail('CANDIDATE_CHANGED');
          hello=message;
          released=true; // Parent grants dispatch; never terminate later work on handshake uncertainty.
          child.send({type:'pidex-baseline-confirm',launch_id:message.launch_id,generation_id:message.generation_id});
        } else if(message?.type==='pidex-baseline-ack') {
          verifyAck(message,hello,child.pid);
          confirmed=true;clearTimeout(timer);
          // Keep the owned IPC descriptor until child exit. Early disconnect
          // can leave Node's close accounting unsettled with piped RPC stdio.
        }
      }catch(error){rejectStart(error);}
    });
    child.on('close',(code,signal)=>{
      process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);
      clearTimeout(timer);clearTimeout(hardTimer);
      if(settled)return;
      settled=true;
      if(!confirmed)reject(new RuntimeBaselineError('LOAD_UNCONFIRMED'));
      else resolve({code:code??(128+(os.constants.signals[signal]??0)),signal});
    });
  });
}
export async function startCli(argv) {
  const opts=parseCliOptions(argv,['--baseline','--project','--pidex-root']);
  requireCliOptions(opts,['--project','--baseline']);
  const root=path.resolve(opts['--pidex-root']??process.env.PIDEX_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
  const stateRoot=resolveStateRoot({root});
  const id=opts['--baseline']==='selected'?readSelection(stateRoot)?.id:opts['--baseline'];
  return controlledStart({stateRoot,id,project:opts['--project']});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{process.exitCode=(await startCli(process.argv.slice(2))).code;}
  catch(error){console.error(error instanceof RuntimeBaselineError?error.code:error.message==='USAGE'?'USAGE':'LOAD_UNCONFIRMED');process.exitCode=error.code==='LOAD_UNCONFIRMED'?4:errorExit(error);}
}
