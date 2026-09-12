import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { recordPipelineEvent, resolvePlanReviewAuthority } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';
import { confirmPipelineCloseout } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
import { processMatches, signalExecutionChild } from './review-execution.mjs';

const source = fileURLToPath(new URL('../../', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, timeout = 12_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = read(); if (value) return value; await delay(30); }
  throw new Error('bounded host fixture timeout');
}

// Real exported host boundary + real process supervision + a deliberately fake,
// provider-free Pi executable. This is not a live model or specialist verdict.
for (const explicit of [false, true]) test(`host correction survives owner loss with one remaining retry and unchanged identity (${explicit ? 'explicit, no ambient context' : 'implicit'})`, { skip: process.platform !== 'linux', timeout: 60_000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-host-recovery-'));
  const runtime = path.join(root, 'runtime'); const project = path.join(root, 'project'); const stateDir = path.join(root, 'state'); const bin = path.join(root, 'bin');
  for (const dir of [project, stateDir, bin, path.join(root, 'home'), path.join(runtime, 'config'), path.join(runtime, 'scripts')]) fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(source, 'agents'), path.join(runtime, 'agents'), { recursive: true });
  fs.copyFileSync(path.join(source, 'config/agents.json'), path.join(runtime, 'config/agents.json'));
  fs.writeFileSync(path.join(runtime, 'package.json'), JSON.stringify({ name: 'pidex', version: '0.0.0' }));
  const owners = [];
  t.after(async () => {
    for (const owner of owners) if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    // Exact recorded supervisor identities only; ask their bounded cleanup first.
    for (const entry of fs.existsSync(path.join(stateDir, 'review-executions')) ? fs.readdirSync(path.join(stateDir, 'review-executions'), { withFileTypes: true }) : []) {
      if (!entry.isDirectory()) continue;
      const file = path.join(stateDir, 'review-executions', entry.name, 'started.json');
      if (!fs.existsSync(file)) continue;
      const ref = JSON.parse(fs.readFileSync(file, 'utf8')).supervisor;
      if (processMatches(ref)) signalExecutionChild(ref, 'SIGTERM');
    }
    await delay(300);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const fake = `#!/usr/bin/env node
const fs=require('node:fs'),p=require('node:path');
const a=process.argv.slice(2);const system=a[a.indexOf('--append-system-prompt')+1];const agent=p.basename(system).replace('.system.md','');
const counter=p.join(process.cwd(),agent+'.count');const n=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8'))+1:1;fs.writeFileSync(counter,String(n));
if(agent==='pidex-implementer'&&n===1){setInterval(()=>{},1000);}else{
 const verdict=agent==='pidex-implementer'?'COMPLETE':n===1?'REJECTED':'APPROVED';
 const context='agents.output/'+(agent==='pidex-implementer'?'implementation':'security')+'/003.md';fs.mkdirSync(p.dirname(context),{recursive:true});
 const payload={schemaVersion:'pidex-review-outcome-v1',verdict,contractDisposition:'in_contract',findings:verdict==='REJECTED'?[{findingId:'F-fixture-1',relation:'assigned',class:'Product',reproductionState:'reproduced',causedByCorrection:true,severity:'High',disposition:'active'}]:[]};
 fs.writeFileSync(context,agent==='pidex-implementer'?'# Synthetic correction complete':'# Synthetic review\\n\\n'+String.fromCharCode(96).repeat(3)+'pidex-review-outcome-v1\\n'+JSON.stringify(payload)+'\\n'+String.fromCharCode(96).repeat(3)+'\\n');
 const text='<!-- ROUTING\\nverdict: '+verdict+'\\nroute_to: '+(agent==='pidex-implementer'?'pidex-security':'pidex-implementer')+'\\ncontext_file: '+context+'\\n-->';
 console.log(JSON.stringify({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text}]}}));
}
`;
  fs.writeFileSync(path.join(bin, 'pi'), fake, { mode: 0o700 });
  const driver = path.join(root, 'driver.mjs');
  const correctionIdentity = explicit ? { runFamilyId: 'host-recovery-003', planId: 'plan-003', reviewGate: 'security', reviewMode: 'correction1', attemptId: 'attempt-' + createHash('sha256').update('host-recovery-003|security|correction1').digest('hex').slice(0, 16) } : {};
  fs.writeFileSync(driver, `import fs from 'node:fs';import {executeHostAgentBoundary} from ${JSON.stringify(new URL('../../extensions/pidex/index.ts', import.meta.url).href)};const stage=process.argv[2];try{const result=await executeHostAgentBoundary({agent:stage==='correction'?'pidex-implementer':'pidex-security',task:'Plan 003 '+stage,...(stage==='correction'?${JSON.stringify(correctionIdentity)}:{})},{agentCwd:${JSON.stringify(project)},${explicit ? '' : `reviewLifecycle:{stateDir:${JSON.stringify(stateDir)},pipelineId:'host-recovery-003'},`}resolveSandboxState:()=>({enabled:false})});fs.writeFileSync(${JSON.stringify(path.join(root, 'result-'))}+stage+'.json',JSON.stringify(result));}catch(e){console.error(e.message);process.exitCode=1;}`);
  const env = { ...process.env, HOME: path.join(root, 'home'), PIDEX_ROOT: runtime, PIDEX_STATE_DIR: stateDir, RUNNING_PI_STATE_DIR: stateDir, PATH: bin + path.delimiter + process.env.PATH, NODE_OPTIONS: '' };
  delete env.PIDEX_PIPELINE_ID;
  delete env.RUNNING_PI_PIPELINE_ID;
  const run = stage => {
    const proc = spawn(process.execPath, [driver, stage], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] }); owners.push(proc);
    let stderr = ''; proc.stderr.on('data', b => { stderr += b.toString(); }); proc.stdout.resume();
    return { proc, closed: once(proc, 'close').then(([code, signal]) => ({ code, signal, stderr })) };
  };
  const authority = { stateDir, project, planId: 'plan-003' };
  recordPipelineEvent({ stateDir, project, pipelineId: 'host-recovery-003', plan: 'plan-003', event: 'pipeline_started' });
  const first = await run('initial').closed;
  assert.equal(first.code, 0, first.stderr);
  assert.equal(resolvePlanReviewAuthority(authority).rows.findLast(r => r.event_type === 'review_outcome').metadata.outcome, 'CHANGES_REQUESTED');
  const interrupted = run('correction');
  const accepted = await until(() => resolvePlanReviewAuthority(authority).rows.findLast(r => r.event_type === 'spawn_accepted' && r.metadata?.reviewMode === 'correction1'));
  assert.match(accepted.metadata.executionStartDigest, /^[a-f0-9]{64}$/);
  // Also ensure the fake worker entered its body before cutting the owner.
  await until(() => fs.existsSync(path.join(project, 'pidex-implementer.count')));
  interrupted.proc.kill('SIGKILL'); await interrupted.closed;
  await until(() => {
    const files = fs.readdirSync(path.join(stateDir, 'review-executions')).map(name => path.join(stateDir, 'review-executions', name, 'ended.json'));
    return files.filter(file => fs.existsSync(file)).length === 2;
  });
  await delay(100);
  const resumed = await run('correction').closed; assert.equal(resumed.code, 0, resumed.stderr);
  const correction = JSON.parse(fs.readFileSync(path.join(root, 'result-correction.json'), 'utf8'));
  assert.match(correction.finalText, /verdict: COMPLETE/);
  assert.equal(resolvePlanReviewAuthority(authority).rows.findLast(r => r.event_type === 'review_outcome').metadata.outcome, 'READY_FOR_REVIEW');
  const reviewed = await run('review1').closed; assert.equal(reviewed.code, 0, reviewed.stderr);
  const rows = resolvePlanReviewAuthority(authority).rows;
  const correctionStarts = rows.filter(r => r.event_type === 'start_reserved' && r.metadata?.reviewMode === 'correction1');
  assert.deepEqual(correctionStarts.map(r => r.metadata.physicalOrdinal), [0, 1]);
  assert.equal(new Set(correctionStarts.map(r => r.metadata.attemptId)).size, 1);
  assert.equal(rows.findLast(r => r.event_type === 'review_outcome').metadata.outcome, 'APPROVED');
  assert.equal(fs.readFileSync(path.join(project, 'pidex-implementer.count'), 'utf8'), '2');
  assert.equal(fs.readFileSync(path.join(project, 'pidex-security.count'), 'utf8'), '2');
  const closeout = { project, stateDir, pipelineId: 'host-recovery-003', plan: 'plan-003', event: 'pipeline_completed' };
  assert.equal(confirmPipelineCloseout(closeout).confirmed, true);
  assert.equal(confirmPipelineCloseout(closeout).alreadyRecorded, true);
});
