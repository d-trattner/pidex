import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { classifyRecoveryObservation, createActivationEpochCatalog, createPassiveQuality, faultBoundaryCensus, loadActivationEpochCatalog, publicationFaultLedger, proveRecoveryObservationPartition, publishPassiveBundle, publishRuleSnapshot, recoverPassiveBundle, recoveryFaultLedger, recordTerminalExposure, saveActivationEpochCatalog, transitionActivationEpoch } from './rule-exposure.mjs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const completeInventory = Object.freeze({
  complete: true,
  reconciliation_revision: 'recon-v1',
  inventory_digest: 'digest-v1',
  entries: [
    { rule_id: 'rule:agent:pidex-alpha', version_hash: 'a'.repeat(64), lifecycle_state: 'active', provenance: 'unmanaged', protected_class: 'unknown', capabilities: [] },
  ],
});

test('publishes immutable complete snapshot and automatic terminal exposure for ordinary Project Pipeline tracer run', () => {
  const catalog = createActivationEpochCatalog();
  // Correction 1 / CR-M3: complete snapshots require matching persisted reconciliation identity.
  const snapshot = publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-1', plan_id: 'plan-045', project_scope: 'project-safe', pipeline_version: 'pipeline-v1', model_identity: 'model-v1', config_fingerprint: 'config-v1', correlation_id: 'corr-1' }, epochCatalog: catalog, reconciliationArtifact: { reconciliation_revision: 'recon-v1', inventory_count: 1, inventory_digest: 'digest-v1' } });
  const exposure = recordTerminalExposure({ snapshot, terminal_outcome_ref: 'outcome-1', now: '2026-07-24T00:00:00.000Z' });

  assert.equal(snapshot.complete, true);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.active_rules.length, 1);
  assert.equal(snapshot.active_rules[0].rule_id, 'rule:agent:pidex-alpha');
  assert.ok(snapshot.snapshot_id);
  assert.equal(exposure.quality, 'complete');
  assert.equal(exposure.usable_for_evidence, false, 'S1 tracer evidence remains unusable until S2 consumer closure');
  assert.equal(exposure.activation_epochs['rule:agent:pidex-alpha'], snapshot.active_rules[0].activation_epoch);
  assert.equal(exposure.run_id, 'run-1');
  assert.equal(exposure.pipeline_version, 'pipeline-v1');
  assert.equal(exposure.model_identity, 'model-v1');
  assert.equal(exposure.config_fingerprint, 'config-v1');
  assert.equal(exposure.terminal_outcome_ref, 'outcome-1');
  assert.equal('arm' in exposure, false);
  assert.equal('assignment' in exposure, false);
});

test('refuses complete snapshot publication without matching persisted reconciliation identity', () => {
  const catalog = createActivationEpochCatalog();
  const missing = publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-missing', model_identity: 'model-v1', config_fingerprint: 'config-v1', correlation_id: 'corr-missing' }, epochCatalog: catalog });
  const matched = publishRuleSnapshot({
    inventory: completeInventory,
    resolver_revision: 'resolver-v1',
    projection_revision: 'projection-v1',
    run: { run_id: 'run-matched', model_identity: 'model-v1', config_fingerprint: 'config-v1', correlation_id: 'corr-matched' },
    epochCatalog: catalog,
    reconciliationArtifact: {
      reconciliation_revision: completeInventory.reconciliation_revision,
      inventory_count: completeInventory.entries.length,
      inventory_digest: completeInventory.inventory_digest,
    },
  });

  assert.equal(missing.complete, false);
  assert.deepEqual(missing.quality_flags, ['inventory_incomplete']);
  assert.equal(matched.complete, true);
  assert.equal(matched.inventory_count, completeInventory.entries.length);
});

test('marks identity incomplete unless exact model, config, and correlation identities are present', () => {
  const catalog = createActivationEpochCatalog();
  const reconciliationArtifact = { reconciliation_revision: 'recon-v1', inventory_count: 1, inventory_digest: 'digest-v1' };
  const missing = publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-missing', model_identity: 'project-pipeline', config_fingerprint: 'unavailable' }, epochCatalog: catalog, reconciliationArtifact });
  const exact = publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-exact', model_identity: 'pi@1.2.3', config_fingerprint: 'sha256:config', correlation_id: 'corr-123' }, epochCatalog: catalog, reconciliationArtifact });

  assert.equal(missing.complete, false);
  assert.deepEqual(missing.quality_flags, ['identity_incomplete']);
  assert.equal(exact.complete, true);
  assert.equal(exact.correlation_id, 'corr-123');
  assert.equal(recordTerminalExposure({ snapshot: exact }).correlation_id, 'corr-123');
});

test('rejects unknown top-level passive input keys from every forbidden vocabulary family', () => {
  const snapshot = publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'strict-top-level' }, epochCatalog: createActivationEpochCatalog() });
  for (const extra of [
    { assignment: { arm: 'A' } },
    { effect: { estimator: 'future-plan' } },
    { randomization: true },
    { evaluator: { outcome: 'future-plan' } },
    { deactivation: { action: 'future-plan' } },
  ]) {
    assert.throws(() => recordTerminalExposure({ snapshot, terminal_outcome_ref: 'outcome-1', ...extra }), /forbidden exposure input key/);
  }
});

test('opens fresh activation epoch when behavior version changes and rejects forbidden measurement fields', () => {
  const catalog = createActivationEpochCatalog();
  const first = publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-1' }, epochCatalog: catalog });
  const changedInventory = { ...completeInventory, entries: [{ ...completeInventory.entries[0], version_hash: 'b'.repeat(64) }] };
  const second = publishRuleSnapshot({ inventory: changedInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-2' }, epochCatalog: catalog });

  assert.notEqual(first.active_rules[0].activation_epoch, second.active_rules[0].activation_epoch);
  // Correction 1 / CR-M2: passive recorder rejects every non-empty measurement payload.
  assert.throws(() => recordTerminalExposure({ snapshot: first, terminal_outcome_ref: 'outcome-1', measurement: { arm: 'absent' } }), /forbidden exposure measurement payload/);
  assert.throws(() => recordTerminalExposure({ snapshot: first, terminal_outcome_ref: 'outcome-1', measurement: { assignment: 'x' } }), /forbidden exposure measurement payload/);
});

test('rejects every non-empty measurement payload, including nested later-plan semantics', () => {
  const snapshot = publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-1' }, epochCatalog: createActivationEpochCatalog() });
  const forbiddenPayloads = [
    { randomization: 'future-plan' },
    { measurement_holdout: true },
    { effect: { estimator: 'future-plan' } },
    { evaluator: { outcome: 'future-plan' } },
    { deactivation: { action: 'future-plan' } },
  ];

  for (const measurement of forbiddenPayloads) {
    assert.throws(
      () => recordTerminalExposure({ snapshot, terminal_outcome_ref: 'outcome-1', measurement }),
      /forbidden exposure measurement payload/,
    );
  }
});

test('EP-49-V1 opens fresh exact-version epochs for every closure transition without evidence carryover', () => {
  const rule = { rule_id: 'rule:agent:pidex-alpha', version_hash: 'a'.repeat(64) };
  const catalog = createActivationEpochCatalog();
  const first = transitionActivationEpoch({ catalog, rule, trigger: 'first_activation' });
  for (const trigger of ['version_change', 'deactivation', 'reactivation', 'refinement', 'semantic_invalidation', 'recovery']) {
    const next = transitionActivationEpoch({ catalog, rule, trigger });
    assert.notEqual(next.epoch_id, first.epoch_id, trigger);
    assert.deepEqual(next.carried_evidence, [], trigger);
  }
  assert.throws(() => transitionActivationEpoch({ catalog, rule, trigger: 'resume' }), /EP49_INVALID_TRANSITION/);
});

test('persists activation epoch catalog only to caller-selected state path', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-rule-epoch-'));
  try {
    const catalog = createActivationEpochCatalog();
    publishRuleSnapshot({ inventory: completeInventory, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-1' }, epochCatalog: catalog });
    const epochPath = path.join(root, 'state/quality/activation-epochs.json');
    saveActivationEpochCatalog(epochPath, catalog);
    assert.match(readFileSync(epochPath, 'utf8'), /rule:agent:pidex-alpha/);
    assert.deepEqual(loadActivationEpochCatalog(epochPath), catalog);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publishes only a manifest-last verified bundle and exact replay returns three opaque IDs', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-rule-bundle-'));
  try {
    const input = {
      root,
      reconciliation: { schema: 1, reconciliation_id: 'reconciliation:'.concat('a'.repeat(64)), reconciliation_revision: 'recon-v1', inventory_count: 1, inventory_digest: 'digest-v1' },
      snapshot: { schema: 1, snapshot_id: 'snapshot:'.concat('b'.repeat(64)), reconciliation_revision: 'recon-v1', active_rules: [] },
      exposure: { schema: 1, exposure_id: 'exposure:'.concat('c'.repeat(64)), snapshot_id: 'snapshot:'.concat('b'.repeat(64)), usable_for_evidence: false },
      epoch: { schema: 1, epochs: {} },
      catalog_contribution: { schema: 1, entries: [] },
      identity: { run_id: 'run-1', terminal_outcome_ref: 'outcome-1', reconciliation_revision: 'recon-v1', snapshot_id: 'snapshot:'.concat('b'.repeat(64)), exposure_id: 'exposure:'.concat('c'.repeat(64)) },
    };
    const first = publishPassiveBundle(input);
    const replay = publishPassiveBundle(input);

    assert.deepEqual(first, {
      reconciliation_id: input.reconciliation.reconciliation_id,
      snapshot_id: input.snapshot.snapshot_id,
      exposure_id: input.exposure.exposure_id,
    });
    assert.deepEqual(replay, first);
    const storageKey = createHash('sha256').update(JSON.stringify({ run_id: input.identity.run_id })).digest('hex');
    assert.equal(existsSync(path.join(root, 'state/quality/rule-exposure', storageKey, 'commit-manifest.json')), true);
    assert.equal(JSON.stringify(first).includes(root), false);
    assert.throws(() => publishPassiveBundle({ ...input, identity: { ...input.identity, terminal_outcome_ref: 'changed' } }), /CONFLICT_IDENTITY/);
    assert.throws(() => publishPassiveBundle({ ...input, extra: true }), /PASSIVE_SCHEMA_UNKNOWN_KEY/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recovery classifies torn manifest residue as unusable incomplete generation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-rule-torn-manifest-'));
  try {
    const identity = { run_id: 'torn-run', terminal_outcome_ref: 'outcome-1', reconciliation_revision: 'recon-v1', snapshot_id: 'snapshot:'.concat('b'.repeat(64)), exposure_id: 'exposure:'.concat('c'.repeat(64)) };
    publishPassiveBundle({ root, reconciliation: { schema: 1, reconciliation_id: 'reconciliation:'.concat('a'.repeat(64)) }, snapshot: { schema: 1, snapshot_id: identity.snapshot_id, reconciliation_revision: 'recon-v1' }, exposure: { schema: 1, exposure_id: identity.exposure_id, snapshot_id: identity.snapshot_id }, epoch: { schema: 1 }, catalog_contribution: { schema: 1 }, identity });
    const storageKey = createHash('sha256').update(JSON.stringify({ run_id: identity.run_id })).digest('hex');
    writeFileSync(path.join(root, 'state/quality/rule-exposure', storageKey, 'commit-manifest.json'), '{torn');
    assert.deepEqual(recoverPassiveBundle({ root, identity }), { state: 'QUARANTINED', reason: 'RECOVERY_INCOMPLETE_GENERATION', usable: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Q49-V1 keeps all six passive quality facts orthogonal and globally unusable before S2', () => {
  const quality = createPassiveQuality({ completeness: 'complete', derivation: 'direct', recorder_condition: 'healthy', currency: 'current', run_provenance: 'ordinary', occurrence: 'original' });
  assert.deepEqual(quality, { completeness: 'complete', derivation: 'direct', recorder_condition: 'healthy', currency: 'current', run_provenance: 'ordinary', occurrence: 'original', usable_for_evidence: false });
  assert.throws(() => createPassiveQuality({ completeness: 'complete', derivation: 'direct', recorder_condition: 'healthy', currency: 'current', run_provenance: 'ordinary', occurrence: 'inferred' }), /PASSIVE_QUALITY_INVALID/);
});

test('recovery oracle reports clean absence without treating residue as a commit', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-rule-recovery-'));
  try {
    const identity = { run_id: 'recover-run', terminal_outcome_ref: 'outcome-1', reconciliation_revision: 'recon-v1', snapshot_id: 'snapshot:'.concat('b'.repeat(64)), exposure_id: 'exposure:'.concat('c'.repeat(64)) };
    assert.deepEqual(recoverPassiveBundle({ root, identity }), { state: 'ABSENT', reason: 'RECOVERY_NOTHING_PUBLISHED', usable: false });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ROV-49-1 classifies every RO-49 recovery precedence row with one stable outcome', () => {
  const observation = (overrides = {}) => ({
    requested_identity: 'exact', generation_relation: 'zero_none',
    member_temp: Array(5).fill('absent'), member_stage: Array(5).fill('absent'), member_final: Array(5).fill('absent'),
    manifest_temp: 'absent', manifest_final: 'absent', lock: 'absent', durability: 'fully_confirmed', quarantine: 'absent',
    ...overrides,
  });
  const rows = [
    ['RO-49-01', observation({ unsafe_shape: true })],
    ['RO-49-02', observation({ requested_identity: 'conflicting' })],
    ['RO-49-03', observation({ lock: 'live_exact' })],
    ['RO-49-04', observation({ lock: 'malformed_unknown' })],
    ['RO-49-05', observation({ durability: 'operation_failure' })],
    ['RO-49-06', observation({ generation_relation: 'one_exact', manifest_final: 'valid_exact', member_final: Array(5).fill('valid_exact') })],
    ['RO-49-07', observation({ generation_relation: 'one_exact', manifest_final: 'valid_exact', member_final: ['torn_invalid', ...Array(4).fill('valid_exact')], member_stage: Array(5).fill('valid_exact') })],
    ['RO-49-08', observation({ generation_relation: 'one_exact', manifest_temp: 'valid_exact', member_stage: Array(5).fill('valid_exact') })],
    ['RO-49-09', observation({ generation_relation: 'one_exact', durability: 'directory_sync_unsupported', manifest_final: 'valid_exact', member_final: Array(5).fill('valid_exact') })],
    ['RO-49-10', observation({ generation_relation: 'one_exact', durability: 'directory_sync_unsupported', manifest_final: 'valid_exact', member_final: ['torn_invalid', ...Array(4).fill('valid_exact')] })],
    ['RO-49-11', observation({ generation_relation: 'one_exact', member_temp: ['torn_invalid', ...Array(4).fill('absent')] })],
    ['RO-49-12', observation()],
    ['RO-49-13', observation({ quarantine: 'interrupted' })],
    ['RO-49-14', observation({ quarantine: 'sealed' })],
  ];
  for (const [row, input] of rows) assert.equal(classifyRecoveryObservation(input).row, row);
});

test('ROV-49-2 fixes Plan 049 mutation registry at 89 boundaries and 178 variants', () => {
  const census = faultBoundaryCensus();
  assert.deepEqual(census.groups, { N: 8, O: 6, PM: 30, PC: 4, RM: 20, RC: 4, QC: 16, V: 1 });
  assert.equal(census.boundaries, 89);
  assert.equal(census.variants, 178);
  assert.equal(census.variants, census.boundaries * 2);
});

test('ROV-49-1 proves exact finite domain partition and unsafe-shape sentinels', () => {
  const proof = proveRecoveryObservationPartition();
  assert.equal(proof.domain_signature, '2x5x4^15x4^2x6x4x3');
  assert.equal(proof.total, 12_369_505_812_480);
  assert.equal(proof.total, Object.values(proof.counts).reduce((sum, count) => sum + count, 0));
  assert.deepEqual(Object.keys(proof.counts), Array.from({ length: 14 }, (_, index) => `RO-49-${String(index + 1).padStart(2, '0')}`));
  assert.equal(proof.unclassified, 0);
  assert.equal(proof.precedence_shadow, 0);
  for (const sentinel of proof.unsafe_sentinels) assert.equal(classifyRecoveryObservation(sentinel).row, 'RO-49-01');
});

test('ROV-49-2 executes every C49-1B publication/durability F/I fault boundary without trusted completion', () => {
  const members = ['reconciliation', 'snapshot', 'exposure', 'epoch', 'catalog_contribution'];
  const expected = [
    'namespace-root-create', 'namespace-root-parent-durability', 'members-directory-create', 'members-parent-durability',
    'staging-directory-create', 'staging-parent-durability', 'generation-directory-create', 'generation-parent-durability',
    'lock-exclusive-visibility', 'owner-record-write', 'owner-record-flush', 'lock-parent-durability', 'lock-release', 'release-parent-durability',
    ...members.flatMap((member) => ['temp-write', 'temp-flush', 'temp-stage-rename', 'staging-parent-durability', 'stage-final-rename', 'members-parent-durability'].map((step) => `member:${member}:${step}`)),
    'manifest-temp-write', 'manifest-temp-flush', 'manifest-final-rename', 'publication-root-durability',
  ];
  const ledger = publicationFaultLedger();

  assert.equal(expected.length, 48);
  assert.equal(ledger.length, 96);
  assert.deepEqual(new Set(ledger.map((row) => row.boundary_id)), new Set(expected));
  assert.deepEqual(new Set(ledger.map((row) => row.variant)), new Set(['F', 'I']));
  assert.equal(new Set(ledger.map((row) => `${row.boundary_id}:${row.variant}`)).size, 96);
  for (const row of ledger) {
    assert.deepEqual(row.result, classifyRecoveryObservation(row.observation), row.boundary_id);
    assert.equal(row.result.usable, false, row.boundary_id);
    assert.notEqual(row.result.state, 'COMMITTED_VERIFIED', row.boundary_id);
    assert.match(row.residue, /^(namespace|lock|member|manifest)$/);
  }
});

test('ROV-49-2 executes every C49-1C repair, quarantine, and trust-return F/I fault boundary with exact re-observation', () => {
  const members = ['reconciliation', 'snapshot', 'exposure', 'epoch', 'catalog_contribution'];
  const expected = [
    ...members.flatMap((member) => ['replacement-materialization', 'replacement-flush', 'repaired-final-visibility', 'members-parent-durability'].map((step) => `repair-member:${member}:${step}`)),
    'repair-manifest:replacement-materialization', 'repair-manifest:replacement-flush', 'repair-manifest:final-visibility', 'repair-manifest:publication-root-durability',
    ...[...members, 'commit-manifest'].flatMap((name) => ['evidence-capture-visibility', 'quarantine-parent-durability'].map((step) => `quarantine:${name}:${step}`)),
    'quarantine:disposition-temp-write', 'quarantine:disposition-flush', 'quarantine:disposition-final-rename', 'quarantine:disposition-parent-durability',
    'trust-return:whole-bundle-reverify',
  ];
  const ledger = recoveryFaultLedger();

  assert.equal(expected.length, 41);
  assert.equal(ledger.length, 82);
  assert.deepEqual(new Set(ledger.map((row) => row.boundary_id)), new Set(expected));
  assert.deepEqual(new Set(ledger.map((row) => row.variant)), new Set(['F', 'I']));
  assert.equal(new Set(ledger.map((row) => `${row.boundary_id}:${row.variant}`)).size, 82);
  assert.deepEqual(new Set(ledger.filter((row) => row.boundary_id.startsWith('repair-member:')).map((row) => row.seed)), new Set(members));
  assert.deepEqual(new Set(ledger.filter((row) => row.boundary_id.startsWith('quarantine:') && row.boundary_id.includes('evidence-capture')).map((row) => row.seed)), new Set([...members, 'commit-manifest']));
  for (const row of ledger) {
    assert.deepEqual(row.result, classifyRecoveryObservation(row.observation), row.boundary_id);
    assert.equal(row.command, 'CMD-FAULT-1');
    if (row.variant === 'F') {
      assert.deepEqual(row.result, { row: 'RO-49-05', state: 'QUARANTINED', reason: 'RECOVERY_DURABILITY_FAILED', usable: false }, row.boundary_id);
    } else if (row.pre_state_signature.startsWith('RM:')) {
      assert.deepEqual(row.result, { row: 'RO-49-07', state: 'COMMITTED_VERIFIED', reason: 'RECOVERY_MEMBER_REPAIRED', usable: true }, row.boundary_id);
    } else if (row.pre_state_signature.startsWith('RC:')) {
      assert.deepEqual(row.result, { row: 'RO-49-08', state: 'COMMITTED_VERIFIED', reason: 'RECOVERY_MANIFEST_REPAIRED', usable: true }, row.boundary_id);
    } else if (row.pre_state_signature.startsWith('QC:')) {
      assert.deepEqual(row.result, { row: 'RO-49-13', state: 'QUARANTINED', reason: 'RECOVERY_QUARANTINE_RESUMED', usable: false }, row.boundary_id);
    } else {
      assert.deepEqual(row.result, { row: 'RO-49-06', state: 'COMMITTED_VERIFIED', reason: 'RECOVERY_COMMITTED_VERIFIED', usable: true }, row.boundary_id);
    }
  }
});

test('ROV-49-2 recomposes all C49-1 ledger partitions into exact 89-boundary/178-variant registry', () => {
  const ledger = [...publicationFaultLedger(), ...recoveryFaultLedger()];
  assert.equal(ledger.length, 178);
  assert.equal(new Set(ledger.map((row) => row.boundary_id)).size, 89);
  assert.equal(new Set(ledger.map((row) => `${row.boundary_id}:${row.variant}`)).size, 178);
  assert.deepEqual(new Set(ledger.map((row) => row.command)), new Set(['CMD-FAULT-1']));
});

test('CO-49-1 process matrix converges exact writers and fences conflict, live, dead, unknown, and timeout ownership', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-rule-concurrency-'));
  const identity = { run_id: 'concurrent-run', terminal_outcome_ref: 'outcome-1', reconciliation_revision: 'recon-v1', snapshot_id: 'snapshot:'.concat('b'.repeat(64)), exposure_id: 'exposure:'.concat('c'.repeat(64)) };
  const input = {
    root,
    reconciliation: { schema: 1, reconciliation_id: 'reconciliation:'.concat('a'.repeat(64)) },
    snapshot: { schema: 1, snapshot_id: identity.snapshot_id, reconciliation_revision: 'recon-v1' },
    exposure: { schema: 1, exposure_id: identity.exposure_id, snapshot_id: identity.snapshot_id },
    epoch: { schema: 1 }, catalog_contribution: { schema: 1 }, identity,
  };
  const source = pathToFileURL(path.resolve('scripts/quality/rule-exposure.mjs')).href;
  const worker = JSON.stringify(`import { publishPassiveBundle } from ${JSON.stringify(source)}; const input = JSON.parse(process.argv[1]); console.log(JSON.stringify(publishPassiveBundle(input)));`);
  const publish = () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', JSON.parse(worker), JSON.stringify(input)]);
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.on('close', (status) => resolve({ status, output }));
  });
  const bundlePath = path.join(root, 'state/quality/rule-exposure', createHash('sha256').update(JSON.stringify({ run_id: identity.run_id })).digest('hex'));
  try {
    const writers = await Promise.all([publish(), publish(), publish()]);
    assert.deepEqual(writers.map(({ status }) => status), [0, 0, 0]);
    assert.deepEqual(writers.map(({ output }) => JSON.parse(output)), Array(3).fill({
      reconciliation_id: input.reconciliation.reconciliation_id,
      snapshot_id: input.snapshot.snapshot_id,
      exposure_id: input.exposure.exposure_id,
    }));
    assert.throws(() => publishPassiveBundle({ ...input, identity: { ...identity, terminal_outcome_ref: 'conflict' } }), /CONFLICT_IDENTITY/);

    writeFileSync(path.join(bundlePath, '.lock'), JSON.stringify({ pid: process.pid, identity }));
    assert.deepEqual(recoverPassiveBundle({ root, identity }), { state: 'TORN_OR_INVALID', reason: 'RECOVERY_OWNER_ACTIVE', usable: false });

    writeFileSync(path.join(bundlePath, '.lock'), JSON.stringify({ pid: 999999, identity }));
    assert.deepEqual(recoverPassiveBundle({ root, identity }).artifacts, publishPassiveBundle(input));

    writeFileSync(path.join(bundlePath, '.lock'), '{malformed');
    assert.deepEqual(recoverPassiveBundle({ root, identity }), { state: 'QUARANTINED', reason: 'RECOVERY_OWNER_UNCERTAIN', usable: false });

    writeFileSync(path.join(bundlePath, '.lock'), JSON.stringify({ pid: process.pid, identity }));
    assert.deepEqual(recoverPassiveBundle({ root, identity }), { state: 'TORN_OR_INVALID', reason: 'RECOVERY_OWNER_ACTIVE', usable: false }, 'timeout never proves a live owner dead');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails canonical-active and unusable when reconciliation is incomplete', () => {
  const snapshot = publishRuleSnapshot({ inventory: { ...completeInventory, complete: false, diagnostics: [{ code: 'module_rule_orphan' }] }, resolver_revision: 'resolver-v1', projection_revision: 'projection-v1', run: { run_id: 'run-degraded', model_identity: 'model-v1', config_fingerprint: 'config-v1', correlation_id: 'corr-degraded' }, epochCatalog: createActivationEpochCatalog() });
  const exposure = recordTerminalExposure({ snapshot, terminal_outcome_ref: 'outcome-degraded' });

  assert.equal(snapshot.complete, false);
  assert.deepEqual(snapshot.quality_flags, ['inventory_incomplete']);
  assert.equal(snapshot.active_rules.length, 1, 'canonical rule remains active');
  assert.equal(exposure.quality, 'inventory_incomplete');
  assert.equal(exposure.usable_for_evidence, false);
});
