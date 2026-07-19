#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { admitReviewDispatch, executeHostAgentBoundary, executeProjectPipelineReviewBoundary } from './index.ts';
import { foldReviewHistory, normalizeReviewVerdict } from './review-budget.ts';
import { closeReviewWithTbr, validateReviewOutcome, writeTbr } from '../../scripts/quality/tbr.mjs';
import { reserveReviewStart, recordReviewCompletion } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
import '../../scripts/quality/tbr.tdd.test.mjs';

const identity = { runFamilyId: 'family-038', planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-1' };
assert.equal(admitReviewDispatch('pidex-code-reviewer', identity, { status: 'allowed' }).allowed, true);
assert.deepEqual(admitReviewDispatch('pidex-code-reviewer', identity, { status: 'allowed' }), { allowed: true });
assert.equal(admitReviewDispatch('pidex-implementer', { ...identity, reviewMode: 'initial' }, { status: 'allowed' }).allowed, false);
assert.equal(admitReviewDispatch('pidex-code-reviewer', { ...identity, reviewMode: 'review1' }, { status: 'terminal' }).allowed, false);
assert.equal(admitReviewDispatch('pidex-planner', {}, { status: 'allowed' }).allowed, true);
assert.equal(admitReviewDispatch('pidex-planner', { ...identity, reviewMode: 'correction1' }, { status: 'allowed' }).allowed, false);
assert.equal(admitReviewDispatch('pidex-implementer', { ...identity, reviewMode: 'correction1' }, { status: 'allowed' }).allowed, true);

const hostState = mkdtempSync(path.join(os.tmpdir(), 'pidex-host-review-state-'));
const hostProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-host-review-project-'));
let hostChildren = 0;
const hostOptions = {
  agentCwd: hostProject,
  reviewLifecycle: { stateDir: hostState, pipelineId: 'host-pipeline' },
  loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
  resolveSandboxState: () => ({ enabled: false }),
  runConfigured: async (params) => { hostChildren += 1; params.onProcessStarted?.(); return { agent: params.agent, provider: 'pi', exitCode: 0, finalText: 'done', stderr: '' }; },
};
try {
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'review' }, hostOptions), /REVIEW_IDENTITY_INVALID/);
  assert.equal(hostChildren, 0);
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-security', task: 'unsupported review', ...identity, reviewGate: 'security-review' }, hostOptions), /REVIEW_IDENTITY_INVALID/);
  assert.equal(hostChildren, 0, 'unsupported host gate must create zero children');
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'correction', reviewMode: 'correction1' }, hostOptions), /REVIEW_IDENTITY_INVALID/);
  assert.equal(hostChildren, 0);
  const hosted = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'review', ...identity }, hostOptions);
  assert.equal(hosted.exitCode, 0);
  assert.equal(hostChildren, 1);
  const hostRows = readFileSync(path.join(hostState, 'pipeline-events', path.basename(hostProject), 'host-pipeline.jsonl'), 'utf8');
  assert.match(hostRows, /start_reserved/);
  assert.match(hostRows, /spawn_entered/);
  assert.match(hostRows, /spawn_accepted/);
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'duplicate', ...identity }, hostOptions), /REVIEW_DISPATCH_RESUMED/);
  assert.equal(hostChildren, 1, 'duplicate host delivery must create zero second child');
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'ordinary planning' }, hostOptions);
  assert.equal(hostChildren, 2, 'bare non-review calls remain compatible');
} finally { rmSync(hostState, { recursive: true, force: true }); rmSync(hostProject, { recursive: true, force: true }); }

const immediateFinding = { findingId: 'F-2', relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate', title: 'Deferred finding', shortDescription: 'New finding deferred.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot reject.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.' };
const rejected = validateReviewOutcome({ verdict: 'REJECTED', findings: [
  { findingId: 'F-1', relation: 'assigned', class: 'Product', reproductionState: 'reproduced', causedByCorrection: true, severity: 'High', disposition: 'active' },
  immediateFinding,
] }, identity.reviewGate);
assert.equal(rejected.ok, true);
assert.deepEqual(rejected.value.active.map((item) => item.findingId), ['F-1']);
assert.deepEqual(rejected.value.immediateTbr.map((item) => item.findingId), ['F-2']);
assert.equal(validateReviewOutcome({ verdict: 'REJECTED', findings: [{ findingId: 'F-3', relation: 'fix_induced', class: 'SharedContract', reproductionState: 'reproduced', causedByCorrection: true, severity: 'Critical', disposition: 'active' }] }, identity.reviewGate).value.active.length, 1);
assert.equal(validateReviewOutcome({ verdict: 'REJECTED', findings: [{ ...immediateFinding, findingId: 'F-4', relation: 'fix_induced', causedByCorrection: true, severity: 'Critical', reproductionState: 'not_reproduced' }] }, identity.reviewGate).ok, false);

const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-'));
try {
  const first = writeTbr({ root, identity, findings: rejected.value.immediateTbr });
  assert.equal(first.ok, true);
  const duplicate = writeTbr({ root, identity, findings: rejected.value.immediateTbr });
  assert.equal(duplicate.created, false);
  const secondFinding = { ...rejected.value.immediateTbr[0], findingId: 'F-3', title: 'Second finding' };
  assert.equal(writeTbr({ root, identity, findings: [secondFinding] }).ok, true);
  assert.equal(writeTbr({ root, identity, findings: [{ ...rejected.value.immediateTbr[0], title: 'Renamed finding' }] }).ok, true);
  const itemFiles = readdirSync(path.join(root, 'wiki/tbr/items')).sort();
  assert.equal(itemFiles.length, 2, 'stable ID lookup must ignore retry slug changes');
  const index = readFileSync(path.join(root, 'wiki/tbr/index.md'), 'utf8');
  assert.match(index, /Deferred finding/);
  assert.match(index, /Second finding/);
  assert.ok(index.indexOf('Second finding') < index.indexOf('Deferred finding') || index.indexOf('Deferred finding') < index.indexOf('Second finding'));
  assert.match(index, /TBR-/);
  const eventsRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-events-'));
  const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-project-'));
  const pipelineId = 'pipeline-038';
  try {
    for (const [reviewMode, outcome] of [['initial', 'CHANGES_REQUESTED'], ['correction1', 'READY_FOR_REVIEW'], ['review1', 'CHANGES_REQUESTED'], ['correction2', 'SUBMITTED']] ) {
      const current = { ...identity, reviewMode, attemptId: `attempt-${reviewMode}` };
      assert.equal(reserveReviewStart({ stateDir: eventsRoot, project, pipelineId, identity: current, start: () => 'started' }).status, 'accepted');
      assert.notEqual(recordReviewCompletion({ stateDir: eventsRoot, project, pipelineId, identity: current, outcome }).status, 'denied');
    }
    const review2 = { ...identity, reviewMode: 'review2', attemptId: 'attempt-review2' };
    assert.equal(reserveReviewStart({ stateDir: eventsRoot, project, pipelineId, identity: review2, start: () => 'started' }).status, 'accepted');
    const closed = closeReviewWithTbr({ root, identity: review2, outcome: { verdict: 'REJECTED', findings: rejected.value.active }, write: writeTbr, complete: (outcome) => recordReviewCompletion({ stateDir: eventsRoot, project, pipelineId, identity: review2, outcome }) });
    assert.equal(closed.status, 'CLOSED_WITH_TBR');
  } finally { rmSync(eventsRoot, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
  const failed = closeReviewWithTbr({ root, identity, outcome: { verdict: 'REJECTED', findings: rejected.value.active }, write: () => ({ ok: false }) });
  assert.deepEqual(failed, { status: 'TBR_WRITE_BLOCKED' });
  assert.equal(closeReviewWithTbr({ root, identity, outcome: { verdict: 'APPROVED', findings: [{ id: 'F-prose', relation: 'new', class: 'Product', reproduced: true, causal: true, severity: 'Critical' }] }, write: writeTbr }).status, 'accepted');
} finally { rmSync(root, { recursive: true, force: true }); }

const gateVerdicts = {
  critic: { accepted: ['APPROVED', 'APPROVED_WITH_COMMENTS'], rejected: ['REJECTED'] },
  'code-review': { accepted: ['APPROVED', 'APPROVED_WITH_COMMENTS'], rejected: ['REJECTED'] },
  security: { accepted: ['APPROVED'], rejected: ['APPROVED_WITH_CONTROLS', 'REJECTED'] },
  qa: { accepted: ['COMPLETE'], rejected: ['FAILED'] },
};
for (const [gate, verdicts] of Object.entries(gateVerdicts)) {
  for (const verdict of verdicts.accepted) {
    assert.equal(normalizeReviewVerdict(gate, verdict), 'APPROVED');
    assert.equal(validateReviewOutcome({ verdict, findings: [] }, gate).ok, true);
  }
  for (const verdict of verdicts.rejected) {
    assert.equal(normalizeReviewVerdict(gate, verdict), 'CHANGES_REQUESTED');
    assert.equal(validateReviewOutcome({ verdict, findings: [{ findingId: 'F-gate', relation: 'assigned', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'active' }] }, gate).value.verdict, 'CHANGES_REQUESTED');
  }
  for (const otherGate of Object.keys(gateVerdicts)) for (const verdict of [...gateVerdicts[otherGate].accepted, ...gateVerdicts[otherGate].rejected]) {
    if (![...verdicts.accepted, ...verdicts.rejected].includes(verdict)) assert.equal(normalizeReviewVerdict(gate, verdict), null);
  }
  assert.equal(normalizeReviewVerdict(gate, 'APPROVED '), null);
}

const historyRow = (event_type, metadata) => ({ event_type, metadata });
const otherGateRows = ['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned'].map((event_type) => historyRow(event_type, { ...identity, reviewGate: 'critic', attemptId: 'critic-1' }));
otherGateRows.push(historyRow('review_outcome', { ...identity, reviewGate: 'critic', attemptId: 'critic-1', outcome: 'APPROVED' }));
assert.deepEqual(foldReviewHistory(otherGateRows, identity), { status: 'allowed', nextMode: 'initial' });
assert.deepEqual(foldReviewHistory([...otherGateRows, historyRow('not-an-event', { ...identity })], identity), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' });

const ppState = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-review-state-'));
const ppProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-review-project-'));
let ppChildren = 0;
const ppLifecycle = { stateDir: ppState, pipelineId: 'pp-pipeline', project: ppProject };
try {
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer' }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), /REVIEW_IDENTITY_INVALID/);
  assert.equal(ppChildren, 0);
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-security', ...identity, reviewGate: 'security-review' }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), /REVIEW_IDENTITY_INVALID/);
  assert.equal(ppChildren, 0, 'unsupported Project Pipeline gate must create zero children');
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-implementer', ...identity }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), /REVIEW_DISPATCH_DENIED/);
  assert.equal(ppChildren, 0);
  assert.equal(executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer', ...identity }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), 'child');
  assert.equal(ppChildren, 1);
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer', ...identity }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), /REVIEW_DISPATCH_RESUMED/);
  assert.equal(ppChildren, 1, 'duplicate Project Pipeline delivery must create zero second child');
} finally { rmSync(ppState, { recursive: true, force: true }); rmSync(ppProject, { recursive: true, force: true }); }

console.log('review budget TBR tests passed');
