import { createHash } from 'node:crypto';
import { parseImpactEvaluationBytes } from './rule-impact-results.mjs';
import { prepareLifecycleActionPublicationTransaction } from './rule-publication-transaction.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const HEAD = /^[a-f0-9]{40}$/;
const EPOCH = /^epoch:[a-zA-Z0-9._:-]{1,120}$/;
const SAFE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const GLOBAL_RULE = /^pidex-global:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const PROJECT_RULE = /^project:([a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const SCOPE_HEX = /^[a-f0-9]{24,64}$/;
const CADENCE_KEYS = Object.freeze(['policy_digest', 'tier', 'repository_scope_digest', 'closed_window_id']);
const CURRENT_KEYS = Object.freeze(['tier', 'scope_id', 'repository_scope_digest', 'rule_id', 'version_hash', 'content_hash', 'accepted_commit', 'activation_epoch', 'mirror_digest', 'resolver_snapshot_digest', 'exposure_publication_digest', 'policy_id', 'policy_digest', 'lifecycle_state', 'protection_class', 'eligible', 'pinned', 'local_stop_active', 'global_stop_active', 'mirror_trusted', 'cadence_due', 'history_state']);
const LIFECYCLE_STATES = Object.freeze(['active', 'deactivated', 'active-monitor', 'active-pinned']);
const ACTIVE_STATES = Object.freeze(['active', 'active-monitor', 'active-pinned']);
const AUTH_KEYS = Object.freeze(['authenticated', 'authorized', 'csrf_valid']);
const CONTROL_TRANSITIONS = Object.freeze({ 'reactivate-monitor': 'active-monitor', 'reactivate-pin': 'active-pinned', 'unpin': 'active-monitor', 'stop-local': null, 'stop-cross-host': 'deactivated', 'refinement-handoff': null });

function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function invalid() { throw new Error('RULE_LIFECYCLE_ACTION_INVALID'); }
function privateText(value) { return /(?:credential|secret|token|password|private|\/home\/|[a-z]:\\)/i.test(value); }
function safeText(value) { return typeof value === 'string' && SAFE.test(value) && !privateText(value); }
function cadenceText(value) { return typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= 256 && value.normalize('NFC') === value && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(value) && !privateText(value); }
function framed(hash, value) { const bytes = Buffer.from(value, 'utf8'); const length = Buffer.allocUnsafe(4); length.writeUInt32BE(bytes.length); hash.update(length); hash.update(bytes); }

/** Canonical distributed cadence identity. Only the lowercase digest may enter Git metadata. */
export function deriveActionCadenceDigest(input = {}) {
  if (!exact(input, CADENCE_KEYS) || !DIGEST.test(input.policy_digest || '') || !['global', 'project'].includes(input.tier) || !DIGEST.test(input.repository_scope_digest || '') || !cadenceText(input.closed_window_id)) invalid();
  const hash = createHash('sha256');
  for (const value of ['pidex-action-cadence-v1', input.policy_digest, input.tier, input.repository_scope_digest, input.closed_window_id]) framed(hash, value);
  return hash.digest('hex');
}

function validCurrent(current) {
  if (!exact(current, CURRENT_KEYS) || !['global', 'project'].includes(current.tier) || !DIGEST.test(current.repository_scope_digest || '') || !DIGEST.test(current.version_hash || '') || !DIGEST.test(current.content_hash || '') || !HEAD.test(current.accepted_commit || '') || !EPOCH.test(current.activation_epoch || '') || !DIGEST.test(current.mirror_digest || '') || !DIGEST.test(current.resolver_snapshot_digest || '') || !DIGEST.test(current.exposure_publication_digest || '') || !safeText(current.policy_id) || !DIGEST.test(current.policy_digest || '') || !LIFECYCLE_STATES.includes(current.lifecycle_state) || !safeText(current.protection_class) || !['clear', 'consumed', 'quarantined'].includes(current.history_state)) return false;
  if (![current.eligible, current.pinned, current.local_stop_active, current.global_stop_active, current.mirror_trusted, current.cadence_due].every((value) => typeof value === 'boolean')) return false;
  if (current.tier === 'global') return current.scope_id === null && GLOBAL_RULE.test(current.rule_id || '');
  const project = PROJECT_RULE.exec(current.rule_id || ''); return typeof current.scope_id === 'string' && /^[a-f0-9]{24,64}$/.test(current.scope_id) && project?.[1] === current.scope_id;
}

function authorityMatches(artifact, current) {
  const lineage = artifact.lineage;
  return artifact.tier === current.tier && lineage.scope_id === current.scope_id && lineage.rule_id === current.rule_id && lineage.rule_version_hash === current.version_hash && lineage.rule_content_hash === current.content_hash && lineage.accepted_commit === current.accepted_commit && lineage.activation_epoch === current.activation_epoch && lineage.mirror_digest === current.mirror_digest && lineage.resolver_snapshot_digest === current.resolver_snapshot_digest && lineage.exposure_publication_digest === current.exposure_publication_digest && lineage.policy_id === current.policy_id && lineage.policy_digest === current.policy_digest;
}
function noOp(reason) { return Object.freeze({ status: 'no_op', reason }); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function correlationId(cadence_digest) { return `action:${createHash('sha256').update(`pidex-lifecycle-action-correlation-v1\0${cadence_digest}`).digest('hex')}`; }

/** Pure locked-decision kernel. Callers own lock acquisition, current reads, history proof and writer submission. */
export function decideRuleLifecycleAction({ result_bytes, result_digest, current } = {}) {
  let parsed;
  try {
    if (!Buffer.isBuffer(result_bytes) || !DIGEST.test(result_digest || '') || createHash('sha256').update(result_bytes).digest('hex') !== result_digest) return noOp('result_invalid');
    parsed = parseImpactEvaluationBytes(result_bytes);
    if (parsed.result_digest !== result_digest) return noOp('result_invalid');
  } catch { return noOp('result_invalid'); }
  if (parsed.artifact.state !== 'repeated_observational_harm') return noOp('result_not_harmful');
  if (!validCurrent(current)) return noOp('authority_invalid');
  if (!authorityMatches(parsed.artifact, current)) return noOp('authority_mismatch');
  if (!ACTIVE_STATES.includes(current.lifecycle_state)) return noOp('inactive');
  if (current.protection_class !== 'none') return noOp('protected');
  if (!current.eligible) return noOp('ineligible');
  if (current.pinned) return noOp('pinned');
  if (current.local_stop_active || current.global_stop_active) return noOp('stopped');
  if (!current.mirror_trusted) return noOp('mirror_untrusted');
  if (!current.cadence_due) return noOp('cadence_not_due');
  if (current.history_state === 'consumed') return noOp('cadence_consumed');
  if (current.history_state === 'quarantined') return noOp('cadence_quarantined');
  const artifact = parsed.artifact;
  const cadence_digest = deriveActionCadenceDigest({ policy_digest: current.policy_digest, tier: current.tier, repository_scope_digest: current.repository_scope_digest, closed_window_id: artifact.closed_window_id });
  const request = Object.freeze({ schema: 'pidex-rule-lifecycle-action-request-v1', tier: current.tier, repository_scope_digest: current.repository_scope_digest, rule_id: current.rule_id, predecessor_commit: current.accepted_commit, version_hash: current.version_hash, content_hash: current.content_hash, activation_epoch: current.activation_epoch, policy_id: current.policy_id, policy_digest: current.policy_digest, closed_window_id: artifact.closed_window_id, result_digest, lifecycle_transition: 'deactivated', cadence_digest });
  return Object.freeze({ status: 'submit', action: 'deactivate', request });
}

/** Durable Slice1 tracer: locked decision, then zero-or-one exact-bytes intent/correlation persistence under one store authority. Optional history runs the bounded canonical first-parent classifier; validated history is authoritative and no caller history_state assertion is trusted. */
export function traceRuleLifecycleAction({ store, result_bytes, result_digest, current, now, fault, history } = {}) {
  if (!store || typeof store.persistLifecycleActionIntent !== 'function' || typeof store.readLifecycleActionIntentByCadence !== 'function' || (history && typeof store.readLifecycleActionCadenceState !== 'function')) throw new Error('RULE_LIFECYCLE_ACTION_STORE_INVALID');
  if (typeof now !== 'string') throw new Error('RULE_LIFECYCLE_ACTION_INVALID');
  const decided = decideRuleLifecycleAction({ result_bytes, result_digest, current });
  let cadence_digest = null; let request = null;
  if (decided.status === 'submit') { request = decided.request; cadence_digest = request.cadence_digest; }
  else {
    try {
      const parsed = parseImpactEvaluationBytes(result_bytes);
      if (parsed.result_digest === result_digest && typeof parsed.artifact.closed_window_id === 'string' && parsed.artifact.closed_window_id && validCurrent(current)) cadence_digest = deriveActionCadenceDigest({ policy_digest: current.policy_digest, tier: current.tier, repository_scope_digest: current.repository_scope_digest, closed_window_id: parsed.artifact.closed_window_id });
    } catch {}
  }
  if (!cadence_digest) return Object.freeze({ status: 'no_op', reason: decided.reason });
  const correlation_id = correlationId(cadence_digest);
  if (history) {
    const expected = request ? { tier: request.tier, rule_id: request.rule_id, predecessor_commit: request.predecessor_commit } : { tier: current.tier, rule_id: current.rule_id, predecessor_commit: current.accepted_commit };
    let state;
    try { state = store.readLifecycleActionCadenceState({ adapter: history.adapter, remote_head: history.remote_head, bound_from: history.bound_from, max_commits: history.max_commits, cadence_digest, expected, fault }); } catch { return Object.freeze({ status: 'no_op', reason: 'cadence_quarantined', correlation_id, cadence_digest }); }
    if (state.state === 'consumed') return Object.freeze({ status: 'no_op', reason: 'cadence_consumed', correlation_id, cadence_digest });
    if (state.state === 'quarantined') return Object.freeze({ status: 'no_op', reason: 'cadence_quarantined', correlation_id, cadence_digest });
    current = Object.freeze({ ...current, history_state: 'clear' });
    const verified = decideRuleLifecycleAction({ result_bytes, result_digest, current });
    if (verified.status !== 'submit') return Object.freeze({ status: 'no_op', reason: verified.reason, correlation_id, cadence_digest });
    request = verified.request;
  }
  const status = request ? 'intent' : 'no_op';
  const reason = request ? null : decided.reason;
  const request_json = request ? canonical(request) : 'null';
  const intent = { schema: 'pidex-lifecycle-action-intent-v1', correlation_id, cadence_digest, result_digest, request };
  const intent_digest = createHash('sha256').update(canonical(intent), 'utf8').digest('hex');
  const persisted = store.persistLifecycleActionIntent({ correlation_id, cadence_digest, intent_digest, result_digest, request_json, status, reason, now, fault });
  if (persisted?.status === 'conflict') return Object.freeze({ status: 'conflict', correlation_id });
  if (status === 'intent') return Object.freeze({ status: persisted?.status === 'existing' ? 'existing' : 'intent', correlation_id, intent_digest, cadence_digest, request });
  return Object.freeze({ status: 'no_op', reason, correlation_id, intent_digest, cadence_digest });
}

// ---- Plan048 Slice3A: authenticated bounded control boundary (BD-3..BD-8). Auth result is passed from the existing authenticated lifecycle-command boundary; this module rejects absent/unauthorized/CSRF-invalid input, never creates canonical stopped, and keeps every canonical transition on the shared lifecycle-action TX/writer path. ----
const CONTROLS = CONTROL_TRANSITIONS;
const ACTIVE_FAMILY = ACTIVE_STATES;
const CONTROL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function controlCorrelationId(control, actor, nonce, rule_id) { return `action:${createHash('sha256').update(`pidex-lifecycle-control-v1\0${control}\0${actor}\0${nonce}\0${rule_id}`).digest('hex')}`; }
function controlCadence(control, actor, nonce, rule_id) { return createHash('sha256').update(`pidex-lifecycle-control-cadence-v1\0${control}\0${actor}\0${nonce}\0${rule_id}`).digest('hex'); }
function controlWindowId(control, actor, nonce, rule_id) { return `control:${createHash('sha256').update(`pidex-lifecycle-control-window-v1\0${control}\0${actor}\0${nonce}\0${rule_id}`).digest('hex').slice(0, 32)}`; }
function controlResultDigest(control, actor, nonce, rule_id, transition) { return createHash('sha256').update(`pidex-lifecycle-control-result-v1\0${control}\0${actor}\0${nonce}\0${rule_id}\0${transition}`).digest('hex'); }

/** Closed authenticated intent. Rejects absent/unauthorized/CSRF-invalid auth, unknown controls, private sentinels, and stale canonical state; local stop is immediate narrowing overlay only. */
export function applyRuleLifecycleControl({ store, control, auth, actor, nonce, repository, scope_id, rule_id, now, current, target, rule_bytes, expected_base, fault } = {}) {
  const rejected = (reason) => Object.freeze({ status: 'rejected', reason });
  if (!Object.hasOwn(CONTROLS, control)) return rejected('control_invalid');
  if (!auth || typeof auth !== 'object' || Array.isArray(auth) || Object.keys(auth).length !== AUTH_KEYS.length || !AUTH_KEYS.every((key) => Object.hasOwn(auth, key)) || AUTH_KEYS.some((key) => auth[key] !== true)) return rejected('operator_access_required');
  if (!store || typeof store.setLocalRuleStop !== 'function' || typeof store.persistLifecycleActionIntent !== 'function' || typeof store.prepareLifecycleActionTransaction !== 'function' || !DIGEST.test(actor || '') || !DIGEST.test(nonce || '') || !safeText(repository) || typeof rule_id !== 'string' || !rule_id || !(scope_id === 'pidex-global' || SCOPE_HEX.test(scope_id || '')) || typeof now !== 'string' || !CONTROL_TIME.test(now) || (fault !== undefined && typeof fault !== 'function')) return rejected('input_invalid');
  const transition = CONTROLS[control];
  const correlation_id = controlCorrelationId(control, actor, nonce, rule_id);
  const request_record = { schema: 'pidex-lifecycle-control-v1', control, actor_digest: actor, rule_id, transition: transition || null, correlation_id };
  const persist = (intent_cadence) => { const request_json = canonical(request_record); const intent_digest = createHash('sha256').update(canonical({ correlation_id, cadence_digest: intent_cadence, request_json }), 'utf8').digest('hex'); try { return store.persistLifecycleActionIntent({ correlation_id, cadence_digest: intent_cadence, intent_digest, result_digest: controlResultDigest(control, actor, nonce, rule_id, transition || 'none'), request_json, status: 'intent', reason: null, now, fault }); } catch { return Object.freeze({ status: 'conflict' }); } };
  const localStop = () => { try { const local = store.setLocalRuleStop({ repository, scope_id, rule_id, reason_code: 'operator_stop', fault }); return local && typeof local === 'object' ? Object.freeze({ status: local.status, reason_code: local.reason_code, rule_id: local.rule_id, scope_id: local.scope_id }) : null; } catch { return null; } };
  if (control === 'stop-local') {
    const local = localStop();
    if (!local) return rejected('stop_unavailable');
    if (persist(controlCadence(control, actor, nonce, rule_id))?.status === 'conflict') return Object.freeze({ status: 'conflict', correlation_id });
    return Object.freeze({ status: 'stopped_local', correlation_id, local_stop: local });
  }
  if (control === 'refinement-handoff') {
    if (persist(controlCadence(control, actor, nonce, rule_id))?.status === 'conflict') return Object.freeze({ status: 'conflict', correlation_id });
    return Object.freeze({ status: 'handoff', handoff: 'refinement-requested', correlation_id });
  }
  if (control === 'stop-cross-host') {
    const local = localStop();
    if (!local) return rejected('stop_unavailable');
    if (!current || !validCurrent(current) || !ACTIVE_FAMILY.includes(current.lifecycle_state)) {
      if (persist(controlCadence(control, actor, nonce, rule_id))?.status === 'conflict') return Object.freeze({ status: 'conflict', correlation_id });
      return Object.freeze({ status: 'stopped_local', canonical_inactive: true, correlation_id, local_stop: local });
    }
    const prepared = prepareCanonicalControl(current, control, transition, actor, nonce, rule_id, store, target, rule_bytes, expected_base, now, fault);
    if (!prepared) return Object.freeze({ status: 'stopped_local', canonical_failed: true, reason: 'lifecycle_action_unavailable', correlation_id, local_stop: local });
    if (persist(prepared.request.cadence_digest)?.status === 'conflict') return Object.freeze({ status: 'conflict', correlation_id });
    return Object.freeze({ status: 'prepared', transition, transaction: prepared.transaction, correlation_id, cadence_digest: prepared.request.cadence_digest, local_stop: local });
  }
  // reactivate-monitor / reactivate-pin / unpin: canonical transition only; never implicitly bypasses protection or local/global stop.
  if (!current || !target || !rule_bytes || !Buffer.isBuffer(rule_bytes) || !HEAD.test(expected_base || '')) return rejected('input_incomplete');
  if (!validCurrent(current)) return rejected('authority_invalid');
  if (current.local_stop_active || current.global_stop_active) return Object.freeze({ status: 'no_op', reason: 'stopped' });
  if (current.protection_class !== 'none') return Object.freeze({ status: 'no_op', reason: 'protected' });
  const expected = control === 'unpin' ? 'active-pinned' : 'deactivated';
  if (current.lifecycle_state !== expected) return Object.freeze({ status: 'no_op', reason: 'lifecycle_state_changed' });
  const prepared = prepareCanonicalControl(current, control, transition, actor, nonce, rule_id, store, target, rule_bytes, expected_base, now, fault);
  if (!prepared) return rejected('lifecycle_action_unavailable');
  if (persist(prepared.request.cadence_digest)?.status === 'conflict') return Object.freeze({ status: 'conflict', correlation_id });
  return Object.freeze({ status: 'prepared', transition, transaction: prepared.transaction, correlation_id, cadence_digest: prepared.request.cadence_digest });
}

function prepareCanonicalControl(current, control, transition, actor, nonce, rule_id, store, target, rule_bytes, expected_base, now, fault) {
  if (!target || !rule_bytes || !Buffer.isBuffer(rule_bytes) || !HEAD.test(expected_base || '') || expected_base !== current.accepted_commit || target.rule_id !== current.rule_id) return null;
  const window_id = controlWindowId(control, actor, nonce, rule_id);
  const cadence_digest = deriveActionCadenceDigest({ policy_digest: current.policy_digest, tier: current.tier, repository_scope_digest: current.repository_scope_digest, closed_window_id: window_id });
  const request = Object.freeze({ schema: 'pidex-rule-lifecycle-action-request-v1', tier: current.tier, repository_scope_digest: current.repository_scope_digest, rule_id: current.rule_id, predecessor_commit: current.accepted_commit, version_hash: current.version_hash, content_hash: current.content_hash, activation_epoch: current.activation_epoch, policy_id: current.policy_id, policy_digest: current.policy_digest, closed_window_id: window_id, result_digest: controlResultDigest(control, actor, nonce, rule_id, transition), lifecycle_transition: transition, cadence_digest });
  try {
    const prepared = prepareLifecycleActionPublicationTransaction({ store, action: request, target, expected_base, rule_bytes, now, fault });
    if (!prepared?.idempotency_key) return null;
    return { transaction: prepared.idempotency_key, request };
  } catch { return null; }
}
