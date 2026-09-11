import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { recordPipelineEvent, confirmPipelineCloseout, reserveReviewStart, recordReviewCompletion } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
const linux = { skip: process.platform !== 'linux' };
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-closeout-'));
  const project = path.join(root, 'project'); fs.mkdirSync(project);
  const opts = { project, stateDir: path.join(root, 'state'), pipelineId: 'closeout-003', plan: 'plan-003' };
  const start = recordPipelineEvent({ ...opts, event: 'pipeline_started' });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, opts, stream: start.outPath, current: start.authority.current };
}

test('explicit completion is durable, acknowledged and byte-idempotent', linux, t => {
  const f = fixture(t);
  const first = confirmPipelineCloseout({ ...f.opts, event: 'pipeline_completed' });
  assert.equal(first.confirmed, true); assert.equal(first.alreadyRecorded, false);
  const before = fs.readFileSync(f.stream);
  assert.equal(fs.existsSync(f.current), false);
  const again = confirmPipelineCloseout({ ...f.opts, event: 'pipeline_completed' });
  assert.equal(again.alreadyRecorded, true); assert.deepEqual(fs.readFileSync(f.stream), before);
});

test('closeout refuses unresolved reviews, then allows actual terminal review outcome', linux, t => {
  const f = fixture(t);
  const identity = { runFamilyId: f.opts.pipelineId, planId: f.opts.plan, reviewGate: 'security', reviewMode: 'initial', attemptId: 'attempt-closeout' };
  const ctx = { stateDir: f.opts.stateDir, project: f.opts.project, pipelineId: f.opts.pipelineId, identity };
  assert.equal(reserveReviewStart({ ...ctx, start: () => 'synthetic-review' }).status, 'accepted');
  const before = fs.readFileSync(f.stream);
  assert.throws(() => confirmPipelineCloseout({ ...f.opts, event: 'pipeline_completed' }), /PIPELINE_REVIEW_INCOMPLETE/);
  assert.deepEqual(fs.readFileSync(f.stream), before);
  assert.equal(recordReviewCompletion({ ...ctx, outcome: 'APPROVED' }).status, 'APPROVED');
  assert.equal(confirmPipelineCloseout({ ...f.opts, event: 'pipeline_completed' }).confirmed, true);
});

test('same-pointer crash window can be acknowledged without a second terminal', linux, t => {
  const f = fixture(t); confirmPipelineCloseout({ ...f.opts, event: 'pipeline_failed' });
  fs.writeFileSync(f.current, f.opts.pipelineId); // isolated crash-after-append fixture
  const before = fs.readFileSync(f.stream);
  assert.equal(confirmPipelineCloseout({ ...f.opts, event: 'pipeline_failed' }).alreadyRecorded, true);
  assert.equal(fs.existsSync(f.current), false); assert.deepEqual(fs.readFileSync(f.stream), before);
});

test('conflicting terminal or successor pointer is never overwritten', linux, t => {
  const f = fixture(t); confirmPipelineCloseout({ ...f.opts, event: 'pipeline_failed' });
  const before = fs.readFileSync(f.stream);
  assert.throws(() => confirmPipelineCloseout({ ...f.opts, event: 'pipeline_completed' }), /PIPELINE_CLOSEOUT_CONFLICT/);
  fs.writeFileSync(f.current, 'successor-003');
  assert.throws(() => confirmPipelineCloseout({ ...f.opts, event: 'pipeline_failed' }), /PIPELINE_CLOSEOUT_CONFLICT/);
  assert.equal(fs.readFileSync(f.current, 'utf8'), 'successor-003'); assert.deepEqual(fs.readFileSync(f.stream), before);
});

test('symlinked terminal stream is not closeout authority', linux, t => {
  const f = fixture(t); confirmPipelineCloseout({ ...f.opts, event: 'pipeline_completed' });
  const target = path.join(f.root, 'external.jsonl'); fs.renameSync(f.stream, target); fs.symlinkSync(target, f.stream);
  assert.throws(() => confirmPipelineCloseout({ ...f.opts, event: 'pipeline_completed' }));
});

test('capability wrapper admits exact closeout flag and preserves acknowledgement', linux, t => {
  const f = fixture(t);
  const cli = fileURLToPath(new URL('../modules/run-check.mjs', import.meta.url));
  const env = { ...process.env, PIDEX_STATE_DIR: f.opts.stateDir };
  for (const alreadyRecorded of [false, true]) {
    const result = spawnSync(process.execPath, [cli, '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', f.opts.project, '--', '--project', f.opts.project, '--plan', f.opts.plan, '--pipeline-id', f.opts.pipelineId, '--event', 'pipeline_completed', '--confirm-closeout'], { env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const ack = result.stdout.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l)).find(r => r.status === 'confirmed');
    assert.equal(ack?.pipelineId, f.opts.pipelineId); assert.equal(ack?.alreadyRecorded, alreadyRecorded);
  }
});

test('event capability normalizes its existing plan-label grammar without relaxing canonical authority', linux, t => {
  const f = fixture(t); const cli = fileURLToPath(new URL('../modules/run-check.mjs', import.meta.url));
  const invoke = (plan, pipelineId = f.opts.pipelineId) => spawnSync(process.execPath, [cli, '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', f.opts.project, '--', '--project', f.opts.project, '--plan', plan, '--pipeline-id', pipelineId, '--event', 'pipeline_completed', '--confirm-closeout'], { env: { ...process.env, PIDEX_STATE_DIR: f.opts.stateDir }, encoding: 'utf8', timeout: 10_000 });
  const before = fs.readFileSync(f.stream);
  for (const [plan, id] of [['004-other', f.opts.pipelineId], ['003-docs-contributing-usage', 'wrong-pipeline'], ['unknown', f.opts.pipelineId]]) {
    assert.notEqual(invoke(plan, id).status, 0);
    assert.deepEqual(fs.readFileSync(f.stream), before);
  }
  assert.throws(() => confirmPipelineCloseout({ ...f.opts, plan: '003-docs-contributing-usage', event: 'pipeline_completed' }), /PIPELINE_CLOSEOUT_IDENTITY_INVALID/);
  for (const replay of [false, true]) {
    const result = invoke('003-docs-contributing-usage');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const ack = result.stdout.split('\n').filter(l => l.startsWith('{')).map(JSON.parse).find(r => r.status === 'confirmed');
    assert.equal(ack.planId, 'plan-003'); assert.equal(ack.pipelineId, f.opts.pipelineId); assert.equal(ack.alreadyRecorded, replay);
  }
});

test('CLI requires exact identity and confirms twice against external state', linux, t => {
  const f = fixture(t); const cli = fileURLToPath(new URL('./closeout.mjs', import.meta.url));
  const env = { ...process.env, PIDEX_STATE_DIR: f.opts.stateDir };
  const args = [cli, '--project', f.opts.project, '--plan', f.opts.plan, '--pipeline-id', f.opts.pipelineId];
  for (const alreadyRecorded of [false, true]) {
    const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { status: 'confirmed', pipelineId: f.opts.pipelineId, planId: f.opts.plan, event: 'pipeline_completed', alreadyRecorded });
  }
  const missing = spawnSync(process.execPath, [cli, '--project', f.opts.project], { env, encoding: 'utf8', timeout: 10_000 });
  assert.equal(missing.status, 2);
});
