import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { deriveReviewPhysicalAttempt, reserveReviewStart, reserveReviewStartAsync, recordReviewCompletion, recordPipelineEvent, reconcileReviewExecution, resolvePlanReviewAuthority } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';
import { inspectExecution, spawnObservedExecution, executionDirectory, linuxProcess, processMatches, liveGroupMembers, requestExecutionStop } from './review-execution.mjs';

const linux = { skip: process.platform !== 'linux', timeout: 15_000 };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, timeout = 6_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = check(); if (value) return value; await pause(20); }
  throw new Error('bounded process assertion timed out');
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-execution-proof-'));
  const project = path.join(root, 'project'); fs.mkdirSync(project);
  const identity = { runFamilyId: 'family-proof', planId: 'plan-003', reviewGate: 'security', reviewMode: 'correction1', attemptId: 'attempt-proof' };
  const binding = { project, pipelineId: 'pipeline-proof', identity, physical: deriveReviewPhysicalAttempt(identity, 0, 0), actor: 'pidex-implementer', scope: 'a'.repeat(64) };
  const stateRoot = path.join(root, 'state');
  const children = [];
  t.after(async () => {
    for (const { proc, childRef, supervisorRef } of children) {
      // Only our observed, still-matching group anchor/member can authorize kill.
      if (processMatches(supervisorRef) || processMatches(childRef)) try { process.kill(-proc.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      if (proc.exitCode === null && proc.signalCode === null) await Promise.race([once(proc, 'close'), pause(1_000)]);
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const f = { root, project, binding, stateRoot, children };
  f.inspect = () => inspectExecution(stateRoot, binding, f.pin);
  return f;
}
async function launch(f, code, extra = {}) {
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  const handle = spawnObservedExecution({ stateRoot: f.stateRoot, binding: f.binding, command: process.execPath, args: ['-e', code], cwd: f.project, onProcessStarted: pin => { f.pin = pin.executionStartDigest; ready(); }, maxRuntimeMs: 10_000, ...extra });
  const item = { proc: handle.proc }; f.children.push(item);
  handle.proc.stdout.resume(); handle.proc.stderr.resume();
  const closed = once(handle.proc, 'close');
  await Promise.race([started, closed.then(() => { throw new Error('supervisor closed before acceptance'); })]);
  const row = JSON.parse(fs.readFileSync(path.join(handle.directory, 'started.json'), 'utf8'));
  item.supervisorRef = row.supervisor; item.childRef = linuxProcess(row.childPid);
  return { ...handle, closed, row };
}

test('running supervised child cannot be mistaken for a completed execution', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'setInterval(()=>{},1000)');
  assert.deepEqual(f.inspect(), { status: 'running' });
  assert.throws(() => spawnObservedExecution({ stateRoot: f.stateRoot, binding: f.binding, command: process.execPath, args: [], cwd: f.project }), { code: 'EEXIST' });
  h.stop('user_abort'); await h.closed;
  assert.equal(f.inspect().status, 'aborted');
  assert.equal(liveGroupMembers(h.proc.pid).length, 0);
});

test('actual nonzero end is durable; inspector reads without changing receipt bytes', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'process.exitCode=7'); await h.closed;
  const file = path.join(h.directory, 'ended.json'); const before = fs.readFileSync(file);
  const result = f.inspect(); assert.equal(result.status, 'failed'); assert.equal(result.exitCode, 7); assert.equal(result.signal, null);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const text = fs.readFileSync(path.join(h.directory, 'dispatch.json'), 'utf8');
  assert.doesNotMatch(text, /environment|OPENAI|auth\.json|command|args/);
});

test('zero exit is not approval or replayable completion', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'process.exitCode=0'); await h.closed;
  assert.equal(f.inspect().status, 'finished'); assert.equal(f.inspect().code, 'REVIEW_COMPLETION_UNCONFIRMED');
});

test('scope changes cannot allocate a new slot or consume an old receipt', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'process.exitCode=7'); await h.closed;
  const changed = { ...f.binding, scope: 'b'.repeat(64) };
  assert.equal(executionDirectory(f.stateRoot, changed), h.directory);
  assert.equal(inspectExecution(f.stateRoot, changed).status, 'uncertain');
});

test('explicit abort dominates a terminal failure; malformed abort cannot be ignored', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'process.exitCode=7'); await h.closed;
  requestExecutionStop(h.directory, 'user_abort'); requestExecutionStop(h.directory, 'user_abort');
  assert.equal(f.inspect().status, 'aborted');
  fs.writeFileSync(path.join(h.directory, 'user_abort.json'), '{}');
  assert.equal(f.inspect().status, 'uncertain');
});

test('supervisor time limit produces observed termination, not a forged success', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'setInterval(()=>{},1000)', { maxRuntimeMs: 150 }); await h.closed;
  const result = f.inspect(); assert.equal(result.status, 'failed'); assert.equal(result.reason, 'timeout'); assert.equal(result.signal, 'SIGTERM');
});

test('loss of supervisor without an end receipt stays uncertain, even if PID is gone', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'setInterval(()=>{},1000)');
  h.proc.kill('SIGKILL'); await h.closed;
  assert.equal(f.inspect().status, 'uncertain'); assert.equal(f.inspect().code, 'REVIEW_EXECUTION_END_UNCONFIRMED');
  assert.equal(fs.existsSync(path.join(h.directory, 'ended.json')), false);
});

test('descendant processes are quiescent before a final receipt is published', linux, async t => {
  const f = fixture(t);
  const h = await launch(f, `const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}).unref();`);
  await h.closed;
  assert.equal(liveGroupMembers(h.proc.pid).length, 0);
  assert.equal(f.inspect().status, 'finished');
});

test('setsid/detached descendant is adopted and stopped before receipt', linux, async t => {
  const f = fixture(t); const pidFile = path.join(f.root, 'detached.pid');
  const h = await launch(f, `const {spawn}=require('node:child_process');const fs=require('node:fs');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});fs.writeFileSync(${JSON.stringify(pidFile)},String(p.pid));p.unref();`);
  await until(() => fs.existsSync(pidFile));
  const pid = Number(fs.readFileSync(pidFile, 'utf8')); const ref = linuxProcess(pid);
  if (ref) f.children.push({ proc: { pid, exitCode: 0 }, childRef: ref });
  await h.closed;
  assert.equal(processMatches(ref), false);
  assert.equal(f.inspect().status, 'finished');
});

test('hard loss of outer owner is witnessed by surviving supervisor', linux, async t => {
  const f = fixture(t);
  const module = new URL('./review-execution.mjs', import.meta.url).href;
  const script = path.join(f.root, 'owner.mjs');
  const pinFile = path.join(f.root, 'accepted.json');
  fs.writeFileSync(script, `import fs from 'node:fs';import {spawnObservedExecution} from ${JSON.stringify(module)};\nconst spec=${JSON.stringify({ stateRoot: f.stateRoot, binding: f.binding, command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: f.project, maxRuntimeMs: 10_000 })};\nspec.onProcessStarted=pin=>fs.writeFileSync(${JSON.stringify(pinFile)},JSON.stringify(pin));const h=spawnObservedExecution(spec);h.proc.stdout.resume();h.proc.stderr.resume();`);
  const owner = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
  owner.stderr.resume(); owner.stdout.resume();
  t.after(() => { if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL'); });
  await until(() => fs.existsSync(pinFile));
  f.pin = JSON.parse(fs.readFileSync(pinFile, 'utf8')).executionStartDigest;
  const directory = executionDirectory(f.stateRoot, f.binding);
  const row = JSON.parse(fs.readFileSync(path.join(directory, 'started.json'), 'utf8'));
  // Register exact identities for cleanup even if the assertion later fails.
  f.children.push({ proc: { pid: row.supervisor.pid, exitCode: 0 }, supervisorRef: row.supervisor, childRef: linuxProcess(row.childPid) });
  const closed = once(owner, 'close'); owner.kill('SIGKILL'); await closed;
  const result = await until(() => { const state = f.inspect(); return state.status === 'failed' && state; });
  assert.equal(result.reason, 'owner_lost'); assert.equal(result.signal, 'SIGTERM');
  assert.equal(liveGroupMembers(row.supervisor.pid).length, 0);
});

test('signed end cannot be changed from success to failure', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'process.exitCode=0'); await h.closed;
  const file = path.join(h.directory, 'ended.json'); const row = JSON.parse(fs.readFileSync(file, 'utf8')); row.exitCode = 7;
  fs.writeFileSync(file, JSON.stringify(row));
  assert.equal(f.inspect().status, 'uncertain');
});

test('a changed descriptor cannot relabel the signed scope', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'process.exitCode=7'); await h.closed;
  const file = path.join(h.directory, 'dispatch.json'); const row = JSON.parse(fs.readFileSync(file, 'utf8')); row.binding.scope = 'b'.repeat(64);
  fs.writeFileSync(file, JSON.stringify(row));
  assert.equal(inspectExecution(f.stateRoot, row.binding, f.pin).status, 'uncertain');
});

function seedReview(f) {
  const { project, pipelineId, identity } = f.binding;
  const lifecycle = { stateDir: f.stateRoot, project, pipelineId, identity, planId: identity.planId };
  recordPipelineEvent({ stateDir: f.stateRoot, project, pipelineId, plan: identity.planId, event: 'pipeline_started' });
  const initial = { ...identity, reviewMode: 'initial', attemptId: 'initial-proof' };
  assert.equal(reserveReviewStart({ ...lifecycle, identity: initial, start: () => 'synthetic-initial-review' }).status, 'accepted');
  assert.equal(recordReviewCompletion({ ...lifecycle, identity: initial, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  return lifecycle;
}
async function reservedChild(f, lifecycle, ordinal, code) {
  const physical = deriveReviewPhysicalAttempt(lifecycle.identity, 0, ordinal);
  const binding = { ...f.binding, physical };
  let handle;
  const result = await reserveReviewStartAsync({ ...lifecycle, physical, start: (accepted, actualPhysical) => {
    assert.deepEqual(actualPhysical, physical);
    handle = spawnObservedExecution({ stateRoot: f.stateRoot, binding, command: process.execPath, args: ['-e', code], cwd: f.project, maxRuntimeMs: 10_000, onProcessStarted: evidence => { f.pin = evidence.executionStartDigest; accepted(evidence); } });
    handle.proc.stdout.resume(); handle.proc.stderr.resume();
    return once(handle.proc, 'close');
  } });
  assert.equal(result.status, 'accepted');
  const row = JSON.parse(fs.readFileSync(path.join(handle.directory, 'started.json'), 'utf8'));
  f.children.push({ proc: handle.proc, supervisorRef: row.supervisor, childRef: linuxProcess(row.childPid) });
  return { ...handle, closed: result.started };
}

for (const disposition of ['failure', 'abort', 'success', 'running', 'wrong-scope']) test(`canonical reconciliation: ${disposition}`, linux, async t => {
  const f = fixture(t); const lifecycle = seedReview(f);
  const h = await reservedChild(f, lifecycle, 0, disposition === 'running' || disposition === 'abort' ? 'setInterval(()=>{},1000)' : `process.exitCode=${disposition === 'success' ? 0 : 7}`);
  if (disposition === 'abort') h.stop('user_abort');
  if (disposition !== 'running') await h.closed;
  const authority = resolvePlanReviewAuthority(lifecycle);
  const before = fs.readFileSync(authority.stream, 'utf8');
  const result = reconcileReviewExecution({ ...lifecycle, actor: f.binding.actor, scope: disposition === 'wrong-scope' ? 'b'.repeat(64) : f.binding.scope });
  if (disposition === 'failure') {
    assert.equal(result.status, 'reconciled'); assert.equal(result.outcome, 'FAILED_TO_RUN');
    assert.equal(reconcileReviewExecution({ ...lifecycle, actor: f.binding.actor, scope: f.binding.scope }).status, 'not_pending');
    const h2 = await reservedChild(f, lifecycle, 1, 'process.exitCode=0'); await h2.closed;
    assert.equal(recordReviewCompletion({ ...lifecycle, outcome: 'READY_FOR_REVIEW' }).status, 'READY_FOR_REVIEW');
    const rows = resolvePlanReviewAuthority(lifecycle).rows;
    assert.deepEqual(rows.filter(r => r.event_type === 'start_reserved' && r.metadata?.reviewMode === 'correction1').map(r => r.metadata.physicalOrdinal), [0, 1]);
    assert.equal(rows.filter(r => r.event_type === 'physical_outcome').length, 1);
    assert.match(rows.find(r => r.event_type === 'physical_outcome').metadata.executionReceiptDigest, /^[a-f0-9]{64}$/);
  } else if (disposition === 'abort') {
    assert.equal(result.reviewCompletion.status, 'REVIEW_ABORTED');
  } else {
    assert.equal(result.status, disposition === 'running' ? 'running' : 'uncertain');
    assert.equal(fs.readFileSync(authority.stream, 'utf8'), before);
  }
});

test('symlink and damaged end receipt are refused', linux, async t => {
  const f = fixture(t); const h = await launch(f, 'process.exitCode=7'); await h.closed;
  const end = path.join(h.directory, 'ended.json'); const copy = path.join(f.root, 'end-copy.json'); fs.renameSync(end, copy); fs.symlinkSync(copy, end);
  assert.equal(f.inspect().status, 'uncertain'); fs.unlinkSync(end); fs.writeFileSync(end, '{}');
  assert.equal(f.inspect().status, 'uncertain');
});
