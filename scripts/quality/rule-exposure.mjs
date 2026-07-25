import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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

function syncParent(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, 'r');
    fsyncSync(descriptor);
    return 'confirmed';
  } catch (error) {
    if (['EINVAL', 'ENOTSUP', 'EPERM', 'EISDIR'].includes(error?.code)) return 'unsupported';
    throw bundleError('RECOVERY_DURABILITY_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validBundleRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownBundleKeys(input) {
  for (const key of Object.keys(input)) if (!BUNDLE_INPUT_KEYS.has(key)) throw bundleError('PASSIVE_SCHEMA_UNKNOWN_KEY');
}

function assertBundleMembers(input) {
  for (const member of BUNDLE_MEMBERS) if (!validBundleRecord(input[member])) throw bundleError('PASSIVE_SCHEMA_MEMBER_REQUIRED');
}

function validBundleSchemas(reconciliation, snapshot, exposure, identity) {
  return reconciliation.schema === 1 && snapshot.schema === 1 && exposure.schema === 1 && validBundleRecord(identity);
}

function validBundleIdentifier(value, prefix) {
  return new RegExp(`^${prefix}:[a-f0-9]{64}$`).test(value || '');
}

function matchingBundleIdentity(snapshot, exposure, identity) {
  return identity.reconciliation_revision === snapshot.reconciliation_revision
    && identity.snapshot_id === snapshot.snapshot_id
    && identity.exposure_id === exposure.exposure_id;
}

function validBundleLinks(reconciliation, snapshot, exposure, identity) {
  if (!validBundleIdentifier(reconciliation.reconciliation_id, 'reconciliation')) return false;
  if (!validBundleIdentifier(snapshot.snapshot_id, 'snapshot')) return false;
  if (!validBundleIdentifier(exposure.exposure_id, 'exposure')) return false;
  if (exposure.snapshot_id !== snapshot.snapshot_id) return false;
  return matchingBundleIdentity(snapshot, exposure, identity);
}

function assertBundleInput(input) {
  if (!validBundleRecord(input)) throw bundleError('PASSIVE_SCHEMA_INVALID');
  assertKnownBundleKeys(input);
  assertBundleMembers(input);
  const { reconciliation, snapshot, exposure, identity } = input;
  if (!validBundleSchemas(reconciliation, snapshot, exposure, identity)) throw bundleError('PASSIVE_SCHEMA_INVALID');
  if (!validBundleLinks(reconciliation, snapshot, exposure, identity)) throw bundleError('PASSIVE_SCHEMA_LINK_INVALID');
}

function publicIds(input) {
  return {
    reconciliation_id: input.reconciliation.reconciliation_id,
    snapshot_id: input.snapshot.snapshot_id,
    exposure_id: input.exposure.exposure_id,
  };
}

function readManifest(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw bundleError('RECOVERY_INCOMPLETE_GENERATION'); }
}

function manifestHasStructure(manifest) {
  return Boolean(manifest)
    && manifest.schema === 1
    && /^[a-f0-9]{32}$/.test(manifest.generation || '')
    && Boolean(manifest.members)
    && typeof manifest.members === 'object';
}

function manifestMatchesIdentity(manifest, identity) {
  return canonical(manifest.identity) === canonical(identity);
}

function validManifestMemberDigest(expected) {
  return Boolean(expected) && typeof expected.digest === 'string';
}

function manifestMemberContent(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function manifestMemberMatches(content, manifest, identity) {
  try {
    const parsed = JSON.parse(content);
    return parsed.generation === manifest.generation && manifestMatchesIdentity(parsed, identity);
  } catch {
    return false;
  }
}

function verifiedManifestMember(root, manifest, identity, member) {
  const expected = manifest.members[member];
  if (!validManifestMemberDigest(expected)) return false;
  const content = manifestMemberContent(path.join(root, 'members', `${member}.json`));
  if (content === null || bundleDigest(content) !== expected.digest) return false;
  return manifestMemberMatches(content, manifest, identity);
}

function verifyManifest(root, manifest, identity) {
  if (!manifestHasStructure(manifest) || !manifestMatchesIdentity(manifest, identity)) throw bundleError('CONFLICT_IDENTITY');
  for (const member of BUNDLE_MEMBERS) if (!verifiedManifestMember(root, manifest, identity, member)) throw bundleError('RECOVERY_INCOMPLETE_GENERATION');
  return manifest.public_ids;
}

function existingPublication(root, identity) {
  const manifest = path.join(root, 'commit-manifest.json');
  if (!existsSync(manifest)) return undefined;
  return verifyManifest(root, readManifest(manifest), identity);
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

function recoveryManifestResult(publicationRoot, identity) {
  const manifest = path.join(publicationRoot, 'commit-manifest.json');
  if (!existsSync(manifest)) return undefined;
  try {
    const artifacts = verifyManifest(publicationRoot, readManifest(manifest), identity);
    return { state: 'COMMITTED_VERIFIED', reason: 'RECOVERY_COMMITTED_VERIFIED', usable: true, artifacts };
  } catch (error) {
    if (error?.code === 'CONFLICT_IDENTITY') return { state: 'CONFLICT', reason: 'RECOVERY_IDENTITY_CONFLICT', usable: false };
    return undefined;
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
function publishBundleMember(stage, members, generation, input, name) {
  const content = `${canonical({ schema: 1, generation, identity: input.identity, body: input[name] })}\n`;
  const temp = path.join(stage, `${name}.tmp`);
  const staged = path.join(stage, `${name}.stage`);
  writeDurable(temp, content);
  renameSync(temp, staged);
  syncParent(stage);
  renameSync(staged, path.join(members, `${name}.json`));
  syncParent(members);
  return { digest: bundleDigest(content) };
}

function publishBundleMembers(stage, members, generation, input) {
  const hashes = {};
  for (const name of BUNDLE_MEMBERS) hashes[name] = publishBundleMember(stage, members, generation, input, name);
  return hashes;
}

function publishBundleManifest(root, stage, generation, input, members) {
  const manifest = { schema: 1, generation, identity: input.identity, public_ids: publicIds(input), members, durability: { parent_sync: 'confirmed' } };
  const temporary = path.join(stage, 'commit-manifest.tmp');
  writeDurable(temporary, `${canonical(manifest)}\n`);
  renameSync(temporary, path.join(root, 'commit-manifest.json'));
  if (syncParent(root) !== 'confirmed') throw bundleError('RECOVERY_DURABILITY_UNCONFIRMED');
  return manifest;
}

function releaseOwnershipLock(lock, descriptor) {
  if (descriptor !== undefined) closeSync(descriptor);
  try { rmSync(lock, { force: true }); } catch { /* lock residue becomes recovery input */ }
}

export function publishPassiveBundle(input = {}) {
  assertBundleInput(input);
  const root = bundleRoot(input.root, input.identity);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const existing = existingPublication(root, input.identity);
  if (existing) return existing;
  const lock = path.join(root, '.lock');
  const lockFd = acquireOwnershipLock(root, lock, input.identity);
  if (lockFd === null) return existingPublication(root, input.identity);
  try {
    const replay = existingPublication(root, input.identity);
    if (replay) return replay;
    const generation = randomUUID().replaceAll('-', '');
    const stage = path.join(root, '.staging', generation);
    const members = path.join(root, 'members');
    mkdirSync(stage, { recursive: true, mode: 0o700 });
    mkdirSync(members, { recursive: true, mode: 0o700 });
    const memberHashes = publishBundleMembers(stage, members, generation, input);
    return verifyManifest(root, publishBundleManifest(root, stage, generation, input, memberHashes), input.identity);
  } finally {
    releaseOwnershipLock(lock, lockFd);
  }
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
