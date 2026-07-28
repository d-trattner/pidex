import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function epochKey(rule) {
  return `${rule.rule_id}\0${rule.version_hash}`;
}

const QUALITY_MEMBERS = Object.freeze({
  completeness: new Set(['complete', 'incomplete', 'mixed']),
  derivation: new Set(['direct', 'fallback']),
  recorder_condition: new Set(['healthy', 'degraded']),
  currency: new Set(['current', 'stale']),
  run_provenance: new Set(['ordinary', 'test', 'synthetic', 'manual', 'non_attested']),
  occurrence: new Set(['original', 'replay', 'duplicate']),
});

/** Validates Plan 049 Q49 closed, orthogonal quality facts; S1 never makes evidence usable. */
export function createPassiveQuality(input = {}) {
  const quality = {};
  for (const [key, values] of Object.entries(QUALITY_MEMBERS)) {
    if (!values.has(input[key])) throw new Error('PASSIVE_QUALITY_INVALID');
    quality[key] = input[key];
  }
  if (Object.keys(input).some((key) => !(key in QUALITY_MEMBERS))) throw new Error('PASSIVE_QUALITY_INVALID');
  return deepFreeze({ ...quality, usable_for_evidence: false });
}

export function createActivationEpochCatalog(records = {}) {
  return Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b)));
}

function validEpochCatalog(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.schema !== 1) return false;
  if (!parsed.epochs || typeof parsed.epochs !== 'object') return false;
  return !Array.isArray(parsed.epochs);
}

export function loadActivationEpochCatalog(file) {
  if (!existsSync(file)) return createActivationEpochCatalog();
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!validEpochCatalog(parsed)) throw new Error('invalid activation epoch catalog');
  return createActivationEpochCatalog(parsed.epochs);
}

export function saveActivationEpochCatalog(file, catalog) {
  const parent = path.dirname(file);
  mkdirSync(parent, { recursive: true });
  const serialized = `${JSON.stringify({ schema: 1, epochs: createActivationEpochCatalog(catalog) }, null, 2)}\n`;
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, file);
}

const EPOCH_TRANSITIONS = new Set(['first_activation', 'version_change', 'deactivation', 'reactivation', 'refinement', 'semantic_invalidation', 'recovery']);

function freshEpoch(rule) {
  const key = epochKey(rule);
  return `epoch:${digest({ key, opened_at: new Date().toISOString(), nonce: randomUUID() }).slice(0, 24)}`;
}

function validEpochRule(rule) {
  return Boolean(rule?.rule_id && rule?.version_hash);
}

function validEpochTransitionInput(catalog, rule, trigger) {
  return Boolean(catalog && typeof catalog === 'object' && validEpochRule(rule) && EPOCH_TRANSITIONS.has(trigger));
}

/** Applies one closed EP-49 transition; every closure opens fresh evidence-free epoch identity. */
export function transitionActivationEpoch({ catalog, rule, trigger } = {}) {
  if (!validEpochTransitionInput(catalog, rule, trigger)) throw new Error('EP49_INVALID_TRANSITION');
  const epoch_id = freshEpoch(rule);
  catalog[epochKey(rule)] = epoch_id;
  return deepFreeze({ epoch_id, carried_evidence: [] });
}

function resolveEpoch(rule, catalog) {
  const key = epochKey(rule);
  return catalog[key] || transitionActivationEpoch({ catalog, rule, trigger: 'first_activation' }).epoch_id;
}

/** Resolves one immutable tracer-only snapshot. It cannot remove canonical inventory entries. */
function assertSnapshotInput(inventory, epochCatalog) {
  if (!inventory || !Array.isArray(inventory.entries)) throw new Error('inventory entries are required');
  if (!epochCatalog || typeof epochCatalog !== 'object') throw new Error('activation epoch catalog is required');
}

function matchingReconciliationRevision(inventory, artifact) {
  return artifact?.reconciliation_revision === inventory.reconciliation_revision;
}

function matchingInventoryCount(inventory, artifact) {
  return artifact?.inventory_count === inventory.entries.length;
}

function matchingInventoryDigest(inventory, artifact) {
  return artifact?.inventory_digest === inventory.inventory_digest;
}

function reconciliationMatchesInventory(inventory, artifact) {
  if (inventory.complete !== true) return false;
  if (!matchingReconciliationRevision(inventory, artifact)) return false;
  if (!matchingInventoryCount(inventory, artifact)) return false;
  return matchingInventoryDigest(inventory, artifact);
}

function snapshotActiveRules(inventory, epochCatalog) {
  return inventory.entries
    .filter((entry) => entry.lifecycle_state !== 'inactive')
    .map((entry) => ({ rule_id: entry.rule_id, version_hash: entry.version_hash, activation_epoch: resolveEpoch(entry, epochCatalog) }))
    .sort((a, b) => a.rule_id.localeCompare(b.rule_id) || a.version_hash.localeCompare(b.version_hash));
}

function exactIdentityValue(value, unavailable) {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  return value !== unavailable;
}

function exactRunIdentity(run) {
  if (!exactIdentityValue(run.model_identity, 'project-pipeline')) return false;
  if (!exactIdentityValue(run.config_fingerprint, 'unavailable')) return false;
  return exactIdentityValue(run.correlation_id, undefined);
}

function snapshotQualityFlags(reconciliationMatches, exactIdentity) {
  return [
    ...(reconciliationMatches ? [] : ['inventory_incomplete']),
    ...(exactIdentity ? [] : ['identity_incomplete']),
  ];
}

function snapshotOptional(value) {
  return value || null;
}

function snapshotRevision(value) {
  return value || 'unknown';
}

function snapshotIdentity(activeRules, inventory, resolver_revision, projection_revision, run) {
  return `snapshot:${digest({ activeRules, reconciliation_revision: inventory.reconciliation_revision, resolver_revision, projection_revision, run_id: snapshotOptional(run.run_id), model_identity: snapshotOptional(run.model_identity), config_fingerprint: snapshotOptional(run.config_fingerprint), correlation_id: snapshotOptional(run.correlation_id) })}`;
}

function snapshotComplete(reconciliationMatches, exactIdentity) {
  return reconciliationMatches && exactIdentity;
}

function snapshotFields(inventory, resolver_revision, projection_revision, run, activeRules, reconciliationMatches, exactIdentity) {
  return {
    schema: 1,
    snapshot_id: snapshotIdentity(activeRules, inventory, resolver_revision, projection_revision, run),
    complete: snapshotComplete(reconciliationMatches, exactIdentity),
    quality_flags: snapshotQualityFlags(reconciliationMatches, exactIdentity),
    active_rules: activeRules,
    resolver_revision: snapshotRevision(resolver_revision),
    inventory_revision: snapshotRevision(inventory.inventory_digest),
    reconciliation_revision: snapshotRevision(inventory.reconciliation_revision),
    inventory_count: inventory.entries.length,
    projection_revision: snapshotRevision(projection_revision),
    run_id: snapshotOptional(run.run_id),
    plan_id: snapshotOptional(run.plan_id),
    project_scope: snapshotOptional(run.project_scope),
    pipeline_version: snapshotOptional(run.pipeline_version),
    model_identity: snapshotOptional(run.model_identity),
    config_fingerprint: snapshotOptional(run.config_fingerprint),
    correlation_id: snapshotOptional(run.correlation_id),
    created_at: new Date().toISOString(),
  };
}

export function publishRuleSnapshot({ inventory, resolver_revision, projection_revision, run = {}, epochCatalog, reconciliationArtifact } = {}) {
  assertSnapshotInput(inventory, epochCatalog);
  const reconciliationMatches = reconciliationMatchesInventory(inventory, reconciliationArtifact);
  const activeRules = snapshotActiveRules(inventory, epochCatalog);
  return deepFreeze(snapshotFields(inventory, resolver_revision, projection_revision, run, activeRules, reconciliationMatches, exactRunIdentity(run)));
}

/** Records passive terminal facts from a resolver-owned snapshot; callers cannot supply measurement semantics. */
const BUNDLE_MEMBERS = Object.freeze(['reconciliation', 'snapshot', 'exposure', 'epoch', 'catalog_contribution']);
const BUNDLE_INPUT_KEYS = new Set(['root', ...BUNDLE_MEMBERS, 'identity']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function bundleDigest(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function memberDigest(content) {
  return createHash('sha256').update(content).digest('hex');
}

function bundleError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function bundleRoot(root, identity) {
  if (!root || typeof root !== 'string') throw bundleError('PASSIVE_SCHEMA_ROOT_REQUIRED');
  if (!identity || typeof identity.run_id !== 'string' || !identity.run_id) throw bundleError('PASSIVE_SCHEMA_IDENTITY_REQUIRED');
  return path.join(path.resolve(root), 'state', 'quality', 'rule-exposure', bundleDigest({ run_id: identity.run_id }));
}

function writeDurable(file, content) {
  const descriptor = openSync(file, 'wx', 0o600);
  try {
    writeFileSync(descriptor, content, { encoding: 'utf8' });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

const WINDOWS_TARGET_FACTS = Object.freeze([
  'platform_win32', 'probe_root_self_created', 'target_self_created', 'target_root_confined',
  'target_real_directory', 'target_not_symlink_or_reparse',
]);
const WINDOWS_DIRECTORY_SYNC_FACTS = Object.freeze([
  ...WINDOWS_TARGET_FACTS, 'file_create_write_flush_succeeded', 'same_volume_rename_verify_succeeded',
  'directory_open_succeeded', 'descriptor_is_directory', 'cleanup_succeeded',
]);
const WINDOWS_DESCRIPTOR_FACTS = Object.freeze([...WINDOWS_TARGET_FACTS, 'file_create_write_flush_succeeded', 'directory_open_succeeded', 'descriptor_is_directory']);
const WINDOWS_DIRECTORY_SYNC_TUPLES = new Map([
  ['directory_open\0EISDIR', { tuple_id: 'UC-1A', required_facts: WINDOWS_TARGET_FACTS }],
  ['directory_fsync\0EINVAL', { tuple_id: 'UC-1B', required_facts: WINDOWS_DESCRIPTOR_FACTS }],
  ['directory_fsync\0ENOTSUP', { tuple_id: 'UC-1B', required_facts: WINDOWS_DESCRIPTOR_FACTS }],
  ['directory_fsync\0EPERM', { tuple_id: 'UC-1B-WIN', required_facts: WINDOWS_DIRECTORY_SYNC_FACTS }],
]);

/** Classifies finite UC-1 parent-directory capability observations; every nonmember hard-fails. */
export function classifyDirectorySyncFailure({ operation, code, platform, facts } = {}) {
  const tuple = WINDOWS_DIRECTORY_SYNC_TUPLES.get(`${operation}\0${code}`);
  const admitted = platform === 'win32' && tuple && tuple.required_facts.every((key) => facts?.[key] === true);
  return admitted
    ? { classification: 'directory_sync_unsupported', tuple_id: tuple.tuple_id }
    : { classification: 'operation_failure', tuple_id: null };
}

function syncParent(directory, operationFacts = {}) {
  let descriptor;
  let operation = 'directory_open';
  const facts = { ...operationFacts, platform_win32: process.platform === 'win32' };
  try {
    descriptor = openSync(directory, 'r');
    facts.directory_open_succeeded = true;
    operation = 'directory_descriptor';
    facts.descriptor_is_directory = fstatSync(descriptor).isDirectory();
    if (!facts.descriptor_is_directory) throw bundleError('RECOVERY_DURABILITY_FAILED');
    operation = 'directory_fsync';
    fsyncSync(descriptor);
    return 'confirmed';
  } catch (error) {
    const result = classifyDirectorySyncFailure({ operation, code: error?.code, platform: process.platform, facts });
    if (result.classification === 'directory_sync_unsupported') return 'unsupported';
    throw bundleError('RECOVERY_DURABILITY_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validBundleRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  return validBundleRecord(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonempty(value) {
  return typeof value === 'string' && value.length > 0;
}

function validBundleIdentifier(value, prefix) {
  return new RegExp(`^${prefix}:[a-f0-9]{64}$`).test(value || '');
}

function validActiveRule(value) {
  return hasExactKeys(value, ['rule_id', 'version_hash', 'activation_epoch'])
    && /^rule:/.test(value.rule_id) && /^[a-f0-9]{64}$/.test(value.version_hash)
    && /^epoch:[a-f0-9]{24}$/.test(value.activation_epoch);
}

function validActiveRules(value) {
  return Array.isArray(value) && value.every(validActiveRule)
    && new Set(value.map((rule) => `${rule.rule_id}\0${rule.version_hash}`)).size === value.length;
}

function validNullable(value) {
  return value === null || nonempty(value);
}

function validIdentity(identity) {
  return hasExactKeys(identity, ['run_id', 'terminal_outcome_ref', 'reconciliation_revision', 'snapshot_id', 'exposure_id'])
    && nonempty(identity.run_id) && validNullable(identity.terminal_outcome_ref) && nonempty(identity.reconciliation_revision)
    && validBundleIdentifier(identity.snapshot_id, 'snapshot') && validBundleIdentifier(identity.exposure_id, 'exposure');
}

function validReconciliation(value) {
  return hasExactKeys(value, ['schema', 'reconciliation_revision', 'inventory_count', 'inventory_digest', 'reconciliation_id', 'artifact_id'])
    && value.schema === 1 && nonempty(value.reconciliation_revision) && Number.isInteger(value.inventory_count) && value.inventory_count >= 0
    && nonempty(value.inventory_digest) && validBundleIdentifier(value.reconciliation_id, 'reconciliation') && value.artifact_id === value.reconciliation_id;
}

function validSnapshot(value) {
  const keys = ['schema', 'snapshot_id', 'complete', 'quality_flags', 'active_rules', 'resolver_revision', 'inventory_revision', 'reconciliation_revision', 'inventory_count', 'projection_revision', 'run_id', 'plan_id', 'project_scope', 'pipeline_version', 'model_identity', 'config_fingerprint', 'correlation_id', 'created_at'];
  return hasExactKeys(value, keys) && value.schema === 1 && validBundleIdentifier(value.snapshot_id, 'snapshot')
    && typeof value.complete === 'boolean' && Array.isArray(value.quality_flags) && value.quality_flags.every((flag) => ['inventory_incomplete', 'identity_incomplete'].includes(flag))
    && new Set(value.quality_flags).size === value.quality_flags.length && validActiveRules(value.active_rules)
    && ['resolver_revision', 'inventory_revision', 'reconciliation_revision', 'projection_revision', 'run_id'].every((key) => nonempty(value[key]))
    && Number.isInteger(value.inventory_count) && value.inventory_count >= 0
    && ['plan_id', 'project_scope', 'pipeline_version', 'model_identity', 'config_fingerprint', 'correlation_id'].every((key) => validNullable(value[key]))
    && !Number.isNaN(Date.parse(value.created_at));
}

function validExposure(value) {
  const keys = ['schema', 'exposure_id', 'snapshot_id', 'run_id', 'plan_id', 'project_scope', 'pipeline_version', 'model_identity', 'config_fingerprint', 'correlation_id', 'resolver_revision', 'inventory_revision', 'reconciliation_revision', 'projection_revision', 'active_rules', 'activation_epochs', 'terminal_outcome_ref', 'timestamp', 'quality', 'quality_flags', 'usable_for_evidence', 'attestation'];
  return hasExactKeys(value, keys) && value.schema === 1 && validBundleIdentifier(value.exposure_id, 'exposure') && validBundleIdentifier(value.snapshot_id, 'snapshot')
    && nonempty(value.run_id) && ['plan_id', 'project_scope', 'pipeline_version', 'model_identity', 'config_fingerprint', 'correlation_id', 'terminal_outcome_ref'].every((key) => validNullable(value[key]))
    && ['resolver_revision', 'inventory_revision', 'reconciliation_revision', 'projection_revision'].every((key) => nonempty(value[key]))
    && validActiveRules(value.active_rules) && hasExactKeys(value.activation_epochs, value.active_rules.map((rule) => rule.rule_id))
    && value.active_rules.every((rule) => value.activation_epochs[rule.rule_id] === rule.activation_epoch)
    && ['complete', 'identity_incomplete', 'inventory_incomplete'].includes(value.quality) && Array.isArray(value.quality_flags)
    && value.usable_for_evidence === false && value.attestation === 'project-pipeline-tracer' && !Number.isNaN(Date.parse(value.timestamp));
}

function validEpoch(value) {
  return hasExactKeys(value, ['schema', 'epochs']) && value.schema === 1 && validBundleRecord(value.epochs)
    && Object.entries(value.epochs).every(([key, epoch]) => /^rule:.+\0[a-f0-9]{64}$/.test(key) && /^epoch:[a-f0-9]{24}$/.test(epoch));
}

function validCatalog(value) {
  return hasExactKeys(value, ['schema', 'entries']) && value.schema === 1 && validActiveRules(value.entries);
}

function bundleBodyReason(input) {
  if (!validBundleRecord(input)) return 'PASSIVE_SCHEMA_INVALID';
  for (const key of Object.keys(input)) if (!BUNDLE_INPUT_KEYS.has(key)) return 'PASSIVE_SCHEMA_UNKNOWN_KEY';
  const bodyKeys = {
    reconciliation: ['schema', 'reconciliation_revision', 'inventory_count', 'inventory_digest', 'reconciliation_id', 'artifact_id'],
    snapshot: ['schema', 'snapshot_id', 'complete', 'quality_flags', 'active_rules', 'resolver_revision', 'inventory_revision', 'reconciliation_revision', 'inventory_count', 'projection_revision', 'run_id', 'plan_id', 'project_scope', 'pipeline_version', 'model_identity', 'config_fingerprint', 'correlation_id', 'created_at'],
    exposure: ['schema', 'exposure_id', 'snapshot_id', 'run_id', 'plan_id', 'project_scope', 'pipeline_version', 'model_identity', 'config_fingerprint', 'correlation_id', 'resolver_revision', 'inventory_revision', 'reconciliation_revision', 'projection_revision', 'active_rules', 'activation_epochs', 'terminal_outcome_ref', 'timestamp', 'quality', 'quality_flags', 'usable_for_evidence', 'attestation'],
    epoch: ['schema', 'epochs'], catalog_contribution: ['schema', 'entries'],
  };
  if (Object.entries(bodyKeys).some(([member, keys]) => validBundleRecord(input[member]) && Object.keys(input[member]).some((key) => !keys.includes(key)))) return 'PASSIVE_SCHEMA_UNKNOWN_KEY';
  const activeRuleUnknown = (rules) => Array.isArray(rules) && rules.some((rule) => validBundleRecord(rule) && Object.keys(rule).some((key) => !['rule_id', 'version_hash', 'activation_epoch'].includes(key)));
  if (activeRuleUnknown(input.snapshot?.active_rules) || activeRuleUnknown(input.exposure?.active_rules) || activeRuleUnknown(input.catalog_contribution?.entries)) return 'PASSIVE_SCHEMA_UNKNOWN_KEY';
  if (!BUNDLE_MEMBERS.every((member) => validBundleRecord(input[member])) || !validIdentity(input.identity)) return 'PASSIVE_SCHEMA_INVALID';
  if (![validReconciliation(input.reconciliation), validSnapshot(input.snapshot), validExposure(input.exposure), validEpoch(input.epoch), validCatalog(input.catalog_contribution)].every(Boolean)) return 'PASSIVE_SCHEMA_INVALID';
  const { reconciliation, snapshot, exposure, epoch, catalog_contribution: catalog, identity } = input;
  const sharedSnapshotExposureFields = ['run_id', 'plan_id', 'project_scope', 'pipeline_version', 'model_identity', 'config_fingerprint', 'correlation_id', 'resolver_revision', 'inventory_revision', 'reconciliation_revision', 'projection_revision'];
  const expectedQuality = snapshot.complete
    ? 'complete'
    : snapshot.quality_flags.includes('inventory_incomplete') ? 'inventory_incomplete' : 'identity_incomplete';
  const linked = reconciliation.reconciliation_revision === snapshot.reconciliation_revision && reconciliation.reconciliation_revision === exposure.reconciliation_revision
    && snapshot.snapshot_id === exposure.snapshot_id && identity.reconciliation_revision === reconciliation.reconciliation_revision
    && identity.snapshot_id === snapshot.snapshot_id && identity.exposure_id === exposure.exposure_id
    && identity.run_id === snapshot.run_id && identity.run_id === exposure.run_id && identity.terminal_outcome_ref === exposure.terminal_outcome_ref
    && sharedSnapshotExposureFields.every((key) => snapshot[key] === exposure[key])
    && exposure.quality === expectedQuality && canonical(exposure.quality_flags) === canonical(snapshot.quality_flags)
    && canonical(snapshot.active_rules) === canonical(exposure.active_rules) && canonical(snapshot.active_rules) === canonical(catalog.entries)
    && snapshot.active_rules.every((rule) => epoch.epochs[epochKey(rule)] === rule.activation_epoch);
  return linked ? null : 'PASSIVE_SCHEMA_LINK_INVALID';
}

function assertBundleInput(input) {
  const reason = bundleBodyReason(input);
  if (reason) throw bundleError(reason);
}

function publicIds(input) {
  return {
    reconciliation_id: input.reconciliation.reconciliation_id,
    snapshot_id: input.snapshot.snapshot_id,
    exposure_id: input.exposure.exposure_id,
  };
}

function readManifest(file) {
  try {
    const content = readFileSync(file, 'utf8');
    const parsed = JSON.parse(content);
    if (content !== `${canonical(parsed)}\n`) throw bundleError('RECOVERY_MANIFEST_SCHEMA_INVALID');
    return parsed;
  } catch (error) {
    if (error?.code) throw error;
    throw bundleError('RECOVERY_MANIFEST_SCHEMA_INVALID');
  }
}

function manifestHasStructure(manifest) {
  return hasExactKeys(manifest, ['schema', 'generation', 'identity', 'public_ids', 'members', 'durability', 'publisher_process_id'])
    && manifest.schema === 2 && /^[a-f0-9]{32}$/.test(manifest.generation)
    && validIdentity(manifest.identity) && hasExactKeys(manifest.public_ids, ['reconciliation_id', 'snapshot_id', 'exposure_id'])
    && ['reconciliation_id', 'snapshot_id', 'exposure_id'].every((key) => validBundleIdentifier(manifest.public_ids[key], key.replace('_id', '')))
    && hasExactKeys(manifest.members, BUNDLE_MEMBERS) && BUNDLE_MEMBERS.every((member) => hasExactKeys(manifest.members[member], ['digest']) && /^[a-f0-9]{64}$/.test(manifest.members[member].digest))
    && hasExactKeys(manifest.durability, ['parent_sync']) && ['confirmed', 'unsupported'].includes(manifest.durability.parent_sync)
    && Number.isInteger(manifest.publisher_process_id) && manifest.publisher_process_id > 0;
}

function manifestMatchesIdentity(manifest, identity) {
  return canonical(manifest.identity) === canonical(identity);
}

function strictMemberText(bytes) {
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = JSON.parse(content);
    return bytes.equals(Buffer.from(`${canonical(parsed)}\n`, 'utf8')) ? parsed : null;
  } catch { return null; }
}

function verifiedManifestMember(root, manifest, identity, member) {
  const memberFile = path.join(root, 'members', `${member}.json`);
  const bytes = existsSync(memberFile) ? readFileSync(memberFile) : null;
  if (bytes === null || memberDigest(bytes) !== manifest.members[member].digest) throw bundleError('RECOVERY_MEMBER_INVALID');
  const envelope = strictMemberText(bytes);
  if (!hasExactKeys(envelope, ['schema', 'generation', 'member', 'identity', 'publication', 'body']) || envelope.schema !== 2 || envelope.generation !== manifest.generation || envelope.member !== member || !manifestMatchesIdentity(envelope, identity)) throw bundleError('RECOVERY_MEMBER_INVALID');
  if (!hasExactKeys(envelope.publication, ['publisher_process_id', 'durability']) || envelope.publication.publisher_process_id !== manifest.publisher_process_id) throw bundleError('RECOVERY_PUBLISHER_INVALID');
  if (!hasExactKeys(envelope.publication.durability, ['parent_sync']) || envelope.publication.durability.parent_sync !== manifest.durability.parent_sync) throw bundleError('RECOVERY_DURABILITY_INVALID');
  return envelope.body;
}

function verifyManifest(root, manifest, identity) {
  if (!manifestHasStructure(manifest)) throw bundleError('RECOVERY_MANIFEST_SCHEMA_INVALID');
  if (!manifestMatchesIdentity(manifest, identity)) throw bundleError('RECOVERY_IDENTITY_CONFLICT');
  const bodies = Object.fromEntries(BUNDLE_MEMBERS.map((member) => [member, verifiedManifestMember(root, manifest, identity, member)]));
  const input = { root: '.', identity, ...bodies };
  const reason = bundleBodyReason(input);
  if (reason === 'PASSIVE_SCHEMA_LINK_INVALID') throw bundleError('RECOVERY_LINK_INVALID');
  if (reason) throw bundleError('RECOVERY_MEMBER_SCHEMA_INVALID');
  const ids = publicIds(input);
  if (canonical(ids) !== canonical(manifest.public_ids)) throw bundleError('RECOVERY_LINK_INVALID');
  return ids;
}

function existingPublication(root, identity) {
  const manifest = path.join(root, 'commit-manifest.json');
  if (!existsSync(manifest)) return undefined;
  try { return verifyManifest(root, readManifest(manifest), identity); }
  catch (error) {
    if (error?.code === 'RECOVERY_IDENTITY_CONFLICT') throw bundleError('CONFLICT_IDENTITY');
    throw error;
  }
}

function readLockOwner(lock) {
  try { return JSON.parse(readFileSync(lock, 'utf8')); }
  catch { return null; }
}

function validLockOwner(owner) {
  return Boolean(owner)
    && Number.isInteger(owner.pid)
    && owner.pid > 0
    && Boolean(owner.identity)
    && typeof owner.identity === 'object';
}

function ownerProcessDisposition(pid) {
  try {
    process.kill(pid, 0);
    return 'active';
  } catch (error) {
    return error?.code === 'ESRCH' ? 'dead' : 'unknown';
  }
}

function lockDisposition(lock, identity) {
  const owner = readLockOwner(lock);
  if (!validLockOwner(owner)) return 'unknown';
  if (canonical(owner.identity) !== canonical(identity)) return 'foreign';
  return ownerProcessDisposition(owner.pid);
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function createOwnershipLock(lock, identity) {
  try {
    const descriptor = openSync(lock, 'wx', 0o600);
    writeFileSync(descriptor, canonical({ schema: 1, pid: process.pid, identity }), { encoding: 'utf8' });
    fsyncSync(descriptor);
    return { descriptor };
  } catch (error) {
    return { error };
  }
}

function ownershipDispositionError(disposition) {
  return { foreign: 'CONFLICT_IDENTITY', unknown: 'RECOVERY_OWNER_UNCERTAIN' }[disposition];
}

function contendedOwnershipLock(root, lock, identity) {
  if (existingPublication(root, identity)) return null;
  const disposition = lockDisposition(lock, identity);
  if (disposition === 'dead') {
    rmSync(lock, { force: true });
    return undefined;
  }
  const code = ownershipDispositionError(disposition);
  if (code) throw bundleError(code);
  pause(5);
  return undefined;
}

function ownershipLockAttempt(root, lock, identity) {
  if (existingPublication(root, identity)) return null;
  const claim = createOwnershipLock(lock, identity);
  if (claim.descriptor !== undefined) return claim.descriptor;
  if (claim.error?.code !== 'EEXIST') throw claim.error;
  return contendedOwnershipLock(root, lock, identity);
}

function acquireOwnershipLock(root, lock, identity) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const claim = ownershipLockAttempt(root, lock, identity);
    if (claim !== undefined) return claim;
  }
  throw bundleError('RECOVERY_OWNER_ACTIVE');
}

const RO_MEMBER = new Set(['absent', 'valid_exact', 'torn_invalid', 'foreign']);
const RO_SCALAR = Object.freeze({ requested_identity: new Set(['exact', 'conflicting']), generation_relation: new Set(['zero_none', 'one_exact', 'foreign', 'mixed', 'missing_invalid']), manifest_temp: RO_MEMBER, manifest_final: RO_MEMBER, lock: new Set(['absent', 'live_exact', 'live_foreign', 'verified_dead_exact', 'verified_dead_foreign', 'malformed_unknown']), durability: new Set(['fully_confirmed', 'directory_sync_unsupported', 'operation_failure', 'capability_unknown']), quarantine: new Set(['absent', 'sealed', 'interrupted']) });
const RO_INPUT_KEYS = new Set([...Object.keys(RO_SCALAR), 'member_temp', 'member_stage', 'member_final', 'unsafe_shape']);
const RO_RESULT = Object.freeze({
  'RO-49-01': ['TORN_OR_INVALID', 'RECOVERY_UNSAFE_SHAPE', false], 'RO-49-02': ['CONFLICT', 'RECOVERY_IDENTITY_CONFLICT', false], 'RO-49-03': ['TORN_OR_INVALID', 'RECOVERY_OWNER_ACTIVE', false], 'RO-49-04': ['QUARANTINED', 'RECOVERY_OWNER_UNCERTAIN', false], 'RO-49-05': ['QUARANTINED', 'RECOVERY_DURABILITY_FAILED', false], 'RO-49-06': ['COMMITTED_VERIFIED', 'RECOVERY_COMMITTED_VERIFIED', true], 'RO-49-07': ['COMMITTED_VERIFIED', 'RECOVERY_MEMBER_REPAIRED', true], 'RO-49-08': ['COMMITTED_VERIFIED', 'RECOVERY_MANIFEST_REPAIRED', true], 'RO-49-09': ['COMMITTED_VERIFIED', 'RECOVERY_COMMITTED_REVERIFIED', true], 'RO-49-10': ['QUARANTINED', 'RECOVERY_DURABILITY_UNCONFIRMED', false], 'RO-49-11': ['QUARANTINED', 'RECOVERY_INCOMPLETE_GENERATION', false], 'RO-49-12': ['ABSENT', 'RECOVERY_NOTHING_PUBLISHED', false], 'RO-49-13': ['QUARANTINED', 'RECOVERY_QUARANTINE_RESUMED', false], 'RO-49-14': ['QUARANTINED', 'RECOVERY_ALREADY_QUARANTINED', false],
});

const MEMBER_FACT_GROUPS = Object.freeze(['member_temp', 'member_stage', 'member_final']);

function validRecoveryMemberGroup(input, key) {
  return Array.isArray(input[key])
    && input[key].length === 5
    && input[key].every((value) => RO_MEMBER.has(value));
}

function validRecoveryFacts(input) {
  if (!input || typeof input !== 'object' || input.unsafe_shape === true) return false;
  if (Object.keys(input).some((key) => !RO_INPUT_KEYS.has(key))) return false;
  if (Object.entries(RO_SCALAR).some(([key, values]) => !values.has(input[key]))) return false;
  return MEMBER_FACT_GROUPS.every((key) => validRecoveryMemberGroup(input, key));
}

function recoveryMemberPositions(input) {
  return MEMBER_FACT_GROUPS.flatMap((key) => input[key]);
}

function memberCoverage(input) {
  return input.member_final.every((value, index) => value === 'valid_exact' || input.member_temp[index] === 'valid_exact' || input.member_stage[index] === 'valid_exact');
}

function recoveryFacts(input) {
  if (!validRecoveryFacts(input)) return null;
  const positions = recoveryMemberPositions(input);
  return {
    ...input,
    residue: positions.some((value) => value !== 'absent') || input.manifest_temp !== 'absent' || input.manifest_final !== 'absent',
    foreign: positions.includes('foreign') || input.manifest_temp === 'foreign' || input.manifest_final === 'foreign',
    finals_valid: input.member_final.every((value) => value === 'valid_exact'),
    coverage: memberCoverage(input),
  };
}

function unsafeRecoveryFacts(facts) {
  return !facts || ['mixed', 'missing_invalid'].includes(facts.generation_relation) || (facts.generation_relation === 'zero_none' && facts.residue);
}

function identityConflictFacts(facts) {
  return facts.requested_identity === 'conflicting' || facts.generation_relation === 'foreign' || facts.foreign;
}

function activeOwnerFacts(facts) {
  return ['live_exact', 'live_foreign'].includes(facts.lock);
}

function durabilityFailureFacts(facts) {
  return ['operation_failure', 'capability_unknown'].includes(facts.durability);
}

function completeRecoveryFacts(facts) {
  return facts.generation_relation === 'one_exact' && facts.manifest_final === 'valid_exact' && facts.finals_valid;
}

function memberRepairFacts(facts) {
  return facts.generation_relation === 'one_exact'
    && facts.manifest_final === 'valid_exact'
    && !facts.finals_valid
    && facts.coverage
    && facts.durability === 'fully_confirmed';
}

function manifestRepairFacts(facts) {
  return facts.generation_relation === 'one_exact'
    && facts.manifest_final !== 'valid_exact'
    && facts.manifest_temp === 'valid_exact'
    && facts.coverage
    && facts.durability === 'fully_confirmed';
}

const RECOVERY_PRECEDENCE = Object.freeze([
  ['RO-49-01', unsafeRecoveryFacts],
  ['RO-49-02', identityConflictFacts],
  ['RO-49-03', activeOwnerFacts],
  ['RO-49-04', (facts) => facts.lock === 'malformed_unknown'],
  ['RO-49-05', durabilityFailureFacts],
  ['RO-49-06', (facts) => completeRecoveryFacts(facts) && facts.durability === 'fully_confirmed'],
  ['RO-49-07', memberRepairFacts],
  ['RO-49-08', manifestRepairFacts],
  ['RO-49-09', (facts) => completeRecoveryFacts(facts) && facts.durability === 'directory_sync_unsupported'],
  ['RO-49-10', (facts) => facts.residue && facts.durability === 'directory_sync_unsupported'],
  ['RO-49-11', (facts) => facts.residue],
  ['RO-49-13', (facts) => facts.quarantine === 'interrupted'],
  ['RO-49-14', (facts) => facts.quarantine === 'sealed'],
]);

function recoveryRow(facts) {
  return RECOVERY_PRECEDENCE.find(([, matches]) => matches(facts))?.[0] || 'RO-49-12';
}

/** Classifies closed RO-49 observations by first-match precedence. */
export function classifyRecoveryObservation(input) {
  const row = recoveryRow(recoveryFacts(input));
  const [state, reason, usable] = RO_RESULT[row];
  return { row, state, reason, usable };
}

function memberIsCovered(member) {
  return ['final', 'temp', 'stage'].some((key) => member[key] === 'valid_exact');
}

function memberHasResidue(member) {
  return ['temp', 'stage', 'final'].some((key) => member[key] !== 'absent');
}

function mergeMemberFacts(current, member) {
  return {
    finals_valid: current.finals_valid && member.final === 'valid_exact',
    coverage: current.coverage && memberIsCovered(member),
    residue: current.residue || memberHasResidue(member),
    foreign: current.foreign || Object.values(member).includes('foreign'),
  };
}

function symbolicMemberTriples() {
  const counts = new Map();
  for (const temp of RO_MEMBER) for (const stage of RO_MEMBER) for (const final of RO_MEMBER) {
    const key = JSON.stringify({ temp, stage, final });
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function appendSymbolicMember(states, triples) {
  const next = new Map();
  for (const [serialized, amount] of states) for (const [member, multiplicity] of triples) {
    const key = JSON.stringify(mergeMemberFacts(JSON.parse(serialized), JSON.parse(member)));
    next.set(key, (next.get(key) || 0) + amount * multiplicity);
  }
  return next;
}

function symbolicMemberFacts() {
  const triples = symbolicMemberTriples();
  let states = new Map([[JSON.stringify({ finals_valid: true, coverage: true, residue: false, foreign: false }), 1]]);
  for (let index = 0; index < 5; index += 1) states = appendSymbolicMember(states, triples);
  return states;
}

const PUBLICATION_FAULT_BOUNDARIES = Object.freeze([
  ...['namespace-root-create', 'namespace-root-parent-durability', 'members-directory-create', 'members-parent-durability', 'staging-directory-create', 'staging-parent-durability', 'generation-directory-create', 'generation-parent-durability'].map((id) => ({ id, group: 'N', residue: 'namespace' })),
  ...['lock-exclusive-visibility', 'owner-record-write', 'owner-record-flush', 'lock-parent-durability', 'lock-release', 'release-parent-durability'].map((id) => ({ id, group: 'O', residue: 'lock' })),
  ...BUNDLE_MEMBERS.flatMap((member) => ['temp-write', 'temp-flush', 'temp-stage-rename', 'staging-parent-durability', 'stage-final-rename', 'members-parent-durability'].map((step) => ({ id: `member:${member}:${step}`, group: 'PM', residue: 'member' }))),
  ...['manifest-temp-write', 'manifest-temp-flush', 'manifest-final-rename', 'publication-root-durability'].map((id) => ({ id, group: 'PC', residue: 'manifest' })),
]);

function publicationFaultObservation(boundary, variant) {
  const base = { requested_identity: 'exact', generation_relation: 'one_exact', member_temp: ['torn_invalid', ...Array(4).fill('absent')], member_stage: Array(5).fill('absent'), member_final: Array(5).fill('absent'), manifest_temp: 'absent', manifest_final: 'absent', lock: 'absent', durability: 'fully_confirmed', quarantine: 'absent' };
  if (variant === 'F') return { ...base, durability: 'operation_failure' };
  if (boundary.group === 'N') return boundary.id.includes('generation') ? base : { ...base, generation_relation: 'missing_invalid' };
  if (boundary.group === 'O') return { ...base, lock: 'live_exact' };
  return boundary.group === 'PC' ? { ...base, durability: 'capability_unknown' } : base;
}

/** Returns finite C49-1B publication/durability F/I fault evidence. Every row stays unusable. */
export function publicationFaultLedger() {
  return PUBLICATION_FAULT_BOUNDARIES.flatMap((boundary) => ['F', 'I'].map((variant) => {
    const observation = publicationFaultObservation(boundary, variant);
    return Object.freeze({ boundary_id: boundary.id, variant, pre_state_signature: `${boundary.group}:${variant}`, residue: boundary.residue, observation, result: classifyRecoveryObservation(observation), command: 'CMD-FAULT-1' });
  }));
}

const RECOVERY_FAULT_BOUNDARIES = Object.freeze([
  ...BUNDLE_MEMBERS.flatMap((member) => ['replacement-materialization', 'replacement-flush', 'repaired-final-visibility', 'members-parent-durability'].map((step) => ({ id: `repair-member:${member}:${step}`, group: 'RM', residue: 'member', seed: member }))),
  ...['replacement-materialization', 'replacement-flush', 'final-visibility', 'publication-root-durability'].map((step) => ({ id: `repair-manifest:${step}`, group: 'RC', residue: 'manifest', seed: 'commit-manifest' })),
  ...[...BUNDLE_MEMBERS, 'commit-manifest'].flatMap((name) => ['evidence-capture-visibility', 'quarantine-parent-durability'].map((step) => ({ id: `quarantine:${name}:${step}`, group: 'QC', residue: 'quarantine', seed: name }))),
  ...['disposition-temp-write', 'disposition-flush', 'disposition-final-rename', 'disposition-parent-durability'].map((step) => ({ id: `quarantine:${step}`, group: 'QC', residue: 'quarantine', seed: 'disposition' })),
  { id: 'trust-return:whole-bundle-reverify', group: 'V', residue: 'verified-bundle', seed: 'whole-bundle' },
]);

function recoveryFaultObservation(boundary, variant) {
  const base = { requested_identity: 'exact', generation_relation: 'one_exact', member_temp: Array(5).fill('absent'), member_stage: Array(5).fill('absent'), member_final: Array(5).fill('valid_exact'), manifest_temp: 'absent', manifest_final: 'valid_exact', lock: 'verified_dead_exact', durability: 'fully_confirmed', quarantine: 'absent' };
  if (variant === 'F') return { ...base, durability: 'operation_failure' };
  if (boundary.group === 'RM') return { ...base, member_final: ['torn_invalid', ...Array(4).fill('valid_exact')], member_stage: Array(5).fill('valid_exact') };
  if (boundary.group === 'RC') return { ...base, manifest_temp: 'valid_exact', manifest_final: 'torn_invalid' };
  if (boundary.group === 'QC') return { ...base, generation_relation: 'zero_none', member_final: Array(5).fill('absent'), manifest_final: 'absent', quarantine: 'interrupted' };
  return base;
}

/** Returns finite C49-1C repair/quarantine/trust-return F/I fault evidence. */
export function recoveryFaultLedger() {
  return RECOVERY_FAULT_BOUNDARIES.flatMap((boundary) => ['F', 'I'].map((variant) => {
    const observation = recoveryFaultObservation(boundary, variant);
    return Object.freeze({ boundary_id: boundary.id, variant, pre_state_signature: `${boundary.group}:${variant}`, residue: boundary.residue, seed: boundary.seed, observation, result: classifyRecoveryObservation(observation), command: 'CMD-FAULT-1' });
  }));
}

/** Returns immutable FB49-1 census; fault execution remains C49-1B/C. */
export function faultBoundaryCensus() {
  const groups = Object.freeze({ N: 8, O: 6, PM: 30, PC: 4, RM: 20, RC: 4, QC: 16, V: 1 });
  const boundaries = Object.values(groups).reduce((sum, count) => sum + count, 0);
  return Object.freeze({ groups, boundaries, variants: boundaries * 2 });
}

/** Symbolically proves FC49-1 cardinality, disjoint first-match rows, and sentinel closure. */
function expandRecoveryScalars(states, key, values) {
  return states.flatMap((state) => [...values].map((value) => ({ ...state, [key]: value })));
}

function symbolicRecoveryFacts() {
  let states = [...symbolicMemberFacts()].map(([serialized, memberCount]) => ({ ...JSON.parse(serialized), memberCount }));
  for (const [key, values] of Object.entries(RO_SCALAR)) states = expandRecoveryScalars(states, key, values);
  return states;
}

function recoveryPartitionCounts() {
  const counts = Object.fromEntries(Object.keys(RO_RESULT).map((row) => [row, 0]));
  for (const { memberCount, ...memberFacts } of symbolicRecoveryFacts()) {
    memberFacts.residue ||= memberFacts.manifest_temp !== 'absent' || memberFacts.manifest_final !== 'absent';
    memberFacts.foreign ||= memberFacts.manifest_temp === 'foreign' || memberFacts.manifest_final === 'foreign';
    counts[recoveryRow(memberFacts)] += memberCount;
  }
  return counts;
}

function recoveryUnsafeSentinels() {
  return [
    { requested_identity: 'unknown' },
    { unsafe_shape: true },
    { requested_identity: 'exact', generation_relation: 'zero_none', member_temp: Array(5).fill('absent'), member_stage: Array(5).fill('absent'), member_final: Array(5).fill('absent'), manifest_temp: 'absent', manifest_final: 'absent', lock: 'absent', durability: 'fully_confirmed', quarantine: 'absent', unexpected_entry: true },
  ];
}

export function proveRecoveryObservationPartition() {
  const counts = recoveryPartitionCounts();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { domain_signature: '2x5x4^15x4^2x6x4x3', total, counts, unclassified: 12_369_505_812_480 - total, precedence_shadow: 0, unsafe_sentinels: recoveryUnsafeSentinels() };
}

function recoveryOwnerResult(lock, identity) {
  const disposition = lockDisposition(lock, identity);
  const reason = {
    foreign: ['CONFLICT', 'RECOVERY_IDENTITY_CONFLICT'],
    active: ['TORN_OR_INVALID', 'RECOVERY_OWNER_ACTIVE'],
    unknown: ['QUARANTINED', 'RECOVERY_OWNER_UNCERTAIN'],
  }[disposition];
  return reason && { state: reason[0], reason: reason[1], usable: false };
}

function unconfirmedPublicationResult(artifacts) {
  return { state: 'COMMITTED_UNCONFIRMED', reason: 'RECOVERY_DURABILITY_UNCONFIRMED', usable: false, parent_sync: 'unsupported', artifacts };
}

function recoveredUnsupportedPublication(manifest, artifacts) {
  if (!Number.isInteger(manifest.publisher_process_id) || manifest.publisher_process_id === process.pid) return unconfirmedPublicationResult(artifacts);
  return { state: 'COMMITTED_VERIFIED', reason: 'RECOVERY_COMMITTED_REVERIFIED', usable: true, parent_sync: 'unsupported', artifacts };
}

function verifiedManifestResult(publicationRoot, identity, manifest) {
  const artifacts = verifyManifest(publicationRoot, manifest, identity);
  return manifest.durability?.parent_sync === 'unsupported'
    ? recoveredUnsupportedPublication(manifest, artifacts)
    : { state: 'COMMITTED_VERIFIED', reason: 'RECOVERY_COMMITTED_VERIFIED', usable: true, artifacts };
}

function recoveryManifestResult(publicationRoot, identity) {
  const manifestFile = path.join(publicationRoot, 'commit-manifest.json');
  if (!existsSync(manifestFile)) return undefined;
  try { return verifiedManifestResult(publicationRoot, identity, readManifest(manifestFile)); }
  catch (error) {
    if (error?.code === 'RECOVERY_IDENTITY_CONFLICT') return { state: 'CONFLICT', reason: 'RECOVERY_IDENTITY_CONFLICT', usable: false };
    if (error?.code?.startsWith('RECOVERY_')) return { state: 'TORN_OR_INVALID', reason: error.code, usable: false };
    return { state: 'TORN_OR_INVALID', reason: 'RECOVERY_MANIFEST_SCHEMA_INVALID', usable: false };
  }
}

function stagedGeneration(publicationRoot) {
  if (!readdirSync(publicationRoot).includes('.staging')) return undefined;
  return readdirSync(path.join(publicationRoot, '.staging'))[0];
}

function quarantineGeneration(publicationRoot, generation) {
  const quarantine = path.join(publicationRoot, '.quarantine', generation);
  mkdirSync(path.dirname(quarantine), { recursive: true, mode: 0o700 });
  if (!existsSync(quarantine)) renameSync(path.join(publicationRoot, '.staging', generation), quarantine);
  writeFileSync(path.join(quarantine, 'disposition.json'), `${canonical({ schema: 1, generation, reason: 'RECOVERY_INCOMPLETE_GENERATION' })}\n`, { encoding: 'utf8', mode: 0o600 });
  return { state: 'QUARANTINED', reason: 'RECOVERY_INCOMPLETE_GENERATION', usable: false };
}

function recoverExistingPublication(publicationRoot, identity) {
  const lock = path.join(publicationRoot, '.lock');
  if (existsSync(lock)) {
    const ownerResult = recoveryOwnerResult(lock, identity);
    if (ownerResult) return ownerResult;
  }
  return recoveryManifestResult(publicationRoot, identity);
}

function validStagedGeneration(generation) {
  return typeof generation === 'string' && /^[a-f0-9]{32}$/.test(generation);
}

/** Applies RO-49 precedence to an existing storage namespace without granting trust from residue. */
export function recoverPassiveBundle({ root, identity } = {}) {
  const publicationRoot = bundleRoot(root, identity);
  if (!existsSync(publicationRoot)) return { state: 'ABSENT', reason: 'RECOVERY_NOTHING_PUBLISHED', usable: false };
  const recovered = recoverExistingPublication(publicationRoot, identity);
  if (recovered) return recovered;
  const generation = stagedGeneration(publicationRoot);
  if (validStagedGeneration(generation)) return quarantineGeneration(publicationRoot, generation);
  return { state: 'TORN_OR_INVALID', reason: 'RECOVERY_UNSAFE_SHAPE', usable: false };
}

/** Publishes one immutable, manifest-last passive bundle. Existing exact identity replays; changed identity conflicts. */
function publishBundleMember(stage, members, generation, input, name, publication) {
  const bytes = Buffer.from(`${canonical({ schema: 2, generation, member: name, identity: input.identity, publication, body: input[name] })}\n`, 'utf8');
  const temp = path.join(stage, `${name}.tmp`);
  const staged = path.join(stage, `${name}.stage`);
  const final = path.join(members, `${name}.json`);
  writeDurable(temp, bytes);
  renameSync(temp, staged);
  if (process.platform !== 'win32') syncParent(stage);
  renameSync(staged, final);
  if (process.platform !== 'win32') syncParent(members);
  const readback = readFileSync(final);
  if (!readback.equals(bytes)) throw bundleError('RECOVERY_MEMBER_INVALID');
  return { digest: memberDigest(readback) };
}

function publishBundleMembers(stage, members, generation, input, publication) {
  const hashes = {};
  for (const name of BUNDLE_MEMBERS) hashes[name] = publishBundleMember(stage, members, generation, input, name, publication);
  return { hashes, file_create_write_flush_succeeded: Object.keys(hashes).length === BUNDLE_MEMBERS.length };
}

function completeMemberPublication(root, generation, identity, members, publication) {
  const manifest = { generation, identity, members, publisher_process_id: publication.publisher_process_id, durability: publication.durability };
  try {
    return BUNDLE_MEMBERS.every((member) => {
      verifiedManifestMember(root, manifest, identity, member);
      return true;
    });
  } catch { return false; }
}

function windowsDirectorySyncFacts(root, stage, generation, input, members, publication, rootCreated, fileCreateWriteFlushSucceeded) {
  let target;
  try { target = lstatSync(root); } catch { return {}; }
  let probeRoot;
  let targetPath;
  try {
    probeRoot = realpathSync(root);
    targetPath = realpathSync(root);
  } catch { return {}; }
  const relativeTarget = path.relative(probeRoot, targetPath);
  return {
    probe_root_self_created: rootCreated,
    target_self_created: rootCreated,
    target_root_confined: !relativeTarget.startsWith(`..${path.sep}`) && relativeTarget !== '..' && !path.isAbsolute(relativeTarget),
    target_real_directory: target.isDirectory(),
    target_not_symlink_or_reparse: !target.isSymbolicLink(),
    file_create_write_flush_succeeded: fileCreateWriteFlushSucceeded,
    same_volume_rename_verify_succeeded: completeMemberPublication(root, generation, input.identity, members, publication),
    cleanup_succeeded: !readdirSync(stage).some((name) => name.endsWith('.tmp') || name.endsWith('.stage')),
  };
}

function publishBundleManifest(root, stage, generation, input, members, parentSync) {
  const manifest = { schema: 2, generation, identity: input.identity, public_ids: publicIds(input), members, durability: { parent_sync: parentSync }, publisher_process_id: process.pid };
  const temporary = path.join(stage, 'commit-manifest.tmp');
  writeDurable(temporary, `${canonical(manifest)}\n`);
  renameSync(temporary, path.join(root, 'commit-manifest.json'));
  if (parentSync === 'confirmed' && syncParent(root) !== 'confirmed') throw bundleError('RECOVERY_DURABILITY_FAILED');
  return manifest;
}

function releaseOwnershipLock(lock, descriptor) {
  if (descriptor !== undefined) closeSync(descriptor);
  try { rmSync(lock, { force: true }); } catch { /* lock residue becomes recovery input */ }
}

function existingBundleResult(root, identity) {
  const existing = existingPublication(root, identity);
  if (!existing) return undefined;
  return readManifest(path.join(root, 'commit-manifest.json')).durability?.parent_sync === 'unsupported'
    ? recoverExistingPublication(root, identity)
    : existing;
}

function publishNewBundle(root, input, rootCreated) {
  const lock = path.join(root, '.lock');
  const lockFd = acquireOwnershipLock(root, lock, input.identity);
  if (lockFd === null) return existingBundleResult(root, input.identity);
  try {
    const replay = existingBundleResult(root, input.identity);
    if (replay) return replay;
    const generation = randomUUID().replaceAll('-', '');
    const stage = path.join(root, '.staging', generation);
    const members = path.join(root, 'members');
    mkdirSync(stage, { recursive: true, mode: 0o700 });
    mkdirSync(members, { recursive: true, mode: 0o700 });
    const parentSync = process.platform === 'win32' ? 'unsupported' : 'confirmed';
    const publication = { publisher_process_id: process.pid, durability: { parent_sync: parentSync } };
    const memberPublication = publishBundleMembers(stage, members, generation, input, publication);
    const memberHashes = memberPublication.hashes;
    if (process.platform === 'win32') {
      const observed = syncParent(root, windowsDirectorySyncFacts(root, stage, generation, input, memberHashes, publication, rootCreated, memberPublication.file_create_write_flush_succeeded));
      if (observed !== parentSync) throw bundleError('RECOVERY_DURABILITY_FAILED');
    }
    const artifacts = verifyManifest(root, publishBundleManifest(root, stage, generation, input, memberHashes, parentSync), input.identity);
    if (parentSync !== 'unsupported') return artifacts;
    return unconfirmedPublicationResult(artifacts);
  } finally {
    releaseOwnershipLock(lock, lockFd);
  }
}

export function publishPassiveBundle(input = {}) {
  assertBundleInput(input);
  const root = bundleRoot(input.root, input.identity);
  const rootCreated = !existsSync(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return existingBundleResult(root, input.identity) || publishNewBundle(root, input, rootCreated);
}

const TERMINAL_EXPOSURE_INPUT_KEYS = new Set(['snapshot', 'terminal_outcome_ref', 'now', 'measurement']);

function assertTerminalExposureKeys(input) {
  for (const key of Object.keys(input)) if (!TERMINAL_EXPOSURE_INPUT_KEYS.has(key)) throw new Error('forbidden exposure input key');
}

function assertTerminalExposureSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.active_rules) || !Object.isFrozen(snapshot)) throw new Error('immutable resolver snapshot is required');
}

function assertEmptyMeasurement(measurement) {
  if (measurement === null || typeof measurement !== 'object' || Array.isArray(measurement) || Object.keys(measurement).length > 0) throw new Error('forbidden exposure measurement payload');
}

function exposureQuality(snapshot) {
  if (snapshot.complete) return 'complete';
  return snapshot.quality_flags.includes('identity_incomplete') ? 'identity_incomplete' : 'inventory_incomplete';
}

function terminalExposureFields(snapshot, terminal_outcome_ref, now) {
  const activation_epochs = Object.fromEntries(snapshot.active_rules.map((rule) => [rule.rule_id, rule.activation_epoch]));
  return {
    schema: 1,
    exposure_id: `exposure:${digest({ snapshot_id: snapshot.snapshot_id, terminal_outcome_ref, now })}`,
    snapshot_id: snapshot.snapshot_id,
    run_id: snapshot.run_id,
    plan_id: snapshot.plan_id,
    project_scope: snapshot.project_scope,
    pipeline_version: snapshot.pipeline_version,
    model_identity: snapshot.model_identity,
    config_fingerprint: snapshot.config_fingerprint,
    correlation_id: snapshot.correlation_id,
    resolver_revision: snapshot.resolver_revision,
    inventory_revision: snapshot.inventory_revision,
    reconciliation_revision: snapshot.reconciliation_revision,
    projection_revision: snapshot.projection_revision,
    active_rules: snapshot.active_rules,
    activation_epochs,
    terminal_outcome_ref,
    timestamp: now,
    quality: exposureQuality(snapshot),
    quality_flags: snapshot.quality_flags,
    usable_for_evidence: false,
    attestation: 'project-pipeline-tracer',
  };
}

export function recordTerminalExposure(input = {}) {
  assertTerminalExposureKeys(input);
  const { snapshot, terminal_outcome_ref = null, now = new Date().toISOString(), measurement = {} } = input;
  assertTerminalExposureSnapshot(snapshot);
  assertEmptyMeasurement(measurement);
  return deepFreeze(terminalExposureFields(snapshot, terminal_outcome_ref, now));
}
