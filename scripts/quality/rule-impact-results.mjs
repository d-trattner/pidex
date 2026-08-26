import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { policyDigest } from './rule-impact-policy.mjs';

const MEASUREMENT_KEYS = Object.freeze(['schema', 'run_family_id', 'production_started_at', 'plan_id', 'plan_class', 'project_scope', 'outcome_definition_id', 'outcome_definition_version', 'model_provider', 'model_identity', 'model_version', 'pipeline_version', 'config_digest', 'route_topology', 'agent_role', 'agent_version', 'phase', 'capability_set', 'budget_class', 'workload_risk_fingerprint_class', 'raw_pre_outcome_covariates', 'impact_contract_ref', 'impact_contract_digest', 'impact_contract_bytes', 'outcome_vector', 'outcome_source_identity', 'outcome_source_digest', 'outcome_finalized_at']);
const MEASUREMENT_KEY_SET = new Set(MEASUREMENT_KEYS);
const PRIVATE_SENTINEL = /(?:credential|secret|token|password|passwd|private|\/home\/|[a-z]:\\)/i;
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
const RFC3339_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REQUIRED = Object.freeze({
  family_identity_missing: ['run_family_id', 'production_started_at'],
  fingerprint_missing: ['plan_id', 'plan_class', 'project_scope', 'outcome_definition_id', 'outcome_definition_version', 'model_provider', 'model_identity', 'model_version', 'pipeline_version', 'config_digest', 'route_topology', 'agent_role', 'agent_version', 'phase', 'capability_set', 'budget_class', 'raw_pre_outcome_covariates'],
  workload_class_missing: ['workload_risk_fingerprint_class'],
  impact_contract_unavailable: ['impact_contract_ref', 'impact_contract_digest', 'impact_contract_bytes'],
  outcome_source_unavailable: ['outcome_vector', 'outcome_source_identity', 'outcome_source_digest', 'outcome_finalized_at'],
});

const FIXED_KEYS = Object.freeze({
  'rule-impact-input-v1': ['schema', 'captured_at', 'exposure_publication', 'fresh_runtime', 'resolver_boundary', 'measurement', 'measurement_present_keys', 'collection_disposition', 'collection_reason'],
  'rule-impact-evaluator-input-v1': ['schema', 'input_digest', 'evaluated_target', 'target_t0', 'target_epoch_opening', 'impact_contract_digest', 'impact_contract', 'families'],
  'pidex-rule-resolver-snapshot-v1': ['schema', 'snapshot_id', 'resolver_revision', 'projection_revision', 'scope_id', 'created_at', 'source_heads', 'mirror_heads', 'quality', 'reason_codes', 'active_rules', 'narrowing'],
  'pidex-rule-runtime-context-v1': ['schema', 'pipeline_id', 'input_digests', 'supplied_context_attestation', 'resolver_snapshot_bytes', 'resolver_snapshot_digest'],
  'pidex-rule-runtime-input-digests-v1': ['schema', 'run_identity_digest', 'project_authority_digest', 'inventory_identity_digest', 'lifecycle_head_digest', 'projection_digest', 'epoch_catalog_digest', 'mirror_generation_digest', 'reconciliation_artifact_digest'],
  'impact-contract-v1': ['schema', 'outcome_definition_id', 'outcome_definition_version', 'created_at', 'primary_dimension', 'guardrail_dimensions', 'benefit_dimension', 'required_pre_outcome_covariates'],
  'activation_opened': ['kind', 'opening_id', 'opening_digest', 'opened_at', 'rule_id', 'version_hash', 'activation_epoch', 'accepted_commit', 'source_heads', 'mirror_heads', 'projection_revision'],
  'reactivation_opened': ['kind', 'opening_id', 'opening_digest', 'opened_at', 'rule_id', 'version_hash', 'prior_activation_epoch', 'next_activation_epoch', 'accepted_commit', 'source_heads', 'mirror_heads', 'projection_revision'],
  'rule-impact-lifecycle-event-v1': ['event_class', 'event_type', 'event_id', 'event_digest', 'event_at', 'rule_id', 'version_hash', 'activation_epoch', 'policy_digest', 'effect', 'details'],
  'rule-impact-evaluator-family-v1': ['family_kind', 'family_id', 'project_scope', 'plan_id', 'run_family_id', 'production_started_at', 'terminal_finalized_at', 'window_code', 'fingerprint', 'raw_pre_outcome_covariates', 'provenance', 'epoch_events', 'outcome', 'target_presence', 'target', 'active_rules', 'non_target_rules'],
  'comparability-fingerprint-v1': ['schema', 'key', 'key_digest'],
  'comparability-fingerprint-key-v1': ['plan_id', 'plan_class', 'project_scope', 'outcome_definition_id', 'outcome_definition_version', 'model_provider', 'model_identity', 'model_version', 'pipeline_version', 'config_digest', 'workload_risk_fingerprint_class', 'route_topology', 'agent_role', 'agent_version', 'phase', 'capability_set', 'budget_class', 'non_target_rules', 'covariate_bins'],
  'rule-impact-evaluator-provenance-v1': ['schema', 'resolver_snapshot_id', 'resolver_snapshot_digest', 'exposure_id', 'exposure_publication_digest', 'measurement_input_id', 'measurement_input_digest', 'source_heads', 'mirror_heads', 'projection_revision', 'runtime_digest', 'supplied_context_attestation', 'impact_contract_ref', 'impact_contract_digest', 'policy_id', 'policy_digest'],
  'rule-impact-evaluator-finalized-outcome-v1': ['status', 'definition_id', 'definition_version', 'source_id', 'source_digest', 'finalized_at', 'values'],
  'passive-impact-global-result-v1': ['schema', 'tier', 'scope_id', 'policy_id', 'policy_digest', 'estimator_id', 'target', 'snapshot', 'exposure', 'input', 'intake', 'result', 'created_at'],
  'passive-impact-project-result-v1': ['schema', 'tier', 'scope_id', 'policy_id', 'policy_digest', 'estimator_id', 'target', 'snapshot', 'exposure', 'input', 'intake', 'result', 'created_at'],
});
const TARGET_KEYS = Object.freeze(['rule_id', 'version_hash', 'activation_epoch', 'tier', 'scope_id', 'content_hash', 'accepted_commit', 'protection_class', 'mirror_digest', 'agent', 'applicability', 'phases', 'lifecycle_state']);
const DIMENSION_KEYS = Object.freeze(['dimension_id', 'extractor_id', 'extractor_version', 'value_type', 'unit', 'valid_range', 'adverse_direction', 'absolute_materiality']);
const RANGE_KEYS = Object.freeze(['minimum', 'maximum']);
const COVARIATE_KEYS = Object.freeze(['dimension_id', 'bins']);
const IMPACT_CONTRACT_KEYS = Object.freeze(['contract_id', 'contract_version', 'created_at', 'valid_from', 'outcome_definition_id', 'outcome_definition_version', 'dimensions', 'raw_covariates']);
const IMPACT_CONTRACT_DIMENSION_KEYS = Object.freeze(['id', 'role', 'extractor_id', 'extractor_version', 'value_type', 'unit', 'valid_min', 'valid_max', 'valid_min_inclusive', 'valid_max_inclusive', 'adverse_direction', 'absolute_materiality', 'required_raw_covariates']);
const IMPACT_RAW_COVARIATE_KEYS = Object.freeze(['id', 'unit', 'valid_min', 'valid_max', 'valid_min_inclusive', 'valid_max_inclusive', 'bins']);
const IMPACT_COVARIATE_BIN_KEYS = Object.freeze(['bin_id', 'ordinal', 'valid_min', 'valid_max', 'valid_min_inclusive', 'valid_max_inclusive']);
const EXPOSURE_KEYS = Object.freeze(['run_id', 'terminal_outcome_ref', 'reconciliation_revision', 'snapshot_id', 'exposure_id', 'publication_digest', 'publication_state']);
const RUNTIME_KEYS = FIXED_KEYS['pidex-rule-runtime-context-v1'];
const BOUNDARY_KEYS = Object.freeze(['target_rule', 'active_rules', 'non_target_rules', 'source_heads', 'mirror_heads', 'scope_id', 'projection_revision', 'activation_epoch', 'runtime_digest']);
const NON_TARGET_KEYS = Object.freeze(['rule_id', 'version_hash']);
const RESULT_SNAPSHOT_KEYS = Object.freeze(['snapshot_id', 'snapshot_digest']);
const RESULT_EXPOSURE_KEYS = Object.freeze(['exposure_id', 'publication_digest']);
const RESULT_INPUT_KEYS = Object.freeze(['input_id', 'input_digest']);
const RESULT_INTAKE_KEYS = Object.freeze(['collection_disposition', 'collection_reason']);
const NARROWING_KEYS = Object.freeze(['rule_id', 'state']);
const verifiedImpactFamilySources = new WeakMap();
const aggregateCapabilityMintInputs = new WeakSet();
const SOURCE_RECORD_KEYS = Object.freeze(['exposure_id', 'publication_digest', 'input_id', 'input_digest', 'target_ordinal', 'tier', 'scope_id', 'production_started_at', 'captured_at', 'terminal_byte_domain', 'terminal_byte_digest']);
function scalarCompare(left, right) { const a = Array.from(left); const b = Array.from(right); for (let index = 0; index < Math.min(a.length, b.length); index += 1) { const delta = a[index].codePointAt(0) - b[index].codePointAt(0); if (delta) return delta; } return a.length - b.length; }
function keySet(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function fixedOrder(value) {
  const supplied = Object.keys(value);
  const schemaKeys = value.schema && FIXED_KEYS[value.schema];
  if (schemaKeys && keySet(value, schemaKeys)) return schemaKeys;
  if (value.schema === 'rule-impact-input-v1' && keySet(value, FIXED_KEYS['rule-impact-input-v1'].slice(0, -1))) return FIXED_KEYS['rule-impact-input-v1'].slice(0, -1);
  for (const keys of Object.values(FIXED_KEYS)) if (keySet(value, keys)) return keys;
  for (const keys of [TARGET_KEYS, DIMENSION_KEYS, RANGE_KEYS, COVARIATE_KEYS, IMPACT_CONTRACT_KEYS, IMPACT_CONTRACT_DIMENSION_KEYS, IMPACT_RAW_COVARIATE_KEYS, IMPACT_COVARIATE_BIN_KEYS, EXPOSURE_KEYS, RUNTIME_KEYS, FIXED_KEYS['pidex-rule-runtime-input-digests-v1'], BOUNDARY_KEYS, NON_TARGET_KEYS, RESULT_SNAPSHOT_KEYS, RESULT_EXPOSURE_KEYS, RESULT_INPUT_KEYS, RESULT_INTAKE_KEYS]) if (keySet(value, keys)) return keys;
  return supplied.sort(scalarCompare);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${fixedOrder(value).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
const TOTAL_ER_KEYS = Object.freeze(['schema', 'result_id', 'tier', 'estimator_id', 'state', 'lineage', 'closed_window_id', 'collection_progress', 'cohorts', 'comparisons', 'dimensions', 'balance', 'drift_consistency', 'gate_operands', 'metrics', 'quality_flags', 'reason', 'prior_result', 'created_at', 'expires_at']);
const TOTAL_ER_STATES = new Set(['collecting', 'frozen', 'repeated_observational_harm', 'inconclusive', 'blocked', 'superseded', 'expired']);
function freeze(value) { if (Buffer.isBuffer(value)) return value; if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const member of Object.values(value)) freeze(member); } return value; }

/** Parses canonical total ER bytes and recomputes its nonself and full digest domains. */
export function parseImpactEvaluationBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.toString('utf8').includes('\n') || bytes.toString('utf8').startsWith('\ufeff')) throw new Error('RULE_IMPACT_RESULT_INPUT_INVALID');
  const source = bytes.toString('utf8'); let artifact;
  try { artifact = JSON.parse(source); } catch { throw new Error('RULE_IMPACT_RESULT_INPUT_INVALID'); }
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || Object.keys(artifact).join('\0') !== TOTAL_ER_KEYS.join('\0') || JSON.stringify(artifact) !== source || !validTotalImpactArtifact(artifact)) throw new Error('RULE_IMPACT_RESULT_INPUT_INVALID');
  const tier = artifact.schema === 'passive-impact-global-result-v1' ? 'global' : 'project';
  const projection = { ...artifact }; delete projection.result_id;
  const result_identity_digest = digest(Buffer.from(JSON.stringify(projection), 'utf8'));
  const result_id = `passive-impact-${tier}:${result_identity_digest}`;
  if (artifact.tier !== tier || artifact.result_id !== result_id) throw new Error('RULE_IMPACT_RESULT_IDENTITY_INVALID');
  return freeze({ artifact: freeze(artifact), result_id, result_identity_digest, result_digest: digest(bytes), bytes: Buffer.from(bytes) });
}

/** Builds a fully supplied ER envelope. Tier is explicit output authority; schema is never caller input. */
export function buildImpactEvaluationArtifact(operands = {}) {
  const keys = ['tier', 'state', 'lineage', 'cohorts', 'comparisons', 'dimensions', 'balance', 'drift_consistency', 'gate_operands', 'metrics', 'quality_flags', 'reason', 'prior_result', 'collection_progress', 'closed_window_id', 'created_at', 'expires_at'];
  if (!exactKeys(operands, keys) || !['global', 'project'].includes(operands.tier)) invalidResultInput();
  const schema = `passive-impact-${operands.tier}-result-v1`;
  const projection = { schema, tier: operands.tier, estimator_id: 'bootstrap-sha256-v1', state: operands.state, lineage: operands.lineage, closed_window_id: operands.closed_window_id, collection_progress: operands.collection_progress, cohorts: operands.cohorts, comparisons: operands.comparisons, dimensions: operands.dimensions, balance: operands.balance, drift_consistency: operands.drift_consistency, gate_operands: operands.gate_operands, metrics: operands.metrics, quality_flags: operands.quality_flags, reason: operands.reason, prior_result: operands.prior_result, created_at: operands.created_at, expires_at: operands.expires_at };
  const result_identity_digest = digest(Buffer.from(JSON.stringify(projection), 'utf8'));
  const artifact = { schema, result_id: `passive-impact-${operands.tier}:${result_identity_digest}`, tier: operands.tier, estimator_id: 'bootstrap-sha256-v1', state: operands.state, lineage: operands.lineage, closed_window_id: operands.closed_window_id, collection_progress: operands.collection_progress, cohorts: operands.cohorts, comparisons: operands.comparisons, dimensions: operands.dimensions, balance: operands.balance, drift_consistency: operands.drift_consistency, gate_operands: operands.gate_operands, metrics: operands.metrics, quality_flags: operands.quality_flags, reason: operands.reason, prior_result: operands.prior_result, created_at: operands.created_at, expires_at: operands.expires_at };
  return parseImpactEvaluationBytes(Buffer.from(JSON.stringify(artifact), 'utf8'));
}
const ER_LINEAGE_KEYS = Object.freeze(['resolver_snapshot_id', 'resolver_snapshot_digest', 'exposure_id', 'exposure_publication_digest', 'measurement_input_id', 'measurement_input_digest', 'evaluation_input_digest', 'rule_id', 'rule_version_hash', 'rule_content_hash', 'accepted_commit', 'scope_id', 'activation_epoch', 'mirror_digest', 'policy_id', 'policy_digest']);
const ER_METRIC_KEYS = Object.freeze(['support_floor', 'missing_rate_floor', 'missing_rate_shift_floor', 'evidence_exclusion_rate_floor', 'evidence_exclusion_rate_shift_floor', 'minimum_count', 'minimum_ess', 'minimum_plan_count', 'minimum_diversity_count', 'balance_smd_maximum', 'drift_minimum', 'drift_maximum', 'consistency_minimum', 'consistency_maximum', 'primary_minimum_point', 'primary_minimum_interval_lower', 'non_primary_minimum_interval_lower', 'benefit_credit_sum', 'benefit_primary_interval_lower']);
const ER_COHORT_IDS = Object.freeze(['H2', 'H1', 'W1', 'W2']);
const ER_COMPARISON_IDS = Object.freeze(['W1/H1', 'W2/H2', 'H1/H2', 'W1/W2']);
const ER_EXCLUSIONS = Object.freeze(['missing_invalid_outcome', 'incomplete_identity_exposure', 'mixed_fallback_degraded_exposure', 'invalid_fingerprint_covariate', 'stale_clock_failure', 'concurrent_change', 'unsupported_stratum', 'other_policy_failure']);
const ER_REASONS = Object.freeze({ collecting: ['collecting'], frozen: ['frozen_no_repeated_harm'], repeated_observational_harm: ['repeated_observational_harm'], inconclusive: ['timing_gap', 'support_missing', 'support_ratio_below_floor', 'count_below_floor', 'ess_below_floor', 'plan_diversity_below_floor', 'balance_failed', 'baseline_drift_failed', 'post_consistency_failed', 'missingness_failed', 'evidence_exclusions_failed', 'provenance_failed', 'primary_gate_failed', 'guardrail_failed', 'benefit_gate_failed', 'nonfinite_numeric'], blocked: ['measurement_schema_invalid', 'family_identity_missing', 'fingerprint_missing', 'workload_class_missing', 'impact_contract_unavailable', 'impact_contract_invalid', 'outcome_source_unavailable', 'outcome_invalid', 'outcome_not_final', 'epoch_history_unavailable', 'authority_drift'], superseded: ['policy_changed', 'target_version_changed', 'target_epoch_changed', 'result_replaced'], expired: ['policy_expired', 'result_expired'] });
function uint(value) { return Number.isSafeInteger(value) && value >= 0; }
function exactOrder(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).join('\0') === keys.join('\0'); }
function erMetric(value, nullable = true) { if (value === null) return nullable; if (!exactOrder(value, ['decimal', 'bits']) || typeof value.decimal !== 'string' || !/^[a-f0-9]{16}$/.test(value.bits)) return false; const number = Number(value.decimal); if (!Number.isFinite(number)) return false; const bytes = Buffer.allocUnsafe(8); bytes.writeDoubleBE(number); return bytes.toString('hex') === value.bits && (Object.is(number, -0) ? value.decimal === '-0' : String(number) === value.decimal); }
function erRate(value) { return exactOrder(value, ['numerator', 'denominator', 'value']) && uint(value.numerator) && uint(value.denominator) && value.numerator <= value.denominator && (value.denominator ? erMetric(value.value, false) && Number(value.value.decimal) === value.numerator / value.denominator : value.numerator === 0 && value.value === null); }
function memberSet(value, digestValue, count) { return Array.isArray(value) && value.every(validText) && value.join('\0') === [...new Set(value)].sort(scalarCompare).join('\0') && validDigest(digestValue) && digest(Buffer.from(JSON.stringify(value), 'utf8')) === digestValue && count === value.length; }
function validTotalImpactArtifact(artifact) {
  if (!['passive-impact-global-result-v1', 'passive-impact-project-result-v1'].includes(artifact.schema) || !['global', 'project'].includes(artifact.tier) || artifact.schema !== `passive-impact-${artifact.tier}-result-v1` || artifact.estimator_id !== 'bootstrap-sha256-v1' || !TOTAL_ER_STATES.has(artifact.state) || (artifact.result_id !== '' && (typeof artifact.result_id !== 'string' || !new RegExp(`^passive-impact-${artifact.tier}:[a-f0-9]{64}$`).test(artifact.result_id))) || !validTime(artifact.created_at) || (artifact.expires_at !== null && !validTime(artifact.expires_at)) || hasPrivate(artifact)) return false;
  const terminal = ['superseded', 'expired'].includes(artifact.state); const evaluated = ['frozen', 'repeated_observational_harm', 'inconclusive'].includes(artifact.state); const lineage = artifact.lineage;
  if (!exactOrder(lineage, ER_LINEAGE_KEYS) || !validLineage(lineage, artifact.tier, artifact.state) || !exactOrder(artifact.metrics, ER_METRIC_KEYS) || !Object.values(artifact.metrics).every((value) => erMetric(value)) || !Array.isArray(artifact.quality_flags) || artifact.quality_flags.some((value) => !['timing_failed', 'support_failed', 'floors_failed', 'balance_failed', 'baseline_drift_failed', 'post_consistency_failed', 'missingness_failed', 'evidence_exclusions_failed', 'provenance_failed', 'primary_gate_failed', 'guardrail_failed', 'benefit_gate_failed', 'nonfinite_numeric', 'discontinuity_detected'].includes(value)) || artifact.quality_flags.join('\0') !== [...new Set(artifact.quality_flags)].sort((a, b) => ['timing_failed', 'support_failed', 'floors_failed', 'balance_failed', 'baseline_drift_failed', 'post_consistency_failed', 'missingness_failed', 'evidence_exclusions_failed', 'provenance_failed', 'primary_gate_failed', 'guardrail_failed', 'benefit_gate_failed', 'nonfinite_numeric', 'discontinuity_detected'].indexOf(a) - ['timing_failed', 'support_failed', 'floors_failed', 'balance_failed', 'baseline_drift_failed', 'post_consistency_failed', 'missingness_failed', 'evidence_exclusions_failed', 'provenance_failed', 'primary_gate_failed', 'guardrail_failed', 'benefit_gate_failed', 'nonfinite_numeric', 'discontinuity_detected'].indexOf(b)).join('\0') || !ER_REASONS[artifact.state].includes(artifact.reason)) return false;
  if (artifact.state === 'collecting') return artifact.closed_window_id === null && validProgress(artifact.collection_progress) && emptyER(artifact) && artifact.quality_flags.length === 0 && artifact.prior_result === null && artifact.expires_at === null && Object.values(artifact.metrics).every((value) => value === null);
  if (artifact.state === 'blocked') return artifact.closed_window_id === null && artifact.collection_progress === null && emptyER(artifact) && artifact.quality_flags.length === 0 && artifact.prior_result === null && artifact.expires_at === null && Object.values(artifact.metrics).every((value) => value === null);
  if (terminal) return artifact.closed_window_id === null && artifact.collection_progress === null && emptyER(artifact) && artifact.quality_flags.length === 0 && validPrior(artifact.prior_result, artifact.reason) && artifact.expires_at === null && Object.values(artifact.metrics).every((value) => value === null);
  return validText(artifact.closed_window_id) && artifact.collection_progress === null && validEvaluatedRows(artifact) && (artifact.state !== 'inconclusive' || artifact.quality_flags.length > 0) && artifact.prior_result === null && validTime(artifact.expires_at);
}
function validLineage(value, tier, state) { const nullable = ['superseded', 'expired'].includes(state); const blocked = state === 'blocked'; const textKeys = new Set(['resolver_snapshot_id', 'exposure_id', 'measurement_input_id', 'rule_id', 'activation_epoch', 'policy_id']); const digestKeys = new Set(['resolver_snapshot_digest', 'exposure_publication_digest', 'measurement_input_digest', 'evaluation_input_digest', 'rule_version_hash', 'rule_content_hash', 'mirror_digest', 'policy_digest']); for (const [key, item] of Object.entries(value)) { if (nullable) { if (item !== null) return false; continue; } if ((blocked && ['evaluation_input_digest', 'accepted_commit'].includes(key)) || key === 'scope_id' && tier === 'global') { if (item !== null) return false; continue; } if (textKeys.has(key) && !validText(item) || digestKeys.has(key) && !validDigest(item) || key === 'accepted_commit' && (typeof item !== 'string' || !/^[a-f0-9]{40}$/.test(item)) || key === 'scope_id' && tier === 'project' && !validText(item)) return false; } return true; }
function validProgress(value) { return exactOrder(value, ['observed_at', 'h2_source_count', 'h1_source_count', 'w1_source_count', 'w2_source_count']) && validTime(value.observed_at) && Object.values(value).slice(1).every(uint); }
function emptyER(artifact) { return ['cohorts', 'comparisons', 'dimensions', 'balance'].every((key) => Array.isArray(artifact[key]) && artifact[key].length === 0) && artifact.drift_consistency === null && artifact.gate_operands === null; }
function validPrior(value, reason) { return exactOrder(value, ['prior_result_id', 'prior_result_digest', 'state_reason', 'state_at']) && validText(value.prior_result_id) && validDigest(value.prior_result_digest) && value.state_reason === reason && validTime(value.state_at); }
function validEvaluatedRows(artifact) { return validCohorts(artifact.cohorts) && validComparisons(artifact.comparisons) && artifact.dimensions.every(validDimension) && artifact.balance.every(validBalance) && validDrift(artifact.drift_consistency) && validGates(artifact.gate_operands); }
function validCohorts(rows) { const keys = ['cohort_id', 'source_denominator_members', 'source_denominator_digest', 'source_denominator_count', 'missing_members', 'missing_digest', 'missing_count', 'missing_rate', 'evidence_excluded_members', 'evidence_excluded_digest', 'evidence_excluded_count', 'evidence_exclusion_rate', 'exclusions', 'accepted_pre_support_members', 'accepted_pre_support_digest', 'accepted_pre_support_count', 'accepted_post_support_members', 'accepted_post_support_digest', 'accepted_post_support_count', 'support_ratio', 'count', 'ess', 'plan_count', 'diversity_kind', 'diversity_count']; const valid = Array.isArray(rows) && rows.length === 4 && rows.every((row, index) => exactOrder(row, keys) && row.cohort_id === ER_COHORT_IDS[index] && memberSet(row.source_denominator_members, row.source_denominator_digest, row.source_denominator_count) && memberSet(row.missing_members, row.missing_digest, row.missing_count) && memberSet(row.evidence_excluded_members, row.evidence_excluded_digest, row.evidence_excluded_count) && erRate(row.missing_rate) && erRate(row.evidence_exclusion_rate) && validExclusions(row.exclusions) && memberSet(row.accepted_pre_support_members, row.accepted_pre_support_digest, row.accepted_pre_support_count) && memberSet(row.accepted_post_support_members, row.accepted_post_support_digest, row.accepted_post_support_count) && row.count === row.accepted_post_support_count && erRate(row.support_ratio) && erMetric(row.ess) && uint(row.plan_count) && ['evaluator_host_project_scope', 'workload_risk_fingerprint_class'].includes(row.diversity_kind) && uint(row.diversity_count)); if (process.env.PIDEX_ER_DEBUG === '1' && Array.isArray(rows) && rows.length) console.error('ER_COHORT_DETAIL', rows.map((row) => ({ order: exactOrder(row, keys), id: row.cohort_id, source: memberSet(row.source_denominator_members, row.source_denominator_digest, row.source_denominator_count), missing: memberSet(row.missing_members, row.missing_digest, row.missing_count), evidence: memberSet(row.evidence_excluded_members, row.evidence_excluded_digest, row.evidence_excluded_count), rates: erRate(row.missing_rate) && erRate(row.evidence_exclusion_rate) && erRate(row.support_ratio), exclusions: validExclusions(row.exclusions), accepted: memberSet(row.accepted_pre_support_members, row.accepted_pre_support_digest, row.accepted_pre_support_count) && memberSet(row.accepted_post_support_members, row.accepted_post_support_digest, row.accepted_post_support_count), ess: erMetric(row.ess) }))); return valid; }
function validExclusions(rows) { return Array.isArray(rows) && rows.length === 8 && rows.every((row, index) => exactOrder(row, ['reason', 'members', 'members_digest', 'count']) && row.reason === ER_EXCLUSIONS[index] && memberSet(row.members, row.members_digest, row.count)); }
function validComparisons(rows) { return Array.isArray(rows) && rows.length === 4 && rows.every((row, index) => exactOrder(row, ['comparison_id', 'left', 'right', 'missing_rate_shift', 'evidence_exclusion_rate_shift']) && row.comparison_id === ER_COMPARISON_IDS[index] && [row.left, row.right].every((side) => exactOrder(side, ['cohort_id', 'count', 'ess', 'plan_count', 'diversity_count', 'support_ratio', 'missing_rate', 'evidence_exclusion_rate']) && ER_COHORT_IDS.includes(side.cohort_id) && uint(side.count) && erMetric(side.ess) && uint(side.plan_count) && uint(side.diversity_count) && erRate(side.support_ratio) && erRate(side.missing_rate) && erRate(side.evidence_exclusion_rate)) && erMetric(row.missing_rate_shift) && erMetric(row.evidence_exclusion_rate_shift)); }
function validDimension(value) { return exactOrder(value, ['dimension_id', 'role', 'materiality', 'effects']) && validText(value.dimension_id) && ['primary', 'guardrail', 'benefit'].includes(value.role) && erMetric(value.materiality) && Array.isArray(value.effects) && value.effects.length === 4 && value.effects.every((effect, index) => exactOrder(effect, ['comparison_id', 'point', 'normalized_point', 'interval_lower', 'interval_upper', 'bootstrap_digest']) && effect.comparison_id === ER_COMPARISON_IDS[index] && [effect.point, effect.normalized_point, effect.interval_lower, effect.interval_upper].every((metric) => erMetric(metric)) && (effect.bootstrap_digest === null || validDigest(effect.bootstrap_digest))); }
function validBalance(value) { return exactOrder(value, ['covariate_id', 'comparison_id', 'left_mean', 'right_mean', 'left_variance', 'right_variance', 'pooled_scale', 'smd', 'zero_scale_means_bit_equal', 'passed']) && validText(value.covariate_id) && ER_COMPARISON_IDS.includes(value.comparison_id) && ['left_mean', 'right_mean', 'left_variance', 'right_variance', 'pooled_scale', 'smd'].every((key) => erMetric(value[key])) && (typeof value.zero_scale_means_bit_equal === 'boolean' || value.zero_scale_means_bit_equal === null) && typeof value.passed === 'boolean'; }
function validDrift(value) { return exactOrder(value, ['baseline_h1_h2', 'post_w1h1_minus_w2h2']) && Object.values(value).every((check) => exactOrder(check, ['point', 'interval_lower', 'interval_upper', 'minimum', 'maximum', 'passed']) && ['point', 'interval_lower', 'interval_upper', 'minimum', 'maximum'].every((key) => erMetric(check[key])) && typeof check.passed === 'boolean'); }
function validGates(value) { const keys = ['timing', 'support', 'floors', 'weighting', 'balance', 'drift_consistency', 'missingness', 'evidence_exclusions', 'provenance', 'primary', 'guardrails', 'benefits', 'gate_results']; return exactOrder(value, keys) && exactOrder(value.timing, ['t0', 'freeze_not_before', 'evaluated_at', 'max_gap_seconds', 'observed_max_gap_seconds', 'passed']) && ['t0', 'freeze_not_before', 'evaluated_at'].every((key) => validTime(value.timing[key])) && uint(value.timing.max_gap_seconds) && erMetric(value.timing.observed_max_gap_seconds) && typeof value.timing.passed === 'boolean' && Array.isArray(value.support) && Array.isArray(value.floors) && Array.isArray(value.weighting) && Array.isArray(value.balance) && validDrift(value.drift_consistency) && validGateRateRows(value.missingness) && validGateRateRows(value.evidence_exclusions) && validProvenance(value.provenance) && Array.isArray(value.primary) && Array.isArray(value.guardrails) && validBenefits(value.benefits) && exactOrder(value.gate_results, ['timing', 'support', 'floors', 'balance', 'baseline_drift', 'post_consistency', 'missingness', 'evidence_exclusions', 'provenance', 'primary', 'guardrail', 'benefit', 'all']) && Object.values(value.gate_results).every((item) => typeof item === 'boolean'); }
function validGateRateRows(value) { return exactOrder(value, ['cohorts', 'comparisons']) && Array.isArray(value.cohorts) && value.cohorts.length === 4 && value.cohorts.every((row, index) => exactOrder(row, ['cohort_id', 'rate', 'floor', 'passed']) && row.cohort_id === ER_COHORT_IDS[index] && erRate(row.rate) && erMetric(row.floor) && typeof row.passed === 'boolean') && Array.isArray(value.comparisons) && value.comparisons.length === 4 && value.comparisons.every((row, index) => exactOrder(row, ['comparison_id', 'shift', 'floor', 'passed']) && row.comparison_id === ER_COMPARISON_IDS[index] && erMetric(row.shift) && erMetric(row.floor) && typeof row.passed === 'boolean'); }
function validProvenance(value) { const allowed = ['target_paused', 'target_deactivated', 'target_reactivated', 'target_version_changed', 'policy_changed', 'unknown_carryover', 'pipeline_outage', 'recorder_outage', 'clock_skew_unresolved', 'exposure_gap', 'source_lost', 'mirror_lost', 'concurrent_target_rule_change', 'concurrent_non_target_rule_change', 'concurrent_model_change', 'concurrent_pipeline_change', 'concurrent_outcome_change', 'concurrent_config_change', 'concurrent_authority_change']; return exactOrder(value, ['timing_continuity_passed', 'identity_passed', 'fingerprint_passed', 'discontinuities', 'passed']) && ['timing_continuity_passed', 'identity_passed', 'fingerprint_passed', 'passed'].every((key) => typeof value[key] === 'boolean') && Array.isArray(value.discontinuities) && value.discontinuities.every((item) => allowed.includes(item)) && value.discontinuities.join('\0') === [...new Set(value.discontinuities)].sort((a, b) => allowed.indexOf(a) - allowed.indexOf(b)).join('\0'); }
function validBenefits(value) { return exactOrder(value, ['credits', 'pairs']) && Array.isArray(value.credits) && value.credits.every((row) => exactOrder(row, ['dimension_id', 'comparison_id', 'interval_lower', 'credit']) && validText(row.dimension_id) && ER_COMPARISON_IDS.includes(row.comparison_id) && erMetric(row.interval_lower) && erMetric(row.credit)) && Array.isArray(value.pairs) && value.pairs.length === 2 && value.pairs.every((row, index) => exactOrder(row, ['comparison_id', 'credit_sum', 'primary_interval_lower', 'passed']) && row.comparison_id === ER_COMPARISON_IDS[index] && erMetric(row.credit_sum) && erMetric(row.primary_interval_lower) && typeof row.passed === 'boolean'); }
const EXPECTED_LINEAGE_KEYS = Object.freeze(['tier', 'scope_id', 'rule_id', 'version_hash', 'content_hash', 'accepted_commit', 'activation_epoch', 'policy_id', 'policy_digest', 'resolver_snapshot_id', 'resolver_snapshot_digest', 'exposure_id', 'exposure_publication_digest', 'measurement_input_id', 'measurement_input_digest', 'evaluation_input_digest']);
function invalidResultInput() { throw new Error('RULE_IMPACT_RESULT_INPUT_INVALID'); }
function expectedLineage(value, current = false, blocked = false) {
  const keys = current ? [...EXPECTED_LINEAGE_KEYS, 'minimum_head_sequence'] : EXPECTED_LINEAGE_KEYS;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join('\0') !== keys.join('\0')) invalidResultInput();
  const validClosedField = blocked ? value.accepted_commit === null && value.evaluation_input_digest === null : typeof value.accepted_commit === 'string' && /^[a-f0-9]{40}$/.test(value.accepted_commit) && validDigest(value.evaluation_input_digest);
  if (!['global', 'project'].includes(value.tier) || (value.tier === 'global' ? value.scope_id !== null : !validText(value.scope_id)) || !validText(value.rule_id) || !validDigest(value.version_hash) || !validDigest(value.content_hash) || !validClosedField || !validText(value.activation_epoch) || !validText(value.policy_id) || !validDigest(value.policy_digest) || !validText(value.resolver_snapshot_id) || !validDigest(value.resolver_snapshot_digest) || !validText(value.exposure_id) || !validDigest(value.exposure_publication_digest) || !validText(value.measurement_input_id) || !validDigest(value.measurement_input_digest) || (current && (!Number.isSafeInteger(value.minimum_head_sequence) || value.minimum_head_sequence < 1))) invalidResultInput();
  return value;
}
function erLineageMatches(artifact, expected) {
  const lineage = artifact.lineage;
  return lineage && artifact.tier === expected.tier && lineage.scope_id === expected.scope_id && lineage.rule_id === expected.rule_id && lineage.rule_version_hash === expected.version_hash && lineage.rule_content_hash === expected.content_hash && lineage.accepted_commit === expected.accepted_commit && lineage.activation_epoch === expected.activation_epoch && lineage.policy_id === expected.policy_id && lineage.policy_digest === expected.policy_digest && lineage.resolver_snapshot_id === expected.resolver_snapshot_id && lineage.resolver_snapshot_digest === expected.resolver_snapshot_digest && lineage.exposure_id === expected.exposure_id && lineage.exposure_publication_digest === expected.exposure_publication_digest && lineage.measurement_input_id === expected.measurement_input_id && lineage.measurement_input_digest === expected.measurement_input_digest && lineage.evaluation_input_digest === expected.evaluation_input_digest;
}
function evaluationSelector(artifact) { const lineage = artifact.lineage; return { tier: artifact.tier, scope_id: lineage.scope_id === null ? '' : lineage.scope_id, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash, activation_epoch: lineage.activation_epoch, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest }; }
function selectorMatches(artifact, selector) { return JSON.stringify(evaluationSelector(artifact)) === JSON.stringify(selector); }
function verifyStoredEvaluation({ store, stateRoot, row, selector = null, minimum_head_sequence = 1 } = {}) {
  if (!row || !Number.isSafeInteger(row.head_sequence) || row.head_sequence < minimum_head_sequence || !validDigest(row.result_digest)) return null;
  const bytes = totalResultBlob(stateRoot, row.result_digest); if (!bytes) return null;
  let parsed; try { parsed = parseImpactEvaluationBytes(bytes); } catch { return null; }
  if (parsed.result_id !== row.result_id || parsed.result_identity_digest !== row.result_identity_digest || parsed.result_digest !== row.result_digest || parsed.artifact.state !== row.state || (selector && !selectorMatches(parsed.artifact, selector))) return null;
  let lineage; try { lineage = expectedLineage(JSON.parse(row.lineage_json), false, parsed.artifact.state === 'blocked'); } catch { return null; }
  if (!erLineageMatches(parsed.artifact, lineage)) return null;
  if (selector && !IMPACT_EVALUATION_ACTIVE_STATES.has(parsed.artifact.state)) return null;
  return parsed;
}
const IMPACT_EVALUATION_ACTIVE_STATES = new Set(['collecting', 'frozen', 'inconclusive', 'repeated_observational_harm']);
const LIFECYCLE_CURRENT_TO_LINEAGE = Object.freeze({ scope_id: 'scope_id', rule_id: 'rule_id', version_hash: 'rule_version_hash', content_hash: 'rule_content_hash', accepted_commit: 'accepted_commit', activation_epoch: 'activation_epoch', policy_id: 'policy_id', policy_digest: 'policy_digest', resolver_snapshot_id: 'resolver_snapshot_id', resolver_snapshot_digest: 'resolver_snapshot_digest', exposure_id: 'exposure_id', exposure_publication_digest: 'exposure_publication_digest', measurement_input_id: 'measurement_input_id', measurement_input_digest: 'measurement_input_digest', evaluation_input_digest: 'evaluation_input_digest' });
function lifecycleTerminalLineage() { return Object.fromEntries(ER_LINEAGE_KEYS.map((key) => [key, null])); }
function lifecycleMetrics() { return Object.fromEntries(ER_METRIC_KEYS.map((key) => [key, null])); }
function lifecycleResult(tier, state, reason, lineage, priorResult, at) {
  const built = buildImpactEvaluationArtifact({ tier, state, lineage, cohorts: [], comparisons: [], dimensions: [], balance: [], drift_consistency: null, gate_operands: null, metrics: lifecycleMetrics(), quality_flags: [], reason, prior_result: priorResult, collection_progress: null, closed_window_id: null, created_at: at, expires_at: null });
  return freeze({ artifact: built.artifact, bytes: built.bytes, digest: built.result_digest });
}
function lifecycleInvalid() { invalidResultInput(); }
function lifecycleTransition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) lifecycleInvalid();
  const kind = value.kind;
  const keys = {
    authority_blocked: ['kind', 'reason', 'safe_lineage_subset'],
    policy_changed: ['kind', 'prior_policy_digest', 'next_policy_digest', 'event_digest'],
    target_version_changed: ['kind', 'prior_version_hash', 'next_version_hash', 'event_digest'],
    target_epoch_changed: ['kind', 'prior_activation_epoch', 'next_activation_epoch', 'event_digest'],
    result_replaced: ['kind', 'next_result_id', 'next_result_digest'],
    policy_expired: ['kind', 'policy_digest', 'expired_at', 'event_digest'],
    result_expired: ['kind', 'expires_at'],
  }[kind];
  if (!keys || !exactOrder(value, keys)) lifecycleInvalid();
  if (kind === 'authority_blocked') {
    if (!ER_REASONS.blocked.includes(value.reason) || !exactOrder(value.safe_lineage_subset, ER_LINEAGE_KEYS) || !validLineage(value.safe_lineage_subset, value.safe_lineage_subset.scope_id === null ? 'global' : 'project', 'blocked')) lifecycleInvalid();
  } else if (kind === 'policy_changed' && (!validDigest(value.prior_policy_digest) || !validDigest(value.next_policy_digest) || value.prior_policy_digest === value.next_policy_digest || !validDigest(value.event_digest))) lifecycleInvalid();
  else if (kind === 'target_version_changed' && (!validDigest(value.prior_version_hash) || !validDigest(value.next_version_hash) || value.prior_version_hash === value.next_version_hash || !validDigest(value.event_digest))) lifecycleInvalid();
  else if (kind === 'target_epoch_changed' && (!validText(value.prior_activation_epoch) || !validText(value.next_activation_epoch) || value.prior_activation_epoch === value.next_activation_epoch || !validDigest(value.event_digest))) lifecycleInvalid();
  else if (kind === 'result_replaced' && (typeof value.next_result_id !== 'string' || !/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(value.next_result_id) || !validDigest(value.next_result_digest))) lifecycleInvalid();
  else if (kind === 'policy_expired' && (!validDigest(value.policy_digest) || !validTime(value.expired_at) || !validDigest(value.event_digest))) lifecycleInvalid();
  else if (kind === 'result_expired' && !validTime(value.expires_at)) lifecycleInvalid();
  return value;
}
function lifecycleCurrentMatches(current, prior, overrides = {}) {
  if (current.tier !== prior.artifact.tier) return false;
  return Object.entries(LIFECYCLE_CURRENT_TO_LINEAGE).every(([currentKey, lineageKey]) => current[currentKey] === (Object.hasOwn(overrides, currentKey) ? overrides[currentKey] : prior.artifact.lineage[lineageKey]));
}
function lifecycleAuthorityDrift(current, at, sourceLineage) {
  return lifecycleResult(current.tier, 'blocked', 'authority_drift', { ...sourceLineage, accepted_commit: null, evaluation_input_digest: null }, null, at);
}

/** Builds one pure terminal ER from closed lifecycle authority; cadence selects transition and reattests inputs. */
export function buildImpactLifecycleResult(request = {}) {
  const requestKeys = ['tier', 'transition', 'priorResultBytes', 'currentAuthority', 'at'];
  if (!exactOrder(request, requestKeys) || !['global', 'project'].includes(request.tier) || !validTime(request.at)) lifecycleInvalid();
  const current = expectedLineage(request.currentAuthority, true);
  if (current.tier !== request.tier) lifecycleInvalid();
  const transition = lifecycleTransition(request.transition);
  if (transition.kind === 'result_replaced' && !transition.next_result_id.startsWith(`passive-impact-${request.tier}:`)) lifecycleInvalid();
  if (transition.kind === 'authority_blocked') {
    if (request.priorResultBytes !== null) lifecycleInvalid();
    const safe = transition.safe_lineage_subset;
    const safeMatches = Object.entries(LIFECYCLE_CURRENT_TO_LINEAGE).every(([currentKey, lineageKey]) => ['accepted_commit', 'evaluation_input_digest'].includes(lineageKey) || safe[lineageKey] === current[currentKey]);
    return safeMatches ? lifecycleResult(current.tier, 'blocked', transition.reason, safe, null, request.at) : lifecycleAuthorityDrift(current, request.at, safe);
  }
  if (!Buffer.isBuffer(request.priorResultBytes)) lifecycleInvalid();
  let prior;
  try { prior = parseImpactEvaluationBytes(request.priorResultBytes); } catch { lifecycleInvalid(); }
  if (['blocked', 'superseded', 'expired'].includes(prior.artifact.state) || prior.artifact.tier !== request.tier) lifecycleInvalid();
  const lineage = prior.artifact.lineage;
  const priorMatches = (key, value) => lineage[LIFECYCLE_CURRENT_TO_LINEAGE[key]] === value;
  let overrides = {};
  if (transition.kind === 'policy_changed') { if (!priorMatches('policy_digest', transition.prior_policy_digest)) lifecycleInvalid(); overrides = { policy_digest: transition.next_policy_digest }; }
  if (transition.kind === 'target_version_changed') { if (!priorMatches('version_hash', transition.prior_version_hash)) lifecycleInvalid(); overrides = { version_hash: transition.next_version_hash }; }
  if (transition.kind === 'target_epoch_changed') { if (!priorMatches('activation_epoch', transition.prior_activation_epoch)) lifecycleInvalid(); overrides = { activation_epoch: transition.next_activation_epoch }; }
  if (transition.kind === 'result_replaced' && (transition.next_result_id === prior.result_id || transition.next_result_digest === prior.result_digest)) lifecycleInvalid();
  if (transition.kind === 'policy_expired' && (!priorMatches('policy_digest', transition.policy_digest) || Date.parse(request.at) < Date.parse(transition.expired_at))) lifecycleInvalid();
  if (transition.kind === 'result_expired' && Date.parse(request.at) < Date.parse(transition.expires_at)) lifecycleInvalid();
  if (!lifecycleCurrentMatches(current, prior, overrides)) return lifecycleAuthorityDrift(current, request.at, prior.artifact.lineage);
  const state = ['policy_expired', 'result_expired'].includes(transition.kind) ? 'expired' : 'superseded';
  const priorResult = { prior_result_id: prior.result_id, prior_result_digest: prior.result_digest, state_reason: transition.kind, state_at: request.at };
  return lifecycleResult(request.tier, state, transition.kind, lifecycleTerminalLineage(), priorResult, request.at);
}
function totalResultBlob(root, result_digest) {
  try { const chain = bindInputChain(root, 'rule-impact-result'); return readImmutableFile(chain, path.join(chain.parents.at(-1).path, `${result_digest}.json`), result_digest).bytes; } catch { return null; }
}

/** Writes one verified total ER blob then one additive immutable evaluation index row. */
export function recordImpactEvaluation(request = {}) {
  if (!exactOrder(request, ['store', 'stateRoot', 'resultBytes', 'resultDigest', 'expectedLineage']) || !request.store || typeof request.store.recordImpactEvaluation !== 'function' || !Buffer.isBuffer(request.resultBytes) || !validDigest(request.resultDigest)) invalidResultInput();
  const { store, stateRoot, resultBytes, resultDigest, expectedLineage: suppliedLineage } = request;
  let parsed;
  try { parsed = parseImpactEvaluationBytes(resultBytes); } catch (error) { if (error?.message === 'RULE_IMPACT_RESULT_IDENTITY_INVALID') throw error; invalidResultInput(); }
  const lineage = expectedLineage(suppliedLineage, false, parsed.artifact.state === 'blocked');
  if (parsed.result_digest !== resultDigest) throw new Error('RULE_IMPACT_RESULT_IDENTITY_INVALID');
  if (!erLineageMatches(parsed.artifact, lineage)) invalidResultInput();
  try {
    writeImmutableInput(stateRoot, { input_digest: parsed.result_digest, bytes: resultBytes }, { directoryName: 'rule-impact-result' });
    const selector = IMPACT_EVALUATION_ACTIVE_STATES.has(parsed.artifact.state) ? evaluationSelector(parsed.artifact) : undefined;
    const stored = store.recordImpactEvaluation({ result_id: parsed.result_id, result_identity_digest: parsed.result_identity_digest, result_digest: parsed.result_digest, state: parsed.artifact.state, lineage_json: JSON.stringify(lineage), selector });
    return freeze({ outcome: stored.status === 'existing' ? 'existing' : 'recorded', result_id: parsed.result_id, result_identity_digest: parsed.result_identity_digest, result_digest: parsed.result_digest, head_sequence: stored.head_sequence, state: parsed.artifact.state, bytes: Buffer.from(resultBytes) });
  } catch (error) {
    if (error?.message === 'RULE_IMPACT_EVALUATION_CONFLICT') throw new Error('RULE_IMPACT_RESULT_CONFLICT');
    throw new Error('RULE_IMPACT_RESULT_STORAGE_UNAVAILABLE');
  }
}

/** Writes terminal ER bytes inert first; store then atomically indexes bytes and claims parser-bound prior. */
export function recordTerminalImpactEvaluation(request = {}) {
  if (!exactOrder(request, ['store', 'stateRoot', 'resultBytes', 'resultDigest']) || !request.store || typeof request.store.recordImpactEvaluationTerminal !== 'function' || !Buffer.isBuffer(request.resultBytes) || !validDigest(request.resultDigest)) invalidResultInput();
  let parsed;
  try { parsed = parseImpactEvaluationBytes(request.resultBytes); } catch (error) { if (error?.message === 'RULE_IMPACT_RESULT_IDENTITY_INVALID') throw error; invalidResultInput(); }
  if (parsed.result_digest !== request.resultDigest || !['superseded', 'expired'].includes(parsed.artifact.state) || !parsed.artifact.prior_result) invalidResultInput();
  try {
    writeImmutableInput(request.stateRoot, { input_digest: parsed.result_digest, bytes: request.resultBytes }, { directoryName: 'rule-impact-result' });
    const stored = request.store.recordImpactEvaluationTerminal({ terminal_result_id: parsed.result_id, terminal_result_identity_digest: parsed.result_identity_digest, terminal_result_digest: parsed.result_digest });
    return freeze({ outcome: stored.status === 'existing' ? 'existing' : 'recorded', result_id: parsed.result_id, result_identity_digest: parsed.result_identity_digest, result_digest: parsed.result_digest, head_sequence: stored.head_sequence, state: parsed.artifact.state, bytes: Buffer.from(request.resultBytes) });
  } catch (error) {
    if (error?.message === 'RULE_IMPACT_TERMINAL_CONFLICT') throw new Error('RULE_IMPACT_RESULT_CONFLICT');
    throw new Error('RULE_IMPACT_RESULT_STORAGE_UNAVAILABLE');
  }
}

/** Reads only an indexed, byte-reverified total ER whose closed lineage is still current. */
const trustedImpactEvaluationPriors = new WeakMap();
function priorSelector(current) { return { tier: current.tier, scope_id: current.scope_id === null ? '' : current.scope_id, rule_id: current.rule_id, version_hash: current.version_hash, content_hash: current.content_hash, activation_epoch: current.activation_epoch, policy_id: current.policy_id, policy_digest: current.policy_digest }; }
function sameIndexedEvaluation(left, right) { return !!left && !!right && ['result_id', 'result_identity_digest', 'result_digest', 'state', 'lineage_json', 'head_sequence'].every((key) => left[key] === right[key]); }
function readVerifiedImpactEvaluationPrior({ store, stateRoot, selector, allowLinked = false } = {}) {
  const current = expectedLineage(selector, true);
  if (!store || typeof store.findLatestImpactEvaluationPrior !== 'function' || typeof store.readImpactEvaluation !== 'function') invalidResultInput();
  const target = priorSelector(current);
  let row;
  try { row = store.findLatestImpactEvaluationPrior({ selector: target, minimum_head_sequence: current.minimum_head_sequence }); } catch { return { outcome: 'blocked', reason: 'storage_unavailable' }; }
  const parsed = verifyStoredEvaluation({ store, stateRoot, row, selector: target, minimum_head_sequence: current.minimum_head_sequence });
  if (!parsed) return { outcome: 'blocked', reason: 'prior_unavailable' };
  try {
    const reread = store.readImpactEvaluation({ result_id: row.result_id });
    if (!sameIndexedEvaluation(row, reread) || !verifyStoredEvaluation({ store, stateRoot, row: reread, selector: target, minimum_head_sequence: current.minimum_head_sequence })) return { outcome: 'blocked', reason: 'prior_unavailable' };
    if (!allowLinked && typeof store.readImpactEvaluationReplacement === 'function' && store.readImpactEvaluationReplacement({ prior_result_id: row.result_id })) return { outcome: 'blocked', reason: 'prior_unavailable' };
  } catch { return { outcome: 'blocked', reason: 'storage_unavailable' }; }
  return { outcome: 'available', row, parsed };
}

/** Public prior projection remains redacted; trusted bytes use dedicated closed reader below. */
export function readLatestImpactEvaluationPrior({ store, stateRoot, selector } = {}) {
  const verified = readVerifiedImpactEvaluationPrior({ store, stateRoot, selector });
  if (verified.outcome !== 'available') return freeze(verified);
  const { parsed, row } = verified;
  return freeze({ outcome: 'available', result_id: parsed.result_id, result_digest_prefix: parsed.result_digest.slice(0, 12), state: parsed.artifact.state, head_sequence: row.head_sequence });
}

/** Internal trusted-consumer API. It accepts selector only, never a caller-supplied row. */
export function readTrustedImpactEvaluationPrior({ store, stateRoot, selector } = {}) {
  const verified = readVerifiedImpactEvaluationPrior({ store, stateRoot, selector });
  if (verified.outcome !== 'available') return freeze(verified);
  const result = freeze({ outcome: 'available', result_id: verified.parsed.result_id, result_digest: verified.parsed.result_digest, head_sequence: verified.row.head_sequence, bytes: Buffer.from(verified.parsed.bytes) });
  trustedImpactEvaluationPriors.set(result, freeze({ bytes: Buffer.from(verified.parsed.bytes), head_sequence: verified.row.head_sequence }));
  return result;
}

export function linkImpactEvaluationReplacement({ store, stateRoot, priorResultId, nextResultId, linkedAt } = {}) {
  if (!store || typeof store.readImpactEvaluation !== 'function' || typeof store.linkImpactEvaluationReplacement !== 'function' || !validTime(linkedAt)) invalidResultInput();
  const prior = verifyStoredEvaluation({ store, stateRoot, row: store.readImpactEvaluation({ result_id: priorResultId }) });
  const next = verifyStoredEvaluation({ store, stateRoot, row: store.readImpactEvaluation({ result_id: nextResultId }) });
  if (!prior || !next || !IMPACT_EVALUATION_ACTIVE_STATES.has(prior.artifact.state) || !IMPACT_EVALUATION_ACTIVE_STATES.has(next.artifact.state) || JSON.stringify(evaluationSelector(prior.artifact)) !== JSON.stringify(evaluationSelector(next.artifact))) return freeze({ outcome: 'blocked', reason: 'replacement_unavailable' });
  try { const linked = store.linkImpactEvaluationReplacement({ prior_result_id: priorResultId, next_result_id: nextResultId, linked_at: linkedAt }); return freeze({ outcome: linked.status === 'existing' ? 'existing' : 'linked' }); } catch (error) { if (error?.message === 'RULE_IMPACT_REPLACEMENT_CONFLICT') return freeze({ outcome: 'conflict' }); return freeze({ outcome: 'blocked', reason: 'storage_unavailable' }); }
}

function verifiedImpactEvaluationReplacement({ store, stateRoot, priorResultId } = {}) {
  if (!store || typeof store.readImpactEvaluationReplacement !== 'function' || typeof store.readImpactEvaluation !== 'function') invalidResultInput();
  let relation;
  try { relation = store.readImpactEvaluationReplacement({ prior_result_id: priorResultId }); } catch { return { outcome: 'blocked', reason: 'storage_unavailable' }; }
  if (!relation) return { outcome: 'blocked', reason: 'missing_replacement' };
  try {
    const priorRow = store.readImpactEvaluation({ result_id: relation.prior_result_id }); const nextRow = store.readImpactEvaluation({ result_id: relation.next_result_id });
    const prior = verifyStoredEvaluation({ store, stateRoot, row: priorRow }); const next = verifyStoredEvaluation({ store, stateRoot, row: nextRow });
    const reread = store.readImpactEvaluationReplacement({ prior_result_id: relation.prior_result_id });
    if (!prior || !next || !reread || reread.prior_result_id !== relation.prior_result_id || reread.next_result_id !== relation.next_result_id || reread.linked_at !== relation.linked_at || !IMPACT_EVALUATION_ACTIVE_STATES.has(prior.artifact.state) || !IMPACT_EVALUATION_ACTIVE_STATES.has(next.artifact.state) || JSON.stringify(evaluationSelector(prior.artifact)) !== JSON.stringify(evaluationSelector(next.artifact))) return { outcome: 'blocked', reason: 'replacement_unavailable' };
    return { outcome: 'available', relation, prior, next };
  } catch { return { outcome: 'blocked', reason: 'storage_unavailable' }; }
}

export function readImpactEvaluationReplacement({ store, stateRoot, priorResultId } = {}) {
  const verified = verifiedImpactEvaluationReplacement({ store, stateRoot, priorResultId });
  if (verified.outcome !== 'available') return freeze(verified);
  const { relation } = verified;
  return freeze({ outcome: 'available', prior_result_id: relation.prior_result_id, next_result_id: relation.next_result_id, linked_at: relation.linked_at });
}

/** Internal replacement proof exposes only successor identity/digest after relation and both blobs reverify. */
export function readTrustedImpactEvaluationReplacement({ store, stateRoot, priorResultId } = {}) {
  const verified = verifiedImpactEvaluationReplacement({ store, stateRoot, priorResultId });
  if (verified.outcome !== 'available') return freeze(verified);
  return freeze({ outcome: 'available', next_result_id: verified.next.result_id, next_result_digest: verified.next.result_digest });
}

const FRESH_CURRENT_AUTHORITY_KEYS = Object.freeze(['target', 'policy_id', 'policy_digest', 'resolver_snapshot_id', 'resolver_snapshot_digest', 'exposure_id', 'exposure_publication_digest', 'measurement_input_id', 'measurement_input_digest', 'evaluation_input_digest']);
const API09_RESULT_KEYS = Object.freeze(['outcome', 'input_bytes', 'evaluation_input_digest', 'measurement_input_id', 'measurement_input_digest', 'lineage']);
const API09_LINEAGE_KEYS = Object.freeze(['tier', 'scope_id', 'rule_id', 'version_hash', 'activation_epoch', 'measurement_input_digest', 'evaluation_input_digest']);
function currentBlocked(reason) { return freeze({ outcome: 'blocked', reason }); }
function missingFreshAuthority(value) { return FRESH_CURRENT_AUTHORITY_KEYS.find((key) => !Object.hasOwn(value || {}, key)); }
/** Derives exact ExpectedCurrent only from API-09 aggregate output, fresh authority, and a trusted prior capability. */
export function buildExpectedCurrentFromApi09({ api09, freshAuthority, verifiedPrior, minimumHeadSequence } = {}) {
  const missing = missingFreshAuthority(freshAuthority);
  if (missing) return currentBlocked(`fresh_authority_${missing}_missing`);
  if (!exactOrder(freshAuthority, FRESH_CURRENT_AUTHORITY_KEYS) || !validTarget(freshAuthority.target, freshAuthority.target?.scope_id ?? null)) return currentBlocked('fresh_authority_invalid');
  const prior = trustedImpactEvaluationPriors.get(verifiedPrior);
  if (!prior || !Number.isSafeInteger(minimumHeadSequence) || minimumHeadSequence !== prior.head_sequence) return currentBlocked('verified_prior_unavailable');
  if (!exactOrder(api09, API09_RESULT_KEYS) || api09.outcome !== 'ready' || !Buffer.isBuffer(api09.input_bytes) || !validDigest(api09.evaluation_input_digest) || digest(api09.input_bytes) !== api09.evaluation_input_digest || !validDigest(api09.measurement_input_digest) || api09.measurement_input_id !== `rule-impact-input:${api09.measurement_input_digest}` || !exactOrder(api09.lineage, API09_LINEAGE_KEYS)) return currentBlocked('api09_authority_invalid');
  let input; try { input = JSON.parse(api09.input_bytes); } catch { return currentBlocked('api09_authority_invalid'); }
  if (!input || input.schema !== 'rule-impact-evaluator-input-v1' || input.input_digest !== api09.measurement_input_digest || canonical(input) !== api09.input_bytes.toString('utf8') || canonical(input.evaluated_target) !== canonical(freshAuthority.target)) return currentBlocked('api09_target_drift');
  const lineage = api09.lineage;
  if (lineage.tier !== freshAuthority.target.tier || lineage.scope_id !== freshAuthority.target.scope_id || lineage.rule_id !== freshAuthority.target.rule_id || lineage.version_hash !== freshAuthority.target.version_hash || lineage.activation_epoch !== freshAuthority.target.activation_epoch || lineage.measurement_input_digest !== api09.measurement_input_digest || lineage.evaluation_input_digest !== api09.evaluation_input_digest || freshAuthority.measurement_input_id !== api09.measurement_input_id || freshAuthority.measurement_input_digest !== api09.measurement_input_digest || freshAuthority.evaluation_input_digest !== api09.evaluation_input_digest) return currentBlocked('api09_aggregate_drift');
  const current = { tier: freshAuthority.target.tier, scope_id: freshAuthority.target.scope_id, rule_id: freshAuthority.target.rule_id, version_hash: freshAuthority.target.version_hash, content_hash: freshAuthority.target.content_hash, accepted_commit: freshAuthority.target.accepted_commit, activation_epoch: freshAuthority.target.activation_epoch, policy_id: freshAuthority.policy_id, policy_digest: freshAuthority.policy_digest, resolver_snapshot_id: freshAuthority.resolver_snapshot_id, resolver_snapshot_digest: freshAuthority.resolver_snapshot_digest, exposure_id: freshAuthority.exposure_id, exposure_publication_digest: freshAuthority.exposure_publication_digest, measurement_input_id: freshAuthority.measurement_input_id, measurement_input_digest: freshAuthority.measurement_input_digest, evaluation_input_digest: freshAuthority.evaluation_input_digest, minimum_head_sequence: minimumHeadSequence };
  try { expectedLineage(current, true); } catch { return currentBlocked('fresh_authority_invalid'); }
  return freeze(current);
}

export function readImpactEvaluation({ store, stateRoot, resultId, expectedCurrent } = {}) {
  const current = expectedLineage(expectedCurrent, true);
  if (!store || typeof store.readImpactEvaluation !== 'function' || typeof resultId !== 'string' || !/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(resultId)) invalidResultInput();
  let row;
  try { row = store.readImpactEvaluation({ result_id: resultId }); } catch { return freeze({ outcome: 'blocked', reason: 'storage_unavailable' }); }
  if (!row) return freeze({ outcome: 'blocked', reason: 'missing_index' });
  if (row.head_sequence < current.minimum_head_sequence) return freeze({ outcome: 'blocked', reason: 'head_rollback' });
  let lineage; try { lineage = JSON.parse(row.lineage_json); } catch { return freeze({ outcome: 'blocked', reason: 'legacy_result_schema' }); }
  if (JSON.stringify(lineage) !== JSON.stringify(Object.fromEntries(EXPECTED_LINEAGE_KEYS.map((key) => [key, current[key]])))) return freeze({ outcome: 'blocked', reason: 'lineage_mismatch' });
  const bytes = totalResultBlob(stateRoot, row.result_digest);
  if (!bytes) return freeze({ outcome: 'blocked', reason: 'storage_unavailable' });
  let parsed;
  try { parsed = parseImpactEvaluationBytes(bytes); } catch (error) { return freeze({ outcome: 'blocked', reason: error?.message === 'RULE_IMPACT_RESULT_IDENTITY_INVALID' ? 'identity_mismatch' : 'unknown_schema' }); }
  if (parsed.result_id !== row.result_id || parsed.result_identity_digest !== row.result_identity_digest) return freeze({ outcome: 'blocked', reason: 'identity_mismatch' });
  if (parsed.result_digest !== row.result_digest) return freeze({ outcome: 'blocked', reason: 'digest_mismatch' });
  if (!erLineageMatches(parsed.artifact, current)) return freeze({ outcome: 'blocked', reason: 'lineage_mismatch' });
  return freeze({ outcome: 'available', result_id: parsed.result_id, result_identity_digest: parsed.result_identity_digest, result_digest: parsed.result_digest, head_sequence: row.head_sequence, state: parsed.artifact.state, bytes });
}
function hasPrivate(value) { return typeof value === 'string' ? PRIVATE_SENTINEL.test(value) : Array.isArray(value) ? value.some(hasPrivate) : value && typeof value === 'object' ? Object.entries(value).some(([key, item]) => hasPrivate(key) || hasPrivate(item)) : false; }
function exactKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function validDigest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function validText(value) { return typeof value === 'string' && value.length > 0 && value.normalize('NFC') === value && !FORBIDDEN_TEXT.test(value) && !PRIVATE_SENTINEL.test(value); }
function validTime(value) { return typeof value === 'string' && RFC3339_MILLIS.test(value) && Number.isFinite(Date.parse(value)); }
function validMap(value) { const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []; const normalized = new Set(keys.map((key) => key.normalize('NFC'))); return !!value && typeof value === 'object' && !Array.isArray(value) && normalized.size === keys.length && keys.every((key) => validText(key) && Number.isFinite(value[key])); }
function validHeadMap(value) { const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []; const normalized = new Set(keys.map((key) => key.normalize('NFC'))); return !!value && typeof value === 'object' && !Array.isArray(value) && normalized.size === keys.length && keys.every((key) => validText(key) && /^[a-f0-9]{40}$/.test(value[key])); }
function orderedKeys(value, keys) { return exactKeys(value, keys) && Object.keys(value).every((key, index) => key === keys[index]); }
function orderedUniqueText(values) { return Array.isArray(values) && values.length === new Set(values).size && values.every(validText) && values.join('\0') === [...values].sort(scalarCompare).join('\0'); }
function validClosedRange(value) { return Number.isFinite(value.valid_min) && Number.isFinite(value.valid_max) && value.valid_min < value.valid_max && typeof value.valid_min_inclusive === 'boolean' && typeof value.valid_max_inclusive === 'boolean'; }
function validCovariateBin(value) { return orderedKeys(value, ['bin_id', 'ordinal', 'valid_min', 'valid_max', 'valid_min_inclusive', 'valid_max_inclusive']) && validText(value.bin_id) && Number.isSafeInteger(value.ordinal) && value.ordinal >= 0 && validClosedRange(value); }
function validImpactDimension(value) {
  return orderedKeys(value, ['id', 'role', 'extractor_id', 'extractor_version', 'value_type', 'unit', 'valid_min', 'valid_max', 'valid_min_inclusive', 'valid_max_inclusive', 'adverse_direction', 'absolute_materiality', 'required_raw_covariates']) && validText(value.id) && ['primary', 'guardrail', 'benefit'].includes(value.role) && validText(value.extractor_id) && validText(value.extractor_version) && ['binary', 'continuous'].includes(value.value_type) && validText(value.unit) && validClosedRange(value) && ['higher', 'lower'].includes(value.adverse_direction) && Number.isFinite(value.absolute_materiality) && value.absolute_materiality > 0 && orderedUniqueText(value.required_raw_covariates);
}
function validRawCovariate(value) {
  if (!orderedKeys(value, ['id', 'unit', 'valid_min', 'valid_max', 'valid_min_inclusive', 'valid_max_inclusive', 'bins']) || !validText(value.id) || !validText(value.unit) || !validClosedRange(value) || !Array.isArray(value.bins) || !value.bins.length || !value.bins.every(validCovariateBin) || new Set(value.bins.map((bin) => bin.bin_id)).size !== value.bins.length || new Set(value.bins.map((bin) => bin.ordinal)).size !== value.bins.length) return false;
  const bins = value.bins;
  if (bins.some((bin, index) => index && (bins[index - 1].ordinal >= bin.ordinal || bins[index - 1].valid_min > bin.valid_min || (bins[index - 1].valid_min === bin.valid_min && bins[index - 1].valid_max > bin.valid_max)))) return false;
  if (bins[0].valid_min !== value.valid_min || bins[0].valid_min_inclusive !== value.valid_min_inclusive || bins.at(-1).valid_max !== value.valid_max || bins.at(-1).valid_max_inclusive !== value.valid_max_inclusive) return false;
  return bins.every((bin, index) => !index || (bins[index - 1].valid_max === bin.valid_min && bins[index - 1].valid_max_inclusive !== bin.valid_min_inclusive));
}
function parseImpactContract(measurement) {
  if (typeof measurement.impact_contract_bytes !== 'string' || !validDigest(measurement.impact_contract_digest) || digest(Buffer.from(measurement.impact_contract_bytes, 'utf8')) !== measurement.impact_contract_digest) return null;
  try {
    const contract = JSON.parse(measurement.impact_contract_bytes);
    const keys = ['contract_id', 'contract_version', 'created_at', 'valid_from', 'outcome_definition_id', 'outcome_definition_version', 'dimensions', 'raw_covariates'];
    if (!orderedKeys(contract, keys) || !['contract_id', 'contract_version', 'outcome_definition_id', 'outcome_definition_version'].every((key) => validText(contract[key])) || !validTime(contract.created_at) || !validTime(contract.valid_from) || !Array.isArray(contract.dimensions) || !contract.dimensions.length || !contract.dimensions.every(validImpactDimension) || new Set(contract.dimensions.map((dimension) => dimension.id)).size !== contract.dimensions.length || !Array.isArray(contract.raw_covariates) || !contract.raw_covariates.every(validRawCovariate) || new Set(contract.raw_covariates.map((covariate) => covariate.id)).size !== contract.raw_covariates.length || canonical(contract) !== measurement.impact_contract_bytes) return null;
    const roles = contract.dimensions.map((dimension) => dimension.role); const guardrails = contract.dimensions.filter((dimension) => dimension.role === 'guardrail').map((dimension) => dimension.id);
    const required = [...new Set(contract.dimensions.flatMap((dimension) => dimension.required_raw_covariates))].sort(scalarCompare);
    if (roles.filter((role) => role === 'primary').length !== 1 || roles.filter((role) => role === 'benefit').length > 1 || roles[0] !== 'primary' || guardrails.join('\0') !== [...guardrails].sort(scalarCompare).join('\0') || (roles.includes('benefit') && roles.at(-1) !== 'benefit') || required.join('\0') !== contract.raw_covariates.map((covariate) => covariate.id).join('\0')) return null;
    return contract;
  } catch { return null; }
}
function validOutcome(measurement, contract) {
  const dimensions = contract.dimensions;
  const covariates = contract.raw_covariates;
  if (measurement.impact_contract_ref !== contract.contract_id || !validMap(measurement.outcome_vector) || !validMap(measurement.raw_pre_outcome_covariates) || Object.keys(measurement.outcome_vector).join('\0') !== dimensions.map((dimension) => dimension.id).sort(scalarCompare).join('\0') || Object.keys(measurement.raw_pre_outcome_covariates).join('\0') !== covariates.map((covariate) => covariate.id).join('\0')) return false;
  const inRange = (value, definition) => Number.isFinite(value) && (definition.valid_min_inclusive ? value >= definition.valid_min : value > definition.valid_min) && (definition.valid_max_inclusive ? value <= definition.valid_max : value < definition.valid_max);
  return dimensions.every((dimension) => inRange(measurement.outcome_vector[dimension.id], dimension) && (dimension.value_type !== 'binary' || (measurement.outcome_vector[dimension.id] === 0 || measurement.outcome_vector[dimension.id] === 1))) && covariates.every((covariate) => inRange(measurement.raw_pre_outcome_covariates[covariate.id], covariate));
}
function validTarget(target, scope) {
  return target && typeof target === 'object' && exactKeys(target, TARGET_KEYS) && target.lifecycle_state === 'active' && ['global', 'project'].includes(target.tier) && ((target.tier === 'global' && target.scope_id === null) || (target.tier === 'project' && target.scope_id === scope))
    && validText(target.rule_id) && validDigest(target.version_hash) && validDigest(target.content_hash) && /^[a-f0-9]{40}$/.test(target.accepted_commit) && validDigest(target.mirror_digest) && validText(target.activation_epoch) && validText(target.protection_class) && validText(target.agent) && Array.isArray(target.applicability) && target.applicability.every(validText) && Array.isArray(target.phases) && target.phases.every(validText);
}
function validNarrowing(value) { return orderedKeys(value, NARROWING_KEYS) && validText(value.rule_id) && ['locally_pinned', 'locally_stopped'].includes(value.state); }
function validResolverSnapshot(snapshot) {
  const keys = FIXED_KEYS['pidex-rule-resolver-snapshot-v1'];
  return exactKeys(snapshot, keys) && snapshot.schema === 'pidex-rule-resolver-snapshot-v1' && validText(snapshot.snapshot_id) && snapshot.resolver_revision === '045-S2' && uint(snapshot.projection_revision) && validText(snapshot.scope_id) && validTime(snapshot.created_at) && ['verified', 'degraded'].includes(snapshot.quality) && Array.isArray(snapshot.reason_codes) && snapshot.reason_codes.every(validText) && Array.isArray(snapshot.active_rules) && snapshot.active_rules.every((target) => validTarget(target, snapshot.scope_id)) && validHeadMap(snapshot.source_heads) && validHeadMap(snapshot.mirror_heads) && Array.isArray(snapshot.narrowing) && snapshot.narrowing.every(validNarrowing);
}
function derivedBoundary(snapshot, fresh, target) {
  const exactTarget = snapshot.active_rules.find((entry) => canonical(entry) === canonical(target));
  if (!exactTarget) return null;
  return { target_rule: exactTarget, active_rules: snapshot.active_rules, non_target_rules: snapshot.active_rules.filter((entry) => canonical(entry) !== canonical(exactTarget)).map(({ rule_id, version_hash }) => ({ rule_id, version_hash })), source_heads: snapshot.source_heads, mirror_heads: snapshot.mirror_heads, scope_id: snapshot.scope_id, projection_revision: snapshot.projection_revision, activation_epoch: exactTarget.activation_epoch, runtime_digest: digest(Buffer.from(canonical(fresh))) };
}
function validAuthority(authority) {
  const top = ['captured_at', 'exposure_publication', 'fresh_runtime', 'resolver_boundary'];
  const exposure = ['run_id', 'terminal_outcome_ref', 'reconciliation_revision', 'snapshot_id', 'exposure_id', 'publication_digest', 'publication_state'];
  const runtime = ['schema', 'pipeline_id', 'input_digests', 'supplied_context_attestation', 'resolver_snapshot_bytes', 'resolver_snapshot_digest'];
  const boundary = BOUNDARY_KEYS;
  if (!exactKeys(authority, top) || !validTime(authority.captured_at) || !exactKeys(authority.exposure_publication, exposure) || !validText(authority.exposure_publication.run_id) || !validText(authority.exposure_publication.terminal_outcome_ref) || !validText(authority.exposure_publication.reconciliation_revision) || !validText(authority.exposure_publication.snapshot_id) || !/^exposure:[a-f0-9]{64}$/.test(authority.exposure_publication.exposure_id) || !validDigest(authority.exposure_publication.publication_digest) || !['COMMITTED_VERIFIED', 'COMMITTED_WITNESSED'].includes(authority.exposure_publication.publication_state)) return false;
  const fresh = authority.fresh_runtime;
  if (!exactKeys(fresh, runtime) || fresh.schema !== 'pidex-rule-runtime-context-v1' || !validText(fresh.pipeline_id) || !exactKeys(fresh.input_digests, FIXED_KEYS['pidex-rule-runtime-input-digests-v1']) || fresh.input_digests.schema !== 'pidex-rule-runtime-input-digests-v1' || FIXED_KEYS['pidex-rule-runtime-input-digests-v1'].slice(1).some((key) => !validDigest(fresh.input_digests[key])) || fresh.supplied_context_attestation !== 'attested' || typeof fresh.resolver_snapshot_bytes !== 'string' || digest(Buffer.from(fresh.resolver_snapshot_bytes)) !== fresh.resolver_snapshot_digest) return false;
  let snapshot; try { snapshot = JSON.parse(fresh.resolver_snapshot_bytes); } catch { return false; }
  if (!validResolverSnapshot(snapshot) || canonical(snapshot) !== fresh.resolver_snapshot_bytes || authority.exposure_publication.snapshot_id !== snapshot.snapshot_id) return false;
  const boundaryValue = authority.resolver_boundary;
  const expectedBoundary = derivedBoundary(snapshot, fresh, boundaryValue?.target_rule);
  return !!expectedBoundary && exactKeys(boundaryValue, boundary) && canonical(boundaryValue) === canonical(expectedBoundary);
}
function schemaInvalid(measurement) {
  if (!measurement || typeof measurement !== 'object' || Array.isArray(measurement) || Object.keys(measurement).some((key) => !MEASUREMENT_KEY_SET.has(key))) return true;
  for (const [key, value] of Object.entries(measurement)) {
    if (key === 'schema' && value !== 'rule-impact-measurement-v1') return true;
    if (['capability_set'].includes(key) && (!Array.isArray(value) || !value.length || value.some((entry) => !validText(entry)) || [...new Set(value)].length !== value.length || [...value].sort().join('\0') !== value.join('\0'))) return true;
    if (['raw_pre_outcome_covariates', 'outcome_vector'].includes(key) && !validMap(value)) return true;
    if (['production_started_at', 'outcome_finalized_at'].includes(key) && !validTime(value)) return true;
    if (['impact_contract_digest', 'outcome_source_digest', 'config_digest'].includes(key) && !validDigest(value)) return true;
    if (!['schema', 'capability_set', 'raw_pre_outcome_covariates', 'outcome_vector', 'production_started_at', 'outcome_finalized_at', 'impact_contract_digest', 'outcome_source_digest', 'impact_contract_bytes'].includes(key) && !validText(value)) return true;
  }
  return false;
}
function canonicalMeasurement(measurement) { return Object.fromEntries(MEASUREMENT_KEYS.filter((key) => Object.hasOwn(measurement, key)).map((key) => [key, measurement[key]])); }
function reasonFor(measurement, capturedAt) {
  if (schemaInvalid(measurement)) return 'measurement_schema_invalid';
  for (const [reason, keys] of Object.entries(REQUIRED)) if (keys.some((key) => !Object.hasOwn(measurement, key))) return reason;
  const contract = parseImpactContract(measurement);
  if (!contract || measurement.impact_contract_ref !== contract.contract_id || contract.created_at >= measurement.production_started_at || contract.outcome_definition_id !== measurement.outcome_definition_id || contract.outcome_definition_version !== measurement.outcome_definition_version) return 'impact_contract_invalid';
  if (!validOutcome(measurement, contract)) return 'outcome_invalid';
  if (measurement.outcome_finalized_at < measurement.production_started_at || measurement.outcome_finalized_at > capturedAt) return 'outcome_not_final';
  return null;
}

/** Builds digest-covered rule-impact-input-v1 bytes; private or pre-payload failures never serialize. */
export function buildRuleImpactInput({ authority, measurement } = {}) {
  if (hasPrivate(authority) || hasPrivate(measurement)) return Object.freeze({ outcome: 'private_data_rejected' });
  if (!validAuthority(authority)) return Object.freeze({ outcome: authority?.fresh_runtime?.supplied_context_attestation === 'attested' ? 'resolver_invalid' : 'runtime_unattested' });
  const reason = reasonFor(measurement, authority.captured_at);
  const malformed = reason === 'measurement_schema_invalid';
  const safeMeasurement = malformed ? {} : canonicalMeasurement(measurement);
  const payload = { schema: 'rule-impact-input-v1', captured_at: authority.captured_at, exposure_publication: authority.exposure_publication, fresh_runtime: authority.fresh_runtime, resolver_boundary: authority.resolver_boundary, measurement: safeMeasurement, measurement_present_keys: malformed ? [] : Object.keys(safeMeasurement).sort(), collection_disposition: reason ? 'blocked' : 'eligible', ...(reason ? { collection_reason: reason } : {}) };
  const bytes = Buffer.from(canonical(payload), 'utf8'); const input_digest = digest(bytes);
  return Object.freeze({ input_id: `rule-impact-input:${input_digest}`, input_digest, bytes, collection_disposition: payload.collection_disposition, ...(reason ? { collection_reason: reason } : {}) });
}

function targetKey(target) { return [target.tier, target.scope_id || '', target.rule_id, target.version_hash, target.activation_epoch].join('\0'); }
function normalizedTargets(authority) {
  const boundary = authority?.resolver_boundary;
  if (!Array.isArray(boundary?.active_rules) || !boundary.active_rules.length || boundary.active_rules.some((target) => !validTarget(target, boundary.scope_id))) return null;
  const byKey = new Map();
  for (const target of boundary.active_rules) { const key = targetKey(target); const previous = byKey.get(key); if (previous && canonical(previous) !== canonical(target)) return null; byKey.set(key, target); }
  return [...byKey.values()].sort((left, right) => targetKey(left).localeCompare(targetKey(right)));
}
function fanoutFingerprint(authority, records) {
  const exposure = authority.exposure_publication;
  const target_descriptors = records.map(({ target, input }) => ({ ...target, source_heads: authority.resolver_boundary.source_heads, mirror_heads: authority.resolver_boundary.mirror_heads, projection_revision: authority.resolver_boundary.projection_revision, runtime_digest: authority.resolver_boundary.runtime_digest, target_input_id: input.input_id, target_input_digest: input.input_digest }));
  return digest(Buffer.from(canonical({ exposure_identity: { exposure_id: exposure.exposure_id, publication_digest: exposure.publication_digest }, target_descriptors }), 'utf8'));
}
function storageFailure(fault, phase, ordinal) { return fault && fault.phase === phase && (fault.ordinal === undefined || fault.ordinal === ordinal); }
function storageReason(fault, records) {
  if (fault?.phase === 'pre_serialization') return 'pre_serialization_storage_unavailable';
  if (fault?.phase?.startsWith('index_') || fault?.phase === 'before_index') return 'index_storage_unavailable';
  if (fault?.ordinal > 0 || fault?.phase === 'after_final') return records.length > 1 ? 'partial_blob_storage_unavailable' : 'index_storage_unavailable';
  return 'pre_blob_storage_unavailable';
}
function storageUnavailable() { return Object.assign(new Error('RULE_IMPACT_STORAGE_UNAVAILABLE'), { code: 'RULE_IMPACT_STORAGE_UNAVAILABLE' }); }
function pathIdentity(target) { return lstatSync(target, { bigint: true }); }
function descriptorIdentity(descriptor) { return fstatSync(descriptor, { bigint: true }); }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function contained(root, target) { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function boundDirectory(rootReal, member, prior) {
  let stat; let real;
  try { stat = pathIdentity(member); real = realpathSync(member); } catch { throw storageUnavailable(); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || !contained(rootReal, real) || (prior && !sameIdentity(stat, prior))) throw storageUnavailable();
  return stat;
}
function boundFile(rootReal, member, prior) {
  let stat; let real;
  try { stat = pathIdentity(member); real = realpathSync(member); } catch { throw storageUnavailable(); }
  if (!stat.isFile() || stat.isSymbolicLink() || !contained(rootReal, real) || (prior && !sameIdentity(stat, prior))) throw storageUnavailable();
  return stat;
}
export function bindInputChain(stateRoot, directoryName = 'rule-impact-input') {
  if (!path.isAbsolute(stateRoot) || stateRoot !== path.resolve(stateRoot)) throw storageUnavailable();
  const root = stateRoot; let rootIdentity; let rootReal;
  try { rootIdentity = pathIdentity(root); rootReal = realpathSync(root); } catch { throw storageUnavailable(); }
  if (!rootIdentity.isDirectory() || rootIdentity.isSymbolicLink() || rootReal !== root) throw storageUnavailable();
  const chain = { root, rootReal, rootIdentity, parents: [] };
  let current = root;
  for (const part of ['quality', directoryName]) {
    boundDirectory(rootReal, current, current === root ? chain.rootIdentity : chain.parents.at(-1)?.identity);
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    chain.parents.push({ path: current, identity: boundDirectory(rootReal, current) });
  }
  return chain;
}
function revalidateInputChain(chain) {
  chain.rootIdentity = boundDirectory(chain.rootReal, chain.root, chain.rootIdentity);
  chain.parents = chain.parents.map((member) => ({ ...member, identity: boundDirectory(chain.rootReal, member.path, member.identity) }));
}
function checkpoint(fault, ordinal, name, phase, chain) {
  revalidateInputChain(chain);
  fault?.checkpoint?.(name, phase, chain);
  revalidateInputChain(chain);
  if (storageFailure(fault, `${name}_${phase}`, ordinal)) throw storageUnavailable();
}
function syncDirectory(directory, witness) {
  let descriptor;
  try {
    if (process.platform === 'win32') {
      if (!witness) throw storageUnavailable();
      const named = boundFile(witness.chain.rootReal, witness.file, witness.identity);
      descriptor = openSync(witness.file, 'r+'); const opened = descriptorIdentity(descriptor);
      if (!sameIdentity(named, opened)) throw storageUnavailable();
      fsyncSync(descriptor); const after = descriptorIdentity(descriptor);
      if (!sameIdentity(opened, after)) throw storageUnavailable();
      closeSync(descriptor); descriptor = undefined;
      verifyImmutableFile(witness.chain, witness.file, witness.bytes, witness.digest, after);
      return;
    }
    descriptor = openSync(directory, 'r'); fsyncSync(descriptor);
  } catch (error) { if (error?.message === 'RULE_IMPACT_BLOB_COLLISION') throw error; throw storageUnavailable(); } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function noFollowFlag() { if (process.platform === 'win32') return 0; if (Number.isInteger(constants.O_NOFOLLOW)) return constants.O_NOFOLLOW; throw storageUnavailable(); }
export function readImmutableFile(chain, file, expectedDigest, identity) {
  revalidateInputChain(chain); let descriptor;
  try {
    descriptor = openSync(file, constants.O_RDONLY | noFollowFlag());
    const opened = descriptorIdentity(descriptor); const current = boundFile(chain.rootReal, file, identity);
    if (!opened.isFile() || !sameIdentity(opened, current)) throw storageUnavailable();
    const actual = readFileSync(descriptor);
    if (digest(actual) !== expectedDigest) throw new Error('RULE_IMPACT_BLOB_COLLISION');
    revalidateInputChain(chain);
    if (!sameIdentity(opened, boundFile(chain.rootReal, file, opened))) throw storageUnavailable();
    return { bytes: actual, identity: opened };
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function verifyImmutableFile(chain, file, bytes, expectedDigest, identity) {
  const actual = readImmutableFile(chain, file, expectedDigest, identity);
  if (!actual.bytes.equals(bytes)) throw new Error('RULE_IMPACT_BLOB_COLLISION');
  return actual.identity;
}
export function writeImmutableInput(root, input, { fault, ordinal, directoryName = 'rule-impact-input' } = {}) {
  const chain = bindInputChain(root, directoryName);
  const directory = chain.parents.at(-1).path;
  const destination = path.join(directory, `${input.input_digest}.json`);
  const stage = path.join(directory, `.${input.input_digest}.${randomUUID()}.tmp`);
  let descriptor; let stageIdentity;
  try {
    checkpoint(fault, ordinal, 'stage', 'pre', chain); checkpoint(fault, ordinal, 'stage_open', 'pre', chain);
    if (storageFailure(fault, 'before_stage', ordinal)) throw storageUnavailable();
    descriptor = openSync(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(), 0o600); stageIdentity = descriptorIdentity(descriptor);
    if (!stageIdentity.isFile() || !sameIdentity(stageIdentity, boundFile(chain.rootReal, stage))) throw storageUnavailable();
    checkpoint(fault, ordinal, 'stage_open', 'post', chain); checkpoint(fault, ordinal, 'write', 'pre', chain); checkpoint(fault, ordinal, 'write_fsync', 'pre', chain);
    writeFileSync(descriptor, input.bytes); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    checkpoint(fault, ordinal, 'write_fsync', 'post', chain); checkpoint(fault, ordinal, 'write', 'post', chain);
    if (storageFailure(fault, 'during_write', ordinal)) throw storageUnavailable();
    stageIdentity = verifyImmutableFile(chain, stage, input.bytes, input.input_digest, stageIdentity);
    checkpoint(fault, ordinal, 'link', 'pre', chain);
    try { linkSync(stage, destination); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    checkpoint(fault, ordinal, 'link', 'post', chain); checkpoint(fault, ordinal, 'destination_read', 'pre', chain);
    const destinationIdentity = verifyImmutableFile(chain, destination, input.bytes, input.input_digest);
    checkpoint(fault, ordinal, 'destination_read', 'post', chain); checkpoint(fault, ordinal, 'parent_fsync', 'pre', chain); checkpoint(fault, ordinal, 'directory_fsync', 'pre', chain);
    if (storageFailure(fault, 'directory_fsync_unsupported', ordinal)) throw storageUnavailable();
    syncDirectory(directory, { chain, file: destination, bytes: input.bytes, digest: input.input_digest, identity: destinationIdentity });
    checkpoint(fault, ordinal, 'directory_fsync', 'post', chain); checkpoint(fault, ordinal, 'parent_fsync', 'post', chain); checkpoint(fault, ordinal, 'final_return', 'pre', chain);
    if (storageFailure(fault, 'after_final', ordinal)) throw storageUnavailable();
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { if (stageIdentity) { checkpoint(fault, ordinal, 'cleanup', 'pre', chain); boundFile(chain.rootReal, stage, stageIdentity); rmSync(stage); checkpoint(fault, ordinal, 'cleanup', 'post', chain); } } catch { /* drifted stage is inert and never cleanup authority */ }
  }
}

/** Captures one complete immutable target fanout; only committed lifecycle indexes grant input authority. */
function resultArtifact({ input, expected, created_at }) {
  if (!input?.bytes || !expected || !validTime(created_at) || hasPrivate(expected) || !['global', 'project'].includes(expected.tier) || !validDigest(expected.policy_digest) || !validDigest(expected.snapshot_digest) || !validDigest(expected.publication_digest) || !validDigest(expected.input_digest) || expected.input_id !== `rule-impact-input:${expected.input_digest}` || (expected.tier === 'global' ? expected.scope_id !== null : typeof expected.scope_id !== 'string' || !expected.scope_id)) return null;
  let payload; try { payload = JSON.parse(input.bytes); } catch { return null; }
  const target = payload?.resolver_boundary?.target_rule;
  if (!validTarget(target, expected.scope_id) || target.tier !== expected.tier || target.scope_id !== expected.scope_id || target.activation_epoch !== expected.activation_epoch || target.content_hash !== expected.content_hash || payload.exposure_publication?.exposure_id !== expected.exposure_id || payload.exposure_publication?.publication_digest !== expected.publication_digest || payload.fresh_runtime?.resolver_snapshot_digest !== expected.snapshot_digest || input.input_id !== expected.input_id || input.input_digest !== expected.input_digest || canonical(payload) !== input.bytes.toString('utf8')) return null;
  const schema = expected.tier === 'global' ? 'passive-impact-global-result-v1' : 'passive-impact-project-result-v1';
  const disposition = payload.collection_disposition;
  if (!['blocked', 'eligible'].includes(disposition)) return null;
  const result = disposition === 'blocked' ? 'blocked' : 'collecting';
  return { schema, tier: expected.tier, scope_id: expected.scope_id, policy_id: expected.policy_id, policy_digest: expected.policy_digest, estimator_id: 'fixture-intake-v1', target, snapshot: { snapshot_id: expected.snapshot_id, snapshot_digest: expected.snapshot_digest }, exposure: { exposure_id: expected.exposure_id, publication_digest: expected.publication_digest }, input: { input_id: expected.input_id, input_digest: expected.input_digest }, intake: { collection_disposition: disposition, ...(payload.collection_reason ? { collection_reason: payload.collection_reason } : {}) }, result, created_at };
}
function readImmutableResult(root, resultDigest) {
  try {
    const chain = bindInputChain(root, 'rule-impact-result'); const file = path.join(chain.parents.at(-1).path, `${resultDigest}.json`); return readImmutableFile(chain, file, resultDigest).bytes;
  } catch { return null; }
}
/** Records tier-isolated blocked/collecting result bytes. No evaluator or action authority. */
export function recordNonActionImpactResult({ stateRoot, store, input, expected, created_at } = {}) {
  const artifact = resultArtifact({ input, expected, created_at });
  if (!store || typeof store.recordImpactResult !== 'function' || !artifact || hasPrivate(artifact)) return Object.freeze({ outcome: 'blocked' });
  const bytes = Buffer.from(canonical(artifact), 'utf8'); const result_digest = digest(bytes); const result_id = `${expected.tier === 'global' ? 'passive-impact-global:' : 'passive-impact-project:'}${result_digest}`;
  try {
    writeImmutableInput(stateRoot, { input_digest: result_digest, bytes }, { directoryName: 'rule-impact-result' });
    const stored = store.recordImpactResult({ input_id: expected.input_id, input_digest: expected.input_digest, result_id, result_digest, tier: expected.tier, scope_id: expected.scope_id || '', rule_id: expected.target.rule_id, version_hash: expected.target.version_hash, content_hash: expected.content_hash, activation_epoch: expected.activation_epoch, policy_id: expected.policy_id, policy_digest: expected.policy_digest, snapshot_id: expected.snapshot_id, snapshot_digest: expected.snapshot_digest, exposure_id: expected.exposure_id, publication_digest: expected.publication_digest, created_at });
    return Object.freeze({ outcome: 'recorded', result_id, result_digest, head_sequence: stored.head_sequence, bytes });
  } catch { return Object.freeze({ outcome: 'blocked' }); }
}
/** Future Plan048 boundary: returns persisted bytes only after index, blob, schema, and current identity reverify. */
export function readPlan048ImpactResult({ stateRoot, store, expected } = {}) {
  if (!store || typeof store.readImpactResult !== 'function' || !expected?.input_id || !Number.isInteger(expected.head_sequence)) return Object.freeze({ outcome: 'blocked' });
  const index = store.readImpactResultLineage?.({ input_id: expected.input_id });
  const fields = ['input_digest', 'tier', 'scope_id', 'rule_id', 'version_hash', 'content_hash', 'activation_epoch', 'policy_id', 'policy_digest', 'snapshot_id', 'snapshot_digest', 'exposure_id', 'publication_digest'];
  const expectedIndexValue = (key) => ['rule_id', 'version_hash'].includes(key) ? expected.target?.[key] : key === 'scope_id' ? (expected.scope_id || '') : expected[key];
  const lineage = index && index.target_input_id === expected.input_id && index.target_input_digest === expected.input_digest && index.target_exposure_id === expected.exposure_id && index.target_publication_digest === expected.publication_digest && Number.isInteger(index.target_ordinal) && index.target_ordinal >= 0 && Number.isInteger(index.target_count) && index.target_count > index.target_ordinal;
  let fanout; try { fanout = lineage && { target_input_ids: JSON.parse(index.target_input_ids_json), target_input_digests: JSON.parse(index.target_input_digests_json) }; } catch { fanout = null; }
  if (!index || index.head_sequence !== expected.head_sequence || fields.some((key) => index[key] !== expectedIndexValue(key)) || !lineage || !Array.isArray(fanout?.target_input_ids) || !Array.isArray(fanout?.target_input_digests) || fanout.target_input_ids.length !== index.target_count || fanout.target_input_digests.length !== index.target_count || fanout.target_input_ids[index.target_ordinal] !== expected.input_id || fanout.target_input_digests[index.target_ordinal] !== expected.input_digest || hasPrivate(index)) return Object.freeze({ outcome: 'blocked' });
  const bytes = readImmutableResult(stateRoot, index.result_digest); if (!bytes || digest(bytes) !== index.result_digest) return Object.freeze({ outcome: 'blocked' });
  let artifact; try { artifact = JSON.parse(bytes); } catch { return Object.freeze({ outcome: 'blocked' }); }
  const schema = expected.tier === 'global' ? 'passive-impact-global-result-v1' : 'passive-impact-project-result-v1';
  const result_id = `${artifact.tier === 'global' ? 'passive-impact-global:' : 'passive-impact-project:'}${digest(bytes)}`;
  if (artifact.schema !== schema || canonical(artifact) !== bytes.toString('utf8') || artifact.tier !== expected.tier || index.result_id !== result_id || index.created_at !== artifact.created_at || artifact.scope_id !== expected.scope_id || artifact.policy_id !== expected.policy_id || artifact.policy_digest !== expected.policy_digest || artifact.target?.rule_id !== expected.target?.rule_id || artifact.target?.version_hash !== expected.target?.version_hash || artifact.target?.content_hash !== expected.content_hash || artifact.target?.activation_epoch !== expected.activation_epoch || artifact.snapshot?.snapshot_id !== expected.snapshot_id || artifact.snapshot?.snapshot_digest !== expected.snapshot_digest || artifact.exposure?.exposure_id !== expected.exposure_id || artifact.exposure?.publication_digest !== expected.publication_digest || artifact.input?.input_id !== expected.input_id || artifact.input?.input_digest !== expected.input_digest || !['blocked', 'collecting'].includes(artifact.result) || hasPrivate(artifact)) return Object.freeze({ outcome: 'blocked' });
  return Object.freeze({ outcome: 'available', result_id, result_digest: index.result_digest, bytes });
}

function historyDescriptorFor({ authority, target, input, ordinal }) {
  let payload;
  try { payload = JSON.parse(input.bytes); } catch { return null; }
  const family = payload?.measurement?.run_family_id; const production_started_at = payload?.measurement?.production_started_at;
  if (!validText(family) || !validTime(production_started_at) || payload.captured_at !== authority.captured_at || payload.exposure_publication?.exposure_id !== authority.exposure_publication.exposure_id || payload.exposure_publication?.publication_digest !== authority.exposure_publication.publication_digest || canonical(payload) !== input.bytes.toString('utf8')) return null;
  return { exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, target_ordinal: ordinal, tier: target.tier, scope_id: target.scope_id || '', production_started_at, captured_at: authority.captured_at };
}

/** Reads one bounded history reference only after local index, contained blob, digest, and publication revalidation. */
export function readIndexedImpactInput({ stateRoot, store, reference } = {}) {
  if (typeof stateRoot !== 'string' || !store || typeof store.readIndexedImpactInputReference !== 'function') return Object.freeze({ outcome: 'unavailable' });
  try {
    const indexed = store.readIndexedImpactInputReference({ reference });
    if (!indexed || canonical(indexed) !== canonical(reference)) return Object.freeze({ outcome: 'unavailable' });
    const chain = bindInputChain(stateRoot); const file = path.join(chain.parents.at(-1).path, `${indexed.input_digest}.json`);
    const bytes = readImmutableFile(chain, file, indexed.input_digest).bytes;
    const payload = JSON.parse(bytes);
    if (hasPrivate(payload) || payload?.schema !== 'rule-impact-input-v1' || canonical(payload) !== bytes.toString('utf8') || payload.exposure_publication?.exposure_id !== indexed.exposure_id || payload.exposure_publication?.publication_digest !== indexed.publication_digest || payload.captured_at !== indexed.captured_at || payload.measurement?.production_started_at !== indexed.production_started_at || `rule-impact-input:${indexed.input_digest}` !== indexed.input_id) return Object.freeze({ outcome: 'unavailable' });
    return Object.freeze({ outcome: 'available', bytes: Buffer.from(bytes) });
  } catch { return Object.freeze({ outcome: 'unavailable' }); }
}

function impactWindow(t0, started) {
  const at = Date.parse(started); const base = Date.parse(t0);
  for (const [code, offset] of [['H2', -60], ['H1', -30], ['W1', 0], ['W2', 30]]) if (at >= base + offset * 86400000 && at < base + (offset + 30) * 86400000) return code;
  return null;
}
function framedFamilyId(project_scope, plan_id, run_family_id) {
  const frame = (tag, value) => { const bytes = Buffer.from(value, 'utf8'); const length = Buffer.allocUnsafe(4); length.writeUInt32BE(bytes.length); return Buffer.concat([Buffer.from([tag]), length, bytes]); };
  return `run-family:${digest(Buffer.concat([frame(1, 'rule-impact-family-v1'), frame(2, project_scope), frame(3, plan_id), frame(4, run_family_id)]))}`;
}
function validIndexedReference(reference) {
  return exactKeys(reference, ['exposure_id', 'publication_digest', 'input_id', 'input_digest', 'target_ordinal', 'tier', 'scope_id', 'production_started_at', 'captured_at']) && /^exposure:[a-f0-9]{64}$/.test(reference.exposure_id) && validDigest(reference.publication_digest) && typeof reference.input_id === 'string' && reference.input_id === `rule-impact-input:${reference.input_digest}` && validDigest(reference.input_digest) && Number.isSafeInteger(reference.target_ordinal) && reference.target_ordinal >= 0 && ['global', 'project'].includes(reference.tier) && (reference.tier === 'global' ? reference.scope_id === '' : validText(reference.scope_id)) && validTime(reference.production_started_at) && validTime(reference.captured_at);
}
function sourceAuthorityRecord(reference, bytes) {
  if (!validIndexedReference(reference) || !Buffer.isBuffer(bytes) || digest(bytes) !== reference.input_digest) return null;
  let payload; try { payload = JSON.parse(bytes); } catch { return null; }
  if (payload?.schema !== 'rule-impact-input-v1' || canonical(payload) !== bytes.toString('utf8') || payload.exposure_publication?.exposure_id !== reference.exposure_id || payload.exposure_publication?.publication_digest !== reference.publication_digest || payload.captured_at !== reference.captured_at || payload.measurement?.production_started_at !== reference.production_started_at || `rule-impact-input:${reference.input_digest}` !== reference.input_id) return null;
  return freeze({ exposure_id: reference.exposure_id, publication_digest: reference.publication_digest, input_id: reference.input_id, input_digest: reference.input_digest, target_ordinal: reference.target_ordinal, tier: reference.tier, scope_id: reference.scope_id, production_started_at: reference.production_started_at, captured_at: reference.captured_at, terminal_byte_domain: 'rule-impact-input-v1', terminal_byte_digest: digest(bytes) });
}
function sourceRecordCompare(left, right) {
  for (const key of SOURCE_RECORD_KEYS) { const compared = key === 'target_ordinal' ? left[key] - right[key] : scalarCompare(left[key], right[key]); if (compared) return compared; }
  return 0;
}
function candidateFamily(payload, reference, target, t0) {
  if (!payload || payload.schema !== 'rule-impact-input-v1' || payload.collection_disposition !== 'eligible' || !validAuthority({ captured_at: payload.captured_at, exposure_publication: payload.exposure_publication, fresh_runtime: payload.fresh_runtime, resolver_boundary: payload.resolver_boundary }) || reasonFor(payload.measurement, payload.captured_at)) return { exclusion: 'indexed_input_invalid' };
  const measurement = payload.measurement;
  if (payload.exposure_publication.exposure_id !== reference.exposure_id || payload.exposure_publication.publication_digest !== reference.publication_digest || payload.captured_at !== reference.captured_at || measurement.production_started_at !== reference.production_started_at) return { exclusion: 'indexed_time_mismatch' };
  const code = impactWindow(t0, measurement.production_started_at); if (!code) return { exclusion: 'outside_window' };
  const end = Date.parse(t0) + ({ H2: -30, H1: 0, W1: 30, W2: 60 })[code] * 86400000;
  if (Date.parse(measurement.outcome_finalized_at) < Date.parse(measurement.production_started_at) || Date.parse(measurement.outcome_finalized_at) >= end) return { exclusion: 'terminal_outside_window', code };
  const boundary = payload.resolver_boundary; const exactTarget = canonical(target); const targets = boundary.active_rules.filter((rule) => canonical(rule) === exactTarget);
  const targetIdentity = boundary.active_rules.filter((rule) => rule.rule_id === target.rule_id && rule.tier === target.tier && rule.scope_id === target.scope_id);
  if ((code === 'H2' || code === 'H1') ? targets.length !== 0 || targetIdentity.length !== 0 : targets.length !== 1 || targetIdentity.length !== 1 || canonical(boundary.target_rule) !== exactTarget) return { exclusion: 'target_presence_invalid', code };
  const contract = parseImpactContract(measurement); if (!contract || measurement.impact_contract_ref !== contract.contract_id || digest(Buffer.from(measurement.impact_contract_bytes, 'utf8')) !== measurement.impact_contract_digest) return { exclusion: 'impact_contract_invalid', code };
  const bins = {};
  for (const covariate of contract.raw_covariates) {
    const value = measurement.raw_pre_outcome_covariates[covariate.id]; const matches = covariate.bins.filter((bin) => (bin.valid_min_inclusive ? value >= bin.valid_min : value > bin.valid_min) && (bin.valid_max_inclusive ? value <= bin.valid_max : value < bin.valid_max));
    if (matches.length !== 1) return { exclusion: 'fingerprint_invalid', code };
    bins[covariate.id] = { bin_id: matches[0].bin_id, ordinal: matches[0].ordinal };
  }
  const non_target_rules = boundary.active_rules.filter((rule) => canonical(rule) !== exactTarget).map(({ rule_id, version_hash }) => ({ rule_id, version_hash }));
  const fingerprintKey = { plan_id: measurement.plan_id, plan_class: measurement.plan_class, project_scope: measurement.project_scope, outcome_definition_id: measurement.outcome_definition_id, outcome_definition_version: measurement.outcome_definition_version, model_provider: measurement.model_provider, model_identity: measurement.model_identity, model_version: measurement.model_version, pipeline_version: measurement.pipeline_version, config_digest: measurement.config_digest, workload_risk_fingerprint_class: measurement.workload_risk_fingerprint_class, route_topology: measurement.route_topology, agent_role: measurement.agent_role, agent_version: measurement.agent_version, phase: measurement.phase, capability_set: measurement.capability_set, budget_class: measurement.budget_class, non_target_rules, covariate_bins: bins };
  const fingerprint = { schema: 'comparability-fingerprint-v1', key: fingerprintKey, key_digest: digest(Buffer.from(JSON.stringify(fingerprintKey), 'utf8')) };
  const family = { family_id: framedFamilyId(measurement.project_scope, measurement.plan_id, measurement.run_family_id), project_scope: measurement.project_scope, plan_id: measurement.plan_id, run_family_id: measurement.run_family_id, production_started_at: measurement.production_started_at, terminal_finalized_at: measurement.outcome_finalized_at, window_code: code, fingerprint, raw_pre_outcome_covariates: measurement.raw_pre_outcome_covariates, impact_contract_ref: measurement.impact_contract_ref, impact_contract_digest: measurement.impact_contract_digest, target_presence: code.startsWith('H') ? 'absent' : 'exact_active', target: code.startsWith('H') ? null : target, active_rules: boundary.active_rules, non_target_rules };
  const family_projection_bytes = canonical(family);
  return { family, terminal_byte_digest: reference.input_digest, family_projection_bytes, family_projection_digest: digest(Buffer.from(family_projection_bytes, 'utf8')) };
}
/** Returns module-private source records only for an exact selected family object. */
export function getVerifiedImpactFamilySources({ selection, family } = {}) {
  const binding = selection && typeof selection === 'object' ? verifiedImpactFamilySources.get(selection) : null;
  const retained = binding?.families.get(family);
  return retained ? Object.freeze({ outcome: 'available', records: retained.records }) : Object.freeze({ outcome: 'unavailable' });
}
/** Re-reads one retained source and rejects any store, root, record, or derived-family drift. */
export function reverifyVerifiedImpactFamilySource({ stateRoot, store, selection, family, source } = {}) {
  const binding = selection && typeof selection === 'object' ? verifiedImpactFamilySources.get(selection) : null;
  const retained = binding?.families.get(family);
  if (!binding || !retained || typeof stateRoot !== 'string' || path.resolve(stateRoot) !== binding.stateRoot || store !== binding.store || !retained.records.includes(source)) return Object.freeze({ outcome: 'unavailable' });
  const reference = Object.fromEntries(SOURCE_RECORD_KEYS.slice(0, 9).map((key) => [key, source[key]]));
  let read; try { read = binding.readIndexed({ stateRoot, store, reference }); } catch { return Object.freeze({ outcome: 'unavailable' }); }
  if (read?.outcome !== 'available' || !Buffer.isBuffer(read.bytes)) return Object.freeze({ outcome: 'unavailable' });
  const reverified = sourceAuthorityRecord(reference, read.bytes); if (!reverified || canonical(reverified) !== canonical(source)) return Object.freeze({ outcome: 'unavailable' });
  let payload; try { payload = JSON.parse(read.bytes); } catch { return Object.freeze({ outcome: 'unavailable' }); }
  const candidate = candidateFamily(payload, reference, binding.target, binding.target_t0);
  if (candidate.exclusion || candidate.family_projection_bytes !== retained.family_projection_bytes || candidate.family_projection_digest !== retained.family_projection_digest) return Object.freeze({ outcome: 'unavailable' });
  return Object.freeze({ outcome: 'available' });
}
export function isImpactAggregateCapabilityMint(value) { return !!value && typeof value === 'object' && aggregateCapabilityMintInputs.has(value); }
function mintImpactAggregateCapability({ store, selection, target, target_t0, target_opening, impact_contract, families, opening_bytes, contract_bytes, events } = {}) {
  const binding = selection && typeof selection === 'object' ? verifiedImpactFamilySources.get(selection) : null;
  if (!binding || !store || typeof store.createImpactAggregateCapability !== 'function' || !Buffer.isBuffer(opening_bytes) || !Buffer.isBuffer(contract_bytes) || !Array.isArray(families) || !Array.isArray(events)) return undefined;
  const source_payload_digests = []; const family_projection_digests = [];
  for (const family of selection.families) {
    const retained = binding.families.get(family); if (!retained) return undefined;
    const aggregateFamily = families.find((candidate) => candidate.family_id === family.family_id); if (!aggregateFamily || aggregateFamily.family_projection_digest !== retained.family_projection_digest) return undefined;
    // Aggregate schema binds one canonical representative; all retained members were byte-equal during selection.
    const source = retained.records[0]; if (!source || source.input_digest !== aggregateFamily.source_measurement_input_digest || source.terminal_byte_digest !== source.input_digest) return undefined;
    source_payload_digests.push(source.terminal_byte_digest); family_projection_digests.push(retained.family_projection_digest);
  }
  const private_mint = Object.freeze({}); aggregateCapabilityMintInputs.add(private_mint);
  const read_set = Object.freeze({ request: Object.freeze({ target: Object.freeze({ ...target }), target_t0, target_opening: Object.freeze({ ...target_opening }), impact_contract: Object.freeze({ ...impact_contract }), families: Object.freeze(families.map((family) => Object.freeze({ ...family, event_refs: Object.freeze(family.event_refs.map((ref) => Object.freeze({ ...ref }))) }))) }), source_payload_digests: Object.freeze(source_payload_digests), opening_blob_digest: digest(opening_bytes), contract_bytes_digest: digest(contract_bytes), event_byte_digests: Object.freeze(events.map((event) => event.event_digest)), family_projection_digests: Object.freeze(family_projection_digests) });
  // Closed mint input: callers never supply selections/read-sets to store capability API.
  return store.createImpactAggregateCapability({ private_mint, read_set });
}
function assemblyBlocked(reason = 'assembly_authority_unavailable') { return Object.freeze({ outcome: 'blocked', reason }); }
function evaluatorFamily({ family, payload, aggregate, events }) {
  const measurement = payload.measurement; const boundary = payload.resolver_boundary;
  const snapshot = JSON.parse(payload.fresh_runtime.resolver_snapshot_bytes);
  return {
    family_kind: family.window_code.startsWith('H') ? 'history' : 'post', family_id: family.family_id, project_scope: family.project_scope, plan_id: family.plan_id, run_family_id: family.run_family_id, production_started_at: family.production_started_at, terminal_finalized_at: family.terminal_finalized_at, window_code: family.window_code, fingerprint: family.fingerprint, raw_pre_outcome_covariates: family.raw_pre_outcome_covariates,
    provenance: { schema: 'rule-impact-evaluator-provenance-v1', resolver_snapshot_id: snapshot.snapshot_id, resolver_snapshot_digest: payload.fresh_runtime.resolver_snapshot_digest, exposure_id: payload.exposure_publication.exposure_id, exposure_publication_digest: payload.exposure_publication.publication_digest, measurement_input_id: aggregate.measurement_input_id, measurement_input_digest: aggregate.measurement_input_digest, source_heads: boundary.source_heads, mirror_heads: boundary.mirror_heads, projection_revision: boundary.projection_revision, runtime_digest: boundary.runtime_digest, supplied_context_attestation: payload.fresh_runtime.supplied_context_attestation, impact_contract_ref: family.impact_contract_ref, impact_contract_digest: family.impact_contract_digest, policy_id: family.target?.tier === 'project' ? 'project-passive-impact-v1' : 'passive-impact-v1', policy_digest: policyDigest(family.target?.tier || 'global') },
    epoch_events: events, outcome: { status: 'finalized', definition_id: measurement.outcome_definition_id, definition_version: measurement.outcome_definition_version, source_id: measurement.outcome_source_identity, source_digest: measurement.outcome_source_digest, finalized_at: measurement.outcome_finalized_at, values: measurement.outcome_vector }, target_presence: family.target_presence, target: family.target, active_rules: family.active_rules, non_target_rules: family.non_target_rules,
  };
}
/** Assembles exact accepted EI only from fresh indexed, opening, event, contract, and aggregate authority. */
export function assembleImpactEvaluatorInput(request = {}) {
  if (!exactKeys(request, ['stateRoot', 'store', 'target', 'target_t0']) || typeof request.stateRoot !== 'string' || !request.store || !validTarget(request.target, request.target?.scope_id ?? null) || !validTime(request.target_t0)) return assemblyBlocked('assembly_request_invalid');
  const { stateRoot, store, target, target_t0 } = request;
  const storeTarget = { tier: target.tier, scope_id: target.tier === 'global' ? '' : target.scope_id, rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch };
  if (typeof store.readLifecycleImpactOpening !== 'function' || typeof store.listLifecycleImpactEvents !== 'function' || typeof store.recordImpactInputAggregate !== 'function' || typeof store.readImpactInputAggregate !== 'function') return assemblyBlocked();
  const selection = selectVerifiedImpactFamilies({ stateRoot, store, target, target_t0 });
  if (selection.outcome !== 'available') return assemblyBlocked(selection.reason);
  try {
    if (!selection.families.length) return assemblyBlocked();
    const openingRecord = store.readLifecycleImpactOpening({ target: storeTarget });
    if (!openingRecord || !Buffer.isBuffer(openingRecord.opening_bytes)) return assemblyBlocked();
    const opening = JSON.parse(openingRecord.opening_bytes);
    if (canonical(opening) !== openingRecord.opening_bytes.toString('utf8') || opening.opening_digest !== openingRecord.opening_projection_digest || opening.opened_at !== target_t0 || opening.rule_id !== target.rule_id || opening.version_hash !== target.version_hash || opening.accepted_commit !== target.accepted_commit || (opening.kind === 'activation_opened' ? opening.activation_epoch : opening.next_activation_epoch) !== target.activation_epoch) return assemblyBlocked();
    const events = store.listLifecycleImpactEvents({ target: storeTarget, start_at: new Date(Date.parse(target_t0) - 60 * 86400000).toISOString(), end_at: new Date(Date.parse(target_t0) + 60 * 86400000).toISOString() });
    if (!Array.isArray(events)) return assemblyBlocked();
    const eventValues = events.map((event) => { if (!Buffer.isBuffer(event.event_bytes) || digest(event.event_bytes) !== event.event_digest) throw new Error('event'); const parsed = JSON.parse(event.event_bytes); if (canonical(parsed) !== event.event_bytes.toString('utf8')) throw new Error('event'); return parsed; });
    const aggregateFamilies = []; const familyPayloads = [];
    let contract = null;
    for (const family of selection.families) {
      const retained = getVerifiedImpactFamilySources({ selection, family }); if (retained.outcome !== 'available' || !retained.records.length) return assemblyBlocked();
      let payload = null;
      for (const source of retained.records) {
        if (reverifyVerifiedImpactFamilySource({ stateRoot, store, selection, family, source }).outcome !== 'available') return assemblyBlocked();
        const reference = Object.fromEntries(SOURCE_RECORD_KEYS.slice(0, 9).map((key) => [key, source[key]])); const read = readIndexedImpactInput({ stateRoot, store, reference });
        if (read.outcome !== 'available' || digest(read.bytes) !== source.terminal_byte_digest) return assemblyBlocked();
        const candidatePayload = JSON.parse(read.bytes); const candidate = candidateFamily(candidatePayload, reference, target, target_t0);
        if (candidate.exclusion || candidate.family_projection_digest !== digest(Buffer.from(canonical(family), 'utf8')) || candidate.family_projection_bytes !== canonical(family)) return assemblyBlocked();
        if (payload && canonical(payload) !== canonical(candidatePayload)) return assemblyBlocked(); payload = candidatePayload;
      }
      const parsedContract = parseImpactContract(payload.measurement);
      if (!parsedContract || canonical(parsedContract) !== payload.measurement.impact_contract_bytes || (contract && (contract.ref !== payload.measurement.impact_contract_ref || contract.digest !== payload.measurement.impact_contract_digest || !contract.bytes.equals(Buffer.from(payload.measurement.impact_contract_bytes))))) return assemblyBlocked();
      contract ||= { ref: payload.measurement.impact_contract_ref, digest: payload.measurement.impact_contract_digest, bytes: Buffer.from(payload.measurement.impact_contract_bytes), value: parsedContract };
      aggregateFamilies.push({ window_code: family.window_code, production_started_at: family.production_started_at, family_id: family.family_id, project_scope: family.project_scope, plan_id: family.plan_id, run_family_id: family.run_family_id, source_measurement_input_id: retained.records[0].input_id, source_measurement_input_digest: retained.records[0].input_digest, family_projection_digest: digest(Buffer.from(canonical(family), 'utf8')), event_refs: events.map(({ event_id, event_digest }) => ({ event_id, event_digest })) });
      familyPayloads.push({ family, payload });
    }
    const target_opening = { opening_id: openingRecord.opening_id, opening_projection_digest: openingRecord.opening_projection_digest, opening_blob_id: openingRecord.opening_blob_id, opening_blob_digest: openingRecord.opening_blob_digest };
    const impact_contract = { impact_contract_ref: contract.ref, impact_contract_digest: contract.digest };
    const capability = mintImpactAggregateCapability({ store, selection, target: storeTarget, target_t0, target_opening, impact_contract, families: aggregateFamilies, opening_bytes: openingRecord.opening_bytes, contract_bytes: contract.bytes, events });
    const stored = store.recordImpactInputAggregate({ target: storeTarget, target_t0, target_opening, impact_contract, families: aggregateFamilies, capability });
    const aggregate = store.readImpactInputAggregate({ measurement_input_id: stored.measurement_input_id });
    if (aggregate.outcome !== 'available' || !aggregate.bytes.equals(stored.aggregate_bytes) || aggregate.authority.measurement_input_digest !== stored.measurement_input_digest) return assemblyBlocked();
    const input = { schema: 'rule-impact-evaluator-input-v1', input_digest: stored.measurement_input_digest, evaluated_target: target, target_t0, target_epoch_opening: opening, impact_contract_digest: contract.digest, impact_contract: contract.value, families: familyPayloads.map(({ family, payload }) => evaluatorFamily({ family, payload, aggregate: stored, events: eventValues })) };
    const input_bytes = Buffer.from(canonical(input), 'utf8'); const evaluation_input_digest = digest(input_bytes);
    return Object.freeze({ outcome: 'ready', input_bytes, evaluation_input_digest, measurement_input_id: stored.measurement_input_id, measurement_input_digest: stored.measurement_input_digest, lineage: Object.freeze({ tier: target.tier, scope_id: target.scope_id, rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, measurement_input_digest: stored.measurement_input_digest, evaluation_input_digest }) });
  } catch { return assemblyBlocked(); } finally { verifiedImpactFamilySources.delete(selection); }
}

/** Selects bounded, byte-reverified C1/C2 family members. C3 owns EI/opening/event assembly. */
export function selectVerifiedImpactFamilies({ stateRoot, store, target, target_t0, readIndexed = readIndexedImpactInput } = {}) {
  if (!store || typeof store.listIndexedImpactInputs !== 'function' || typeof readIndexed !== 'function' || !validTime(target_t0) || !validTarget(target, target?.scope_id ?? null)) return Object.freeze({ outcome: 'blocked', reason: 'selection_request_invalid' });
  const tier = target.tier; const scope_id = target.scope_id || ''; const start_at = new Date(Date.parse(target_t0) - 60 * 86400000).toISOString(); const end_at = new Date(Date.parse(target_t0) + 60 * 86400000).toISOString();
  let references; try { references = store.listIndexedImpactInputs({ tier, scope_id, start_at, end_at }); } catch { return Object.freeze({ outcome: 'blocked', reason: 'indexed_inputs_unavailable' }); }
  if (!Array.isArray(references) || references.length > 256) return Object.freeze({ outcome: 'blocked', reason: 'indexed_inputs_unavailable' });
  const exclusions = []; const candidates = [];
  for (const reference of references) {
    if (!validIndexedReference(reference) || reference.tier !== tier || reference.scope_id !== scope_id || reference.production_started_at < start_at || reference.production_started_at >= end_at) { exclusions.push({ window_code: impactWindow(target_t0, reference?.production_started_at) || 'W1', reason: 'indexed_reference_invalid', count: 1 }); continue; }
    const read = readIndexed({ stateRoot, store, reference });
    if (read?.outcome !== 'available' || !Buffer.isBuffer(read.bytes) || digest(read.bytes) !== reference.input_digest) return Object.freeze({ outcome: 'blocked', reason: read?.outcome === 'available' ? 'indexed_input_tampered' : 'indexed_input_unavailable' });
    let payload; try { payload = JSON.parse(read.bytes); } catch { return Object.freeze({ outcome: 'blocked', reason: 'indexed_input_tampered' }); }
    if (canonical(payload) !== read.bytes.toString('utf8')) return Object.freeze({ outcome: 'blocked', reason: 'indexed_input_tampered' });
    const candidate = candidateFamily(payload, reference, target, target_t0);
    if (candidate.exclusion) { exclusions.push({ window_code: candidate.code || impactWindow(target_t0, reference.production_started_at) || 'W1', reason: candidate.exclusion, count: 1 }); continue; }
    const source = sourceAuthorityRecord(reference, read.bytes);
    if (!source) return Object.freeze({ outcome: 'blocked', reason: 'indexed_input_tampered' });
    candidates.push({ ...candidate, source });
  }
  const grouped = new Map(); for (const candidate of candidates) { const family = candidate.family; const key = `${family.project_scope}\0${family.plan_id}\0${family.run_family_id}`; const group = grouped.get(key) || []; group.push(candidate); grouped.set(key, group); }
  const families = []; const retainedFamilies = new Map();
  for (const group of grouped.values()) {
    const first = group[0];
    if (group.some((member) => member.terminal_byte_digest !== first.terminal_byte_digest || member.family_projection_bytes !== first.family_projection_bytes || member.family_projection_digest !== first.family_projection_digest)) { exclusions.push({ window_code: first.family.window_code, reason: 'family_authority_conflict', count: group.length }); continue; }
    const records = [...new Map(group.map((member) => [canonical(member.source), member.source])).values()].sort(sourceRecordCompare);
    families.push(first.family); retainedFamilies.set(first.family, Object.freeze({ records: Object.freeze(records), family_projection_bytes: first.family_projection_bytes, family_projection_digest: first.family_projection_digest }));
  }
  const rank = { H2: 0, H1: 1, W1: 2, W2: 3 }; families.sort((left, right) => rank[left.window_code] - rank[right.window_code] || left.production_started_at.localeCompare(right.production_started_at) || scalarCompare(left.family_id, right.family_id));
  exclusions.sort((left, right) => rank[left.window_code] - rank[right.window_code] || scalarCompare(left.reason, right.reason));
  const selection = freeze({ outcome: 'available', families, exclusions });
  verifiedImpactFamilySources.set(selection, Object.freeze({ stateRoot: path.resolve(stateRoot), store, target, target_t0, readIndexed, families: retainedFamilies }));
  return selection;
}

export function captureRuleImpactFanout({ stateRoot, store, authority, measurement, storageFault } = {}) {
  if (hasPrivate(authority)) return Object.freeze({ outcome: 'private_data_rejected' });
  if (typeof stateRoot !== 'string' || !stateRoot || !store || typeof store.recordImpactFanout !== 'function') return Object.freeze({ outcome: 'storage_unavailable' });
  if (!validAuthority(authority)) return Object.freeze({ outcome: 'resolver_invalid' });
  const targets = normalizedTargets(authority); if (!targets) return Object.freeze({ outcome: 'target_conflict' });
  const records = [];
  for (const target of targets) {
    const boundary = { ...authority.resolver_boundary, target_rule: target, active_rules: targets, non_target_rules: targets.filter((candidate) => candidate !== target).map(({ rule_id, version_hash }) => ({ rule_id, version_hash })) };
    const input = buildRuleImpactInput({ authority: { ...authority, resolver_boundary: boundary }, measurement }); if (input.outcome) return input; records.push({ target, input });
  }
  const fanout_fingerprint = fanoutFingerprint(authority, records); const history_descriptors = records.map(({ target, input }, ordinal) => historyDescriptorFor({ authority, target, input, ordinal })); const publication = { exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest, fanout_fingerprint, target_input_ids: records.map(({ input }) => input.input_id), target_input_digests: records.map(({ input }) => input.input_digest), ...(history_descriptors.every(Boolean) ? { history_descriptors } : {}) };
  const existing = typeof store.readImpactFanout === 'function' ? store.readImpactFanout(publication) : undefined;
  const fanoutOnly = { exposure_id: publication.exposure_id, publication_digest: publication.publication_digest, fanout_fingerprint: publication.fanout_fingerprint, target_input_ids: publication.target_input_ids, target_input_digests: publication.target_input_digests };
  if (existing) return canonical(existing) === canonical(fanoutOnly) ? Object.freeze({ outcome: 'success', target_input_ids: Object.freeze([...publication.target_input_ids]) }) : Object.freeze({ outcome: 'publication_fanout_conflict' });
  try {
    if (storageFailure(storageFault, 'pre_serialization')) throw new Error('RULE_IMPACT_STORAGE_UNAVAILABLE');
    records.forEach(({ input }, ordinal) => writeImmutableInput(stateRoot, input, { fault: storageFault, ordinal }));
    if (storageFailure(storageFault, 'before_index') || ['index_begin', 'index_fanout', 'index_target', 'index_commit'].some((phase) => storageFailure(storageFault, phase))) throw new Error('RULE_IMPACT_STORAGE_UNAVAILABLE');
    store.recordImpactFanout({ ...publication, fault: (phase, ordinal) => { if (storageFault?.phase === phase && (storageFault.ordinal === undefined || storageFault.ordinal === ordinal)) throw new Error('RULE_IMPACT_STORAGE_UNAVAILABLE'); } }); return Object.freeze({ outcome: 'success', target_input_ids: Object.freeze([...publication.target_input_ids]) });
  } catch (error) {
    if (error?.message === 'RULE_IMPACT_FANOUT_CONFLICT') return Object.freeze({ outcome: 'publication_fanout_conflict' });
    if (typeof store.recordImpactStorageAttempt === 'function') {
      const reason = storageReason(storageFault, records);
      const timestamp = authority.captured_at;
      const attempt_digest = digest(Buffer.from(canonical({ exposure_id: publication.exposure_id, publication_digest: publication.publication_digest, reason, timestamp }), 'utf8'));
      try { store.recordImpactStorageAttempt({ attempt_digest, exposure_id: publication.exposure_id, publication_digest: publication.publication_digest, reason, timestamp }); } catch { /* ledger is strictly best effort */ }
    }
    return Object.freeze({ outcome: 'storage_unavailable' });
  }
}
