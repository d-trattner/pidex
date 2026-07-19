#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldReviewHistory, validateReviewIdentity } from '../../../../../extensions/pidex/review-budget.ts';
import { recordReviewCompletion, reserveReviewStart } from './event.mjs';

const tuple = { runFamilyId: 'family-001', planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-001' };
assert.deepEqual(validateReviewIdentity(tuple), { ok: true, value: tuple });
assert.equal(validateReviewIdentity({ ...tuple, reviewGate: 'other' }).ok, false);
assert.equal(validateReviewIdentity({ ...tuple, runFamilyId: 'x'.repeat(81) }).ok, false);
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
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: '../escape', identity: tuple, start: () => 'must not start' }).status, 'denied');
  const unavailableLock = path.join(state, 'pipeline-events', path.basename(project), '.review-family-locked.lock');
  mkdirSync(unavailableLock);
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId, identity: { ...tuple, runFamilyId: 'family-locked', attemptId: 'attempt-locked' }, start: () => 'must not start' }).status, 'unavailable');
  rmSync(unavailableLock, { recursive: true, force: true });
  mkdirSync(path.join(state, 'pipeline-events', path.basename(project), 'pipeline-write-failure.jsonl'));
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: 'pipeline-write-failure', identity: { ...tuple, runFamilyId: 'family-write-failure', attemptId: 'attempt-write-failure' }, start: () => 'must not start' }).status, 'unavailable');

  const reservedTuple = { ...tuple, runFamilyId: 'family-resume', attemptId: 'attempt-resume' };
  writeFileSync(jsonl, `${JSON.stringify({ event_type: 'start_reserved', metadata: reservedTuple })}\n`, { flag: 'a' });
  const resumedReservation = reserveReviewStart({ stateDir: state, project, pipelineId, identity: reservedTuple, start: () => 'resumed-child' });
  assert.equal(resumedReservation.status, 'accepted');
  const enteredTuple = { ...tuple, runFamilyId: 'family-uncertain', attemptId: 'attempt-uncertain' };
  writeFileSync(jsonl, `${JSON.stringify({ event_type: 'start_reserved', metadata: enteredTuple })}\n${JSON.stringify({ event_type: 'spawn_entered', metadata: enteredTuple })}\n`, { flag: 'a' });
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId, identity: enteredTuple, start: () => { throw new Error('uncertain must not start'); } }).status, 'uncertain');

  const lockTuple = { ...tuple, runFamilyId: 'family-lock', attemptId: 'attempt-lock' };
  let lockSeenDuringStart = false;
  const lockProof = reserveReviewStart({ stateDir: state, project, pipelineId, identity: lockTuple, start: () => {
    const lockPath = path.join(state, 'pipeline-events', path.basename(project), `.review-${lockTuple.runFamilyId}.lock`);
    lockSeenDuringStart = existsSync(lockPath);
    const currentRows = readFileSync(jsonl, 'utf8');
    assert.match(currentRows, /spawn_entered/);
    assert.doesNotMatch(currentRows, /family-lock[\\s\\S]*spawn_accepted/);
    return 'os-started';
  } });
  assert.equal(lockProof.status, 'accepted');
  assert.equal(lockSeenDuringStart, true);
  assert.equal(existsSync(path.join(state, 'pipeline-events', path.basename(project), `.review-${lockTuple.runFamilyId}.lock`)), false);
  assert.equal(recordReviewCompletion({ stateDir: state, project, pipelineId, identity: lockTuple, outcome: 'accepted' }).status, 'accepted');
  const rejectionTuple = { ...tuple, runFamilyId: 'family-reject', attemptId: 'attempt-reject' };
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId, identity: rejectionTuple, start: () => 'started' }).status, 'accepted');
  assert.equal(recordReviewCompletion({ stateDir: state, project, pipelineId, identity: rejectionTuple, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  assert.deepEqual(foldReviewHistory(readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), { ...rejectionTuple, reviewMode: 'correction1', attemptId: 'attempt-correction-1' }), { status: 'allowed', nextMode: 'correction1' });
  assert.deepEqual(foldReviewHistory(readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), lockTuple), { status: 'terminal', terminal: 'accepted' });

  const contentionState = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-contention-'));
  const contentionProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-contention-project-'));
  const contentionTuple = { ...tuple, runFamilyId: 'family-contention', attemptId: 'attempt-contention' };
  const contentionBase = path.join(contentionState, 'pipeline-events', path.basename(contentionProject));
  mkdirSync(contentionBase, { recursive: true });
  writeFileSync(path.join(contentionBase, 'pipeline-contention.jsonl'), '');
  const childSource = `import { reserveReviewStart } from ${JSON.stringify(new URL('./event.mjs', import.meta.url).href)}; import { writeFileSync } from 'node:fs'; const [stateDir, project, pipelineId, identityJson, marker, hold] = process.argv.slice(1); const result = reserveReviewStart({ stateDir, project, pipelineId, identity: JSON.parse(identityJson), start: () => { writeFileSync(marker, 'entered'); if (hold === 'hold') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350); return 'started'; } }); console.log(JSON.stringify(result));`;
  const spawnContender = (hold) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', childSource, contentionState, contentionProject, 'pipeline-contention', JSON.stringify(contentionTuple), path.join(contentionState, 'entered'), hold], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = '';
    child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject); child.on('close', (code) => resolve({ code, output, error }));
  });
  const winner = spawnContender('hold');
  const marker = path.join(contentionState, 'entered');
  for (let tries = 0; tries < 50 && !existsSync(marker); tries++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(existsSync(marker), true, 'first OS process must enter injected OS-start seam');
  const loser = await spawnContender('once');
  const winnerResult = await winner;
  assert.equal(winnerResult.code, 0, winnerResult.error);
  assert.equal(loser.code, 0, loser.error);
  assert.equal(JSON.parse(winnerResult.output).status, 'accepted');
  assert.equal(JSON.parse(loser.output).status, 'unavailable');
  rmSync(contentionState, { recursive: true, force: true });
  rmSync(contentionProject, { recursive: true, force: true });
} finally {
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
console.log('pipeline event.mjs tests passed');
