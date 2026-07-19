#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { admitReviewDispatch } from './index.ts';
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
  assert.match(readFileSync(path.join(root, 'wiki/tbr/index.md'), 'utf8'), /TBR-/);
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
