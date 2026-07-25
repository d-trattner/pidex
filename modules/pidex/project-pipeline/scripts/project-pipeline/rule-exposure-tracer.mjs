import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { reconcileRuleInventory } from '../../../../../scripts/quality/rule-inventory.mjs';
import { createActivationEpochCatalog, publishPassiveBundle, publishRuleSnapshot, recordTerminalExposure, recoverPassiveBundle } from '../../../../../scripts/quality/rule-exposure.mjs';

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

function publishCompleteBundle({ pidexRoot, identity, reconciliation, snapshot, exposure, epoch }) {
  const publication = publicationIdentity(identity, snapshot, exposure);
  const recovered = recoverPassiveBundle({ root: pidexRoot, identity: publication });
  if (recovered.state === 'COMMITTED_VERIFIED') return recovered.artifacts;
  if (recovered.state !== 'ABSENT') throw new Error(recovered.reason === 'RECOVERY_IDENTITY_CONFLICT' ? 'CONFLICT_IDENTITY' : recovered.reason);
  return publishPassiveBundle({
    root: pidexRoot,
    reconciliation,
    snapshot,
    exposure,
    epoch: { schema: 1, epochs: epoch },
    catalog_contribution: { schema: 1, entries: snapshot.active_rules },
    identity: publication,
  });
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

/** Adapts terminal facts to accepted manifest-last passive bundle authority. */
export function traceProjectPipelineExposure({ pidexRoot, run, terminal_outcome_ref, gitTrackedPaths } = {}) {
  if (!pidexRoot || !run?.run_id) throw new Error('pidexRoot and run.run_id are required');
  const identity = runIdentity(run, terminal_outcome_ref);
  const inventory = reconcileRuleInventory({ root: pidexRoot, projectRoot: pidexRoot, gitTrackedPaths });
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
  const exposure = recordTerminalExposure({ snapshot, terminal_outcome_ref, now: deterministicTerminalTime(identity) });
  const artifacts = reconciliation
    ? publishCompleteBundle({ pidexRoot, identity, reconciliation, snapshot, exposure, epoch })
    : { reconciliation_id: null, snapshot_id: snapshot.snapshot_id, exposure_id: exposure.exposure_id };
  return { inventory, reconciliation, snapshot, exposure, artifacts };
}
