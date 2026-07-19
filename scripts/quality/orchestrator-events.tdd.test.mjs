#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transitionReviewOutcome } from './orchestrator-events.mjs';

const identity = { planId: 'plan-038', runFamilyId: 'family-038', reviewGate: 'code-review' };
const finding = (findingId) => ({
  findingId, relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate',
  title: `Deferred ${findingId}`, shortDescription: 'Structured finding deferred from current gate.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.',
});
const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-b3-'));
try {
  const events = []; let spawns = 0;
  const result = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [finding('F-b3-1'), finding('F-b3-2')] }, appendOutcome: () => events.push('outcome'), appendRoute: () => events.push('route'), spawn: () => { spawns += 1; } });
  assert.equal(result.status, 'CLOSED_WITH_TBR');
  assert.deepEqual(readdirSync(path.join(root, 'wiki/tbr/items')).length, 2, 'all immediate items persist before continuation');
  assert.deepEqual(events, ['outcome', 'route']);
  assert.equal(spawns, 1);

  const blockedEvents = []; let blockedSpawns = 0;
  const blocked = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [finding('F-blocked')] }, write: () => ({ ok: false, code: 'TBR_PATH_INVALID' }), appendOutcome: () => blockedEvents.push('outcome'), appendRoute: () => blockedEvents.push('route'), spawn: () => { blockedSpawns += 1; } });
  assert.deepEqual(blocked, { status: 'TBR_WRITE_BLOCKED', code: 'TBR_PATH_INVALID' });
  assert.deepEqual(blockedEvents, []);
  assert.equal(blockedSpawns, 0, 'writer failure cannot produce outcome-derived spawn');

  const malformedEvents = [];
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [{ id: 'legacy' }] }, appendOutcome: () => malformedEvents.push('outcome') }), { status: 'TBR_WRITE_BLOCKED', code: 'REVIEW_FINDING_INVALID' });
  assert.deepEqual(malformedEvents, [], 'exact validation happens before writer/event boundary');

  const repaired = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [finding('F-b3-1'), finding('F-b3-2')] }, appendOutcome: () => true, appendRoute: () => true });
  assert.equal(repaired.status, 'CLOSED_WITH_TBR', 'retry converges on stable items and full index repair');
} finally { rmSync(root, { recursive: true, force: true }); }

console.log('orchestrator-events.mjs tests passed');
