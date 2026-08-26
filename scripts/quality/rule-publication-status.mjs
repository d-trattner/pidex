const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const EPOCH = /^epoch:[a-f0-9]{24}$/;
const SCOPE = /^[a-f0-9]{24,64}$/;
const RULE = /^(?:pidex-global|project:[a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const STATES = new Set(['prepared', 'committed_local', 'accepted_remote', 'deferred_remote_advanced', 'rejected_policy', 'abandoned']);
const STAGES = new Set(['receipt_accepted', 'receipt_consumed', 'bundle_verified', 'mirror_verified', 'projection_applied', 'reattested', 'status_ready']);
const ROW_KEYS = Object.freeze(['transaction_digest', 'rule_id', 'tier', 'scope_id', 'state', 'handoff_stage', 'receipt_digest', 'accepted_commit', 'content_hash', 'activation_epoch', 'policy_category', 'proposal_label', 'inspect', 'refinement', 'refinement_reason', 'visible_label', 'fallback']);
const DETAIL_KEYS = Object.freeze([...ROW_KEYS, 'predecessor_commit', 'tree_digest', 'admission_digest', 'policy_digest', 'version_hash', 'created_at', 'updated_at']);
const AUTHORITY = 'Generated candidate — not authority';
const STATUS_UNAVAILABLE = 'Status unavailable';
const PUBLICATION_UNAVAILABLE = 'Publication status unavailable';
const REFINEMENT_UNAVAILABLE = 'Refinement requests are unavailable for this rule.';

function safeTime(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function safeScope(value, tier) { return tier === 'global' && value === 'pidex-global' || tier === 'project' && typeof value === 'string' && SCOPE.test(value); }
function safeRule(value, tier, scope) { return typeof value === 'string' && RULE.test(value) && (tier === 'global' ? value.startsWith('pidex-global:') && scope === 'pidex-global' : value.startsWith(`project:${scope}:`)); }
function safeDigest(value) { return typeof value === 'string' && DIGEST.test(value) ? value : null; }
function safeCommit(value) { return typeof value === 'string' && COMMIT.test(value) ? value : null; }
function safePolicyCategory(value) { return ['policy', 'enrollment', 'identity', 'privacy'].includes(value) ? value : null; }
function baseValid(record) { return record && typeof record === 'object' && DIGEST.test(record.transaction_digest || '') && ['global', 'project'].includes(record.tier) && safeScope(record.scope_id, record.tier) && safeRule(record.rule_id, record.tier, record.scope_id) && STATES.has(record.state); }
function unavailable(record) {
  const tier = ['global', 'project'].includes(record?.tier) ? record.tier : 'global';
  const scope_id = safeScope(record?.scope_id, tier) ? record.scope_id : 'Scope unavailable';
  return { transaction_digest: safeDigest(record?.transaction_digest), rule_id: safeRule(record?.rule_id, tier, record?.scope_id) ? record.rule_id : null, tier, scope_id, state: STATES.has(record?.state) ? record.state : 'unavailable', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, policy_category: null, proposal_label: AUTHORITY, inspect: false, refinement: false, refinement_reason: REFINEMENT_UNAVAILABLE, visible_label: STATUS_UNAVAILABLE, fallback: PUBLICATION_UNAVAILABLE };
}
function safeFacts(record) {
  const keys = ['transaction_digest', 'rule_id', 'tier', 'scope_id', 'state', 'receipt_valid', 'status_ready', 'handoff_stage', 'receipt_digest', 'accepted_commit', 'content_hash', 'activation_epoch', 'policy_category', 'active_current', 'local_stop_active', 'refinement_pending', 'predecessor_commit', 'tree_digest', 'admission_digest', 'policy_digest', 'version_hash', 'created_at', 'updated_at'];
  return record && Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key)) && [record.receipt_valid, record.status_ready, record.active_current, record.local_stop_active, record.refinement_pending].every((value) => typeof value === 'boolean') && (record.handoff_stage === null || STAGES.has(record.handoff_stage)) && [record.receipt_digest, record.content_hash, record.tree_digest, record.admission_digest, record.policy_digest, record.version_hash].every((value) => value === null || safeDigest(value)) && [record.accepted_commit, record.predecessor_commit].every((value) => value === null || safeCommit(value)) && (record.activation_epoch === null || EPOCH.test(record.activation_epoch)) && (record.state === 'rejected_policy' ? record.policy_category === null || typeof record.policy_category === 'string' : record.policy_category === null) && safeTime(record.created_at) && safeTime(record.updated_at);
}
function safeAccepted(record) {
  return record.state === 'accepted_remote' && record.receipt_valid === true && safeDigest(record.receipt_digest) && safeCommit(record.accepted_commit) && safeDigest(record.content_hash) && STAGES.has(record.handoff_stage);
}
function mapRecord(record) {
  if (!baseValid(record) || !safeFacts(record)) return unavailable(record);
  const common = { transaction_digest: record.transaction_digest, rule_id: record.rule_id, tier: record.tier, scope_id: record.scope_id, state: record.state, handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, policy_category: record.state === 'rejected_policy' ? safePolicyCategory(record.policy_category) : null, proposal_label: AUTHORITY, inspect: true, refinement: false, refinement_reason: REFINEMENT_UNAVAILABLE, visible_label: null, fallback: null };
  if (record.state === 'prepared') return { ...common, visible_label: 'Prepared' };
  if (record.state === 'committed_local') return { ...common, visible_label: 'Publication pending' };
  if (record.state === 'deferred_remote_advanced') return { ...common, visible_label: 'Deferred — source changed' };
  if (record.state === 'rejected_policy') return { ...common, visible_label: 'Rejected by policy' };
  if (record.state === 'abandoned') return { ...common, visible_label: 'Abandoned' };
  if (!safeAccepted(record)) return unavailable(record);
  const accepted = { ...common, handoff_stage: record.handoff_stage, receipt_digest: record.receipt_digest, accepted_commit: record.accepted_commit, content_hash: record.content_hash };
  if (record.handoff_stage !== 'status_ready') return record.status_ready === false && record.active_current === false && record.activation_epoch === null ? { ...accepted, visible_label: 'Publication pending' } : unavailable(record);
  if (record.status_ready !== true || record.active_current !== true || !EPOCH.test(record.activation_epoch)) return unavailable(record);
  const stopped = record.local_stop_active || record.refinement_pending;
  return { ...accepted, activation_epoch: record.activation_epoch, refinement: !stopped, refinement_reason: stopped ? REFINEMENT_UNAVAILABLE : null, visible_label: 'Published and verified' };
}
function listFacts(store) { if (!store || typeof store.listPublicationStatusFacts !== 'function') return null; try { const records = store.listPublicationStatusFacts(); return Array.isArray(records) ? records : null; } catch { return null; } }
function result(records) { return { status: 'available', publications: records.map(mapRecord).sort((left, right) => String(left.transaction_digest || '').localeCompare(String(right.transaction_digest || ''))) }; }

/** Maps store-owned durable publication facts to a fixed, read-only public list schema. */
export function listRulePublicationStatus({ store } = {}) {
  const records = listFacts(store);
  return records ? result(records) : { status: 'unavailable', publications: [] };
}

/** Returns one allowlisted public detail record; raw candidate, paths, source, votes, findings, and errors never cross this boundary. */
export function readRulePublicationStatusDetail({ store, transaction_digest } = {}) {
  if (!store || !DIGEST.test(transaction_digest || '') || typeof store.readPublicationStatusFacts !== 'function') return { status: 'unavailable', publication: null };
  let record; try { record = store.readPublicationStatusFacts({ transaction_digest }); } catch { return { status: 'unavailable', publication: null }; }
  const publication = mapRecord(record);
  if (!publication.inspect || publication.transaction_digest !== transaction_digest) return { status: 'unavailable', publication: null };
  const accepted = safeAccepted(record);
  const detail = {
    ...publication,
    predecessor_commit: accepted ? safeCommit(record.predecessor_commit) : null,
    tree_digest: accepted ? safeDigest(record.tree_digest) : null,
    admission_digest: accepted ? safeDigest(record.admission_digest) : null,
    policy_digest: accepted ? safeDigest(record.policy_digest) : null,
    version_hash: accepted ? safeDigest(record.version_hash) || publication.content_hash : null,
    created_at: safeTime(record.created_at) ? record.created_at : null,
    updated_at: safeTime(record.updated_at) ? record.updated_at : null,
  };
  if (Object.keys(detail).length !== DETAIL_KEYS.length) return { status: 'unavailable', publication: null };
  return { status: 'available', publication: detail };
}

export const RULE_PUBLICATION_STATUS_SCHEMA = Object.freeze({ row_keys: ROW_KEYS, detail_keys: DETAIL_KEYS, authority_label: AUTHORITY, unavailable_label: PUBLICATION_UNAVAILABLE });

// ---- Plan048 Slice1: sanitized lifecycle-action status. Only accepted+mirror-verified deactivation truth projects; prior active truth stays visible through prepared/committed/remote-advance. ----
const ACTION_STATES = new Set(['prepared', 'committed_local', 'accepted_remote', 'deferred_remote_advanced']);
const ACTION_STAGES = new Set(['receipt_accepted', 'mirror_verified', 'projection_applied', 'status_ready']);
const ACTION_ROW_KEYS = Object.freeze(['transaction_digest', 'rule_id', 'tier', 'scope_id', 'state', 'handoff_stage', 'cadence_digest', 'receipt_digest', 'accepted_commit', 'content_hash', 'active_current', 'deactivated_current', 'visible_label', 'fallback']);
const ACTION_DETAIL_KEYS = Object.freeze([...ACTION_ROW_KEYS, 'predecessor_commit', 'tree_digest', 'created_at', 'updated_at']);
const DEACTIVATION_PENDING = 'Deactivation pending';
const DEACTIVATED_SYNC_PENDING = 'Deactivated — sync pending';
const DEACTIVATED = 'Deactivated';

function actionBaseValid(record) {
  return record && typeof record === 'object' && DIGEST.test(record.transaction_digest || '') && ['global', 'project'].includes(record.tier) && safeScope(record.scope_id, record.tier) && safeRule(record.rule_id, record.tier, record.scope_id) && ACTION_STATES.has(record.state) && safeDigest(record.cadence_digest) !== null && [record.active_current, record.deactivated_current, record.local_stop_active].every((value) => typeof value === 'boolean') && (record.handoff_stage === null || ACTION_STAGES.has(record.handoff_stage)) && [record.receipt_digest, record.content_hash, record.tree_digest].every((value) => value === null || safeDigest(value)) && [record.accepted_commit, record.predecessor_commit].every((value) => value === null || safeCommit(value)) && safeTime(record.created_at) && safeTime(record.updated_at);
}
function actionUnavailable(record) {
  const tier = ['global', 'project'].includes(record?.tier) ? record.tier : 'global';
  const scope_id = safeScope(record?.scope_id, tier) ? record.scope_id : 'Scope unavailable';
  return { transaction_digest: safeDigest(record?.transaction_digest), rule_id: safeRule(record?.rule_id, tier, record?.scope_id) ? record.rule_id : null, tier, scope_id, state: ACTION_STATES.has(record?.state) ? record.state : 'unavailable', handoff_stage: null, cadence_digest: null, receipt_digest: null, accepted_commit: null, content_hash: null, active_current: false, deactivated_current: false, visible_label: STATUS_UNAVAILABLE, fallback: PUBLICATION_UNAVAILABLE };
}
function mapActionRecord(record) {
  if (!actionBaseValid(record)) return actionUnavailable(record);
  const common = { transaction_digest: record.transaction_digest, rule_id: record.rule_id, tier: record.tier, scope_id: record.scope_id, state: record.state, handoff_stage: record.handoff_stage, cadence_digest: record.cadence_digest, receipt_digest: null, accepted_commit: null, content_hash: null, active_current: record.active_current, deactivated_current: record.deactivated_current, visible_label: null, fallback: null };
  if (record.state === 'prepared' || record.state === 'committed_local') return { ...common, visible_label: DEACTIVATION_PENDING };
  if (record.state === 'deferred_remote_advanced') return { ...common, visible_label: 'Deferred — source changed' };
  if (record.state !== 'accepted_remote' || record.receipt_valid !== true || !safeDigest(record.receipt_digest) || !safeCommit(record.accepted_commit) || !safeDigest(record.content_hash)) return actionUnavailable(record);
  const accepted = { ...common, receipt_digest: record.receipt_digest, accepted_commit: record.accepted_commit, content_hash: record.content_hash };
  if (record.handoff_stage !== 'status_ready') return record.deactivated_current === true || record.handoff_stage === null ? actionUnavailable(record) : { ...accepted, visible_label: DEACTIVATED_SYNC_PENDING };
  return record.deactivated_current === true && record.active_current === false ? { ...accepted, visible_label: DEACTIVATED } : actionUnavailable(record);
}
function actionListFacts(store) { if (!store || typeof store.listLifecycleActionStatusFacts !== 'function') return null; try { const records = store.listLifecycleActionStatusFacts(); return Array.isArray(records) ? records : null; } catch { return null; } }
function actionResult(records) { return { status: 'available', publications: records.map(mapActionRecord).sort((left, right) => String(left.transaction_digest || '').localeCompare(String(right.transaction_digest || ''))) }; }

/** Maps store-owned durable lifecycle-action facts to a fixed, read-only public list schema. */
export function listLifecycleActionPublicationStatus({ store } = {}) {
  const records = actionListFacts(store);
  return records ? actionResult(records) : { status: 'unavailable', publications: [] };
}

/** Returns one allowlisted lifecycle-action detail record; raw action bytes, result, paths, repository, and errors never cross this boundary. */
export function readLifecycleActionPublicationStatusDetail({ store, transaction_digest } = {}) {
  if (!store || !DIGEST.test(transaction_digest || '') || typeof store.readLifecycleActionStatusFacts !== 'function') return { status: 'unavailable', publication: null };
  let record; try { record = store.readLifecycleActionStatusFacts({ transaction_digest }); } catch { return { status: 'unavailable', publication: null }; }
  const publication = mapActionRecord(record);
  if (publication.visible_label === STATUS_UNAVAILABLE || publication.transaction_digest !== transaction_digest) return { status: 'unavailable', publication: null };
  const detail = {
    ...publication,
    predecessor_commit: publication.state === 'accepted_remote' ? safeCommit(record.predecessor_commit) : null,
    tree_digest: publication.state === 'accepted_remote' ? safeDigest(record.tree_digest) : null,
    created_at: safeTime(record.created_at) ? record.created_at : null,
    updated_at: safeTime(record.updated_at) ? record.updated_at : null,
  };
  if (Object.keys(detail).length !== ACTION_DETAIL_KEYS.length) return { status: 'unavailable', publication: null };
  return { status: 'available', publication: detail };
}

export const RULE_LIFECYCLE_ACTION_STATUS_SCHEMA = Object.freeze({ row_keys: ACTION_ROW_KEYS, detail_keys: ACTION_DETAIL_KEYS, unavailable_label: PUBLICATION_UNAVAILABLE });

// ---- Plan048 Slice3A: backend-safe LS-01..LS-09 control projection. Exposes exact source states and aria values only; dashboard rendering is Slice3B/4. ----
const CONTROL_ROW_KEYS = Object.freeze(['transaction_digest', 'rule_id', 'tier', 'scope_id', 'state', 'handoff_stage', 'cadence_digest', 'receipt_digest', 'accepted_commit', 'content_hash', 'receipt_lifecycle_state', 'canonical_state', 'mirror_verified', 'converged', 'epoch_open', 'local_stop_active', 'visible_label', 'aria', 'fallback']);
const CONTROL_DETAIL_KEYS = Object.freeze([...CONTROL_ROW_KEYS, 'predecessor_commit', 'tree_digest', 'created_at', 'updated_at']);
const CONTROL_LIFECYCLE_STATES = new Set(['deactivated', 'active-monitor', 'active-pinned']);
const LS_ACTIVE = new Set(['active', 'active-monitor', 'active-pinned']);
const LS_LABELS = Object.freeze({
  'LS-01': { label: 'Deactivation pending', aria: 'Deactivation pending remote acceptance' },
  'LS-02': { label: 'Deactivated — sync pending', aria: 'Deactivation accepted; mirror synchronization pending' },
  'LS-03': { label: 'Active — monitoring', aria: 'Rule active and monitoring' },
  'LS-04': { label: 'Deactivated', aria: 'Rule deactivated' },
  'LS-05': { label: 'Stopped locally', aria: 'Rule stopped on this host only' },
  'LS-06': { label: 'Reactivation pending', aria: 'Reactivation pending remote acceptance and mirror verification' },
  'LS-07': { label: 'Reactivation failed', aria: 'Reactivation failed; rule remains deactivated' },
  'LS-08': { label: 'Active — pinned', aria: 'Rule active and pinned' },
  'LS-09': { label: 'Convergence failed', aria: 'Canonical lifecycle change accepted; mirror convergence failed' },
});
function controlBaseValid(record) {
  return record && typeof record === 'object' && DIGEST.test(record.transaction_digest || '') && ['global', 'project'].includes(record.tier) && safeScope(record.scope_id, record.tier) && safeRule(record.rule_id, record.tier, record.scope_id) && ACTION_STATES.has(record.state) && safeDigest(record.cadence_digest) !== null && (record.receipt_lifecycle_state === null || CONTROL_LIFECYCLE_STATES.has(record.receipt_lifecycle_state)) && (record.canonical_state === null || CONTROL_LIFECYCLE_STATES.has(record.canonical_state) || record.canonical_state === 'active') && [record.receipt_valid, record.mirror_verified, record.converged, record.epoch_open, record.local_stop_active].every((value) => typeof value === 'boolean') && (record.handoff_stage === null || ACTION_STAGES.has(record.handoff_stage)) && [record.receipt_digest, record.content_hash, record.tree_digest].every((value) => value === null || safeDigest(value)) && [record.accepted_commit, record.predecessor_commit].every((value) => value === null || safeCommit(value)) && safeTime(record.created_at) && safeTime(record.updated_at);
}
function controlUnavailable(record) {
  const tier = ['global', 'project'].includes(record?.tier) ? record.tier : 'global';
  const scope_id = safeScope(record?.scope_id, tier) ? record.scope_id : 'Scope unavailable';
  return { transaction_digest: safeDigest(record?.transaction_digest), rule_id: safeRule(record?.rule_id, tier, record?.scope_id) ? record.rule_id : null, tier, scope_id, state: ACTION_STATES.has(record?.state) ? record.state : 'unavailable', handoff_stage: null, cadence_digest: null, receipt_digest: null, accepted_commit: null, content_hash: null, receipt_lifecycle_state: null, canonical_state: null, mirror_verified: false, converged: false, epoch_open: false, local_stop_active: false, visible_label: STATUS_UNAVAILABLE, aria: PUBLICATION_UNAVAILABLE, fallback: PUBLICATION_UNAVAILABLE };
}
function ls(record) {
  if (record.local_stop_active) return { ...LS_LABELS['LS-05'], canonical: record.canonical_state };
  if (record.state === 'prepared' || record.state === 'committed_local') return { ...LS_LABELS['LS-01'], canonical: record.canonical_state };
  if (record.state === 'deferred_remote_advanced') {
    if (record.receipt_lifecycle_state !== null && record.receipt_lifecycle_state !== 'deactivated') return { ...LS_LABELS['LS-07'], canonical: record.canonical_state };
    return { ...LS_LABELS['LS-01'], canonical: record.canonical_state, label: 'Deferred — source changed', aria: 'Deactivation deferred; source changed' };
  }
  if (record.state !== 'accepted_remote' || record.receipt_valid !== true || !safeDigest(record.receipt_digest) || !safeCommit(record.accepted_commit) || !safeDigest(record.content_hash)) return null;
  if (record.receipt_lifecycle_state === 'deactivated') {
    if (!record.mirror_verified || record.handoff_stage === null) return { ...LS_LABELS['LS-02'], canonical: record.canonical_state };
    if (record.converged) return { ...LS_LABELS['LS-04'], canonical: record.canonical_state };
    return { ...LS_LABELS['LS-09'], canonical: record.canonical_state };
  }
  if (record.receipt_lifecycle_state === 'active-monitor' || record.receipt_lifecycle_state === 'active-pinned') {
    if (!record.mirror_verified || record.handoff_stage === null) return { ...LS_LABELS['LS-06'], canonical: record.canonical_state };
    if (record.converged && record.canonical_state === record.receipt_lifecycle_state && record.epoch_open) return { ...LS_LABELS[record.receipt_lifecycle_state === 'active-pinned' ? 'LS-08' : 'LS-03'], canonical: record.canonical_state };
    return { ...LS_LABELS['LS-09'], canonical: record.canonical_state };
  }
  return null;
}
function mapControlRecord(record) {
  if (!controlBaseValid(record)) return controlUnavailable(record);
  const common = { transaction_digest: record.transaction_digest, rule_id: record.rule_id, tier: record.tier, scope_id: record.scope_id, state: record.state, handoff_stage: record.handoff_stage, cadence_digest: record.cadence_digest, receipt_digest: record.state === 'accepted_remote' && record.receipt_valid ? record.receipt_digest : null, accepted_commit: record.state === 'accepted_remote' && record.receipt_valid ? record.accepted_commit : null, content_hash: record.state === 'accepted_remote' && record.receipt_valid ? record.content_hash : null, receipt_lifecycle_state: record.receipt_lifecycle_state, canonical_state: record.canonical_state, mirror_verified: record.mirror_verified, converged: record.converged, epoch_open: record.epoch_open, local_stop_active: record.local_stop_active, visible_label: null, aria: null, fallback: null };
  const mapped = ls(record);
  if (!mapped) return controlUnavailable(record);
  return { ...common, visible_label: mapped.label, aria: mapped.aria, canonical_state: mapped.canonical, fallback: null };
}
function controlListFacts(store) { if (!store || typeof store.listLifecycleActionStatusFacts !== 'function') return null; try { const records = store.listLifecycleActionStatusFacts(); return Array.isArray(records) ? records : null; } catch { return null; } }
function controlResult(records) { return { status: 'available', publications: records.map(mapControlRecord).sort((left, right) => String(left.transaction_digest || '').localeCompare(String(right.transaction_digest || ''))) }; }

/** Backend-safe LS-01..LS-09 source states and aria values; never renders. Raw action/result/path/authority material never crosses this boundary. */
export function listLifecycleControlStatus({ store } = {}) {
  const records = controlListFacts(store);
  return records ? controlResult(records) : { status: 'unavailable', publications: [] };
}

/** One allowlisted LS detail record; predecessor/tree digests appear only for accepted receipts. */
export function readLifecycleControlStatusDetail({ store, transaction_digest } = {}) {
  if (!store || !DIGEST.test(transaction_digest || '') || typeof store.readLifecycleActionStatusFacts !== 'function') return { status: 'unavailable', publication: null };
  let record; try { record = store.readLifecycleActionStatusFacts({ transaction_digest }); } catch { return { status: 'unavailable', publication: null }; }
  const publication = mapControlRecord(record);
  if (publication.visible_label === STATUS_UNAVAILABLE || publication.transaction_digest !== transaction_digest) return { status: 'unavailable', publication: null };
  const detail = {
    ...publication,
    predecessor_commit: publication.state === 'accepted_remote' && publication.receipt_lifecycle_state !== null ? safeCommit(record.predecessor_commit) : null,
    tree_digest: publication.state === 'accepted_remote' && publication.receipt_lifecycle_state !== null ? safeDigest(record.tree_digest) : null,
    created_at: safeTime(record.created_at) ? record.created_at : null,
    updated_at: safeTime(record.updated_at) ? record.updated_at : null,
  };
  if (Object.keys(detail).length !== CONTROL_DETAIL_KEYS.length) return { status: 'unavailable', publication: null };
  return { status: 'available', publication: detail };
}

export const RULE_LIFECYCLE_CONTROL_STATUS_SCHEMA = Object.freeze({ row_keys: CONTROL_ROW_KEYS, detail_keys: CONTROL_DETAIL_KEYS, labels: LS_LABELS, unavailable_label: PUBLICATION_UNAVAILABLE });
