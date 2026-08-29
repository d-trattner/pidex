import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync as nativeRmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadPlan046ImpactResultExamples } from './fixtures/plan046-contract-examples.mjs';
import { assembleImpactEvaluatorInput, bindInputChain, buildExpectedCurrentFromApi09, buildImpactEvaluationArtifact, buildImpactLifecycleResult, captureRuleImpactFanout, buildRuleImpactInput, getVerifiedImpactFamilySources, linkImpactEvaluationReplacement, parseImpactEvaluationBytes, readImpactEvaluation, readImpactEvaluationReplacement, readImmutableFile, readIndexedImpactInput, readLatestImpactEvaluationPrior, readTrustedImpactEvaluationPrior, readTrustedImpactEvaluationReplacement, recordImpactEvaluation, recordTerminalImpactEvaluation, recordNonActionImpactResult, readPlan048ImpactResult, reverifyVerifiedImpactFamilySource, selectVerifiedImpactFamilies, writeImmutableInput } from './rule-impact-results.mjs';
import { openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { runRuleImpactCadence } from './rule-impact-cadence.mjs';
import { policyDigest, policyForTier } from './rule-impact-policy.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function rmSync(target, options = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try { return nativeRmSync(target, options); }
    catch (error) {
      if (!options?.recursive || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error?.code) || attempt >= 60) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}
const target = Object.freeze({ rule_id: 'pidex-global:pidex-implementer:quality', version_hash: 'a'.repeat(64), activation_epoch: 'epoch:1234567890abcdef12345678', tier: 'global', scope_id: null, content_hash: 'a'.repeat(64), accepted_commit: 'b'.repeat(40), protection_class: 'none', mirror_digest: 'c'.repeat(64), agent: 'pidex-implementer', applicability: [], phases: ['implementation'], lifecycle_state: 'active' });
test('native Windows immutable input uses portable identity checks and a flushed named witness', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-windows-witness-')); const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform'); const bytes = Buffer.from('{"windows":"witness"}', 'utf8'); const input_digest = sha256(bytes);
  try {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    assert.doesNotThrow(() => writeImmutableInput(stateRoot, { input_digest, bytes }));
    const chain = bindInputChain(stateRoot); const file = path.join(stateRoot, 'quality', 'rule-impact-input', `${input_digest}.json`); const read = readImmutableFile(chain, file, input_digest);
    assert.equal(read.bytes.equals(bytes), true);
    writeFileSync(file, '{"windows":"drift"}');
    assert.throws(() => readImmutableFile(chain, file, input_digest), /RULE_IMPACT_BLOB_COLLISION/);
  } finally { Object.defineProperty(process, 'platform', originalPlatform); rmSync(stateRoot, { recursive: true, force: true }); }
});
function authorityFor({ source_heads = {}, mirror_heads = {}, resolver_snapshot_bytes, active_rules = [target], captured_at = '2026-08-12T12:00:00.000Z' } = {}) {
  const scalar = (left, right) => { const a = Array.from(left); const b = Array.from(right); for (let i = 0; i < Math.min(a.length, b.length); i += 1) { const delta = a[i].codePointAt(0) - b[i].codePointAt(0); if (delta) return delta; } return a.length - b.length; };
  source_heads = Object.fromEntries(Object.entries(source_heads).sort(([left], [right]) => scalar(left, right)));
  mirror_heads = Object.fromEntries(Object.entries(mirror_heads).sort(([left], [right]) => scalar(left, right)));
  active_rules = [...active_rules].sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  const snapshot = { schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: 'snapshot:one', resolver_revision: '045-S2', projection_revision: 1, scope_id: 'project-1', created_at: '2026-08-11T00:00:00.000Z', source_heads, mirror_heads, quality: 'verified', reason_codes: [], active_rules, narrowing: [] };
  const bytes = resolver_snapshot_bytes || JSON.stringify(snapshot);
  const input_digests = { schema: 'pidex-rule-runtime-input-digests-v1', run_identity_digest: '1'.repeat(64), project_authority_digest: '2'.repeat(64), inventory_identity_digest: '3'.repeat(64), lifecycle_head_digest: '4'.repeat(64), projection_digest: '5'.repeat(64), epoch_catalog_digest: '6'.repeat(64), mirror_generation_digest: '7'.repeat(64), reconciliation_artifact_digest: '8'.repeat(64) };
  const fresh_runtime = { schema: 'pidex-rule-runtime-context-v1', pipeline_id: 'pipeline-1', input_digests, supplied_context_attestation: 'attested', resolver_snapshot_bytes: bytes, resolver_snapshot_digest: sha256(bytes) };
  return Object.freeze({ captured_at, exposure_publication: { run_id: 'run-1', terminal_outcome_ref: 'done', reconciliation_revision: 'recon-1', snapshot_id: 'snapshot:one', exposure_id: `exposure:${'9'.repeat(64)}`, publication_digest: 'd'.repeat(64), publication_state: 'COMMITTED_VERIFIED' }, fresh_runtime, resolver_boundary: { target_rule: active_rules[0], active_rules, non_target_rules: active_rules.slice(1).map(({ rule_id, version_hash }) => ({ rule_id, version_hash })), source_heads, mirror_heads, scope_id: 'project-1', projection_revision: 1, activation_epoch: active_rules[0].activation_epoch, runtime_digest: sha256(JSON.stringify(fresh_runtime)) } });
}
const authority = authorityFor();

function acceptedImpactContract() {
  return JSON.stringify({ contract_id: 'contract:1', contract_version: '1', created_at: '2026-08-01T00:00:00.000Z', valid_from: '2026-08-02T00:00:00.000Z', outcome_definition_id: 'latency', outcome_definition_version: '1', dimensions: [{ id: 'latency', role: 'primary', extractor_id: 'extractor', extractor_version: '1', value_type: 'continuous', unit: 'ms', valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true, adverse_direction: 'higher', absolute_materiality: 1, required_raw_covariates: ['load'] }], raw_covariates: [{ id: 'load', unit: 'requests', valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true, bins: [{ bin_id: 'load:normal', ordinal: 0, valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true }] }] });
}
function completeMeasurement() {
  const contract = acceptedImpactContract();
  return { schema: 'rule-impact-measurement-v1', run_family_id: 'family-1', production_started_at: '2026-08-11T00:00:00.000Z', plan_id: '046', plan_class: 'quality', project_scope: 'project-1', outcome_definition_id: 'latency', outcome_definition_version: '1', model_provider: 'provider', model_identity: 'model', model_version: '1', pipeline_version: '1', config_digest: 'a'.repeat(64), route_topology: 'terminal', agent_role: 'pidex-implementer', agent_version: '1', phase: 'implementation', capability_set: ['capture'], budget_class: 'standard', workload_risk_fingerprint_class: 'risk-a', raw_pre_outcome_covariates: { load: 1 }, impact_contract_ref: 'contract:1', impact_contract_digest: sha256(contract), impact_contract_bytes: contract, outcome_vector: { latency: 1 }, outcome_source_identity: 'outcome:1', outcome_source_digest: 'c'.repeat(64), outcome_finalized_at: '2026-08-12T00:00:00.000Z' };
}

test('C49-5 impact capture never trusts COMMITTED_UNCONFIRMED alone and accepts only witness-attested publication state', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-witness-authority-'));
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    const capture = (publication_state) => captureRuleImpactFanout({ stateRoot, store, authority: { ...authority, exposure_publication: { ...authority.exposure_publication, publication_state } }, measurement: completeMeasurement() });
    assert.deepEqual(capture('COMMITTED_UNCONFIRMED'), { outcome: 'resolver_invalid' }, 'unconfirmed durability alone never authorizes capture');
    assert.equal(capture('COMMITTED_WITNESSED').outcome, 'success', 'witness-attested publication state authorizes capture');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Plan046 S2 accepts only exact EI eight-field contract bytes and rejects older IC-01 bytes', () => {
  const accepted = completeMeasurement();
  assert.equal(buildRuleImpactInput({ authority, measurement: accepted }).collection_disposition, 'eligible');
  const legacy = { ...accepted, impact_contract_bytes: JSON.stringify({ schema: 'impact-contract-v1', outcome_definition_id: 'latency', outcome_definition_version: '1', created_at: '2026-08-01T00:00:00.000Z', primary_dimension: { dimension_id: 'latency' }, guardrail_dimensions: [], benefit_dimension: null, required_pre_outcome_covariates: [] }) };
  legacy.impact_contract_digest = sha256(legacy.impact_contract_bytes);
  assert.equal(buildRuleImpactInput({ authority, measurement: legacy }).collection_reason, 'impact_contract_invalid');
});
test('BR-01/BP-01 emits canonical blocked input when impact contract is unavailable', () => {
  const result = buildRuleImpactInput({ authority, measurement: {} });
  assert.equal(result.collection_disposition, 'blocked');
  assert.equal(result.collection_reason, 'family_identity_missing');
  assert.match(result.input_id, /^rule-impact-input:[a-f0-9]{64}$/);
  assert.equal(result.bytes.toString('utf8').endsWith('\n'), false);
  assert.deepEqual(JSON.parse(result.bytes), { schema: 'rule-impact-input-v1', captured_at: authority.captured_at, exposure_publication: authority.exposure_publication, fresh_runtime: authority.fresh_runtime, resolver_boundary: authority.resolver_boundary, measurement: {}, measurement_present_keys: [], collection_disposition: 'blocked', collection_reason: 'family_identity_missing' });
});
test('BP-01/TM-01 applies canonical missing/invalid precedence without inventing producer fields', () => {
  const complete = completeMeasurement();
  const reason = (measurement) => buildRuleImpactInput({ authority, measurement }).collection_reason;
  assert.equal(reason({}), 'family_identity_missing');
  assert.equal(reason({ run_family_id: complete.run_family_id, production_started_at: complete.production_started_at }), 'fingerprint_missing');
  assert.equal(reason({ ...complete, workload_risk_fingerprint_class: undefined }), 'measurement_schema_invalid', 'malformed supplied values never become missing keys');
  const beforeWorkload = { ...complete }; delete beforeWorkload.workload_risk_fingerprint_class;
  assert.equal(reason(beforeWorkload), 'workload_class_missing');
  const beforeContract = { ...complete }; delete beforeContract.impact_contract_ref;
  assert.equal(reason(beforeContract), 'impact_contract_unavailable');
  assert.equal(reason({ ...complete, impact_contract_digest: 'b'.repeat(64) }), 'impact_contract_invalid');
  const beforeOutcome = { ...complete }; delete beforeOutcome.outcome_vector;
  assert.equal(reason(beforeOutcome), 'outcome_source_unavailable');
  assert.equal(reason({ ...complete, outcome_vector: { latency: 101 } }), 'outcome_invalid');
  assert.equal(reason({ ...complete, outcome_finalized_at: '2026-08-20T00:00:00.000Z' }), 'outcome_not_final');
  assert.equal(buildRuleImpactInput({ authority, measurement: complete }).collection_disposition, 'eligible');
});
test('TM-01 rejects private measurement before any input bytes exist', () => {
  assert.deepEqual(buildRuleImpactInput({ authority, measurement: { impact_contract_ref: '/private/key' } }), { outcome: 'private_data_rejected' });
});
test('F-110-SEC-01 rejects private resolver narrowing before bytes, blob, index, or outward sentinel persistence', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-sec110-private-narrowing-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const resolver_snapshot_bytes = authority.fresh_runtime.resolver_snapshot_bytes.replace('"narrowing":[]', '"narrowing":[{"rule_id":"/private/credential","state":"locally_stopped"}]');
  const fresh_runtime = { ...authority.fresh_runtime, resolver_snapshot_bytes, resolver_snapshot_digest: sha256(resolver_snapshot_bytes) };
  const privateAuthority = {
    ...authority,
    fresh_runtime,
    resolver_boundary: { ...authority.resolver_boundary, runtime_digest: sha256(JSON.stringify(fresh_runtime)) },
  };
  try {
    assert.deepEqual(buildRuleImpactInput({ authority: privateAuthority, measurement: {} }), { outcome: 'private_data_rejected' });
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority: privateAuthority, measurement: {} }), { outcome: 'private_data_rejected' });
    assert.equal(existsSync(path.join(stateRoot, 'quality', 'rule-impact-input')), false);
    assert.equal(store.readImpactFanout({ exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest }), undefined);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('TM-01 strict validator maps malformed non-private measurement to constant blocked bytes', () => {
  const measurement = {
    schema: 'rule-impact-measurement-v1', run_family_id: 'family-1', production_started_at: '2026-08-12T11:00:00.000Z',
    plan_id: '046', plan_class: 'quality', project_scope: 'project-1', outcome_definition_id: 'latency', outcome_definition_version: '1',
    model_provider: 'provider', model_identity: 'model', model_version: '1', pipeline_version: '1', config_digest: 'a'.repeat(64),
    route_topology: 'terminal', agent_role: 'pidex-implementer', agent_version: '1', phase: 'implementation', capability_set: ['capture'],
    budget_class: 'standard', workload_risk_fingerprint_class: 'risk-a', raw_pre_outcome_covariates: { latency: 1 },
    impact_contract_ref: 'contract:1', impact_contract_digest: 'b'.repeat(64), impact_contract_bytes: '{}',
    outcome_vector: { latency: 1 }, outcome_source_identity: 'outcome:1', outcome_source_digest: 'c'.repeat(64), outcome_finalized_at: '2026-08-12T12:00:00.000Z',
  };
  const malformed = buildRuleImpactInput({ authority, measurement: { ...measurement, capability_set: ['capture', 'capture'] } });
  const unknown = buildRuleImpactInput({ authority, measurement: { ...measurement, unexpected: 'value' } });
  assert.equal(malformed.collection_reason, 'measurement_schema_invalid');
  assert.equal(unknown.collection_reason, 'measurement_schema_invalid');
  assert.deepEqual(JSON.parse(malformed.bytes).measurement, {});
  assert.deepEqual(JSON.parse(malformed.bytes).measurement_present_keys, []);
  assert.equal(malformed.bytes.equals(unknown.bytes), true, 'all non-private malformed variants share fixed sentinel payload bytes');
});
test('SV-04 partial-final storage failure returns no authority and leaves only inert verified prefix', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-storage-fault-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const second = { ...target, rule_id: 'pidex-global:pidex-planner:quality' };
  const fanoutAuthority = { ...authorityFor({ active_rules: [target, second] }), exposure_publication: { ...authority.exposure_publication, exposure_id: `exposure:${'2'.repeat(64)}` } };
  try {
    const result = captureRuleImpactFanout({ stateRoot, store, authority: fanoutAuthority, measurement: {}, storageFault: { phase: 'after_final', ordinal: 0 } });
    assert.deepEqual(result, { outcome: 'storage_unavailable' });
    assert.equal(readdirSync(path.join(stateRoot, 'quality', 'rule-impact-input')).filter((name) => name.endsWith('.json')).length, 1);
    assert.equal(store.readImpactFanout({ exposure_id: fanoutAuthority.exposure_publication.exposure_id, publication_digest: fanoutAuthority.exposure_publication.publication_digest }), undefined);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('PFO-02 capture writes bounded ledger without exposing blob or target identifiers', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-ledger-capture-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const fanoutAuthority = { ...authority, exposure_publication: { ...authority.exposure_publication, exposure_id: `exposure:${'7'.repeat(64)}` } };
  try {
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority: fanoutAuthority, measurement: {}, storageFault: { phase: 'before_index' } }), { outcome: 'storage_unavailable' });
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    const row = db.prepare('SELECT reason, exposure_id, publication_digest FROM impact_storage_attempt').get();
    assert.deepEqual({ ...row }, { reason: 'index_storage_unavailable', exposure_id: fanoutAuthority.exposure_publication.exposure_id, publication_digest: fanoutAuthority.exposure_publication.publication_digest });
    db.close();
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('SV-07 each index boundary leaves complete inert finals and zero committed authority', () => {
  for (const [phase, marker] of [['index_begin', '3'], ['index_fanout', '4'], ['index_target', '5'], ['index_commit', '6']]) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-index-fault-'));
    const store = openRuleLifecycleStore({ stateRoot });
    const fanoutAuthority = { ...authority, exposure_publication: { ...authority.exposure_publication, exposure_id: `exposure:${marker.repeat(64)}` } };
    try {
      assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority: fanoutAuthority, measurement: {}, storageFault: { phase } }), { outcome: 'storage_unavailable' });
      assert.equal(readdirSync(path.join(stateRoot, 'quality', 'rule-impact-input')).filter((name) => name.endsWith('.json')).length, 1);
      assert.equal(store.readImpactFanout({ exposure_id: fanoutAuthority.exposure_publication.exposure_id, publication_digest: fanoutAuthority.exposure_publication.publication_digest }), undefined);
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('F-106-A-01 canonicalizes permuted dynamic maps with Unicode scalar ordering', () => {
  const first = authorityFor({ source_heads: { '\u{10000}': 'a'.repeat(40), '\u{e000}': 'b'.repeat(40) }, mirror_heads: { '\u{10000}': 'c'.repeat(40), '\u{e000}': 'd'.repeat(40) } });
  const second = authorityFor({ source_heads: { '\u{e000}': 'b'.repeat(40), '\u{10000}': 'a'.repeat(40) }, mirror_heads: { '\u{e000}': 'd'.repeat(40), '\u{10000}': 'c'.repeat(40) } });
  const left = buildRuleImpactInput({ authority: first, measurement: {} });
  const right = buildRuleImpactInput({ authority: second, measurement: {} });
  assert.equal(left.bytes.equals(right.bytes), true);
  assert.match(left.bytes.toString(), /"":"b{40}","𐀀":"a{40}"/);
});
test('F-106-A-02 rejects substituted resolver bytes and runtime boundary drift before payload', () => {
  const substituted = authorityFor({ resolver_snapshot_bytes: JSON.stringify({ schema: 'pidex-rule-resolver-snapshot-v1' }) });
  assert.deepEqual(buildRuleImpactInput({ authority: substituted, measurement: {} }), { outcome: 'resolver_invalid' });
  const drifted = authorityFor();
  const changed = { ...drifted, resolver_boundary: { ...drifted.resolver_boundary, projection_revision: 'wrong' } };
  assert.deepEqual(buildRuleImpactInput({ authority: changed, measurement: {} }), { outcome: 'resolver_invalid' });
});
test('F-106-A-04 rejects static root and parent symlinks without writing outside root', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-root-link-'));
  const external = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-external-'));
  let store = openRuleLifecycleStore({ stateRoot });
  const rootLink = path.join(os.tmpdir(), `pidex-impact-root-alias-${process.pid}-${Date.now()}`);
  try {
    symlinkSync(stateRoot, rootLink);
    assert.deepEqual(captureRuleImpactFanout({ stateRoot: rootLink, store, authority, measurement: {} }), { outcome: 'storage_unavailable' });
    store.close(); store = null;
    rmSync(path.join(stateRoot, 'quality'), { recursive: true, force: true });
    symlinkSync(external, path.join(stateRoot, 'quality'));
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} }), { outcome: 'storage_unavailable' });
    assert.deepEqual(readdirSync(external), [], 'rejected symlink must receive zero blob writes');
  } finally { store?.close(); rmSync(rootLink, { force: true }); rmSync(stateRoot, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});
test('F-106-A-04 rejects destination symlink and collision without following or replacing either', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-destination-link-'));
  const external = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-destination-external-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const input = buildRuleImpactInput({ authority, measurement: {} });
  const directory = path.join(stateRoot, 'quality', 'rule-impact-input');
  const destination = path.join(directory, `${input.input_digest}.json`);
  try {
    mkdirSync(directory, { recursive: true });
    const outside = path.join(external, 'outside.json'); writeFileSync(outside, 'outside');
    symlinkSync(outside, destination);
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} }), { outcome: 'storage_unavailable' });
    assert.equal(readFileSync(outside, 'utf8'), 'outside');
    rmSync(destination);
    writeFileSync(destination, 'collision');
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} }), { outcome: 'storage_unavailable' });
    assert.equal(readFileSync(destination, 'utf8'), 'collision');
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});
test('F-106-A-04 rejects deterministic component swaps before stage and after write without outside writes', () => {
  for (const [name, phase] of [['stage', 'pre'], ['write', 'post']]) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-component-swap-'));
    const external = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-component-external-'));
    const store = openRuleLifecycleStore({ stateRoot });
    const quality = path.join(stateRoot, 'quality'); const displaced = path.join(stateRoot, 'quality-displaced');
    try {
      assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {}, storageFault: { checkpoint(current, currentPhase) {
        if (current === name && currentPhase === phase) { renameSync(quality, displaced); symlinkSync(external, quality); }
      } } }), { outcome: 'storage_unavailable' });
      assert.deepEqual(readdirSync(external), []);
    } finally {
      store.close(); rmSync(quality, { recursive: true, force: true });
      if (existsSync(displaced)) renameSync(displaced, quality);
      rmSync(stateRoot, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true });
    }
  }
});
test('F-106-A-04 rejects unresolved, traversal, and Windows-static roots plus unsupported directory durability', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-root-static-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.deepEqual(captureRuleImpactFanout({ stateRoot: `${stateRoot}/../${path.basename(stateRoot)}`, store, authority, measurement: {} }), { outcome: 'storage_unavailable' });
    assert.deepEqual(captureRuleImpactFanout({ stateRoot: 'C:\\CON\\..\\state', store, authority, measurement: {} }), { outcome: 'storage_unavailable' });
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {}, storageFault: { phase: 'directory_fsync_unsupported' } }), { outcome: 'storage_unavailable' });
    assert.equal(store.readImpactFanout({ exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest }), undefined);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-106-A-05 faults actual recordImpactFanout boundaries then retry commits complete indexes', () => {
  for (const phase of ['after_begin', 'after_fanout_insert', 'after_target_insert', 'pre_commit']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-transaction-fault-'));
    const store = openRuleLifecycleStore({ stateRoot });
    try {
      assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {}, storageFault: { phase } }), { outcome: 'storage_unavailable' });
      const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_publication_fanout').get().count, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_target_index').get().count, 0);
      db.close();
      assert.equal(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} }).outcome, 'success');
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('F-106-A-03 persists and returns Plan048 exact blocked bytes without evaluator authority', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-result-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const input = buildRuleImpactInput({ authority, measurement: {} });
  const expected = Object.freeze({ tier: 'global', scope_id: null, target: authority.resolver_boundary.target_rule, policy_id: 'passive-impact-v1', policy_digest: 'e'.repeat(64), snapshot_id: authority.exposure_publication.snapshot_id, snapshot_digest: sha256(authority.fresh_runtime.resolver_snapshot_bytes), exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, activation_epoch: authority.resolver_boundary.activation_epoch, content_hash: authority.resolver_boundary.target_rule.content_hash });
  try {
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} }).outcome, 'success');
    const recorded = recordNonActionImpactResult({ stateRoot, store, input, expected, created_at: authority.captured_at });
    assert.equal(recorded.outcome, 'recorded');
    assert.match(recorded.result_id, /^passive-impact-global:[a-f0-9]{64}$/);
    const read = readPlan048ImpactResult({ stateRoot, store, expected: { ...expected, head_sequence: recorded.head_sequence } });
    assert.equal(read.outcome, 'available');
    assert.equal(read.bytes.equals(recorded.bytes), true, 'handoff must return persisted artifact bytes, not regenerated JSON');
    const artifact = JSON.parse(read.bytes);
    assert.equal(artifact.schema, 'passive-impact-global-result-v1');
    assert.equal(artifact.result, 'blocked');
    assert.equal(artifact.intake.collection_disposition, 'blocked');
    assert.equal(read.bytes.includes(Buffer.from('private')), false);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-106-A-03 blocks mutation, substitution, rollback, foreign identity, and duplicate conflict without rewriting prior bytes', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-result-negative-'));
  const store = openRuleLifecycleStore({ stateRoot }); const input = buildRuleImpactInput({ authority, measurement: {} });
  const expected = { tier: 'global', scope_id: null, target: authority.resolver_boundary.target_rule, policy_id: 'passive-impact-v1', policy_digest: 'e'.repeat(64), snapshot_id: authority.exposure_publication.snapshot_id, snapshot_digest: sha256(authority.fresh_runtime.resolver_snapshot_bytes), exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, activation_epoch: authority.resolver_boundary.activation_epoch, content_hash: authority.resolver_boundary.target_rule.content_hash };
  try {
    captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} });
    const recorded = recordNonActionImpactResult({ stateRoot, store, input, expected, created_at: authority.captured_at }); const current = { ...expected, head_sequence: recorded.head_sequence };
    const resultFile = path.join(stateRoot, 'quality', 'rule-impact-result', `${recorded.result_digest}.json`); const original = readFileSync(resultFile);
    writeFileSync(resultFile, Buffer.concat([original.subarray(0, -1), Buffer.from(original.at(-1) === 125 ? ' ' : '}')]));
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'one-byte mutation never repairs');
    writeFileSync(resultFile, original);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: { ...current, head_sequence: current.head_sequence - 1 } }), { outcome: 'blocked' }, 'index rollback/head sequence blocks');
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: { ...current, tier: 'project', scope_id: 'foreign' } }), { outcome: 'blocked' }, 'foreign tier/scope blocks');
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: { ...current, policy_digest: 'f'.repeat(64) } }), { outcome: 'blocked' }, 'stale policy blocks');
    assert.deepEqual(recordNonActionImpactResult({ stateRoot, store, input, expected: { ...expected, policy_digest: 'f'.repeat(64) }, created_at: authority.captured_at }), { outcome: 'blocked' }, 'duplicate input conflict preserves original');
    assert.equal(readFileSync(resultFile).equals(original), true);
    assert.equal(readPlan048ImpactResult({ stateRoot, store, expected: current }).bytes.equals(original), true);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-107-A-01/A-02 use closed nested canonical order and derive every boundary link from exact resolver bytes', () => {
  const dual = { ...target, rule_id: 'pidex-global:pidex-planner:quality' };
  const base = authorityFor({ active_rules: [target, dual] });
  const source = base;
  const result = buildRuleImpactInput({ authority: source, measurement: {} });
  assert.equal(result.bytes.toString('utf8').includes('"exposure_publication":{"run_id":"run-1","terminal_outcome_ref":"done","reconciliation_revision":"recon-1","snapshot_id":"snapshot:one"'), true, 'fixed exposure record uses contract order, never generic map order');
  const snapshotLinkDrift = { ...source, exposure_publication: { ...source.exposure_publication, snapshot_id: 'snapshot:other' } };
  assert.deepEqual(buildRuleImpactInput({ authority: snapshotLinkDrift, measurement: {} }), { outcome: 'resolver_invalid' });
  const complementDrift = { ...source, resolver_boundary: { ...source.resolver_boundary, non_target_rules: [] } };
  assert.deepEqual(buildRuleImpactInput({ authority: complementDrift, measurement: {} }), { outcome: 'resolver_invalid' });
  const decomposed = authorityFor({ source_heads: { 'e\u0301': 'a'.repeat(40) } });
  assert.deepEqual(buildRuleImpactInput({ authority: decomposed, measurement: {} }), { outcome: 'resolver_invalid' });
});
test('F-110-SEC-02 blocks deleted or substituted current source input/fanout lineage without changing immutable result bytes', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-sec110-source-index-'));
  const store = openRuleLifecycleStore({ stateRoot }); const input = buildRuleImpactInput({ authority, measurement: {} });
  const expected = { tier: 'global', scope_id: null, target: authority.resolver_boundary.target_rule, policy_id: 'passive-impact-v1', policy_digest: 'e'.repeat(64), snapshot_id: authority.exposure_publication.snapshot_id, snapshot_digest: sha256(authority.fresh_runtime.resolver_snapshot_bytes), exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, activation_epoch: authority.resolver_boundary.activation_epoch, content_hash: authority.resolver_boundary.target_rule.content_hash };
  try {
    assert.equal(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} }).outcome, 'success');
    const recorded = recordNonActionImpactResult({ stateRoot, store, input, expected, created_at: authority.captured_at }); const current = { ...expected, head_sequence: recorded.head_sequence };
    const resultFile = path.join(stateRoot, 'quality', 'rule-impact-result', `${recorded.result_digest}.json`); const original = readFileSync(resultFile);
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    db.prepare('DELETE FROM impact_target_index WHERE input_id = ?').run(input.input_id);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'deleted current source input index blocks result handoff');
    db.prepare('INSERT INTO impact_target_index (exposure_id, publication_digest, ordinal, input_id, input_digest) VALUES (?, ?, ?, ?, ?)').run(expected.exposure_id, expected.publication_digest, 0, input.input_id, input.input_digest);
    db.prepare('UPDATE impact_publication_fanout SET target_input_digests_json = ? WHERE exposure_id = ? AND publication_digest = ?').run(JSON.stringify(['f'.repeat(64)]), expected.exposure_id, expected.publication_digest);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'fanout/index substitution blocks result handoff');
    assert.equal(readFileSync(resultFile).equals(original), true, 'source-lineage rejection never rewrites immutable result bytes');
    db.close();
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-107-A-03 blocks valid result substitutions without changing prior authoritative bytes', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-result-substitution-'));
  const store = openRuleLifecycleStore({ stateRoot }); const input = buildRuleImpactInput({ authority, measurement: {} });
  const expected = { tier: 'global', scope_id: null, target: authority.resolver_boundary.target_rule, policy_id: 'passive-impact-v1', policy_digest: 'e'.repeat(64), snapshot_id: authority.exposure_publication.snapshot_id, snapshot_digest: sha256(authority.fresh_runtime.resolver_snapshot_bytes), exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, activation_epoch: authority.resolver_boundary.activation_epoch, content_hash: authority.resolver_boundary.target_rule.content_hash };
  try {
    captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} });
    const recorded = recordNonActionImpactResult({ stateRoot, store, input, expected, created_at: authority.captured_at }); const current = { ...expected, head_sequence: recorded.head_sequence };
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    const original = readFileSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${recorded.result_digest}.json`));
    const forged = Buffer.from(JSON.stringify({ schema: 'unknown-result-v1' })); const forgedDigest = sha256(forged);
    writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${forgedDigest}.json`), forged);
    db.prepare('UPDATE impact_result_index SET result_digest = ? WHERE input_id = ?').run(forgedDigest, input.input_id);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'unknown-schema valid blob index substitution blocks');
    db.prepare('UPDATE impact_result_index SET result_digest = ?, activation_epoch = ? WHERE input_id = ?').run(recorded.result_digest, 'epoch:wrong', input.input_id);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'activation and index identity drift block');
    db.prepare('UPDATE impact_result_index SET activation_epoch = ?, input_digest = ? WHERE input_id = ?').run(expected.activation_epoch, 'f'.repeat(64), input.input_id);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'input-link drift blocks');
    assert.equal(readFileSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${recorded.result_digest}.json`)).equals(original), true);
    db.close();
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-108-A-01 blocks result-ID and creation-time index substitution while preserving exact authoritative bytes', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-result-index-identity-'));
  const store = openRuleLifecycleStore({ stateRoot }); const input = buildRuleImpactInput({ authority, measurement: {} });
  const expected = { tier: 'global', scope_id: null, target: authority.resolver_boundary.target_rule, policy_id: 'passive-impact-v1', policy_digest: 'e'.repeat(64), snapshot_id: authority.exposure_publication.snapshot_id, snapshot_digest: sha256(authority.fresh_runtime.resolver_snapshot_bytes), exposure_id: authority.exposure_publication.exposure_id, publication_digest: authority.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, activation_epoch: authority.resolver_boundary.activation_epoch, content_hash: authority.resolver_boundary.target_rule.content_hash };
  try {
    assert.equal(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {} }).outcome, 'success');
    const recorded = recordNonActionImpactResult({ stateRoot, store, input, expected, created_at: authority.captured_at }); const current = { ...expected, head_sequence: recorded.head_sequence };
    const resultFile = path.join(stateRoot, 'quality', 'rule-impact-result', `${recorded.result_digest}.json`); const original = readFileSync(resultFile);
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    db.prepare('UPDATE impact_result_index SET result_id = ? WHERE input_id = ?').run(`passive-impact-global:${'0'.repeat(64)}`, input.input_id);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'index result ID must derive from verified result bytes');
    db.prepare('UPDATE impact_result_index SET result_id = ?, created_at = ? WHERE input_id = ?').run(recorded.result_id, '2026-08-12T12:00:01.000Z', input.input_id);
    assert.deepEqual(readPlan048ImpactResult({ stateRoot, store, expected: current }), { outcome: 'blocked' }, 'index creation time must equal parsed immutable result creation time');
    db.prepare('UPDATE impact_result_index SET created_at = ? WHERE input_id = ?').run(authority.captured_at, input.input_id);
    const exact = readPlan048ImpactResult({ stateRoot, store, expected: current });
    assert.equal(exact.outcome, 'available');
    assert.equal(exact.bytes.equals(original), true, 'valid read returns original immutable bytes unchanged');
    assert.equal(readFileSync(resultFile).equals(original), true, 'index substitutions never rewrite persisted bytes');
    db.close();
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-107-A-04 revalidates deterministic link window before pathname publication', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-link-window-')); const external = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-link-window-external-')); const store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority, measurement: {}, storageFault: { checkpoint(name, phase) {
      if (name === 'link' && phase === 'pre') { renameSync(path.join(stateRoot, 'quality'), path.join(stateRoot, 'quality-old')); symlinkSync(external, path.join(stateRoot, 'quality')); }
    } } }), { outcome: 'storage_unavailable' });
    assert.deepEqual(readdirSync(external), []);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); rmSync(external, { recursive: true, force: true }); }
});
test('A2 persists complete target fanout only under supplied state root and exact retry reuses authority', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-input-root-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const second = { ...target, rule_id: 'pidex-global:pidex-planner:quality' };
  const fanoutAuthority = {
    ...authorityFor({ active_rules: [second, target] }),
    exposure_publication: { ...authority.exposure_publication, exposure_id: `exposure:${'1'.repeat(64)}` },
  };
  try {
    const first = captureRuleImpactFanout({ stateRoot, store, authority: fanoutAuthority, measurement: {} });
    assert.equal(first.outcome, 'success');
    assert.equal(first.target_input_ids.length, 2);
    assert.equal(existsSync(path.join(stateRoot, 'quality', 'rule-impact-input')), true);
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority: fanoutAuthority, measurement: {} }), first, 'exact retry must not rewrite or reorder authority');
    // Same verified exposure with a fresh, internally coherent but different target set conflicts; stale boundary mutation alone is resolver_invalid.
    assert.deepEqual(captureRuleImpactFanout({ stateRoot, store, authority: { ...authorityFor({ active_rules: [target] }), exposure_publication: fanoutAuthority.exposure_publication }, measurement: {} }), { outcome: 'publication_fanout_conflict' });
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD16–BD29 parses seven exact ER states with nonself identity and full digest', () => {
  const examples = loadPlan046ImpactResultExamples();
  assert.equal(examples.length, 7);
  for (const { bytes, identity_digest: identityDigest, result_digest: resultDigest } of examples) {
    const parsed = parseImpactEvaluationBytes(bytes);
    const artifact = JSON.parse(bytes);
    const projection = { ...artifact }; delete projection.result_id;
    assert.equal(createHash('sha256').update(JSON.stringify(projection)).digest('hex'), identityDigest);
    assert.equal(parsed.result_identity_digest, identityDigest);
    assert.equal(parsed.result_digest, resultDigest);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), resultDigest);
    assert.equal(parsed.result_id, artifact.result_id);
    assert.equal(Object.isFrozen(parsed.artifact), true);
  }
});
test('Plan133 builds all seven approved ER bytes with caller-required tier and rejects malformed nested/private operands', () => {
  const examples = loadPlan046ImpactResultExamples().map(({ bytes }) => JSON.parse(bytes));
  assert.equal(examples.length, 7);
  const argumentsFor = ({ schema, result_id, estimator_id, tier, ...operands }) => ({ tier, ...operands });
  for (const artifact of examples) {
    const built = buildImpactEvaluationArtifact(argumentsFor(artifact));
    assert.equal(built.bytes.equals(Buffer.from(JSON.stringify(artifact))), true, `${artifact.state} uses exact approved bytes`);
    assert.equal(parseImpactEvaluationBytes(built.bytes).artifact.state, artifact.state);
  }
  const collecting = argumentsFor(examples.find(({ state }) => state === 'collecting'));
  assert.throws(() => buildImpactEvaluationArtifact(({ tier, ...withoutTier }) => withoutTier)(collecting), /RULE_IMPACT_RESULT_INPUT_INVALID/);
  assert.throws(() => buildImpactEvaluationArtifact({ ...collecting, tier: 'project' }), /RULE_IMPACT_RESULT_INPUT_INVALID/);
  const frozen = argumentsFor(examples.find(({ state }) => state === 'frozen'));
  frozen.cohorts[0].missing_rate.denominator = -1;
  assert.throws(() => buildImpactEvaluationArtifact(frozen), /RULE_IMPACT_RESULT_INPUT_INVALID/);
  const privateLineage = argumentsFor(examples.find(({ state }) => state === 'collecting'));
  privateLineage.lineage.rule_id = '/home/private';
  assert.throws(() => buildImpactEvaluationArtifact(privateLineage), /RULE_IMPACT_RESULT_INPUT_INVALID/);
  for (const [state, tier] of [['superseded', 'global'], ['expired', 'project']]) {
    const terminal = argumentsFor(examples.find((artifact) => artifact.state === state));
    terminal.tier = tier;
    const built = buildImpactEvaluationArtifact(terminal);
    assert.equal(parseImpactEvaluationBytes(built.bytes).artifact.schema, `passive-impact-${tier}-result-v1`);
  }
});
function lifecycleExamples() {
  return loadPlan046ImpactResultExamples().map(({ bytes }) => parseImpactEvaluationBytes(bytes));
}
function lifecycleCurrent(parsed) {
  const lineage = parsed.artifact.lineage;
  return {
    tier: parsed.artifact.tier, scope_id: lineage.scope_id, rule_id: lineage.rule_id,
    version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash,
    accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch,
    policy_id: lineage.policy_id, policy_digest: lineage.policy_digest,
    resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest,
    exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest,
    measurement_input_id: lineage.measurement_input_id, measurement_input_digest: lineage.measurement_input_digest,
    evaluation_input_digest: lineage.evaluation_input_digest, minimum_head_sequence: 1,
  };
}

test('LT-01–LT-07 build only exact terminal ER bytes from closed transitions', () => {
  const prior = lifecycleExamples().find(({ artifact }) => artifact.state === 'collecting');
  const current = lifecycleCurrent(prior);
  const safeLineage = { ...prior.artifact.lineage, evaluation_input_digest: null, accepted_commit: null };
  const at = '2026-08-12T12:00:00.000Z';
  const cases = [
    ['authority_blocked', { kind: 'authority_blocked', reason: 'authority_drift', safe_lineage_subset: safeLineage }, current, null, 'blocked', 'authority_drift'],
    ['policy_changed', { kind: 'policy_changed', prior_policy_digest: current.policy_digest, next_policy_digest: 'f'.repeat(64), event_digest: 'e'.repeat(64) }, { ...current, policy_digest: 'f'.repeat(64) }, prior.bytes, 'superseded', 'policy_changed'],
    ['target_version_changed', { kind: 'target_version_changed', prior_version_hash: current.version_hash, next_version_hash: 'f'.repeat(64), event_digest: 'e'.repeat(64) }, { ...current, version_hash: 'f'.repeat(64) }, prior.bytes, 'superseded', 'target_version_changed'],
    ['target_epoch_changed', { kind: 'target_epoch_changed', prior_activation_epoch: current.activation_epoch, next_activation_epoch: 'epoch:next', event_digest: 'e'.repeat(64) }, { ...current, activation_epoch: 'epoch:next' }, prior.bytes, 'superseded', 'target_epoch_changed'],
    ['result_replaced', { kind: 'result_replaced', next_result_id: `passive-impact-global:${'e'.repeat(64)}`, next_result_digest: 'e'.repeat(64) }, current, prior.bytes, 'superseded', 'result_replaced'],
    ['policy_expired', { kind: 'policy_expired', policy_digest: current.policy_digest, expired_at: '2026-08-12T11:59:59.999Z', event_digest: 'e'.repeat(64) }, current, prior.bytes, 'expired', 'policy_expired'],
    ['result_expired', { kind: 'result_expired', expires_at: '2026-08-12T11:59:59.999Z' }, current, prior.bytes, 'expired', 'result_expired'],
  ];
  for (const [name, transition, currentAuthority, priorResultBytes, state, reason] of cases) {
    const result = buildImpactLifecycleResult({ tier: 'global', transition, priorResultBytes, currentAuthority, at });
    const parsed = parseImpactEvaluationBytes(result.bytes);
    assert.equal(parsed.artifact.state, state, name);
    assert.equal(parsed.artifact.reason, reason, name);
    assert.equal(parsed.result_digest, result.digest, name);
    assert.equal(result.bytes.equals(buildImpactLifecycleResult({ tier: 'global', transition, priorResultBytes, currentAuthority, at }).bytes), true, `${name} is deterministic`);
    if (state === 'blocked') assert.equal(parsed.artifact.prior_result, null);
    else {
      assert.deepEqual(parsed.artifact.prior_result, { prior_result_id: prior.result_id, prior_result_digest: prior.result_digest, state_reason: reason, state_at: at });
      assert.equal(parsed.artifact.cohorts.length + parsed.artifact.comparisons.length + parsed.artifact.dimensions.length + parsed.artifact.balance.length, 0);
    }
  }
});
test('F137-04 result replacement accepts distinct nonself-ID and full-byte digest domains, blocks swapped prior links', () => {
  const prior = lifecycleExamples().find(({ artifact }) => artifact.state === 'collecting' && artifact.tier === 'global');
  const successor = lifecycleExamples().find(({ artifact }) => artifact.state === 'repeated_observational_harm' && artifact.tier === prior.artifact.tier);
  const current = lifecycleCurrent(prior);
  const at = '2026-08-12T12:00:00.000Z';
  assert.notEqual(successor.result_identity_digest, successor.result_digest, 'fixture proves intentionally distinct digest domains');
  const valid = buildImpactLifecycleResult({ tier: 'global', transition: { kind: 'result_replaced', next_result_id: successor.result_id, next_result_digest: successor.result_digest }, priorResultBytes: prior.bytes, currentAuthority: current, at });
  assert.equal(valid.artifact.reason, 'result_replaced');
  assert.throws(() => buildImpactLifecycleResult({ tier: 'global', transition: { kind: 'result_replaced', next_result_id: prior.result_id, next_result_digest: successor.result_digest }, priorResultBytes: prior.bytes, currentAuthority: current, at }), /RULE_IMPACT_RESULT_INPUT_INVALID/, 'prior nonself ID cannot pair with successor full bytes digest');
  assert.throws(() => buildImpactLifecycleResult({ tier: 'global', transition: { kind: 'result_replaced', next_result_id: successor.result_id, next_result_digest: prior.result_digest }, priorResultBytes: prior.bytes, currentAuthority: current, at }), /RULE_IMPACT_RESULT_INPUT_INVALID/, 'successor nonself ID cannot pair with prior full bytes digest');
});
test('BD-29 closes policy changes as superseded and rejects corrupt prior lifecycle authority', () => {
  const prior = lifecycleExamples().find(({ artifact }) => artifact.state === 'collecting');
  const current = lifecycleCurrent(prior);
  const transition = { kind: 'target_version_changed', prior_version_hash: current.version_hash, next_version_hash: 'f'.repeat(64), event_digest: 'e'.repeat(64) };
  const request = { tier: 'global', transition, priorResultBytes: prior.bytes, currentAuthority: { ...current, version_hash: 'f'.repeat(64) }, at: '2026-08-12T12:00:00.000Z' };
  assert.equal(buildImpactLifecycleResult({ ...request, currentAuthority: current }).artifact.reason, 'authority_drift');
  assert.throws(() => buildImpactLifecycleResult({ ...request, currentAuthority: { ...request.currentAuthority, rule_id: '/home/private' } }), /RULE_IMPACT_RESULT_INPUT_INVALID/);
  assert.throws(() => buildImpactLifecycleResult({ ...request, at: '2026-08-12T12:00:00Z' }), /RULE_IMPACT_RESULT_INPUT_INVALID/);
  assert.throws(() => buildImpactLifecycleResult({ ...request, priorResultBytes: Buffer.concat([prior.bytes, Buffer.from(' ')]) }), /RULE_IMPACT_RESULT_INPUT_INVALID/);
  assert.throws(() => buildImpactLifecycleResult({ ...request, transition: { kind: 'result_replaced', next_result_id: `passive-impact-project:${'e'.repeat(64)}`, next_result_digest: 'e'.repeat(64) } }), /RULE_IMPACT_RESULT_INPUT_INVALID/);
});
test('BD-27 persists immutable total ER, retries exact bytes, and rejects digest substitution', () => {
  const { bytes, result_digest: resultDigest } = loadPlan046ImpactResultExamples()[0];
  const parsed = parseImpactEvaluationBytes(bytes);
  const lineage = parsed.artifact.lineage;
  const expectedLineage = {
    tier: parsed.artifact.tier, scope_id: lineage.scope_id, rule_id: lineage.rule_id,
    version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash,
    accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch,
    policy_id: lineage.policy_id, policy_digest: lineage.policy_digest,
    resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest,
    exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest,
    measurement_input_id: lineage.measurement_input_id, measurement_input_digest: lineage.measurement_input_digest,
    evaluation_input_digest: lineage.evaluation_input_digest,
  };
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-total-er-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    const first = recordImpactEvaluation({ store, stateRoot, resultBytes: bytes, resultDigest, expectedLineage });
    assert.equal(first.outcome, 'recorded');
    const retry = recordImpactEvaluation({ store, stateRoot, resultBytes: bytes, resultDigest, expectedLineage });
    assert.equal(retry.outcome, 'existing');
    assert.deepEqual({ ...retry, outcome: first.outcome }, first);
    const read = readImpactEvaluation({ store, stateRoot, resultId: first.result_id, expectedCurrent: { ...expectedLineage, minimum_head_sequence: first.head_sequence } });
    assert.equal(read.outcome, 'available');
    assert.equal(read.bytes.equals(bytes), true);
    assert.throws(() => recordImpactEvaluation({ store, stateRoot, resultBytes: bytes, resultDigest: 'f'.repeat(64), expectedLineage }), /RULE_IMPACT_RESULT_IDENTITY_INVALID/);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Slice3 writes immutable LT-01 blocked ER with safe null lineage fields', () => {
  const prior = lifecycleExamples().find(({ artifact }) => artifact.state === 'collecting');
  const current = lifecycleCurrent(prior);
  const safe = { ...prior.artifact.lineage, accepted_commit: null, evaluation_input_digest: null };
  const blocked = buildImpactLifecycleResult({ tier: 'global', transition: { kind: 'authority_blocked', reason: 'impact_contract_unavailable', safe_lineage_subset: safe }, priorResultBytes: null, currentAuthority: current, at: '2026-08-12T12:00:00.000Z' });
  const expectedLineage = { ...current }; delete expectedLineage.minimum_head_sequence; expectedLineage.accepted_commit = null; expectedLineage.evaluation_input_digest = null;
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s3-blocked-er-')); const store = openRuleLifecycleStore({ stateRoot });
  try {
    const recorded = recordImpactEvaluation({ store, stateRoot, resultBytes: blocked.bytes, resultDigest: blocked.digest, expectedLineage });
    assert.equal(recorded.outcome, 'recorded');
    assert.equal(recordImpactEvaluation({ store, stateRoot, resultBytes: blocked.bytes, resultDigest: blocked.digest, expectedLineage }).outcome, 'existing');
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-152-02 atomically claims one parser-bound terminal ER per exact prior', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-f152-terminal-')); const store = openRuleLifecycleStore({ stateRoot });
  const fixture = lifecycleExamples().find(({ artifact }) => artifact.state === 'collecting' && artifact.tier === 'global');
  const lineage = fixture.artifact.lineage;
  const expectedLineage = { tier: fixture.artifact.tier, scope_id: lineage.scope_id, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash, accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest, resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest, exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest, measurement_input_id: lineage.measurement_input_id, measurement_input_digest: lineage.measurement_input_digest, evaluation_input_digest: lineage.evaluation_input_digest };
  try {
    const prior = recordImpactEvaluation({ store, stateRoot, resultBytes: fixture.bytes, resultDigest: fixture.result_digest, expectedLineage });
    const current = { ...expectedLineage, minimum_head_sequence: prior.head_sequence };
    const transition = { kind: 'target_version_changed', prior_version_hash: fixture.artifact.lineage.rule_version_hash, next_version_hash: 'f'.repeat(64), event_digest: 'e'.repeat(64) };
    const first = buildImpactLifecycleResult({ tier: 'global', transition, priorResultBytes: fixture.bytes, currentAuthority: { ...current, version_hash: transition.next_version_hash }, at: '2026-08-12T12:00:00.000Z' });
    const second = buildImpactLifecycleResult({ tier: 'global', transition, priorResultBytes: fixture.bytes, currentAuthority: { ...current, version_hash: transition.next_version_hash }, at: '2026-08-13T00:00:00.000Z' });
    assert.equal(recordTerminalImpactEvaluation({ store, stateRoot, resultBytes: first.bytes, resultDigest: first.digest }).outcome, 'recorded');
    assert.equal(recordTerminalImpactEvaluation({ store, stateRoot, resultBytes: first.bytes, resultDigest: first.digest }).outcome, 'existing', 'exact retry preserves one claim');
    assert.throws(() => recordTerminalImpactEvaluation({ store, stateRoot, resultBytes: second.bytes, resultDigest: second.digest }), /RULE_IMPACT_RESULT_CONFLICT/);
    assert.deepEqual(readLatestImpactEvaluationPrior({ store, stateRoot, selector: current }), { outcome: 'blocked', reason: 'prior_unavailable' }, 'claimed prior cannot re-enter automatic selection');
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_evaluation_terminal WHERE prior_result_id = ?').get(prior.result_id).count, 1);
    const { schema, result_id, estimator_id, ...operands } = fixture.artifact;
    const faultPriorBytes = buildImpactEvaluationArtifact({ ...operands, created_at: '2026-08-12T12:00:01.000Z' });
    const faultPrior = recordImpactEvaluation({ store, stateRoot, resultBytes: faultPriorBytes.bytes, resultDigest: faultPriorBytes.result_digest, expectedLineage });
    const faultTerminal = buildImpactLifecycleResult({ tier: 'global', transition, priorResultBytes: faultPriorBytes.bytes, currentAuthority: { ...current, version_hash: transition.next_version_hash, minimum_head_sequence: faultPrior.head_sequence }, at: '2026-08-12T12:00:02.000Z' });
    db.exec("CREATE TRIGGER f152_terminal_fault BEFORE INSERT ON impact_evaluation_terminal BEGIN SELECT RAISE(ABORT, 'terminal relation fault'); END");
    assert.throws(() => recordTerminalImpactEvaluation({ store, stateRoot, resultBytes: faultTerminal.bytes, resultDigest: faultTerminal.digest }), /RULE_IMPACT_RESULT_STORAGE_UNAVAILABLE/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_evaluation_terminal WHERE prior_result_id = ?').get(faultPrior.result_id).count, 0, 'relation fault rolls back terminal index too');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_evaluation_index WHERE result_id = ?').get(faultTerminal.artifact.result_id).count, 0, 'no indexed orphan after relation fault');
    assert.equal(existsSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${faultTerminal.digest}.json`)), true, 'blob-first terminal stays inert after rollback');
    db.close();
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Plan046 S2 selects only rehashed W1 bytes inside exact half-open window and returns typed tamper blocker', () => {
  const input = buildRuleImpactInput({ authority, measurement: completeMeasurement() });
  const payload = JSON.parse(input.bytes);
  const reference = { exposure_id: payload.exposure_publication.exposure_id, publication_digest: payload.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, target_ordinal: 0, tier: 'global', scope_id: '', production_started_at: '2026-08-11T00:00:00.000Z', captured_at: authority.captured_at };
  const request = { stateRoot: '/unused', store: { listIndexedImpactInputs: () => [reference] }, target: authority.resolver_boundary.target_rule, target_t0: '2026-08-11T00:00:00.000Z' };
  const accepted = selectVerifiedImpactFamilies({ ...request, readIndexed: () => ({ outcome: 'available', bytes: input.bytes }) });
  assert.equal(accepted.outcome, 'available');
  assert.deepEqual(accepted.families.map(({ window_code, production_started_at }) => ({ window_code, production_started_at })), [{ window_code: 'W1', production_started_at: '2026-08-11T00:00:00.000Z' }]);
  const end = structuredClone(reference); end.production_started_at = '2026-09-10T00:00:00.000Z';
  const crossing = selectVerifiedImpactFamilies({ ...request, store: { listIndexedImpactInputs: () => [end] }, readIndexed: () => ({ outcome: 'available', bytes: input.bytes }) });
  assert.deepEqual(crossing.exclusions, [{ window_code: 'W2', reason: 'indexed_time_mismatch', count: 1 }]);
  assert.deepEqual(selectVerifiedImpactFamilies({ ...request, readIndexed: () => ({ outcome: 'available', bytes: Buffer.from('{}') }) }), { outcome: 'blocked', reason: 'indexed_input_tampered' });
});
test('Plan046 S2 C1/C2 closes exact windows, terminal boundaries, family conflicts, contract bins, target identity, scope, and bounds', () => {
  const t0 = '2026-10-01T00:00:00.000Z';
  const captured_at = '2026-12-01T00:00:00.000Z';
  const other = { ...target, rule_id: 'pidex-global:pidex-planner:quality' };
  const at = (days) => new Date(Date.parse(t0) + days * 86400000).toISOString();
  const record = ({ days, run_family_id, active_rules = [target], outcome_days = days, measurement = {} }) => {
    const source = authorityFor({ active_rules, captured_at });
    const input = buildRuleImpactInput({ authority: source, measurement: { ...completeMeasurement(), ...measurement, run_family_id, production_started_at: at(days), outcome_finalized_at: at(outcome_days) } });
    assert.equal(input.collection_disposition, 'eligible', `${run_family_id}:${input.collection_reason}`);
    const payload = JSON.parse(input.bytes);
    return { reference: { exposure_id: payload.exposure_publication.exposure_id, publication_digest: payload.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, target_ordinal: 0, tier: 'global', scope_id: '', production_started_at: at(days), captured_at }, bytes: input.bytes };
  };
  const select = (records, overrides = {}) => {
    const bytes = new Map(records.map((item) => [item.reference.input_id, item.bytes]));
    return selectVerifiedImpactFamilies({ stateRoot: '/unused', store: { listIndexedImpactInputs: () => records.map((item) => item.reference) }, target, target_t0: t0, readIndexed: ({ reference }) => ({ outcome: 'available', bytes: bytes.get(reference.input_id) }), ...overrides });
  };
  const windows = [record({ days: -60, run_family_id: 'h2', active_rules: [other], outcome_days: -59 }), record({ days: -30, run_family_id: 'h1', active_rules: [other], outcome_days: -29 }), record({ days: 0, run_family_id: 'w1', outcome_days: 1 }), record({ days: 30, run_family_id: 'w2', outcome_days: 31 })];
  const accepted = select(windows);
  assert.deepEqual(accepted.families.map((family) => family.window_code), ['H2', 'H1', 'W1', 'W2']);
  assert.equal(accepted.families[2].family_id, 'run-family:16f1a91bebd32972a66107cb498b3009fb439864a8606f3aff546cdb292c9a4d');
  assert.deepEqual(Object.keys(accepted.families[2].fingerprint.key), ['plan_id', 'plan_class', 'project_scope', 'outcome_definition_id', 'outcome_definition_version', 'model_provider', 'model_identity', 'model_version', 'pipeline_version', 'config_digest', 'workload_risk_fingerprint_class', 'route_topology', 'agent_role', 'agent_version', 'phase', 'capability_set', 'budget_class', 'non_target_rules', 'covariate_bins']);
  assert.equal(accepted.families[2].fingerprint.key_digest, 'be928f38f0ee0df765268d8417db8eff9e4d5a928fd4cf769f767b23fecf1633');
  const refMismatch = { ...completeMeasurement(), impact_contract_ref: 'contract:other' };
  assert.equal(buildRuleImpactInput({ authority, measurement: refMismatch }).collection_reason, 'impact_contract_invalid');
  const crossings = [-30, 0, 30, 60].map((outcome_days, index) => record({ days: [-60, -30, 0, 30][index], run_family_id: `cross-${index}`, active_rules: index < 2 ? [other] : [target], outcome_days }));
  assert.deepEqual(select(crossings).exclusions.map(({ window_code, reason }) => [window_code, reason]), [['H2', 'terminal_outside_window'], ['H1', 'terminal_outside_window'], ['W1', 'terminal_outside_window'], ['W2', 'terminal_outside_window']]);
  const outside = [{ ...windows[0], reference: { ...windows[0].reference, production_started_at: at(-61) } }, { ...windows[3], reference: { ...windows[3].reference, production_started_at: at(60) } }];
  assert.equal(select(outside).families.length, 0);
  assert.deepEqual(select([windows[2]], { readIndexed: () => ({ outcome: 'unavailable' }) }), { outcome: 'blocked', reason: 'indexed_input_unavailable' });
  const mismatch = { ...windows[2], reference: { ...windows[2].reference, production_started_at: at(1) } };
  assert.deepEqual(select([mismatch]).exclusions, [{ window_code: 'W1', reason: 'indexed_time_mismatch', count: 1 }]);
  assert.equal(select([windows[2], windows[2]]).families.length, 1, 'byte-identical tuple duplicates collapse');
  const conflict = record({ days: 0, run_family_id: 'w1', measurement: { outcome_vector: { latency: 2 } } });
  assert.deepEqual(select([windows[2], conflict]).exclusions, [{ window_code: 'W1', reason: 'family_authority_conflict', count: 2 }]);
  for (const changed of [{ version_hash: 'f'.repeat(64) }, { activation_epoch: 'epoch:other' }]) {
    const wrong = { ...target, ...changed };
    const result = select([record({ days: -30, run_family_id: `wrong-${Object.keys(changed)[0]}`, active_rules: [wrong], outcome_days: -29 })]);
    assert.deepEqual(result.exclusions, [{ window_code: 'H1', reason: 'target_presence_invalid', count: 1 }]);
  }
  const binContract = JSON.stringify({ contract_id: 'contract:bins', contract_version: '1', created_at: '2026-08-01T00:00:00.000Z', valid_from: '2026-08-02T00:00:00.000Z', outcome_definition_id: 'latency', outcome_definition_version: '1', dimensions: [{ id: 'latency', role: 'primary', extractor_id: 'extractor', extractor_version: '1', value_type: 'continuous', unit: 'ms', valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true, adverse_direction: 'higher', absolute_materiality: 1, required_raw_covariates: ['load'] }], raw_covariates: [{ id: 'load', unit: 'requests', valid_min: 0, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true, bins: [{ bin_id: 'load:low', ordinal: 0, valid_min: 0, valid_max: 50, valid_min_inclusive: true, valid_max_inclusive: false }, { bin_id: 'load:high', ordinal: 1, valid_min: 50, valid_max: 100, valid_min_inclusive: true, valid_max_inclusive: true }] }] });
  for (const [raw, bin_id] of [[0, 'load:low'], [50, 'load:high'], [100, 'load:high']]) {
    const result = select([record({ days: 0, run_family_id: `bin-${raw}`, measurement: { impact_contract_ref: 'contract:bins', impact_contract_bytes: binContract, impact_contract_digest: sha256(binContract), raw_pre_outcome_covariates: { load: raw } } })]);
    assert.equal(result.families[0].fingerprint.key.covariate_bins.load.bin_id, bin_id);
  }
  const foreign = { ...windows[2], reference: { ...windows[2].reference, scope_id: 'foreign' } };
  assert.equal(select([foreign]).families.length, 0, 'foreign scope cannot enter global pool');
  assert.deepEqual(select(Array.from({ length: 257 }, () => windows[2])), { outcome: 'blocked', reason: 'indexed_inputs_unavailable' });
});
test('Plan046 S2 binds accepted family sources privately, sorts duplicate records, and re-verifies only exact same-invocation authority', () => {
  const t0 = '2026-10-01T00:00:00.000Z';
  const captured_at = '2026-12-01T00:00:00.000Z';
  const source = authorityFor({ captured_at });
  const makeRecord = ({ target_ordinal, outcome = 1 } = {}) => {
    const input = buildRuleImpactInput({ authority: source, measurement: { ...completeMeasurement(), run_family_id: 'lineage-family', production_started_at: t0, outcome_finalized_at: '2026-10-02T00:00:00.000Z', outcome_vector: { latency: outcome } } });
    assert.equal(input.collection_disposition, 'eligible');
    const payload = JSON.parse(input.bytes);
    return { reference: { exposure_id: payload.exposure_publication.exposure_id, publication_digest: payload.exposure_publication.publication_digest, input_id: input.input_id, input_digest: input.input_digest, target_ordinal, tier: 'global', scope_id: '', production_started_at: t0, captured_at }, bytes: input.bytes };
  };
  const high = makeRecord({ target_ordinal: 9 });
  const low = { ...high, reference: { ...high.reference, target_ordinal: 1 } };
  let mode = 'available';
  const listed = [];
  const store = { listIndexedImpactInputs(request) { listed.push(request); return [high.reference, low.reference]; } };
  const readIndexed = ({ reference }) => mode === 'missing' ? { outcome: 'unavailable' } : mode === 'mutated' ? { outcome: 'available', bytes: Buffer.from('{}') } : { outcome: 'available', bytes: high.bytes };
  const selection = selectVerifiedImpactFamilies({ stateRoot: '/lineage-root', store, target, target_t0: t0, readIndexed });
  assert.equal(selection.outcome, 'available');
  assert.deepEqual(listed, [{ tier: 'global', scope_id: '', start_at: '2026-08-02T00:00:00.000Z', end_at: '2026-11-30T00:00:00.000Z' }]);
  assert.deepEqual(Object.keys(selection), ['outcome', 'families', 'exclusions']);
  assert.equal(JSON.stringify(selection).includes(high.reference.input_id), false, 'outward selection omits source input ID');
  assert.equal(JSON.stringify(selection).includes(high.reference.input_digest), false, 'outward selection omits source digest');
  const family = selection.families[0];
  const sources = getVerifiedImpactFamilySources({ selection, family });
  assert.equal(sources.outcome, 'available');
  assert.deepEqual(sources.records.map((record) => Object.keys(record)), [
    ['exposure_id', 'publication_digest', 'input_id', 'input_digest', 'target_ordinal', 'tier', 'scope_id', 'production_started_at', 'captured_at', 'terminal_byte_domain', 'terminal_byte_digest'],
    ['exposure_id', 'publication_digest', 'input_id', 'input_digest', 'target_ordinal', 'tier', 'scope_id', 'production_started_at', 'captured_at', 'terminal_byte_domain', 'terminal_byte_digest'],
  ]);
  assert.deepEqual(sources.records.map(({ target_ordinal, tier, scope_id, terminal_byte_domain, terminal_byte_digest }) => ({ target_ordinal, tier, scope_id, terminal_byte_domain, terminal_byte_digest })), [
    { target_ordinal: 1, tier: 'global', scope_id: '', terminal_byte_domain: 'rule-impact-input-v1', terminal_byte_digest: high.reference.input_digest },
    { target_ordinal: 9, tier: 'global', scope_id: '', terminal_byte_domain: 'rule-impact-input-v1', terminal_byte_digest: high.reference.input_digest },
  ]);
  assert.deepEqual(reverifyVerifiedImpactFamilySource({ stateRoot: '/lineage-root', store, selection, family, source: sources.records[0] }), { outcome: 'available' });
  assert.deepEqual(reverifyVerifiedImpactFamilySource({ stateRoot: '/other-root', store, selection, family, source: sources.records[0] }), { outcome: 'unavailable' }, 'state-root binding rejects cross-root source use');
  assert.deepEqual(reverifyVerifiedImpactFamilySource({ stateRoot: '/lineage-root', store, selection, family, source: { ...sources.records[0] } }), { outcome: 'unavailable' }, 'caller cannot inject cloned source record');
  assert.deepEqual(getVerifiedImpactFamilySources({ selection, family: { ...family } }), { outcome: 'unavailable' }, 'caller cannot inject cloned family projection');
  mode = 'mutated';
  assert.deepEqual(reverifyVerifiedImpactFamilySource({ stateRoot: '/lineage-root', store, selection, family, source: sources.records[0] }), { outcome: 'unavailable' }, 'mutation blocks reverify');
  mode = 'missing';
  assert.deepEqual(reverifyVerifiedImpactFamilySource({ stateRoot: '/lineage-root', store, selection, family, source: sources.records[0] }), { outcome: 'unavailable' }, 'deletion blocks reverify');
  const conflict = makeRecord({ target_ordinal: 2, outcome: 2 });
  const conflicted = selectVerifiedImpactFamilies({ stateRoot: '/lineage-root', store: { listIndexedImpactInputs: () => [low.reference, conflict.reference] }, target, target_t0: t0, readIndexed: ({ reference }) => ({ outcome: 'available', bytes: reference.input_id === conflict.reference.input_id ? conflict.bytes : high.bytes }) });
  assert.deepEqual(conflicted.families, []);
  assert.deepEqual(conflicted.exclusions, [{ window_code: 'W1', reason: 'family_authority_conflict', count: 2 }]);
  assert.deepEqual(getVerifiedImpactFamilySources({ selection: conflicted, family }), { outcome: 'unavailable' }, 'conflicting family exposes no retained record');
});
test('API-09 assembler rejects caller EI/family injection before authority reads', () => {
  const result = assembleImpactEvaluatorInput({ stateRoot: '/unused', store: {}, target, target_t0: '2026-10-01T00:00:00.000Z', families: [], input_bytes: Buffer.from('{}') });
  assert.deepEqual(result, { outcome: 'blocked', reason: 'assembly_request_invalid' });
});
test('API-09 assembles parser-accepted multi-family EI from real SQLite authority and hides private lineage', async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-api09-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const t0 = '2026-10-01T00:00:00.000Z';
  const heads = { global: '1'.repeat(40) };
  const other = { ...target, rule_id: 'pidex-global:pidex-planner:quality', version_hash: 'f'.repeat(64), content_hash: 'f'.repeat(64) };
  const at = (days) => new Date(Date.parse(t0) + days * 86400000).toISOString();
  const storeTarget = { tier: target.tier, scope_id: '', rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch };
  const openingBase = { kind: 'activation_opened', opening_id: 'opening:api09', opened_at: t0, rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, accepted_commit: target.accepted_commit, source_heads: heads, mirror_heads: heads, projection_revision: 1 };
  const opening = { kind: openingBase.kind, opening_id: openingBase.opening_id, opening_digest: sha256(JSON.stringify(openingBase)), opened_at: openingBase.opened_at, rule_id: openingBase.rule_id, version_hash: openingBase.version_hash, activation_epoch: openingBase.activation_epoch, accepted_commit: openingBase.accepted_commit, source_heads: openingBase.source_heads, mirror_heads: openingBase.mirror_heads, projection_revision: openingBase.projection_revision };
  const openingBytes = Buffer.from(JSON.stringify(opening));
  const contractBytes = Buffer.from(acceptedImpactContract());
  const capture = (days, run_family_id, active_rules, marker) => {
    const source = authorityFor({ active_rules, captured_at: at(days + 1), source_heads: heads, mirror_heads: heads });
    const authorityWithExposure = { ...source, exposure_publication: { ...source.exposure_publication, exposure_id: `exposure:${marker.repeat(64)}` } };
    const captured = captureRuleImpactFanout({ stateRoot, store, authority: authorityWithExposure, measurement: { ...completeMeasurement(), run_family_id, production_started_at: at(days), outcome_finalized_at: at(days + 1) } });
    assert.equal(captured.outcome, 'success');
    return { captured, resolver_snapshot: JSON.parse(source.fresh_runtime.resolver_snapshot_bytes), publicationIdentity: { exposure_id: authorityWithExposure.exposure_publication.exposure_id, publication_digest: authorityWithExposure.exposure_publication.publication_digest } };
  };
  try {
    store.recordLifecycleImpactOpening({ target: storeTarget, opening_kind: opening.kind, opening_id: opening.opening_id, opening_digest: opening.opening_digest, opening_bytes: openingBytes, opened_at: t0, accepted_head: target.accepted_commit, source_head: heads.global, mirror_head: heads.global, projection_revision: '1' });
    store.recordImpactContract({ impact_contract_ref: 'contract:1', impact_contract_digest: sha256(contractBytes), impact_contract_bytes: contractBytes });
    capture(-60, 'h2', [other], '2'); capture(-30, 'h1', [other], '3'); const evaluated = capture(0, 'w1', [target], '4'); capture(30, 'w2', [target], '5');
    const selection = selectVerifiedImpactFamilies({ stateRoot, store, target, target_t0: t0 });
    assert.equal(selection.outcome, 'available', JSON.stringify(selection));
    assert.ok(store.readLifecycleImpactOpening({ target: storeTarget }));
    assert.equal(store.listLifecycleImpactEvents({ target: storeTarget, start_at: at(-60), end_at: at(60) }).length, 0);
    assert.deepEqual(selection.families.map(({ window_code }) => window_code), ['H2', 'H1', 'W1', 'W2'], JSON.stringify(selection));
    assert.equal(getVerifiedImpactFamilySources({ selection, family: selection.families[0] }).outcome, 'available');
    for (const family of selection.families) {
      const retained = getVerifiedImpactFamilySources({ selection, family });
      for (const source of retained.records) assert.equal(reverifyVerifiedImpactFamilySource({ stateRoot, store, selection, family, source }).outcome, 'available');
    }
    const assembled = assembleImpactEvaluatorInput({ stateRoot, store, target, target_t0: t0 });
    assert.equal(assembled.outcome, 'ready', JSON.stringify(assembled));
    assert.equal(assembled.evaluation_input_digest, sha256(assembled.input_bytes));
    const parsed = (await import('./rule-impact-evaluator.mjs')).parseEvaluatorInputBytes(assembled.input_bytes, { expectedInputDigest: assembled.evaluation_input_digest });
    assert.deepEqual(parsed.families.map(({ window_code }) => window_code), ['H2', 'H1', 'W1', 'W2']);
    assert.equal(new Set(parsed.families.map(({ provenance }) => provenance.measurement_input_digest)).size, 1);
    assert.equal(parsed.families[0].provenance.measurement_input_digest, assembled.measurement_input_digest);
    assert.deepEqual(Object.keys(assembled.lineage), ['tier', 'scope_id', 'rule_id', 'version_hash', 'activation_epoch', 'measurement_input_digest', 'evaluation_input_digest']);
    assert.equal(JSON.stringify(assembled).includes('exposure:'), false);
    assert.equal(JSON.stringify(assembled).includes('source_heads'), false);
    const due = store.upsertImpactCadenceCheckpoint({ target: storeTarget, policy_id: policyForTier(target.tier).policy_id, policy_digest: policyDigest(target.tier), opening_id: opening.opening_id, opening_digest: opening.opening_digest, checkpoint_kind: 'freeze' });
    const cadence = runRuleImpactCadence({ ordinary: true, stateRoot, store, publicationIdentity: evaluated.publicationIdentity, capture: { target_input_ids: evaluated.captured.target_input_ids }, currentAuthorityProvider: () => Object.freeze({ resolver_snapshot: evaluated.resolver_snapshot }), evaluationAt: due.due_at });
    assert.equal(cadence.status, 'evaluated', JSON.stringify(cadence));
    assert.notEqual(cadence.reason, 'evaluation_pending');
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_evaluation_index').get().count, 1, 'cadence indexes immutable ER before terminal checkpoint');
    db.close();
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-152-01 closes aggregate authority across post-mint mutations, reads, faults, and writers', () => {
  const t0 = '2026-10-01T00:00:00.000Z';
  const setup = () => {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-f15201-'));
    const store = openRuleLifecycleStore({ stateRoot });
    const heads = { global: '1'.repeat(40) };
    const other = { ...target, rule_id: 'pidex-global:pidex-planner:quality', version_hash: 'f'.repeat(64), content_hash: 'f'.repeat(64) };
    const at = (days) => new Date(Date.parse(t0) + days * 86400000).toISOString();
    const storeTarget = { tier: target.tier, scope_id: '', rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch };
    const openingBase = { kind: 'activation_opened', opening_id: 'opening:f15201', opened_at: t0, rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, accepted_commit: target.accepted_commit, source_heads: heads, mirror_heads: heads, projection_revision: 1 };
    const opening = { kind: openingBase.kind, opening_id: openingBase.opening_id, opening_digest: sha256(JSON.stringify(openingBase)), opened_at: openingBase.opened_at, rule_id: openingBase.rule_id, version_hash: openingBase.version_hash, activation_epoch: openingBase.activation_epoch, accepted_commit: openingBase.accepted_commit, source_heads: openingBase.source_heads, mirror_heads: openingBase.mirror_heads, projection_revision: openingBase.projection_revision };
    const openingBytes = Buffer.from(JSON.stringify(opening));
    const contractBytes = Buffer.from(acceptedImpactContract());
    const eventBytes = Buffer.from('{"event":"f15201"}'); const eventDigest = sha256(eventBytes);
    const capture = (days, run_family_id, active_rules, marker) => {
      const source = authorityFor({ active_rules, captured_at: at(days + 1), source_heads: heads, mirror_heads: heads });
      const authorityWithExposure = { ...source, exposure_publication: { ...source.exposure_publication, exposure_id: `exposure:${marker.repeat(64)}` } };
      assert.equal(captureRuleImpactFanout({ stateRoot, store, authority: authorityWithExposure, measurement: { ...completeMeasurement(), run_family_id, production_started_at: at(days), outcome_finalized_at: at(days + 1) } }).outcome, 'success');
    };
    store.recordLifecycleImpactOpening({ target: storeTarget, opening_kind: opening.kind, opening_id: opening.opening_id, opening_digest: opening.opening_digest, opening_bytes: openingBytes, opened_at: t0, accepted_head: target.accepted_commit, source_head: heads.global, mirror_head: heads.global, projection_revision: '1' });
    store.recordImpactContract({ impact_contract_ref: 'contract:1', impact_contract_digest: sha256(contractBytes), impact_contract_bytes: contractBytes });
    store.recordLifecycleImpactEvent({ target: storeTarget, event_class: 'epoch', event_type: 'opening', event_id: 'event:f15201', event_digest: eventDigest, event_bytes: eventBytes, event_at: t0, effect: 'opened' });
    capture(-60, 'h2', [other], '2'); capture(-30, 'h1', [other], '3'); capture(0, 'w1', [target], '4'); capture(30, 'w2', [target], '5');
    const dbPath = path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite');
    const source = store.listIndexedImpactInputs({ tier: 'global', scope_id: '', start_at: at(-60), end_at: at(60) })[0];
    const aggregate = (options = {}) => {
      const proxy = Object.fromEntries(Object.entries(store).map(([key, value]) => [key, typeof value === 'function' ? value.bind(store) : value]));
      proxy.recordImpactInputAggregate = (request) => { options.mutate?.({ stateRoot, dbPath, source, opening, eventDigest }); return store.recordImpactInputAggregate({ ...request, fault: options.fault }); };
      return assembleImpactEvaluatorInput({ stateRoot, store: proxy, target, target_t0: t0 });
    };
    const counts = () => { const db = new DatabaseSync(dbPath); const value = { aggregates: db.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate').get().count, claims: db.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate_claim').get().count }; db.close(); return value; };
    return { stateRoot, store, dbPath, source, opening, eventDigest, capture, aggregate, counts, cleanup: () => { store.close(); rmSync(stateRoot, { recursive: true, force: true }); } };
  };
  const unavailable = (mutate) => {
    const fixture = setup();
    try {
      assert.deepEqual(fixture.aggregate({ mutate }), { outcome: 'blocked', reason: 'assembly_authority_unavailable' });
      assert.deepEqual(fixture.counts(), { aggregates: 0, claims: 0 });
    } finally { fixture.cleanup(); }
  };
  unavailable(({ stateRoot, source }) => rmSync(path.join(stateRoot, 'quality', 'rule-impact-input', `${source.input_digest}.json`)));
  {
    const fixture = setup();
    try {
      assert.deepEqual(fixture.aggregate({ fault: (point) => { if (point === 'after_preflight') writeFileSync(path.join(fixture.stateRoot, 'quality', 'rule-impact-input', `${fixture.source.input_digest}.json`), '{}'); } }), { outcome: 'blocked', reason: 'assembly_authority_unavailable' }, 'transaction reread rejects source mutation after optimistic proof');
      assert.deepEqual(fixture.counts(), { aggregates: 0, claims: 0 });
    } finally { fixture.cleanup(); }
  }
  unavailable(({ dbPath, source }) => { const db = new DatabaseSync(dbPath); db.prepare('DELETE FROM impact_input_history WHERE input_id = ?').run(source.input_id); db.close(); });
  unavailable(({ dbPath, source }) => { const db = new DatabaseSync(dbPath); db.prepare('DELETE FROM impact_publication_fanout WHERE exposure_id = ? AND publication_digest = ?').run(source.exposure_id, source.publication_digest); db.close(); });
  unavailable(({ dbPath, source }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_target_index SET input_digest = ? WHERE input_id = ?').run('0'.repeat(64), source.input_id); db.close(); });
  unavailable(({ stateRoot, opening }) => rmSync(path.join(stateRoot, 'quality', 'rule-impact-opening', `${sha256(Buffer.from(JSON.stringify(opening)))}.json`)));
  unavailable(({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_lifecycle_opening SET opening_bytes = ?').run(Buffer.from('{}')); db.close(); });
  unavailable(({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_lifecycle_event SET event_bytes = ?').run(Buffer.from('{}')); db.close(); });
  unavailable(({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_lifecycle_event SET event_digest = ?').run('0'.repeat(64)); db.close(); });
  unavailable(({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_contract_authority SET impact_contract_bytes = ?').run(Buffer.from('{}')); db.close(); });
  unavailable(({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_contract_authority SET impact_contract_digest = ?').run('0'.repeat(64)); db.close(); });
  for (const point of ['after_begin', 'after_blob_publication', 'before_index', 'before_commit']) {
    const fixture = setup();
    try {
      assert.deepEqual(fixture.aggregate({ fault: (seen) => { if (seen === point) throw new Error(`fault:${point}`); } }), { outcome: 'blocked', reason: 'assembly_authority_unavailable' });
      assert.deepEqual(fixture.counts(), { aggregates: 0, claims: 0 });
      const names = readdirSync(path.join(fixture.stateRoot, 'quality', 'rule-impact-input-aggregate')).filter((name) => name.endsWith('.json'));
      assert.equal(names.length, 1, 'published orphan stays unindexed');
      assert.deepEqual(fixture.store.readImpactInputAggregate({ measurement_input_id: `rule-impact-input:${names[0].slice(0, -5)}` }), { outcome: 'unavailable' });
      assert.equal(fixture.aggregate().outcome, 'ready', `exact retry after ${point}`);
    } finally { fixture.cleanup(); }
  }
  for (const mutate of [
    ({ stateRoot, source }) => writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-input', `${source.input_digest}.json`), '{}'),
    ({ dbPath, source }) => { const db = new DatabaseSync(dbPath); db.prepare('DELETE FROM impact_input_history WHERE input_id = ?').run(source.input_id); db.close(); },
    ({ dbPath, source }) => { const db = new DatabaseSync(dbPath); db.exec('PRAGMA foreign_keys = OFF'); db.prepare('DELETE FROM impact_publication_fanout WHERE exposure_id = ? AND publication_digest = ?').run(source.exposure_id, source.publication_digest); db.close(); },
    ({ dbPath, source }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_target_index SET input_digest = ? WHERE input_id = ?').run('0'.repeat(64), source.input_id); db.close(); },
    ({ stateRoot, opening }) => rmSync(path.join(stateRoot, 'quality', 'rule-impact-opening', `${sha256(Buffer.from(JSON.stringify(opening)))}.json`)),
    ({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_lifecycle_opening SET opening_bytes = ?').run(Buffer.from('{}')); db.close(); },
    ({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_lifecycle_event SET event_bytes = ?').run(Buffer.from('{}')); db.close(); },
    ({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_lifecycle_event SET event_digest = ?').run('0'.repeat(64)); db.close(); },
    ({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_contract_authority SET impact_contract_bytes = ?').run(Buffer.from('{}')); db.close(); },
    ({ dbPath }) => { const db = new DatabaseSync(dbPath); db.prepare('UPDATE impact_contract_authority SET impact_contract_digest = ?').run('0'.repeat(64)); db.close(); },
  ]) {
    const fixture = setup();
    try {
      const first = fixture.aggregate(); assert.equal(first.outcome, 'ready');
      mutate({ stateRoot: fixture.stateRoot, dbPath: fixture.dbPath, source: fixture.source, opening: fixture.opening });
      assert.deepEqual(fixture.store.readImpactInputAggregate({ measurement_input_id: first.measurement_input_id }), { outcome: 'unavailable' });
    } finally { fixture.cleanup(); }
  }
  for (const change of ['write', 'delete']) {
    const fixture = setup();
    try {
      const first = fixture.aggregate(); const file = path.join(fixture.stateRoot, 'quality', 'rule-impact-input-aggregate', `${first.measurement_input_digest}.json`);
      if (change === 'write') writeFileSync(file, '{}'); else rmSync(file);
      assert.deepEqual(fixture.store.readImpactInputAggregate({ measurement_input_id: first.measurement_input_id }), { outcome: 'unavailable' });
    } finally { fixture.cleanup(); }
  }
  const fixture = setup();
  try {
    const first = fixture.aggregate(); assert.equal(first.outcome, 'ready');
    assert.deepEqual(fixture.aggregate(), { ...first, outcome: 'ready' }, 'exact writer is idempotent through API-09');
    fixture.capture(-59, 'h2-conflict', [{ ...target, rule_id: 'pidex-global:pidex-planner:quality', version_hash: 'f'.repeat(64), content_hash: 'f'.repeat(64) }], '6');
    assert.deepEqual(fixture.aggregate(), { outcome: 'blocked', reason: 'assembly_authority_unavailable' }, 'different aggregate members conflict without partial claim');
    assert.deepEqual(fixture.counts(), { aggregates: 1, claims: 1 });
  } finally { fixture.cleanup(); }
});
test('Artifact149 derives persisted selector, verifies latest prior, and links exact replacement', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-artifact149-prior-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const base = lifecycleExamples().find(({ artifact }) => artifact.state === 'collecting' && artifact.tier === 'global');
  const toRecord = (created_at) => {
    const { schema, result_id, estimator_id, ...operands } = base.artifact;
    const built = buildImpactEvaluationArtifact({ ...operands, created_at });
    const lineage = built.artifact.lineage;
    const expectedLineage = { tier: built.artifact.tier, scope_id: lineage.scope_id, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash, accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest, resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest, exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest, measurement_input_id: lineage.measurement_input_id, measurement_input_digest: lineage.measurement_input_digest, evaluation_input_digest: lineage.evaluation_input_digest };
    return recordImpactEvaluation({ store, stateRoot, resultBytes: built.bytes, resultDigest: built.result_digest, expectedLineage });
  };
  try {
    const prior = toRecord('2026-08-12T12:00:00.000Z');
    const next = toRecord('2026-08-12T12:00:01.000Z');
    const selector = { ...lifecycleCurrent(base), minimum_head_sequence: prior.head_sequence };
    const selected = readLatestImpactEvaluationPrior({ store, stateRoot, selector });
    assert.equal(selected.outcome, 'available');
    assert.equal(selected.result_id, next.result_id);
    assert.equal(Object.hasOwn(selected, 'bytes'), false);
    assert.throws(() => recordImpactEvaluation({ store, stateRoot, resultBytes: next.bytes, resultDigest: next.result_digest, expectedLineage: { ...selector, minimum_head_sequence: undefined }, selector: { ...selector, rule_id: 'caller:contradiction' } }), /RULE_IMPACT_RESULT_INPUT_INVALID/);
    assert.deepEqual(linkImpactEvaluationReplacement({ store, stateRoot, priorResultId: prior.result_id, nextResultId: next.result_id, linkedAt: '2026-08-12T12:01:00.000Z' }), { outcome: 'linked' });
    assert.deepEqual(readImpactEvaluationReplacement({ store, stateRoot, priorResultId: prior.result_id }), { outcome: 'available', prior_result_id: prior.result_id, next_result_id: next.result_id, linked_at: '2026-08-12T12:01:00.000Z' });
    assert.deepEqual(linkImpactEvaluationReplacement({ store, stateRoot, priorResultId: prior.result_id, nextResultId: next.result_id, linkedAt: '2026-08-12T12:01:00.000Z' }), { outcome: 'existing' });
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Artifact149 internal prior bytes, current authority builder, and replacement proof stay closed', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-artifact149-internal-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const base = lifecycleExamples().find(({ artifact }) => artifact.state === 'collecting' && artifact.tier === 'global');
  const toRecord = (created_at) => {
    const { schema, result_id, estimator_id, ...operands } = base.artifact;
    const built = buildImpactEvaluationArtifact({ ...operands, created_at });
    const lineage = built.artifact.lineage;
    const expectedLineage = { tier: built.artifact.tier, scope_id: lineage.scope_id, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash, accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest, resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest, exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest, measurement_input_id: lineage.measurement_input_id, measurement_input_digest: lineage.measurement_input_digest, evaluation_input_digest: lineage.evaluation_input_digest };
    return recordImpactEvaluation({ store, stateRoot, resultBytes: built.bytes, resultDigest: built.result_digest, expectedLineage });
  };
  try {
    const prior = toRecord('2026-08-12T12:00:00.000Z');
    const next = toRecord('2026-08-12T12:00:01.000Z');
    const selector = { ...lifecycleCurrent(base), minimum_head_sequence: prior.head_sequence };
    const outward = readLatestImpactEvaluationPrior({ store, stateRoot, selector });
    assert.equal(Object.hasOwn(outward, 'bytes'), false, 'public prior reader stays redacted');
    const trusted = readTrustedImpactEvaluationPrior({ store, stateRoot, selector });
    assert.equal(trusted.outcome, 'available');
    assert.equal(trusted.bytes.equals(next.bytes), true);
    assert.equal(Object.isFrozen(trusted), true);
    assert.deepEqual(linkImpactEvaluationReplacement({ store, stateRoot, priorResultId: prior.result_id, nextResultId: next.result_id, linkedAt: '2026-08-12T12:01:00.000Z' }), { outcome: 'linked' });
    assert.deepEqual(readTrustedImpactEvaluationReplacement({ store, stateRoot, priorResultId: prior.result_id }), { outcome: 'available', next_result_id: next.result_id, next_result_digest: next.result_digest });
    const lineage = parseImpactEvaluationBytes(next.bytes).artifact.lineage;
    const freshTarget = { ...target, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash, accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch };
    const aggregateDigest = 'd'.repeat(64); const aggregateId = `rule-impact-input:${aggregateDigest}`;
    const api09 = { outcome: 'ready', input_bytes: Buffer.from(JSON.stringify({ schema: 'rule-impact-evaluator-input-v1', input_digest: aggregateDigest, evaluated_target: freshTarget, target_t0: '2026-08-12T00:00:00.000Z', target_epoch_opening: {}, impact_contract_digest: 'a'.repeat(64), impact_contract: {}, families: [] })), evaluation_input_digest: '', measurement_input_id: aggregateId, measurement_input_digest: aggregateDigest, lineage: { tier: lineage.scope_id === null ? 'global' : 'project', scope_id: lineage.scope_id, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, activation_epoch: lineage.activation_epoch, measurement_input_digest: aggregateDigest, evaluation_input_digest: '' } };
    api09.evaluation_input_digest = sha256(api09.input_bytes); api09.lineage.evaluation_input_digest = api09.evaluation_input_digest;
    const freshAuthority = { target: freshTarget, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest, resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest, exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest, measurement_input_id: aggregateId, measurement_input_digest: aggregateDigest, evaluation_input_digest: api09.evaluation_input_digest };
    const current = buildExpectedCurrentFromApi09({ api09, freshAuthority, verifiedPrior: trusted, minimumHeadSequence: next.head_sequence });
    assert.deepEqual(current, { tier: freshTarget.tier, scope_id: freshTarget.scope_id, rule_id: freshTarget.rule_id, version_hash: freshTarget.version_hash, content_hash: freshTarget.content_hash, accepted_commit: freshTarget.accepted_commit, activation_epoch: freshTarget.activation_epoch, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest, resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: lineage.resolver_snapshot_digest, exposure_id: lineage.exposure_id, exposure_publication_digest: lineage.exposure_publication_digest, measurement_input_id: aggregateId, measurement_input_digest: aggregateDigest, evaluation_input_digest: api09.evaluation_input_digest, minimum_head_sequence: next.head_sequence });
    assert.equal(Object.isFrozen(current), true);
    assert.deepEqual(buildExpectedCurrentFromApi09({ api09, freshAuthority: { ...freshAuthority, measurement_input_digest: 'f'.repeat(64) }, verifiedPrior: trusted, minimumHeadSequence: next.head_sequence }), { outcome: 'blocked', reason: 'api09_aggregate_drift' });
    const missing = { ...freshAuthority }; delete missing.exposure_id;
    assert.deepEqual(buildExpectedCurrentFromApi09({ api09, freshAuthority: missing, verifiedPrior: trusted, minimumHeadSequence: next.head_sequence }), { outcome: 'blocked', reason: 'fresh_authority_exposure_id_missing' });
    const blob = path.join(stateRoot, 'quality', 'rule-impact-result', `${next.result_digest}.json`);
    const original = readFileSync(blob); writeFileSync(blob, Buffer.from('{}'));
    assert.deepEqual(readTrustedImpactEvaluationPrior({ store, stateRoot, selector }), { outcome: 'blocked', reason: 'prior_unavailable' });
    writeFileSync(blob, original);
    assert.deepEqual(readTrustedImpactEvaluationPrior({ store, stateRoot, selector: { ...selector, minimum_head_sequence: next.head_sequence + 1 } }), { outcome: 'blocked', reason: 'prior_unavailable' });
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    db.prepare('UPDATE impact_evaluation_index SET tier = NULL WHERE result_id = ?').run(next.result_id); db.close();
    assert.deepEqual(readTrustedImpactEvaluationPrior({ store, stateRoot, selector }), { outcome: 'blocked', reason: 'prior_unavailable' }, 'legacy projection cannot grant internal bytes');
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Plan046 S1 capture indexes complete history atomically and reader returns only linked rehashed bytes', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan046-s1-indexed-read-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.equal(captureRuleImpactFanout({ stateRoot, store, authority, measurement: completeMeasurement() }).outcome, 'success');
    const references = store.listIndexedImpactInputs({ tier: 'global', scope_id: '', start_at: '2026-08-11T00:00:00.000Z', end_at: '2026-08-11T00:00:00.001Z' });
    assert.equal(references.length, 1);
    const read = readIndexedImpactInput({ stateRoot, store, reference: references[0] });
    assert.equal(read.outcome, 'available');
    assert.equal(sha256(read.bytes), references[0].input_digest);
    writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-input', `${references[0].input_digest}.json`), '{}');
    assert.deepEqual(readIndexedImpactInput({ stateRoot, store, reference: references[0] }), { outcome: 'unavailable' });
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
