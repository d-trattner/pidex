import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadPlan046ImpactResultExamples } from './fixtures/plan046-contract-examples.mjs';
import { buildImpactEvaluationArtifact, parseImpactEvaluationBytes } from './rule-impact-results.mjs';
import { openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { applyRuleLifecycleControl, decideRuleLifecycleAction, deriveActionCadenceDigest, traceRuleLifecycleAction } from './rule-lifecycle-action.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const HEAD = 'c'.repeat(40);
const SCOPE = '1'.repeat(24);
const NOW = '2026-08-22T12:00:00.000Z';
const EXAMPLES = loadPlan046ImpactResultExamples().map(({ bytes }) => parseImpactEvaluationBytes(bytes));
const HARMFUL = EXAMPLES.find((entry) => entry.artifact.state === 'repeated_observational_harm').artifact;
const NON_HARMFUL = EXAMPLES.filter((entry) => entry.artifact.state !== 'repeated_observational_harm');

function harmfulResult(tier = 'global') {
  return buildImpactEvaluationArtifact({
    tier, state: HARMFUL.state,
    lineage: { ...HARMFUL.lineage, rule_id: tier === 'global' ? 'pidex-global:pidex-implementer:quality' : `project:${SCOPE}:pidex-implementer:quality`, rule_version_hash: DIGEST_A, rule_content_hash: DIGEST_B, accepted_commit: HEAD, scope_id: tier === 'global' ? null : SCOPE, activation_epoch: 'epoch:0123456789abcdef01234567', mirror_digest: DIGEST_A, policy_id: 'passive-impact-v1', policy_digest: DIGEST_B },
    closed_window_id: HARMFUL.closed_window_id, collection_progress: HARMFUL.collection_progress, cohorts: HARMFUL.cohorts, comparisons: HARMFUL.comparisons, dimensions: HARMFUL.dimensions, balance: HARMFUL.balance, drift_consistency: HARMFUL.drift_consistency, gate_operands: HARMFUL.gate_operands, metrics: HARMFUL.metrics, quality_flags: HARMFUL.quality_flags, reason: HARMFUL.reason, prior_result: HARMFUL.prior_result, created_at: HARMFUL.created_at, expires_at: HARMFUL.expires_at,
  });
}
function currentFor(result) {
  const { artifact } = result; const lineage = artifact.lineage;
  return { tier: artifact.tier, scope_id: lineage.scope_id, repository_scope_digest: DIGEST_A, rule_id: lineage.rule_id, version_hash: lineage.rule_version_hash, content_hash: lineage.rule_content_hash, accepted_commit: lineage.accepted_commit, activation_epoch: lineage.activation_epoch, mirror_digest: lineage.mirror_digest, resolver_snapshot_digest: lineage.resolver_snapshot_digest, exposure_publication_digest: lineage.exposure_publication_digest, policy_id: lineage.policy_id, policy_digest: lineage.policy_digest, lifecycle_state: 'active', protection_class: 'none', eligible: true, pinned: false, local_stop_active: false, global_stop_active: false, mirror_trusted: true, cadence_due: true, history_state: 'clear' };
}
function decide(result, current = currentFor(result)) { return decideRuleLifecycleAction({ result_bytes: result.bytes, result_digest: result.result_digest, current }); }

test('AC-5 cadence digest uses fixed unsigned length framing and rejects aliases or raw leakage', () => {
  const left = { policy_digest: DIGEST_A, tier: 'project', repository_scope_digest: DIGEST_B, closed_window_id: 'window:1|23' };
  const right = { ...left, closed_window_id: 'window:12|3' };
  const first = deriveActionCadenceDigest(left); const second = deriveActionCadenceDigest(right);
  assert.match(first, /^[a-f0-9]{64}$/); assert.notEqual(first, second);
  assert.equal(first, deriveActionCadenceDigest({ ...left }));
  for (const invalid of [
    { ...left, policy_digest: DIGEST_A.toUpperCase() }, { ...left, tier: 'GLOBAL' }, { ...left, repository_scope_digest: 'scope:private' }, { ...left, closed_window_id: '' }, { ...left, extra: true },
  ]) assert.throws(() => deriveActionCadenceDigest(invalid), /RULE_LIFECYCLE_ACTION_INVALID/);
  assert.doesNotMatch(first, /window|project|scope|policy/);
});
test('BD-1 exact harmful global and project results produce one closed deactivate request', () => {
  for (const tier of ['global', 'project']) {
    const result = harmfulResult(tier); const output = decide(result);
    assert.equal(output.status, 'submit'); assert.equal(output.action, 'deactivate');
    assert.deepEqual(Object.keys(output.request), ['schema', 'tier', 'repository_scope_digest', 'rule_id', 'predecessor_commit', 'version_hash', 'content_hash', 'activation_epoch', 'policy_id', 'policy_digest', 'closed_window_id', 'result_digest', 'lifecycle_transition', 'cadence_digest']);
    assert.deepEqual(output.request, { schema: 'pidex-rule-lifecycle-action-request-v1', tier, repository_scope_digest: DIGEST_A, rule_id: result.artifact.lineage.rule_id, predecessor_commit: HEAD, version_hash: DIGEST_A, content_hash: DIGEST_B, activation_epoch: 'epoch:0123456789abcdef01234567', policy_id: 'passive-impact-v1', policy_digest: DIGEST_B, closed_window_id: result.artifact.closed_window_id, result_digest: result.result_digest, lifecycle_transition: 'deactivated', cadence_digest: deriveActionCadenceDigest({ policy_digest: DIGEST_B, tier, repository_scope_digest: DIGEST_A, closed_window_id: result.artifact.closed_window_id }) });
    assert.doesNotMatch(JSON.stringify(output), /credential|secret|token|\/home\/|[A-Z]:\\/i);
  }
});
test('BH-1/BH-2 rejects changed bytes, wrong digest, non-harm, stale and terminal result states', () => {
  const harmful = harmfulResult();
  assert.deepEqual(decideRuleLifecycleAction({ result_bytes: Buffer.concat([harmful.bytes, Buffer.from(' ')]), result_digest: harmful.result_digest, current: currentFor(harmful) }), { status: 'no_op', reason: 'result_invalid' });
  assert.deepEqual(decideRuleLifecycleAction({ result_bytes: harmful.bytes, result_digest: DIGEST_A, current: currentFor(harmful) }), { status: 'no_op', reason: 'result_invalid' });
  for (const result of NON_HARMFUL) assert.deepEqual(decide(result, currentFor(result)), { status: 'no_op', reason: 'result_not_harmful' });
});
test('BD-2 every current authority denial is deterministic and submits zero mutation', () => {
  const result = harmfulResult(); const base = currentFor(result);
  const cases = [
    ['authority_mismatch', { accepted_commit: 'd'.repeat(40) }], ['authority_mismatch', { version_hash: 'd'.repeat(64) }], ['authority_mismatch', { content_hash: 'd'.repeat(64) }], ['authority_mismatch', { activation_epoch: 'epoch:ffffffffffffffffffffffff' }], ['authority_mismatch', { mirror_digest: 'd'.repeat(64) }], ['authority_mismatch', { resolver_snapshot_digest: 'd'.repeat(64) }], ['authority_mismatch', { exposure_publication_digest: 'd'.repeat(64) }], ['authority_mismatch', { policy_digest: 'd'.repeat(64) }],
    ['inactive', { lifecycle_state: 'deactivated' }], ['protected', { protection_class: 'security' }], ['ineligible', { eligible: false }], ['pinned', { pinned: true }], ['stopped', { local_stop_active: true }], ['stopped', { global_stop_active: true }], ['mirror_untrusted', { mirror_trusted: false }], ['cadence_not_due', { cadence_due: false }], ['cadence_consumed', { history_state: 'consumed' }], ['cadence_quarantined', { history_state: 'quarantined' }],
  ];
  for (const [reason, patch] of cases) assert.deepEqual(decide(result, { ...base, ...patch }), { status: 'no_op', reason }, reason);
});
test('SEC48-01 closed input shapes reject extra fields, foreign scope, malformed history, and private sentinels', () => {
  const result = harmfulResult(); const base = currentFor(result);
  for (const current of [
    { ...base, extra: true }, { ...base, scope_id: SCOPE }, { ...base, repository_scope_digest: '/home/private/project' }, { ...base, history_state: 'unknown' }, { ...base, rule_id: 'pidex-global:pidex-implementer:quality', private_path: 'C:\\private' },
  ]) assert.deepEqual(decideRuleLifecycleAction({ result_bytes: result.bytes, result_digest: result.result_digest, current }), { status: 'no_op', reason: 'authority_invalid' });
});
function withStore(run) { const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-action-slice1-')); const store = openRuleLifecycleStore({ stateRoot }); try { return run(store, stateRoot); } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); } }

test('Slice1A tracer persists exact result/cadence/request bytes with deterministic correlation and zero-or-one replay', () => withStore((store) => {
  const result = harmfulResult('project'); const trace = () => traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current: currentFor(result), now: NOW });
  const first = trace(); assert.equal(first.status, 'intent'); assert.match(first.correlation_id, /^action:[a-f0-9]{64}$/); assert.match(first.intent_digest, /^[a-f0-9]{64}$/); assert.match(first.cadence_digest, /^[a-f0-9]{64}$/); assert.equal(first.request.lifecycle_transition, 'deactivated');
  const durable = store.readLifecycleActionIntentByCadence({ cadence_digest: first.cadence_digest }); assert.equal(durable.status, 'intent'); assert.equal(durable.correlation_id, first.correlation_id); assert.equal(durable.cadence_digest, first.cadence_digest); assert.equal(durable.result_digest, result.result_digest); assert.deepEqual(JSON.parse(durable.request_json), first.request); assert.equal(store.readLifecycleActionIntent({ correlation_id: first.correlation_id }).intent_digest, first.intent_digest);
  const replay = trace(); assert.equal(replay.status, 'existing'); assert.equal(replay.correlation_id, first.correlation_id); assert.equal(store.readLifecycleActionIntentByCadence({ cadence_digest: first.cadence_digest }).intent_digest, first.intent_digest);
}));

test('Slice1A global and project tiers each persist one intent and duplicate same-cadence attempt conflicts with zero mutation', () => withStore((store) => {
  for (const tier of ['global', 'project']) {
    const result = harmfulResult(tier); const trace = () => traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current: currentFor(result), now: NOW });
    const intent = trace(); assert.equal(intent.status, 'intent', tier);
    const again = trace(); assert.equal(again.status, 'existing', tier);
    const conflict = traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current: { ...currentFor(result), lifecycle_state: 'deactivated' }, now: NOW });
    assert.equal(conflict.status, 'conflict', tier);
    assert.equal(store.readLifecycleActionIntentByCadence({ cadence_digest: intent.cadence_digest }).status, 'intent', tier);
  }
}));

test('Slice1A tracer persists deterministic no-op truth and fails closed without store authority or leak', () => withStore((store) => {
  const result = harmfulResult(); const pinned = { ...currentFor(result), pinned: true };
  const first = traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current: pinned, now: NOW });
  assert.equal(first.status, 'no_op'); assert.equal(first.reason, 'pinned'); assert.match(first.correlation_id, /^action:[a-f0-9]{64}$/);
  assert.equal(store.readLifecycleActionIntentByCadence({ cadence_digest: first.cadence_digest }).reason, 'pinned');
  const replay = traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current: pinned, now: NOW });
  assert.equal(replay.status, 'no_op'); assert.equal(replay.correlation_id, first.correlation_id);
  const invalid = traceRuleLifecycleAction({ store, result_bytes: Buffer.concat([result.bytes, Buffer.from(' ')]), result_digest: result.result_digest, current: currentFor(result), now: NOW });
  assert.deepEqual(invalid, { status: 'no_op', reason: 'result_invalid' });
  assert.throws(() => traceRuleLifecycleAction({ store: { persistLifecycleActionIntent: () => ({ status: 'recorded' }) }, result_bytes: result.bytes, result_digest: result.result_digest, current: currentFor(result), now: NOW }), /RULE_LIFECYCLE_ACTION_STORE_INVALID/);
  assert.doesNotMatch(JSON.stringify({ first, invalid }), /credential|secret|token|\/home\/|[A-Z]:\\/i);
}));

function slice2LayoutPaths(rule_id) {
  const global = /^pidex-global:([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(rule_id || '');
  if (global) return { paths: ['config/rule-baseline-manifest.json', `rules/${global[1]}/${global[2]}.md`, `rules/${global[1]}/index.md`], rule: `rules/${global[1]}/${global[2]}.md` };
  const project = /^project:([a-f0-9]{24,64}):([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(rule_id || '');
  return { paths: [`pidex/rules/managed/${project[2]}/${project[3]}.md`, `pidex/rules/managed/${project[2]}/index.md`], rule: `pidex/rules/managed/${project[2]}/${project[3]}.md` };
}
function slice2PlainCommit(id, parents, staged = {}) { return { commit: id, parents, tree_digest: createHash('sha256').update(id + 'tree').digest('hex'), author: 'PIDEX <pidex@example.invalid>', subject: 'chore: unrelated', trailers: {}, staged_member_digests: staged }; }
function slice2LayoutStaged(layout, ruleDigest, indexDigest) { const digests = { [layout.rule]: ruleDigest }; for (const entry of layout.paths) if (entry !== layout.rule) digests[entry] = entry.endsWith('index.md') ? indexDigest : createHash('sha256').update('manifest').digest('hex'); return digests; }
function slice2CadenceCommit({ id, parent, rule_id, cadence_digest, transaction = 'f'.repeat(64), admission = 'e'.repeat(64), rule_digest, staged, trailers }) {
  const layout = slice2LayoutPaths(rule_id);
  const tier = rule_id.startsWith('pidex-global') ? 'global' : 'project';
  return { commit: id, parents: [parent], tree_digest: createHash('sha256').update(id + 'tree').digest('hex'), author: 'PIDEX <pidex@example.invalid>', subject: `rules(${tier}): publish ${rule_id}`, trailers: trailers || { 'PIDEX-Rule-ID': rule_id, 'PIDEX-Transaction-Digest': transaction, 'PIDEX-Admission-Digest': admission, 'PIDEX-Predecessor': `commit:${parent}`, 'PIDEX-Action-Cadence': cadence_digest }, staged_member_digests: staged || slice2LayoutStaged(layout, rule_digest || createHash('sha256').update('deactivated').digest('hex'), createHash('sha256').update('index').digest('hex')) };
}
function slice2HistoryAdapter(map) { return { inspectCommit: ({ commit }) => { const value = map.get(commit); if (!value) throw new Error('missing ' + commit); return value; } }; }
function slice2ParentStaged(layout) { const digests = { [layout.rule]: createHash('sha256').update('active').digest('hex') }; for (const entry of layout.paths) if (entry !== layout.rule) digests[entry] = entry.endsWith('index.md') ? createHash('sha256').update('index').digest('hex') : createHash('sha256').update('manifest').digest('hex'); return digests; }
function slice2ConsumedChain(current) {
  const layout = slice2LayoutPaths(current.rule_id); const base = current.accepted_commit;
  const consumption = slice2CadenceCommit({ id: 'd'.repeat(40), parent: base, rule_id: current.rule_id, cadence_digest: deriveActionCadenceDigest({ policy_digest: current.policy_digest, tier: current.tier, repository_scope_digest: current.repository_scope_digest, closed_window_id: harmfulResult(current.tier).artifact.closed_window_id }) });
  return { map: new Map([[base, slice2PlainCommit(base, [], slice2ParentStaged(layout))], [consumption.commit, consumption]]), consumption };
}
function slice2ClearChain(current) { const base = current.accepted_commit; return new Map([[base, slice2PlainCommit(base, [], {})]]); }

test('Slice2 pre-submit integrates validated history: clear proceeds, consumed denies with zero second action, quarantined denies', () => withStore((store, stateRoot) => {
  const result = harmfulResult('project'); const base = currentFor(result); const now2 = '2026-08-22T13:00:00.000Z';
  const trace = (history) => traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current: base, now: now2, history });
  const first = trace(); assert.equal(first.status, 'intent');
  const { map, consumption } = slice2ConsumedChain(base);
  const retry = trace({ adapter: slice2HistoryAdapter(map), remote_head: consumption.commit, bound_from: base.accepted_commit, max_commits: 8 });
  assert.equal(retry.status, 'no_op'); assert.equal(retry.reason, 'cadence_consumed'); assert.match(retry.correlation_id, /^action:[a-f0-9]{64}$/); assert.match(retry.cadence_digest, /^[a-f0-9]{64}$/); assert.equal(retry.intent_digest, undefined);
  const durable = store.readLifecycleActionIntentByCadence({ cadence_digest: retry.cadence_digest }); assert.equal(durable.status, 'intent', 'prior intent preserved, no overwrite, zero second action');
  const again = trace({ adapter: slice2HistoryAdapter(map), remote_head: consumption.commit, bound_from: base.accepted_commit, max_commits: 8 }); assert.deepEqual(again, retry);
  const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lifecycle_action_transaction').get().count, 0, 'consumed retry prepares no second transaction'); db.close();
  const clearTrace = trace({ adapter: slice2HistoryAdapter(slice2ClearChain(base)), remote_head: base.accepted_commit, bound_from: base.accepted_commit, max_commits: 8 });
  assert.equal(clearTrace.status, 'existing', 'clear verified history replays the single durable intent');
  const malformed = slice2CadenceCommit({ id: 'e'.repeat(40), parent: base.accepted_commit, rule_id: base.rule_id, cadence_digest: deriveActionCadenceDigest({ policy_digest: base.policy_digest, tier: base.tier, repository_scope_digest: base.repository_scope_digest, closed_window_id: harmfulResult('project').artifact.closed_window_id }).toUpperCase() });
  const quarantined = trace({ adapter: slice2HistoryAdapter(new Map([[base.accepted_commit, slice2PlainCommit(base.accepted_commit, [], {})], [malformed.commit, malformed]])), remote_head: malformed.commit, bound_from: base.accepted_commit, max_commits: 8 });
  assert.equal(quarantined.status, 'no_op'); assert.equal(quarantined.reason, 'cadence_quarantined');
}));

test('Slice2 caller history_state assertion never overrides classifier: stale consumed cache with clear history still submits once', () => withStore((store) => {
  const result = harmfulResult('project'); const stale = { ...currentFor(result), history_state: 'consumed' }; const now2 = '2026-08-22T13:00:00.000Z';
  const clearMap = slice2ClearChain(currentFor(result));
  const traced = traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current: stale, now: now2, history: { adapter: slice2HistoryAdapter(clearMap), remote_head: stale.accepted_commit, bound_from: stale.accepted_commit, max_commits: 8 } });
  assert.equal(traced.status, 'intent', 'classifier-verified clear history is authoritative over caller consumed assertion');
  assert.equal(store.readLifecycleActionIntentByCadence({ cadence_digest: traced.cadence_digest }).status, 'intent');
}));

test('Slice2 fake independent-host same-base race: winner consumed, loser pre-submit retry returns cadence_consumed identically for global and project tiers', () => withStore((store) => {
  for (const tier of ['global', 'project']) {
    const result = harmfulResult(tier); const current = currentFor(result); const now2 = '2026-08-22T13:00:00.000Z';
    const loserTrace = () => traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current, now: now2 });
    const first = loserTrace(); assert.equal(first.status, 'intent', tier);
    const { map, consumption } = slice2ConsumedChain(current);
    const retry = traceRuleLifecycleAction({ store, result_bytes: result.bytes, result_digest: result.result_digest, current, now: now2, history: { adapter: slice2HistoryAdapter(map), remote_head: consumption.commit, bound_from: current.accepted_commit, max_commits: 8 } });
    assert.deepEqual({ status: retry.status, reason: retry.reason }, { status: 'no_op', reason: 'cadence_consumed' }, tier);
    assert.equal(store.readLifecycleActionIntentByCadence({ cadence_digest: first.cadence_digest }).status, 'intent', tier);
  }
}));

test('Slice2 denial parity is deterministic across global and project tiers for identical byte inputs', () => {
  const results = [];
  for (const tier of ['global', 'project']) {
    const result = harmfulResult(tier); const base = currentFor(result);
    const gates = [['inactive', { lifecycle_state: 'deactivated' }], ['pinned', { pinned: true }], ['stopped', { local_stop_active: true }], ['cadence_consumed', { history_state: 'consumed' }], ['cadence_quarantined', { history_state: 'quarantined' }], ['mirror_untrusted', { mirror_trusted: false }]];
    results.push(gates.map(([reason, patch]) => [reason, decide(result, { ...base, ...patch })].flat()));
  }
  assert.deepEqual(results[0], results[1], 'global and project denial reasons and shapes identical');
  assert.ok(results[0].every((entry) => /^(?:inactive|pinned|stopped|cadence_consumed|cadence_quarantined|mirror_untrusted)$/.test(entry[0]) && entry[1]?.status === 'no_op' && entry[1].reason === entry[0]));
  assert.doesNotMatch(JSON.stringify(results), /credential|secret|token|\/home\/|[A-Z]:\\/i);
});
const CONTROL_SCOPE = '2'.repeat(24);
const CONTROL_REPO = 'repo:control';
const CONTROL_RULE = `project:${CONTROL_SCOPE}:pidex-implementer:quality`;
const CONTROL_HEAD = 'f'.repeat(40);
const CONTROL_ACTOR = 'a'.repeat(64);
const CONTROL_NONCE = 'b'.repeat(64);
const CONTROL_NOW = '2026-08-22T14:00:00.000Z';
const CONTROL_AUTH = Object.freeze({ authenticated: true, authorized: true, csrf_valid: true });
function controlWriterAuthority() {
  return { normalized_remote_digest: 'c'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: 'd'.repeat(64), identity_platform: 'posix', root_identity_digest: 'e'.repeat(64), parent_identity_digest: 'f'.repeat(64), files_identity_digest: '1'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: CONTROL_NOW };
}
function controlTarget() {
  return { repository: CONTROL_REPO, tier: 'project', scope_id: CONTROL_SCOPE, scope_digest: '4'.repeat(64), rule_id: CONTROL_RULE, predecessor: `commit:${CONTROL_HEAD}`, allowed_paths: ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/quality.md'], enrollment_digest: '3'.repeat(64), writer_authority: controlWriterAuthority() };
}
function controlCurrent({ lifecycle_state = 'deactivated', pinned = false, local_stop_active = false, global_stop_active = false, protection_class = 'none' } = {}) {
  return { tier: 'project', scope_id: CONTROL_SCOPE, repository_scope_digest: '4'.repeat(64), rule_id: CONTROL_RULE, version_hash: '5'.repeat(64), content_hash: '6'.repeat(64), accepted_commit: CONTROL_HEAD, activation_epoch: 'epoch:0123456789abcdef01234567', mirror_digest: '5'.repeat(64), resolver_snapshot_digest: '5'.repeat(64), exposure_publication_digest: '5'.repeat(64), policy_id: 'passive-impact-v1', policy_digest: '7'.repeat(64), lifecycle_state, protection_class, eligible: true, pinned, local_stop_active, global_stop_active, mirror_trusted: true, cadence_due: true, history_state: 'clear' };
}
function controlRuleBytes(lifecycle_state = 'deactivated') {
  return Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${CONTROL_RULE}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"${lifecycle_state}"} -->\n# quality\n\n## Instruction\nValidate quality checks.\n`, 'utf8');
}
function withControlStore(run) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-control-slice3a-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    store.enroll({ repository: CONTROL_REPO, scope_id: CONTROL_SCOPE, remote: 'https://example.invalid/pidex', branch: 'refs/heads/main' });
    store.enrollPublicationTarget(controlTarget());
    return run(store, stateRoot);
  } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
}
function controlProjection(store, lifecycle_state = 'deactivated') {
  const head = { head_kind: 'current_project', repository_identity: CONTROL_REPO, accepted_remote_head: CONTROL_HEAD, baseline_parent_commit: CONTROL_HEAD, manifest_digest: null, tree_digest: '9'.repeat(64), seeded_at: null, verified_at: '2026-08-22T12:00:00.000Z', remote_checked_at: '2026-08-22T12:00:00.000Z', freshness: 'exact_head' };
  const entry = { rule_id: CONTROL_RULE, rule_version: '6'.repeat(64), content_hash: '6'.repeat(64), accepted_commit: CONTROL_HEAD, bytes: '# quality\n', tier: 'project', scope_id: CONTROL_SCOPE, protection_class: 'none', source: 'managed_project', lifecycle_state, created_at: '2026-08-22T12:00:00.000Z', source_head: CONTROL_HEAD, mirror_head: CONTROL_HEAD, mirror_digest: '6'.repeat(64), agent: 'pidex-implementer', applicability: null };
  store.replaceProjection({ repository: CONTROL_REPO, scope_id: CONTROL_SCOPE, accepted_head: CONTROL_HEAD, head, entries: [entry], event_kind: 'baseline_imported' });
  return entry;
}
function controlBase(store, control) { return { store, control, auth: CONTROL_AUTH, actor: CONTROL_ACTOR, nonce: CONTROL_NONCE, repository: CONTROL_REPO, scope_id: CONTROL_SCOPE, rule_id: CONTROL_RULE, now: CONTROL_NOW, current: controlCurrent(), target: controlTarget(), rule_bytes: controlRuleBytes(), expected_base: CONTROL_HEAD }; }
function controlCall(store, control, extra = {}) { return applyRuleLifecycleControl({ ...controlBase(store, control), ...extra }); }
function controlTxCount(stateRoot) {
  const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
  try { return { tx: db.prepare('SELECT COUNT(*) AS count FROM lifecycle_action_transaction').get().count, intent: db.prepare('SELECT COUNT(*) AS count FROM lifecycle_action_intent').get().count, stops: db.prepare('SELECT COUNT(*) AS count FROM local_narrowing').get().count }; } finally { db.close(); }
}
function assertRejected(result, reason) { assert.deepEqual(Object.keys(result).sort(), ['reason', 'status']); assert.equal(result.status, 'rejected'); assert.equal(result.reason, reason); }

test('Slice3A control boundary rejects absent, unauthorized, CSRF-invalid, and malformed auth with safe deterministic errors and zero mutation', () => withControlStore((store, stateRoot) => {
  controlProjection(store);
  for (const auth of [undefined, null, {}, { authenticated: true }, { authenticated: true, authorized: true }, { authenticated: false, authorized: true, csrf_valid: true }, { authenticated: true, authorized: false, csrf_valid: true }, { authenticated: true, authorized: true, csrf_valid: false }, { authenticated: true, authorized: true, csrf_valid: true, extra: true }, { authenticated: 'yes', authorized: true, csrf_valid: true }, { authenticated: true, authorized: true, csrf_valid: true, token: 'secret' }]) assertRejected(applyRuleLifecycleControl({ ...controlBase(store, 'reactivate-monitor'), auth }), 'operator_access_required');
  assertRejected(applyRuleLifecycleControl({ ...controlBase(store, 'purge-forever') }), 'control_invalid');
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 0, stops: 0 }, 'rejected intents mutate nothing');
}));

test('Slice3A control boundary rejects invalid actor, nonce, time, and private sentinels with zero mutation', () => withControlStore((store, stateRoot) => {
  controlProjection(store);
  const base = controlBase(store, 'reactivate-monitor');
  for (const actor of ['/home/operator', 'token=abc123', 'operator@example.invalid', 'pidex-operator', 'b'.repeat(63)]) assertRejected(applyRuleLifecycleControl({ ...base, actor }), 'input_invalid');
  for (const nonce of ['secret-nonce', 'c'.repeat(63), '']) assertRejected(applyRuleLifecycleControl({ ...base, nonce }), 'input_invalid');
  assertRejected(applyRuleLifecycleControl({ ...base, now: 'yesterday' }), 'input_invalid');
  assertRejected(applyRuleLifecycleControl({ ...base, repository: '/home/private/repo' }), 'input_invalid');
  assertRejected(applyRuleLifecycleControl({ ...base, scope_id: 'C:\\private' }), 'input_invalid');
  assertRejected(applyRuleLifecycleControl({ ...base, store: {} }), 'input_invalid');
  const result = controlCall(store, 'reactivate-monitor');
  assert.equal(result.status, 'prepared');
  assert.doesNotMatch(JSON.stringify(result), /credential|secret|token|password|\/home\/|C:\\/i);
  assert.deepEqual(controlTxCount(stateRoot), { tx: 1, intent: 1, stops: 0 });
}));

test('Slice3A BD-6/BD-8 stop-local is immediate store narrowing, never canonical stopped, and never reactivates an inactive rule', () => withControlStore((store, stateRoot) => {
  controlProjection(store);
  const stopped = controlCall(store, 'stop-local');
  assert.equal(stopped.status, 'stopped_local'); assert.match(stopped.correlation_id, /^action:[a-f0-9]{64}$/);
  assert.deepEqual({ status: stopped.local_stop.status, reason: stopped.local_stop.reason_code, rule: stopped.local_stop.rule_id }, { status: 'stopped', reason: 'operator_stop', rule: CONTROL_RULE });
  assert.equal(store.readLocalRuleStop({ repository: CONTROL_REPO, scope_id: CONTROL_SCOPE, rule_id: CONTROL_RULE }).reason_code, 'operator_stop');
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 1, stops: 1 }, 'local stop never creates canonical stopped transition');
  const replay = controlCall(store, 'stop-local');
  assert.equal(replay.status, 'stopped_local'); assert.equal(replay.correlation_id, stopped.correlation_id);
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 1, stops: 1 }, 'stop replay is zero-or-one');
}));

test('Slice3A BD-8 emergency stop on a canonically inactive rule keeps it inactive with stop truth and no reactivation request', () => withControlStore((store, stateRoot) => {
  controlProjection(store, 'deactivated');
  const stopped = controlCall(store, 'stop-local');
  assert.equal(stopped.status, 'stopped_local');
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 1, stops: 1 }, 'inactive rule stop writes zero canonical/reactivation transitions');
  const cross = controlCall(store, 'stop-cross-host');
  assert.equal(cross.status, 'stopped_local'); assert.equal(cross.canonical_inactive, true);
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 2, stops: 1 }, 'cross-host on inactive rule never prepares deactivated transition and never reactivates');
  const projection = store.readProjection({ repository: CONTROL_REPO, scope_id: CONTROL_SCOPE });
  assert.equal(projection.entries.find((entry) => entry.rule_id === CONTROL_RULE).lifecycle_state, 'deactivated', 'canonical inactive truth retained');
}));

test('Slice3A BD-7 refinement-handoff returns handoff status only with zero synthetic candidate or result', () => withControlStore((store, stateRoot) => {
  controlProjection(store, 'deactivated');
  const handoff = controlCall(store, 'refinement-handoff');
  assert.deepEqual(Object.keys(handoff).sort(), ['correlation_id', 'handoff', 'status']);
  assert.equal(handoff.status, 'handoff'); assert.equal(handoff.handoff, 'refinement-requested'); assert.match(handoff.correlation_id, /^action:[a-f0-9]{64}$/);
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 1, stops: 0 }, 'handoff creates no TX, candidate, or admission result');
  const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM manual_refinement_request').get().count, 0, 'no synthetic refinement request/candidate row'); db.close();
  const replay = controlCall(store, 'refinement-handoff');
  assert.equal(replay.status, 'handoff'); assert.equal(replay.correlation_id, handoff.correlation_id);
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 1, stops: 0 });
}));

test('Slice3A BD-3 reactivate-monitor prepares one canonical active-monitor TX through lifecycle-action machinery with bounded actor correlation and body preservation', () => withControlStore((store, stateRoot) => {
  controlProjection(store, 'deactivated');
  const prepared = controlCall(store, 'reactivate-monitor');
  assert.equal(prepared.status, 'prepared'); assert.equal(prepared.transition, 'active-monitor'); assert.match(prepared.transaction, /^tx:[a-f0-9]{64}$/); assert.match(prepared.correlation_id, /^action:[a-f0-9]{64}$/); assert.match(prepared.cadence_digest, /^[a-f0-9]{64}$/);
  const facts = store.readLifecycleActionWriterFacts({ idempotency_key: prepared.transaction });
  assert.equal(facts.state, 'prepared'); assert.equal(facts.action.lifecycle_transition, 'active-monitor'); assert.equal(facts.action.rule_id, CONTROL_RULE); assert.equal(facts.action.predecessor_commit, CONTROL_HEAD);
  const ruleText = facts.rule_bytes.toString('utf8'); assert.match(ruleText, /"lifecycle_state":"active-monitor"/);
  assert.ok(ruleText.includes('# quality\n\n## Instruction\nValidate quality checks.\n'), 'rule body preserved through canonical transition');
  const intent = store.readLifecycleActionIntentByCadence({ cadence_digest: prepared.cadence_digest });
  assert.equal(intent.status, 'intent'); assert.equal(intent.correlation_id, prepared.correlation_id);
  const record = JSON.parse(intent.request_json);
  assert.deepEqual(Object.keys(record).sort(), ['actor_digest', 'control', 'correlation_id', 'rule_id', 'schema', 'transition']);
  assert.deepEqual({ control: record.control, actor: record.actor_digest, rule: record.rule_id, transition: record.transition }, { control: 'reactivate-monitor', actor: CONTROL_ACTOR, rule: CONTROL_RULE, transition: 'active-monitor' });
  const replay = controlCall(store, 'reactivate-monitor');
  assert.equal(replay.status, 'prepared'); assert.equal(replay.transaction, prepared.transaction);
  assert.deepEqual(controlTxCount(stateRoot), { tx: 1, intent: 1, stops: 0 }, 'exact replay is zero-or-one');
  assert.doesNotMatch(JSON.stringify({ prepared, intent, record }), /credential|secret|token|password|\/home\/|C:\\|operator@/i);
}));

test('Slice3A BD-4/BD-5 reactivate-pin and unpin prepare exact transitions and never implicitly bypass protection or local stop', () => withControlStore((store, stateRoot) => {
  controlProjection(store, 'deactivated');
  const pin = controlCall(store, 'reactivate-pin');
  assert.equal(pin.status, 'prepared'); assert.equal(pin.transition, 'active-pinned');
  assert.equal(store.readLifecycleActionWriterFacts({ idempotency_key: pin.transaction }).action.lifecycle_transition, 'active-pinned');
  const unpin = controlCall(store, 'unpin', { current: controlCurrent({ lifecycle_state: 'active-pinned' }), rule_bytes: controlRuleBytes('active-pinned') });
  assert.equal(unpin.status, 'prepared'); assert.equal(unpin.transition, 'active-monitor');
  const unpinFacts = store.readLifecycleActionWriterFacts({ idempotency_key: unpin.transaction });
  assert.equal(unpinFacts.action.lifecycle_transition, 'active-monitor'); assert.equal(unpinFacts.action.rule_id, CONTROL_RULE); assert.equal(unpinFacts.action.cadence_digest, unpinFacts.cadence_digest);
  assert.ok(!Object.keys(unpinFacts.action).some((key) => /protection|stop|credential|token/i.test(key)), 'transition request never carries protection or stop fields');
  const stoppedPin = controlCall(store, 'reactivate-pin', { current: controlCurrent({ lifecycle_state: 'deactivated', local_stop_active: true }) });
  assert.deepEqual({ status: stoppedPin.status, reason: stoppedPin.reason }, { status: 'no_op', reason: 'stopped' });
  const protectedUnpin = controlCall(store, 'unpin', { current: controlCurrent({ lifecycle_state: 'active-pinned', protection_class: 'security' }), rule_bytes: controlRuleBytes('active-pinned') });
  assert.deepEqual({ status: protectedUnpin.status, reason: protectedUnpin.reason }, { status: 'no_op', reason: 'protected' });
  assert.deepEqual(controlTxCount(stateRoot), { tx: 2, intent: 2, stops: 0 }, 'bypass attempts prepare no transition');
}));

test('Slice3A BD-6 stop-cross-host applies local stop and reuses existing deactivated transition only when canonical is active', () => withControlStore((store, stateRoot) => {
  controlProjection(store, 'active-monitor');
  const cross = controlCall(store, 'stop-cross-host', { current: controlCurrent({ lifecycle_state: 'active-monitor' }), rule_bytes: controlRuleBytes('active-monitor') });
  assert.equal(cross.status, 'prepared'); assert.equal(cross.transition, 'deactivated');
  assert.deepEqual({ status: cross.local_stop.status, reason: cross.local_stop.reason_code }, { status: 'stopped', reason: 'operator_stop' });
  const facts = store.readLifecycleActionWriterFacts({ idempotency_key: cross.transaction });
  assert.equal(facts.action.lifecycle_transition, 'deactivated'); assert.match(facts.rule_bytes.toString('utf8'), /"lifecycle_state":"deactivated"/);
  assert.ok(facts.rule_bytes.toString('utf8').includes('## Instruction\nValidate quality checks.\n'), 'body preserved through cross-host deactivation');
  assert.equal(store.readLocalRuleStop({ repository: CONTROL_REPO, scope_id: CONTROL_SCOPE, rule_id: CONTROL_RULE }).reason_code, 'operator_stop');
  assert.deepEqual(controlTxCount(stateRoot), { tx: 1, intent: 1, stops: 1 });
  const projection = store.readProjection({ repository: CONTROL_REPO, scope_id: CONTROL_SCOPE });
  assert.equal(projection.entries.find((entry) => entry.rule_id === CONTROL_RULE).lifecycle_state, 'active-monitor', 'local stop overlay leaves canonical state separately visible');
}));

test('Slice3A stale controls return deterministic lifecycle_state_changed no-op and never bypass the two-gate epoch', () => withControlStore((store, stateRoot) => {
  controlProjection(store, 'active-monitor');
  const stale = controlCall(store, 'reactivate-monitor', { current: controlCurrent({ lifecycle_state: 'active-monitor' }), rule_bytes: controlRuleBytes('active-monitor') });
  assert.deepEqual({ status: stale.status, reason: stale.reason }, { status: 'no_op', reason: 'lifecycle_state_changed' });
  const unpinNotPinned = controlCall(store, 'unpin', { current: controlCurrent({ lifecycle_state: 'deactivated' }) });
  assert.deepEqual({ status: unpinNotPinned.status, reason: unpinNotPinned.reason }, { status: 'no_op', reason: 'lifecycle_state_changed' });
  const reactivateWhileStopped = controlCall(store, 'reactivate-pin', { current: controlCurrent({ lifecycle_state: 'deactivated', global_stop_active: true }) });
  assert.deepEqual({ status: reactivateWhileStopped.status, reason: reactivateWhileStopped.reason }, { status: 'no_op', reason: 'stopped' });
  assertRejected(applyRuleLifecycleControl({ ...controlBase(store, 'reactivate-monitor'), current: undefined, target: undefined, rule_bytes: undefined, expected_base: undefined }), 'input_incomplete');
  assert.deepEqual(controlTxCount(stateRoot), { tx: 0, intent: 0, stops: 0 }, 'stale/incomplete controls mutate nothing and mint no epoch');
}));
