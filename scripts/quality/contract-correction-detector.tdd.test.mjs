#!/usr/bin/env node
import assert from 'node:assert/strict';
import { CONTRACTS } from './operator-contracts.mjs';
import { detectContractCorrections } from './contract-correction-detector.mjs';

const report = { summary: { operator_trace: { findings: [
  { type: 'instrumentation_missing', operator_type: 'OpQualityReview', contract_id: CONTRACTS.OpQualityReview.contract_id, reason: 'A terminal pipeline event exists', plan_key: 'plan-001' },
  { type: 'instrumentation_missing', operator_type: 'OpQualityReview', contract_id: CONTRACTS.OpQualityReview.contract_id, reason: 'A terminal pipeline event exists', plan_key: 'plan-002' },
  { type: 'instrumentation_missing', operator_type: 'OpQualityReview', contract_id: CONTRACTS.OpQualityReview.contract_id, reason: 'A terminal pipeline event exists', plan_key: 'plan-003' },
] } } };
assert.equal(detectContractCorrections({ report, reportFile: '/tmp/a.json', opDecisions: [] }).length, 0, 'required_when proposals are unsupported');

const decisions = [1, 2].map((n) => ({ operator_type: 'OpDecision', decision_type: 'skip_step', target_operator: 'OpQualityReview', reason: 'manual-terminal-import', confidence: 'high', plan_key: `plan-00${n}` }));
const first = detectContractCorrections({ report, reportFile: '/tmp/a.json', opDecisions: decisions, contracts: CONTRACTS });
const second = detectContractCorrections({ report, reportFile: '/different/report.json', opDecisions: decisions.map((x) => ({ ...x, timestamp: 'later' })), contracts: CONTRACTS });
assert.equal(first.length, 1);
assert.equal(first[0].id, second[0].id, 'semantic identity must ignore report path/timestamp');
assert.deepEqual(Object.keys(first[0].proposed_patch), ['allowed_skip_reasons']);
assert.equal(first[0].operator_type, 'OpQualityReview');

const forbiddenOperator = decisions.map((x) => ({ ...x, target_operator: 'OpGate' }));
assert.equal(detectContractCorrections({ report, opDecisions: forbiddenOperator, contracts: CONTRACTS }).length, 0);
console.log('quality contract-correction-detector.mjs tests passed');
