#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldReviewHistory, validateReviewIdentity } from '../../../../../extensions/pidex/review-budget.ts';
import { recordPipelineEvent, recordReviewCompletion, reserveReviewStart } from './event.mjs';
import { canonicalProjectIdentity } from '../../lib/project-key.mjs';

const tuple = { runFamilyId: 'family-001', planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-001' };
assert.deepEqual(validateReviewIdentity(tuple), { ok: true, value: tuple });
assert.equal(validateReviewIdentity({ ...tuple, reviewGate: 'other' }).ok, false);
assert.equal(validateReviewIdentity({ ...tuple, reviewGate: 'security-review' }).ok, false);
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
  const projectBase = path.join(state, 'pipeline-events', canonicalProjectIdentity(project).projectKey);
  const current = path.join(projectBase, 'plan-007.current');
  assert.ok(existsSync(current));

  const completed = spawnSync(process.execPath, [script, '--project', project, '--plan', '7', '--event', 'pipeline_completed'], { encoding: 'utf8', env });
  assert.equal(completed.status, 0, completed.stderr || completed.stdout);
  assert.equal(existsSync(current), false);
  const jsonl = path.join(projectBase, `${pipelineId}.jsonl`);
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

  // Root-only lifecycle authority: explicit pipelineId cannot replace plan current pointer.
  const reviewCurrent = path.join(projectBase, `${tuple.planId}.current`);
  const reviewControl = JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(project).canonicalProject, pipeline_id: pipelineId, plan_key: tuple.planId });
  writeFileSync(jsonl, `${reviewControl}\n`, { flag: 'a' });
  writeFileSync(reviewCurrent, pipelineId);
  const reviewStart = reserveReviewStart({ stateDir: state, project, pipelineId, identity: tuple, start: () => 'child-started' });
  assert.equal(reviewStart.status, 'accepted');
  const duplicateStart = reserveReviewStart({ stateDir: state, project, pipelineId, identity: tuple, start: () => { throw new Error('duplicate must not start'); } });
  assert.equal(duplicateStart.status, 'resumed');
  const reviewRows = readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.runFamilyId === tuple.runFamilyId);
  assert.deepEqual(reviewRows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted']);
  assert.equal(existsSync(path.join(projectBase, `.review-${tuple.runFamilyId}.lock`)), false);
  rmSync(reviewCurrent);
  assert.deepEqual(reserveReviewStart({ stateDir: state, project, pipelineId, identity: { ...tuple, runFamilyId: 'family-missing-pointer', attemptId: 'attempt-missing-pointer' }, start: () => { throw new Error('missing current pointer must not start'); } }), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' });
  writeFileSync(reviewCurrent, pipelineId);
  const mismatchState = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-root-mismatch-'));
  const mismatchProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-root-mismatch-project-'));
  try {
    const mismatchBase = path.join(mismatchState, 'pipeline-events', canonicalProjectIdentity(mismatchProject).projectKey);
    mkdirSync(mismatchBase, { recursive: true });
    writeFileSync(path.join(mismatchBase, `${tuple.planId}.current`), 'wrong-plan-root');
    writeFileSync(path.join(mismatchBase, 'wrong-plan-root.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(mismatchProject).canonicalProject, pipeline_id: 'wrong-plan-root', plan_key: 'plan-999' })}\n`);
    assert.deepEqual(reserveReviewStart({ stateDir: mismatchState, project: mismatchProject, pipelineId: 'caller-ignored', identity: { ...tuple, runFamilyId: 'family-wrong-plan', attemptId: 'attempt-wrong-plan' }, start: () => 'wrong plan root must not start' }), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' });
    rmSync(path.join(mismatchBase, 'wrong-plan-root.jsonl'));
    writeFileSync(path.join(mismatchBase, `${tuple.planId}.current`), 'wrong-pipeline-root');
    writeFileSync(path.join(mismatchBase, 'wrong-pipeline-root.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(mismatchProject).canonicalProject, pipeline_id: 'different-pipeline', plan_key: tuple.planId })}\n`);
    assert.deepEqual(reserveReviewStart({ stateDir: mismatchState, project: mismatchProject, pipelineId: 'caller-ignored', identity: { ...tuple, runFamilyId: 'family-wrong-pipeline', attemptId: 'attempt-wrong-pipeline' }, start: () => 'wrong pipeline root must not start' }), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' });
  } finally { rmSync(mismatchState, { recursive: true, force: true }); rmSync(mismatchProject, { recursive: true, force: true }); }

  const conflicting = reserveReviewStart({ stateDir: state, project, pipelineId, identity: { ...tuple, attemptId: 'attempt-002' }, start: () => { throw new Error('conflict must not start'); } });
  assert.equal(conflicting.status, 'denied');
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: '../escape', identity: tuple, start: () => 'must not start' }).status, 'resumed');
  const unavailableLock = path.join(projectBase, `.review-${tuple.planId}-${tuple.reviewGate}.lock`);
  mkdirSync(unavailableLock);
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId, identity: { ...tuple, runFamilyId: 'family-locked', attemptId: 'attempt-locked' }, start: () => 'must not start' }).status, 'unavailable');
  rmSync(unavailableLock, { recursive: true, force: true });
  mkdirSync(path.join(projectBase, 'pipeline-write-failure.jsonl'));
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: 'pipeline-write-failure', identity: { ...tuple, runFamilyId: 'family-write-failure', attemptId: 'attempt-write-failure' }, start: () => 'must not start' }).status, 'denied');
  rmSync(path.join(projectBase, 'pipeline-write-failure.jsonl'), { recursive: true, force: true });

  writeFileSync(jsonl, `${reviewControl}\n`);
  const reservedTuple = { ...tuple, runFamilyId: 'family-resume', attemptId: 'attempt-resume' };
  writeFileSync(jsonl, `${JSON.stringify({ event_type: 'start_reserved', metadata: reservedTuple })}\n`, { flag: 'a' });
  const resumedReservation = reserveReviewStart({ stateDir: state, project, pipelineId, identity: reservedTuple, start: () => 'resumed-child' });
  assert.equal(resumedReservation.status, 'accepted');
  writeFileSync(jsonl, `${reviewControl}\n`);
  const enteredTuple = { ...tuple, runFamilyId: 'family-uncertain', attemptId: 'attempt-uncertain' };
  writeFileSync(jsonl, `${JSON.stringify({ event_type: 'start_reserved', metadata: enteredTuple })}\n${JSON.stringify({ event_type: 'spawn_entered', metadata: enteredTuple })}\n`, { flag: 'a' });
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId, identity: enteredTuple, start: () => { throw new Error('uncertain must not start'); } }).status, 'uncertain');

  writeFileSync(jsonl, `${reviewControl}\n`);
  const deadLockTuple = { ...tuple, runFamilyId: 'family-dead-lock', attemptId: 'attempt-dead-lock' };
  const deadLock = path.join(projectBase, `.review-${deadLockTuple.planId}-${deadLockTuple.reviewGate}.lock`);
  mkdirSync(deadLock);
  writeFileSync(path.join(deadLock, 'owner.json'), JSON.stringify({ pid: 99999999, processStart: 'dead', identity: deadLockTuple }));
  let deadLockStarts = 0;
  assert.deepEqual(reserveReviewStart({ stateDir: state, project, pipelineId, identity: deadLockTuple, start: () => { deadLockStarts += 1; return 'must-not-start'; } }), { status: 'unavailable', code: 'REVIEW_LOCK_UNCERTAIN' });
  assert.equal(deadLockStarts, 0, 'stale lock must fail closed instead of deleting possible successor ownership');
  rmSync(deadLock, { recursive: true, force: true });
  const malformedLockTuple = { ...tuple, runFamilyId: 'family-malformed-lock', attemptId: 'attempt-malformed-lock' };
  const malformedLock = path.join(projectBase, `.review-${malformedLockTuple.planId}-${malformedLockTuple.reviewGate}.lock`);
  mkdirSync(malformedLock);
  writeFileSync(path.join(malformedLock, 'owner.json'), '{not-json');
  assert.deepEqual(reserveReviewStart({ stateDir: state, project, pipelineId, identity: malformedLockTuple, start: () => 'must-not-start' }), { status: 'unavailable', code: 'REVIEW_LOCK_UNCERTAIN' });
  rmSync(malformedLock, { recursive: true, force: true });
  writeFileSync(jsonl, `${reviewControl}\n`);
  const releaseTuple = { ...tuple, runFamilyId: 'family-release-lock', attemptId: 'attempt-release-lock' };
  assert.deepEqual(reserveReviewStart({ stateDir: state, project, pipelineId, identity: releaseTuple, start: () => {
    const lock = path.join(projectBase, `.review-${releaseTuple.planId}-${releaseTuple.reviewGate}.lock`);
    rmSync(lock, { recursive: true, force: true });
    writeFileSync(lock, 'release-blocked');
    return 'started';
  } }), { status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' });
  rmSync(path.join(projectBase, `.review-${releaseTuple.planId}-${releaseTuple.reviewGate}.lock`));
  writeFileSync(jsonl, `${reviewControl}\n`);
  const lockTuple = { ...tuple, runFamilyId: 'family-lock', attemptId: 'attempt-lock' };
  let lockSeenDuringStart = false;
  const lockProof = reserveReviewStart({ stateDir: state, project, pipelineId, identity: lockTuple, start: () => {
    const lockPath = path.join(projectBase, `.review-${lockTuple.planId}-${lockTuple.reviewGate}.lock`);
    lockSeenDuringStart = existsSync(lockPath);
    const currentRows = readFileSync(jsonl, 'utf8');
    assert.match(currentRows, /spawn_entered/);
    assert.doesNotMatch(currentRows, /family-lock[\\s\\S]*spawn_accepted/);
    return 'os-started';
  } });
  assert.equal(lockProof.status, 'accepted');
  assert.equal(lockSeenDuringStart, true);
  assert.equal(existsSync(path.join(projectBase, `.review-${lockTuple.planId}-${lockTuple.reviewGate}.lock`)), false);
  assert.equal(recordReviewCompletion({ stateDir: state, project, pipelineId, identity: lockTuple, outcome: 'accepted' }).status, 'accepted');
  writeFileSync(jsonl, `${reviewControl}\n`);
  const rejectionTuple = { ...tuple, runFamilyId: 'family-reject', attemptId: 'attempt-reject' };
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId, identity: rejectionTuple, start: () => 'started' }).status, 'accepted');
  assert.equal(recordReviewCompletion({ stateDir: state, project, pipelineId, identity: rejectionTuple, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  assert.deepEqual(foldReviewHistory(readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), { ...rejectionTuple, reviewMode: 'correction1', attemptId: 'attempt-correction-1' }), { status: 'allowed', nextMode: 'correction1' });
  assert.deepEqual(foldReviewHistory(readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), lockTuple), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' });

  const contentionState = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-contention-'));
  const contentionProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-contention-project-'));
  const contentionTuple = { ...tuple, runFamilyId: 'family-contention', attemptId: 'attempt-contention' };
  const contentionBase = path.join(contentionState, 'pipeline-events', canonicalProjectIdentity(contentionProject).projectKey);
  mkdirSync(contentionBase, { recursive: true });
  writeFileSync(path.join(contentionBase, 'plan-038.current'), 'pipeline-contention');
  writeFileSync(path.join(contentionBase, 'pipeline-contention.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(contentionProject).canonicalProject, pipeline_id: 'pipeline-contention', plan_key: contentionTuple.planId })}\n`);
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
  assert.equal(JSON.parse(loser.output).status, 'resumed');
  rmSync(contentionState, { recursive: true, force: true });
  rmSync(contentionProject, { recursive: true, force: true });
} finally {
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
const isolationState = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-isolation-'));
const isolationParentA = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-parent-a-'));
const isolationParentB = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-parent-b-'));
const sameA = path.join(isolationParentA, 'app');
const sameB = path.join(isolationParentB, 'app');
mkdirSync(sameA); mkdirSync(sameB);
try {
  const startA = recordPipelineEvent({ stateDir: isolationState, project: sameA, plan: '41', event: 'pipeline_started', pipelineId: 'same-a' });
  const startB = recordPipelineEvent({ stateDir: isolationState, project: sameB, plan: '41', event: 'pipeline_started', pipelineId: 'same-b' });
  assert.notEqual(startA.authority.base, startB.authority.base, 'same-basename canonical projects require distinct authority roots');
  const tupleA = { ...tuple, runFamilyId: 'same-a', planId: 'plan-041', attemptId: 'attempt-same-a' };
  const tupleB = { ...tuple, runFamilyId: 'same-b', planId: 'plan-041', attemptId: 'attempt-same-b' };
  assert.equal(reserveReviewStart({ stateDir: isolationState, project: sameA, pipelineId: 'ignored', identity: tupleA, start: () => 'child-a' }).status, 'accepted');
  assert.equal(reserveReviewStart({ stateDir: isolationState, project: sameB, pipelineId: 'ignored', identity: tupleB, start: () => 'child-b' }).status, 'accepted');
  assert.equal(recordReviewCompletion({ stateDir: isolationState, project: sameA, pipelineId: 'ignored', identity: tupleA, outcome: 'accepted' }).status, 'accepted');
  assert.equal(recordReviewCompletion({ stateDir: isolationState, project: sameB, pipelineId: 'ignored', identity: tupleB, outcome: 'accepted' }).status, 'accepted');

  const legacyBase = path.join(isolationState, 'pipeline-events', 'legacy-app');
  mkdirSync(legacyBase, { recursive: true });
  writeFileSync(path.join(legacyBase, 'plan-042.current'), 'legacy-active');
  writeFileSync(path.join(legacyBase, 'legacy-active.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(sameA).canonicalProject, pipeline_id: 'legacy-active', plan_key: 'plan-042' })}\n`);
  const legacyTuple = { ...tuple, runFamilyId: 'legacy-active', planId: 'plan-042', attemptId: 'attempt-legacy' };
  assert.equal(reserveReviewStart({ stateDir: isolationState, project: sameA, pipelineId: 'ignored', identity: legacyTuple, start: () => 'legacy-child' }).status, 'accepted');
  const ambiguousBase = path.join(isolationState, 'pipeline-events', 'legacy-app-copy');
  mkdirSync(ambiguousBase, { recursive: true });
  writeFileSync(path.join(ambiguousBase, 'plan-042.current'), 'legacy-copy');
  writeFileSync(path.join(ambiguousBase, 'legacy-copy.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(sameA).canonicalProject, pipeline_id: 'legacy-copy', plan_key: 'plan-042' })}\n`);
  const ambiguousTuple = { ...legacyTuple, runFamilyId: 'legacy-copy', attemptId: 'attempt-ambiguous' };
  assert.deepEqual(reserveReviewStart({ stateDir: isolationState, project: sameA, pipelineId: 'ignored', identity: ambiguousTuple, start: () => { throw new Error('ambiguous legacy child must not start'); } }), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' });

  const raceBase = path.join(isolationState, 'pipeline-events', 'legacy-race');
  mkdirSync(raceBase, { recursive: true });
  writeFileSync(path.join(raceBase, 'plan-043.current'), 'legacy-race-active');
  writeFileSync(path.join(raceBase, 'legacy-race-active.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(sameB).canonicalProject, pipeline_id: 'legacy-race-active', plan_key: 'plan-043' })}\n`);
  const raceTuple = { ...tuple, runFamilyId: 'legacy-race-active', planId: 'plan-043', attemptId: 'attempt-race' };
  const raceMarker = path.join(isolationState, 'race-entered');
  const raceChildSource = `import { reserveReviewStart } from ${JSON.stringify(new URL('./event.mjs', import.meta.url).href)}; import { writeFileSync } from 'node:fs'; const [stateDir, project, marker, identity] = process.argv.slice(1); const result = reserveReviewStart({ stateDir, project, pipelineId: 'ignored', identity: JSON.parse(identity), start: () => { writeFileSync(marker, 'entered'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350); return 'legacy-child'; } }); console.log(JSON.stringify(result));`;
  const raceChild = spawn(process.execPath, ['--input-type=module', '--eval', raceChildSource, isolationState, sameB, raceMarker, JSON.stringify(raceTuple)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let raceOutput = ''; let raceError = ''; raceChild.stdout.on('data', (chunk) => { raceOutput += chunk; }); raceChild.stderr.on('data', (chunk) => { raceError += chunk; });
  for (let tries = 0; tries < 50 && !existsSync(raceMarker); tries++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(existsSync(raceMarker), true, 'legacy OS-start seam must hold shared selection lock');
  const competingStart = spawnSync(process.execPath, [script, '--state-dir', isolationState, '--project', sameB, '--plan', '43', '--event', 'pipeline_started', '--pipeline-id', 'hashed-race'], { encoding: 'utf8', timeout: 5000 });
  const raceResult = await new Promise((resolve, reject) => { raceChild.on('error', reject); raceChild.on('close', (code) => resolve({ code, output: raceOutput, error: raceError })); });
  assert.equal(raceResult.code, 0, raceResult.error);
  assert.equal(JSON.parse(raceResult.output).status, 'accepted');
  assert.notEqual(competingStart.status, 0, 'concurrent hashed start must lose to active legacy authority');
  assert.equal(existsSync(path.join(isolationState, 'pipeline-events', canonicalProjectIdentity(sameB).projectKey, 'plan-043.current')), false);
} finally {
  rmSync(isolationState, { recursive: true, force: true });
  rmSync(isolationParentA, { recursive: true, force: true });
  rmSync(isolationParentB, { recursive: true, force: true });
}
console.log('pipeline event.mjs tests passed');
