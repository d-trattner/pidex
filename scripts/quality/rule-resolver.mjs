import { createHash } from 'node:crypto';
import { createActivationEpochCatalog, publishRuleSnapshot } from './rule-exposure.mjs';

const PRECEDENCE = Object.freeze({ protected_global: 1, managed_global: 2, legacy_project: 3, managed_project: 4, module: 5 });
const RECONCILIATION_FAILURES = new Set(['source_unavailable', 'git_head_mismatch', 'db_projection_mismatch', 'mirror_mismatch', 'epoch_mismatch']);
const CANDIDATE_KEYS = new Set(['rule_id', 'rule_version', 'content_hash', 'accepted_commit', 'bytes', 'activation_epoch', 'tier', 'scope_id', 'protection_class', 'source', 'lifecycle_state', 'created_at', 'source_head', 'mirror_head', 'mirror_digest', 'reconciliation_status', 'locally_pinned', 'locally_stopped', 'overrides_rule_id', 'project_override_policy', 'agent', 'applicability', 'phases']);
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function canonicalDigest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
function validRoutingList(value) { return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)); }
function validCandidate(item) { return item && typeof item === 'object' && Object.keys(item).every((key) => CANDIDATE_KEYS.has(key)) && typeof item.rule_id === 'string' && /^[a-f0-9]{64}$/.test(item.rule_version) && item.content_hash === item.rule_version && /^[a-f0-9]{40}$/.test(item.accepted_commit) && typeof item.bytes === 'string' && Object.hasOwn(PRECEDENCE, item.source) && ['global', 'project'].includes(item.tier) && typeof item.created_at === 'string' && Number.isFinite(Date.parse(item.created_at)) && /^[a-f0-9]{40}$/.test(item.source_head) && /^[a-f0-9]{40}$/.test(item.mirror_head) && /^[a-f0-9]{64}$/.test(item.mirror_digest) && (item.agent === undefined || (typeof item.agent === 'string' && item.agent.length > 0)) && validRoutingList(item.applicability) && validRoutingList(item.phases) && (item.reconciliation_status === undefined || RECONCILIATION_FAILURES.has(item.reconciliation_status)); }
function validLifecycleCandidate(item) { return item.lifecycle_state === 'active' ? typeof item.activation_epoch === 'string' && item.activation_epoch.startsWith('epoch:') : item.lifecycle_state === 'deactivated' ? item.activation_epoch === undefined : item.lifecycle_state === undefined || typeof item.lifecycle_state === 'string'; }
function stableCandidate(left, right) { return left.rule_version === right.rule_version && left.content_hash === right.content_hash && left.accepted_commit === right.accepted_commit && left.bytes === right.bytes && left.tier === right.tier && left.scope_id === right.scope_id && left.source === right.source && left.activation_epoch === right.activation_epoch && left.protection_class === right.protection_class && left.source_head === right.source_head && left.mirror_head === right.mirror_head && left.mirror_digest === right.mirror_digest && left.created_at === right.created_at && left.agent === right.agent && canonical(left.applicability) === canonical(right.applicability) && canonical(left.phases) === canonical(right.phases); }
function active(item, stoppedIds) { return item.lifecycle_state === 'active' && !stoppedIds.has(item.rule_id); }
function validStoppedRuleIds(value) { return value === undefined || (Array.isArray(value) && value.every((ruleId) => typeof ruleId === 'string' && /^(?:pidex-global|project:[a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(ruleId))); }
function applyLocalStopsAfterIdentityResolution(entries, stoppedIds) {
  const narrowed = entries.filter((item) => item.lifecycle_state === 'active' && (stoppedIds.has(item.rule_id) || item.locally_pinned === true)).sort((a, b) => a.rule_id.localeCompare(b.rule_id));
  return freeze({ narrowing: freeze(narrowed.map((item) => ({ rule_id: item.rule_id, state: stoppedIds.has(item.rule_id) ? 'locally_stopped' : 'locally_pinned' }))), eligible: entries.filter((item) => active(item, stoppedIds)) });
}
function sourceHeads(entries, key) { return freeze(Object.fromEntries([...entries].sort((left, right) => left.source.localeCompare(right.source) || left[key].localeCompare(right[key])).map((entry) => [entry.source, entry[key]]))); }
function applyProjectOverrides(entries, scopeId, reasons) { const output = [...entries]; for (const entry of entries.filter((item) => item.tier === 'project' && item.overrides_rule_id)) { const targetIndex = output.findIndex((item) => item.rule_id === entry.overrides_rule_id); const target = output[targetIndex]; const permitted = target && target.project_override_policy === 'exact_project' && target.protection_class === 'none' && entry.protection_class === 'none' && entry.scope_id === scopeId; if (!permitted) reasons.add('project_override_invalid'); else output.splice(targetIndex, 1); } return output; }
function publicRule(item) { return freeze({ rule_id: item.rule_id, version_hash: item.rule_version, activation_epoch: item.activation_epoch, tier: item.tier, scope_id: item.scope_id || null, content_hash: item.content_hash, accepted_commit: item.accepted_commit, protection_class: item.protection_class || 'unknown', mirror_digest: item.mirror_digest, agent: item.agent, applicability: item.applicability || [], phases: item.phases || [], lifecycle_state: item.lifecycle_state }); }

/** Resolves one deep-immutable effective snapshot; conflicts remove affected managed identity. */
export function resolveRuleSnapshot({ run_id, scope_id = null, projection_revision, candidates, stopped_rule_ids } = {}) {
  if (typeof run_id !== 'string' || !run_id || typeof projection_revision !== 'string' || !projection_revision || !Array.isArray(candidates) || !validStoppedRuleIds(stopped_rule_ids) || candidates.some((item) => !validCandidate(item) || !validLifecycleCandidate(item))) throw new Error('RULE_RESOLVER_INPUT_INVALID');
  const reasons = new Set(); const byId = new Map(); const conflicts = new Set(); const stoppedIds = new Set(stopped_rule_ids || []);
  const ordered = [...candidates].sort((a, b) => (PRECEDENCE[a.source] - PRECEDENCE[b.source]) || a.rule_id.localeCompare(b.rule_id));
  for (const item of ordered) {
    if (!['active', 'deactivated'].includes(item.lifecycle_state)) { reasons.add('lifecycle_state_invalid'); continue; }
    if (item.reconciliation_status) { reasons.add(item.reconciliation_status); continue; }
    if (item.tier === 'project' && item.scope_id !== scope_id) { reasons.add('project_scope_mismatch'); continue; }
    if (item.locally_stopped === true) stoppedIds.add(item.rule_id);
    const previous = byId.get(item.rule_id);
    if (!previous) byId.set(item.rule_id, item); else if (!stableCandidate(previous, item)) { conflicts.add(item.rule_id); reasons.add('identity_conflict'); }
  }
  for (const id of conflicts) { byId.delete(id); stoppedIds.delete(id); }
  const stopped = applyLocalStopsAfterIdentityResolution([...byId.values()], stoppedIds);
  const narrowing = stopped.narrowing;
  const selected = applyProjectOverrides(stopped.eligible, scope_id, reasons).sort((a, b) => a.rule_id.localeCompare(b.rule_id));
  const resolved = selected.map(publicRule);
  const quality = reasons.size ? 'degraded' : 'verified';
  const created_at = [...candidates].map((item) => item.created_at).sort()[0];
  const source_heads = sourceHeads(selected, 'source_head');
  const mirror_heads = sourceHeads(selected, 'mirror_head');
  return freeze({ schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: `snapshot:${digest({ run_id, scope_id, projection_revision, created_at, source_heads, mirror_heads, resolved, quality })}`, resolver_revision: '045-S2', projection_revision, scope_id, created_at, source_heads, mirror_heads, quality, reason_codes: [...reasons].sort(), active_rules: resolved, narrowing: freeze(narrowing) });
}

function runtimeContextParts(input = {}) {
  const { pipeline_id, run_identity, project_authority, inventory_identity, lifecycle_head, projection, epoch_catalog, mirror_generation, reconciliation_artifact } = input;
  if (typeof pipeline_id !== 'string' || !pipeline_id || ![run_identity, project_authority, inventory_identity, lifecycle_head, projection, epoch_catalog, mirror_generation, reconciliation_artifact].every((value) => value && typeof value === 'object' && !Array.isArray(value))) throw new Error('RULE_RUNTIME_CONTEXT_INPUT_INVALID');
  return { pipeline_id, run_identity, project_authority, inventory_identity, lifecycle_head, projection, epoch_catalog, mirror_generation, reconciliation_artifact };
}

/** Computes closed digest binding before store creation without publishing context. */
export function runtimeContextInputDigests(input = {}) {
  const { run_identity, project_authority, inventory_identity, lifecycle_head, projection, epoch_catalog, mirror_generation, reconciliation_artifact } = runtimeContextParts(input);
  return freeze({
    schema: 'pidex-rule-runtime-input-digests-v1',
    run_identity_digest: canonicalDigest(run_identity),
    project_authority_digest: canonicalDigest(project_authority),
    inventory_identity_digest: canonicalDigest(inventory_identity),
    lifecycle_head_digest: canonicalDigest(lifecycle_head),
    projection_digest: canonicalDigest(projection),
    epoch_catalog_digest: canonicalDigest(epoch_catalog),
    mirror_generation_digest: canonicalDigest(mirror_generation),
    reconciliation_artifact_digest: canonicalDigest(reconciliation_artifact),
  });
}

/** Binds caller-verified lifecycle facts once; no source, DB, mirror, clock, environment, or global reads. */
export function buildRuleRuntimeContext(input = {}) {
  const { pipeline_id, run_identity, inventory_identity, epoch_catalog, reconciliation_artifact } = runtimeContextParts(input);
  const resolver_snapshot = resolveRuleSnapshot(input);
  if (resolver_snapshot.quality !== 'verified') throw new Error('RULE_RUNTIME_CONTEXT_INPUT_INVALID');
  const resolverEpochs = new Map(resolver_snapshot.active_rules.map((rule) => [`${rule.rule_id}\0${rule.version_hash}`, rule.activation_epoch]));
  const effectiveEntries = inventory_identity.entries.filter((rule) => rule.lifecycle_state === 'inactive' || resolverEpochs.has(`${rule.rule_id}\0${rule.version_hash}`));
  const narrowed = effectiveEntries.length !== inventory_identity.entries.length;
  const effectiveInventory = narrowed ? { ...inventory_identity, entries: effectiveEntries, reconciliation_revision: `${inventory_identity.reconciliation_revision}:narrowed:${canonicalDigest(resolver_snapshot.narrowing)}`, inventory_digest: canonicalDigest(effectiveEntries) } : inventory_identity;
  const effectiveReconciliation = narrowed ? { ...reconciliation_artifact, reconciliation_revision: effectiveInventory.reconciliation_revision, inventory_count: effectiveEntries.length, inventory_digest: effectiveInventory.inventory_digest } : reconciliation_artifact;
  const exactEpochs = Object.fromEntries(effectiveEntries.filter((rule) => rule.lifecycle_state !== 'inactive').map((rule) => {
    const key = `${rule.rule_id}\0${rule.version_hash}`;
    const epoch = resolverEpochs.get(key) || epoch_catalog[key];
    if (typeof epoch !== 'string' || !epoch.startsWith('epoch:')) throw new Error('RULE_RUNTIME_CONTEXT_INPUT_INVALID');
    return [key, epoch];
  }));
  const exactEpochCatalog = createActivationEpochCatalog(exactEpochs);
  const rule_snapshot = publishRuleSnapshot({
    inventory: effectiveInventory,
    resolver_revision: resolver_snapshot.resolver_revision,
    projection_revision: resolver_snapshot.projection_revision,
    run: run_identity,
    epochCatalog: exactEpochCatalog,
    reconciliationArtifact: effectiveReconciliation,
  });
  const input_digests = runtimeContextInputDigests({ ...input, inventory_identity: effectiveInventory, reconciliation_artifact: effectiveReconciliation, epoch_catalog: exactEpochCatalog });
  const passive_exposure_input = freeze({ inventory_identity: freeze(effectiveInventory), epoch_catalog: freeze(exactEpochCatalog), reconciliation_artifact: freeze(effectiveReconciliation), rule_snapshot });
  return freeze({ schema: 'pidex-rule-runtime-context-v1', pipeline_id, input_digests, resolver_snapshot, passive_exposure_input });
}
