#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Value } from 'typebox/value';
import { CONTRACTS, analyzeContractOverrides, loadContracts, resetContractCache, validDecisionFor } from './operator-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OVERRIDE_SCHEMA = JSON.parse(readFileSync(path.join(ROOT, 'config/operator-contracts.schema.json'), 'utf8'));
function schemaAccepts(value) { return Value.Check(OVERRIDE_SCHEMA, value); }
function runtimeAccepts(value) { return analyzeContractOverrides(value).errors.length === 0; }

assert.ok(CONTRACTS.OpPreflight.allowed_skip_reasons.includes('continuation-existing-plan'));
assert.ok(CONTRACTS.OpQualityReview.allowed_skip_reasons.includes('terminal-event-backfill'));

const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-contracts-v2-'));
try {
  mkdirSync(path.join(root, 'config'), { recursive: true });
  const legacy = { version: 1, overrides: [{ id: 'legacy-required', status: 'approved', operator_type: 'OpQualityReview', contract_id: CONTRACTS.OpQualityReview.contract_id, approved_by: 'operator', approved_at: '2026-01-01T00:00:00Z', effective_from: '2026-01-01T00:00:00Z', historical_reclassification: 'future-only', contract_patch: { required_when: 'never' } }] };
  const local = path.join(root, 'config/operator-contracts.local.json');
  writeFileSync(local, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
  const before = readFileSync(local, 'utf8');
  resetContractCache();
  const loadedLegacy = loadContracts(root);
  assert.equal(loadedLegacy.OpQualityReview.required_when, CONTRACTS.OpQualityReview.required_when);
  assert.equal(readFileSync(local, 'utf8'), before, 'legacy quarantine must not rewrite local state');
  const legacyDiagnostics = analyzeContractOverrides(legacy).diagnostics;
  assert.deepEqual(legacyDiagnostics.map((x) => x.code), ['CONTRACT_OVERRIDE_V1_QUARANTINED']);
  assert.match(legacyDiagnostics[0].message, /legacy-required operator OpQualityReview .*required_when/);

  const future = { version: 2, overrides: [{ timestamp: '2026-01-01T00:00:00Z', id: 'future', status: 'approved', operator_type: 'OpQualityReview', contract_id: CONTRACTS.OpQualityReview.contract_id, reason: 'future test', approved_by: 'operator', approved_at: '2026-01-01T00:00:00Z', effective_from: '2999-01-01T00:00:00Z', historical_reclassification: 'future-only', contract_patch: { allowed_skip_reasons: ['future-only-reason'] } }] };
  writeFileSync(local, `${JSON.stringify(future, null, 2)}\n`, 'utf8');
  resetContractCache();
  assert.equal(loadContracts(root).OpQualityReview.allowed_skip_reasons.includes('future-only-reason'), false);

  const active = structuredClone(future);
  active.overrides[0].id = 'active';
  active.overrides[0].effective_from = '2026-01-01T00:00:00Z';
  active.overrides[0].contract_patch.allowed_skip_reasons = [...CONTRACTS.OpQualityReview.allowed_skip_reasons, 'manual-terminal-import'];
  assert.equal(schemaAccepts(active), true);
  assert.equal(runtimeAccepts(active), true);
  const pendingWithoutHistory = { version: 2, overrides: [{ ...active.overrides[0], status: 'pending', approved_by: undefined, approved_at: undefined, effective_from: undefined, historical_reclassification: undefined }] };
  assert.equal(schemaAccepts(pendingWithoutHistory), false);
  assert.equal(runtimeAccepts(pendingWithoutHistory), false);
  const mismatchedContract = structuredClone(active); mismatchedContract.overrides[0].contract_id = 'wrong';
  assert.equal(schemaAccepts(mismatchedContract), false);
  assert.equal(runtimeAccepts(mismatchedContract), false);
  const oversizedSource = structuredClone(active); oversizedSource.overrides[0].source_decision_id = 'x'.repeat(161);
  assert.equal(schemaAccepts(oversizedSource), false);
  assert.equal(runtimeAccepts(oversizedSource), false);
  const malformedDate = structuredClone(active); malformedDate.overrides[0].approved_at = '2026';
  assert.equal(schemaAccepts(malformedDate), false);
  assert.equal(runtimeAccepts(malformedDate), false);
  writeFileSync(local, `${JSON.stringify(active, null, 2)}\n`, 'utf8');
  resetContractCache();
  const contracts = loadContracts(root);
  assert.ok(contracts.OpQualityReview.allowed_skip_reasons.includes('manual-terminal-import'));
  const decisions = [{ operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'skip_step', target_operator: 'OpQualityReview', reason: 'manual-terminal-import' }];
  assert.equal(validDecisionFor(decisions, { root, plan: 'plan-004', operator_type: 'OpQualityReview' })?.reason, 'manual-terminal-import');

  for (const [name, mutate, code] of [
    ['unknown-key', (x) => { x.overrides[0].contract_patch = { required_when: 'never' }; }, 'CONTRACT_OVERRIDE_PATCH_UNSUPPORTED'],
    ['wrong-contract', (x) => { x.overrides[0].contract_id = 'wrong'; }, 'CONTRACT_OVERRIDE_CONTRACT_MISMATCH'],
    ['wrong-operator', (x) => { x.overrides[0].operator_type = 'OpGate'; }, 'CONTRACT_OVERRIDE_OPERATOR_UNSUPPORTED'],
  ]) {
    const invalid = structuredClone(active); mutate(invalid);
    const result = analyzeContractOverrides(invalid);
    assert.ok(result.errors.some((x) => x.code === code), `${name}: ${JSON.stringify(result)}`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
  resetContractCache();
}
console.log('quality operator-contracts.mjs tests passed');
