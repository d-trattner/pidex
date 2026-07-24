#!/usr/bin/env node
// Conservative, locally governable operator-contract helpers for PDQ trace classification.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MUTABLE_OPERATORS = new Set(['OpPreflight', 'OpQualityReview']);
const STATUSES = new Set(['pending', 'approved', 'rejected', 'superseded']);
const REASON_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const CONTRACTS = {
  OpPreflight: { contract_id: 'operator.OpPreflight.finalized-preflight', required_when: 'post-Phase-2B pipeline_started exists', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['continuation-existing-plan', 'already-covered'], resolution_options: ['record finalized OpPreflight', 'record valid OpDecision skip', 'correct expectation contract'] },
  OpQualityReview: { contract_id: 'operator.OpQualityReview.terminal-pdq', required_when: 'terminal pipeline event exists', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['auto-pdq-disabled', 'optional-hooks-disabled', 'terminal-event-backfill', 'report-logic-regeneration-pending'], resolution_options: ['restore auto-PDQ hook', 'record valid OpDecision skip/manual evidence', 'backfill OpQualityReview', 'correct expectation contract'] },
  OpReview: { contract_id: 'operator.OpReview.review-agent-evidence', required_when: 'post-Phase-2B review-agent metric row exists', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['not-applicable', 'already-covered', 'docs-only', 'manual-review-done-outside-pidex', 'provider-quota-limited', 'operator-approved-risk', 'duplicate-signal'], resolution_options: ['restore review event emission', 'record valid OpDecision skip/manual review evidence', 'run the review agent', 'correct expectation contract'] },
  OpGate: { contract_id: 'operator.OpGate.user-gate-evidence', required_when: 'metric row contains a real gate', allowed_decision_types: ['skip_step', 'manual_evidence', 'backfill_evidence'], allowed_skip_reasons: ['not-applicable', 'already-covered', 'no-ui-change', 'manual-review-done-outside-pidex', 'operator-approved-risk', 'expectation-wrong'], resolution_options: ['restore gate event emission', 'record valid OpDecision skip/manual gate evidence', 'backfill gate evidence', 'correct expectation contract'] },
  OpRoute: { contract_id: 'operator.OpRoute.route-decision-evidence', required_when: 'metric row contains route_to', allowed_decision_types: ['override_route', 'manual_evidence', 'backfill_evidence', 'expectation_correction'], allowed_skip_reasons: ['already-covered', 'duplicate-signal', 'operator-approved-risk', 'expectation-wrong', 'manual-review-done-outside-pidex'], resolution_options: ['restore route event emission', 'record explicit route override decision', 'backfill route evidence', 'correct expectation contract'] },
  OpSpawn: { contract_id: 'operator.OpSpawn.agent-spawn-evidence', required_when: 'agent metric row exists', allowed_decision_types: ['manual_evidence', 'backfill_evidence', 'expectation_correction'], allowed_skip_reasons: ['already-covered', 'duplicate-signal', 'expectation-wrong', 'provider-quota-limited'], resolution_options: ['restore pidex_agent OpSpawn emission', 'backfill/manual evidence for agent run', 'correct expectation contract'] },
  OpContextPack: { contract_id: 'operator.OpContextPack.context-pack-evidence', required_when: 'post-Phase-2B agent metric row exists', allowed_decision_types: ['manual_evidence', 'backfill_evidence', 'expectation_correction'], allowed_skip_reasons: ['already-covered', 'duplicate-signal', 'expectation-wrong', 'provider-quota-limited'], resolution_options: ['restore context-pack event emission', 'record manual context-pack evidence', 'correct expectation contract'] },
};

function issue(code, message, index = null) { return { code, message, ...(index == null ? {} : { index }) }; }
function validDate(value) { return typeof value === 'string' && DATE_TIME_RE.test(value) && Number.isFinite(Date.parse(value)); }
function patchErrors(row, index) {
  const errors = [];
  const patch = row?.contract_patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return [issue('CONTRACT_OVERRIDE_PATCH_INVALID', 'contract_patch must be an object', index)];
  const keys = Object.keys(patch);
  if (keys.length !== 1 || keys[0] !== 'allowed_skip_reasons') errors.push(issue('CONTRACT_OVERRIDE_PATCH_UNSUPPORTED', `unsupported patch keys: ${keys.join(',') || '(none)'}`, index));
  const reasons = patch.allowed_skip_reasons;
  if (!Array.isArray(reasons) || reasons.length < 1 || reasons.length > 12 || new Set(reasons).size !== reasons.length || reasons.some((x) => typeof x !== 'string' || !REASON_RE.test(x))) errors.push(issue('CONTRACT_OVERRIDE_REASONS_INVALID', 'allowed_skip_reasons must contain 1..12 unique reason slugs', index));
  return errors;
}

function validateV2Row(row, index, errors) {
  const allowed = new Set(['timestamp', 'id', 'status', 'operator_type', 'contract_id', 'reason', 'approved_by', 'approved_at', 'effective_from', 'source_decision_id', 'historical_reclassification', 'contract_patch']);
  if (Object.keys(row).some((key) => !allowed.has(key))) errors.push(issue('CONTRACT_OVERRIDE_ROW_UNKNOWN_KEY', `override ${row.id || index} has unknown key`, index));
  if (typeof row.id !== 'string' || row.id.length < 1 || row.id.length > 160) errors.push(issue('CONTRACT_OVERRIDE_REQUIRED_FIELD', 'id must contain 1..160 characters', index));
  if (typeof row.reason !== 'string' || row.reason.length < 1 || row.reason.length > 500) errors.push(issue('CONTRACT_OVERRIDE_REQUIRED_FIELD', 'reason must contain 1..500 characters', index));
  if (!validDate(row.timestamp)) errors.push(issue('CONTRACT_OVERRIDE_TIMESTAMP_INVALID', 'timestamp must be a valid date-time', index));
  if (row.source_decision_id != null && (typeof row.source_decision_id !== 'string' || row.source_decision_id.length > 160)) errors.push(issue('CONTRACT_OVERRIDE_SOURCE_INVALID', 'source_decision_id must be null or at most 160 characters', index));
  if (row.approved_by != null && (typeof row.approved_by !== 'string' || row.approved_by.length < 1 || row.approved_by.length > 120)) errors.push(issue('CONTRACT_OVERRIDE_APPROVAL_INVALID', 'approved_by must contain 1..120 characters', index));
  for (const field of ['approved_at', 'effective_from']) if (row[field] != null && !validDate(row[field])) errors.push(issue('CONTRACT_OVERRIDE_APPROVAL_INVALID', `${field} must be a valid date-time`, index));
  if (row.historical_reclassification !== 'future-only') errors.push(issue('CONTRACT_OVERRIDE_HISTORY_INVALID', 'historical_reclassification must be future-only', index));
  if (row.status === 'approved' && (typeof row.approved_by !== 'string' || !validDate(row.approved_at) || !validDate(row.effective_from))) errors.push(issue('CONTRACT_OVERRIDE_APPROVAL_INVALID', 'approved override requires approved_by and valid approved_at/effective_from', index));
}

export function analyzeContractOverrides(parsed) {
  const errors = []; const diagnostics = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { errors: [issue('CONTRACT_OVERRIDE_FILE_INVALID', 'override file must be an object')], diagnostics };
  if (![1, 2].includes(parsed.version)) errors.push(issue('CONTRACT_OVERRIDE_VERSION_UNSUPPORTED', 'version must be 1 or 2'));
  if (!Array.isArray(parsed.overrides)) errors.push(issue('CONTRACT_OVERRIDE_ROWS_INVALID', 'overrides must be an array'));
  if (Array.isArray(parsed.overrides) && parsed.version === 2 && parsed.overrides.length > 100) errors.push(issue('CONTRACT_OVERRIDE_ROWS_INVALID', 'version 2 permits at most 100 overrides'));
  if (Object.keys(parsed).some((key) => !['version', 'overrides'].includes(key))) errors.push(issue('CONTRACT_OVERRIDE_FILE_UNKNOWN_KEY', 'unknown top-level key'));
  for (const [index, row] of (Array.isArray(parsed.overrides) ? parsed.overrides : []).entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) { errors.push(issue('CONTRACT_OVERRIDE_ROW_INVALID', 'override must be an object', index)); continue; }
    if (!row.id || !row.status || !row.operator_type || !row.contract_id) errors.push(issue('CONTRACT_OVERRIDE_REQUIRED_FIELD', 'id/status/operator_type/contract_id are required', index));
    if (!STATUSES.has(row.status)) errors.push(issue('CONTRACT_OVERRIDE_STATUS_INVALID', `invalid status ${row.status}`, index));
    const base = CONTRACTS[row.operator_type];
    if (!base || !MUTABLE_OPERATORS.has(row.operator_type)) errors.push(issue('CONTRACT_OVERRIDE_OPERATOR_UNSUPPORTED', `unsupported operator ${row.operator_type}`, index));
    else if (row.contract_id !== base.contract_id) errors.push(issue('CONTRACT_OVERRIDE_CONTRACT_MISMATCH', `contract_id does not match ${row.operator_type}`, index));
    if (parsed.version === 1 && row.status === 'approved' && (!row.approved_by || !validDate(row.approved_at) || !validDate(row.effective_from))) errors.push(issue('CONTRACT_OVERRIDE_APPROVAL_INVALID', 'approved override requires approved_by and valid approved_at/effective_from', index));
    const unsupportedV1 = parsed.version === 1 && row.contract_patch && Object.keys(row.contract_patch).some((key) => key !== 'allowed_skip_reasons');
    if (unsupportedV1 && row.status === 'approved' && base && row.contract_id === base.contract_id) diagnostics.push(issue('CONTRACT_OVERRIDE_V1_QUARANTINED', `v1 override ${row.id} operator ${row.operator_type} quarantined unsupported keys: ${Object.keys(row.contract_patch).join(',')}`, index));
    else errors.push(...patchErrors(row, index));
    if (parsed.version === 2) validateV2Row(row, index, errors);
  }
  return { errors, diagnostics };
}

let cachedRoot = null; let cachedContracts = null;
export function loadContracts(root = ROOT) {
  const resolvedRoot = path.resolve(root || ROOT);
  if (cachedRoot === resolvedRoot && cachedContracts) return cachedContracts;
  const merged = Object.fromEntries(Object.entries(CONTRACTS).map(([key, value]) => [key, structuredClone(value)]));
  const file = path.join(resolvedRoot, 'config', 'operator-contracts.local.json');
  if (existsSync(file)) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`CONTRACT_OVERRIDE_JSON_INVALID: ${error instanceof Error ? error.message : String(error)}`); }
    const { errors, diagnostics } = analyzeContractOverrides(parsed);
    if (errors.length) throw new Error(errors.map((x) => `${x.code}: ${x.message}`).join('; '));
    for (const diagnostic of diagnostics) console.error(`${diagnostic.code}: ${diagnostic.message}`);
    const quarantined = new Set(diagnostics.map((x) => x.index));
    for (const [index, row] of parsed.overrides.entries()) {
      if (row.status !== 'approved' || quarantined.has(index) || Date.parse(row.effective_from) > Date.now()) continue;
      merged[row.operator_type].allowed_skip_reasons = [...row.contract_patch.allowed_skip_reasons];
    }
  }
  cachedRoot = resolvedRoot; cachedContracts = merged; return merged;
}
export function resetContractCache() { cachedRoot = null; cachedContracts = null; }
function planMatches(row, plan) { return [plan, null, undefined, ''].includes(row?.plan_key); }
function targetStepMatches(row, expected) { if (!expected) return true; const target = String(row?.target_step || '').toLowerCase(); return !target || target === String(expected).toLowerCase(); }
export function validDecisionFor(decisions, { root = ROOT, plan, operator_type, target_step = null }) { const contract = loadContracts(root)[operator_type]; if (!contract) return null; return (decisions || []).find((row) => row?.operator_type === 'OpDecision' && (contract.allowed_decision_types || []).includes(row.decision_type) && row.target_operator === operator_type && planMatches(row, plan) && targetStepMatches(row, target_step) && (contract.allowed_skip_reasons || []).includes(row.reason)) || null; }
export function validSkipFinding(decision, { plan, operator_type, evidence = null, extra = {}, root = ROOT }) { const contract = loadContracts(root)[operator_type] || {}; return { type: 'valid_skip', operator_type, plan_key: plan, confidence: decision?.confidence || 'medium', severity: 'info', reason: `Operator decision ${decision?.decision_type || 'skip'} with reason ${decision?.reason || 'unknown'} satisfies ${operator_type} contract.`, evidence: decision?.physical_action?.evidence_path || decision?.evidence_path || evidence, contract_id: contract.contract_id || null, expected_when: contract.required_when || null, observed_state: 'valid_operator_decision', allowed_skip_reasons: contract.allowed_skip_reasons || [], resolution_options: contract.resolution_options || [], decision_evidence: decision || null, ...extra }; }
export function decorateContractFinding(finding, root = ROOT) { const contract = loadContracts(root)[finding?.operator_type]; return contract ? { ...finding, contract_id: contract.contract_id, expected_when: contract.required_when, observed_state: finding.type || 'missing', allowed_skip_reasons: contract.allowed_skip_reasons, resolution_options: contract.resolution_options } : finding; }
