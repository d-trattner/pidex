import { randomUUID } from 'node:crypto';
import { canonicalJson, RuntimeBaselineError } from '../../scripts/runtime/contracts.mjs';
import { sourceBinding } from '../../scripts/runtime/identity.mjs';
import { observeRuntime, formatRuntimeStatus } from '../../scripts/runtime/status.mjs';

const key=Symbol.for('pidex.runtime-baseline.generations.v1');
let active: any = null;
export function assertRuntimeBaseline(mode='host-direct') {
  if(active) {
    if(!active.boundId)return;
    const status=active.inspect(mode);
    if(!status.can_dispatch)throw new RuntimeBaselineError(status.reasons[0]?.code??'LOAD_UNCONFIRMED');
  } else if(process.env.PIDEX_BASELINE_ID)throw new RuntimeBaselineError('LOAD_UNCONFIRMED');
}
export function registerRuntimeBaseline(pi:any, roots:any, piVersion:string, observe=observeRuntime) {
  const boundId=process.env.PIDEX_BASELINE_ID??null;
  const launchId=process.env.PIDEX_BASELINE_LAUNCH_ID??null;
  const generations=((process as any)[key]??0)+1;
  (process as any)[key]=generations;
  const generation=randomUUID();
  let live=true,assurance='observed_at_load';
  const initial=observe(roots,{boundId});
  const load={schema_version:1,pid:process.pid,generation_id:generation,launch_id:launchId??null,baseline_id:boundId??null,source:sourceBinding(initial.source),config_digest:initial.config.digest,assurance};
  const scope=(mode:string)=>({platform:process.platform,arch:process.arch,node_version:process.versions.node,pi_version:piVersion,mode});
  const inspect=(mode='host-direct')=>observe(roots,{boundId,load:{...load,assurance:live&&(process as any)[key]===generations?assurance:'observed_at_load'},scope:scope(mode)});
  active={inspect,boundId};
  pi.registerCommand('pdstatus',{description:'Read-only working-baseline status for this Pi process.',handler:async(_args:any,ctx:any)=>{ctx.ui.notify(formatRuntimeStatus(inspect()),'info');}});
  let cleanup=()=>{};
  pi.on('session_shutdown',()=>{live=false;assurance='observed_at_load';cleanup();});
  pi.on('session_start',async(event:any)=>{
    if(!boundId||!launchId||event.reason!=='startup'||generations!==1||(process as any)[key]!==generations||!process.send)return;
    await new Promise<void>((resolve)=>{
      const finish=()=>{process.off('message',onMessage);clearTimeout(timer);resolve();};
      const onMessage=(m:any)=>{
        if(m?.type!=='pidex-baseline-confirm'||m.launch_id!==launchId||m.generation_id!==generation)return;
        const current=inspect();
        if(live && (process as any)[key]===generations && canonicalJson(sourceBinding(current.source))===canonicalJson(load.source)&&current.config.digest===load.config_digest) {
          assurance='controlled_start';
          const status=inspect();
          process.send?.({type:'pidex-baseline-ack',launch_id:launchId,generation_id:generation,pid:process.pid,status:status.status});
        }
        finish();
      };
      const timer=setTimeout(finish,15000);cleanup=finish;
      process.on('message',onMessage);
      process.send?.({type:'pidex-baseline-hello',launch_id:launchId,generation_id:generation,pid:process.pid,baseline_id:boundId,source:load.source,config_digest:load.config_digest,scope:scope('host-direct'),commands:pi.getCommands().filter((c:any)=>c.source==='extension'&&['pd','pidex','pdstatus'].includes(c.name)).map((c:any)=>({name:c.name,path:c.sourceInfo?.path}))});
    });
  });
  return active;
}
