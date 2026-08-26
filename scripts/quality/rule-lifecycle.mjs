#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireAcceptedHeadFacts } from './rule-mirror-sync.mjs';
import { acquireAcceptedRemoteReceipt, openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { resolveStateRoot } from '../../modules/pidex/analysis-metrics-history/lib/state-root.mjs';
import { aggregateRuleLearningFindings } from './rule-learning-aggregate.mjs';
import { buildRuleLearningCandidate, canonicalCandidateBytes } from './rule-learning-candidate.mjs';
import { admitRuleLearningCandidate, prepareSemanticReviewContext } from './rule-learning-admission.mjs';
import { applyRuleLifecycleControl } from './rule-lifecycle-action.mjs';
import { derivePublicationIdempotencyKey, preparePublicationTransaction } from './rule-publication-transaction.mjs';
import { findingDigest } from './rule-learning-contracts.mjs';

const MANIFEST_PATH = 'config/rule-baseline-manifest.json';
const TOP_LEVEL = Object.freeze(['schema', 'source_kind', 'baseline_parent_commit', 'agent_count', 'rule_count', 'agents', 'rules', 'aggregate_digest']);
const MEMBER_PATH = /^(agents\/pidex-[a-z0-9-]+\.md|rules\/[a-z0-9][a-z0-9._/-]*\.md)$/;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const INITIAL_BASELINE_PARENT = 'a4501c23c3dc8b007995825682b22207cf8f3082';
const ACCEPTED_HEAD_KEYS = Object.freeze(['accepted_commit', 'first_parent_commit']);
const AUTOMATIC_ROLE_ORDER = Object.freeze(['pidex-pi', 'pidex-critic', 'pidex-code-reviewer', 'pidex-security']);
const AUTOMATIC_ROUTE_KEYS = Object.freeze(['principal', 'provider', 'model', 'backend_identity']);

function fail(code) { throw new Error(code); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function exactKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
const AUTOMATIC_GENERATOR_FIELDS = Object.freeze(['slug', 'applicability', 'instruction', 'trigger', 'expected_evidence', 'failure_behavior', 'rationale']);
const ADAPTER_EVENT_FIELDS = Object.freeze(['schema', 'event_id', 'event_type', 'tier', 'scope_digest', 'stage', 'role', 'work_digest', 'run_retry_digest', 'principal_digest', 'route_digest', 'profile_generation', 'configuration_generation', 'disposition', 'reason_code', 'occurred_at']);
const ADAPTER_EVENT_ROWS = Object.freeze([
  ['state_authority_invalid','authority_blocked','state','blocked_state_authority'], ['store_missing','authority_blocked','state','blocked_state_authority'], ['store_invalid','authority_blocked','state','blocked_state_authority'], ['profile_missing','authority_blocked','state','blocked_profile_authority'], ['profile_stale','authority_blocked','state','blocked_profile_authority'], ['route_missing','authority_blocked','route','blocked_route_authority'], ['route_default_forbidden','authority_blocked','route','blocked_route_authority'], ['route_alias_forbidden','authority_blocked','route','blocked_reviewer_independence'], ['route_stale','authority_blocked','route','blocked_route_authority'], ['source_authority_forbidden','authority_blocked','eligibility','blocked_source_authority'], ['eligibility_unmintable','authority_blocked','eligibility','blocked_eligibility'], ['global_eligibility_insufficient','authority_blocked','eligibility','blocked_eligibility'], ['artifact_missing','authority_blocked','artifact','blocked_artifact_authority'], ['artifact_wrong','authority_blocked','artifact','blocked_artifact_authority'], ['artifact_unsynced','authority_blocked','artifact','blocked_artifact_authority'], ['artifact_duplicate','authority_blocked','artifact','blocked_artifact_authority'], ['artifact_changed','durable_conflict','artifact','blocked_durable_conflict'], ['artifact_malformed','authority_blocked','artifact','blocked_artifact_authority'], ['identity_bytes_conflict','durable_conflict','eligibility','blocked_durable_conflict'], ['result_bytes_conflict','durable_conflict','recovery','blocked_durable_conflict'], ['event_bytes_conflict','durable_conflict','recovery','blocked_durable_conflict'],
  ['runner_rejected','stage_rejected','runner','blocked_recovery_pending'], ['runner_malformed','stage_malformed','runner','blocked_recovery_pending'], ['runner_failure','stage_failure','runner','blocked_recovery_pending'], ['runner_timeout','stage_timeout','runner','blocked_recovery_pending'], ['runner_crash','stage_crash','runner','blocked_recovery_pending'], ['dispatch_unknown','stage_unknown_dispatch','runner','blocked_recovery_pending'], ['source_fact_drift','stage_drift','handoff','blocked_source_fact_drift'], ['generation_drift','stage_drift','handoff','blocked_source_fact_drift'], ['route_drift','stage_drift','handoff','blocked_source_fact_drift'], ['enrollment_drift','stage_drift','target','blocked_source_fact_drift'], ['fresh_base_malformed','authority_blocked','target','blocked_target_authority'], ['fresh_base_unavailable','authority_blocked','target','blocked_target_authority'], ['fresh_base_drift','stage_drift','target','blocked_target_authority'], ['target_invalid','authority_blocked','target','blocked_target_authority'], ['duplicate_result','stage_duplicate','recovery','completed_result_reused'], ['resume_undispatched','stage_recovery','recovery','recovery_dispatch_once'], ['recovery_pending','stage_recovery','recovery','blocked_recovery_pending'], ['recovery_conflict','durable_conflict','recovery','blocked_durable_conflict'], ['recovery_terminal_noop','stage_recovery','recovery','completed_result_reused'], ['store_write_forbidden','authority_blocked','state','blocked_state_authority'], ['dispatch_path_forbidden','authority_blocked','artifact','blocked_artifact_authority'], ['context_contract_invalid','authority_blocked','artifact','blocked_artifact_authority'], ['source_invalid','authority_blocked','eligibility','blocked_source_authority'], ['result_authority_mismatch','stage_malformed','runner','blocked_recovery_pending'], ['scope_isolation_conflict','durable_conflict','eligibility','blocked_durable_conflict'], ['target_query_forbidden','authority_blocked','target','blocked_target_authority'], ['lifecycle_authority_forbidden','authority_blocked','handoff','blocked_lifecycle_authority'], ['handoff_duplicate','stage_duplicate','handoff','handoff_already_consumed'],
]);
const ADAPTER_EVENT_BY_REASON = new Map(ADAPTER_EVENT_ROWS.map((row) => [row[0], row]));
const adapterMatrixRow = ([reason_code, event_type, stage, disposition], resolvedStage) => { const resolved = typeof resolvedStage === 'string' ? resolvedStage : stage; return Object.freeze({ reason_code, event_type, stage: resolved, role: resolved === 'generator' ? 'pidex-pi' : resolved === 'reviewer' ? 'configured-reviewer' : null, disposition, tier: reason_code === 'global_eligibility_insufficient' ? 'global' : 'both' }); };
export const AUTOMATIC_LEARNING_ADAPTER_EVENT_MATRIX = Object.freeze([...ADAPTER_EVENT_ROWS.slice(0, 21).map(adapterMatrixRow), ...ADAPTER_EVENT_ROWS.slice(21, 27).map((row) => adapterMatrixRow(row, 'generator')), ...ADAPTER_EVENT_ROWS.slice(21, 27).map((row) => adapterMatrixRow(row, 'reviewer')), ...ADAPTER_EVENT_ROWS.slice(27).map(adapterMatrixRow)].map((row, index) => Object.freeze({ id: `TEL-PA-${index + 1}`, ...row })));
function boundedText(value, limit = 2048) { return typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\u0000-\u001f]/.test(value); }
function adapterEventId(fields) { const digest = createHash('sha256'); for (const field of ['pidex-rule-learning-adapter-event-id-v1', ...fields]) { const bytes = Buffer.from(field === null ? '~null~' : field, 'utf8'); const length = Buffer.alloc(8); length.writeBigUInt64BE(BigInt(bytes.length)); digest.update(length); digest.update(bytes); } return digest.digest('hex'); }
/** Accepts one exact enrolled `git ls-remote --heads` record and returns its bare OID. */
export function normalizeAutomaticLearningLsRemoteOutput({ stdout, branch } = {}) {
  const enrolledBranch = typeof branch === 'string' && branch.replace(/^refs\/heads\//, '');
  const bytes = typeof stdout === 'string' || Buffer.isBuffer(stdout) ? Buffer.from(stdout).toString('utf8') : '';
  if (!enrolledBranch || /[\r\n\0]/.test(enrolledBranch)) return null;
  const expected = `refs/heads/${enrolledBranch}`;
  const match = bytes.match(/^([a-f0-9]{40})\t([^\r\n]+)\n$/);
  return match?.[2] === expected ? match[1] : null;
}
/** Reads one normalized OID through the sole enrolled shell-free process adapter. */
export async function parseAutomaticLearningFreshBase({ processAdapter, enrolledRepository, remote, branch } = {}) {
  if (typeof processAdapter !== 'function' || typeof enrolledRepository !== 'string' || !enrolledRepository || typeof remote !== 'string' || !remote || typeof branch !== 'string' || !branch || /[\r\n\0]/.test(enrolledRepository + remote + branch)) return null;
  try { const result = await processAdapter({ enrolledRepository, enrolledRemote: remote, branch: branch.replace(/^refs\/heads\//, '') }); const output = typeof result?.stdout === 'string' || Buffer.isBuffer(result?.stdout) ? Buffer.from(result.stdout).toString('utf8') : ''; return result?.status === 0 && /^[a-fA-F0-9]{40}\n?$/.test(output) ? output.trim().toLowerCase() : null; } catch { return null; }
}
/** Creates sole closed adapter event envelope. Identity excludes first durable timestamp. */
export function createAutomaticLearningAdapterEvent(input = {}) { const row = ADAPTER_EVENT_BY_REASON.get(input.reason_code); const nullable = ['work_digest', 'principal_digest', 'route_digest', 'profile_generation', 'configuration_generation']; const digest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); const timestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; if (!row || !['project', 'global'].includes(input.tier) || !digest(input.scope_digest) || !digest(input.run_retry_digest) || !timestamp(input.occurred_at) || !nullable.every((key) => input[key] === null || digest(input[key])) || !['state', 'artifact', 'eligibility', 'generator', 'reviewer', 'target', 'handoff', 'recovery'].includes(input.stage)) return null; const [reason_code, event_type, rowStage, disposition] = row; const stage = ['runner', 'route'].includes(rowStage) ? input.stage : rowStage; const role = stage === 'generator' ? input.role === 'pidex-pi' : stage === 'reviewer' ? ['pidex-critic', 'pidex-code-reviewer', 'pidex-security'].includes(input.role) && (input.role !== 'pidex-security' || input.tier === 'global') : input.role === null; if ((!['runner', 'route'].includes(rowStage) && stage !== rowStage) || !['state', 'artifact', 'eligibility', 'generator', 'reviewer', 'target', 'handoff', 'recovery'].includes(stage) || !role || input.disposition !== disposition || reason_code === 'global_eligibility_insufficient' && input.tier !== 'global') return null; const identity = adapterEventId(['pidex-rule-learning-adapter-event-v1', event_type, input.tier, input.scope_digest, stage, input.role, input.work_digest, input.run_retry_digest, input.principal_digest, input.route_digest, input.profile_generation, input.configuration_generation, disposition, reason_code]); return Object.freeze({ schema: 'pidex-rule-learning-adapter-event-v1', event_id: identity, event_type, tier: input.tier, scope_digest: input.scope_digest, stage, role: input.role, work_digest: input.work_digest, run_retry_digest: input.run_retry_digest, principal_digest: input.principal_digest, route_digest: input.route_digest, profile_generation: input.profile_generation, configuration_generation: input.configuration_generation, disposition, reason_code, occurred_at: input.occurred_at }); }
/** Records one mapped terminal block; unknown facts never claim a durable disposition. */
export function recordAutomaticLearningAdapterOutcome({ store, outcome, facts } = {}) {
  if (outcome?.status === 'prepared' || outcome?.status === 'existing' || outcome?.status === 'not_admitted') return outcome;
  const mapped = { blocked_artifact_authority: ['artifact_wrong', 'artifact', null], blocked_runner_configuration: ['route_missing', 'generator', null], blocked_finding_eligibility: ['eligibility_unmintable', 'eligibility', null], blocked_eligibility: ['eligibility_unmintable', 'eligibility', null], blocked_source_fact_drift: ['source_fact_drift', 'handoff', null], blocked_target_authority: ['target_invalid', 'target', null], blocked_durable_conflict: ['recovery_conflict', 'recovery', null], blocked_recovery_pending: ['recovery_pending', 'recovery', null] }[outcome?.status];
  if (!store || typeof store.appendAutomaticLearningAdapterEvent !== 'function' || !facts || !mapped && !outcome?.reason_code) return Object.freeze({ status: 'blocked_unmappable' });
  const [reason_code, stage, role] = mapped || []; const { tier, scope_digest, run_retry_digest, profile_generation, configuration_generation, occurred_at } = facts;
  const event = createAutomaticLearningAdapterEvent({ tier, scope_digest, run_retry_digest, profile_generation, configuration_generation, occurred_at, work_digest: outcome?.work_digest ?? null, principal_digest: outcome?.principal_digest ?? null, route_digest: outcome?.route_digest ?? null, reason_code: outcome?.reason_code ?? reason_code, stage: outcome?.stage ?? stage, role: outcome?.role ?? role, disposition: outcome?.status });
  if (!event) return Object.freeze({ status: 'blocked_unmappable' });
  try { store.appendAutomaticLearningAdapterEvent({ event }); return outcome; } catch { return Object.freeze({ status: 'blocked_unmappable' }); }
}

/** Normalizes observed runner facts; only success carries exact child bytes. */
export function normalizeAutomaticLearningRunnerResult({ role, route, result } = {}) {
  const fail = (kind) => Object.freeze({ ok: false, kind, role, route });
  if (!result) return fail('unknown_dispatch');
  if (result.rejected === true || result.fallback === true || result.fallbackFrom !== undefined) return fail('rejected');
  if (result.timedOut === true) return fail('timeout');
  if (result.aborted === true || result.turnLimitHit === true || result.crashed === true) return fail('crash');
  if (result.exitCode !== undefined && result.exitCode !== 0 || result.ok === false) return fail('failure');
  const bytes = Buffer.isBuffer(result.bytes) ? result.bytes : typeof result.finalText === 'string' ? Buffer.from(result.finalText, 'utf8') : null;
  return bytes?.length > 0 && bytes.length <= 16_384 ? Object.freeze({ ok: true, bytes }) : fail('malformed');
}
/** Binds exact configured route to existing host runner; task is bounded data and never grants tools. */
export function createHostAutomaticLearningRunner({ runConfigured, cwd } = {}) { return async ({ role, input } = {}) => {
  const route = input?.route; const known = ['pidex-pi', 'pidex-critic', 'pidex-code-reviewer', 'pidex-security'];
  const invalid = () => Object.freeze({ ok: false, kind: 'unknown_dispatch', role, route });
  if (typeof runConfigured !== 'function' || !known.includes(role) || !route || route.principal !== role || !['provider', 'model', 'effort'].every((key) => typeof route[key] === 'string' && route[key])) return invalid();
  const { route: ignoredRoute, ...safeInput } = input; const task = canonical({ schema: 'pidex-automatic-learning-runner-v1', role, input: safeInput });
  if (!cwd || Buffer.byteLength(task, 'utf8') === 0 || Buffer.byteLength(task, 'utf8') > 12_288) return invalid();
  try { return normalizeAutomaticLearningRunnerResult({ role, route, result: await runConfigured({ agent: role, cwd, route: { provider: route.provider, model: route.model, effort: route.effort, routeSource: `automatic-learning:${role}` }, providerOverride: route.provider, modelOverride: route.model, effortOverride: route.effort, reviewDispatch: true, tools: [], task }) }); } catch { return Object.freeze({ ok: false, kind: 'crash', role, route }); }
}; }
/** Parses exact child JSON bytes. Child owns candidate body or decision only; coordinator owns identity. */
export function parseAutomaticLearningChildResult({ role, bytes } = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 16_384 || bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return null;
  let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { return null; }
  if (!Buffer.from(canonical(value), 'utf8').equals(bytes)) return null;
  if (role === 'pidex-pi') return exactKeys(value, AUTOMATIC_GENERATOR_FIELDS) && boundedText(value.slug, 64) && /^[a-z][a-z0-9-]{2,63}$/.test(value.slug) && Array.isArray(value.applicability) && value.applicability.length > 0 && value.applicability.length <= 8 && value.applicability.every((item) => boundedText(item, 64)) && AUTOMATIC_GENERATOR_FIELDS.slice(2).every((key) => boundedText(value[key])) ? Object.freeze({ ...value, applicability: Object.freeze([...value.applicability]) }) : null;
  return ['pidex-critic', 'pidex-code-reviewer', 'pidex-security'].includes(role) && exactKeys(value, ['schema_version', 'decision']) && value.schema_version === 'pidex-rule-learning-review-v1' && ['accept', 'reject'].includes(value.decision) ? Object.freeze({ ...value }) : null;
}
function validPath(value) { return typeof value === 'string' && MEMBER_PATH.test(value) && !value.includes('..') && !value.includes('//'); }
function validAgent(value) { return exactKeys(value, ['path', 'byte_hash']) && /^agents\/pidex-[a-z0-9-]+\.md$/.test(value.path) && HASH.test(value.byte_hash); }
function validRule(value) { return exactKeys(value, ['rule_id', 'path', 'byte_hash', 'protection_class']) && typeof value.rule_id === 'string' && validPath(value.path) && value.path.startsWith('rules/') && HASH.test(value.byte_hash) && value.protection_class === 'legacy_baseline'; }
function validAcceptedHead(value) { return exactKeys(value, ACCEPTED_HEAD_KEYS) && COMMIT.test(value.accepted_commit) && COMMIT.test(value.first_parent_commit); }
function sortedUnique(members) { return members.every((member, index) => index === 0 || members[index - 1].path < member.path); }

/** Verifies canonical manifest plus every declared member through supplied byte reader. */
export function verifyCanonicalBundledManifest({ manifestBytes, acceptedHead, readMember } = {}) {
  let manifest;
  try { manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')); } catch { fail('RULE_BASELINE_MANIFEST_INVALID'); }
  if (typeof readMember !== 'function' || !exactKeys(manifest, TOP_LEVEL) || manifest.schema !== 'pidex-bundled-rule-seed-v1' || manifest.source_kind !== 'packaged_baseline' || !COMMIT.test(manifest.baseline_parent_commit) || !Array.isArray(manifest.agents) || !Array.isArray(manifest.rules) || !HASH.test(manifest.aggregate_digest)) fail('RULE_BASELINE_MANIFEST_INVALID');
  if (acceptedHead === undefined ? manifest.baseline_parent_commit !== INITIAL_BASELINE_PARENT : !validAcceptedHead(acceptedHead) || manifest.baseline_parent_commit !== acceptedHead.first_parent_commit) fail('RULE_BASELINE_ANCESTRY_INVALID');
  if (manifest.agent_count !== manifest.agents.length || manifest.rule_count !== manifest.rules.length || !manifest.agents.every(validAgent) || !manifest.rules.every(validRule)) fail('RULE_BASELINE_MANIFEST_INVALID');
  const members = [...manifest.agents, ...manifest.rules];
  if (!sortedUnique(members) || new Set(members.map((member) => member.path)).size !== members.length) fail('RULE_BASELINE_MANIFEST_INVALID');
  const { aggregate_digest, ...body } = manifest;
  if (hash(canonical(body)) !== aggregate_digest) fail('RULE_BASELINE_DIGEST_INVALID');
  for (const member of members) {
    let bytes;
    try { bytes = readMember(member.path); } catch { fail('RULE_BASELINE_MEMBER_MISSING'); }
    if (!Buffer.isBuffer(bytes)) fail('RULE_BASELINE_MEMBER_MISSING');
    if (hash(bytes) !== member.byte_hash) fail('RULE_BASELINE_MEMBER_DIGEST_INVALID');
  }
  return Object.freeze({ schema: manifest.schema, baseline_parent_commit: manifest.baseline_parent_commit, ...(acceptedHead === undefined ? {} : { accepted_head: acceptedHead.accepted_commit }), aggregate_digest, members: Object.freeze(members.map((member) => Object.freeze({ path: member.path, byte_hash: member.byte_hash, protection_class: member.protection_class || 'legacy_baseline' }))) });
}

/** Verifies sole packaged baseline manifest without Git or package mutation. */
export function verifyBundledBaseline({ root, acceptedHead } = {}) {
  if (!root || typeof root !== 'string') fail('RULE_BASELINE_ROOT_REQUIRED');
  let manifestBytes;
  try { manifestBytes = readFileSync(path.join(root, MANIFEST_PATH)); } catch { fail('RULE_BASELINE_MANIFEST_INVALID'); }
  return verifyCanonicalBundledManifest({ manifestBytes, acceptedHead, readMember: (memberPath) => readFileSync(path.join(root, ...memberPath.split('/'))) });
}

/** Reconciles enrolled remote read-only with exact accepted-head first-parent package baseline. */
export function reconcileApprovedBaselineSync({ root, repositoryRoot, enrollment, git } = {}) {
  let baseline_parent_commit;
  try { baseline_parent_commit = JSON.parse(readFileSync(path.join(root, MANIFEST_PATH), 'utf8')).baseline_parent_commit; } catch { fail('RULE_BASELINE_MANIFEST_INVALID'); }
  if (!COMMIT.test(baseline_parent_commit)) fail('RULE_BASELINE_MANIFEST_INVALID');
  let facts;
  try { facts = acquireAcceptedHeadFacts({ kind: 'accepted_remote', repository_root: repositoryRoot, enrollment, baseline_parent_commit, git }); } catch { fail('RULE_APPROVED_SYNC_UNAVAILABLE'); }
  const baseline = verifyBundledBaseline({ root, acceptedHead: { accepted_commit: facts.accepted_remote_head, first_parent_commit: facts.baseline_parent_commit } });
  return Object.freeze({ ...facts, accepted_head: baseline.accepted_head, baseline });
}

/** Resolves only exact configured named roles; no alias/default route can reach model work. */
function automaticRolesForTier(tier) {
  return tier === 'project' ? AUTOMATIC_ROLE_ORDER.slice(0, 3) : tier === 'global' ? AUTOMATIC_ROLE_ORDER : null;
}
/** Reads only explicit named automatic routes. Defaults, aliases, and malformed config fail closed. */
export function resolveAutomaticLearningRoutes({ root, tier } = {}) {
  const roles = automaticRolesForTier(tier);
  if (!roles || typeof root !== 'string' || !root) return null;
  let config;
  try { config = JSON.parse(readFileSync(path.join(root, 'config', 'agents.json'), 'utf8')); } catch { return null; }
  if (!config || typeof config !== 'object' || Array.isArray(config) || !config.agents || typeof config.agents !== 'object' || Array.isArray(config.agents)) return null;
  const routes = {};
  for (const principal of roles) {
    const route = config.agents[principal];
    if (!route || typeof route !== 'object' || Array.isArray(route) || route.principal !== principal || !['provider', 'model', 'effort'].every((key) => typeof route[key] === 'string' && route[key])) return null;
    const explicit = { principal, provider: route.provider, model: route.model, effort: route.effort };
    routes[principal] = Object.freeze({ ...explicit, backend_identity: hash(Buffer.from(`pidex-automatic-route-v1\0${canonical(explicit)}`, 'utf8')) });
  }
  if (new Set(Object.values(routes).map((route) => route.backend_identity)).size !== roles.length) return null;
  const configuration_generation = hash(Buffer.from(`pidex-automatic-config-v1\0${canonical(config)}`, 'utf8'));
  return Object.freeze({ configuration_generation, routes: Object.freeze(routes) });
}

function exactAutomaticRunnerConfiguration(configuration, tier) {
  const roles = automaticRolesForTier(tier);
  if (!roles || !configuration || typeof configuration !== 'object' || Array.isArray(configuration) || Object.keys(configuration).sort().join(',') !== 'configuration_generation,routes' || typeof configuration.configuration_generation !== 'string' || !configuration.configuration_generation || !configuration.routes || typeof configuration.routes !== 'object' || Array.isArray(configuration.routes) || Object.keys(configuration.routes).sort().join(',') !== [...roles].sort().join(',')) return null;
  const routeKeys = AUTOMATIC_ROUTE_KEYS.slice().sort().join(','); const routeKeysWithEffort = [...AUTOMATIC_ROUTE_KEYS, 'effort'].sort().join(',');
  const routes = roles.map((role) => configuration.routes[role]);
  if (!routes.every((route, index) => route && typeof route === 'object' && !Array.isArray(route) && [routeKeys, routeKeysWithEffort].includes(Object.keys(route).sort().join(',')) && route.principal === roles[index] && AUTOMATIC_ROUTE_KEYS.slice(1).every((key) => typeof route[key] === 'string' && route[key]) && (route.effort === undefined || typeof route.effort === 'string' && route.effort)) || new Set(routes.map((route) => route.backend_identity)).size !== routes.length) return null;
  const normalizedRoutes = {};
  for (const role of roles) normalizedRoutes[role] = Object.freeze({ principal: configuration.routes[role].principal, provider: configuration.routes[role].provider, model: configuration.routes[role].model, ...(configuration.routes[role].effort === undefined ? {} : { effort: configuration.routes[role].effort }), backend_identity: configuration.routes[role].backend_identity });
  return Object.freeze({ configuration_generation: configuration.configuration_generation, routes: Object.freeze(normalizedRoutes) });
}

/** Opens only canonical existing state, then exposes one tier/scope-bound source bridge; runner dispatch stays out of this seam. */
export function openAutomaticLearningRuntimeSource({ root, env, tier, scope_id } = {}) {
  const configuration = resolveAutomaticLearningRoutes({ root, tier });
  if (!configuration) throw new Error('RULE_AUTOMATIC_LEARNING_PROFILE_UNAVAILABLE');
  const store = openRuleLifecycleStore({ stateRoot: resolveStateRoot({ root, env }), mode: 'existing' });
  try {
    const profile_capability = store.remintAutomaticLearningProfileCapability({ route_generation: configuration.configuration_generation });
    const capability = store.mintAutomaticLearningRuntimeCapability({ profile_capability, tier, scope_id });
    let closed = false;
    const active = () => !closed;
    return Object.freeze({
      tier,
      scope_id,
      configuration_generation: configuration.configuration_generation,
      recordFinding({ finding_bytes, retry_family_id } = {}) {
        if (!active()) return null;
        const eligibility = store.mintAutomaticLearningEligibility({ capability, finding_bytes, retry_family_id });
        if (!eligibility) return null;
        try { return store.persistAutomaticLearningFinding({ finding_bytes, eligibility }); } catch { return null; }
      },
      readHistory() { return active() ? store.readAutomaticLearningHistory({ capability: store.mintAutomaticLearningHistoryCapability({ tier, scope_id }) }) : null; },
      /** Host/project bridge remints source-only eligibility and atomically records only mapped terminal blocks. */
      async run({ finding_bytes, retry_family_id, runner, processAdapter, now } = {}) {
        const eventFacts = () => { const target = store.readAutomaticLearningRuntimeTarget?.({ capability }); return target && { tier, scope_digest: target.scope_digest, run_retry_digest: hash(canonical({ tier, scope_id, retry_family_id })), profile_generation: configuration.configuration_generation, configuration_generation: configuration.configuration_generation, occurred_at: now }; };
        const finish = (outcome) => recordAutomaticLearningAdapterOutcome({ store, outcome, facts: eventFacts() });
        if (!active() || typeof runner !== 'function' || typeof now !== 'string') return finish(Object.freeze({ status: 'blocked_artifact_authority' }));
        const eligibility = store.mintAutomaticLearningEligibility({ capability, finding_bytes, retry_family_id });
        if (!eligibility) return finish(Object.freeze({ status: 'blocked_eligibility' }));
        const target = store.readAutomaticLearningRuntimeTarget?.({ capability });
        const fresh_base = target && await parseAutomaticLearningFreshBase({ processAdapter, enrolledRepository: target.repository, remote: target.remote, branch: target.branch });
        if (!fresh_base) return finish(Object.freeze({ status: 'blocked_target_authority' }));
        return finish(await runAutomaticRuleLearningCoordinatorAsync({ store, finding_bytes, eligibility, tier, scope_id, source_generation: `source:${hash(Buffer.from(finding_bytes || ''))}`, runner_configuration: configuration, runner, fresh_base, now }));
      },
      close() { if (active()) { closed = true; store.close(); } },
    });
  } catch (error) { store.close(); throw error; }
}

/** Coordinates source-owned history through durable work records; no caller target or retry authority crosses boundary. */
export function runAutomaticRuleLearningCoordinator({ store, finding_bytes, eligibility, tier, scope_id, source_generation, runner_configuration, runner, fresh_base, now } = {}) {
  const configuration = exactAutomaticRunnerConfiguration(runner_configuration, tier);
  if (!configuration) return Object.freeze({ status: 'blocked_runner_configuration' });
  if (!store || typeof store.persistAutomaticLearningFinding !== 'function') return Object.freeze({ status: 'blocked_artifact_authority' });
  try {
    const persisted = store.persistAutomaticLearningFinding({ finding_bytes, eligibility });
    if (!['persisted', 'existing'].includes(persisted?.status)) return Object.freeze({ status: 'blocked_durable_conflict' });
    if (typeof store.mintAutomaticLearningHistoryCapability !== 'function' || typeof store.readAutomaticLearningHistory !== 'function') return Object.freeze({ status: 'blocked_finding_eligibility' });
    if (typeof runner !== 'function' || typeof source_generation !== 'string' || typeof now !== 'string') return Object.freeze({ status: 'blocked_artifact_authority' });
    const history = store.readAutomaticLearningHistory({ capability: store.mintAutomaticLearningHistoryCapability({ tier, scope_id }) });
    const aggregate = history && aggregateRuleLearningFindings({ findings: history.findings.map((item) => item.finding), eligibility_envelopes: history.findings.map((item) => item.eligibility) });
    const support = aggregate?.[tier === 'global' ? 'global_support' : 'project_support']?.[0];
    if (aggregate?.status !== 'support_only' || !support) return Object.freeze({ status: 'blocked_finding_eligibility' });
    const work = (stage, input_digest, role, execute) => {
      const work_id = `work:${hash(canonical({ tier, scope_id, stage, source_generation, configuration_generation: configuration.configuration_generation, input_digest, role }))}`;
      const input = { work_id, tier, scope_id, stage, source_generation, configuration_generation: configuration.configuration_generation, input_digest, now };
      const intent = store.persistAutomaticLearningWorkIntent(input);
      if (intent.status === 'blocked_source_fact_drift' || intent.status === 'blocked_durable_conflict') return intent;
      const recovery = store.readAutomaticLearningWorkRecovery(input);
      if (recovery.status === 'completed') return { status: 'completed', bytes: recovery.result_bytes };
      if (recovery.status !== 'resumable' || store.recordAutomaticLearningWorkDispatch({ work_id, now }).status !== 'dispatched') return { status: 'blocked_recovery_pending' };
      let bytes; try { bytes = execute(); } catch { return { status: 'blocked_recovery_pending' }; } if (!bytes) return { status: 'blocked_recovery_pending' };
      store.recordAutomaticLearningWorkResult({ work_id, result_bytes: bytes, now }); return { status: 'completed', bytes };
    };
    const generator = work('generator', hash(JSON.stringify(support)), 'pidex-pi', () => {
      const built = buildRuleLearningCandidate({ support, findings: history.findings.map((item) => item.finding).filter((finding) => support.finding_digests.includes(findingDigest(finding))), authority: store.mintRuleLearningEnrollmentAuthority(), generator: (input) => runner({ role: 'pidex-pi', input: { ...input, route: configuration.routes['pidex-pi'] } }) });
      return built.status === 'candidate' ? Buffer.from(built.bytes, 'utf8') : null;
    });
    if (generator.status === 'blocked_source_fact_drift') return Object.freeze(generator); if (generator.status !== 'completed') return Object.freeze({ status: generator.status });
    const candidate_bytes = Buffer.from(generator.bytes); const candidate = JSON.parse(candidate_bytes.toString('utf8')); const candidateResult = store.persistAutomaticLearningCandidateResult({ candidate_bytes, now });
    if (!['candidate', 'existing'].includes(candidateResult.status)) return Object.freeze({ status: 'blocked_durable_conflict' });
    const prior = store.readAutomaticLearningAdmissionResult?.({ candidate_digest: candidate.candidate_digest });
    let admission_bytes;
    if (prior) admission_bytes = prior.admission_bytes;
    else {
      const context = prepareSemanticReviewContext({ candidate }); const roles = automaticRolesForTier(tier).slice(1); const votes = [];
      for (const role of roles) {
        const review = work(tier === 'global' && role === 'pidex-security' ? 'global_reviewer' : 'project_reviewer', hash(canonical({ candidate_digest: candidate.candidate_digest, role })), role, () => Buffer.from(JSON.stringify(runner({ role, input: { context, route: configuration.routes[role] } })), 'utf8'));
        if (review.status === 'blocked_source_fact_drift') return Object.freeze(review); if (review.status !== 'completed') return Object.freeze({ status: review.status }); votes.push(JSON.parse(Buffer.from(review.bytes).toString('utf8')));
      }
      const reviewer_authority = store.mintRuleLearningReviewerAuthority(); const admitted = admitRuleLearningCandidate({ candidate, context, votes, reviewer_authority });
      if (admitted.status !== 'admitted') return Object.freeze({ status: 'blocked_reviewer_independence' }); admission_bytes = Buffer.from(admitted.bytes, 'utf8'); store.persistAutomaticLearningAdmissionResult({ candidate_digest: candidate.candidate_digest, admission_bytes, now });
    }
    const admission_digest = createHash('sha256').update(admission_bytes).digest('hex'); const capability = store.remintAutomaticPublicationTargetCapability({ candidate_digest: candidate.candidate_digest, admission_digest }); const bridge = store.readAutomaticPublicationTarget({ capability, fresh_base });
    if (!bridge) return Object.freeze({ status: 'blocked_target_authority' }); const idempotency_key = derivePublicationIdempotencyKey({ candidate_digest: candidate.candidate_digest, admission_digest, target: bridge.target, expected_base: bridge.expected_base }); const prepared = preparePublicationTransaction({ store, ...bridge, idempotency_key, now });
    return Object.freeze({ status: prepared.status === 'existing' ? 'existing' : 'prepared', transaction: idempotency_key, writer_handoff: Object.freeze({ kind: 'TX-01', transaction: idempotency_key }) });
  } catch (error) {
    return Object.freeze({ status: error instanceof Error && error.message === 'RULE_AUTOMATIC_LEARNING_CONFLICT' ? 'blocked_durable_conflict' : 'blocked_artifact_authority' });
  }
}

/** Async configured-runner path. Child text is data only; all identity and expiry facts are coordinator-minted. */
export async function runAutomaticRuleLearningCoordinatorAsync({ store, finding_bytes, eligibility, tier, scope_id, source_generation, runner_configuration, runner, fresh_base, now } = {}) {
  const configuration = exactAutomaticRunnerConfiguration(runner_configuration, tier);
  if (!configuration) return Object.freeze({ status: 'blocked_runner_configuration' });
  if (!store || typeof store.persistAutomaticLearningFinding !== 'function' || typeof runner !== 'function' || typeof source_generation !== 'string' || typeof now !== 'string') return Object.freeze({ status: 'blocked_artifact_authority' });
  try {
    const persisted = store.persistAutomaticLearningFinding({ finding_bytes, eligibility });
    if (!['persisted', 'existing'].includes(persisted?.status)) return Object.freeze({ status: 'blocked_durable_conflict' });
    if (typeof store.mintAutomaticLearningHistoryCapability !== 'function' || typeof store.readAutomaticLearningHistory !== 'function') return Object.freeze({ status: 'blocked_finding_eligibility' });
    const history = store.readAutomaticLearningHistory({ capability: store.mintAutomaticLearningHistoryCapability({ tier, scope_id }) });
    const aggregate = history && aggregateRuleLearningFindings({ findings: history.findings.map((item) => item.finding), eligibility_envelopes: history.findings.map((item) => item.eligibility) }); const support = aggregate?.[tier === 'global' ? 'global_support' : 'project_support']?.[0];
    if (aggregate?.status !== 'support_only' || !support) return Object.freeze({ status: 'blocked_finding_eligibility' });
    const work = async (stage, input_digest, role, execute) => {
      const work_id = `work:${hash(canonical({ tier, scope_id, stage, source_generation, configuration_generation: configuration.configuration_generation, input_digest, role }))}`;
      const input = { work_id, tier, scope_id, stage, source_generation, configuration_generation: configuration.configuration_generation, input_digest, now };
      const intent = store.persistAutomaticLearningWorkIntent(input); if (intent.status === 'blocked_source_fact_drift' || intent.status === 'blocked_durable_conflict') return intent;
      const recovery = store.readAutomaticLearningWorkRecovery(input); if (recovery.status === 'completed') return { status: 'completed', bytes: recovery.result_bytes, work_id };
      if (recovery.status !== 'resumable' || store.recordAutomaticLearningWorkDispatch({ work_id, now }).status !== 'dispatched') return { status: 'blocked_recovery_pending' };
      let result; try { result = await execute(work_id); } catch { result = { ok: false, kind: 'crash', role, route: configuration.routes[role] }; }
      if (!result?.ok) { const route = result?.route || configuration.routes[role]; const reason_code = result?.reason_code || ({ rejected: 'runner_rejected', failure: 'runner_failure', timeout: 'runner_timeout', crash: 'runner_crash', unknown_dispatch: 'dispatch_unknown', malformed: 'runner_malformed' }[result?.kind] || 'dispatch_unknown'); return { status: 'blocked_recovery_pending', reason_code, stage: role === 'pidex-pi' ? 'generator' : 'reviewer', role, work_digest: work_id.slice(5), principal_digest: hash(role), route_digest: hash(canonical(route)) }; }
      const bytes = result.bytes; if (!Buffer.isBuffer(bytes) || !bytes.length) return { status: 'blocked_recovery_pending', reason_code: 'runner_malformed', stage: role === 'pidex-pi' ? 'generator' : 'reviewer', role, work_digest: work_id.slice(5), principal_digest: hash(role), route_digest: hash(canonical(configuration.routes[role])) };
      store.recordAutomaticLearningWorkResult({ work_id, result_bytes: bytes, now }); return { status: 'completed', bytes, work_id };
    };
    const generator = await work('generator', hash(JSON.stringify(support)), 'pidex-pi', async () => {
      const run = await runner({ role: 'pidex-pi', input: { support, route: configuration.routes['pidex-pi'] } }); if (!run?.ok) return run;
      const child = parseAutomaticLearningChildResult({ role: 'pidex-pi', bytes: run.bytes }); if (!child) return { ...run, ok: false, kind: 'malformed', reason_code: 'result_authority_mismatch' };
      const built = buildRuleLearningCandidate({ support, findings: history.findings.map((item) => item.finding).filter((finding) => support.finding_digests.includes(findingDigest(finding))), authority: store.mintRuleLearningEnrollmentAuthority(), generator: () => child });
      return built?.status === 'candidate' ? { ok: true, bytes: Buffer.from(built.bytes, 'utf8') } : { ...run, ok: false, kind: 'malformed', reason_code: 'result_authority_mismatch' };
    });
    if (generator.status !== 'completed') return Object.freeze(generator);
    let candidate; let candidate_bytes; try { candidate = JSON.parse(Buffer.from(generator.bytes).toString('utf8')); candidate_bytes = canonicalCandidateBytes(candidate); } catch {};
    if (!candidate || typeof candidate_bytes !== 'string' || !Buffer.from(candidate_bytes, 'utf8').equals(Buffer.from(generator.bytes))) return Object.freeze({ status: 'blocked_recovery_pending' });
    const candidateResult = store.persistAutomaticLearningCandidateResult({ candidate_bytes: Buffer.from(generator.bytes), now }); if (!['candidate', 'existing'].includes(candidateResult.status)) return Object.freeze({ status: 'blocked_durable_conflict' });
    const prior = store.readAutomaticLearningAdmissionResult?.({ candidate_digest: candidate.candidate_digest }); let admission_bytes;
    if (prior) admission_bytes = prior.admission_bytes;
    else {
      const context = prepareSemanticReviewContext({ candidate }); const votes = [];
      for (const role of automaticRolesForTier(tier).slice(1)) {
        const review = await work(tier === 'global' && role === 'pidex-security' ? 'global_reviewer' : 'project_reviewer', hash(canonical({ candidate_digest: candidate.candidate_digest, role })), role, async (work_id) => {
          const run = await runner({ role, input: { context, route: configuration.routes[role] } }); if (!run?.ok) return run;
          const child = parseAutomaticLearningChildResult({ role, bytes: run.bytes }); if (!child) return { ...run, ok: false, kind: 'malformed', reason_code: 'result_authority_mismatch' };
          const nonce = hash(canonical({ work_id, role, configuration_generation: configuration.configuration_generation, kind: 'nonce' }));
          return { ok: true, bytes: Buffer.from(canonical({ ...context, schema_version: 'pidex-living-rule-semantic-vote-v1', reviewer_principal: role, backend_identity: configuration.routes[role].backend_identity, provider: configuration.routes[role].provider, model: configuration.routes[role].model, configuration_generation: configuration.configuration_generation, attempt_id: `attempt:${hash(canonical({ work_id, role, kind: 'attempt' }))}`, nonce: `nonce:${nonce}`, issued_at: now, expires_at: new Date(Date.parse(now) + 60_000).toISOString(), decision: child.decision }), 'utf8') };
        });
        if (review.status !== 'completed') return Object.freeze(review);
        let vote; try { vote = JSON.parse(Buffer.from(review.bytes).toString('utf8')); } catch {};
        if (!vote || !Buffer.from(canonical(vote), 'utf8').equals(Buffer.from(review.bytes))) return Object.freeze({ status: 'blocked_recovery_pending' }); votes.push(vote);
      }
      const admitted = admitRuleLearningCandidate({ candidate, context, votes, reviewer_authority: store.mintRuleLearningReviewerAuthority() }); if (admitted.status !== 'admitted') return Object.freeze({ status: 'not_admitted', admission: admitted.status });
      admission_bytes = Buffer.from(admitted.bytes, 'utf8'); store.persistAutomaticLearningAdmissionResult({ candidate_digest: candidate.candidate_digest, admission_bytes, now });
    }
    const admission_digest = createHash('sha256').update(admission_bytes).digest('hex'); const capability = store.remintAutomaticPublicationTargetCapability({ candidate_digest: candidate.candidate_digest, admission_digest }); const bridge = store.readAutomaticPublicationTarget({ capability, fresh_base });
    if (!bridge) return Object.freeze({ status: 'blocked_target_authority' }); const idempotency_key = derivePublicationIdempotencyKey({ candidate_digest: candidate.candidate_digest, admission_digest, target: bridge.target, expected_base: bridge.expected_base }); const prepared = preparePublicationTransaction({ store, ...bridge, idempotency_key, now });
    return Object.freeze({ status: prepared.status === 'existing' ? 'existing' : 'prepared', transaction: idempotency_key, writer_handoff: Object.freeze({ kind: 'TX-01', transaction: idempotency_key }) });
  } catch (error) { return Object.freeze({ status: error instanceof Error && error.message === 'RULE_AUTOMATIC_LEARNING_CONFLICT' ? 'blocked_durable_conflict' : 'blocked_artifact_authority' }); }
}

/** Explicit operator setup producer. Runtime remains existing-only and never creates a profile. */
export function enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile } = {}) {
  const invalid = () => { throw new Error('RULE_AUTOMATIC_LEARNING_PROFILE_FILE_INVALID'); };
  if (typeof stateRoot !== 'string' || !stateRoot || typeof profileFile !== 'string' || !path.isAbsolute(profileFile)) invalid();
  const requested = path.resolve(profileFile); let parent; let canonicalFile; let before; let fd;
  try {
    parent = realpathSync.native(path.dirname(requested));
    if (parent !== path.dirname(requested)) invalid();
    canonicalFile = realpathSync.native(requested);
    if (canonicalFile !== path.join(parent, path.basename(requested))) invalid();
    before = lstatSync(requested);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size < 1 || before.size > 65_536) invalid();
    fd = openSync(requested, 'r'); const opened = fstatSync(fd);
    const same = (left, right) => left.dev === right.dev && left.ino === right.ino && left.nlink === right.nlink && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
    if (!same(before, opened)) invalid();
    const bytes = Buffer.alloc(opened.size); for (let offset = 0; offset < bytes.length;) { const count = readSync(fd, bytes, offset, bytes.length - offset, offset); if (count <= 0) invalid(); offset += count; }
    const after = fstatSync(fd); const leaf = lstatSync(requested);
    if (!same(opened, after) || !same(before, leaf) || leaf.isSymbolicLink()) invalid();
    const text = bytes.toString('utf8'); let profile; try { profile = JSON.parse(text); } catch { invalid(); }
    if (!Buffer.from(text, 'utf8').equals(bytes) || canonical(profile) !== text) invalid();
    const store = openRuleLifecycleStore({ stateRoot }); try { return store.enrollAutomaticLearningProfile({ profile }); } finally { store.close(); }
  } catch (error) { if (error?.message === 'RULE_AUTOMATIC_LEARNING_PROFILE_CONFLICT' || error?.message === 'RULE_AUTOMATIC_LEARNING_PROFILE_INVALID') throw error; invalid(); }
  finally { if (fd !== undefined) closeSync(fd); }
}

/** Sole explicit CLI/API entry for Plan047 accepted-receipt proof; does not publish or project. */
export function acquireApprovedReceiptSync({ root, stateRoot, repositoryRoot, enrollment, receipt, git } = {}) {
  let baseline_parent_commit;
  try { baseline_parent_commit = JSON.parse(readFileSync(path.join(root, MANIFEST_PATH), 'utf8')).baseline_parent_commit; } catch { fail('RULE_BASELINE_MANIFEST_INVALID'); }
  if (!COMMIT.test(baseline_parent_commit) || typeof stateRoot !== 'string' || !stateRoot) fail('RULE_LIFECYCLE_USAGE');
  const store = openRuleLifecycleStore({ stateRoot });
  try { return acquireAcceptedRemoteReceipt({ store, receipt, repository_root: repositoryRoot, enrollment, baseline_parent_commit, git }); } finally { store.close(); }
}

function cli(argv) {
  const command = argv[0]; const value = (flag) => argv[argv.indexOf(flag) + 1]; const root = value('--root') || process.cwd();
  if (!['read', 'sync', 'acquire', 'enroll-automatic-profile', 'control'].includes(command) || !root) fail('RULE_LIFECYCLE_USAGE');
  if (command === 'control') {
    const stateRoot = value('--state-root'); const control = value('--control'); const authJson = value('--auth'); const requestJson = value('--request');
    if (!stateRoot || !control || !authJson || !requestJson) fail('RULE_LIFECYCLE_USAGE');
    let auth; let request;
    try { auth = JSON.parse(authJson); request = JSON.parse(requestJson); } catch { fail('RULE_LIFECYCLE_USAGE'); }
    if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.actor !== 'string' || typeof request.rule_id !== 'string' || typeof request.repository !== 'string' || typeof request.scope_id !== 'string' || (request.nonce !== undefined && typeof request.nonce !== 'string')) fail('RULE_LIFECYCLE_USAGE');
    const store = openRuleLifecycleStore({ stateRoot });
    try {
      const outcome = applyRuleLifecycleControl({ store, control, auth, actor: request.actor, nonce: request.nonce, repository: request.repository, scope_id: request.scope_id, rule_id: request.rule_id, now: request.now || new Date().toISOString(), current: request.current, target: request.target, rule_bytes: typeof request.rule_bytes === 'string' ? Buffer.from(request.rule_bytes, 'base64') : undefined, expected_base: request.expected_base });
      console.log(JSON.stringify(outcome));
    } finally { store.close(); }
    return;
  }
  if (command === 'read') { console.log(JSON.stringify(verifyBundledBaseline({ root }))); return; }
  if (command === 'enroll-automatic-profile') { if (!value('--state-root') || !value('--profile-file')) fail('RULE_LIFECYCLE_USAGE'); console.log(JSON.stringify(enrollAutomaticLearningProfileFromFile({ stateRoot: value('--state-root'), profileFile: value('--profile-file') }))); return; }
  const enrollment = { repository_identity: value('--repository-identity'), scope_id: value('--scope-id'), remote_name: value('--remote-name'), remote: value('--remote'), branch: value('--branch') };
  if (!value('--repository-root') || Object.values(enrollment).some((field) => !field)) fail('RULE_LIFECYCLE_USAGE');
  if (command === 'sync') { console.log(JSON.stringify(reconcileApprovedBaselineSync({ root, repositoryRoot: value('--repository-root'), enrollment }))); return; }
  let receipt;
  try { receipt = JSON.parse(value('--receipt')); } catch { fail('RULE_LIFECYCLE_USAGE'); }
  if (!value('--state-root')) fail('RULE_LIFECYCLE_USAGE');
  console.log(JSON.stringify(acquireApprovedReceiptSync({ root, stateRoot: value('--state-root'), repositoryRoot: value('--repository-root'), enrollment, receipt })));
}

function isMainModule(argvPath) {
  if (!argvPath) return false;
  try { return realpathSync.native(path.resolve(argvPath)) === realpathSync.native(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (isMainModule(process.argv[1])) {
  try { cli(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
