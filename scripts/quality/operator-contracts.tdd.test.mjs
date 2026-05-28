#!/usr/bin/env node
import assert from 'node:assert/strict';
import { CONTRACTS, decorateContractFinding, validDecisionFor, validSkipFinding } from './operator-contracts.mjs';

assert.ok(CONTRACTS.OpPreflight.allowed_skip_reasons.includes('continuation-existing-plan'));
assert.ok(CONTRACTS.OpQualityReview.allowed_skip_reasons.includes('terminal-event-backfill'));

const decisions = [
  { operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'skip_step', target_operator: 'OpPreflight', reason: 'continuation-existing-plan', approved_by: 'operator', confidence: 'medium' },
  { operator_type: 'OpDecision', plan_key: 'plan-004', decision_type: 'skip_step', target_operator: 'OpQualityReview', reason: 'continuation-existing-plan', approved_by: 'operator' },
];

const pre = validDecisionFor(decisions, { plan: 'plan-004', operator_type: 'OpPreflight' });
assert.equal(pre.target_operator, 'OpPreflight');
assert.equal(validDecisionFor(decisions, { plan: 'plan-004', operator_type: 'OpQualityReview' }), null);

const finding = validSkipFinding(pre, { plan: 'plan-004', operator_type: 'OpPreflight' });
assert.equal(finding.type, 'valid_skip');
assert.equal(finding.severity, 'info');
assert.equal(finding.contract_id, 'operator.OpPreflight.finalized-preflight');
assert.equal(finding.observed_state, 'valid_operator_decision');

const decorated = decorateContractFinding({ type: 'instrumentation_missing', operator_type: 'OpQualityReview', plan_key: 'plan-004' });
assert.equal(decorated.contract_id, 'operator.OpQualityReview.terminal-pdq');
assert.ok(decorated.resolution_options.includes('restore auto-PDQ hook'));

console.log('quality operator-contracts.mjs tests passed');
