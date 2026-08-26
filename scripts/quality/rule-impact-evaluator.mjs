import { createHash } from 'node:crypto';
import { policyBytes as approvedPolicyBytes, policyDigest as approvedPolicyDigest, policyForTier } from './rule-impact-policy.mjs';
import { buildImpactEvaluationArtifact } from './rule-impact-results.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT40 = /^[a-f0-9]{40}$/;
const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const BIDI_OR_CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const PRIVATE_SENTINEL = /(?:^|[/\\])(?:home|users|private|secret|state)(?:[/\\]|$)/iu;
const FAMILY_KEYS = ['family_kind', 'family_id', 'project_scope', 'plan_id', 'run_family_id', 'production_started_at', 'terminal_finalized_at', 'window_code', 'fingerprint', 'raw_pre_outcome_covariates', 'provenance', 'epoch_events', 'outcome', 'target_presence', 'target', 'active_rules', 'non_target_rules'];
const ACTIVE_RULE_KEYS = ['rule_id', 'version_hash', 'activation_epoch', 'tier', 'scope_id', 'content_hash', 'accepted_commit', 'protection_class', 'mirror_digest', 'agent', 'applicability', 'phases', 'lifecycle_state'];
const FINGERPRINT_KEY_KEYS = ['plan_id', 'plan_class', 'project_scope', 'outcome_definition_id', 'outcome_definition_version', 'model_provider', 'model_identity', 'model_version', 'pipeline_version', 'config_digest', 'workload_risk_fingerprint_class', 'route_topology', 'agent_role', 'agent_version', 'phase', 'capability_set', 'budget_class', 'non_target_rules', 'covariate_bins'];
const PROVENANCE_KEYS = ['schema', 'resolver_snapshot_id', 'resolver_snapshot_digest', 'exposure_id', 'exposure_publication_digest', 'measurement_input_id', 'measurement_input_digest', 'source_heads', 'mirror_heads', 'projection_revision', 'runtime_digest', 'supplied_context_attestation', 'impact_contract_ref', 'impact_contract_digest', 'policy_id', 'policy_digest'];
const EVENT_KEYS = ['event_class', 'event_type', 'event_id', 'event_digest', 'event_at', 'rule_id', 'version_hash', 'activation_epoch', 'policy_digest', 'effect', 'details'];
const EVENT_EFFECTS = Object.freeze({
  target_paused: 'close_epoch', target_deactivated: 'close_epoch', target_reactivated: 'close_epoch', target_version_changed: 'close_epoch', policy_changed: 'close_epoch', unknown_carryover: 'close_epoch', pipeline_outage: 'close_epoch', recorder_outage: 'close_epoch', clock_skew_unresolved: 'close_epoch', exposure_gap: 'close_epoch', source_lost: 'close_epoch', mirror_lost: 'close_epoch', concurrent_target_rule_change: 'close_epoch', concurrent_non_target_rule_change: 'exclude_family', concurrent_model_change: 'exclude_family', concurrent_pipeline_change: 'exclude_family', concurrent_outcome_change: 'exclude_family', concurrent_config_change: 'exclude_family', concurrent_authority_change: 'exclude_family', reattested: 'none',
});
const EVENT_DETAILS = Object.freeze({
  target_paused: [], target_deactivated: [], target_reactivated: ['prior_activation_epoch', 'next_activation_epoch'], target_version_changed: ['prior_version_hash', 'next_version_hash', 'prior_activation_epoch', 'next_activation_epoch'], policy_changed: ['prior_policy_digest', 'next_policy_digest'], unknown_carryover: [], pipeline_outage: ['gap_start', 'gap_end'], recorder_outage: ['gap_start', 'gap_end'], clock_skew_unresolved: ['clock_source_id', 'observed_offset_milliseconds'], exposure_gap: ['gap_start', 'gap_end'], source_lost: ['prior_source_heads', 'observed_source_heads'], mirror_lost: ['prior_mirror_heads', 'observed_mirror_heads'], concurrent_target_rule_change: ['prior_state_digest', 'next_state_digest'], concurrent_non_target_rule_change: ['prior_state_digest', 'next_state_digest'], concurrent_model_change: ['prior_state_digest', 'next_state_digest'], concurrent_pipeline_change: ['prior_state_digest', 'next_state_digest'], concurrent_outcome_change: ['prior_state_digest', 'next_state_digest'], concurrent_config_change: ['prior_state_digest', 'next_state_digest'], concurrent_authority_change: ['prior_state_digest', 'next_state_digest'], reattested: ['source_heads', 'mirror_heads', 'projection_revision', 'attestation_digest'],
});
const INVALID_OUTCOMES = new Set(['definition_id_mismatch', 'definition_version_mismatch', 'source_identity_mismatch', 'source_digest_mismatch', 'finalization_time_invalid', 'dimension_set_mismatch', 'dimension_type_mismatch', 'dimension_nonfinite', 'dimension_out_of_range', 'extractor_version_mismatch', 'conflicting_terminal']);

function invalid() { throw new Error('RULE_IMPACT_EVALUATOR_INPUT_INVALID'); }
function sourceBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  invalid();
}
function orderedObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).join('\0') !== keys.join('\0')) invalid();
  return value;
}
function text(value) {
  if (typeof value !== 'string' || !value || value !== value.normalize('NFC') || BIDI_OR_CONTROL.test(value) || PRIVATE_SENTINEL.test(value)) invalid();
  return value;
}
function digest(value) { if (typeof value !== 'string' || !DIGEST.test(value)) invalid(); return value; }
function instant(value) { if (typeof value !== 'string' || !INSTANT.test(value) || !Number.isFinite(Date.parse(value))) invalid(); return value; }
function safeInt(value) { if (!Number.isSafeInteger(value)) invalid(); return value; }
function finite(value) { if (typeof value !== 'number' || !Number.isFinite(value)) invalid(); return value; }
function scalarCompare(left, right) { const a = Array.from(left); const b = Array.from(right); for (let index = 0; index < Math.min(a.length, b.length); index += 1) { const delta = a[index].codePointAt(0) - b[index].codePointAt(0); if (delta) return delta; } return a.length - b.length; }
function sortedKeys(value, allowEmpty = false) { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); const keys = Object.keys(value); if ((!allowEmpty && !keys.length) || keys.some((key) => key !== key.normalize('NFC') || BIDI_OR_CONTROL.test(key) || PRIVATE_SENTINEL.test(key)) || keys.join('\0') !== [...keys].sort(scalarCompare).join('\0')) invalid(); return keys; }
function sortedUniqueText(values) { if (!Array.isArray(values) || values.some((value) => text(value) !== value) || values.join('\0') !== [...new Set(values)].sort(scalarCompare).join('\0')) invalid(); }
function rulePair(value) { orderedObject(value, ['rule_id', 'version_hash']); text(value.rule_id); digest(value.version_hash); return value; }
function rulePairBytes(value) { return JSON.stringify(value); }
function activeRule(value) {
  orderedObject(value, ACTIVE_RULE_KEYS); text(value.rule_id); digest(value.version_hash); text(value.activation_epoch); if (!['global', 'project'].includes(value.tier)) invalid();
  if ((value.tier === 'global' && value.scope_id !== null) || (value.tier === 'project' && (typeof value.scope_id !== 'string' || !value.scope_id))) invalid();
  digest(value.content_hash); if (typeof value.accepted_commit !== 'string' || !COMMIT40.test(value.accepted_commit)) invalid(); text(value.protection_class); digest(value.mirror_digest); text(value.agent); sortedUniqueText(value.applicability); sortedUniqueText(value.phases); if (value.lifecycle_state !== 'active') invalid(); return value;
}
function activeRuleOrder(value) { return [value.tier === 'global' ? '0' : '1', value.scope_id || '', value.rule_id, value.version_hash, value.activation_epoch].join('\0'); }
function headMap(value, allowEmpty = false) { for (const key of sortedKeys(value, allowEmpty)) text(value[key]); return value; }
function fingerprint(value, family) {
  orderedObject(value, ['schema', 'key', 'key_digest']); if (value.schema !== 'comparability-fingerprint-v1') invalid(); orderedObject(value.key, FINGERPRINT_KEY_KEYS);
  for (const key of FINGERPRINT_KEY_KEYS.slice(0, 15)) text(value.key[key]); sortedUniqueText(value.key.capability_set); if (!Array.isArray(value.key.non_target_rules)) invalid(); value.key.non_target_rules.forEach(rulePair);
  const covariates = sortedKeys(value.key.covariate_bins); for (const key of covariates) { orderedObject(value.key.covariate_bins[key], ['bin_id', 'ordinal']); text(value.key.covariate_bins[key].bin_id); if (safeInt(value.key.covariate_bins[key].ordinal) < 0) invalid(); }
  digest(value.key_digest); if (createHash('sha256').update(JSON.stringify(value.key)).digest('hex') !== value.key_digest) invalid();
  if (value.key.plan_id !== family.plan_id || value.key.project_scope !== family.project_scope || rulePairBytes(value.key.non_target_rules) !== rulePairBytes(family.non_target_rules)) invalid(); return value;
}
function provenance(value, inputDigest) {
  orderedObject(value, PROVENANCE_KEYS); if (value.schema !== 'rule-impact-evaluator-provenance-v1') invalid();
  for (const key of ['resolver_snapshot_id', 'exposure_id', 'impact_contract_ref']) text(value[key]); for (const key of ['resolver_snapshot_digest', 'exposure_publication_digest', 'measurement_input_digest', 'runtime_digest', 'impact_contract_digest', 'policy_digest']) digest(value[key]);
  if (value.measurement_input_digest !== inputDigest || value.measurement_input_id !== `rule-impact-input:${inputDigest}` || value.supplied_context_attestation !== 'attested' || !['passive-impact-v1', 'project-passive-impact-v1'].includes(value.policy_id) || safeInt(value.projection_revision) < 0) invalid(); headMap(value.source_heads); headMap(value.mirror_heads); return value;
}
function eventDetailValue(type, key, value) {
  if (['gap_start', 'gap_end'].includes(key)) return instant(value);
  if (key === 'observed_offset_milliseconds' || key === 'projection_revision') return safeInt(value);
  if (key.endsWith('_heads')) return headMap(value, key.startsWith('observed'));
  if (key.endsWith('_digest') || key.includes('version_hash') || key.includes('state_digest')) return digest(value);
  return text(value);
}
function validateEvent(value) {
  orderedObject(value, EVENT_KEYS); const type = value.event_type; if (!Object.hasOwn(EVENT_EFFECTS, type) || value.effect !== EVENT_EFFECTS[type]) invalid();
  if (value.event_class !== (type === 'reattested' ? 'attestation' : 'discontinuity')) invalid(); text(value.event_id); digest(value.event_digest); instant(value.event_at); text(value.rule_id); digest(value.version_hash); text(value.activation_epoch); digest(value.policy_digest); const details = orderedObject(value.details, EVENT_DETAILS[type]); for (const key of EVENT_DETAILS[type]) eventDetailValue(type, key, details[key]);
  if (['pipeline_outage', 'recorder_outage', 'exposure_gap'].includes(type) && Date.parse(details.gap_start) >= Date.parse(details.gap_end)) invalid();
  if (type === 'target_reactivated' && details.prior_activation_epoch === details.next_activation_epoch) invalid();
  if (type === 'target_version_changed' && (details.prior_version_hash === details.next_version_hash || details.prior_activation_epoch === details.next_activation_epoch)) invalid();
  if (type === 'policy_changed' && details.prior_policy_digest === details.next_policy_digest) invalid(); return value;
}
function outcome(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); const keys = Object.keys(value); const status = value.status;
  const expected = { finalized: ['status', 'definition_id', 'definition_version', 'source_id', 'source_digest', 'finalized_at', 'values'], missing: ['status', 'expected_dimension_ids', 'deadline'], invalid: ['status', 'safe_reason'], late: ['status', 'source_id', 'source_digest', 'finalized_at', 'deadline'] }[status];
  if (!expected || keys.join('\0') !== expected.join('\0')) invalid();
  if (status === 'finalized') { text(value.definition_id); text(value.definition_version); text(value.source_id); digest(value.source_digest); instant(value.finalized_at); for (const key of sortedKeys(value.values)) finite(value.values[key]); }
  if (status === 'missing') { sortedUniqueText(value.expected_dimension_ids); instant(value.deadline); }
  if (status === 'invalid' && !INVALID_OUTCOMES.has(value.safe_reason)) invalid();
  if (status === 'late') { text(value.source_id); digest(value.source_digest); instant(value.finalized_at); instant(value.deadline); if (Date.parse(value.finalized_at) <= Date.parse(value.deadline)) invalid(); }
  return value;
}
function family(value, inputDigest) {
  orderedObject(value, FAMILY_KEYS); if (!['history', 'post'].includes(value.family_kind)) invalid(); for (const key of ['family_id', 'project_scope', 'plan_id', 'run_family_id']) text(value[key]); instant(value.production_started_at); instant(value.terminal_finalized_at); if (Date.parse(value.production_started_at) >= Date.parse(value.terminal_finalized_at)) invalid();
  if ((value.family_kind === 'history' && !['H2', 'H1'].includes(value.window_code)) || (value.family_kind === 'post' && !['W1', 'W2'].includes(value.window_code))) invalid();
  if (value.family_kind === 'history' ? value.target_presence !== 'absent' || value.target !== null : value.target_presence !== 'exact_active') invalid(); if (value.family_kind === 'post') activeRule(value.target);
  if (!Array.isArray(value.active_rules) || !Array.isArray(value.non_target_rules)) invalid(); value.active_rules.forEach(activeRule); if (value.active_rules.map(activeRuleOrder).join('\0') !== [...value.active_rules].map(activeRuleOrder).sort(scalarCompare).join('\0')) invalid(); value.non_target_rules.forEach(rulePair);
  const projected = value.active_rules.filter((rule) => value.family_kind === 'history' || rulePairBytes(rule) !== rulePairBytes(value.target)).map(({ rule_id, version_hash }) => ({ rule_id, version_hash })); if (rulePairBytes(projected) !== rulePairBytes(value.non_target_rules)) invalid(); if (value.family_kind === 'post' && value.active_rules.filter((rule) => JSON.stringify(rule) === JSON.stringify(value.target)).length !== 1) invalid();
  fingerprint(value.fingerprint, value); const rawKeys = sortedKeys(value.raw_pre_outcome_covariates); for (const key of rawKeys) finite(value.raw_pre_outcome_covariates[key]); if (rawKeys.join('\0') !== Object.keys(value.fingerprint.key.covariate_bins).join('\0')) invalid(); provenance(value.provenance, inputDigest); if (!Array.isArray(value.epoch_events)) invalid(); value.epoch_events.forEach(validateEvent); if (value.epoch_events.map((event) => `${event.event_at}\0${event.event_id}`).join('\0') !== [...value.epoch_events].map((event) => `${event.event_at}\0${event.event_id}`).sort(scalarCompare).join('\0')) invalid(); outcome(value.outcome); return value;
}

function sameBytes(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function opening(value, target, targetT0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const keys = value.kind === 'activation_opened'
    ? ['kind', 'opening_id', 'opening_digest', 'opened_at', 'rule_id', 'version_hash', 'activation_epoch', 'accepted_commit', 'source_heads', 'mirror_heads', 'projection_revision']
    : value.kind === 'reactivation_opened'
      ? ['kind', 'opening_id', 'opening_digest', 'opened_at', 'rule_id', 'version_hash', 'prior_activation_epoch', 'next_activation_epoch', 'accepted_commit', 'source_heads', 'mirror_heads', 'projection_revision']
      : null;
  if (!keys) invalid(); orderedObject(value, keys); text(value.opening_id); digest(value.opening_digest); instant(value.opened_at);
  const projection = Object.fromEntries(keys.filter((key) => key !== 'opening_digest').map((key) => [key, value[key]]));
  if (createHash('sha256').update(JSON.stringify(projection)).digest('hex') !== value.opening_digest || value.opened_at !== targetT0 || value.rule_id !== target.rule_id || value.version_hash !== target.version_hash || value.accepted_commit !== target.accepted_commit || value.projection_revision < 0) invalid();
  headMap(value.source_heads); headMap(value.mirror_heads);
  if (value.kind === 'activation_opened' ? value.activation_epoch !== target.activation_epoch : value.next_activation_epoch !== target.activation_epoch || value.prior_activation_epoch === value.next_activation_epoch) invalid();
}
function impactContract(value, expectedDigest, targetT0) {
  orderedObject(value, ['contract_id', 'contract_version', 'created_at', 'valid_from', 'outcome_definition_id', 'outcome_definition_version', 'dimensions', 'raw_covariates']);
  for (const key of ['contract_id', 'contract_version', 'outcome_definition_id', 'outcome_definition_version']) text(value[key]); instant(value.created_at); instant(value.valid_from);
  if (value.created_at >= targetT0 || value.valid_from >= targetT0 || createHash('sha256').update(JSON.stringify(value)).digest('hex') !== expectedDigest || !Array.isArray(value.dimensions) || !value.dimensions.length || !Array.isArray(value.raw_covariates)) invalid();
  const ids = new Set(); let primary = 0; let benefit = 0;
  for (const dimension of value.dimensions) { orderedObject(dimension, ['id', 'role', 'extractor_id', 'extractor_version', 'value_type', 'unit', 'valid_min', 'valid_max', 'valid_min_inclusive', 'valid_max_inclusive', 'adverse_direction', 'absolute_materiality', 'required_raw_covariates']); text(dimension.id); text(dimension.extractor_id); text(dimension.extractor_version); text(dimension.unit); finite(dimension.valid_min); finite(dimension.valid_max); finite(dimension.absolute_materiality); if (dimension.valid_min >= dimension.valid_max || dimension.absolute_materiality <= 0 || !['primary', 'guardrail', 'benefit'].includes(dimension.role) || !['binary', 'continuous'].includes(dimension.value_type) || !['higher', 'lower'].includes(dimension.adverse_direction) || ids.has(dimension.id) || !Array.isArray(dimension.required_raw_covariates)) invalid(); ids.add(dimension.id); primary += dimension.role === 'primary'; benefit += dimension.role === 'benefit'; }
  if (primary !== 1 || benefit > 1) invalid(); return value;
}

/** Parses final Plan116B canonical EI bytes; external digest prevents EI self-reference. */
export function parseEvaluatorInputBytes(value, { expectedInputDigest } = {}) {
  const bytes = sourceBytes(value); const source = bytes.toString('utf8'); if (source.startsWith('\ufeff') || !source || /\s/.test(source) || typeof expectedInputDigest !== 'string' || !DIGEST.test(expectedInputDigest) || createHash('sha256').update(bytes).digest('hex') !== expectedInputDigest) invalid(); let parsed; try { parsed = JSON.parse(source); } catch { invalid(); }
  if (JSON.stringify(parsed) !== source) invalid(); orderedObject(parsed, ['schema', 'input_digest', 'evaluated_target', 'target_t0', 'target_epoch_opening', 'impact_contract_digest', 'impact_contract', 'families']); if (parsed.schema !== 'rule-impact-evaluator-input-v1') invalid(); digest(parsed.input_digest); activeRule(parsed.evaluated_target); instant(parsed.target_t0); digest(parsed.impact_contract_digest); opening(parsed.target_epoch_opening, parsed.evaluated_target, parsed.target_t0); const contract = impactContract(parsed.impact_contract, parsed.impact_contract_digest, parsed.target_t0);
  if (!Array.isArray(parsed.families) || !parsed.families.length) invalid(); const familyIds = new Set(); let prior = '';
  for (const entry of parsed.families) { family(entry, parsed.input_digest); if (familyIds.has(entry.family_id)) invalid(); familyIds.add(entry.family_id); const rank = `${['H2', 'H1', 'W1', 'W2'].indexOf(entry.window_code)}\0${entry.production_started_at}\0${entry.family_id}`; if (prior && scalarCompare(prior, rank) > 0) invalid(); prior = rank; if (entry.provenance.impact_contract_ref !== contract.contract_id || entry.provenance.impact_contract_digest !== parsed.impact_contract_digest || entry.provenance.policy_id !== (parsed.evaluated_target.tier === 'global' ? 'passive-impact-v1' : 'project-passive-impact-v1')) invalid(); if (entry.family_kind === 'post' && !sameBytes(entry.target, parsed.evaluated_target)) invalid(); }
  return deepFreeze(parsed);
}
function deepFreeze(value) { if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value; if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const item of Object.values(value)) deepFreeze(item); } return value; }
parseEvaluatorInputBytes.validateEvent = validateEvent;

function timeInWindow(at, start, end) { return at >= start && at < end; }
function familyIdentity(entry) { return `${entry.project_scope}\0${entry.plan_id}\0${entry.run_family_id}`; }
function exactFamily(entry) { return JSON.stringify(entry); }
function windowBounds(t0, code) {
  const offsets = { H2: [-60, -30], H1: [-30, 0], W1: [0, 30], W2: [30, 60] }[code];
  return offsets && offsets.map((days) => t0 + days * 86400000);
}
function modelMember(entry) { return { family_id: entry.family_id, project_scope: entry.project_scope, plan_id: entry.plan_id, run_family_id: entry.run_family_id, stratum_key: entry.fingerprint.key_digest }; }
function addReason(rows, code, reason, entry) { const members = rows[code][reason] || (rows[code][reason] = []); members.push(entry.family_id); }
function validValue(value, definition) {
  if (!Number.isFinite(value) || (definition.value_type === 'binary' && value !== 0 && value !== 1)) return false;
  return (definition.valid_min_inclusive ? value >= definition.valid_min : value > definition.valid_min) && (definition.valid_max_inclusive ? value <= definition.valid_max : value < definition.valid_max);
}
function validCovariate(value, bin, definition) {
  if (!Number.isFinite(value) || !bin || !Array.isArray(definition.bins)) return false;
  if (!(definition.valid_min_inclusive ? value >= definition.valid_min : value > definition.valid_min) || !(definition.valid_max_inclusive ? value <= definition.valid_max : value < definition.valid_max)) return false;
  return definition.bins.some((item) => item.bin_id === bin.bin_id && item.ordinal === bin.ordinal && (item.valid_min_inclusive ? value >= item.valid_min : value > item.valid_min) && (item.valid_max_inclusive ? value <= item.valid_max : value < item.valid_max));
}
function cohortMap(rows, code) { return rows.filter((row) => row.window_code === code); }
function sideOperands(rows, code, strata, masses) {
  const members = cohortMap(rows, code).filter((row) => strata.has(row.fingerprint.key_digest));
  const weighted = members.map((entry) => ({ ...modelMember(entry), weight: masses[entry.fingerprint.key_digest] / cohortMap(rows, code).filter((item) => item.fingerprint.key_digest === entry.fingerprint.key_digest).length }));
  const squareSum = weighted.reduce((sum, entry) => sum + entry.weight ** 2, 0);
  return { cohort_id: code, members: weighted, count: weighted.length, ess: squareSum ? 1 / squareSum : 0, plan_count: new Set(weighted.map((entry) => entry.plan_id)).size, diversity_count: new Set(weighted.map((entry) => entry.diversity)).size };
}

function numeric(value) { if (!Number.isFinite(value)) throw new Error('RULE_IMPACT_EVALUATOR_NUMERIC_BLOCKED'); return value; }
function bits(value) { const bytes = Buffer.allocUnsafe(8); bytes.writeDoubleBE(value); return bytes.readBigUInt64BE(); }
function rendered(value) { numeric(value); return { decimal: Object.is(value, -0) ? '-0' : String(value), bits: bits(value).toString(16).padStart(16, '0') }; }
function binary64TotalOrder(left, right) { const sign = 0x8000000000000000n; const mask = 0xffffffffffffffffn; const order = (value) => { const valueBits = bits(value); return valueBits & sign ? (~valueBits & mask) : (valueBits | sign); }; const a = order(left); const b = order(right); return a < b ? -1 : a > b ? 1 : 0; }

/** Summarizes same-ordinal paired bootstrap effects without exposing replicate arrays in ER. */
export function pairedBootstrapDistribution({ left_point, right_point, left_replicates, right_replicates } = {}) {
  if (!Number.isFinite(left_point) || !Number.isFinite(right_point) || !Array.isArray(left_replicates) || !Array.isArray(right_replicates) || left_replicates.length !== 10000 || right_replicates.length !== 10000 || left_replicates.some((value) => !Number.isFinite(value)) || right_replicates.some((value) => !Number.isFinite(value))) invalid();
  const paired = left_replicates.map((left, ordinal) => numeric(left - right_replicates[ordinal])).sort(binary64TotalOrder);
  return { point: rendered(numeric(left_point - right_point)), interval: { lower: rendered(paired[249]), upper: rendered(paired[9749]) } };
}
function u32(value) { if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) invalid(); const bytes = Buffer.allocUnsafe(4); bytes.writeUInt32BE(value); return bytes; }
function frameField(tag, value, kind) { const payload = kind === 'text' ? Buffer.from(text(value), 'utf8') : kind === 'digest' ? Buffer.from(digest(value), 'hex') : kind === 'u32' ? u32(value) : Buffer.isBuffer(value) && value.length === 32 ? value : invalid(); return Buffer.concat([Buffer.from([tag]), u32(payload.length), payload]); }
function framedHash(fields) { return createHash('sha256').update(Buffer.concat(fields)).digest(); }
function normalizedValue(entry, dimension) { const value = entry.outcome.values[dimension.id]; const oriented = dimension.adverse_direction === 'higher' ? value : -value; return numeric(oriented); }
function fold(values) { return values.reduce((sum, value) => numeric(sum + value), 0); }
function comparisonSeed(policy, input, dimension, comparison) { const tags = policy.bootstrap.frame.tags; return framedHash([frameField(tags.policy_id, policy.policy_id, 'text'), frameField(tags.input_digest, input.input_digest, 'digest'), frameField(tags.dimension_id, dimension.id, 'text'), frameField(tags.comparison_code, comparison, 'text')]); }
const ER_METRICS = ['support_floor', 'missing_rate_floor', 'missing_rate_shift_floor', 'evidence_exclusion_rate_floor', 'evidence_exclusion_rate_shift_floor', 'minimum_count', 'minimum_ess', 'minimum_plan_count', 'minimum_diversity_count', 'balance_smd_maximum', 'drift_minimum', 'drift_maximum', 'consistency_minimum', 'consistency_maximum', 'primary_minimum_point', 'primary_minimum_interval_lower', 'non_primary_minimum_interval_lower', 'benefit_credit_sum', 'benefit_primary_interval_lower'];

function sourceFamilies(input) {
  const sources = Object.fromEntries(['H2', 'H1', 'W1', 'W2'].map((code) => [code, []]));
  const grouped = new Map();
  for (const entry of input.families) { const key = familyIdentity(entry); const entries = grouped.get(key) || []; entries.push(entry); grouped.set(key, entries); }
  for (const entries of grouped.values()) sources[entries[0].window_code].push(entries[0]);
  return { grouped, sources };
}

function collectingArtifact(input, policy, evaluationAt, cohorts) {
  const source = input.families[0].provenance;
  const target = input.evaluated_target;
  const lineage = {
    resolver_snapshot_id: source.resolver_snapshot_id,
    resolver_snapshot_digest: source.resolver_snapshot_digest,
    exposure_id: source.exposure_id,
    exposure_publication_digest: source.exposure_publication_digest,
    measurement_input_id: source.measurement_input_id,
    measurement_input_digest: source.measurement_input_digest,
    evaluation_input_digest: input.input_digest,
    rule_id: target.rule_id,
    rule_version_hash: target.version_hash,
    rule_content_hash: target.content_hash,
    accepted_commit: target.accepted_commit,
    scope_id: target.scope_id,
    activation_epoch: target.activation_epoch,
    mirror_digest: target.mirror_digest,
    policy_id: policy.policy_id,
    policy_digest: approvedPolicyDigest(target.tier),
  };
  return buildImpactEvaluationArtifact({
    tier: target.tier,
    state: 'collecting',
    lineage,
    cohorts: [], comparisons: [], dimensions: [], balance: [], drift_consistency: null, gate_operands: null,
    metrics: Object.fromEntries(ER_METRICS.map((key) => [key, null])),
    quality_flags: [], reason: 'collecting', prior_result: null,
    collection_progress: { observed_at: evaluationAt, h2_source_count: cohorts.H2.source_denominator_count, h1_source_count: cohorts.H1.source_denominator_count, w1_source_count: cohorts.W1.source_denominator_count, w2_source_count: cohorts.W2.source_denominator_count },
    closed_window_id: null, created_at: evaluationAt, expires_at: null,
  });
}

function memberIds(members) { return [...new Set(members.map((member) => member.family_id))].sort(scalarCompare); }
function memberSetRow(members) { const ids = memberIds(members); return { members: ids, digest: createHash('sha256').update(JSON.stringify(ids)).digest('hex'), count: ids.length }; }
function rate(numerator, denominator) { return { numerator, denominator, value: denominator ? rendered(numerator / denominator) : null }; }
function finiteMetric(value) { return rendered(value); }
function maxMetric(values) { return finiteMetric(values.length ? Math.max(...values) : 0); }
function evaluatedLineage(input, policy) {
  const source = input.families[0].provenance; const target = input.evaluated_target;
  return { resolver_snapshot_id: source.resolver_snapshot_id, resolver_snapshot_digest: source.resolver_snapshot_digest, exposure_id: source.exposure_id, exposure_publication_digest: source.exposure_publication_digest, measurement_input_id: source.measurement_input_id, measurement_input_digest: source.measurement_input_digest, evaluation_input_digest: input.input_digest, rule_id: target.rule_id, rule_version_hash: target.version_hash, rule_content_hash: target.content_hash, accepted_commit: target.accepted_commit, scope_id: target.scope_id, activation_epoch: target.activation_epoch, mirror_digest: target.mirror_digest, policy_id: policy.policy_id, policy_digest: approvedPolicyDigest(target.tier) };
}
function comparisonEffects(bootstrap, dimensionId, comparison, materiality) {
  const effect = bootstrap.dimensions[dimensionId].comparisons[comparison];
  const point = Number(effect.point.decimal); const lower = Number(effect.interval.lower.decimal); const upper = Number(effect.interval.upper.decimal);
  return { comparison_id: comparison, point: finiteMetric(point * materiality), normalized_point: effect.point, interval_lower: effect.interval.lower, interval_upper: effect.interval.upper, bootstrap_digest: bootstrap.draw_digest };
}
function within(value, lower, upper) { return Number.isFinite(value) && value >= lower && value <= upper; }
function buildEvaluatedArtifact(input, policy, model, evaluationAt) {
  const codes = ['H2', 'H1', 'W1', 'W2']; const comparisonIds = policy.weighting.comparisons;
  const sourceById = new Map(input.families.map((entry) => [entry.family_id, entry]));
  const category = { missing_invalid_outcome: 'missing_invalid_outcome', incomplete_identity_exposure: 'incomplete_identity_exposure', invalid_fingerprint_covariate: 'invalid_fingerprint_covariate', stale_clock_failure: 'stale_clock_failure', concurrent_change: 'concurrent_change', required_absent_stratum: 'unsupported_stratum', boundary_crossing: 'other_policy_failure', conflicting_terminal: 'other_policy_failure', foreign_scope: 'other_policy_failure' };
  const cohortRows = codes.map((code) => {
    const cohort = model.cohorts[code]; const source = memberSetRow(cohort.source_denominator_members); const accepted = memberSetRow(cohort.accepted_pre_support_members); const post = memberSetRow(cohort.accepted_post_support_members);
    const exclusionIds = Object.fromEntries(['missing_invalid_outcome', 'incomplete_identity_exposure', 'mixed_fallback_degraded_exposure', 'invalid_fingerprint_covariate', 'stale_clock_failure', 'concurrent_change', 'unsupported_stratum', 'other_policy_failure'].map((reason) => [reason, []]));
    for (const [reason, members] of Object.entries(cohort.exclusions)) exclusionIds[category[reason] || 'other_policy_failure'].push(...members);
    const supportedAway = accepted.members.filter((id) => !post.members.includes(id)); exclusionIds.unsupported_stratum.push(...supportedAway);
    for (const key of Object.keys(exclusionIds)) exclusionIds[key] = [...new Set(exclusionIds[key])].sort(scalarCompare);
    const missing = memberSetRow(exclusionIds.missing_invalid_outcome.map((family_id) => ({ family_id })));
    const evidenceMembers = Object.entries(exclusionIds).filter(([reason]) => reason !== 'missing_invalid_outcome').flatMap(([, ids]) => ids).map((family_id) => ({ family_id })); const evidence = memberSetRow(evidenceMembers);
    const side = Object.values(model.comparisons).flatMap((comparison) => [comparison.left, comparison.right]).find((item) => item.cohort_id === code);
    return { cohort_id: code, source_denominator_members: source.members, source_denominator_digest: source.digest, source_denominator_count: source.count, missing_members: missing.members, missing_digest: missing.digest, missing_count: missing.count, missing_rate: rate(missing.count, source.count), evidence_excluded_members: evidence.members, evidence_excluded_digest: evidence.digest, evidence_excluded_count: evidence.count, evidence_exclusion_rate: rate(evidence.count, source.count), exclusions: Object.entries(exclusionIds).map(([reason, ids]) => ({ reason, members: ids, members_digest: createHash('sha256').update(JSON.stringify(ids)).digest('hex'), count: ids.length })), accepted_pre_support_members: accepted.members, accepted_pre_support_digest: accepted.digest, accepted_pre_support_count: accepted.count, accepted_post_support_members: post.members, accepted_post_support_digest: post.digest, accepted_post_support_count: post.count, support_ratio: rate(post.count, accepted.count), count: post.count, ess: finiteMetric(side?.ess || 0), plan_count: side?.plan_count || 0, diversity_kind: input.evaluated_target.tier === 'global' ? 'evaluator_host_project_scope' : 'workload_risk_fingerprint_class', diversity_count: side?.diversity_count || 0 };
  });
  const byCode = Object.fromEntries(cohortRows.map((row) => [row.cohort_id, row]));
  const comparisons = comparisonIds.map((comparisonId) => {
    const [leftCode, rightCode] = comparisonId.split('/'); const left = byCode[leftCode]; const right = byCode[rightCode];
    const side = (row) => ({ cohort_id: row.cohort_id, count: row.count, ess: row.ess, plan_count: row.plan_count, diversity_count: row.diversity_count, support_ratio: row.support_ratio, missing_rate: row.missing_rate, evidence_exclusion_rate: row.evidence_exclusion_rate });
    const shift = (key) => left[key].value === null || right[key].value === null ? Number.POSITIVE_INFINITY : Math.abs(Number(left[key].value.decimal) - Number(right[key].value.decimal));
    return { comparison_id: comparisonId, left: side(left), right: side(right), missing_rate_shift: finiteMetric(Number.isFinite(shift('missing_rate')) ? shift('missing_rate') : Number.MAX_VALUE), evidence_exclusion_rate_shift: finiteMetric(Number.isFinite(shift('evidence_exclusion_rate')) ? shift('evidence_exclusion_rate') : Number.MAX_VALUE) };
  });
  const bootstrap = model.bootstrap_effects; const dimensions = input.impact_contract.dimensions.map((dimension) => ({ dimension_id: dimension.id, role: dimension.role, materiality: finiteMetric(dimension.absolute_materiality), effects: comparisonIds.map((comparison) => comparisonEffects(bootstrap, dimension.id, comparison, dimension.absolute_materiality)) }));
  const balance = [];
  for (const covariate of input.impact_contract.raw_covariates) for (const comparisonId of comparisonIds) {
    const [leftCode, rightCode] = comparisonId.split('/'); const operands = model.comparisons[comparisonId];
    const stats = (code) => { const members = operands[code === leftCode ? 'left' : 'right'].members; const values = members.map((member) => ({ value: sourceById.get(member.family_id).raw_pre_outcome_covariates[covariate.id], weight: member.weight })); const mean = fold(values.map(({ value, weight }) => numeric(value * weight))); const variance = fold(values.map(({ value, weight }) => numeric(weight * (value - mean) ** 2))); return { mean, variance }; };
    const left = stats(leftCode); const right = stats(rightCode); const pooled = numeric(Math.sqrt(numeric((left.variance + right.variance) / 2))); const bitEqual = bits(left.mean) === bits(right.mean); const smd = pooled === 0 ? (bitEqual ? 0 : Number.MAX_VALUE) : numeric(Math.abs(left.mean - right.mean) / pooled);
    balance.push({ covariate_id: covariate.id, comparison_id: comparisonId, left_mean: finiteMetric(left.mean), right_mean: finiteMetric(right.mean), left_variance: finiteMetric(left.variance), right_variance: finiteMetric(right.variance), pooled_scale: finiteMetric(pooled), smd: finiteMetric(smd), zero_scale_means_bit_equal: pooled === 0 ? bitEqual : null, passed: smd <= policy.quality.balance.maximum_smd });
  }
  const primary = dimensions.find((dimension) => dimension.role === 'primary'); const effect = (dimension, comparison) => dimension.effects.find((item) => item.comparison_id === comparison);
  const driftEffect = effect(primary, 'H1/H2'); const postLeft = effect(primary, 'W1/H1'); const postRight = effect(primary, 'W2/H2');
  const driftCheck = (point, lower, upper) => ({ point: finiteMetric(point), interval_lower: finiteMetric(lower), interval_upper: finiteMetric(upper), minimum: finiteMetric(-0.5), maximum: finiteMetric(0.5), passed: [point, lower, upper].every((value) => within(value, -0.5, 0.5)) });
  const drift = driftCheck(Number(driftEffect.normalized_point.decimal), Number(driftEffect.interval_lower.decimal), Number(driftEffect.interval_upper.decimal));
  const pairedPost = pairedBootstrapDistribution({ left_point: Number(postLeft.normalized_point.decimal), right_point: Number(postRight.normalized_point.decimal), left_replicates: bootstrap.dimensions[primary.dimension_id].comparisons['W1/H1'].normalized_replicates, right_replicates: bootstrap.dimensions[primary.dimension_id].comparisons['W2/H2'].normalized_replicates });
  const consistency = driftCheck(Number(pairedPost.point.decimal), Number(pairedPost.interval.lower.decimal), Number(pairedPost.interval.upper.decimal));
  const rateGate = (kind, maximumRate, maximumShift) => ({ cohorts: cohortRows.map((row) => ({ cohort_id: row.cohort_id, rate: row[kind], floor: finiteMetric(maximumRate), passed: row[kind].value !== null && Number(row[kind].value.decimal) <= maximumRate })), comparisons: comparisons.map((row) => ({ comparison_id: row.comparison_id, shift: row[`${kind}_shift`], floor: finiteMetric(maximumShift), passed: Number(row[`${kind}_shift`].decimal) <= maximumShift })) });
  const missingness = rateGate('missing_rate', policy.quality.missingness.maximum_rate, policy.quality.missingness.maximum_shift); const evidence = rateGate('evidence_exclusion_rate', policy.quality.exclusions.maximum_rate, policy.quality.exclusions.maximum_shift);
  const primaryRows = ['W1/H1', 'W2/H2'].map((comparison_id) => { const current = effect(primary, comparison_id); const point = Number(current.normalized_point.decimal); const lower = Number(current.interval_lower.decimal); return { comparison_id, point: current.normalized_point, interval_lower: current.interval_lower, minimum_point: finiteMetric(1), minimum_interval_lower: finiteMetric(0), passed: point >= 1 - Number.EPSILON / 2 && lower > 0 }; });
  const guardrailRows = dimensions.filter((dimension) => dimension.role === 'guardrail').flatMap((dimension) => ['W1/H1', 'W2/H2'].map((comparison_id) => ({ dimension_id: dimension.dimension_id, comparison_id, interval_lower: effect(dimension, comparison_id).interval_lower, floor: finiteMetric(-0.5), passed: Number(effect(dimension, comparison_id).interval_lower.decimal) > -0.5 })));
  const credits = dimensions.filter((dimension) => dimension.role === 'benefit').flatMap((dimension) => ['W1/H1', 'W2/H2'].map((comparison_id) => { const lower = Number(effect(dimension, comparison_id).interval_lower.decimal); return { dimension_id: dimension.dimension_id, comparison_id, interval_lower: effect(dimension, comparison_id).interval_lower, credit: finiteMetric(Math.max(0, -lower)) }; }));
  const benefits = { credits, pairs: ['W1/H1', 'W2/H2'].map((comparison_id) => { const sum = fold(credits.filter((credit) => credit.comparison_id === comparison_id).map((credit) => Number(credit.credit.decimal))); const primaryLower = Number(effect(primary, comparison_id).interval_lower.decimal); return { comparison_id, credit_sum: finiteMetric(sum), primary_interval_lower: effect(primary, comparison_id).interval_lower, passed: sum < primaryLower }; }) };
  const all = (rows) => rows.every((row) => row.passed);
  const timing = model.timing;
  const discontinuities = model.discontinuities;
  const gateResults = { timing: timing.passed, support: cohortRows.every((row) => row.support_ratio.value !== null && Number(row.support_ratio.value.decimal) >= 0.8), floors: cohortRows.every((row) => row.count >= 30 && Number(row.ess.decimal) >= 30 && row.plan_count >= 5 && row.diversity_count >= 2), balance: all(balance), baseline_drift: drift.passed, post_consistency: consistency.passed, missingness: all(missingness.cohorts) && all(missingness.comparisons), evidence_exclusions: all(evidence.cohorts) && all(evidence.comparisons), provenance: discontinuities.length === 0, primary: all(primaryRows), guardrail: all(guardrailRows), benefit: all(benefits.pairs), all: false };
  const qualityKeys = ['timing', 'support', 'floors', 'balance', 'baseline_drift', 'post_consistency', 'missingness', 'evidence_exclusions', 'provenance']; gateResults.all = qualityKeys.every((key) => gateResults[key]);
  const gateOperands = { timing: { t0: input.target_t0, freeze_not_before: model.freeze_at, evaluated_at: evaluationAt, max_gap_seconds: 1209600, observed_max_gap_seconds: finiteMetric(timing.observed_max_gap_seconds), passed: timing.passed }, support: cohortRows.map((row) => ({ cohort_id: row.cohort_id, ratio: row.support_ratio, floor: finiteMetric(0.8), passed: row.support_ratio.value !== null && Number(row.support_ratio.value.decimal) >= 0.8 })), floors: cohortRows.map((row) => ({ cohort_id: row.cohort_id, count: row.count, ess: row.ess, plan_count: row.plan_count, diversity_count: row.diversity_count })), weighting: comparisonIds.map((comparison_id) => ({ comparison_id, stratum_masses: model.comparisons[comparison_id].stratum_masses })), balance, drift_consistency: { baseline_h1_h2: drift, post_w1h1_minus_w2h2: consistency }, missingness, evidence_exclusions: evidence, provenance: { timing_continuity_passed: timing.passed, identity_passed: true, fingerprint_passed: true, discontinuities, passed: gateResults.provenance }, primary: primaryRows, guardrails: guardrailRows, benefits, gate_results: gateResults };
  const metricValues = { support_floor: 0.8, missing_rate_floor: 0.05, missing_rate_shift_floor: 0.05, evidence_exclusion_rate_floor: 0.2, evidence_exclusion_rate_shift_floor: 0.1, minimum_count: 30, minimum_ess: 30, minimum_plan_count: 5, minimum_diversity_count: 2, balance_smd_maximum: 0.1, drift_minimum: -0.5, drift_maximum: 0.5, consistency_minimum: -0.5, consistency_maximum: 0.5, primary_minimum_point: 1, primary_minimum_interval_lower: 0, non_primary_minimum_interval_lower: -0.5, benefit_credit_sum: maxMetric(benefits.pairs.map((row) => Number(row.credit_sum.decimal))), benefit_primary_interval_lower: maxMetric(benefits.pairs.map((row) => Number(row.primary_interval_lower.decimal))) };
  for (const [key, value] of Object.entries(metricValues)) if (typeof value === 'number') metricValues[key] = finiteMetric(value);
  const flags = [['timing', 'timing_failed'], ['support', 'support_failed'], ['floors', 'floors_failed'], ['balance', 'balance_failed'], ['baseline_drift', 'baseline_drift_failed'], ['post_consistency', 'post_consistency_failed'], ['missingness', 'missingness_failed'], ['evidence_exclusions', 'evidence_exclusions_failed'], ['provenance', 'provenance_failed']].filter(([key]) => !gateResults[key]).map(([, flag]) => flag);
  if (discontinuities.length) flags.push('discontinuity_detected');
  let state; let reason;
  if (flags.length) { state = 'inconclusive'; reason = flags.includes('provenance_failed') ? 'provenance_failed' : flags.includes('support_failed') ? 'support_ratio_below_floor' : flags.includes('floors_failed') ? 'count_below_floor' : flags.includes('balance_failed') ? 'balance_failed' : flags.includes('baseline_drift_failed') ? 'baseline_drift_failed' : flags.includes('post_consistency_failed') ? 'post_consistency_failed' : flags.includes('missingness_failed') ? 'missingness_failed' : flags.includes('evidence_exclusions_failed') ? 'evidence_exclusions_failed' : 'timing_gap'; }
  else if (!primaryRows.some((row) => Number(row.point.decimal) >= 1 - Number.EPSILON / 2)) { state = 'frozen'; reason = 'frozen_no_repeated_harm'; }
  else if (gateResults.primary && gateResults.guardrail && gateResults.benefit) { state = 'repeated_observational_harm'; reason = 'repeated_observational_harm'; }
  else { state = 'inconclusive'; reason = !gateResults.guardrail ? 'guardrail_failed' : !gateResults.benefit ? 'benefit_gate_failed' : 'primary_gate_failed'; flags.push(reason === 'guardrail_failed' ? 'guardrail_failed' : reason === 'benefit_gate_failed' ? 'benefit_gate_failed' : 'primary_gate_failed'); }
  const closedWindow = `window:${input.evaluated_target.activation_epoch}`; const expiresAt = new Date(Date.parse(evaluationAt) + 2592000000).toISOString();
  return buildImpactEvaluationArtifact({ tier: input.evaluated_target.tier, state, lineage: evaluatedLineage(input, policy), cohorts: cohortRows, comparisons, dimensions, balance, drift_consistency: { baseline_h1_h2: drift, post_w1h1_minus_w2h2: consistency }, gate_operands: gateOperands, metrics: metricValues, quality_flags: flags, reason, prior_result: null, collection_progress: null, closed_window_id: closedWindow, created_at: evaluationAt, expires_at: expiresAt });
}

function bootstrapEffects(input, policy, accepted, supported, comparisons) {
  const tags = policy.bootstrap.frame.tags; const roleRank = { primary: 0, guardrail: 1, benefit: 2 }; const dimensions = [...input.impact_contract.dimensions].sort((left, right) => roleRank[left.role] - roleRank[right.role] || scalarCompare(left.id, right.id)); const allDraws = createHash('sha256'); const output = {};
  for (const dimension of dimensions) {
    const dimensionOutput = { comparisons: {} };
    for (const [comparison, operands] of Object.entries(comparisons)) {
      const [leftCode, rightCode] = comparison.split('/'); const seed = comparisonSeed(policy, input, dimension, comparison); const strata = [...supported].sort(scalarCompare).map((key, ordinal) => {
        const members = (code) => accepted[code].filter((entry) => entry.fingerprint.key_digest === key).sort((left, right) => scalarCompare(left.family_id, right.family_id));
        return { key, ordinal, left: members(leftCode), right: members(rightCode), weight: operands.stratum_masses[key] };
      });
      const effect = (sampled) => numeric(fold(strata.map((stratum) => numeric(stratum.weight * numeric(fold(sampled(stratum, 'left').map((entry) => normalizedValue(entry, dimension))) / stratum.left.length - fold(sampled(stratum, 'right').map((entry) => normalizedValue(entry, dimension))) / stratum.right.length)))) / dimension.absolute_materiality);
      const point = effect((stratum, side) => stratum[side]); const replicates = [];
      for (let replicate = 0; replicate < policy.bootstrap.replicates; replicate += 1) {
        const selected = (stratum, side) => Array.from({ length: stratum[side].length }, (_, draw) => {
          const hash = framedHash([frameField(tags.seed, seed), frameField(tags.replicate, replicate, 'u32'), frameField(tags.cohort_code, side === 'left' ? leftCode : rightCode, 'text'), frameField(tags.stratum_ordinal, stratum.ordinal, 'u32'), frameField(tags.draw, draw, 'u32')]);
          const index = Number(hash.readBigUInt64BE(0) % BigInt(stratum[side].length)); allDraws.update(hash); allDraws.update(u32(index)); return stratum[side][index];
        });
        replicates.push(effect(selected));
      }
      const sorted = [...replicates].sort(binary64TotalOrder);
      dimensionOutput.comparisons[comparison] = { seed: seed.toString('hex'), point: rendered(point), interval: { lower: rendered(sorted[249]), upper: rendered(sorted[9749]) }, normalized_replicates: replicates, replicates: policy.bootstrap.replicates };
    }
    output[dimension.id] = dimensionOutput;
  }
  return { schema: 'rule-impact-bootstrap-effects-v1', estimator_id: policy.bootstrap.estimator_id, replicates: policy.bootstrap.replicates, dimensions: output, draw_digest: allDraws.digest('hex') };
}

/** Builds pure BD-1–BD-19 cohort operands and deterministic numeric bootstrap stage. */
export function evaluateRuleImpact(request) {
  const keys = ['inputBytes', 'evaluationInputDigest', 'policyBytes', 'policyDigest', 'evaluationAt'];
  if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).join('\0') !== keys.join('\0')) invalid();
  const { inputBytes, evaluationInputDigest, policyBytes, policyDigest, evaluationAt } = request;
  const input = parseEvaluatorInputBytes(inputBytes, { expectedInputDigest: evaluationInputDigest });
  if (typeof evaluationAt !== 'string' || !INSTANT.test(evaluationAt) || !Number.isFinite(Date.parse(evaluationAt))) invalid();
  const tier = input.evaluated_target.tier;
  if (!(Buffer.isBuffer(policyBytes) || policyBytes instanceof Uint8Array) || !Buffer.from(policyBytes).equals(approvedPolicyBytes(tier)) || policyDigest !== approvedPolicyDigest(tier)) invalid();
  const policy = policyForTier(tier); const t0 = Date.parse(input.target_t0); const now = Date.parse(evaluationAt); const frozenAt = t0 + 5788800000;
  const { grouped, sources } = sourceFamilies(input);
  if (now < frozenAt) {
    const cohorts = Object.fromEntries(Object.entries(sources).map(([code, entries]) => [code, { source_denominator_count: entries.length }]));
    const evaluation = collectingArtifact(input, policy, evaluationAt, cohorts);
    const model = { schema: 'rule-impact-collection-model-v1', policy_id: policy.policy_id, evaluation_at: evaluationAt, target_t0: input.target_t0, freeze_at: new Date(frozenAt).toISOString(), cohorts, bootstrap_effects: null, disposition: 'collecting' };
    return deepFreeze({ artifact: evaluation.artifact, bytes: evaluation.bytes, digest: evaluation.result_digest, state: 'collecting', tier, model });
  }
  const accepted = Object.fromEntries(['H2', 'H1', 'W1', 'W2'].map((code) => [code, []]));
  const excluded = Object.fromEntries(['H2', 'H1', 'W1', 'W2'].map((code) => [code, Object.create(null)]));
  const timingSources = Object.fromEntries(['H2', 'H1', 'W1', 'W2'].map((code) => [code, []]));
  const immediate = [];
  const discontinuitySet = new Set();
  for (const entries of grouped.values()) {
    const canonical = entries[0]; const code = canonical.window_code;
    if (entries.some((entry) => exactFamily(entry) !== exactFamily(canonical))) { addReason(excluded, code, 'conflicting_terminal', canonical); continue; }
    const [start, end] = windowBounds(t0, code); const started = Date.parse(canonical.production_started_at); const ended = Date.parse(canonical.terminal_finalized_at);
    if (!timeInWindow(started, start, end) || ended > end) { addReason(excluded, code, 'boundary_crossing', canonical); continue; }
    if ((canonical.family_kind === 'history' && canonical.target_presence !== 'absent') || (canonical.family_kind === 'post' && JSON.stringify(canonical.target) !== JSON.stringify(input.evaluated_target))) { addReason(excluded, code, 'incomplete_identity_exposure', canonical); continue; }
    if (tier === 'project' && canonical.project_scope !== input.evaluated_target.scope_id) { addReason(excluded, code, 'foreign_scope', canonical); continue; }
    const events = canonical.epoch_events.filter((event) => event.effect !== 'none');
    const closeEpoch = events.filter((event) => event.effect === 'close_epoch' && event.rule_id === input.evaluated_target.rule_id && event.version_hash === input.evaluated_target.version_hash && event.activation_epoch === input.evaluated_target.activation_epoch && Date.parse(event.event_at) >= windowBounds(t0, 'H2')[0] && Date.parse(event.event_at) < windowBounds(t0, 'W2')[1]);
    if (closeEpoch.length) { for (const event of closeEpoch) discontinuitySet.add(event.event_type); immediate.push('discontinuity_detected'); addReason(excluded, code, 'stale_clock_failure', canonical); continue; }
    if (events.length) { addReason(excluded, code, 'concurrent_change', canonical); continue; }
    timingSources[code].push(canonical);
    const outcome = canonical.outcome;
    const deadline = end + 604800000;
    if (outcome.status !== 'finalized') { if (outcome.status !== 'missing' || now >= deadline) addReason(excluded, code, 'missing_invalid_outcome', canonical); continue; }
    if (Date.parse(outcome.finalized_at) > deadline || Date.parse(outcome.finalized_at) > now) { addReason(excluded, code, 'missing_invalid_outcome', canonical); continue; }
    const dimensions = input.impact_contract.dimensions;
    const values = outcome.values;
    const required = dimensions.map((item) => item.id);
    if (outcome.definition_id !== input.impact_contract.outcome_definition_id || outcome.definition_version !== input.impact_contract.outcome_definition_version || Object.keys(values).length !== required.length || required.some((id) => !Object.hasOwn(values, id) || !validValue(values[id], dimensions.find((item) => item.id === id)))) { addReason(excluded, code, 'missing_invalid_outcome', canonical); continue; }
    const covariates = input.impact_contract.raw_covariates;
    if (covariates.some((definition) => !Object.hasOwn(canonical.raw_pre_outcome_covariates, definition.id) || !Object.hasOwn(canonical.fingerprint.key.covariate_bins, definition.id) || !validCovariate(canonical.raw_pre_outcome_covariates[definition.id], canonical.fingerprint.key.covariate_bins[definition.id], definition))) { addReason(excluded, code, 'invalid_fingerprint_covariate', canonical); continue; }
    accepted[code].push(canonical);
  }
  const strata = new Map(); for (const code of Object.keys(accepted)) for (const entry of accepted[code]) { const cells = strata.get(entry.fingerprint.key_digest) || Object.fromEntries(['H2', 'H1', 'W1', 'W2'].map((name) => [name, []])); cells[code].push(entry); strata.set(entry.fingerprint.key_digest, cells); }
  const requiredAbsent = []; const supported = new Set();
  for (const [key, cells] of strata) { const present = Object.values(cells).every((members) => members.length); if (present) supported.add(key); else for (const [code, members] of Object.entries(cells)) { const threshold = Math.max(3, Math.ceil(accepted[code].length * 0.05)); if (members.length >= threshold) requiredAbsent.push({ code, key, count: members.length, threshold }); } }
  const cohorts = {};
  for (const code of Object.keys(accepted)) {
    const post = accepted[code].filter((entry) => supported.has(entry.fingerprint.key_digest));
    cohorts[code] = { source_denominator_members: sources[code].map(modelMember), source_denominator_count: sources[code].length, accepted_pre_support_members: accepted[code].map(modelMember), accepted_pre_support_count: accepted[code].length, accepted_post_support_members: post.map(modelMember), accepted_post_support_count: post.length, support_ratio: accepted[code].length ? post.length / accepted[code].length : 0, exclusions: Object.fromEntries(Object.entries(excluded[code]).map(([reason, members]) => [reason, [...members].sort(scalarCompare)])) };
  }
  const comparisons = {};
  for (const comparison of policy.weighting.comparisons) {
    const [leftCode, rightCode] = comparison.split('/'); const masses = {};
    let total = 0; for (const key of supported) { const mass = Math.min(cohortMap(accepted[leftCode], leftCode).filter((entry) => entry.fingerprint.key_digest === key).length, cohortMap(accepted[rightCode], rightCode).filter((entry) => entry.fingerprint.key_digest === key).length); masses[key] = mass; total += mass; }
    for (const key of Object.keys(masses)) masses[key] = total ? masses[key] / total : 0;
    const left = sideOperands(accepted[leftCode], leftCode, supported, masses); const right = sideOperands(accepted[rightCode], rightCode, supported, masses);
    for (const side of [left, right]) for (const member of side.members) member.diversity = tier === 'global' ? member.project_scope : accepted[side.cohort_id].find((entry) => entry.family_id === member.family_id).fingerprint.key.workload_risk_fingerprint_class;
    left.diversity_count = new Set(left.members.map((member) => member.diversity)).size; right.diversity_count = new Set(right.members.map((member) => member.diversity)).size;
    comparisons[comparison] = { comparison_id: comparison, stratum_masses: masses, left, right };
  }
  const timingGaps = [];
  const timingFamilies = Object.values(timingSources).flat().sort((left, right) => Date.parse(left.production_started_at) - Date.parse(right.production_started_at) || scalarCompare(left.family_id, right.family_id));
  for (let index = 1; index < timingFamilies.length; index += 1) timingGaps.push(Date.parse(timingFamilies[index].production_started_at) - Date.parse(timingFamilies[index - 1].production_started_at));
  const h1Starts = timingSources.H1.map((entry) => Date.parse(entry.production_started_at)).sort((left, right) => left - right);
  const w1Starts = timingSources.W1.map((entry) => Date.parse(entry.production_started_at)).sort((left, right) => left - right);
  if (h1Starts.length) timingGaps.push(t0 - h1Starts.at(-1));
  if (w1Starts.length) timingGaps.push(w1Starts[0] - t0);
  const observedMaxGapSeconds = timingGaps.length ? Math.max(...timingGaps) / 1000 : Number.POSITIVE_INFINITY;
  const timing = { observed_max_gap_seconds: observedMaxGapSeconds, passed: Number.isFinite(observedMaxGapSeconds) && observedMaxGapSeconds <= 1209600 };
  const floorsFailed = Object.values(cohorts).some((cohort) => cohort.accepted_post_support_count < 30 || cohort.support_ratio < 0.8) || ['W1/H1', 'W2/H2'].some((code) => { const pair = comparisons[code]; return pair.left.ess < 30 || pair.right.ess < 30 || pair.left.plan_count < 5 || pair.right.plan_count < 5 || pair.left.diversity_count < 2 || pair.right.diversity_count < 2; });
  const discontinuities = [...discontinuitySet].sort((left, right) => Object.keys(EVENT_EFFECTS).indexOf(left) - Object.keys(EVENT_EFFECTS).indexOf(right));
  const reason = discontinuities.length ? 'discontinuity_detected' : !timing.passed ? 'timing_gap' : requiredAbsent.length ? 'required_absent_stratum' : floorsFailed ? 'floors_or_support_not_met' : null;
  const state = reason ? 'inconclusive' : now < frozenAt ? 'collecting' : 'evaluating';
  const bootstrap = state === 'collecting' || reason ? null : bootstrapEffects(input, policy, accepted, supported, comparisons);
  const model = { schema: 'rule-impact-cohort-model-v1', policy_id: policy.policy_id, evaluation_at: evaluationAt, target_t0: input.target_t0, freeze_at: new Date(frozenAt).toISOString(), timing, discontinuities, cohorts, required_absent_strata: requiredAbsent, comparisons, bootstrap_effects: bootstrap, disposition: reason || (state === 'collecting' ? 'collecting' : 'evaluated') };
  if (state === 'collecting') {
    const evaluation = collectingArtifact(input, policy, evaluationAt, cohorts);
    return deepFreeze({ artifact: evaluation.artifact, bytes: evaluation.bytes, digest: evaluation.result_digest, state, tier, model });
  }
  if (reason) {
    // Evaluated state needs complete operands; a pre-bootstrap cohort failure remains inconclusive.
    const emptyBootstrap = bootstrapEffects(input, policy, accepted, supported, comparisons);
    model.bootstrap_effects = emptyBootstrap;
  }
  const evaluation = buildEvaluatedArtifact(input, policy, model, evaluationAt);
  return deepFreeze({ artifact: evaluation.artifact, bytes: evaluation.bytes, digest: evaluation.result_digest, state: evaluation.artifact.state, tier, model });
}

/** Admits fully verified eligible input into one isolated policy pool; it never evaluates. */
export function admitRuleImpactInput(input = {}) {
  if (input.collection_disposition !== 'eligible') return Object.freeze({ admitted: false, reason: 'input_not_eligible' });
  const policy = policyForTier(input.tier);
  const target = input.target;
  if (!target || typeof target.rule_id !== 'string' || !DIGEST.test(target.version_hash) || typeof target.activation_epoch !== 'string' || !target.activation_epoch || (input.tier === 'global' && (input.scope_id !== null || !target.rule_id.startsWith('pidex-global:'))) || (input.tier === 'project' && ((typeof input.scope_id !== 'string' || !input.scope_id) || !target.rule_id.startsWith(`project:${input.scope_id}:`)))) return Object.freeze({ admitted: false, reason: 'tier_scope_invalid' });
  return Object.freeze({ admitted: true, tier: input.tier, policy_id: policy.policy_id, pool_key: `${input.tier}\0${input.scope_id || ''}\0${target.rule_id}\0${target.version_hash}\0${target.activation_epoch}` });
}
