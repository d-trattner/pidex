import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { beginRecoverableHostCloseout, beginHostCloseoutDispatch, inspectHostCloseout, recordPipelineEvent, confirmPipelineCloseout, resolvePlanReviewAuthority } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
import { spawnObservedExecution, inspectExecution } from './review-execution.mjs';
import { foldCloseoutObligations } from './closeout-obligations.mjs';
import { closeoutStatusCli } from './closeout-status.mjs';
const linux = { skip: process.platform !== 'linux' };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-closeout-recovery-'));
  const project = path.join(root, 'project'); fs.mkdirSync(project); const stateDir = path.join(root, 'state');
  const context = { project, stateDir, planId: 'plan-001', pipelineId: 'recoverable-001' };
  const stream = recordPipelineEvent({ ...context, plan: context.planId, event: 'pipeline_started' }).outPath;
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scope = 'a'.repeat(64);
  const start = (actor = 'pidex-retrospective') => {
    const request = { action: 'start', planId: context.planId, pipelineId: context.pipelineId, artifactPath: `agents.output/${actor === 'pidex-pi' ? 'process-improvement' : actor}/001.md` };
    const ticket = beginRecoverableHostCloseout({ ...context, actor, request, scope });
    return { actor, request, ticket };
  };
  const resume = (call, extra = {}) => beginRecoverableHostCloseout({ ...context, actor: call.actor, scope, request: { ...call.request, action: 'resume', dispatchId: call.ticket.id }, ...extra });
  return { root, context, stream, scope, start, resume, complete: () => confirmPipelineCloseout({ ...context, plan: context.planId, event: 'pipeline_completed' }) };
}
async function physical(f, call, { abort = false, exitCode = 0 } = {}) {
  const observed = spawnObservedExecution({ stateRoot: f.context.stateDir, binding: call.ticket.executionBinding, command: process.execPath, args: ['-e', abort ? 'setInterval(()=>{},1000)' : `process.exitCode=${exitCode}`], cwd: f.context.project, env: { PATH: process.env.PATH, HOME: f.root }, maxRuntimeMs: 5000, onProcessStarted: evidence => { call.ticket.pinStart(evidence); if (abort) { call.ticket.abort(); observed.stop('user_abort'); } } });
  await once(observed.proc, 'close');
  return inspectExecution(f.context.stateDir, call.ticket.executionBinding, JSON.parse(fs.readFileSync(f.stream, 'utf8').trim().split('\n').findLast(l => JSON.parse(l).event_type === 'pipeline_closeout_execution_pinned')).metadata.digest);
}
function output(f, call, { compact = false, bad = false, sections = '', exitCode = 0 } = {}) {
  const state = foldCloseoutObligations(resolvePlanReviewAuthority(f.context).rows, f.context); const d = state.dispatches.get(call.ticket.id);
  const text = `<!-- ROUTING\nverdict: ${call.actor === 'pidex-pi' ? 'DEFERRED' : 'COMPLETE'}\nroute_to: ${call.actor === 'pidex-retrospective' ? 'pidex-pi' : 'orchestrator'}\npost_retro_handoffs: none\ncloseout_dispatch: ${d.id}\ncloseout_obligations: ${d.consumes.join(', ') || 'none'}\ncontext_file: ${call.request.artifactPath}\n-->`;
  const file = path.join(f.context.project, call.request.artifactPath); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, sections + text);
  const finalText = bad ? 'unparseable but durably captured' : compact ? text.replace(/\n/g, '; ').replace('ROUTING; ', 'ROUTING ').replace('; -->', ' -->') : text;
  return { agent: call.actor, provider: 'pi', exitCode, finalText };
}

test('PI decision matrix: captured successes replay, G7/legacy routes/verdicts remain held without another execution', linux, async t => {
  for (const [verdict, route, expectedError] of [
    ['COMPLETE', 'orchestrator', null],
    ['DEFERRED', 'orchestrator', null],
    ['DEFERRED', 'pidex-roadmap', /ROUTING_INVALID/],
    ['REJECTED', 'orchestrator', /VERDICT_INVALID/],
    ['BLOCKED', 'user', /VERDICT_INVALID/],
  ]) {
    const f = fixture(t); const call = f.start('pidex-pi'); await physical(f, call);
    const result = output(f, call);
    result.finalText = result.finalText.replace('verdict: DEFERRED', `verdict: ${verdict}`).replace('route_to: orchestrator', `route_to: ${route}`);
    fs.writeFileSync(path.join(f.context.project, call.request.artifactPath), result.finalText);
    call.ticket.capture(result);
    if (expectedError) {
      await assert.rejects(call.ticket.complete(), expectedError);
      assert.equal(inspectHostCloseout({ ...f.context, dispatchId: call.ticket.id }).status, 'returned_invalid');
      assert.throws(f.complete, /OBLIGATIONS_PENDING/);
      await assert.rejects(f.resume(call).complete(), expectedError);
    } else {
      assert.equal((await call.ticket.complete()).closeoutCompletion.status, 'dispatch_completed');
      assert.equal((await f.resume(call).complete()).replayed, true);
    }
    assert.throws(() => f.start('pidex-pi'), /ALREADY_DISPATCHED/);
    assert.equal(resolvePlanReviewAuthority(f.context).rows.filter(r => r.event_type === 'pipeline_closeout_execution_pinned').length, 1);
    assert.equal(inspectHostCloseout({ ...f.context, dispatchId: call.ticket.id }).modelCallsAllowed, 0);
  }
});

test('real dummy process return supports fresh-process replay and artifact removal without model calls', linux, async t => {
  const f = fixture(t); const call = f.start(); await physical(f, call);
  call.ticket.capture(output(f, call, { compact: true, sections: '# Planning Insights\n- Durable capture.\n' }));
  fs.unlinkSync(path.join(f.context.project, call.request.artifactPath));
  assert.throws(f.complete, /OBLIGATIONS_PENDING/);
  const before = fs.readFileSync(f.stream);
  const status = closeoutStatusCli(['--project', f.context.project, '--plan', f.context.planId, '--pipeline-id', f.context.pipelineId, '--dispatch-id', call.ticket.id, '--state-dir', f.context.stateDir]);
  assert.equal(status.status, 'continuation_pending'); assert.equal(status.modelCallsAllowed, 0); assert(!JSON.stringify(status).includes('Durable capture')); assert.deepEqual(fs.readFileSync(f.stream), before);
  const moduleUrl = new URL('../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs', import.meta.url).href;
  const args = { ...f.context, actor: call.actor, scope: f.scope, request: { ...call.request, action: 'resume', dispatchId: call.ticket.id } };
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {beginRecoverableHostCloseout} from ${JSON.stringify(moduleUrl)}; const ticket=beginRecoverableHostCloseout(${JSON.stringify(args)}); console.log(JSON.stringify(await ticket.complete(async()=> 'deferred')));`], { cwd: f.context.project, env: { PATH: process.env.PATH, HOME: f.root }, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).replayed, true);
  const replay = await f.resume(call).complete(() => { throw Error('must not run hook twice'); }); assert.equal(replay.replayed, true); assert.equal(replay.closeoutCompletion.pendingObligations.length, 2);
  for (const actor of ['pidex-pi', 'pidex-planner']) { const next = f.start(actor); await physical(f, next); next.ticket.capture(output(f, next)); await next.ticket.complete(); }
  assert.equal(f.complete().confirmed, true);
  assert.equal(inspectHostCloseout({ ...f.context, dispatchId: call.ticket.id }).status, 'completed');
});

test('invalid returned text stays captured and held, no new nonce or legacy path bypass', linux, async t => {
  const f = fixture(t); const call = f.start(); await physical(f, call); call.ticket.capture(output(f, call, { bad: true }));
  await assert.rejects(f.resume(call).complete(async () => 'deferred'), /ROUTING_INVALID/);
  assert.equal(inspectHostCloseout({ ...f.context, dispatchId: call.ticket.id }).status, 'returned_invalid');
  assert.throws(() => f.start(), /ALREADY_DISPATCHED/); assert.throws(() => beginHostCloseoutDispatch({ ...f.context, actor: call.actor }), /ALREADY_DISPATCHED/);
  assert.throws(f.complete, /OBLIGATIONS_PENDING/);
});

test('hook failure has durable started marker and is never invoked again', linux, async t => {
  const f = fixture(t); const call = f.start(); await physical(f, call); call.ticket.capture(output(f, call)); let calls = 0;
  await assert.rejects(call.ticket.complete(async () => { calls++; throw Error('after-side-effect'); }), /after-side-effect/);
  await assert.rejects(f.resume(call).complete(async () => { calls++; return 'deferred'; }), /HOOK_UNCONFIRMED/); assert.equal(calls, 1);
  assert.equal(inspectHostCloseout({ ...f.context, dispatchId: call.ticket.id }).status, 'hook_unconfirmed'); assert.throws(f.complete, /OBLIGATIONS_PENDING/);
});

test('no receipt, wrong scope/pipeline and unknown identity cannot be adopted', linux, async t => {
  const f = fixture(t); const call = f.start(); await physical(f, call);
  await assert.rejects(f.resume(call).complete(async () => 'deferred'), /RETURN_UNCONFIRMED/);
  assert.throws(() => f.resume(call).capture(output(f, call)), /CAPTURE_FORBIDDEN/);
  assert.throws(() => f.resume(call).pinStart({ executionStartDigest: 'a'.repeat(64) }), /CAPTURE_FORBIDDEN/);
  assert.throws(() => f.resume(call, { scope: 'b'.repeat(64) }), /SCOPE_CHANGED/);
  assert.throws(() => f.resume(call, { request: { ...call.request, action: 'resume', dispatchId: call.ticket.id, pipelineId: 'another' } }), /IDENTITY_INVALID/);
  assert.equal(inspectHostCloseout({ ...f.context, dispatchId: call.ticket.id }).status, 'uncertain');
  assert.throws(() => recordPipelineEvent({ ...f.context, plan: f.context.planId, event: 'pipeline_closeout_return_captured' }), /RESERVED_EVENT/);
});

test('explicit abort and missing artifact remain held even after child exit', linux, async t => {
  const f = fixture(t); const call = f.start(); await physical(f, call, { abort: true });
  await assert.rejects(f.resume(call).complete(async () => 'deferred'), /ABORT_HOLD/);
  assert.equal(inspectHostCloseout({ ...f.context, dispatchId: call.ticket.id }).status, 'abort_hold');
  const g = fixture(t); const other = g.start(); await physical(g, other); const r = output(g, other); fs.unlinkSync(path.join(g.context.project, other.request.artifactPath)); other.ticket.capture(r);
  await assert.rejects(g.resume(other).complete(async () => 'deferred'), /ARTIFACT_INVALID/);
});

test('receipt tampering, failed execution and successor pipeline cannot produce success or reset budget', linux, async t => {
  const f = fixture(t); const call = f.start(); await physical(f, call, { exitCode: 1 }); call.ticket.capture(output(f, call, { exitCode: 1 })); await call.ticket.complete();
  assert.throws(() => f.start(), /ALREADY_DISPATCHED/); assert.throws(() => beginHostCloseoutDispatch({ ...f.context, actor: call.actor }), /ALREADY_DISPATCHED/);
  const rows = resolvePlanReviewAuthority(f.context).rows; const capture = rows.find(r => r.event_type === 'pipeline_closeout_return_captured'); capture.metadata.receipt.result.exitCode = 0;
  assert.throws(() => foldCloseoutObligations(rows, f.context), /HISTORY_INVALID/);
  recordPipelineEvent({ ...f.context, plan: f.context.planId, event: 'pipeline_aborted' }); recordPipelineEvent({ ...f.context, plan: f.context.planId, pipelineId: 'successor', event: 'pipeline_started' });
  assert.throws(() => f.resume(call), /IDENTITY_INVALID/);
});


test('owner exits after durable capture: fresh process continues; owner loss before capture stays uncertain', linux, async t => {
  for (const capture of [true, false]) {
    const f = fixture(t);
    const eventUrl = new URL('../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs', import.meta.url).href;
    const executionUrl = new URL('./review-execution.mjs', import.meta.url).href;
    const request = { action: 'start', planId: f.context.planId, pipelineId: f.context.pipelineId, artifactPath: 'agents.output/retro/001.md' };
    const args = { ...f.context, actor: 'pidex-retrospective', request, scope: f.scope };
    const script = `import fs from 'node:fs'; import path from 'node:path'; import {once} from 'node:events';
      import {beginRecoverableHostCloseout} from ${JSON.stringify(eventUrl)};
      import {spawnObservedExecution} from ${JSON.stringify(executionUrl)};
      const args=${JSON.stringify(args)}; const ticket=beginRecoverableHostCloseout(args);
      const child=spawnObservedExecution({stateRoot:args.stateDir,binding:ticket.executionBinding,command:process.execPath,args:['-e',${JSON.stringify(capture ? 'process.exitCode=0' : 'setInterval(()=>{},1000)')}],cwd:args.project,maxRuntimeMs:3000,onProcessStarted:e=>{ticket.pinStart(e);${capture ? '' : "console.log(ticket.id); process.exit(0);"}}});
      await once(child.proc,'close');
      const text=['<!-- ROUTING','verdict: COMPLETE','route_to: pidex-pi','post_retro_handoffs: none','closeout_dispatch: '+ticket.id,'closeout_obligations: none','context_file: '+args.request.artifactPath,'-->'].join(String.fromCharCode(10));
      fs.mkdirSync(path.dirname(path.join(args.project,args.request.artifactPath)),{recursive:true});fs.writeFileSync(path.join(args.project,args.request.artifactPath),text);
      ticket.capture({agent:args.actor,provider:'pi',exitCode:0,finalText:text});console.log(ticket.id);process.exit(0);`;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: f.context.project, env: { PATH: process.env.PATH, HOME: f.root }, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, child.stderr); const id = child.stdout.trim();
    const ticket = beginRecoverableHostCloseout({ ...args, request: { ...request, action: 'resume', dispatchId: id } });
    if (capture) assert.equal((await ticket.complete(async () => 'deferred')).replayed, true);
    else {
      const until = Date.now() + 7000; let status;
      do { status = inspectHostCloseout({ ...f.context, dispatchId: id }); if (status.cleanup === 'quiescence_verified') break; await new Promise(r => setTimeout(r, 40)); } while (Date.now() < until);
      assert.equal(status.status, 'uncertain'); assert.equal(status.cleanup, 'quiescence_verified');
      await assert.rejects(ticket.complete(async () => 'deferred'), /RETURN_UNCONFIRMED/);
    }
  }
});
