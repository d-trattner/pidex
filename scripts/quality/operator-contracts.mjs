#!/usr/bin/env node
// Conservative Phase 3 operator-contract helpers for PDQ trace classification.

export const CONTRACTS = {
  OpPreflight: {
    contract_id: 'operator.OpPreflight.finalized-preflight',
    required_when: 'post-Phase-2B pipeline_started exists',
    allowed_skip_reasons: ['continuation-existing-plan', 'already-covered'],
    resolution_options: ['record finalized OpPreflight', 'record valid OpDecision skip', 'correct expectation contract'],
  },
  OpQualityReview: {
    contract_id: 'operator.OpQualityReview.terminal-pdq',
    required_when: 'terminal pipeline event exists',
    allowed_skip_reasons: ['auto-pdq-disabled', 'optional-hooks-disabled', 'terminal-event-backfill', 'report-logic-regeneration-pending'],
    resolution_options: ['restore auto-PDQ hook', 'record valid OpDecision skip/manual evidence', 'backfill OpQualityReview', 'correct expectation contract'],
  },
  OpReview: {
    contract_id: 'operator.OpReview.review-agent-evidence',
    required_when: 'post-Phase-2B review-agent metric row exists',
    allowed_skip_reasons: ['not-applicable', 'already-covered', 'docs-only', 'manual-review-done-outside-pidex', 'provider-quota-limited', 'operator-approved-risk', 'duplicate-signal'],
    resolution_options: ['restore review event emission', 'record valid OpDecision skip/manual review evidence', 'run the review agent', 'correct expectation contract'],
  },
  OpGate: {
    contract_id: 'operator.OpGate.user-gate-evidence',
    required_when: 'metric row contains a real gate',
    allowed_skip_reasons: ['not-applicable', 'already-covered', 'no-ui-change', 'manual-review-done-outside-pidex', 'operator-approved-risk', 'expectation-wrong'],
    resolution_options: ['restore gate event emission', 'record valid OpDecision skip/manual gate evidence', 'backfill gate evidence', 'correct expectation contract'],
  },
};

const SKIP_DECISION_TYPES = new Set(['skip_step', 'manual_evidence', 'backfill_evidence']);

function planMatches(row, plan) {
  return [plan, null, undefined, ''].includes(row?.plan_key);
}

function targetStepMatches(row, expected) {
  if (!expected) return true;
  const target = String(row?.target_step || '').toLowerCase();
  if (!target) return true;
  return target === String(expected).toLowerCase();
}

export function validDecisionFor(decisions, { plan, operator_type, target_step = null }) {
  const contract = CONTRACTS[operator_type];
  if (!contract) return null;
  return (decisions || []).find((row) => row?.operator_type === 'OpDecision'
    && SKIP_DECISION_TYPES.has(row.decision_type)
    && row.target_operator === operator_type
    && planMatches(row, plan)
    && targetStepMatches(row, target_step)
    && contract.allowed_skip_reasons.includes(row.reason)) || null;
}

export function validSkipFinding(decision, { plan, operator_type, evidence = null, extra = {} }) {
  const contract = CONTRACTS[operator_type] || {};
  return {
    type: 'valid_skip',
    operator_type,
    plan_key: plan,
    confidence: decision?.confidence || 'medium',
    severity: 'info',
    reason: `Operator decision ${decision?.decision_type || 'skip'} with reason ${decision?.reason || 'unknown'} satisfies ${operator_type} contract.`,
    evidence: decision?.physical_action?.evidence_path || decision?.evidence_path || evidence,
    contract_id: contract.contract_id || null,
    expected_when: contract.required_when || null,
    observed_state: 'valid_operator_decision',
    allowed_skip_reasons: contract.allowed_skip_reasons || [],
    resolution_options: contract.resolution_options || [],
    decision_evidence: decision || null,
    ...extra,
  };
}

export function decorateContractFinding(finding) {
  const contract = CONTRACTS[finding?.operator_type];
  if (!contract) return finding;
  return {
    ...finding,
    contract_id: contract.contract_id,
    expected_when: contract.required_when,
    observed_state: finding.type || 'missing',
    allowed_skip_reasons: contract.allowed_skip_reasons,
    resolution_options: contract.resolution_options,
  };
}
