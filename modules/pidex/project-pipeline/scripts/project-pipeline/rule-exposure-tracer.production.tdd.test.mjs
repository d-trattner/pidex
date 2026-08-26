import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { traceProjectPipelineExposure } from './rule-exposure-tracer.mjs';
import { createActivationEpochCatalog } from '../../../../../scripts/quality/rule-exposure.mjs';
import { captureRuleImpactFanout } from '../../../../../scripts/quality/rule-impact-results.mjs';
import { openRuleLifecycleStore } from '../../../../../scripts/quality/rule-lifecycle-store.mjs';
import { policyDigest, policyForTier } from '../../../../../scripts/quality/rule-impact-policy.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const contract = JSON.stringify({ contract_id: 'contract:1', contract_version: '1', created_at: '2026-04-01T00:00:00.000Z', valid_from: '2026-04-02T00:00:00.000Z', outcome_definition_id: 'latency', outcome_definition_version: '1', dimensions: [{ id: 'latency', role: 'primary', extractor_id: 'extractor', extractor_version: '1', value_type: 'continuous', unit: 'ms', valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true, adverse_direction: 'higher', absolute_materiality: 1, required_raw_covariates: ['load'] }], raw_covariates: [{ id: 'load', unit: 'requests', valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true, bins: [{ bin_id: 'load:normal', ordinal: 0, valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true }] }] });

function targetFor(tier) {
  return { rule_id: `pidex-${tier}:pidex-implementer:quality`, version_hash: 'a'.repeat(64), activation_epoch: `epoch:${tier.padEnd(24, '0')}`, tier, scope_id: tier === 'global' ? null : 'project-safe', content_hash: 'a'.repeat(64), accepted_commit: 'b'.repeat(40), protection_class: 'none', mirror_digest: 'c'.repeat(64), agent: 'pidex-implementer', applicability: [], phases: ['implementation'], lifecycle_state: 'active' };
}
function measurement(run_family_id, production_started_at, outcome_finalized_at) {
  return { schema: 'rule-impact-measurement-v1', run_family_id, production_started_at, plan_id: '046', plan_class: 'quality', project_scope: 'project-safe', outcome_definition_id: 'latency', outcome_definition_version: '1', model_provider: 'provider', model_identity: 'model', model_version: '1', pipeline_version: '1', config_digest: 'a'.repeat(64), route_topology: 'terminal', agent_role: 'pidex-implementer', agent_version: '1', phase: 'implementation', capability_set: ['capture'], budget_class: 'standard', workload_risk_fingerprint_class: 'risk-a', raw_pre_outcome_covariates: { load: 1 }, impact_contract_ref: 'contract:1', impact_contract_digest: digest(contract), impact_contract_bytes: contract, outcome_vector: { latency: 1 }, outcome_source_identity: 'outcome:1', outcome_source_digest: 'c'.repeat(64), outcome_finalized_at };
}
function authorityFor({ active, at, marker, tier }) {
  const snapshot = { schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: `snapshot:${marker}`, resolver_revision: '045-S2', projection_revision: 1, scope_id: 'project-safe', created_at: at, source_heads: { source: '1'.repeat(40) }, mirror_heads: { source: '1'.repeat(40) }, quality: 'verified', reason_codes: [], active_rules: active, narrowing: [] };
  const resolver_snapshot_bytes = JSON.stringify(snapshot);
  const fresh_runtime = { schema: 'pidex-rule-runtime-context-v1', pipeline_id: `pipeline:${tier}`, input_digests: { schema: 'pidex-rule-runtime-input-digests-v1', run_identity_digest: '1'.repeat(64), project_authority_digest: '2'.repeat(64), inventory_identity_digest: '3'.repeat(64), lifecycle_head_digest: '4'.repeat(64), projection_digest: '5'.repeat(64), epoch_catalog_digest: '6'.repeat(64), mirror_generation_digest: '7'.repeat(64), reconciliation_artifact_digest: '8'.repeat(64) }, supplied_context_attestation: 'attested', resolver_snapshot_bytes, resolver_snapshot_digest: digest(resolver_snapshot_bytes) };
  return { captured_at: at, exposure_publication: { run_id: `run:${marker}`, terminal_outcome_ref: 'complete', reconciliation_revision: 'recon-1', snapshot_id: snapshot.snapshot_id, exposure_id: `exposure:${marker.repeat(64)}`, publication_digest: marker.repeat(64), publication_state: 'COMMITTED_VERIFIED' }, fresh_runtime, resolver_boundary: { target_rule: active[0], active_rules: active, non_target_rules: [], source_heads: snapshot.source_heads, mirror_heads: snapshot.mirror_heads, scope_id: snapshot.scope_id, projection_revision: 1, activation_epoch: active[0].activation_epoch, runtime_digest: digest(JSON.stringify(fresh_runtime)) } };
}

function establishFixture({ tier }) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-f15203-${tier}-`));
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-f15203-source-${tier}-`));
  mkdirSync(path.join(sourceRoot, 'agents'), { recursive: true }); writeFileSync(path.join(sourceRoot, 'agents', 'source.md'), '# source\n');
  const run = { run_id: `f15203-${tier}`, plan_id: '046', project_scope: 'project-safe', pipeline_version: '1', model_identity: 'model', config_fingerprint: 'config', correlation_id: 'f15203' };
  const source = traceProjectPipelineExposure({ pidexRoot: sourceRoot, gitTrackedPaths: ['agents/source.md'], run, terminal_outcome_ref: 'complete' });
  const store = openRuleLifecycleStore({ stateRoot });
  const target = targetFor(tier); const other = { ...target, rule_id: `pidex-${tier}:pidex-planner:quality`, version_hash: 'f'.repeat(64), content_hash: 'f'.repeat(64), activation_epoch: `epoch:${tier}-other-000000000000` };
  const t0 = '2026-05-01T00:00:00.000Z'; const at = (days) => new Date(Date.parse(t0) + days * 86400000).toISOString();
  const storeTarget = { tier, scope_id: tier === 'global' ? '' : 'project-safe', rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch };
  const openingBase = { kind: 'activation_opened', opening_id: `opening:${tier}`, opened_at: t0, rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, accepted_commit: target.accepted_commit, source_heads: { source: '1'.repeat(40) }, mirror_heads: { source: '1'.repeat(40) }, projection_revision: 1 };
  const opening = { kind: openingBase.kind, opening_id: openingBase.opening_id, opening_digest: digest(JSON.stringify(openingBase)), opened_at: openingBase.opened_at, rule_id: openingBase.rule_id, version_hash: openingBase.version_hash, activation_epoch: openingBase.activation_epoch, accepted_commit: openingBase.accepted_commit, source_heads: openingBase.source_heads, mirror_heads: openingBase.mirror_heads, projection_revision: openingBase.projection_revision };
  store.recordLifecycleImpactOpening({ target: storeTarget, opening_kind: opening.kind, opening_id: opening.opening_id, opening_digest: opening.opening_digest, opening_bytes: Buffer.from(JSON.stringify(opening)), opened_at: t0, accepted_head: target.accepted_commit, source_head: '1'.repeat(40), mirror_head: '1'.repeat(40), projection_revision: '1' });
  store.recordImpactContract({ impact_contract_ref: 'contract:1', impact_contract_digest: digest(contract), impact_contract_bytes: Buffer.from(contract) });
  const eventBytes = Buffer.from(JSON.stringify({ event: 'opened', tier }));
  store.recordLifecycleImpactEvent({ target: storeTarget, event_class: 'epoch', event_type: 'opening', event_id: `event:${tier}`, event_digest: digest(eventBytes), event_bytes: eventBytes, event_at: '2025-01-01T00:00:00.000Z', effect: 'opened' });
  for (const [days, marker] of [[-60, '2'], [-30, '3'], [30, '5']]) assert.equal(captureRuleImpactFanout({ stateRoot, store, authority: authorityFor({ active: [days < 0 ? other : target], at: at(days + 1), marker, tier }), measurement: measurement(`${tier}-${marker}`, at(days), at(days + 1)) }).outcome, 'success');
  const due = store.upsertImpactCadenceCheckpoint({ target: storeTarget, policy_id: policyForTier(tier).policy_id, policy_digest: policyDigest(tier), opening_id: opening.opening_id, opening_digest: opening.opening_digest, checkpoint_kind: 'freeze' });
  return { stateRoot, sourceRoot, source, run, store, target, t0, at, due };
}
function runtimeContextFor(fixture, tier) {
  const resolver_snapshot = { schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: `snapshot:live-${tier}`, resolver_revision: '045-S2', projection_revision: 1, scope_id: 'project-safe', created_at: fixture.at(1), source_heads: { source: '1'.repeat(40) }, mirror_heads: { source: '1'.repeat(40) }, quality: 'verified', reason_codes: [], active_rules: [fixture.target], narrowing: [] };
  return { schema: 'pidex-rule-runtime-context-v1', pipeline_id: `pipeline:${tier}`, input_digests: authorityFor({ active: [fixture.target], at: fixture.at(1), marker: '4', tier }).fresh_runtime.input_digests, resolver_snapshot, passive_exposure_input: { inventory_identity: fixture.source.inventory, epoch_catalog: createActivationEpochCatalog(Object.fromEntries(fixture.source.snapshot.active_rules.map((rule) => [`${rule.rule_id}\0${rule.version_hash}`, rule.activation_epoch]))), reconciliation_artifact: fixture.source.reconciliation, rule_snapshot: fixture.source.snapshot } };
}

function publishProducerMeasurement(store, run_family_id, production_started_at, outcome_finalized_at) {
  const canonicalFamilyId = `run-family:${digest(`family:${run_family_id}`)}`;
  const supplied = measurement(canonicalFamilyId, production_started_at, outcome_finalized_at);
  const family = { schema: 'rule-impact-family-v1', project_scope: supplied.project_scope, plan_id: supplied.plan_id, plan_class: supplied.plan_class, root_run_id: `root:${run_family_id}`, run_family_id: canonicalFamilyId, production_started_at };
  const execution = { schema: 'rule-impact-execution-v1', model_provider: supplied.model_provider, model_identity: supplied.model_identity, model_version: supplied.model_version, pipeline_version: supplied.pipeline_version, route_topology: supplied.route_topology, agent_role: supplied.agent_role, agent_version: supplied.agent_version, phase: supplied.phase, capability_set: supplied.capability_set, budget_class: supplied.budget_class, workload_risk_fingerprint_class: supplied.workload_risk_fingerprint_class };
  const producer = store.startProducerPublication({ pipeline_id: 'pipeline:producer-fixture', terminal_outcome_ref: `terminal:${run_family_id}`, family, execution, impact_contract: { impact_contract_ref: supplied.impact_contract_ref, impact_contract_digest: supplied.impact_contract_digest, impact_contract_bytes: Buffer.from(supplied.impact_contract_bytes), raw_pre_outcome_covariates: supplied.raw_pre_outcome_covariates } });
  const terminal = { schema: 'rule-impact-terminal-outcome-v1', run_family_id: canonicalFamilyId, outcome_definition_id: supplied.outcome_definition_id, outcome_definition_version: supplied.outcome_definition_version, outcome_vector: supplied.outcome_vector, outcome_finalized_at };
  const { reference } = store.finalizeProducerPublication({ producer, terminal_outcome: terminal });
  return { reference, measurement: store.readVerifiedProducerPublication({ reference }).measurement };
}

test('F-152-06 tracer consumes only a reverified opaque producer publication reference', () => {
  for (const tier of ['global', 'project']) {
    const fixture = establishFixture({ tier }); const terminalRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-f15206-${tier}-`));
    try {
      const published = publishProducerMeasurement(fixture.store, `${tier}-producer`, fixture.t0, fixture.at(1));
      const captured = [];
      const trace = (producerPublicationReference, callerMeasurement = { caller: 'forged' }) => traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext: runtimeContextFor(fixture, tier), stateRoot: fixture.stateRoot, impactStore: fixture.store, run: fixture.run, terminal_outcome_ref: 'complete', producerPublicationReference, measurement: callerMeasurement, impactCapture: ({ measurement: candidate }) => { captured.push(candidate); return { outcome: 'blocked' }; } });
      trace(published.reference);
      assert.deepEqual(captured.pop(), published.measurement, `${tier}: verified reference alone supplies measurement`);
      trace({ ...published.reference, producer_publication_digest: '0'.repeat(64) });
      assert.deepEqual(captured.pop(), {}, `${tier}: forged reference blocks caller measurement`);
      trace(undefined, published.measurement);
      assert.deepEqual(captured.pop(), {}, `${tier}: caller measurement cannot substitute reference`);
      writeFileSync(path.join(fixture.stateRoot, 'quality', 'rule-impact-producer-publication', `${published.reference.producer_publication_digest}.json`), '{"corrupt":true}');
      trace(published.reference);
      assert.deepEqual(captured.pop(), {}, `${tier}: publication blob mutation blocks rehash verification`);
    } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); rmSync(fixture.sourceRoot, { recursive: true, force: true }); rmSync(terminalRoot, { recursive: true, force: true }); }
  }
});

test('F-152-03 production tracer→cadence internally assembles API-09 and indexes one immutable global ER before checkpoint settlement', () => {
  const fixture = establishFixture({ tier: 'global' });
  try {
    const runtimeContext = runtimeContextFor(fixture, 'global');
    const producerPublicationReference = publishProducerMeasurement(fixture.store, 'global-4', fixture.t0, fixture.at(1)).reference;
    const result = traceProjectPipelineExposure({ pidexRoot: mkdtempSync(path.join(os.tmpdir(), 'pidex-f15203-root-')), runtimeContext, stateRoot: fixture.stateRoot, impactStore: fixture.store, run: fixture.run, terminal_outcome_ref: 'complete', producerPublicationReference });
    assert.equal(result.impact_capture.status, 'captured', JSON.stringify(result.impact_capture));
    assert.deepEqual(result.impact_cadence, { status: 'evaluated', reason: 'support_ratio_below_floor' });
    const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate').get().count, 1, 'cadence internally assembled API-09 from indexed authority');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_evaluation_index').get().count, 1, 'existing evaluator seam emitted one immutable ER');
    assert.equal(db.prepare('SELECT status FROM impact_cadence').get().status, 'evaluated', 'checkpoint settles only after ER write');
    db.close();
    assert.doesNotMatch(JSON.stringify(result.impact_cadence), /input_id|result_id|target|bytes|evaluation_pending/i);
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('F-152-03 production tracer→cadence internally assembles API-09 and indexes one immutable project ER before checkpoint settlement', () => {
  const fixture = establishFixture({ tier: 'project' });
  try {
    const runtimeContext = runtimeContextFor(fixture, 'project');
    const producerPublicationReference = publishProducerMeasurement(fixture.store, 'project-4', fixture.t0, fixture.at(1)).reference;
    const result = traceProjectPipelineExposure({ pidexRoot: mkdtempSync(path.join(os.tmpdir(), 'pidex-f15203-root-')), runtimeContext, stateRoot: fixture.stateRoot, impactStore: fixture.store, run: fixture.run, terminal_outcome_ref: 'complete', producerPublicationReference });
    assert.equal(result.impact_capture.status, 'captured', JSON.stringify(result.impact_capture));
    assert.deepEqual(result.impact_cadence, { status: 'evaluated', reason: 'support_ratio_below_floor' });
    const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate').get().count, 1, 'cadence internally assembled API-09 from indexed authority');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_evaluation_index').get().count, 1, 'existing evaluator seam emitted one immutable ER');
    assert.equal(db.prepare('SELECT status FROM impact_cadence').get().status, 'evaluated', 'checkpoint settles only after ER write');
    db.close();
    assert.doesNotMatch(JSON.stringify(result.impact_cadence), /input_id|result_id|target|bytes|evaluation_pending/i);
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('F-152-03 production tracer keeps incomplete global/project capture blocked without API-09 aggregate or evaluator ER', () => {
  for (const tier of ['global', 'project']) {
    const fixture = establishFixture({ tier });
    const terminalRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-f15203-incomplete-${tier}-`));
    try {
      const result = traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext: runtimeContextFor(fixture, tier), stateRoot: fixture.stateRoot, impactStore: fixture.store, run: fixture.run, terminal_outcome_ref: 'complete', measurement: {} });
      assert.equal(result.impact_cadence.status, 'blocked', `${tier}: ${JSON.stringify(result.impact_cadence)}`);
      const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate').get().count, 0, `${tier}: incomplete authority never assembles API-09`);
      db.close();
      assert.doesNotMatch(JSON.stringify(result.impact_cadence), /input_id|result_id|target|bytes|evaluation_pending/i);
    } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); rmSync(fixture.sourceRoot, { recursive: true, force: true }); rmSync(terminalRoot, { recursive: true, force: true }); }
  }
});

test('F-152-03 production tracer fails closed on global/project resolver source drift before API-09 aggregate or evaluator ER', () => {
  for (const tier of ['global', 'project']) {
    const fixture = establishFixture({ tier }); const terminalRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-f15203-drift-${tier}-`)); const runtimeContext = runtimeContextFor(fixture, tier);
    try {
      const producerPublicationReference = publishProducerMeasurement(fixture.store, `${tier}-4`, fixture.t0, fixture.at(1)).reference;
    const result = traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext, stateRoot: fixture.stateRoot, impactStore: fixture.store, run: fixture.run, terminal_outcome_ref: 'complete', producerPublicationReference, impactCapture: (request) => {
        const captured = captureRuleImpactFanout(request);
        runtimeContext.resolver_snapshot = { ...runtimeContext.resolver_snapshot, source_heads: { source: '2'.repeat(40) } };
        return captured;
      } });
      assert.deepEqual(result.impact_cadence, { status: 'blocked', reason: 'authority_drift' }, `${tier}: resolver drift must fail closed`);
      const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate').get().count, 0, `${tier}: drift never assembles API-09`);
      db.close();
      assert.doesNotMatch(JSON.stringify(result.impact_cadence), /input_id|result_id|target|bytes|evaluation_pending/i);
    } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); rmSync(fixture.sourceRoot, { recursive: true, force: true }); rmSync(terminalRoot, { recursive: true, force: true }); }
  }
});
