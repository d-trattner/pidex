import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { resolveStateRoot } from '../../../analysis-metrics-history/lib/state-root.mjs';
import { reconcileRuleInventory } from '../../../../../scripts/quality/rule-inventory.mjs';
import { createActivationEpochCatalog, publishPassiveBundle, publishRuleSnapshot, recordTerminalExposure, recoverPassiveBundle } from '../../../../../scripts/quality/rule-exposure.mjs';
import { captureRuleImpactFanout } from '../../../../../scripts/quality/rule-impact-results.mjs';
import { runRuleImpactCadence } from '../../../../../scripts/quality/rule-impact-cadence.mjs';
import { openRuleLifecycleStore } from '../../../../../scripts/quality/rule-lifecycle-store.mjs';

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function nullableIdentityValue(value) { return value || null; }

function runIdentity(run, terminal_outcome_ref) {
  return {
    run_id: run.run_id,
    plan_id: nullableIdentityValue(run.plan_id),
    project_scope: nullableIdentityValue(run.project_scope),
    pipeline_version: nullableIdentityValue(run.pipeline_version),
    model_identity: nullableIdentityValue(run.model_identity),
    config_fingerprint: nullableIdentityValue(run.config_fingerprint),
    correlation_id: nullableIdentityValue(run.correlation_id),
    terminal_outcome_ref: nullableIdentityValue(terminal_outcome_ref),
  };
}

function reconciliationArtifact(inventory) {
  if (!inventory.complete) return null;
  const body = {
    schema: 1,
    reconciliation_revision: inventory.reconciliation_revision,
    inventory_count: inventory.entries.length,
    inventory_digest: inventory.inventory_digest,
  };
  const reconciliation_id = `reconciliation:${digest(body)}`;
  return { ...body, reconciliation_id, artifact_id: reconciliation_id };
}

function terminalEpochCatalog(inventory) {
  return createActivationEpochCatalog(Object.fromEntries(inventory.entries.map((rule) => [
    `${rule.rule_id}\0${rule.version_hash}`,
    `epoch:${digest({ rule_id: rule.rule_id, version_hash: rule.version_hash }).slice(0, 24)}`,
  ])));
}

function deterministicTerminalTime(identity) {
  const milliseconds = Number.parseInt(digest(identity).slice(0, 12), 16) % 253402300799999;
  return new Date(milliseconds).toISOString();
}

function publicationIdentity(identity, snapshot, exposure) {
  return {
    run_id: identity.run_id,
    terminal_outcome_ref: identity.terminal_outcome_ref,
    reconciliation_revision: snapshot.reconciliation_revision,
    snapshot_id: snapshot.snapshot_id,
    exposure_id: exposure.exposure_id,
  };
}

function publishCompleteBundle({ pidexRoot, identity, reconciliation, snapshot, exposure, epoch, env }) {
  const publication = publicationIdentity(identity, snapshot, exposure);
  const recovered = recoverPassiveBundle({ root: pidexRoot, identity: publication, env });
  if (recovered.state === 'COMMITTED_VERIFIED' || recovered.state === 'COMMITTED_UNCONFIRMED') return recovered;
  if (recovered.state !== 'ABSENT') throw new Error(recovered.reason === 'RECOVERY_IDENTITY_CONFLICT' ? 'CONFLICT_IDENTITY' : recovered.reason);
  return publishPassiveBundle({
    root: pidexRoot,
    reconciliation,
    snapshot,
    exposure,
    epoch: { schema: 1, epochs: epoch },
    catalog_contribution: { schema: 1, entries: snapshot.active_rules },
    identity: publication,
    env,
  });
}

function publicationArtifacts(publication) {
  return publication?.artifacts || publication;
}

function publicationState(publication) {
  return publication?.state || 'COMMITTED_VERIFIED';
}

function legacyRuntimeFacts({ pidexRoot, projectRoot, gitTrackedPaths, run }) {
  const exactProjectRoot = path.resolve(projectRoot || pidexRoot);
  const projectScopeId = createHash('sha256').update(exactProjectRoot).digest('hex').slice(0, 24);
  const inventory = reconcileRuleInventory({ root: pidexRoot, projectRoot: exactProjectRoot, projectScopeId, gitTrackedPaths });
  const reconciliation = reconciliationArtifact(inventory);
  const epoch = terminalEpochCatalog(inventory);
  const snapshot = publishRuleSnapshot({
    inventory,
    resolver_revision: '045-S1-project-pipeline-tracer',
    projection_revision: 'none',
    run,
    epochCatalog: epoch,
    reconciliationArtifact: reconciliation,
  });
  return { inventory, reconciliation, epoch, snapshot, attestation: 'non_attested' };
}

function suppliedRuntimeFacts(runtimeContext) {
  const passive = runtimeContext?.passive_exposure_input;
  const exactPassiveKeys = ['inventory_identity', 'epoch_catalog', 'reconciliation_artifact', 'rule_snapshot'];
  if (runtimeContext?.schema !== 'pidex-rule-runtime-context-v1' || !runtimeContext.pipeline_id || !passive || Object.keys(passive).length !== exactPassiveKeys.length || !exactPassiveKeys.every((key) => Object.hasOwn(passive, key)) || !passive.inventory_identity || !passive.epoch_catalog || !passive.reconciliation_artifact || !passive.rule_snapshot) throw new Error('RULE_RUNTIME_CONTEXT_INVALID');
  return { inventory: passive.inventory_identity, reconciliation: passive.reconciliation_artifact, epoch: passive.epoch_catalog, snapshot: passive.rule_snapshot, attestation: 'attested' };
}

// Plan048 Windows reattestation witness: strict local named-file/manifest read-back (bounded reads: manifest + 5 members; never trusts state string; exact identity/member-digest/schema, symlink/reparse/containment, tamper, torn: fail closed).
const WITNESS_MEMBERS = Object.freeze(['reconciliation', 'snapshot', 'exposure', 'epoch', 'catalog_contribution']);
function witnessCanonical(value) { return Array.isArray(value) ? `[${value.map(witnessCanonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${witnessCanonical(value[key])}`).join(',')}}` : JSON.stringify(value); }
function witnessError(code) { const error = new Error(code); error.code = code; return error; }
function witnessRoot(root, identity, env) { return path.join(resolveStateRoot({ root: path.resolve(root), env }), 'quality', 'rule-exposure', createHash('sha256').update(witnessCanonical({ run_id: identity.run_id })).digest('hex')); }
function confinedRegularFile(file, root, code) { let stat; try { stat = lstatSync(file); } catch { throw witnessError(code); } if (stat.isSymbolicLink() || !stat.isFile() || realpathSync(file) !== path.join(realpathSync(root), path.relative(root, file))) throw witnessError(code); }
function witnessStrictBytes(bytes, code) { let parsed; try { const content = bytes.toString('utf8'); parsed = JSON.parse(content); if (content !== `${witnessCanonical(parsed)}\n`) throw witnessError(code); } catch { throw witnessError(code); } return parsed; }
function witnessExact(value, keys) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && witnessCanonical(Object.keys(value).sort()) === witnessCanonical([...keys].sort()); }
function witnessManifest(publicationRoot, identity) { const manifest = witnessStrictJson(path.join(publicationRoot, 'commit-manifest.json'), 'RECOVERY_MANIFEST_SCHEMA_INVALID'); if (!witnessExact(manifest, ['schema', 'generation', 'identity', 'public_ids', 'members', 'durability', 'publisher_process_id']) || manifest.schema !== 2 || !/^[a-f0-9]{32}$/.test(manifest.generation) || witnessCanonical(manifest.identity) !== witnessCanonical(identity) || !witnessExact(manifest.public_ids, ['reconciliation_id', 'snapshot_id', 'exposure_id']) || !['reconciliation_id', 'snapshot_id', 'exposure_id'].every((key) => new RegExp(`^${key.replace('_id', '')}:[a-f0-9]{64}$`).test(manifest.public_ids[key])) || !witnessExact(manifest.members, WITNESS_MEMBERS) || WITNESS_MEMBERS.some((member) => !witnessExact(manifest.members[member], ['digest']) || !/^[a-f0-9]{64}$/.test(manifest.members[member].digest)) || !witnessExact(manifest.durability, ['parent_sync']) || !['confirmed', 'unsupported'].includes(manifest.durability.parent_sync) || !Number.isInteger(manifest.publisher_process_id) || manifest.publisher_process_id <= 0) throw witnessError('RECOVERY_MANIFEST_SCHEMA_INVALID'); return manifest; }
function witnessStrictJson(file, code) { return witnessStrictBytes(readFileSync(file), code); }
function witnessMember(publicationRoot, manifest, identity, member) { const file = path.join(publicationRoot, 'members', `${member}.json`); if (!existsSync(file)) throw witnessError('RECOVERY_MEMBER_INVALID'); confinedRegularFile(file, publicationRoot, 'RECOVERY_MEMBER_UNSAFE_PATH'); const bytes = readFileSync(file); if (createHash('sha256').update(bytes).digest('hex') !== manifest.members[member].digest) throw witnessError('RECOVERY_MEMBER_INVALID'); const envelope = witnessStrictBytes(bytes, 'RECOVERY_MEMBER_INVALID'); if (!witnessExact(envelope, ['schema', 'generation', 'member', 'identity', 'publication', 'body']) || envelope.schema !== 2 || envelope.generation !== manifest.generation || envelope.member !== member || witnessCanonical(envelope.identity) !== witnessCanonical(identity) || !witnessExact(envelope.publication, ['durability', 'publisher_process_id']) || envelope.publication.publisher_process_id !== manifest.publisher_process_id || !witnessExact(envelope.publication.durability, ['parent_sync']) || envelope.publication.durability.parent_sync !== manifest.durability.parent_sync) throw witnessError('RECOVERY_MEMBER_INVALID'); }
/** Windows durability-unconfirmable reattestation: independent named-file/manifest read-back; never trusts the state string; every path violation fails closed. */
export function verifyPublicationWitness({ root, identity, env = process.env } = {}) {
  const publicationRoot = witnessRoot(root, identity, env); if (!existsSync(path.join(publicationRoot, 'commit-manifest.json'))) return { verified: false, reason: 'RECOVERY_NOTHING_PUBLISHED' };  try { confinedRegularFile(path.join(publicationRoot, 'commit-manifest.json'), publicationRoot, 'RECOVERY_MANIFEST_UNSAFE_PATH'); const manifest = witnessManifest(publicationRoot, identity); WITNESS_MEMBERS.forEach((member) => witnessMember(publicationRoot, manifest, identity, member)); return { verified: true, parent_sync: manifest.durability.parent_sync }; } catch (error) { return { verified: false, reason: error?.code || 'RECOVERY_MANIFEST_SCHEMA_INVALID' }; }
}
function authorityState(publication, witness) { return publicationState(publication) === 'COMMITTED_UNCONFIRMED' && witness?.verified ? 'COMMITTED_WITNESSED' : publicationState(publication); }

function impactAuthority({ runtimeContext, facts, identity, exposure, publication, artifacts, witness } = {}) {
  const resolver = runtimeContext?.resolver_snapshot;
  if (!resolver || resolver.schema !== 'pidex-rule-resolver-snapshot-v1' || resolver.quality !== 'verified' || !Array.isArray(resolver.active_rules) || !resolver.active_rules.length || typeof resolver.scope_id !== 'string' || !resolver.projection_revision || !resolver.source_heads || !resolver.mirror_heads) return undefined;
  const target = resolver.active_rules[0];
  if (!target?.activation_epoch) return undefined;
  const resolver_snapshot_bytes = JSON.stringify(resolver);
  const fresh_runtime = { schema: 'pidex-rule-runtime-context-v1', pipeline_id: runtimeContext.pipeline_id, input_digests: runtimeContext.input_digests, supplied_context_attestation: 'attested', resolver_snapshot_bytes, resolver_snapshot_digest: createHash('sha256').update(resolver_snapshot_bytes).digest('hex') };
  return {
    captured_at: exposure.timestamp,
    exposure_publication: { run_id: identity.run_id, terminal_outcome_ref: identity.terminal_outcome_ref, reconciliation_revision: facts.reconciliation.reconciliation_revision, snapshot_id: resolver.snapshot_id, exposure_id: exposure.exposure_id, publication_digest: digest({ identity, artifacts, publication_state: authorityState(publication, witness) }), publication_state: authorityState(publication, witness) },
    fresh_runtime,
    resolver_boundary: { target_rule: target, active_rules: resolver.active_rules, non_target_rules: resolver.active_rules.filter((candidate) => candidate.rule_id !== target.rule_id || candidate.version_hash !== target.version_hash).map(({ rule_id, version_hash }) => ({ rule_id, version_hash })), source_heads: resolver.source_heads, mirror_heads: resolver.mirror_heads, scope_id: resolver.scope_id, projection_revision: resolver.projection_revision, activation_epoch: target.activation_epoch, runtime_digest: digest(fresh_runtime) },
  };
}

function captureImpact({ stateRoot, impactStore, impactCapture = captureRuleImpactFanout, authority, measurement }) {
  if (!stateRoot) return { status: 'unavailable', reason: 'state_root_unavailable' };
  let store = impactStore; let closeStore = false;
  try {
    if (!store) { store = openRuleLifecycleStore({ stateRoot }); closeStore = true; }
    const captured = impactCapture({ stateRoot, store, authority, measurement });
    if (captured?.outcome === 'success') return { status: 'captured', target_count: captured.target_input_ids.length, fanout_digest: digest(captured.target_input_ids), target_input_ids: captured.target_input_ids };
    return { status: 'blocked', reason: captured?.outcome || 'storage_unavailable' };
  } catch { return { status: 'unavailable', reason: 'capture_unavailable' }; }
  finally { if (closeStore) try { store.close(); } catch {} }
}

export function verifyPlan042Preservation({ root, protectedPaths, operation } = {}) {
  if (!root || !Array.isArray(protectedPaths) || typeof operation !== 'function') throw new Error('root, protectedPaths, and operation are required');
  const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const before = Object.fromEntries(protectedPaths.map((file) => [file, sha256(file)]));
  operation();
  const after = Object.fromEntries(protectedPaths.map((file) => [file, sha256(file)]));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('PLAN_042_PRESERVATION_FAILED');
  return { ok: true, before, after };
}

/** Records unchanged terminal exposure, then independently captures attested impact input. */
export function traceProjectPipelineExposure({ pidexRoot, projectRoot, runtimeContext, run, terminal_outcome_ref, gitTrackedPaths, env = process.env, stateRoot, impactStore, impactCapture, impactCadence = runRuleImpactCadence, producerPublicationReference } = {}) {
  if (!pidexRoot || !run?.run_id) throw new Error('pidexRoot and run.run_id are required');
  const identity = runIdentity(run, terminal_outcome_ref);
  const facts = runtimeContext === undefined
    ? legacyRuntimeFacts({ pidexRoot, projectRoot, gitTrackedPaths, run })
    : suppliedRuntimeFacts(runtimeContext);
  const exposure = recordTerminalExposure({ snapshot: facts.snapshot, terminal_outcome_ref, now: deterministicTerminalTime(identity) });
  const publication = facts.reconciliation
    ? publishCompleteBundle({ pidexRoot, identity, reconciliation: facts.reconciliation, snapshot: facts.snapshot, exposure, epoch: facts.epoch, env })
    : undefined;
  const artifacts = publicationArtifacts(publication) || { reconciliation_id: null, snapshot_id: facts.snapshot.snapshot_id, exposure_id: exposure.exposure_id };
  const state_root_class = (env?.PIDEX_STATE_DIR || env?.RUNNING_PI_STATE_DIR) ? 'external' : 'default';
  const usable_for_evidence = facts.attestation === 'attested' && facts.snapshot.complete === true;
  let cadenceStore = impactStore; let closeCadenceStore = false; let captured; let publication_witness;
  try {
    const publication_state = publicationState(publication);
    if (publication_state === 'COMMITTED_UNCONFIRMED') {
      const readback = verifyPublicationWitness({ root: pidexRoot, identity: publicationIdentity(identity, facts.snapshot, exposure), env });
      publication_witness = { kind: 'named_file_readback', verified: readback.verified, ...(readback.verified ? { parent_sync: readback.parent_sync } : { reason: readback.reason }) };
    } else publication_witness = publication === undefined ? { kind: 'none', verified: false } : publication_state === 'COMMITTED_VERIFIED' ? { kind: 'recovery_verified', verified: true } : { kind: 'none', verified: false };
    if (publication === undefined) captured = { status: 'blocked', reason: 'runtime_unattested' };
    else if (publication_state !== 'COMMITTED_VERIFIED' && publication_state !== 'COMMITTED_UNCONFIRMED') captured = { status: 'blocked', reason: 'publication_unverified' };
    else if (!publication_witness.verified) captured = { status: 'blocked', reason: 'publication_witness_failed' };
    else if (!usable_for_evidence) captured = { status: 'blocked', reason: 'runtime_unattested' };
    else {
      if (!cadenceStore && stateRoot) { cadenceStore = openRuleLifecycleStore({ stateRoot }); closeCadenceStore = true; }
      const authority = impactAuthority({ runtimeContext, facts, identity, exposure, publication, artifacts, witness: publication_witness });
      const verifiedProducer = cadenceStore?.readVerifiedProducerPublication?.({ reference: producerPublicationReference });
      const verifiedMeasurement = verifiedProducer?.outcome === 'available' ? verifiedProducer.measurement : {};
      captured = authority ? captureImpact({ stateRoot, impactStore: cadenceStore, impactCapture, authority, measurement: verifiedMeasurement }) : { status: 'blocked', reason: 'resolver_invalid' };
    }
    const impact_capture = captured?.status === 'captured'
      ? { status: 'captured', target_count: captured.target_count, fanout_digest: captured.fanout_digest }
      : captured;
    let impact_cadence;
    try {
      impact_cadence = impactCadence({ ordinary: true, stateRoot, store: cadenceStore, publicationIdentity: { exposure_id: exposure.exposure_id, publication_digest: impactAuthority({ runtimeContext, facts, identity, exposure, publication, artifacts, witness: publication_witness })?.exposure_publication?.publication_digest }, currentAuthorityProvider: () => Object.freeze({ resolver_snapshot: runtimeContext?.resolver_snapshot }), capture: { status: impact_capture?.status, target_input_ids: captured?.target_input_ids } });
    } catch { impact_cadence = { status: 'unavailable', reason: 'cadence_unavailable' }; }
    return { inventory: facts.inventory, reconciliation: facts.reconciliation, snapshot: facts.snapshot, exposure, artifacts, publication, state_root_class, attestation: facts.attestation, usable_for_evidence, impact_capture, impact_cadence, publication_witness };
  } finally { if (closeCadenceStore) try { cadenceStore.close(); } catch {} }
}

// ---- Plan048 Slice3B/4: closed lifecycle-action invocation seam. Global and project tiers
// share one kill switch env, one availability gate, and one sanitized outcome shape. ----
const ACTION_DIGEST = /^[a-f0-9]{64}$/;
const ACTION_CORRELATION = /^action:[a-f0-9]{64}$/;
const ACTION_REASON = /^[a-z_]+$/;
const ACTION_CURRENT_RULE = /^(?:pidex-global|project:[a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/** Closed fake-only history adapter: an ordinary seam has no remote authority unless an enrolled adapter is explicitly supplied elsewhere. */
export function closedLifecycleActionHistoryAdapter() {
  const unavailable = () => null;
  return Object.freeze({ fetchExpected: unavailable, fetchObserved: unavailable, postPushObserve: unavailable, remoteUrl: unavailable });
}
function sanitizedLifecycleActionOutcome(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return Object.freeze({ status: 'no_op', reason: 'action_unavailable' });
  const status = typeof record.status === 'string' && record.status ? record.status : 'no_op';
  const reason = typeof record.reason === 'string' && ACTION_REASON.test(record.reason) ? record.reason : 'action_unavailable';
  const correlation_id = typeof record.correlation_id === 'string' && ACTION_CORRELATION.test(record.correlation_id) ? record.correlation_id : undefined;
  return Object.freeze({ status, reason, ...(correlation_id ? { correlation_id } : {}) });
}

/** One kill-switch-gated lifecycle action invocation from an ordinary terminal result; identical sanitized shape for both tiers. */
export function invokeLifecycleActionFromOrdinaryResult({ store, result_bytes, result_digest, current, env = process.env, now, trace } = {}) {
  if (!env || !env.PIDEX_LIFECYCLE_ACTION_ENABLED) return Object.freeze({ status: 'no_op', reason: 'kill_switch' });
  if (!store || typeof store.persistLifecycleActionIntent !== 'function') return Object.freeze({ status: 'no_op', reason: 'action_unavailable' });
  if (!Buffer.isBuffer(result_bytes) || !ACTION_DIGEST.test(result_digest || '') || !current || typeof current !== 'object' || Array.isArray(current) || (current.tier !== 'global' && current.tier !== 'project') || typeof current.rule_id !== 'string' || !ACTION_CURRENT_RULE.test(current.rule_id)) return Object.freeze({ status: 'no_op', reason: 'action_unavailable' });
  if (typeof trace !== 'function') return Object.freeze({ status: 'no_op', reason: 'action_unavailable' });
  let outcome;
  try { outcome = trace({ store, result_bytes, result_digest, current, now, history: { adapter: closedLifecycleActionHistoryAdapter(), remote_head: current.accepted_commit || null, bound_from: current.accepted_commit || null, max_commits: 64 } }); } catch { return Object.freeze({ status: 'no_op', reason: 'action_unavailable' }); }
  return sanitizedLifecycleActionOutcome(outcome);
}
