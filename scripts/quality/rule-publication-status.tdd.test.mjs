import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { listRulePublicationStatus, readRulePublicationStatusDetail } from './rule-publication-status.mjs';

const hex = (char, length = 64) => char.repeat(length);
const commit = (char) => hex(char, 40);
const now = '2026-08-14T00:00:00.000Z';
const authority = 'Generated candidate — not authority';
const unavailable = 'Status unavailable';
const readyEpoch = `epoch:${hex('e', 24)}`;
const statusProofs = Object.freeze({ receipt_valid: false, status_ready: false, active_current: false, local_stop_active: false, refinement_pending: false });
const rows = [
  { transaction_digest: hex('6'), rule_id: 'project:abcdefabcdefabcdefabcdef:pidex-implementer:project', tier: 'project', scope_id: 'abcdefabcdefabcdefabcdef', state: 'abandoned', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, created_at: now, updated_at: now, refinement_pending: false },
  { transaction_digest: hex('1'), rule_id: 'pidex-global:pidex-implementer:prepared', tier: 'global', scope_id: 'pidex-global', state: 'prepared', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, created_at: now, updated_at: now, refinement_pending: false },
  { transaction_digest: hex('2'), rule_id: 'pidex-global:pidex-implementer:local', tier: 'global', scope_id: 'pidex-global', state: 'committed_local', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, created_at: now, updated_at: now, refinement_pending: false },
  { transaction_digest: hex('3'), rule_id: 'pidex-global:pidex-implementer:accepted', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', receipt_valid: true, handoff_stage: 'mirror_verified', receipt_digest: hex('3'), accepted_commit: commit('3'), content_hash: hex('3'), activation_epoch: null, created_at: now, updated_at: now, refinement_pending: false },
  { transaction_digest: hex('4'), rule_id: 'pidex-global:pidex-implementer:published', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', receipt_valid: true, status_ready: true, handoff_stage: 'status_ready', receipt_digest: hex('4'), accepted_commit: commit('4'), content_hash: hex('4'), activation_epoch: readyEpoch, active_current: true, local_stop_active: false, created_at: now, updated_at: now, refinement_pending: false },
  { transaction_digest: hex('5'), rule_id: 'pidex-global:pidex-implementer:deferred', tier: 'global', scope_id: 'pidex-global', state: 'deferred_remote_advanced', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, created_at: now, updated_at: now, refinement_pending: false },
  { transaction_digest: hex('7'), rule_id: 'pidex-global:pidex-implementer:rejected', tier: 'global', scope_id: 'pidex-global', state: 'rejected_policy', policy_category: 'privacy', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, activation_epoch: null, created_at: now, updated_at: now, refinement_pending: false },
].map((row) => ({ ...statusProofs, policy_category: null, ...row, predecessor_commit: null, tree_digest: null, admission_digest: null, policy_digest: null, version_hash: null }));
function store(records = rows) { return { listPublicationStatusFacts: () => records, readPublicationStatusFacts: ({ transaction_digest }) => records.find((row) => row.transaction_digest === transaction_digest) }; }

const rowKeys = ['accepted_commit', 'activation_epoch', 'content_hash', 'fallback', 'handoff_stage', 'inspect', 'policy_category', 'proposal_label', 'receipt_digest', 'refinement', 'refinement_reason', 'rule_id', 'scope_id', 'state', 'tier', 'transaction_digest', 'visible_label'];
const readyRecord = () => ({ ...rows.find((row) => row.transaction_digest === hex('4')), ...statusProofs, receipt_valid: true, status_ready: true, active_current: true, local_stop_active: false, refinement_pending: false, activation_epoch: readyEpoch });
test('store status facts are narrow, transaction-owned, and feed public status without caller database access', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-status-store-'));
  try {
    let lifecycle = openRuleLifecycleStore({ stateRoot }); lifecycle.close();
    const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
    db.prepare("INSERT INTO publication_transaction (idempotency_key, repository, scope_id, rule_id, enrollment_digest, allowed_paths_json, expected_base, candidate_digest, candidate_bytes, admission_digest, admission_bytes, state, created_at, updated_at) VALUES (?, ?, '', ?, ?, '[]', ?, ?, ?, ?, ?, 'prepared', ?, ?)").run(`tx:${hex('a')}`, 'VT11_REPOSITORY', 'pidex-global:pidex-implementer:prepared', hex('1'), commit('a'), hex('2'), Buffer.from('{"admission_policy_digest":"' + hex('3') + '"}'), hex('4'), Buffer.from('{}'), now, now);
    db.close(); lifecycle = openRuleLifecycleStore({ stateRoot });
    const facts = lifecycle.listPublicationStatusFacts();
    assert.deepEqual(Object.keys(facts[0]).sort(), ['accepted_commit', 'activation_epoch', 'active_current', 'admission_digest', 'content_hash', 'created_at', 'handoff_stage', 'local_stop_active', 'policy_category', 'policy_digest', 'predecessor_commit', 'receipt_digest', 'receipt_valid', 'refinement_pending', 'rule_id', 'scope_id', 'state', 'status_ready', 'tier', 'transaction_digest', 'tree_digest', 'updated_at', 'version_hash']);
    assert.equal(JSON.stringify(facts).includes('VT11_REPOSITORY'), false);
    assert.equal(lifecycle.readPublicationStatusFacts({ transaction_digest: hex('a') }).transaction_digest, hex('a'));
    assert.equal(listRulePublicationStatus({ store: lifecycle }).publications[0].visible_label, 'Prepared');
    lifecycle.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('publication list maps every TX state with stable sort, exact public keys, and global/project scope', () => {
  const result = listRulePublicationStatus({ store: store() });
  assert.deepEqual(Object.keys(result).sort(), ['publications', 'status']);
  assert.equal(result.status, 'available');
  assert.deepEqual(result.publications.map((row) => row.transaction_digest), [...rows].map((row) => row.transaction_digest).sort());
  for (const row of result.publications) assert.deepEqual(Object.keys(row).sort(), rowKeys);
  assert.deepEqual(result.publications.map((row) => row.visible_label), ['Prepared', 'Publication pending', 'Publication pending', 'Published and verified', 'Deferred — source changed', 'Abandoned', 'Rejected by policy']);
  assert.equal(result.publications.find((row) => row.transaction_digest === hex('4')).scope_id, 'pidex-global');
  assert.equal(result.publications.find((row) => row.transaction_digest === hex('6')).scope_id, 'abcdefabcdefabcdefabcdef');
  const published = result.publications.find((row) => row.transaction_digest === hex('4'));
  assert.deepEqual({ proposal_label: published.proposal_label, inspect: published.inspect, refinement: published.refinement, refinement_reason: published.refinement_reason, fallback: published.fallback }, { proposal_label: authority, inspect: true, refinement: true, refinement_reason: null, fallback: null });
  assert.equal(result.publications.find((row) => row.transaction_digest === hex('3')).visible_label, 'Publication pending');
  assert.equal(result.publications.find((row) => row.transaction_digest === hex('7')).policy_category, 'privacy');
  assert.equal(result.publications.find((row) => row.transaction_digest === hex('1')).policy_category, null);
});
test('publication status requires exact positive proof facts before publishing or enabling refinement', () => {
  const unavailableFor = (field, value) => {
    const result = listRulePublicationStatus({ store: store([{ ...readyRecord(), [field]: value }]) }).publications[0];
    assert.deepEqual({ label: result.visible_label, inspect: result.inspect, refinement: result.refinement }, { label: unavailable, inspect: false, refinement: false }, `${field}=${String(value)}`);
  };
  for (const field of ['receipt_valid', 'status_ready', 'active_current']) for (const value of [false, undefined, null, 'true']) unavailableFor(field, value);
  for (const field of ['local_stop_active', 'refinement_pending']) for (const value of [undefined, null, 'false']) unavailableFor(field, value);
  for (const field of ['local_stop_active', 'refinement_pending']) {
    const blocked = listRulePublicationStatus({ store: store([{ ...readyRecord(), [field]: true }]) }).publications[0];
    assert.deepEqual({ label: blocked.visible_label, refinement: blocked.refinement, reason: blocked.refinement_reason }, { label: 'Published and verified', refinement: false, reason: 'Refinement requests are unavailable for this rule.' }, `${field}=true`);
  }
});
test('publication status accepts only canonical ready epoch and exact status-ready handoff stage', () => {
  const stages = ['receipt_accepted', 'receipt_consumed', 'bundle_verified', 'mirror_verified', 'projection_applied', 'reattested'];
  for (const handoff_stage of stages) {
    const pending = listRulePublicationStatus({ store: store([{ ...readyRecord(), handoff_stage, status_ready: false, active_current: false, activation_epoch: null }]) }).publications[0];
    assert.equal(pending.visible_label, 'Publication pending', handoff_stage);
  }
  for (const activation_epoch of ['epoch:', 'epoch:ABCDEFABCDEFABCDEFABCDEF', 'epoch:abcdefabcdefabcdefabcdef0', 'epoch:abcdefabcdefabcdefabcdef\n']) {
    const invalid = listRulePublicationStatus({ store: store([{ ...readyRecord(), activation_epoch }]) }).publications[0];
    assert.equal(invalid.visible_label, unavailable, activation_epoch);
  }
  const stale = listRulePublicationStatus({ store: store([{ ...readyRecord(), active_current: false }]) }).publications[0];
  assert.equal(stale.visible_label, unavailable);
  const wrongStage = listRulePublicationStatus({ store: store([{ ...readyRecord(), handoff_stage: 'STATUS_READY' }]) }).publications[0];
  assert.equal(wrongStage.visible_label, unavailable);
});
test('publication status fails closed for malformed/corrupt receipt, handoff, projection, stop, and request conflict', () => {
  const corrupt = rows.map((row) => ({ ...row }));
  corrupt[3] = { ...corrupt[3], receipt_digest: 'bad', accepted_commit: 'bad', content_hash: 'bad', handoff_stage: 'status_ready', activation_epoch: 'epoch:unsafe', active_current: true };
  corrupt[4] = { ...corrupt[4], local_stop_reason: 'operator_stop' };
  corrupt[6] = { ...corrupt[6], state: 'bad-state', scope_id: '', repository: 'VT11_REPOSITORY', candidate_bytes: 'VT11_CANDIDATE', rule_path: 'VT11_PATH', error: 'VT11_ERROR' };
  const result = listRulePublicationStatus({ store: store(corrupt) });
  const malformed = result.publications.find((row) => row.transaction_digest === hex('3'));
  const stopped = result.publications.find((row) => row.transaction_digest === hex('4'));
  const unknown = result.publications.find((row) => row.transaction_digest === hex('7'));
  assert.deepEqual({ label: malformed.visible_label, fallback: malformed.fallback, inspect: malformed.inspect, receipt: malformed.receipt_digest, commit: malformed.accepted_commit, content: malformed.content_hash, epoch: malformed.activation_epoch }, { label: unavailable, fallback: 'Publication status unavailable', inspect: false, receipt: null, commit: null, content: null, epoch: null });
  assert.deepEqual({ label: stopped.visible_label, refinement: stopped.refinement, reason: stopped.refinement_reason }, { label: unavailable, refinement: false, reason: 'Refinement requests are unavailable for this rule.' });
  assert.deepEqual({ label: unknown.visible_label, fallback: unknown.fallback, inspect: unknown.inspect, scope: unknown.scope_id }, { label: unavailable, fallback: 'Publication status unavailable', inspect: false, scope: 'Scope unavailable' });
  assert.doesNotMatch(JSON.stringify(result), /VT11_REPOSITORY|VT11_CANDIDATE|VT11_PATH|VT11_ERROR/);
});
test('publication detail is allowlisted, copies safe receipt/projection facts, and never leaks raw authority material', () => {
  const result = readRulePublicationStatusDetail({ store: store(), transaction_digest: hex('4') });
  assert.deepEqual(Object.keys(result).sort(), ['publication', 'status']);
  assert.equal(result.status, 'available');
  assert.deepEqual(Object.keys(result.publication).sort(), [...rowKeys, 'admission_digest', 'created_at', 'policy_digest', 'predecessor_commit', 'tree_digest', 'updated_at', 'version_hash'].sort());
  const rejected = readRulePublicationStatusDetail({ store: store(), transaction_digest: hex('7') });
  assert.equal(rejected.publication.policy_category, 'privacy');
  const unknownCategory = readRulePublicationStatusDetail({ store: store([{ ...rows.find((row) => row.transaction_digest === hex('7')), policy_category: 'raw_reason' }]), transaction_digest: hex('7') });
  assert.equal(unknownCategory.publication.policy_category, null);
  assert.deepEqual({ predecessor_commit: result.publication.predecessor_commit, tree_digest: result.publication.tree_digest, admission_digest: result.publication.admission_digest, policy_digest: result.publication.policy_digest, version_hash: result.publication.version_hash, created_at: result.publication.created_at }, { predecessor_commit: null, tree_digest: null, admission_digest: null, policy_digest: null, version_hash: hex('4'), created_at: now });
  assert.deepEqual(readRulePublicationStatusDetail({ store: store(), transaction_digest: 'bad' }), { status: 'unavailable', publication: null });
});
// ---- Plan048 Slice1: sanitized lifecycle-action status. Prepared/committed/remote-advance preserve prior active truth; deactivation truth only after accepted receipt and verified deactivated mirror. ----
import { listLifecycleActionPublicationStatus, readLifecycleActionPublicationStatusDetail } from './rule-publication-status.mjs';

const actionRowKeys = ['accepted_commit', 'active_current', 'cadence_digest', 'content_hash', 'deactivated_current', 'fallback', 'handoff_stage', 'receipt_digest', 'rule_id', 'scope_id', 'state', 'tier', 'transaction_digest', 'visible_label'];
const actionFacts = [
  { transaction_digest: hex('a'), rule_id: 'project:aaaaaaaaaaaaaaaaaaaaaaaa:pidex-implementer:quality', tier: 'project', scope_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', state: 'prepared', cadence_digest: hex('c'), receipt_valid: false, handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, deactivated_current: false, active_current: true, local_stop_active: false, predecessor_commit: null, tree_digest: null, created_at: now, updated_at: now },
  { transaction_digest: hex('b'), rule_id: 'project:bbbbbbbbbbbbbbbbbbbbbbbb:pidex-implementer:quality', tier: 'project', scope_id: 'bbbbbbbbbbbbbbbbbbbbbbbb', state: 'committed_local', cadence_digest: hex('b'), receipt_valid: false, handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, deactivated_current: false, active_current: true, local_stop_active: false, predecessor_commit: null, tree_digest: null, created_at: now, updated_at: now },
  { transaction_digest: hex('c'), rule_id: 'pidex-global:pidex-implementer:accepted', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('c'), receipt_valid: true, handoff_stage: 'mirror_verified', receipt_digest: hex('c'), accepted_commit: commit('c'), content_hash: hex('c'), deactivated_current: false, active_current: true, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('c'), created_at: now, updated_at: now },
  { transaction_digest: hex('d'), rule_id: 'pidex-global:pidex-implementer:deactivated', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('d'), receipt_valid: true, handoff_stage: 'status_ready', receipt_digest: hex('d'), accepted_commit: commit('d'), content_hash: hex('d'), deactivated_current: true, active_current: false, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('d'), created_at: now, updated_at: now },
  { transaction_digest: hex('e'), rule_id: 'pidex-global:pidex-implementer:deferred', tier: 'global', scope_id: 'pidex-global', state: 'deferred_remote_advanced', cadence_digest: hex('e'), receipt_valid: false, handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, deactivated_current: false, active_current: true, local_stop_active: false, predecessor_commit: null, tree_digest: null, created_at: now, updated_at: now },
];
function actionStore(records = actionFacts) { return { listLifecycleActionStatusFacts: () => records, readLifecycleActionStatusFacts: ({ transaction_digest }) => records.find((row) => row.transaction_digest === transaction_digest) }; }

const actionUnavailable = 'Status unavailable';
const actionUnavailableFallback = 'Publication status unavailable';

function expectUnavailable(fields) {
  const result = listLifecycleActionPublicationStatus({ store: actionStore([{ ...actionFacts[2], ...fields }]) }).publications[0];
  assert.deepEqual({ label: result.visible_label, fallback: result.fallback, cadence: result.cadence_digest }, { label: actionUnavailable, fallback: actionUnavailableFallback, cadence: null }, JSON.stringify(fields));
  assert.equal(result.inspect, undefined);
}

test('Slice1D lifecycle-action status maps prepared/committed/pending/deactivated/remote-advance with exact labels and prior active truth', () => {
  const result = listLifecycleActionPublicationStatus({ store: actionStore() });
  assert.equal(result.status, 'available');
  assert.deepEqual(result.publications.map((row) => row.transaction_digest), actionFacts.map((row) => row.transaction_digest).sort());
  for (const row of result.publications) assert.deepEqual(Object.keys(row).sort(), actionRowKeys);
  assert.deepEqual(result.publications.map((row) => row.visible_label), ['Deactivation pending', 'Deactivation pending', 'Deactivated — sync pending', 'Deactivated', 'Deferred — source changed']);
  const pending = result.publications.find((row) => row.transaction_digest === hex('b'));
  assert.deepEqual({ state: pending.state, active: pending.active_current, deactivated: pending.deactivated_current, cadence: pending.cadence_digest }, { state: 'committed_local', active: true, deactivated: false, cadence: hex('b') }, 'prior active truth preserved through committed-local');
  const accepted = result.publications.find((row) => row.transaction_digest === hex('c'));
  assert.deepEqual({ label: accepted.visible_label, active: accepted.active_current, deactivated: accepted.deactivated_current, stage: accepted.handoff_stage, receipt: accepted.receipt_digest }, { label: 'Deactivated — sync pending', active: true, deactivated: false, stage: 'mirror_verified', receipt: hex('c') });
  const done = result.publications.find((row) => row.transaction_digest === hex('d'));
  assert.deepEqual({ label: done.visible_label, active: done.active_current, deactivated: done.deactivated_current, commit: done.accepted_commit }, { label: 'Deactivated', active: false, deactivated: true, commit: commit('d') });
  const deferred = result.publications.find((row) => row.transaction_digest === hex('e'));
  assert.deepEqual({ label: deferred.visible_label, active: deferred.active_current, deactivated: deferred.deactivated_current }, { label: 'Deferred — source changed', active: true, deactivated: false }, 'remote advance never claims deactivation');
  assert.doesNotMatch(JSON.stringify(result), /VT11_|repository|rule_bytes|result|path/i);
});
test('Slice1D lifecycle-action status fails closed on unverified receipt, inconsistent stage, corrupt digests, and unknown state', () => {
  expectUnavailable({ receipt_valid: false });
  expectUnavailable({ handoff_stage: 'status_ready' });
  expectUnavailable({ handoff_stage: 'STATUS_READY' });
  expectUnavailable({ handoff_stage: 'receipt_consumed' });
  expectUnavailable({ receipt_digest: 'bad' });
  expectUnavailable({ accepted_commit: 'bad' });
  expectUnavailable({ content_hash: 'bad' });
  expectUnavailable({ cadence_digest: 'raw:window|tier|scope' });
  expectUnavailable({ deactivated_current: true });
  expectUnavailable({ active_current: undefined });
  expectUnavailable({ local_stop_active: undefined });
  expectUnavailable({ created_at: 'not-a-time' });
  expectUnavailable({ state: 'rejected_policy' });
  expectUnavailable({ state: 'accepted_remote', handoff_stage: null, receipt_valid: true, receipt_digest: hex('c'), accepted_commit: commit('c'), content_hash: hex('c'), deactivated_current: false, active_current: true });
  const corrupt = actionFacts.map((row) => ({ ...row }));
  corrupt[3] = { ...corrupt[3], deactivated_current: false };
  corrupt[4] = { ...corrupt[4], scope_id: '', rule_id: 'project:pidex-global:unmatched', repository: 'VT11_REPOSITORY', action_bytes: 'VT11_ACTION', result_digest: 'VT11_RESULT' };
  const result = listLifecycleActionPublicationStatus({ store: actionStore(corrupt) });
  assert.equal(result.publications.find((row) => row.transaction_digest === hex('d')).visible_label, actionUnavailable);
  assert.deepEqual({ label: result.publications.find((row) => row.transaction_digest === hex('e')).visible_label, scope: result.publications.find((row) => row.transaction_digest === hex('e')).scope_id }, { label: actionUnavailable, scope: 'Scope unavailable' });
  assert.doesNotMatch(JSON.stringify(result), /VT11_/);
});
test('Slice1D lifecycle-action status detail is allowlisted, safe, and never leaks raw action or authority material', () => {
  const detail = readLifecycleActionPublicationStatusDetail({ store: actionStore(), transaction_digest: hex('d') });
  assert.equal(detail.status, 'available');
  assert.deepEqual(Object.keys(detail.publication).sort(), [...actionRowKeys, 'created_at', 'predecessor_commit', 'tree_digest', 'updated_at'].sort());
  assert.deepEqual({ predecessor: detail.publication.predecessor_commit, tree: detail.publication.tree_digest, created: detail.publication.created_at, updated: detail.publication.updated_at }, { predecessor: commit('a'), tree: hex('d'), created: now, updated: now });
  const pendingDetail = readLifecycleActionPublicationStatusDetail({ store: actionStore(), transaction_digest: hex('a') });
  assert.deepEqual({ label: pendingDetail.publication.visible_label, predecessor: pendingDetail.publication.predecessor_commit, tree: pendingDetail.publication.tree_digest }, { label: 'Deactivation pending', predecessor: null, tree: null });
  assert.deepEqual(readLifecycleActionPublicationStatusDetail({ store: actionStore(), transaction_digest: 'bad' }), { status: 'unavailable', publication: null });
  assert.deepEqual(readLifecycleActionPublicationStatusDetail({ store: actionStore([{ ...actionFacts[3], receipt_digest: 'bad' }]), transaction_digest: hex('d') }), { status: 'unavailable', publication: null });
  assert.doesNotMatch(JSON.stringify(detail), /VT11_|repository|rule_bytes|result_digest|action_json/i);
});
// ---- Slice3A backend-safe LS-01..LS-09 control projection with exact aria values (no dashboard rendering) ----
import { listLifecycleControlStatus, readLifecycleControlStatusDetail } from './rule-publication-status.mjs';

const ctrlFacts = [
  { transaction_digest: hex('1'), rule_id: 'project:aaaaaaaaaaaaaaaaaaaaaaaa:pidex-implementer:quality', tier: 'project', scope_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', state: 'prepared', cadence_digest: hex('1'), receipt_valid: false, handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, receipt_lifecycle_state: null, canonical_state: 'active-monitor', mirror_verified: false, converged: false, epoch_open: true, local_stop_active: false, predecessor_commit: null, tree_digest: null, created_at: now, updated_at: now },
  { transaction_digest: hex('2'), rule_id: 'project:aaaaaaaaaaaaaaaaaaaaaaaa:pidex-implementer:quality', tier: 'project', scope_id: 'aaaaaaaaaaaaaaaaaaaaaaaa', state: 'committed_local', cadence_digest: hex('2'), receipt_valid: false, handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, receipt_lifecycle_state: null, canonical_state: 'deactivated', mirror_verified: false, converged: false, epoch_open: false, local_stop_active: false, predecessor_commit: null, tree_digest: null, created_at: now, updated_at: now },
  { transaction_digest: hex('3'), rule_id: 'pidex-global:pidex-implementer:accepted', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('3'), receipt_valid: true, handoff_stage: 'receipt_accepted', receipt_digest: hex('3'), accepted_commit: commit('3'), content_hash: hex('3'), receipt_lifecycle_state: 'deactivated', canonical_state: 'active', mirror_verified: false, converged: false, epoch_open: true, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('3'), created_at: now, updated_at: now },
  { transaction_digest: hex('4'), rule_id: 'pidex-global:pidex-implementer:sync', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('4'), receipt_valid: true, handoff_stage: 'mirror_verified', receipt_digest: hex('4'), accepted_commit: commit('4'), content_hash: hex('4'), receipt_lifecycle_state: 'deactivated', canonical_state: 'deactivated', mirror_verified: true, converged: false, epoch_open: false, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('4'), created_at: now, updated_at: now },
  { transaction_digest: hex('5'), rule_id: 'pidex-global:pidex-implementer:deactivated', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('5'), receipt_valid: true, handoff_stage: 'status_ready', receipt_digest: hex('5'), accepted_commit: commit('5'), content_hash: hex('5'), receipt_lifecycle_state: 'deactivated', canonical_state: 'deactivated', mirror_verified: true, converged: true, epoch_open: false, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('5'), created_at: now, updated_at: now },
  { transaction_digest: hex('6'), rule_id: 'pidex-global:pidex-implementer:monitor', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('6'), receipt_valid: true, handoff_stage: 'status_ready', receipt_digest: hex('6'), accepted_commit: commit('6'), content_hash: hex('6'), receipt_lifecycle_state: 'active-monitor', canonical_state: 'active-monitor', mirror_verified: true, converged: true, epoch_open: true, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('6'), created_at: now, updated_at: now },
  { transaction_digest: hex('7'), rule_id: 'pidex-global:pidex-implementer:pinned', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('7'), receipt_valid: true, handoff_stage: 'status_ready', receipt_digest: hex('7'), accepted_commit: commit('7'), content_hash: hex('7'), receipt_lifecycle_state: 'active-pinned', canonical_state: 'active-pinned', mirror_verified: true, converged: true, epoch_open: true, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('7'), created_at: now, updated_at: now },
  { transaction_digest: hex('8'), rule_id: 'pidex-global:pidex-implementer:reactivating', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('8'), receipt_valid: true, handoff_stage: 'receipt_accepted', receipt_digest: hex('8'), accepted_commit: commit('8'), content_hash: hex('8'), receipt_lifecycle_state: 'active-monitor', canonical_state: 'deactivated', mirror_verified: false, converged: false, epoch_open: false, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('8'), created_at: now, updated_at: now },
  { transaction_digest: hex('9'), rule_id: 'pidex-global:pidex-implementer:failed', tier: 'global', scope_id: 'pidex-global', state: 'deferred_remote_advanced', cadence_digest: hex('9'), receipt_valid: false, handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, receipt_lifecycle_state: 'active-pinned', canonical_state: 'deactivated', mirror_verified: false, converged: false, epoch_open: false, local_stop_active: false, predecessor_commit: null, tree_digest: null, created_at: now, updated_at: now },
  { transaction_digest: hex('a'), rule_id: 'pidex-global:pidex-implementer:unconverged', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('a'), receipt_valid: true, handoff_stage: 'status_ready', receipt_digest: hex('a'), accepted_commit: commit('a'), content_hash: hex('a'), receipt_lifecycle_state: 'active-monitor', canonical_state: 'deactivated', mirror_verified: true, converged: false, epoch_open: false, local_stop_active: false, predecessor_commit: commit('a'), tree_digest: hex('a'), created_at: now, updated_at: now },
  { transaction_digest: hex('b'), rule_id: 'pidex-global:pidex-implementer:stopped', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', cadence_digest: hex('b'), receipt_valid: true, handoff_stage: 'status_ready', receipt_digest: hex('b'), accepted_commit: commit('b'), content_hash: hex('b'), receipt_lifecycle_state: 'active-monitor', canonical_state: 'active-monitor', mirror_verified: true, converged: true, epoch_open: true, local_stop_active: true, predecessor_commit: commit('a'), tree_digest: hex('b'), created_at: now, updated_at: now },
];
function ctrlStore(records = ctrlFacts) { return { listLifecycleActionStatusFacts: () => records, readLifecycleActionStatusFacts: ({ transaction_digest }) => records.find((row) => row.transaction_digest === transaction_digest) }; }
const ctrlRowKeys = ['accepted_commit', 'aria', 'cadence_digest', 'canonical_state', 'content_hash', 'converged', 'epoch_open', 'fallback', 'handoff_stage', 'local_stop_active', 'mirror_verified', 'receipt_digest', 'receipt_lifecycle_state', 'rule_id', 'scope_id', 'state', 'tier', 'transaction_digest', 'visible_label'];

test('Slice3A LS projection exposes backend-safe LS-01..LS-09 source states and exact aria values without rendering', () => {
  const result = listLifecycleControlStatus({ store: ctrlStore() });
  assert.equal(result.status, 'available');
  for (const row of result.publications) assert.deepEqual(Object.keys(row).sort(), ctrlRowKeys);
  const byTx = (digest) => result.publications.find((row) => row.transaction_digest === digest);
  assert.deepEqual({ label: byTx(hex('1')).visible_label, aria: byTx(hex('1')).aria, canonical: byTx(hex('1')).canonical_state }, { label: 'Deactivation pending', aria: 'Deactivation pending remote acceptance', canonical: 'active-monitor' }, 'LS-01');
  assert.deepEqual({ label: byTx(hex('3')).visible_label, aria: byTx(hex('3')).aria }, { label: 'Deactivated — sync pending', aria: 'Deactivation accepted; mirror synchronization pending' }, 'LS-02');
  assert.deepEqual({ label: byTx(hex('6')).visible_label, aria: byTx(hex('6')).aria, epoch: byTx(hex('6')).epoch_open, canonical: byTx(hex('6')).canonical_state }, { label: 'Active — monitoring', aria: 'Rule active and monitoring', epoch: true, canonical: 'active-monitor' }, 'LS-03');
  assert.deepEqual({ label: byTx(hex('5')).visible_label, aria: byTx(hex('5')).aria, epoch: byTx(hex('5')).epoch_open }, { label: 'Deactivated', aria: 'Rule deactivated', epoch: false }, 'LS-04');
  assert.deepEqual({ label: byTx(hex('b')).visible_label, aria: byTx(hex('b')).aria, canonical: byTx(hex('b')).canonical_state }, { label: 'Stopped locally', aria: 'Rule stopped on this host only', canonical: 'active-monitor' }, 'LS-05 keeps canonical state separately visible');
  assert.deepEqual({ label: byTx(hex('8')).visible_label, aria: byTx(hex('8')).aria, epoch: byTx(hex('8')).epoch_open }, { label: 'Reactivation pending', aria: 'Reactivation pending remote acceptance and mirror verification', epoch: false }, 'LS-06');
  assert.deepEqual({ label: byTx(hex('9')).visible_label, aria: byTx(hex('9')).aria, canonical: byTx(hex('9')).canonical_state }, { label: 'Reactivation failed', aria: 'Reactivation failed; rule remains deactivated', canonical: 'deactivated' }, 'LS-07');
  assert.deepEqual({ label: byTx(hex('7')).visible_label, aria: byTx(hex('7')).aria, canonical: byTx(hex('7')).canonical_state }, { label: 'Active — pinned', aria: 'Rule active and pinned', canonical: 'active-pinned' }, 'LS-08');
  assert.deepEqual({ label: byTx(hex('a')).visible_label, aria: byTx(hex('a')).aria }, { label: 'Convergence failed', aria: 'Canonical lifecycle change accepted; mirror convergence failed' }, 'LS-09');
  assert.doesNotMatch(JSON.stringify(result), /credential|secret|token|password|\/home\/|C:\\/i);
});
test('Slice3A LS projection fails closed on malformed facts, keeps prior canonical truth for pending/failed, and detail is allowlisted', () => {
  const bad = { ...ctrlFacts[5], canonical_state: 'active', converged: true, receipt_lifecycle_state: 'active-monitor', epoch_open: false };
  const stale = listLifecycleControlStatus({ store: ctrlStore([bad]) }).publications[0];
  assert.deepEqual({ label: stale.visible_label, aria: stale.aria, canonical: stale.canonical_state }, { label: 'Convergence failed', aria: 'Canonical lifecycle change accepted; mirror convergence failed', canonical: 'active' }, 'accepted active-monitor receipt without verified active projection exposes convergence failure, never active convergence');
  const corrupt = ctrlStore([{ ...ctrlFacts[6], scope_id: '', rule_id: 'project:pidex-global:unmatched', repository: 'VT11_REPOSITORY', actor_digest: 'VT11_ACTOR', error: 'VT11_ERROR' }]);
  const unknown = listLifecycleControlStatus({ store: corrupt }).publications[0];
  assert.deepEqual({ label: unknown.visible_label, aria: unknown.aria, scope: unknown.scope_id }, { label: 'Status unavailable', aria: 'Publication status unavailable', scope: 'Scope unavailable' });
  assert.doesNotMatch(JSON.stringify(unknown), /VT11_/);
  const detail = readLifecycleControlStatusDetail({ store: ctrlStore(), transaction_digest: hex('7') });
  assert.equal(detail.status, 'available');
  assert.deepEqual({ label: detail.publication.visible_label, aria: detail.publication.aria, predecessor: detail.publication.predecessor_commit, tree: detail.publication.tree_digest }, { label: 'Active — pinned', aria: 'Rule active and pinned', predecessor: commit('a'), tree: hex('7') });
  assert.deepEqual(readLifecycleControlStatusDetail({ store: ctrlStore(), transaction_digest: 'bad' }), { status: 'unavailable', publication: null });
});
