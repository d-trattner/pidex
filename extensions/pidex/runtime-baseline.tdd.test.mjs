import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRuntimeBaseline, assertRuntimeBaseline } from './runtime-baseline.ts';
import { projectDecisionStatus } from '../../scripts/runtime/decision-status.mjs';
import runningPi, { executeHostAgentBoundary, runProjectPipelineAgentTool } from './index.ts';

const key=Symbol.for('pidex.runtime-baseline.generations.v1');
const id='baseline:'+'a'.repeat(64);
const digest='b'.repeat(64);
function environment(t,bound=true) {
 const prior={id:process.env.PIDEX_BASELINE_ID,launch:process.env.PIDEX_BASELINE_LAUNCH_ID,send:process.send,generation:process[key]};
 if(bound){process.env.PIDEX_BASELINE_ID=id;process.env.PIDEX_BASELINE_LAUNCH_ID='launch';}else{delete process.env.PIDEX_BASELINE_ID;delete process.env.PIDEX_BASELINE_LAUNCH_ID;}
 process[key]=0;
 t.after(()=>{for(const [key,value] of [['PIDEX_BASELINE_ID',prior.id],['PIDEX_BASELINE_LAUNCH_ID',prior.launch]])if(value===undefined)delete process.env[key];else process.env[key]=value;process.send=prior.send;process[Symbol.for('pidex.runtime-baseline.generations.v1')]=prior.generation;});
}
function piMock() {
 const events=new Map(),commands=new Map(),tools=new Map();
 return {events,commands,tools,on:(name,fn)=>{const list=events.get(name)??[];list.push(fn);events.set(name,list);},registerCommand:(name,value)=>commands.set(name,value),registerTool:tool=>tools.set(tool.name,tool),getCommands:()=>[...commands.keys()].map(name=>({name,source:'extension',sourceInfo:{path:'/fixture/extensions/pidex/index.ts'}}))};
}
const source={schema_version:1,issues:[],bootstrap:{root:'/fixture',commit:'c'.repeat(40),inventory_version:1,inventory_digest:digest},runtime:{root:'/fixture',commit:'c'.repeat(40),inventory_version:1,inventory_digest:digest},state_root:'/fixture-state'};
function observe(_roots,{load}={}) {
 const ready=load?.assurance==='controlled_start';
 return {source,config:{digest,coverage:'complete'},status:ready?'ready':'unconfirmed',can_dispatch:ready,reasons:ready?[]:[{code:'LOAD_UNCONFIRMED'}]};
}
// Prepared for the deferred Point4 test phase; no startup/model call required.
test('pdstatus renders the common projection explicitly as this Pi observer',async t=>{
 environment(t,false);const pi=piMock(),observers=[];
 registerRuntimeBaseline(pi,{},'0.85.1',(roots,options)=>{observers.push(options.observer);const value=observe(roots,options);return {...value,decision:projectDecisionStatus({...value,schema_version:1},{observer:options.observer})};});
 let text='';await pi.commands.get('pdstatus').handler('',{ui:{notify:value=>{text=value;}}});
 assert.deepEqual(observers,['pi','pi']);assert.match(text,/Beobachter: pi/);assert.match(text,/Installiert: Nicht nachgewiesen/);
});
test('unbound sessions remain additive; no guard IO on every dispatch',t=>{
 environment(t,false);let reads=0;registerRuntimeBaseline(piMock(),{},'0.85.1',(...args)=>{reads++;return observe(...args);});
 const before=reads;assert.doesNotThrow(()=>assertRuntimeBaseline());assert.equal(reads,before);
});
test('bound session stays blocked without a process-local confirmed handshake',t=>{
 environment(t);const pi=piMock();registerRuntimeBaseline(pi,{},'0.85.1',observe);assert.throws(()=>assertRuntimeBaseline(),{code:'LOAD_UNCONFIRMED'});
});
test('one matching startup handshake grants this generation only; shutdown revokes it',async t=>{
 environment(t);const sent=[];process.send=m=>{sent.push(m);};const pi=piMock();registerRuntimeBaseline(pi,{},'0.85.1',observe);
 const pending=pi.events.get('session_start')[0]({reason:'startup'});
 assert.equal(sent.length,1);const hello=sent[0];assert.equal(hello.type,'pidex-baseline-hello');
 process.emit('message',{type:'pidex-baseline-confirm',launch_id:'wrong',generation_id:hello.generation_id});
 assert.throws(()=>assertRuntimeBaseline(),{code:'LOAD_UNCONFIRMED'});
 process.emit('message',{type:'pidex-baseline-confirm',launch_id:'launch',generation_id:hello.generation_id});await pending;
 assert.equal(sent[1].status,'ready');assert.doesNotThrow(()=>assertRuntimeBaseline());
 pi.events.get('session_shutdown')[0]();assert.throws(()=>assertRuntimeBaseline(),{code:'LOAD_UNCONFIRMED'});
});
test('reload generation cannot reuse inherited launch fields',async t=>{
 environment(t);const sent=[];process.send=m=>sent.push(m);
 registerRuntimeBaseline(piMock(),{},'0.85.1',observe);const reloaded=piMock();registerRuntimeBaseline(reloaded,{},'0.85.1',observe);
 await reloaded.events.get('session_start')[0]({reason:'reload'});assert.equal(sent.length,0);assert.throws(()=>assertRuntimeBaseline(),{code:'LOAD_UNCONFIRMED'});
});
test('duplicate factories invalidate the first factory before either can send a grant request',async t=>{
 environment(t);let sends=0;process.send=()=>sends++;const first=piMock(),second=piMock();registerRuntimeBaseline(first,{},'0.85.1',observe);registerRuntimeBaseline(second,{},'0.85.1',observe);
 await first.events.get('session_start')[0]({reason:'startup'});await second.events.get('session_start')[0]({reason:'startup'});
 assert.equal(sends,0);assert.throws(()=>assertRuntimeBaseline(),{code:'LOAD_UNCONFIRMED'});
});
test('actual extension start and direct host boundary reject unknown binding before route/review work',async t=>{
 environment(t);const pi=piMock();runningPi(pi);assert.ok(pi.commands.has('pdstatus'));
 let routeReads=0,dispatches=0;
 await assert.rejects(()=>executeHostAgentBoundary({agent:'pidex-qa',task:'fixture'}, {agentCwd:process.cwd(),loadConfig:()=>{routeReads++;return {};},runConfigured:()=>{dispatches++;}}));
 assert.equal(routeReads,0);assert.equal(dispatches,0);
 for(const name of ['pd','pidex'])await assert.rejects(()=>pi.commands.get(name).handler('fixture',{}));
 await assert.rejects(()=>executeHostAgentBoundary({agent:'pidex-qa',task:'fixture',provider:'pi'},{agentCwd:process.cwd()}),/reject caller-supplied/);
});
