#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { admitReviewDispatch, executeHostAgentBoundary } from './index.ts';
import { closeReviewWithTbr, validateReviewOutcome, writeTbr } from '../../scripts/quality/tbr.mjs';
import { reserveReviewStart, recordReviewCompletion } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';

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

const rejected = validateReviewOutcome({ verdict: 'CHANGES_REQUESTED', findings: [
  { id: 'F-1', relation: 'existing', class: 'Product', reproduced: true, causal: true, severity: 'High' },
  { id: 'F-2', relation: 'new', class: 'Product', reproduced: true, causal: true, severity: 'High' },
] });
assert.equal(rejected.ok, true);
assert.deepEqual(rejected.value.active.map((item) => item.id), ['F-1']);
assert.deepEqual(rejected.value.immediateTbr.map((item) => item.id), ['F-2']);
assert.equal(validateReviewOutcome({ verdict: 'CHANGES_REQUESTED', findings: [{ id: 'F-3', relation: 'fix-induced', class: 'SharedContract', reproduced: true, causal: true, severity: 'Critical' }] }).value.active.length, 1);
assert.equal(validateReviewOutcome({ verdict: 'CHANGES_REQUESTED', findings: [{ id: 'F-4', relation: 'fix-induced', class: 'Product', reproduced: false, causal: true, severity: 'Critical' }] }).ok, false);

const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-'));
try {
  const first = writeTbr({ root, identity, findings: rejected.value.immediateTbr });
  assert.equal(first.ok, true);
  const duplicate = writeTbr({ root, identity, findings: rejected.value.immediateTbr });
  assert.equal(duplicate.created, false);
  const secondFinding = { ...rejected.value.immediateTbr[0], findingId: 'F-3', id: 'F-3', title: 'Second finding' };
  assert.equal(writeTbr({ root, identity, findings: [secondFinding] }).ok, true);
  assert.equal(writeTbr({ root, identity, findings: [{ ...rejected.value.immediateTbr[0], title: 'Renamed finding' }] }).ok, true);
  const itemFiles = readdirSync(path.join(root, 'wiki/tbr/items')).sort();
  assert.equal(itemFiles.length, 2, 'stable ID lookup must ignore retry slug changes');
  const index = readFileSync(path.join(root, 'wiki/tbr/index.md'), 'utf8');
  assert.match(index, /F-2/);
  assert.match(index, /Second finding/);
  assert.ok(index.indexOf('Second finding') < index.indexOf('F-2') || index.indexOf('F-2') < index.indexOf('Second finding'));
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
    const closed = closeReviewWithTbr({ root, identity: review2, outcome: { verdict: 'CHANGES_REQUESTED', findings: rejected.value.active }, write: writeTbr, complete: (outcome) => recordReviewCompletion({ stateDir: eventsRoot, project, pipelineId, identity: review2, outcome }) });
    assert.equal(closed.status, 'CLOSED_WITH_TBR');
  } finally { rmSync(eventsRoot, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
  const failed = closeReviewWithTbr({ root, identity, outcome: { verdict: 'CHANGES_REQUESTED', findings: rejected.value.active }, write: () => ({ ok: false }) });
  assert.deepEqual(failed, { status: 'TBR_WRITE_BLOCKED' });
  assert.equal(closeReviewWithTbr({ root, identity, outcome: { verdict: 'COMPLETE', findings: [{ id: 'F-prose', relation: 'new', class: 'Product', reproduced: true, causal: true, severity: 'Critical' }] }, write: writeTbr }).status, 'accepted');
} finally { rmSync(root, { recursive: true, force: true }); }

console.log('review budget TBR tests passed');
