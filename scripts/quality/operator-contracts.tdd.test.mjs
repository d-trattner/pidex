#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONTRACTS, analyzeContractOverrides, loadContracts, resetContractCache, validDecisionFor } from './operator-contracts.mjs';

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
  assert.deepEqual(analyzeContractOverrides(legacy).diagnostics.map((x) => x.code), ['CONTRACT_OVERRIDE_V1_QUARANTINED']);

  const future = { version: 2, overrides: [{ id: 'future', status: 'approved', operator_type: 'OpQualityReview', contract_id: CONTRACTS.OpQualityReview.contract_id, reason: 'future test', approved_by: 'operator', approved_at: '2026-01-01T00:00:00Z', effective_from: '2999-01-01T00:00:00Z', historical_reclassification: 'future-only', contract_patch: { allowed_skip_reasons: ['future-only-reason'] } }] };
  writeFileSync(local, `${JSON.stringify(future, null, 2)}\n`, 'utf8');
  resetContractCache();
  assert.equal(loadContracts(root).OpQualityReview.allowed_skip_reasons.includes('future-only-reason'), false);

  const active = structuredClone(future);
  active.overrides[0].id = 'active';
  active.overrides[0].effective_from = '2026-01-01T00:00:00Z';
  active.overrides[0].contract_patch.allowed_skip_reasons = [...CONTRACTS.OpQualityReview.allowed_skip_reasons, 'manual-terminal-import'];
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
