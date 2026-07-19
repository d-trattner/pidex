#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main, transitionReviewOutcome } from './orchestrator-events.mjs';

const identity = { planId: 'plan-038', runFamilyId: 'family-038', reviewGate: 'code-review' };
const finding = (findingId) => ({
  findingId, relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate',
  title: `Deferred ${findingId}`, shortDescription: 'Structured finding deferred from current gate.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.',
});
const active = { findingId: 'F-active', relation: 'assigned', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'active' };
const reorderKeys = (value) => Array.isArray(value) ? value.map(reorderKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorderKeys(child)])) : value;
const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-b3-'));
try {
  const events = []; let spawns = 0;
  const result = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-b3-1'), finding('F-b3-2')] }, appendOutcome: () => events.push('outcome'), appendRoute: () => events.push('route'), spawn: () => { spawns += 1; } });
  assert.equal(result.status, 'CLOSED_WITH_TBR');
  assert.deepEqual(readdirSync(path.join(root, 'wiki/tbr/items')).length, 2, 'all immediate items persist before continuation');
  assert.deepEqual(events, ['outcome', 'route']);
  assert.equal(spawns, 1);

  const blockedEvents = []; let blockedSpawns = 0;
  const blocked = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-blocked')] }, write: () => ({ ok: false, code: 'TBR_PATH_INVALID' }), appendOutcome: () => blockedEvents.push('outcome'), appendRoute: () => blockedEvents.push('route'), spawn: () => { blockedSpawns += 1; } });
  assert.deepEqual(blocked, { status: 'TBR_WRITE_BLOCKED', code: 'TBR_PATH_INVALID' });
  assert.deepEqual(blockedEvents, []);
  assert.equal(blockedSpawns, 0, 'writer failure cannot produce outcome-derived spawn');
  for (const code of ['TBR_ITEM_INVALID', 'TBR_WRITE_FAILED']) {
    let faultSpawns = 0;
    assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding(`F-${code}`)] }, write: () => ({ ok: false, code }), appendOutcome: () => { throw new Error('event must stay after failed item/index write'); }, spawn: () => { faultSpawns += 1; } }), { status: 'TBR_WRITE_BLOCKED', code });
    assert.equal(faultSpawns, 0);
  }
  let eventSpawns = 0;
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-event-fault')] }, appendOutcome: () => false, appendRoute: () => { throw new Error('route must stay after event'); }, spawn: () => { eventSpawns += 1; } }), { status: 'TBR_WRITE_BLOCKED', code: 'TBR_OUTCOME_APPEND_FAILED' });
  assert.equal(eventSpawns, 0, 'failed event append cannot spawn continuation');

  for (const [name, callbacks, code] of [
    ['missing-outcome', { appendRoute: () => true, spawn: () => true }, 'TBR_OUTCOME_APPEND_FAILED'],
    ['missing-route', { appendOutcome: () => true, spawn: () => true }, 'TBR_ROUTE_APPEND_FAILED'],
    ['missing-spawn', { appendOutcome: () => true, appendRoute: () => true }, 'TBR_SPAWN_FAILED'],
    ['throwing-outcome', { appendOutcome: () => { throw new Error('outcome failure'); }, appendRoute: () => true, spawn: () => true }, 'TBR_OUTCOME_APPEND_FAILED'],
    ['throwing-route', { appendOutcome: () => true, appendRoute: () => { throw new Error('route failure'); }, spawn: () => true }, 'TBR_ROUTE_APPEND_FAILED'],
    ['throwing-spawn', { appendOutcome: () => true, appendRoute: () => true, spawn: () => { throw new Error('spawn failure'); } }, 'TBR_SPAWN_FAILED'],
  ]) assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding(`F-${name}`)] }, ...callbacks }), { status: 'TBR_WRITE_BLOCKED', code }, `${name} is a bounded transition failure`);

  const semanticOutcomes = new Map(); let retryRoutes = 0;
  const appendOnce = (value, event) => {
    const existing = semanticOutcomes.get(event.semanticId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value)) return false;
    if (existing) return { ok: true, duplicate: true };
    semanticOutcomes.set(event.semanticId, value); return true;
  };
  const retryOutcome = { verdict: 'REJECTED', findings: [active, finding('F-retry')] };
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: retryOutcome, appendOutcome: appendOnce, appendRoute: () => { retryRoutes += 1; return false; }, spawn: () => true }), { status: 'TBR_WRITE_BLOCKED', code: 'TBR_ROUTE_APPEND_FAILED' });
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: reorderKeys(retryOutcome), appendOutcome: appendOnce, appendRoute: () => { retryRoutes += 1; return true; }, spawn: () => true }).status, 'CLOSED_WITH_TBR', 'key-reordered semantic retry resumes without duplicate');
  assert.equal(semanticOutcomes.size, 1, 'equivalent retry must not append duplicate durable outcome');
  assert.equal(retryRoutes, 2, 'retry resumes route boundary');
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { ...retryOutcome, findings: [active, { ...finding('F-retry'), title: 'Changed durable retry value' }] }, appendOutcome: appendOnce, appendRoute: () => true, spawn: () => true }), { status: 'TBR_WRITE_BLOCKED', code: 'TBR_OUTCOME_APPEND_FAILED' }, 'changed value under current event identity conflicts');

  const zeroSpawn = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-zero-spawn')] }, appendOutcome: () => true, appendRoute: () => true, spawn: () => true });
  assert.equal(zeroSpawn.status, 'CLOSED_WITH_TBR', 'explicit no-op spawn boundary is successful');

  const malformedEvents = [];
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [{ id: 'legacy' }] }, appendOutcome: () => malformedEvents.push('outcome') }), { status: 'TBR_WRITE_BLOCKED', code: 'REVIEW_FINDING_INVALID' });
  assert.deepEqual(malformedEvents, [], 'exact validation happens before writer/event boundary');

  const repaired = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-b3-1'), finding('F-b3-2')] }, appendOutcome: () => true, appendRoute: () => true, spawn: () => true });
  assert.equal(repaired.status, 'CLOSED_WITH_TBR', 'retry converges on stable items and full index repair');
} finally { rmSync(root, { recursive: true, force: true }); }

const dryRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-dry-'));
try {
  assert.equal(main(['--dry-run', '--project', dryRoot, '--pipeline-id', 'dry-038', '--operator-type', 'OpReview', '--gate', 'code-review', '--review-outcome-json', JSON.stringify({ verdict: 'REJECTED', findings: [active, finding('F-dry')] })]), 0);
  assert.equal(existsSync(path.join(dryRoot, 'wiki')), false, '--dry-run must not write local TBR artifact');
} finally { rmSync(dryRoot, { recursive: true, force: true }); }

const cliRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-cli-'));
const cliState = path.resolve('state/orchestrator-events', path.basename(cliRoot));
try {
  const cliOutcome = { verdict: 'REJECTED', findings: [active, finding('F-cli')] };
  const cliArgs = ['--project', cliRoot, '--pipeline-id', 'cli-038', '--run-family-id', 'cli-family-038', '--operator-type', 'OpReview', '--gate', 'code-review', '--review-outcome-json', JSON.stringify(cliOutcome)];
  assert.equal(main(cliArgs), 0);
  assert.equal(main([...cliArgs.slice(0, -1), JSON.stringify(reorderKeys(cliOutcome))]), 0, 'key-reordered CLI retry accepts durable duplicate');
  const cliRows = readFileSync(path.join(cliState, 'cli-038.jsonl'), 'utf8').trim().split('\n');
  assert.equal(cliRows.length, 1, 'CLI JSONL appends semantic review outcome once');
  assert.equal(main([...cliArgs.slice(0, -1), JSON.stringify({ ...cliOutcome, findings: [active, { ...finding('F-cli'), title: 'Changed CLI durable value' }] })]), 1, 'CLI blocks changed semantic duplicate under current event identity');
} finally { rmSync(cliRoot, { recursive: true, force: true }); rmSync(cliState, { recursive: true, force: true }); }

console.log('orchestrator-events.mjs tests passed');
