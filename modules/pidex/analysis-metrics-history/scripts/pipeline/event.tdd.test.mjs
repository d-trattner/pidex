#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { foldReviewHistory, validateReviewIdentity } from '../../../../../extensions/pidex/review-budget.ts';
import { normalizePlan, recordPipelineEvent, recordReviewCompletion, reserveReviewStart, resolvePlanReviewAuthority } from './event.mjs';
import { canonicalProjectIdentity } from '../../lib/project-key.mjs';

const tuple = { runFamilyId: 'family-001', planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-001' };
assert.equal(normalizePlan('16725'), 'plan-16725');
assert.equal(normalizePlan('plan-16725'), 'plan-16725');
assert.equal(normalizePlan('16725-feature'), 'plan-16725');
assert.equal(normalizePlan('plan-16725_feature'), 'plan-16725');
assert.deepEqual(validateReviewIdentity(tuple), { ok: true, value: tuple });
assert.equal(validateReviewIdentity({ ...tuple, reviewGate: 'other' }).ok, false);
assert.equal(validateReviewIdentity({ ...tuple, reviewGate: 'security-review' }).ok, false);
assert.equal(validateReviewIdentity({ ...tuple, runFamilyId: 'x'.repeat(81) }).ok, false);
assert.deepEqual(foldReviewHistory([], tuple), { status: 'allowed', nextMode: 'initial' });
assert.deepEqual(foldReviewHistory([{ event_type: 'start_reserved', metadata: tuple }], tuple), { status: 'resume_reserved', nextMode: 'initial' });
assert.equal(foldReviewHistory([{ event_type: 'start_reserved', metadata: tuple }, { event_type: 'spawn_entered', metadata: tuple }], tuple).status, 'uncertain');
assert.equal(foldReviewHistory([{ event_type: 'start_reserved', metadata: tuple }, { event_type: 'start_reserved', metadata: { ...tuple, attemptId: 'attempt-002' } }], tuple).status, 'denied');
assert.deepEqual(foldReviewHistory([{ event_type: 'review_outcome', metadata: { ...tuple, verdict: 'APPROVED' } }], tuple), { status: 'terminal', terminal: 'accepted' });

// Plan 059 Slice 2 — dual legacy/new fold sequences selected by discriminator types[3].
const row = (event_type, metadata) => ({ event_type, metadata });
const s2receipt = (overrides = {}) => ({ ...tuple, artifactDigest: 'a'.repeat(64), outcomeDigest: 'b'.repeat(64), intendedOutcome: 'APPROVED', tbrIds: ['TBR-0123456789ab'], ...overrides });
const s2new = (intendedOutcome = 'APPROVED', base = tuple, after = []) => [row('start_reserved', base), row('spawn_entered', base), row('spawn_accepted', base), row('completion_prepared', s2receipt({ ...base, intendedOutcome, tbrIds: intendedOutcome === 'APPROVED' ? ['TBR-0123456789ab'] : [] })), ...after];
const s2complete = (outcome, base = tuple) => s2new(outcome, base, [row('spawn_returned', base), row('review_outcome', { ...base, outcome })]);
// New sequence: prepared-only (length 4) is resumable, never uncertain.
assert.deepEqual(foldReviewHistory(s2new(), tuple), { status: 'prepared', nextMode: 'initial' }, 'prepared-only receipt state is resumable');
// New sequence: prepared + returned, missing outcome (length 5) is resumable.
assert.deepEqual(foldReviewHistory(s2new('APPROVED', tuple, [row('spawn_returned', tuple)]), tuple), { status: 'prepared', nextMode: 'initial' }, 'prepared+returned without outcome is resumable');
// New sequence length 6: receipt intendedOutcome must equal final review outcome.
assert.deepEqual(foldReviewHistory(s2complete('APPROVED'), tuple), { status: 'terminal', terminal: 'accepted' }, 'prepared six-event approval terminals accepted');
// New sequence length 6: receipt/outcome disagreement fails closed.
assert.equal(foldReviewHistory(s2new('APPROVED', tuple, [row('spawn_returned', tuple), row('review_outcome', { ...tuple, outcome: 'CHANGES_REQUESTED' })]), tuple).status, 'denied', 'receipt intendedOutcome must agree with final outcome');
// New sequence length 6: initial rejection advances to correction1.
assert.deepEqual(foldReviewHistory(s2complete('CHANGES_REQUESTED'), { ...tuple, reviewMode: 'correction1' }), { status: 'allowed', nextMode: 'correction1' }, 'prepared initial rejection advances one correction');
// New sequence length 6: review2 closed terminals (full mode chain required).
const s2chain = (finalMode, finalOutcome) => [
  ...['initial', 'correction1', 'review1', 'correction2'].flatMap((mode) => s2complete(mode === 'initial' ? 'CHANGES_REQUESTED' : mode === 'correction1' ? 'READY_FOR_REVIEW' : mode === 'review1' ? 'CHANGES_REQUESTED' : 'SUBMITTED', { ...tuple, reviewMode: mode, attemptId: `attempt-${mode}` })),
  ...s2complete(finalOutcome, { ...tuple, reviewMode: finalMode, attemptId: `attempt-${finalMode}` }),
];
assert.deepEqual(foldReviewHistory(s2chain('review2', 'closed'), { ...tuple, reviewMode: 'review2', attemptId: 'attempt-review2' }), { status: 'terminal', terminal: 'closed' }, 'prepared review2 rejection terminals closed');
// Legacy five-event full chain with review2 closed still terminals without receipt.
const legacyChain = [
  ...['initial', 'correction1', 'review1', 'correction2'].flatMap((mode) => [row('start_reserved', { ...tuple, reviewMode: mode, attemptId: `attempt-${mode}` }), row('spawn_entered', { ...tuple, reviewMode: mode, attemptId: `attempt-${mode}` }), row('spawn_accepted', { ...tuple, reviewMode: mode, attemptId: `attempt-${mode}` }), row('spawn_returned', { ...tuple, reviewMode: mode, attemptId: `attempt-${mode}` }), row('review_outcome', { ...tuple, reviewMode: mode, attemptId: `attempt-${mode}`, outcome: mode === 'initial' ? 'CHANGES_REQUESTED' : mode === 'correction1' ? 'READY_FOR_REVIEW' : mode === 'review1' ? 'CHANGES_REQUESTED' : 'SUBMITTED' })]),
  ...[row('start_reserved', { ...tuple, reviewMode: 'review2', attemptId: 'attempt-review2' }), row('spawn_entered', { ...tuple, reviewMode: 'review2', attemptId: 'attempt-review2' }), row('spawn_accepted', { ...tuple, reviewMode: 'review2', attemptId: 'attempt-review2' }), row('spawn_returned', { ...tuple, reviewMode: 'review2', attemptId: 'attempt-review2' }), row('review_outcome', { ...tuple, reviewMode: 'review2', attemptId: 'attempt-review2', outcome: 'closed' })],
];
assert.deepEqual(foldReviewHistory(legacyChain, { ...tuple, reviewMode: 'review2', attemptId: 'attempt-review2' }), { status: 'terminal', terminal: 'closed' }, 'legacy five-event review2 closed still terminals');
// New sequence length 6: USER_DECISION_REQUIRED folds to non-spawnable expansion_pending.
assert.deepEqual(foldReviewHistory(s2complete('USER_DECISION_REQUIRED'), tuple), { status: 'expansion_pending' }, 'expansion completion folds non-spawnable');
// Legacy five-event sequences remain unchanged (no receipt agreement requirement).
assert.deepEqual(foldReviewHistory([row('start_reserved', tuple), row('spawn_entered', tuple), row('spawn_accepted', tuple), row('spawn_returned', tuple), row('review_outcome', { ...tuple, outcome: 'APPROVED' })], tuple), { status: 'terminal', terminal: 'accepted' }, 'legacy five-event approval still terminals');
// Legacy four-event unprepared uncertainty is preserved.
assert.deepEqual(foldReviewHistory([row('start_reserved', tuple), row('spawn_entered', tuple), row('spawn_accepted', tuple), row('spawn_returned', tuple)], tuple), { status: 'uncertain', code: 'SPAWN_RETURNED_UNCERTAIN' }, 'legacy four-event returned uncertainty unchanged');
// Legacy history carrying USER_DECISION_REQUIRED without a receipt is invalid (receipt required).
assert.equal(foldReviewHistory([row('start_reserved', tuple), row('spawn_entered', tuple), row('spawn_accepted', tuple), row('spawn_returned', tuple), row('review_outcome', { ...tuple, outcome: 'USER_DECISION_REQUIRED' })], tuple).status, 'denied', 'expansion outcome without receipt is invalid');
// Differing duplicate receipts fail closed; identical duplicate receipts collapse.
assert.equal(foldReviewHistory(s2new().concat([row('completion_prepared', s2receipt({ intendedOutcome: 'CHANGES_REQUESTED' }))]), tuple).status, 'denied', 'differing duplicate receipt fails closed');
assert.deepEqual(foldReviewHistory(s2new().concat([row('completion_prepared', s2receipt())]), tuple), { status: 'prepared', nextMode: 'initial' }, 'identical duplicate receipt collapses');
// New sequence with an unexpected seventh event is invalid.
assert.equal(foldReviewHistory([...s2complete('APPROVED').slice(0, 5), row('review_outcome', { ...tuple, outcome: 'CHANGES_REQUESTED' }), row('review_outcome', { ...tuple, outcome: 'APPROVED' })], tuple).status, 'denied', 'extra event beyond six-event sequence denied');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const script = path.join(root, 'modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs');
const state = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-event-'));
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-project-'));
try {
  const env = { ...process.env, RUNNING_PI_STATE_DIR: state, PIDEX_AUTO_PDQ: '0' };
  assert.throws(() => resolvePlanReviewAuthority({ stateDir: state, project, planId: '12345' }), /REVIEW_AUTHORITY_NOT_FOUND/);
  const documentedStarted = spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', project, '--', '--project', project, '--plan', '12345', '--event', 'pipeline_started', '--status', 'running', '--actor', 'orchestrator', '--message', 'Started direct-mode pipeline', '--project-mode', 'host-direct', '--metadata-json', '{"entrypoint":"pidex-skill"}'], { encoding: 'utf8', env });
  assert.equal(documentedStarted.status, 0, documentedStarted.stderr || documentedStarted.stdout);
  const documentedBase = path.join(state, 'pipeline-events', canonicalProjectIdentity(project).projectKey);
  const documentedCurrent = path.join(documentedBase, 'plan-12345.current');
  assert.ok(existsSync(documentedCurrent));
  const documentedPipeline = readFileSync(documentedCurrent, 'utf8').trim();
  const documentedRows = readFileSync(path.join(documentedBase, `${documentedPipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(documentedRows[0].metadata, { entrypoint: 'pidex-skill' });
  assert.equal(documentedRows[0].message, 'Started direct-mode pipeline');
  assert.equal(documentedRows[0].project_mode, 'host-direct');
  const documentedCompleted = spawnSync(process.execPath, [script, '--project', project, '--plan', '12345', '--event', 'pipeline_completed'], { encoding: 'utf8', env });
  assert.equal(documentedCompleted.status, 0, documentedCompleted.stderr || documentedCompleted.stdout);
  assert.equal(existsSync(documentedCurrent), false);
  assert.equal(readFileSync(path.join(documentedBase, `${documentedPipeline}.jsonl`), 'utf8').trim().split('\n').length, 2);
  const unsupportedPassthrough = spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', project, '--', '--project', project, '--unknown', 'value'], { encoding: 'utf8', env });
  assert.equal(unsupportedPassthrough.status, 2);
  assert.match(unsupportedPassthrough.stderr, /passthrough args rejected/);
  const orphanPassthrough = spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', project, '--', 'orphan-value'], { encoding: 'utf8', env });
  assert.equal(orphanPassthrough.status, 2);
  assert.match(orphanPassthrough.stderr, /passthrough args rejected/);

  // Native-Windows fixture must stay beneath one owned temporary root.
  const testSource = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const nativeWindowsFixture = testSource.slice(testSource.indexOf('// Native-Windows fixture'), testSource.indexOf('\n\n  const started ='));
  const forbiddenWindowsHomeFixture = ['C:', 'Users', 'Daniel', 'pidex'].join('\\');
  assert.equal(testSource.includes(forbiddenWindowsHomeFixture), false, 'test must not contain a literal user-home fixture path');
  assert.match(nativeWindowsFixture, /rmSync\(windowsFixtureRoot, \{ recursive: true, force: true \}\)/, 'fixture cleanup must target owned root');
  assert.doesNotMatch(nativeWindowsFixture, /rmSync\((?!windowsFixtureRoot, \{ recursive: true, force: true \}\))/, 'fixture must not recursively remove separate targets');

  const recordEventCapability = JSON.parse(readFileSync(path.join(root, 'modules/pidex/analysis-metrics-history/module.json'), 'utf8')).capabilities.find((capability) => capability.id === 'analysis-metrics-history.record-event');
  for (const [field, windowsPath, traversalPath] of [
    ['--project', 'C:\\fixtures\\project', 'C:\\fixtures\\..\\outside'],
    ['--state-dir', 'C:\\fixtures\\state', 'C:\\fixtures\\..\\outside'],
  ]) {
    const contextualPattern = new RegExp(recordEventCapability.command.passthrough_policy.allowed_value_patterns[field][0]);
    assert.match(windowsPath, contextualPattern, `${field} contextual regex must accept Windows backslashes`);
    assert.equal(!traversalPath.includes('..') && contextualPattern.test(traversalPath), false, `${field} contextual policy must reject traversal`);
  }

  const windowsFixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-native-windows-fixture-'));
  const windowsProject = path.join(windowsFixtureRoot, 'project');
  const windowsStateDir = path.join(windowsProject, '.pidex-state');
  try {
    mkdirSync(windowsProject, { recursive: true });
    const nativeWindowsPaths = spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', windowsProject, '--', '--project', windowsProject, '--state-dir', windowsStateDir, '--plan', '12346', '--event', 'pipeline_started', '--status', 'running', '--actor', 'orchestrator'], { encoding: 'utf8', env });
    assert.equal(nativeWindowsPaths.status, 0, nativeWindowsPaths.stderr || nativeWindowsPaths.stdout);
    const traversalProjectPath = `${windowsFixtureRoot}${path.sep}..${path.sep}outside`;
    const traversalProject = spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', windowsProject, '--', '--project', traversalProjectPath, '--plan', '12346', '--event', 'pipeline_started'], { encoding: 'utf8', env });
    assert.equal(traversalProject.status, 2);
    assert.match(traversalProject.stderr, /passthrough args rejected/);
    const traversalStateDir = spawnSync(process.execPath, [path.join(root, 'scripts/modules/run-check.mjs'), '--capability', 'analysis-metrics-history.record-event', '--agent', 'orchestrator', '--phase', 'planning', '--project', windowsProject, '--', '--state-dir', traversalProjectPath, '--plan', '12346', '--event', 'pipeline_started'], { encoding: 'utf8', env });
    assert.equal(traversalStateDir.status, 2);
    assert.match(traversalStateDir.stderr, /passthrough args rejected/);
    assert.ok(recordEventCapability.supported_platforms.includes('windows-native'));
  } finally {
    const lexicalTempRoot = path.resolve(os.tmpdir());
    const lexicalFixtureRoot = path.resolve(windowsFixtureRoot);
    assert.equal(path.dirname(lexicalFixtureRoot), lexicalTempRoot, 'fixture root must be direct os.tmpdir child');
    const realTempRoot = realpathSync(lexicalTempRoot);
    const realFixtureRoot = realpathSync(lexicalFixtureRoot);
    assert.equal(realpathSync(path.dirname(lexicalFixtureRoot)), realTempRoot, 'fixture parent must resolve to os.tmpdir');
    assert.notEqual(realFixtureRoot, realTempRoot, 'fixture root must not equal os.tmpdir');
    assert.ok(realFixtureRoot.startsWith(`${realTempRoot}${path.sep}`), 'fixture root must resolve beneath os.tmpdir');
    rmSync(windowsFixtureRoot, { recursive: true, force: true });
  }

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
    const owner = JSON.parse(readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
    assert.deepEqual(owner.identity, lockTuple, 'Windows-compatible durable owner write must publish the exact review identity before child start');
    assert.equal(owner.pid, process.pid);
    assert.equal(typeof owner.processStart, 'string');
    assert.ok(owner.processStart.length > 0);
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
