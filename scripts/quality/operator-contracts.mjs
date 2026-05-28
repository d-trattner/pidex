#!/usr/bin/env node
// Conservative operator-contract helpers for PDQ trace classification.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const CONTRACTS = {
  OpPreflight: { contract_id: 'operator.OpPreflight.finalized-preflight', required_when: 'post-Phase-2B pipeline_started exists', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['continuation-existing-plan', 'already-covered'], resolution_options: ['record finalized OpPreflight', 'record valid OpDecision skip', 'correct expectation contract'] },
  OpQualityReview: { contract_id: 'operator.OpQualityReview.terminal-pdq', required_when: 'terminal pipeline event exists', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['auto-pdq-disabled', 'optional-hooks-disabled', 'terminal-event-backfill', 'report-logic-regeneration-pending'], resolution_options: ['restore auto-PDQ hook', 'record valid OpDecision skip/manual evidence', 'backfill OpQualityReview', 'correct expectation contract'] },
  OpReview: { contract_id: 'operator.OpReview.review-agent-evidence', required_when: 'post-Phase-2B review-agent metric row exists', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['not-applicable', 'already-covered', 'docs-only', 'manual-review-done-outside-pidex', 'provider-quota-limited', 'operator-approved-risk', 'duplicate-signal'], resolution_options: ['restore review event emission', 'record valid OpDecision skip/manual review evidence', 'run the review agent', 'correct expectation contract'] },
  OpGate: { contract_id: 'operator.OpGate.user-gate-evidence', required_when: 'metric row contains a real gate', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['not-applicable', 'already-covered', 'no-ui-change', 'manual-review-done-outside-pidex', 'operator-approved-risk', 'expectation-wrong'], resolution_options: ['restore gate event emission', 'record valid OpDecision skip/manual gate evidence', 'backfill gate evidence', 'correct expectation contract'] },
  OpRoute: { contract_id: 'operator.OpRoute.route-decision-evidence', required_when: 'metric row contains route_to', allowed_decision_types: ['override_route', 'manual_evidence', 'backfill_evidence', 'expectation_correction'], allowed_skip_reasons: ['already-covered', 'duplicate-signal', 'operator-approved-risk', 'expectation-wrong', 'manual-review-done-outside-pidex'], resolution_options: ['restore route event emission', 'record explicit route override decision', 'backfill route evidence', 'correct expectation contract'] },
  OpSpawn: { contract_id: 'operator.OpSpawn.agent-spawn-evidence', required_when: 'agent metric row exists', allowed_decision_types: ['manual_evidence', 'backfill_evidence', 'expectation_correction'], allowed_skip_reasons: ['already-covered', 'duplicate-signal', 'expectation-wrong', 'provider-quota-limited'], resolution_options: ['restore pidex_agent OpSpawn emission', 'backfill/manual evidence for agent run', 'correct expectation contract'] },
  OpContextPack: { contract_id: 'operator.OpContextPack.context-pack-evidence', required_when: 'post-Phase-2B agent metric row exists', allowed_decision_types: ['manual_evidence', 'backfill_evidence', 'expectation_correction'], allowed_skip_reasons: ['already-covered', 'duplicate-signal', 'expectation-wrong', 'provider-quota-limited'], resolution_options: ['restore context-pack event emission', 'record manual context-pack evidence', 'correct expectation contract'] },
};

const DEFAULT_DECISION_TYPES = ['skip_step', 'manual_evidence', 'backfill_evidence'];
let cachedRoot = null;
let cachedContracts = null;

function mergeContract(base, override) {
  return { ...(base || {}), ...(override || {}) };
}

export function validateContractOverrides(parsed) {
  const errors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ['override file must be a JSON object'];
  if (parsed.version == null) errors.push('missing version');
  if (!Array.isArray(parsed.overrides)) errors.push('overrides must be an array');
  for (const [index, row] of (parsed.overrides || []).entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(`overrides[${index}] must be an object`); continue; }
    for (const key of ['id', 'status', 'operator_type']) if (!row[key]) errors.push(`overrides[${index}] missing ${key}`);
    if (row.status && !['pending', 'approved', 'rejected', 'superseded'].includes(row.status)) errors.push(`overrides[${index}] invalid status`);
    if (row.status === 'approved' && !row.approved_by) errors.push(`overrides[${index}] approved override missing approved_by`);
  }
  return errors;
}

export function loadContracts(root = ROOT) {
  const resolvedRoot = path.resolve(root || ROOT);
  if (cachedRoot === resolvedRoot && cachedContracts) return cachedContracts;
  const merged = Object.fromEntries(Object.entries(CONTRACTS).map(([k, v]) => [k, { ...v }]));
  const file = path.join(resolvedRoot, 'config', 'operator-contracts.local.json');
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const errors = validateContractOverrides(parsed);
    if (errors.length) throw new Error(`Invalid operator-contracts.local.json: ${errors.join('; ')}`);
    for (const row of parsed.overrides || []) {
      if (row.status !== 'approved') continue;
      const current = merged[row.operator_type] || {};
      const patch = row.contract_patch && typeof row.contract_patch === 'object' && !Array.isArray(row.contract_patch) ? row.contract_patch : {};
      merged[row.operator_type] = mergeContract(current, patch);
    }
  }
  cachedRoot = resolvedRoot;
  cachedContracts = merged;
  return merged;
}

export function resetContractCache() { cachedRoot = null; cachedContracts = null; }
function contractFor(operatorType) { return loadContracts()[operatorType]; }
function planMatches(row, plan) { return [plan, null, undefined, ''].includes(row?.plan_key); }
function targetStepMatches(row, expected) { if (!expected) return true; const target = String(row?.target_step || '').toLowerCase(); if (!target) return true; return target === String(expected).toLowerCase(); }

export function validDecisionFor(decisions, { plan, operator_type, target_step = null }) {
  const contract = contractFor(operator_type);
  if (!contract) return null;
  return (decisions || []).find((row) => row?.operator_type === 'OpDecision'
    && (contract.allowed_decision_types || DEFAULT_DECISION_TYPES).includes(row.decision_type)
    && row.target_operator === operator_type
    && planMatches(row, plan)
    && targetStepMatches(row, target_step)
    && (contract.allowed_skip_reasons || []).includes(row.reason)) || null;
}

export function validSkipFinding(decision, { plan, operator_type, evidence = null, extra = {} }) {
  const contract = contractFor(operator_type) || {};
  return { type: 'valid_skip', operator_type, plan_key: plan, confidence: decision?.confidence || 'medium', severity: 'info', reason: `Operator decision ${decision?.decision_type || 'skip'} with reason ${decision?.reason || 'unknown'} satisfies ${operator_type} contract.`, evidence: decision?.physical_action?.evidence_path || decision?.evidence_path || evidence, contract_id: contract.contract_id || null, expected_when: contract.required_when || null, observed_state: 'valid_operator_decision', allowed_skip_reasons: contract.allowed_skip_reasons || [], resolution_options: contract.resolution_options || [], decision_evidence: decision || null, ...extra };
}

export function decorateContractFinding(finding) {
  const contract = contractFor(finding?.operator_type);
  if (!contract) return finding;
  return { ...finding, contract_id: contract.contract_id, expected_when: contract.required_when, observed_state: finding.type || 'missing', allowed_skip_reasons: contract.allowed_skip_reasons, resolution_options: contract.resolution_options };
}
