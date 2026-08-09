#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalProjectIdentity } from './project-key.mjs';
import { foldReviewHistory } from '../../../../extensions/pidex/review-budget.ts';
import { deriveReviewPhysicalAttempt, recordReviewAbortHold, recordReviewCompletion, recordReviewHold, recordReviewPhysicalOutcome, reserveReviewStart } from './review-lifecycle.mjs';
import { resumeReviewHold } from '../scripts/pipeline/event.mjs';

const state = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-lifecycle-'));
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-project-'));
const identity = { runFamilyId: 'plan062-family', planId: 'plan-062', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'logical-attempt' };
const physical = (ordinal, current = identity) => ({
  physicalGeneration: 0,
  physicalOrdinal: ordinal,
  physicalAttemptId: createHash('sha256').update(`${current.runFamilyId}|${current.planId}|${current.reviewGate}|${current.reviewMode}|${current.attemptId}|0|${ordinal}`).digest('hex'),
});
const stream = () => path.join(state, 'pipeline-events', canonicalProjectIdentity(project).projectKey, 'plan062-pipeline.jsonl');
try {
  const base = path.dirname(stream());
  mkdirSync(base, { recursive: true });
  writeFileSync(path.join(base, 'plan-062.current'), 'plan062-pipeline');
  writeFileSync(stream(), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(project).canonicalProject, pipeline_id: 'plan062-pipeline', plan_key: 'plan-062' })}\n`);

  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, physical: { ...physical(0), physicalAttemptId: '0'.repeat(64) }, start: () => 'injected-child' }).status, 'denied', 'caller-injected physical identity fails closed');
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, physical: physical(0), start: () => 'first-child' }).status, 'accepted');
  assert.equal(recordReviewPhysicalOutcome({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, physical: physical(0), outcome: 'FAILED_TO_RUN', evidence: { exitCode: 1, finalTextPresent: false, routingPresent: false, artifactPresent: true } }).status, 'retryable');
  assert.deepEqual(foldReviewHistory(readFileSync(stream(), 'utf8').trim().split('\n').map(JSON.parse), identity), { status: 'physical_retry', nextMode: 'initial', physicalGeneration: 0, physicalOrdinal: 1 });
  const recoveredRetry = reserveReviewStart({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, physical: physical(0), start: () => { throw new Error('stale ordinal must not start'); } });
  assert.deepEqual({ status: recoveredRetry.status, physicalGeneration: recoveredRetry.physicalGeneration, physicalOrdinal: recoveredRetry.physicalOrdinal }, { status: 'retryable', physicalGeneration: 0, physicalOrdinal: 1 }, 'crash recovery returns folded retry ordinal instead of rejecting stale ordinal zero');

  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, physical: physical(1), start: () => 'retry-child' }).status, 'accepted');
  assert.equal(recordReviewPhysicalOutcome({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, physical: physical(1), outcome: 'FAILED_TO_RUN', evidence: { exitCode: 1, finalTextPresent: false, routingPresent: false, artifactPresent: true } }).status, 'exhausted');
  const rows = readFileSync(stream(), 'utf8').trim().split('\n').map(JSON.parse).filter((row) => row.metadata?.attemptId === identity.attemptId);
  assert.deepEqual(rows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'physical_outcome', 'start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'physical_outcome']);
  assert.equal(rows.filter((row) => row.event_type === 'review_outcome').length, 0, 'physical failure never consumes reviewer budget');
  const exhausted = foldReviewHistory(rows, identity);
  assert.equal(exhausted.status, 'physical_exhausted');
  assert.deepEqual({ physicalGeneration: exhausted.physicalGeneration, physicalOrdinal: exhausted.physicalOrdinal, physicalAttemptId: exhausted.physicalAttemptId }, physical(1));
  const held = recordReviewHold({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, physical: physical(1), status: 'PRIMARY_REVIEW_UNAVAILABLE' });
  assert.equal(held.status, 'PRIMARY_REVIEW_UNAVAILABLE');
  assert.match(held.holdId, /^hold-[a-f0-9]{32}$/);

  let resumedChildren = 0;
  assert.equal(resumeReviewHold({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, resumeHoldId: held.holdId, resumeConfirmed: 'true', start: () => { resumedChildren += 1; return 'must-not-start'; } }).status, 'denied', 'non-literal confirmation appends nothing and starts no child');
  const resumed = resumeReviewHold({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, resumeHoldId: held.holdId, resumeConfirmed: true, start: () => { resumedChildren += 1; return 'resumed-child'; } });
  assert.deepEqual({ status: resumed.status, physicalGeneration: resumed.physicalGeneration, physicalOrdinal: resumed.physicalOrdinal }, { status: 'accepted', physicalGeneration: 1, physicalOrdinal: 0 }, 'exact confirmed hold authorizes one server-derived next generation');
  assert.equal(resumedChildren, 1, 'one valid resume starts one child');
  assert.equal(resumeReviewHold({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity, resumeHoldId: held.holdId, resumeConfirmed: true, start: () => { resumedChildren += 1; return 'duplicate-child'; } }).status, 'denied', 'consumed hold rejects duplicate resume');
  assert.equal(resumedChildren, 1, 'duplicate resume starts no child');
  const resumedRows = readFileSync(stream(), 'utf8').trim().split('\n').map(JSON.parse).filter((row) => row.metadata?.attemptId === identity.attemptId);
  assert.deepEqual(resumedRows.map((row) => row.event_type).slice(-5), ['review_hold', 'review_resume_authorized', 'review_resume_consumed', 'start_reserved', 'spawn_entered', 'spawn_accepted'].slice(-5), 'resume authorization and consumption are append-only before child acceptance');

  const launchState = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-launch-state-'));
  const launchProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-launch-project-'));
  const launchIdentity = { ...identity, attemptId: 'launch-attempt' };
  const launchBase = path.join(launchState, 'pipeline-events', canonicalProjectIdentity(launchProject).projectKey);
  try {
    mkdirSync(launchBase, { recursive: true });
    writeFileSync(path.join(launchBase, 'plan-062.current'), 'launch-pipeline');
    writeFileSync(path.join(launchBase, 'launch-pipeline.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(launchProject).canonicalProject, pipeline_id: 'launch-pipeline', plan_key: 'plan-062' })}\n`);
    assert.equal(reserveReviewStart({ stateDir: launchState, project: launchProject, pipelineId: 'launch-pipeline', identity: launchIdentity, physical: physical(0, launchIdentity), start: () => { throw new Error('provider launch failed'); } }).status, 'retryable', 'pre-acceptance launch failure terminalizes as retryable physical outcome');
    const launchRows = readFileSync(path.join(launchBase, 'launch-pipeline.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((row) => row.metadata?.attemptId === launchIdentity.attemptId);
    assert.deepEqual(launchRows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'physical_outcome'], 'pre-acceptance failure never leaves inert spawn_entered');
    // SEC-1 regression (validation remediation): the pre-acceptance 3-event
    // transient-launch sequence must fold retryable (ordinal 0 -> ordinal 1) so
    // the automatic BD-62-03 retry can start; folding it denied stranded retries.
    assert.deepEqual(foldReviewHistory(launchRows, launchIdentity), { status: 'physical_retry', nextMode: 'initial', physicalGeneration: 0, physicalOrdinal: 1 }, 'pre-acceptance transient launch failure folds retryable ordinal 1');
    assert.equal(reserveReviewStart({ stateDir: launchState, project: launchProject, pipelineId: 'launch-pipeline', identity: launchIdentity, physical: physical(1, launchIdentity), start: () => 'launch-retry-child' }).status, 'accepted', 'retry after transient launch failure starts one child');
  } finally { rmSync(launchState, { recursive: true, force: true }); rmSync(launchProject, { recursive: true, force: true }); }

  writeFileSync(stream(), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(project).canonicalProject, pipeline_id: 'plan062-pipeline', plan_key: 'plan-062' })}\n`);
  const abortIdentity = { ...identity, attemptId: 'user-aborted-attempt' };
  assert.equal(reserveReviewStart({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity: abortIdentity, physical: physical(0, abortIdentity), start: () => 'aborted-child' }).status, 'accepted');
  assert.deepEqual(recordReviewAbortHold({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity: abortIdentity, physical: physical(0, abortIdentity) }), { status: 'REVIEW_ABORTED' }, 'accepted user abort persists a non-retryable typed stop');
  const stableAbort = reserveReviewStart({ stateDir: state, project, pipelineId: 'plan062-pipeline', identity: abortIdentity, physical: physical(0, abortIdentity), start: () => { throw new Error('aborted review must not relaunch'); } });
  assert.deepEqual(stableAbort, { status: 'held', reviewCompletion: { status: 'REVIEW_ABORTED' } }, 'post-abort call returns stable typed stop');

  // ==== Correction2 CRITICAL-1/MAJOR-1: multi-mode physical folding ====
  // Reviewer evidence chain: initial completes CHANGES_REQUESTED -> correction1
  // accepted -> child fails -> durable retryable outcome -> retry ordinal 1 ->
  // exhaustion -> durable hold -> confirmed resume -> completion -> review1
  // physical failure/retry -> success. Every step must fold across mode segments
  // in legal mode order while preserving semantic review_outcome advancement.
  const multiState = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-multi-state-'));
  const multiProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-multi-project-'));
  const attempt = (mode) => ({ runFamilyId: 'multi-family', planId: 'plan-062', reviewGate: 'code-review', reviewMode: mode, attemptId: `attempt-multi-${mode}` });
  const physicalFor = (current, ordinal, generation = 0) => deriveReviewPhysicalAttempt(current, generation, ordinal);
  const row = (event_type, metadata) => `${JSON.stringify({ event_type, metadata })}\n`;
  const freshMulti = () => {
    const st = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-multi2-state-'));
    const pr = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan062-multi2-project-'));
    const base = path.join(st, 'pipeline-events', canonicalProjectIdentity(pr).projectKey);
    mkdirSync(base, { recursive: true });
    writeFileSync(path.join(base, 'plan-062.current'), 'multi2-pipeline');
    writeFileSync(path.join(base, 'multi2-pipeline.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(pr).canonicalProject, pipeline_id: 'multi2-pipeline', plan_key: 'plan-062' })}\n`);
    return { st, pr, stream: path.join(base, 'multi2-pipeline.jsonl') };
  };
  try {
    const base = path.join(multiState, 'pipeline-events', canonicalProjectIdentity(multiProject).projectKey);
    mkdirSync(base, { recursive: true });
    writeFileSync(path.join(base, 'plan-062.current'), 'multi-pipeline');
    writeFileSync(path.join(base, 'multi-pipeline.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(multiProject).canonicalProject, pipeline_id: 'multi-pipeline', plan_key: 'plan-062' })}\n`);
    const start = (current, physicalArg, startFn = () => 'child') => reserveReviewStart({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: current, physical: physicalArg, start: startFn });
    const multiRows = () => readFileSync(path.join(base, 'multi-pipeline.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);

    // E2E probe matching reviewer evidence: multi-mode physical failure/retry/hold.
    const initial = attempt('initial');
    assert.equal(start(initial, physicalFor(initial, 0)).status, 'accepted');
    assert.equal(recordReviewCompletion({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: initial, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
    const correction1 = attempt('correction1');
    assert.equal(start(correction1, physicalFor(correction1, 0)).status, 'accepted', 'correction1 physical start after initial completion');
    assert.equal(recordReviewPhysicalOutcome({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: correction1, physical: physicalFor(correction1, 0), outcome: 'FAILED_TO_RUN', evidence: { exitCode: 1, finalTextPresent: false, routingPresent: false, artifactPresent: true } }).status, 'retryable', 'correction-mode physical failure records durable retryable outcome');
    assert.deepEqual(foldReviewHistory(multiRows(), correction1), { status: 'physical_retry', nextMode: 'correction1', physicalGeneration: 0, physicalOrdinal: 1 }, 'multi-mode fold returns folded retry ordinal 1');
    const staleRetry = start(correction1, physicalFor(correction1, 0), () => { throw new Error('stale ordinal must not start'); });
    assert.deepEqual({ status: staleRetry.status, physicalGeneration: staleRetry.physicalGeneration, physicalOrdinal: staleRetry.physicalOrdinal }, { status: 'retryable', physicalGeneration: 0, physicalOrdinal: 1 }, 'multi-mode crash recovery returns folded retry ordinal');
    assert.equal(start(correction1, physicalFor(correction1, 1)).status, 'accepted', 'correction-mode retry starts on ordinal 1');
    assert.equal(recordReviewPhysicalOutcome({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: correction1, physical: physicalFor(correction1, 1), outcome: 'FAILED_TO_RUN', evidence: { exitCode: 1, finalTextPresent: false, routingPresent: false, artifactPresent: true } }).status, 'exhausted');
    const correctionHold = recordReviewHold({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: correction1, physical: physicalFor(correction1, 1), status: 'PRIMARY_REVIEW_UNAVAILABLE' });
    assert.equal(correctionHold.status, 'PRIMARY_REVIEW_UNAVAILABLE', 'correction-mode exhaustion holds durably');
    assert.match(correctionHold.holdId, /^hold-[a-f0-9]{32}$/);
    assert.deepEqual(foldReviewHistory(multiRows(), correction1), { status: 'primary_hold', nextMode: 'correction1', physicalGeneration: 0, physicalOrdinal: 1, physicalAttemptId: physicalFor(correction1, 1).physicalAttemptId, holdId: correctionHold.holdId }, 'multi-mode fold reaches primary_hold');
    let resumedChildren = 0;
    const resumed = resumeReviewHold({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: correction1, resumeHoldId: correctionHold.holdId, resumeConfirmed: true, start: () => { resumedChildren += 1; return 'resumed-correction-child'; } });
    assert.deepEqual({ status: resumed.status, physicalGeneration: resumed.physicalGeneration, physicalOrdinal: resumed.physicalOrdinal }, { status: 'accepted', physicalGeneration: 1, physicalOrdinal: 0 }, 'correction-mode hold resumes into generation 1');
    assert.equal(resumedChildren, 1, 'one confirmed correction-mode resume starts one child');
    assert.equal(recordReviewCompletion({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: correction1, outcome: 'READY_FOR_REVIEW' }).status, 'READY_FOR_REVIEW', 'resumed correction completes semantically and advances mode');
    const review1 = attempt('review1');
    assert.equal(start(review1, physicalFor(review1, 0)).status, 'accepted', 'review1 physical start after resumed correction completion');
    assert.equal(recordReviewPhysicalOutcome({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: review1, physical: physicalFor(review1, 0), outcome: 'TIMED_OUT', evidence: { timedOut: true } }).status, 'retryable', 'review-mode physical timeout records retryable outcome');
    assert.equal(start(review1, physicalFor(review1, 1)).status, 'accepted', 'review-mode retry starts ordinal 1');
    assert.equal(recordReviewCompletion({ stateDir: multiState, project: multiProject, pipelineId: 'multi-pipeline', identity: review1, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED', 'review1 retry succeeds and advances to correction2');
    assert.deepEqual(foldReviewHistory(multiRows(), attempt('correction2')), { status: 'allowed', nextMode: 'correction2' }, 'complete multi-mode physical chain folds allowed for next legal mode');

    // Correction-mode abort: durable REVIEW_ABORTED, stable post-abort stop.
    const abortFixture = freshMulti();
    const abortInitial = attempt('initial');
    const abortCorrection = attempt('correction1');
    const abortStart = (current, physicalArg) => reserveReviewStart({ stateDir: abortFixture.st, project: abortFixture.pr, pipelineId: 'multi2-pipeline', identity: current, physical: physicalArg, start: () => 'child' });
    assert.equal(abortStart(abortInitial, physicalFor(abortInitial, 0)).status, 'accepted');
    assert.equal(recordReviewCompletion({ stateDir: abortFixture.st, project: abortFixture.pr, pipelineId: 'multi2-pipeline', identity: abortInitial, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
    assert.equal(abortStart(abortCorrection, physicalFor(abortCorrection, 0)).status, 'accepted');
    assert.deepEqual(recordReviewAbortHold({ stateDir: abortFixture.st, project: abortFixture.pr, pipelineId: 'multi2-pipeline', identity: abortCorrection, physical: physicalFor(abortCorrection, 0) }), { status: 'REVIEW_ABORTED' }, 'correction-mode accepted user abort persists a typed non-retryable stop');
    assert.deepEqual(foldReviewHistory(readFileSync(abortFixture.stream, 'utf8').trim().split('\n').map(JSON.parse), abortCorrection), { status: 'abort_hold', nextMode: 'correction1', physicalGeneration: 0, physicalOrdinal: 0, physicalAttemptId: physicalFor(abortCorrection, 0).physicalAttemptId }, 'multi-mode fold reaches abort_hold');
    assert.deepEqual(reserveReviewStart({ stateDir: abortFixture.st, project: abortFixture.pr, pipelineId: 'multi2-pipeline', identity: abortCorrection, physical: physicalFor(abortCorrection, 0), start: () => { throw new Error('aborted correction must not relaunch'); } }), { status: 'held', reviewCompletion: { status: 'REVIEW_ABORTED' } }, 'post-abort correction call returns stable typed stop');

    // Correction-mode in-flight duplicate: typed uncertainty, never inert resumed.
    const inflightFixture = freshMulti();
    const inflightInitial = attempt('initial');
    const inflightCorrection = attempt('correction1');
    const inflightStart = (current, physicalArg, startFn = () => 'child') => reserveReviewStart({ stateDir: inflightFixture.st, project: inflightFixture.pr, pipelineId: 'multi2-pipeline', identity: current, physical: physicalArg, start: startFn });
    assert.equal(inflightStart(inflightInitial, physicalFor(inflightInitial, 0)).status, 'accepted');
    assert.equal(recordReviewCompletion({ stateDir: inflightFixture.st, project: inflightFixture.pr, pipelineId: 'multi2-pipeline', identity: inflightInitial, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
    assert.equal(inflightStart(inflightCorrection, physicalFor(inflightCorrection, 0)).status, 'accepted');
    const duplicate = inflightStart(inflightCorrection, physicalFor(inflightCorrection, 0), () => { throw new Error('duplicate must not start'); });
    assert.equal(duplicate.status, 'uncertain', 'correction-mode physical in-flight duplicate returns typed uncertainty');
    assert.equal(duplicate.code, 'REVIEW_PHYSICAL_ACCEPTED_UNCERTAIN');
    assert.deepEqual(foldReviewHistory(readFileSync(inflightFixture.stream, 'utf8').trim().split('\n').map(JSON.parse), inflightCorrection), { status: 'physical_accepted', nextMode: 'correction1', physicalGeneration: 0, physicalOrdinal: 0, physicalAttemptId: physicalFor(inflightCorrection, 0).physicalAttemptId }, 'in-flight correction folds as physical_accepted, never legacy spawn_accepted');

    // Mixed legacy+physical within one logical mode fails closed (multi-mode).
    const mixedFixture = freshMulti();
    const mixedInitial = attempt('initial');
    const mixedCorrection = attempt('correction1');
    const mixedStream = [
      row('start_reserved', mixedInitial), row('spawn_entered', mixedInitial), row('spawn_accepted', mixedInitial),
      row('completion_prepared', { ...mixedInitial, intendedOutcome: 'CHANGES_REQUESTED' }), row('spawn_returned', mixedInitial), row('review_outcome', { ...mixedInitial, outcome: 'CHANGES_REQUESTED' }),
      row('start_reserved', mixedCorrection), row('spawn_entered', { ...mixedCorrection, ...physicalFor(mixedCorrection, 0) }), row('spawn_accepted', { ...mixedCorrection, ...physicalFor(mixedCorrection, 0) }),
    ];
    writeFileSync(mixedFixture.stream, mixedStream.join(''));
    assert.deepEqual(reserveReviewStart({ stateDir: mixedFixture.st, project: mixedFixture.pr, pipelineId: 'multi2-pipeline', identity: mixedCorrection, physical: physicalFor(mixedCorrection, 0), start: () => 'must-not-start' }), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'mixed legacy+physical within one mode fails closed');
    // Mixed single-mode history also fails closed.
    const mixedSingle = freshMulti();
    const mixedSingleInitial = attempt('initial');
    writeFileSync(mixedSingle.stream, row('start_reserved', mixedSingleInitial) + row('spawn_entered', { ...mixedSingleInitial, ...physicalFor(mixedSingleInitial, 0) }));
    assert.deepEqual(foldReviewHistory(readFileSync(mixedSingle.stream, 'utf8').trim().split('\n').map(JSON.parse), mixedSingleInitial), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'single-mode mixed legacy+physical fails closed');

    // MINOR-3: six-event completion lacking exact completion_prepared is denied.
    const strayFixture = freshMulti();
    const strayIdentity = attempt('initial');
    const stray = [
      row('start_reserved', { ...strayIdentity, ...physicalFor(strayIdentity, 0) }), row('spawn_entered', { ...strayIdentity, ...physicalFor(strayIdentity, 0) }), row('spawn_accepted', { ...strayIdentity, ...physicalFor(strayIdentity, 0) }),
      row('spawn_returned', { ...strayIdentity, ...physicalFor(strayIdentity, 0) }), row('review_outcome', { ...strayIdentity, ...physicalFor(strayIdentity, 0), outcome: 'APPROVED' }), row('spawn_entered', { ...strayIdentity, ...physicalFor(strayIdentity, 0) }),
    ];
    writeFileSync(strayFixture.stream, stray.join(''));
    assert.deepEqual(foldReviewHistory(readFileSync(strayFixture.stream, 'utf8').trim().split('\n').map(JSON.parse), strayIdentity), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'six-event completion without completion_prepared is an unknown permutation and is denied');

    // SEC-1: FAILED_TO_START_TRANSIENT is pre-acceptance-only grammar. After an
    // accepted start it must be denied at both the record seam and the fold.
    const sec1Fixture = freshMulti();
    const sec1Identity = attempt('initial');
    const sec1Start = (current, physicalArg) => reserveReviewStart({ stateDir: sec1Fixture.st, project: sec1Fixture.pr, pipelineId: 'multi2-pipeline', identity: current, physical: physicalArg, start: () => 'child' });
    assert.equal(sec1Start(sec1Identity, physicalFor(sec1Identity, 0)).status, 'accepted');
    const sec1Recorded = recordReviewPhysicalOutcome({ stateDir: sec1Fixture.st, project: sec1Fixture.pr, pipelineId: 'multi2-pipeline', identity: sec1Identity, physical: physicalFor(sec1Identity, 0), outcome: 'FAILED_TO_START_TRANSIENT', evidence: {} });
    assert.equal(sec1Recorded.status, 'denied', 'post-acceptance FAILED_TO_START_TRANSIENT outcome record is denied (pre-acceptance-only grammar)');
    assert.equal(sec1Recorded.code, 'REVIEW_PHYSICAL_OUTCOME_INVALID');
    const sec1Fold = freshMulti();
    const sec1FoldIdentity = attempt('initial');
    const sec1Rows = [
      row('start_reserved', { ...sec1FoldIdentity, ...physicalFor(sec1FoldIdentity, 0) }), row('spawn_entered', { ...sec1FoldIdentity, ...physicalFor(sec1FoldIdentity, 0) }), row('spawn_accepted', { ...sec1FoldIdentity, ...physicalFor(sec1FoldIdentity, 0) }),
      row('spawn_returned', { ...sec1FoldIdentity, ...physicalFor(sec1FoldIdentity, 0) }), row('physical_outcome', { ...sec1FoldIdentity, ...physicalFor(sec1FoldIdentity, 0), outcome: 'FAILED_TO_START_TRANSIENT' }),
    ];
    writeFileSync(sec1Fold.stream, sec1Rows.join(''));
    assert.deepEqual(foldReviewHistory(readFileSync(sec1Fold.stream, 'utf8').trim().split('\n').map(JSON.parse), sec1FoldIdentity), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'accepted 5-event FAILED_TO_START_TRANSIENT is an unknown permutation and is denied');
  } finally { rmSync(multiState, { recursive: true, force: true }); rmSync(multiProject, { recursive: true, force: true }); }

  console.log('review lifecycle Plan062 tests passed');
} finally {
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
