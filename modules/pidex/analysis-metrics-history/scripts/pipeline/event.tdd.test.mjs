#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldReviewHistory, validateReviewIdentity } from '../../../../../extensions/pidex/review-budget.ts';
import { reserveReviewStart } from './event.mjs';

const tuple = { runFamilyId: 'family-001', planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-001' };
assert.deepEqual(validateReviewIdentity(tuple), { ok: true, value: tuple });
assert.equal(validateReviewIdentity({ ...tuple, reviewGate: 'other' }).ok, false);
assert.deepEqual(foldReviewHistory([], tuple), { status: 'allowed', nextMode: 'initial' });
assert.deepEqual(foldReviewHistory([{ event_type: 'start_reserved', metadata: tuple }], tuple), { status: 'resume_reserved', nextMode: 'initial' });
assert.equal(foldReviewHistory([{ event_type: 'start_reserved', metadata: tuple }, { event_type: 'spawn_entered', metadata: tuple }], tuple).status, 'uncertain');
assert.equal(foldReviewHistory([{ event_type: 'start_reserved', metadata: tuple }, { event_type: 'start_reserved', metadata: { ...tuple, attemptId: 'attempt-002' } }], tuple).status, 'denied');
assert.deepEqual(foldReviewHistory([{ event_type: 'review_outcome', metadata: { ...tuple, verdict: 'APPROVED' } }], tuple), { status: 'terminal', terminal: 'accepted' });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const script = path.join(root, 'modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs');
const state = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-event-'));
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-project-'));
try {
  const env = { ...process.env, RUNNING_PI_STATE_DIR: state, PIDEX_AUTO_PDQ: '0' };
  const started = spawnSync(process.execPath, [script, '--project', project, '--plan', '7', '--event', 'pipeline_started', '--project-mode', 'hardened-pipeline', '--test-project', 'true', '--metadata-json', '{"x":1}'], { encoding: 'utf8', env });
  assert.equal(started.status, 0, started.stderr || started.stdout);
  const match = started.stdout.match(/pipeline_id=([^\s]+)/);
  assert.ok(match);
  const pipelineId = match[1];
  const current = path.join(state, 'pipeline-events', path.basename(project), 'plan-007.current');
  assert.ok(existsSync(current));

  const completed = spawnSync(process.execPath, [script, '--project', project, '--plan', '7', '--event', 'pipeline_completed'], { encoding: 'utf8', env });
  assert.equal(completed.status, 0, completed.stderr || completed.stdout);
  assert.equal(existsSync(current), false);
  const jsonl = path.join(state, 'pipeline-events', path.basename(project), `${pipelineId}.jsonl`);
  const rows = readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plan_key, 'plan-007');
  assert.equal(rows[0].project_mode, 'hardened-pipeline');
  assert.equal(rows[0].is_test_project, true);
  assert.equal('is_test_project' in rows[1], false);
  assert.equal(rows[1].event_type, 'pipeline_completed');

  const invalidFlag = spawnSync(process.execPath, [script, '--project', project, '--plan', '8', '--event', 'pipeline_started', '--test-project', 'maybe'], { encoding: 'utf8', env });
  assert.notEqual(invalidFlag.status, 0);
  assert.match(invalidFlag.stderr, /requires true or false/);

  const orphan = spawnSync(process.execPath, [script, '--project', project, '--plan', '8', '--event', 'pipeline_failed'], { encoding: 'utf8', env });
  assert.notEqual(orphan.status, 0);
  assert.match(orphan.stderr, /no active pipeline id/);

  const reviewStart = reserveReviewStart({ stateDir: state, project, pipelineId, identity: tuple, start: () => 'child-started' });
  assert.equal(reviewStart.status, 'accepted');
  const duplicateStart = reserveReviewStart({ stateDir: state, project, pipelineId, identity: tuple, start: () => { throw new Error('duplicate must not start'); } });
  assert.equal(duplicateStart.status, 'resumed');
  const reviewRows = readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.runFamilyId === tuple.runFamilyId);
  assert.deepEqual(reviewRows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted']);
  assert.equal(existsSync(path.join(state, 'pipeline-events', path.basename(project), `.review-${tuple.runFamilyId}.lock`)), false);

  const conflicting = reserveReviewStart({ stateDir: state, project, pipelineId, identity: { ...tuple, attemptId: 'attempt-002' }, start: () => { throw new Error('conflict must not start'); } });
  assert.equal(conflicting.status, 'denied');
} finally {
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
console.log('pipeline event.mjs tests passed');
