import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRuleRuntimeContext, resolveRuleSnapshot } from './rule-resolver.mjs';

const hash = (value) => value.repeat(64);
function candidate(overrides = {}) {
  return {
    rule_id: 'pidex-global:pidex-implementer:quality', rule_version: hash('a'), content_hash: hash('a'), accepted_commit: hash('b').slice(0, 40), bytes: '# Quality\n',
    activation_epoch: 'epoch:fixture', tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: 'active',
    created_at: '2026-08-11T00:00:00.000Z', source_head: hash('c').slice(0, 40), mirror_head: hash('d').slice(0, 40), mirror_digest: hash('e'),
    ...overrides,
  };
}

test('RP-01..05 resolves deterministic immutable snapshot and collapses exact duplicate', () => {
  const first = candidate({ source: 'protected_global', protection_class: 'legacy_baseline' });
  const duplicate = candidate({ source: 'protected_global', protection_class: 'legacy_baseline' });
  const snapshot = resolveRuleSnapshot({ run_id: 'run-1', projection_revision: 'head:1', candidates: [first, duplicate] });
  assert.equal(snapshot.schema, 'pidex-rule-resolver-snapshot-v1');
  assert.equal(snapshot.quality, 'verified');
  assert.equal(snapshot.active_rules.length, 1);
  assert.equal(Object.isFrozen(snapshot), true);
});

test('LH45-05 copies exact lifecycle-store activation epoch into Plan061-compatible active entry', () => {
  const snapshot = resolveRuleSnapshot({ run_id: 'epoch-run', projection_revision: 'head:epoch', candidates: [candidate({ activation_epoch: 'epoch:store-owned' })] });
  assert.deepEqual(snapshot.active_rules[0], {
    rule_id: 'pidex-global:pidex-implementer:quality', version_hash: hash('a'), activation_epoch: 'epoch:store-owned',
    tier: 'global', scope_id: null, content_hash: hash('a'), accepted_commit: hash('b').slice(0, 40), protection_class: 'none', mirror_digest: hash('e'),
    agent: undefined, applicability: [], phases: [], lifecycle_state: 'active', // CR-075-05 closed runtime routing defaults.
  });
  assert.equal(snapshot.quality, 'verified');
});

test('CR-075-05 keeps resolved agent applicability and phase routing fields for runtime materialization', () => {
  const snapshot = resolveRuleSnapshot({
    run_id: 'runtime-selection', projection_revision: 'head:selection',
    candidates: [candidate({ agent: 'pidex-implementer', applicability: ['project-pipeline'], phases: ['implementation'] })],
  });
  assert.deepEqual(snapshot.active_rules[0], {
    rule_id: 'pidex-global:pidex-implementer:quality', version_hash: hash('a'), activation_epoch: 'epoch:fixture', tier: 'global', scope_id: null,
    content_hash: hash('a'), accepted_commit: hash('b').slice(0, 40), protection_class: 'none', mirror_digest: hash('e'),
    agent: 'pidex-implementer', applicability: ['project-pipeline'], phases: ['implementation'], lifecycle_state: 'active',
  });
});

test('RC45-01 builds one deeply immutable context without ambient reads or epoch derivation', () => {
  const context = buildRuleRuntimeContext({
    pipeline_id: 'pipeline-1', run_identity: { run_id: 'runtime-1' }, project_authority: { scope_id: null },
    inventory_identity: { schema: 1, entries: [] }, lifecycle_head: { accepted_head: hash('b').slice(0, 40) }, projection: { revision: 'head:runtime' },
    epoch_catalog: { schema: 1, epochs: {} }, mirror_generation: { digest: hash('c') }, reconciliation_artifact: { schema: 1, reconciliation_id: 'reconciliation:runtime' },
    rule_snapshot: { schema: 1, snapshot_id: `snapshot:${hash('d')}`, active_rules: [] },
    run_id: 'runtime-1', scope_id: null, projection_revision: 'head:runtime', candidates: [candidate({ activation_epoch: 'epoch:exact-store-value' })],
  });
  assert.equal(context.resolver_snapshot.active_rules[0].activation_epoch, 'epoch:exact-store-value');
  assert.match(context.passive_exposure_input.rule_snapshot.snapshot_id, /^snapshot:/, 'RC45-07: builder owns passive snapshot identity');
  assert.equal(Object.isFrozen(context.passive_exposure_input), true);
  assert.throws(() => buildRuleRuntimeContext({ run_id: 'bad', projection_revision: 'head:runtime', candidates: [candidate({ activation_epoch: undefined })] }), /RULE_RUNTIME_CONTEXT_INPUT_INVALID/);
});

test('RC45-02/03 binds exact verified inputs into closed immutable runtime context', () => {
  const inventory_identity = Object.freeze({ schema: 1, inventory_digest: hash('c'), reconciliation_revision: 'reconciliation:fixture', entries: [] });
  const epoch_catalog = Object.freeze({ schema: 1, epochs: Object.freeze({}) });
  const reconciliation_artifact = Object.freeze({ schema: 1, reconciliation_id: 'reconciliation:fixture' });
  const rule_snapshot = Object.freeze({ schema: 1, snapshot_id: `snapshot:${hash('d')}`, active_rules: Object.freeze([]) });
  const context = buildRuleRuntimeContext({
    pipeline_id: 'pipeline-runtime-1', run_identity: { run_id: 'runtime-1' }, project_authority: { scope_id: null },
    inventory_identity, lifecycle_head: { accepted_head: hash('e').slice(0, 40) }, projection: { revision: 'head:runtime' },
    epoch_catalog, mirror_generation: { digest: hash('f') }, reconciliation_artifact, rule_snapshot,
    run_id: 'runtime-1', scope_id: null, projection_revision: 'head:runtime', candidates: [candidate({ activation_epoch: 'epoch:exact-store-value' })],
  });
  assert.deepEqual(Object.keys(context).sort(), ['input_digests', 'passive_exposure_input', 'pipeline_id', 'resolver_snapshot', 'schema']);
  assert.equal(context.schema, 'pidex-rule-runtime-context-v1');
  assert.equal(context.pipeline_id, 'pipeline-runtime-1');
  assert.deepEqual(Object.keys(context.input_digests).sort(), ['epoch_catalog_digest', 'inventory_identity_digest', 'lifecycle_head_digest', 'mirror_generation_digest', 'project_authority_digest', 'projection_digest', 'reconciliation_artifact_digest', 'run_identity_digest', 'schema']);
  assert.deepEqual(Object.keys(context.passive_exposure_input).sort(), ['epoch_catalog', 'inventory_identity', 'reconciliation_artifact', 'rule_snapshot']);
  assert.notEqual(context.passive_exposure_input.rule_snapshot, rule_snapshot, 'RC45-07: supplied snapshot cannot replace builder-owned passive snapshot');
  assert.match(context.passive_exposure_input.rule_snapshot.snapshot_id, /^snapshot:/);
  assert.equal(context.resolver_snapshot.active_rules[0].activation_epoch, 'epoch:exact-store-value');
  assert.equal(Object.isFrozen(context), true);
  assert.throws(() => buildRuleRuntimeContext({ pipeline_id: 'missing-input', run_id: 'runtime-1', projection_revision: 'head:runtime', candidates: [candidate()] }), /RULE_RUNTIME_CONTEXT_INPUT_INVALID/);
});

test('RC45-07 builds Plan061 passive snapshot from exact reconciled inventory and store epochs', () => {
  const rule = candidate({ rule_id: 'rule:agent:pidex-implementer', activation_epoch: 'epoch:store-owned' });
  const inventory = {
    complete: true, reconciliation_revision: 'reconciliation:exact', inventory_digest: 'inventory:exact',
    entries: [{ rule_id: rule.rule_id, version_hash: rule.rule_version, lifecycle_state: 'active' }],
  };
  const context = buildRuleRuntimeContext({
    pipeline_id: 'pipeline-plan061', run_identity: { run_id: 'runtime-plan061', model_identity: 'pi@1', config_fingerprint: 'config:1', correlation_id: 'corr-1' }, project_authority: { scope_id: null },
    inventory_identity: inventory, lifecycle_head: { accepted_head: hash('b').slice(0, 40) }, projection: { revision: 'head:runtime' },
    epoch_catalog: { schema: 1, epochs: {} }, mirror_generation: { digest: hash('c') },
    reconciliation_artifact: { reconciliation_revision: inventory.reconciliation_revision, inventory_count: 1, inventory_digest: inventory.inventory_digest },
    run_id: 'runtime-plan061', scope_id: null, projection_revision: 'head:runtime', candidates: [rule],
  });
  assert.equal(context.passive_exposure_input.rule_snapshot.active_rules[0].activation_epoch, 'epoch:store-owned');
  assert.match(context.passive_exposure_input.rule_snapshot.snapshot_id, /^snapshot:/);
  assert.equal(context.passive_exposure_input.epoch_catalog[`${rule.rule_id}\0${rule.rule_version}`], 'epoch:store-owned');
});

test('CR-073-04 emits only exact runtime-context keys and rejects forbidden top-level additions', () => {
  const context = buildRuleRuntimeContext({
    pipeline_id: 'pipeline-closed-keys', run_identity: { run_id: 'runtime-closed' }, project_authority: { scope_id: null },
    inventory_identity: { schema: 1, entries: [] }, lifecycle_head: { accepted_head: hash('b').slice(0, 40) }, projection: { revision: 'head:runtime' },
    epoch_catalog: { schema: 1, epochs: {} }, mirror_generation: { digest: hash('c') }, reconciliation_artifact: { schema: 1, reconciliation_id: 'reconciliation:closed' },
    run_id: 'runtime-closed', scope_id: null, projection_revision: 'head:runtime', candidates: [candidate()],
  });
  assert.deepEqual(Object.keys(context).sort(), ['input_digests', 'passive_exposure_input', 'pipeline_id', 'resolver_snapshot', 'schema']);
  assert.equal(Object.hasOwn(context, 'snapshot_id'), false);
});

test('CR-073-11 closes lifecycle state and snapshots complete source/mirror authority', () => {
  const authority = {
    lifecycle_state: 'active',
    created_at: '2026-08-11T00:00:00.000Z',
    source_head: hash('c').slice(0, 40),
    mirror_head: hash('d').slice(0, 40),
    mirror_digest: hash('e'),
  };
  const unknown = resolveRuleSnapshot({ run_id: 'unknown-state', projection_revision: 'head:unknown', candidates: [candidate({ ...authority, lifecycle_state: 'unknown' })] });
  assert.equal(unknown.quality, 'degraded');
  assert.equal(unknown.active_rules.length, 0);
  assert.deepEqual(unknown.reason_codes, ['lifecycle_state_invalid']);

  const complete = resolveRuleSnapshot({ run_id: 'complete-authority', projection_revision: 'head:complete', candidates: [candidate(authority)] });
  assert.equal(complete.created_at, authority.created_at);
  assert.deepEqual(complete.source_heads, { managed_global: authority.source_head });
  assert.deepEqual(complete.mirror_heads, { managed_global: authority.mirror_head });
  assert.equal(complete.active_rules[0].mirror_digest, authority.mirror_digest);
  for (const overrides of [
    { source: 'module' },
    { activation_epoch: 'epoch:other' },
    { protection_class: 'legacy_baseline' },
  ]) {
    const conflict = resolveRuleSnapshot({ run_id: `conflict-${Object.keys(overrides)[0]}`, projection_revision: 'head:conflict', candidates: [candidate(authority), candidate({ ...authority, ...overrides })] });
    assert.equal(conflict.quality, 'degraded');
    assert.equal(conflict.active_rules.length, 0);
  }
  const missingLifecycle = candidate(authority);
  delete missingLifecycle.lifecycle_state;
  const missingLifecycleSnapshot = resolveRuleSnapshot({ run_id: 'missing-lifecycle', projection_revision: 'head:missing', candidates: [missingLifecycle] });
  assert.equal(missingLifecycleSnapshot.quality, 'degraded');
  assert.equal(missingLifecycleSnapshot.active_rules.length, 0);
  for (const missing of ['created_at', 'source_head', 'mirror_head', 'mirror_digest']) {
    const invalid = candidate(authority);
    delete invalid[missing];
    assert.throws(() => resolveRuleSnapshot({ run_id: `missing-${missing}`, projection_revision: 'head:missing', candidates: [invalid] }), /RULE_RESOLVER_INPUT_INVALID/);
  }
  assert.throws(() => resolveRuleSnapshot({ run_id: 'unexpected-key', projection_revision: 'head:unexpected', candidates: [candidate({ forbidden: true })] }), /RULE_RESOLVER_INPUT_INVALID/);
});

test('FM-01..09 fail closed for reconciliation, preserve protected pinned baseline, and record local narrowing', () => {
  const protectedPinned = candidate({ source: 'protected_global', protection_class: 'legacy_baseline', locally_pinned: true });
  const stopped = candidate({ rule_id: 'pidex-global:pidex-implementer:stopped', locally_stopped: true });
  const mirrorMismatch = candidate({ rule_id: 'pidex-global:pidex-implementer:mirror', reconciliation_status: 'mirror_mismatch' });
  const snapshot = resolveRuleSnapshot({ run_id: 'narrowing-run', projection_revision: 'head:narrowing', candidates: [protectedPinned, stopped, mirrorMismatch] });
  assert.equal(snapshot.quality, 'degraded');
  assert.deepEqual(snapshot.active_rules.map((item) => item.rule_id), [protectedPinned.rule_id]);
  assert.deepEqual(snapshot.narrowing, [
    { rule_id: protectedPinned.rule_id, state: 'locally_pinned' },
    { rule_id: stopped.rule_id, state: 'locally_stopped' },
  ]);
  assert.deepEqual(snapshot.reason_codes, ['mirror_mismatch']);
});

test('F2D excludes same identity/version/bytes/head candidates when lifecycle state conflicts', () => {
  const active = candidate();
  const conflicting = candidate({ created_at: '2026-08-11T00:00:01.000Z' });
  const snapshot = resolveRuleSnapshot({ run_id: 'f2d-lifecycle-conflict', projection_revision: 'head:f2d', candidates: [active, conflicting] });
  assert.equal(snapshot.quality, 'degraded');
  assert.deepEqual(snapshot.reason_codes, ['identity_conflict']);
  assert.deepEqual(snapshot.active_rules, []);
});

test('C166-04 applies local stop only after duplicate identity resolution, independent of input order', () => {
  const active = candidate(); const stoppedReplica = candidate({ locally_stopped: true });
  for (const candidates of [[active, stoppedReplica], [stoppedReplica, active]]) {
    const snapshot = resolveRuleSnapshot({ run_id: `stop-${candidates[0].locally_stopped === true}`, projection_revision: 'head:stop', candidates });
    assert.deepEqual(snapshot.active_rules, []);
    assert.deepEqual(snapshot.narrowing, [{ rule_id: active.rule_id, state: 'locally_stopped' }]);
  }
  const deactivated = candidate({ lifecycle_state: 'deactivated', activation_epoch: undefined, locally_stopped: true });
  const closed = resolveRuleSnapshot({ run_id: 'stop-closed', projection_revision: 'head:stop', candidates: [deactivated] });
  assert.deepEqual(closed.active_rules, []);
  assert.deepEqual(closed.narrowing, [], 'local stop cannot revive or claim narrowing over closed canonical state');
});

test('RP-05/06 excludes conflicting identity and permits only bilateral exact project override', () => {
  const base = candidate({ project_override_policy: 'exact_project' });
  const replacement = candidate({ rule_id: `project:${'c'.repeat(24)}:pidex-implementer:quality`, tier: 'project', scope_id: 'c'.repeat(24), source: 'managed_project', overrides_rule_id: base.rule_id, project_override_policy: 'forbidden' });
  const snapshot = resolveRuleSnapshot({ run_id: 'project-run', scope_id: 'c'.repeat(24), projection_revision: 'head:2', candidates: [base, replacement] });
  assert.equal(snapshot.active_rules.map((entry) => entry.rule_id).includes(base.rule_id), false);
  assert.equal(snapshot.active_rules[0].rule_id, replacement.rule_id);
  const conflict = resolveRuleSnapshot({ run_id: 'bad-run', projection_revision: 'head:3', candidates: [base, candidate({ rule_version: hash('d'), content_hash: hash('d'), bytes: '# changed\n' })] });
  assert.equal(conflict.quality, 'degraded');
  assert.equal(conflict.active_rules.length, 0);
});

test('BD18-09 resolves store-returned stopped IDs only after canonical duplicate dedupe and is input-order invariant', () => {
  const active = candidate(); const duplicate = candidate();
  for (const candidates of [[active, duplicate], [duplicate, active]]) {
    const snapshot = resolveRuleSnapshot({ run_id: `stored-stop-${candidates === undefined}`, projection_revision: 'head:stored-stop', candidates, stopped_rule_ids: [active.rule_id] });
    assert.deepEqual(snapshot.active_rules, []); assert.deepEqual(snapshot.narrowing, [{ rule_id: active.rule_id, state: 'locally_stopped' }]);
  }
});

test('BD18-10 rejects conflicting canonical candidates before local stop and never claims stop over deactivated source', () => {
  const conflict = resolveRuleSnapshot({ run_id: 'stored-stop-conflict', projection_revision: 'head:stored-stop', candidates: [candidate(), candidate({ bytes: '# changed\n', rule_version: hash('d'), content_hash: hash('d') })], stopped_rule_ids: ['pidex-global:pidex-implementer:quality'] });
  assert.deepEqual(conflict.active_rules, []); assert.deepEqual(conflict.narrowing, []); assert.deepEqual(conflict.reason_codes, ['identity_conflict']);
  const deactivated = candidate({ lifecycle_state: 'deactivated', activation_epoch: undefined });
  const closed = resolveRuleSnapshot({ run_id: 'stored-stop-deactivated', projection_revision: 'head:stored-stop', candidates: [deactivated], stopped_rule_ids: [deactivated.rule_id] });
  assert.deepEqual(closed.active_rules, []); assert.deepEqual(closed.narrowing, []);
});

test('BD18-11 clearing a local stop restores only already-active canonical eligibility and leaves pin/source/epoch/lifecycle unchanged', () => {
  const pinned = candidate({ locally_pinned: true, activation_epoch: 'epoch:fixed' });
  const stopped = resolveRuleSnapshot({ run_id: 'stored-stop-pinned', projection_revision: 'head:stored-stop', candidates: [pinned], stopped_rule_ids: [pinned.rule_id] });
  const restored = resolveRuleSnapshot({ run_id: 'stored-stop-cleared', projection_revision: 'head:stored-stop', candidates: [pinned], stopped_rule_ids: [] });
  assert.deepEqual(stopped.active_rules, []); assert.deepEqual(restored.active_rules.map((rule) => ({ rule_id: rule.rule_id, activation_epoch: rule.activation_epoch, lifecycle_state: rule.lifecycle_state })), [{ rule_id: pinned.rule_id, activation_epoch: 'epoch:fixed', lifecycle_state: 'active' }]); assert.deepEqual(restored.narrowing, [{ rule_id: pinned.rule_id, state: 'locally_pinned' }]);
});
