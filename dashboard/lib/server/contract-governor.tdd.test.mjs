#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { contractGovernorApiGet, contractGovernorApiPost, contractGovernorReadResponse, getContractGovernorStatus, rejectContractGovernorWrite } from './contract-governor.ts';
import { openRuleLifecycleStore } from '../../../scripts/quality/rule-lifecycle-store.mjs';

function root() { const value = mkdtempSync(path.join(os.tmpdir(), 'pidex-governor-read-model-')); mkdirSync(path.join(value, 'config'), { recursive: true }); mkdirSync(path.join(value, 'state/quality'), { recursive: true }); writeFileSync(path.join(value, 'config/contract-governor.json'), JSON.stringify({ version: 2, capability: 'manual-pending-only', max_proposals_per_run: 5 })); return value; }
function canonical(value) { return Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value); }
function lifecycleDb(rootPath) { return path.join(rootPath, 'state/quality/rule-lifecycle/lifecycle.sqlite'); }
function statusReadyFixture(rootPath, { tier, marker }) {
  const stateRoot = path.join(rootPath, 'state'); const project = tier === 'project'; const scope_id = project ? marker.repeat(24) : ''; const outwardScope = project ? scope_id : 'pidex-global'; const rule_id = project ? `project:${scope_id}:pidex-implementer:quality` : 'pidex-global:pidex-implementer:quality'; const repository = `VT11_REPOSITORY_${tier}`; const accepted = marker.repeat(40); const predecessor = (marker === 'a' ? 'b' : 'a').repeat(40); const content_hash = (marker === 'c' ? 'd' : 'c').repeat(64); const transaction_digest = marker.repeat(64); const admission_digest = '1'.repeat(64); const enrollment_digest = '2'.repeat(64); const rule_path = project ? 'pidex/rules/managed/pidex-implementer/quality.md' : 'rules/pidex-implementer/quality.md'; const index_path = project ? 'pidex/rules/managed/pidex-implementer/index.md' : 'rules/pidex-implementer/index.md'; const paths = project ? [index_path, rule_path] : ['config/rule-baseline-manifest.json', index_path, rule_path];
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    const head = { head_kind: 'accepted_remote', repository_identity: repository, accepted_remote_head: accepted, baseline_parent_commit: predecessor, manifest_digest: null, tree_digest: '3'.repeat(64), seeded_at: null, verified_at: '2026-08-14T00:00:00.000Z', remote_checked_at: '2026-08-14T00:00:00.000Z', freshness: 'exact_head' };
    store.replaceProjection({ repository, scope_id: scope_id || null, accepted_head: accepted, head, entries: [{ rule_id, rule_version: content_hash, content_hash, accepted_commit: accepted, tier, lifecycle_state: 'active' }] });
    const epoch = store.readProjection({ repository, scope_id: scope_id || null }).entries[0].activation_epoch;
    const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: '4'.repeat(64), scope_id: outwardScope, rule_id, predecessor_commit: predecessor, accepted_commit: accepted, tree_digest: '3'.repeat(64), content_hash, admission_digest, transaction_digest, lifecycle_state: 'active' }; const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex'); const payload = { accepted_commit: accepted, containing_head: accepted, member: { rule_id, path: rule_path, content_hash }, target_epoch: { repository_digest: createHash('sha256').update(repository).digest('hex'), scope_id: outwardScope, rule_id, rule_version: content_hash, activation_epoch: epoch } }; const proof = { containing_head: accepted };
    const db = new DatabaseSync(lifecycleDb(rootPath));
    try {
      db.prepare('INSERT INTO repository_enrollment (repository,scope_id,remote,branch) VALUES (?,?,?,?)').run(repository, scope_id, `https://example.invalid/${tier}`, 'main');
      db.prepare('INSERT INTO publication_enrollment (repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,predecessor) VALUES (?,?,?,?,?,?)').run(repository, scope_id, rule_id, enrollment_digest, JSON.stringify(paths), `commit:${predecessor}`);
      db.prepare('INSERT INTO publication_transaction (idempotency_key,repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,expected_base,candidate_digest,candidate_bytes,admission_digest,admission_bytes,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(`tx:${transaction_digest}`, repository, scope_id, rule_id, enrollment_digest, JSON.stringify(paths), predecessor, '5'.repeat(64), Buffer.from('{"private":"VT11_CANDIDATE"}'), admission_digest, Buffer.from('{}'), 'accepted_remote', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z');
      db.prepare('INSERT INTO publication_accepted_receipt (idempotency_key,receipt_digest,receipt_json) VALUES (?,?,?)').run(`tx:${transaction_digest}`, receipt_digest, canonical(receipt));
      db.prepare('INSERT INTO publication_handoff_head_proof (receipt_digest,transaction_digest,containing_head,proof_digest,proof_json,created_at) VALUES (?,?,?,?,?,?)').run(receipt_digest, transaction_digest, accepted, createHash('sha256').update(canonical(proof)).digest('hex'), canonical(proof), '2026-08-14T00:00:00.000Z');
      db.prepare('INSERT INTO publication_handoff_stage_current (receipt_digest,transaction_digest,stage,payload_digest,payload_json,updated_at) VALUES (?,?,?,?,?,?)').run(receipt_digest, transaction_digest, 'status_ready', createHash('sha256').update(canonical(payload)).digest('hex'), canonical(payload), '2026-08-14T00:00:00.000Z');
    } finally { db.close(); }
    return { stateRoot, repository, scope_id, rule_id, receipt_digest, transaction_digest, epoch };
  } finally { store.close(); }
}
function requestCount(rootPath) { const db = new DatabaseSync(lifecycleDb(rootPath)); try { return db.prepare('SELECT COUNT(*) AS count FROM manual_refinement_request').get().count; } finally { db.close(); } }
const roots = [];
try {
  const valid = root(); roots.push(valid);
  writeFileSync(path.join(valid, 'config/contract-governor.local.json'), JSON.stringify({ max_proposals_per_run: 9 }));
  mkdirSync(path.join(valid, 'state/quality/contract-governor/run-1'), { recursive: true });
  writeFileSync(path.join(valid, 'state/quality/contract-governor/run-1/run.json'), JSON.stringify({ run_id: 'run-1', timestamp: '2026-01-05T00:00:00Z', capability: 'pending-only', status: 'completed_pending', plan_key: 'plan-061', proposals_pending: 1, duplicates: 0, duration_ms: 7, project_path: valid, report: path.join(valid, 'secret-report.json'), error: `failure at ${valid}`, decisions: [{ proposal: { evidence: { source_reports: [path.join(valid, 'legacy-secret.json')] } } }], future_sensitive_field: valid }));
  writeFileSync(path.join(valid, 'state/quality/contract-corrections.jsonl'), [
    { timestamp: '2026-01-01T00:00:00Z', id: 'contract-correction-588aef3563e77972', status: 'approved', operator_type: 'OpQualityReview', contract_id: 'operator.OpQualityReview.terminal-pdq', approved_by: 'daniel' },
    { timestamp: '2026-01-02T00:00:00Z', id: 'contract-correction-588aef3563e77972', status: 'validated', source: 'contract-governor-evaluate', monitoring_status: 'validated', validation_metrics: { matching_findings_after: 9 } },
    { timestamp: '2026-01-02T00:00:00Z', id: 'unrelated', status: 'approved', operator_type: 'OpQualityReview', contract_id: 'operator.OpQualityReview.terminal-pdq', approved_by: 'operator' },
    { timestamp: '2026-01-03T00:00:00Z', id: 'unrelated', status: 'validated', source: 'contract-governor-evaluate', validation_metrics: { matching_findings_after: 1 } },
    { timestamp: '2026-01-04T00:00:00Z', id: 'pending', status: 'pending', operator_type: 'OpQualityReview' },
  ].map(JSON.stringify).join('\n') + '\n');
  const status = await getContractGovernorStatus(valid);
  assert.equal(status.ok, true);
  assert.deepEqual(status.effective_config, { version: 2, capability: 'manual-pending-only', max_proposals_per_run: 9 });
  assert.equal(status.pending.length, 1);
  assert.deepEqual(status.rule_provenance, { status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] });
  assert.deepEqual(status.impact_evidence, { status: 'unavailable', reason_code: 'evidence-unavailable', tiers: { global: [], project: [] } });
  assert.deepEqual(status.publication_status, { status: 'available', publications: [] });

  const provenanceRoot = root(); roots.push(provenanceRoot);
  let provenanceStore = openRuleLifecycleStore({ stateRoot: path.join(provenanceRoot, 'state') });
  provenanceStore.replaceProjection({
    repository: 'repo:dashboard',
    accepted_head: 'a'.repeat(40),
    head: { head_kind: 'packaged_seed', repository_identity: 'repo:dashboard', accepted_remote_head: null, baseline_parent_commit: 'a'.repeat(40), manifest_digest: 'b'.repeat(64), tree_digest: null, seeded_at: '2026-08-11T00:00:00.000Z', verified_at: '2026-08-11T00:00:01.000Z', remote_checked_at: null, freshness: 'bootstrap_only' },
    entries: [{ rule_id: 'pidex-global:pidex-implementer:quality', rule_version: 'c'.repeat(64), content_hash: 'c'.repeat(64), lifecycle_state: 'active', activation_epoch: 'epoch:dashboard', tier: 'global', protection_class: 'none', nested_secret: { token: 'do-not-leak' }, unknown_field: 'do-not-leak' }],
  });
  provenanceStore.close();
  const populated = await getContractGovernorStatus(provenanceRoot);
  assert.equal(populated.rule_provenance.status, 'degraded');
  assert.equal(populated.rule_provenance.reason_code, 'rule_lifecycle_bootstrap_only');
  assert.deepEqual({ ...populated.rule_provenance.rules[0], activation_epoch: undefined }, { rule_id: 'pidex-global:pidex-implementer:quality', display_label: 'quality', tier_scope_label: 'Global', accepted_commit: 'aaaaaaaaaaaa', activation_epoch: undefined, protection_class: 'none', lifecycle_state: 'active' });
  assert.match(populated.rule_provenance.rules[0].activation_epoch, /^epoch:[a-f0-9]{24}$/, 'CR-076-05: store-owned epoch shape is 24 hex chars; active/deactivated validity is lifecycle-conditional.');

  const remoteRoot = root(); roots.push(remoteRoot);
  provenanceStore = openRuleLifecycleStore({ stateRoot: path.join(remoteRoot, 'state') });
  provenanceStore.replaceProjection({
    repository: 'repo:remote',
    accepted_head: 'd'.repeat(40),
    head: { head_kind: 'accepted_remote', repository_identity: 'repo:remote', accepted_remote_head: 'd'.repeat(40), baseline_parent_commit: 'a'.repeat(40), manifest_digest: null, tree_digest: 'e'.repeat(64), seeded_at: null, verified_at: '2026-08-11T00:00:02.000Z', remote_checked_at: '2026-08-11T00:00:02.000Z', freshness: 'exact_head' },
    entries: [{ rule_id: 'pidex-global:pidex-implementer:remote', rule_version: 'f'.repeat(64), content_hash: 'f'.repeat(64), lifecycle_state: 'active', activation_epoch: 'epoch:remote', tier: 'global', protection_class: 'none' }],
  });
  provenanceStore.close();
  const reconciled = await getContractGovernorStatus(remoteRoot);
  assert.equal(reconciled.rule_provenance.status, 'verified');
  assert.equal(reconciled.rule_provenance.rules[0].lifecycle_state, 'active');
  assert.doesNotMatch(JSON.stringify(populated.rule_provenance), /do-not-leak|nested_secret|unknown_field|token/);
  assert.equal(status.status, 'pending'); assert.deepEqual(Object.keys(status.runs[0]).sort(), ['capability', 'duplicates', 'duration_ms', 'error_code', 'ok', 'plan_key', 'project', 'proposals_pending', 'report_ref', 'run_id', 'status', 'timestamp']); assert.equal(status.runs[0].project_path, undefined); assert.equal(status.runs[0].report, undefined); assert.equal(status.runs[0].error, undefined); assert.equal(status.runs[0].decisions, undefined); assert.equal(status.runs[0].future_sensitive_field, undefined); assert.doesNotMatch(JSON.stringify(status.runs), new RegExp(valid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(status.approved.find((row) => row.id === 'contract-correction-588aef3563e77972').assessment, 'inconclusive');
  assert.equal(status.approved.find((row) => row.id === 'unrelated').assessment, undefined, 'unrelated future correction must retain source meaning');
  const localPath = path.join(valid, 'config/contract-governor.local.json'); const localBefore = readFileSync(localPath, 'utf8');
  const post = rejectContractGovernorWrite();
  assert.equal(post.status, 405); assert.deepEqual(await post.json(), { error: 'Method not allowed' }); assert.equal(readFileSync(localPath, 'utf8'), localBefore);

  const externalRoot = root(); roots.push(externalRoot); const externalState = mkdtempSync(path.join(os.tmpdir(), 'pidex-governor-read-state-')); roots.push(externalState); mkdirSync(path.join(externalState, 'quality'), { recursive: true }); writeFileSync(path.join(externalState, 'quality/contract-corrections.jsonl'), `${JSON.stringify({ id: 'external', status: 'pending' })}\n`);
  const externalStatus = await getContractGovernorStatus(externalRoot, { PIDEX_STATE_DIR: externalState, RUNNING_PI_STATE_DIR: path.join(externalRoot, 'legacy') }); assert.equal(externalStatus.pending[0].id, 'external');

  const malformedConfig = root(); roots.push(malformedConfig); writeFileSync(path.join(malformedConfig, 'config/contract-governor.local.json'), '{bad');
  const badConfig = await getContractGovernorStatus(malformedConfig);
  assert.equal(badConfig.ok, false); assert.equal(badConfig.status, 'unavailable'); assert.deepEqual(badConfig.rule_provenance, { status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: [] }); assert.equal(badConfig.error_code, 'GOVERNOR_CONFIG_INVALID'); assert.equal(badConfig.error, 'governor-state-unavailable'); assert.doesNotMatch(JSON.stringify(badConfig), new RegExp(malformedConfig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const malformedLedger = root(); roots.push(malformedLedger); writeFileSync(path.join(malformedLedger, 'state/quality/contract-corrections.jsonl'), '{bad\n');
  const badLedger = await getContractGovernorStatus(malformedLedger);
  assert.equal(badLedger.ok, false); assert.equal(badLedger.error_code, 'GOVERNOR_LEDGER_INVALID');
  const degradedResponse = await contractGovernorReadResponse(malformedLedger); assert.equal(degradedResponse.status, 503); assert.equal((await degradedResponse.json()).error_code, 'GOVERNOR_LEDGER_INVALID');

  const apiRoot = root(); roots.push(apiRoot);
  const aggregate = await contractGovernorApiGet(new Request('http://127.0.0.1:18777/api/quality/contract-governor'), { root: apiRoot });
  assert.equal(aggregate.status, 200); assert.equal((await aggregate.json()).publication_status.status, 'available');
  const malformedDetail = await contractGovernorApiGet(new Request('http://127.0.0.1:18777/api/quality/contract-governor?transaction_digest=bad'), { root: apiRoot });
  assert.equal(malformedDetail.status, 400); assert.deepEqual(await malformedDetail.json(), { error: 'Publication status unavailable' });
  const absentDetail = await contractGovernorApiGet(new Request(`http://127.0.0.1:18777/api/quality/contract-governor?transaction_digest=${'a'.repeat(64)}`), { root: apiRoot });
  assert.equal(absentDetail.status, 404); assert.deepEqual(await absentDetail.json(), { error: 'Publication status unavailable' });
  const invalidRequest = await contractGovernorApiPost(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: 'POST', headers: { origin: 'http://127.0.0.1:18777', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_refinement', rule_id: 'bad', receipt_digest: 'bad', request_nonce: 'bad' }) }), { root: apiRoot });
  assert.equal(invalidRequest.status, 400); assert.deepEqual(await invalidRequest.json(), { error: 'Invalid or stale refinement request' });
  const unsupported = rejectContractGovernorWrite(); assert.equal(unsupported.status, 405); assert.deepEqual(await unsupported.json(), { error: 'Method not allowed' });

  const lifecycleRoot = root(); roots.push(lifecycleRoot);
  const globalReady = statusReadyFixture(lifecycleRoot, { tier: 'global', marker: 'a' });
  const projectReady = statusReadyFixture(lifecycleRoot, { tier: 'project', marker: 'b' });
  const requestRefinement = (target, nonce, options = {}) => contractGovernorApiPost(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: options.method || 'POST', headers: { origin: options.origin || 'http://127.0.0.1:18777', 'content-type': options.contentType || 'application/json', ...(options.authorization ? { authorization: options.authorization } : {}) }, body: options.body === undefined ? JSON.stringify({ action: 'request_refinement', rule_id: target.rule_id, receipt_digest: target.receipt_digest, request_nonce: nonce }) : options.body }), { root: lifecycleRoot });
  const readyAggregate = await contractGovernorApiGet(new Request('http://127.0.0.1:18777/api/quality/contract-governor'), { root: lifecycleRoot });
  assert.equal(readyAggregate.status, 200); const readyPayload = await readyAggregate.json(); assert.equal(readyPayload.publication_status.publications.length, 2); assert.doesNotMatch(JSON.stringify(readyPayload), /VT11_REPOSITORY|VT11_CANDIDATE/);
  for (const target of [globalReady, projectReady]) { const detail = await contractGovernorApiGet(new Request(`http://127.0.0.1:18777/api/quality/contract-governor?transaction_digest=${target.transaction_digest}`), { root: lifecycleRoot }); assert.equal(detail.status, 200); assert.equal((await detail.json()).publication.rule_id, target.rule_id); }
  const globalCreated = await requestRefinement(globalReady, 'nonce-global'); assert.equal(globalCreated.status, 202); const globalPayload = await globalCreated.json(); assert.deepEqual(Object.keys(globalPayload).sort(), ['expires_at', 'request_id', 'rule_id', 'scope_id', 'status', 'tier']); assert.equal(globalPayload.rule_id, globalReady.rule_id); assert.equal(globalPayload.scope_id, 'pidex-global');
  const globalRetry = await requestRefinement(globalReady, 'nonce-global'); assert.equal(globalRetry.status, 202); assert.equal((await globalRetry.json()).request_id, globalPayload.request_id); assert.equal(requestCount(lifecycleRoot), 1);
  const globalConflict = await requestRefinement(globalReady, 'nonce-global-next'); assert.equal(globalConflict.status, 409); assert.deepEqual(await globalConflict.json(), { error: 'Invalid or stale refinement request' });
  const projectCreated = await requestRefinement(projectReady, 'nonce-project'); assert.equal(projectCreated.status, 202); assert.equal((await projectCreated.json()).scope_id, projectReady.scope_id); assert.equal(requestCount(lifecycleRoot), 2);

  for (const [name, change] of [
    ['stopped', (target) => { const store = openRuleLifecycleStore({ stateRoot: target.stateRoot }); try { store.setLocalRuleStop({ repository: target.repository, scope_id: target.scope_id || 'pidex-global', rule_id: target.rule_id, reason_code: 'operator_stop' }); } finally { store.close(); } }],
    ['closed epoch', (target) => { const db = new DatabaseSync(lifecycleDb(target.rootPath)); try { db.prepare('UPDATE activation_epoch SET closed_at = ? WHERE activation_epoch = ?').run('2026-08-14T00:01:00.000Z', target.epoch); } finally { db.close(); } }],
    ['stale epoch', (target) => { const db = new DatabaseSync(lifecycleDb(target.rootPath)); try { const row = db.prepare('SELECT entries_json FROM effective_projection').get(); const entries = JSON.parse(row.entries_json); entries[0].activation_epoch = `epoch:${'f'.repeat(24)}`; db.prepare('UPDATE effective_projection SET entries_json = ?').run(canonical(entries)); } finally { db.close(); } }],
  ]) {
    const conflictRoot = root(); roots.push(conflictRoot); const target = { ...statusReadyFixture(conflictRoot, { tier: 'global', marker: 'c' }), rootPath: conflictRoot }; change(target); const response = await contractGovernorApiPost(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: 'POST', headers: { origin: 'http://127.0.0.1:18777', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_refinement', rule_id: target.rule_id, receipt_digest: target.receipt_digest, request_nonce: `nonce-${name.replace(/ /g, '-')}` }) }), { root: conflictRoot }); assert.equal(response.status, 409, name); assert.equal(requestCount(conflictRoot), 0, name);
  }
  const mismatchRoot = root(); roots.push(mismatchRoot); const mismatch = statusReadyFixture(mismatchRoot, { tier: 'project', marker: 'd' });
  for (const payload of [{ ...mismatch, receipt_digest: 'f'.repeat(64) }, { ...mismatch, rule_id: 'project:eeeeeeeeeeeeeeeeeeeeeeee:pidex-implementer:foreign' }, { ...mismatch, rule_id: 'project:eeeeeeeeeeeeeeeeeeeeeeee:pidex-implementer:quality' }]) { const response = await contractGovernorApiPost(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: 'POST', headers: { origin: 'http://127.0.0.1:18777', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_refinement', rule_id: payload.rule_id, receipt_digest: payload.receipt_digest, request_nonce: `nonce-${payload.rule_id.slice(-7)}` }) }), { root: mismatchRoot }); assert.equal(response.status, 409); assert.equal(requestCount(mismatchRoot), 0); }

  const rejectedRoot = root(); roots.push(rejectedRoot); const noDb = lifecycleDb(rejectedRoot); const rejected = async (request) => { const response = await contractGovernorApiPost(request, { root: rejectedRoot }); assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'Operator access required' }); assert.equal(existsSync(noDb), false); };
  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';
  await rejected(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: 'POST', headers: { origin: 'http://evil.invalid', 'content-type': 'application/json' }, body: '{}' }));
  await rejected(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: 'POST', headers: { origin: 'http://127.0.0.1:18777', authorization: 'Bearer bad', 'content-type': 'application/json' }, body: '{}' }));
  delete process.env.PIDEX_DASHBOARD_PUBLIC_BIND;
  for (const options of [
    // Plan048 route contract (plan 048 line 117): malformed body is a malformed intent and returns the lifecycle-bound error, not the refinement-bound error.
    { body: '{bad' }, { body: JSON.stringify({ action: 'request_refinement', rule_id: globalReady.rule_id, receipt_digest: globalReady.receipt_digest, request_nonce: 'x'.repeat(4097) }) }, { body: JSON.stringify({ action: 'request_refinement', rule_id: globalReady.rule_id, receipt_digest: globalReady.receipt_digest }) }, { body: JSON.stringify({ action: 'request_refinement', rule_id: globalReady.rule_id, receipt_digest: globalReady.receipt_digest, request_nonce: 'extra', extra: true }) }, { body: JSON.stringify({ action: 'wrong', rule_id: globalReady.rule_id, receipt_digest: globalReady.receipt_digest, request_nonce: 'wrong-action' }) }, { body: JSON.stringify({ action: 'request_refinement', rule_id: 'bad', receipt_digest: globalReady.receipt_digest, request_nonce: 'wrong-rule' }) }, { body: JSON.stringify({ action: 'request_refinement', rule_id: globalReady.rule_id, receipt_digest: 'bad', request_nonce: 'wrong-digest' }) }, { body: JSON.stringify({ action: 'request_refinement', rule_id: globalReady.rule_id, receipt_digest: globalReady.receipt_digest, request_nonce: '' }) }, { method: 'PUT' },
  ]) { const invalid = await requestRefinement(globalReady, 'invalid-nonce', options); assert.equal(invalid.status, 400); assert.deepEqual(await invalid.json(), { error: options.body === '{bad' ? 'Invalid lifecycle request' : 'Invalid or stale refinement request' }); assert.equal(requestCount(lifecycleRoot), 2); }
  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';

  const denied = await contractGovernorApiGet(new Request(`http://pi.lan:18777/api/quality/contract-governor?transaction_digest=${'a'.repeat(64)}`), { root: apiRoot });
  assert.equal(denied.status, 403); assert.deepEqual(await denied.json(), { error: 'Operator access required' });
  delete process.env.PIDEX_DASHBOARD_PUBLIC_BIND;

  // ---- Plan048 Slice3B/4: lifecycle_control projection + authenticated control boundary (RED) ----
  process.env.PIDEX_PROVIDER_LIMITS_TOKEN = process.env.PIDEX_PROVIDER_LIMITS_TOKEN || 'governor-lifecycle-test-token-01';
  const sliceB4Root = root(); roots.push(sliceB4Root);
  const sliceB4State = path.join(sliceB4Root, 'state');
  const sliceB4Store = openRuleLifecycleStore({ stateRoot: sliceB4State });
  sliceB4Store.enroll({ repository: 'pidex-root', scope_id: null, remote: 'https://example.invalid/global', branch: 'refs/heads/main' });
  const sliceB4Head = { head_kind: 'accepted_remote', repository_identity: 'pidex-root', accepted_remote_head: '9'.repeat(40), baseline_parent_commit: '9'.repeat(40), manifest_digest: null, tree_digest: '3'.repeat(64), seeded_at: null, verified_at: '2026-08-14T00:00:00.000Z', remote_checked_at: '2026-08-14T00:00:00.000Z', freshness: 'exact_head' };
  sliceB4Store.replaceProjection({ repository: 'pidex-root', scope_id: null, accepted_head: '9'.repeat(40), head: sliceB4Head, entries: [{ rule_id: 'pidex-global:pidex-implementer:quality', rule_version: '6'.repeat(64), content_hash: '6'.repeat(64), accepted_commit: '9'.repeat(40), bytes: '# quality\n', tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: 'active', created_at: '2026-08-14T00:00:00.000Z', source_head: '9'.repeat(40), mirror_head: '9'.repeat(40), mirror_digest: '7'.repeat(64) }] });
  sliceB4Store.close();
  const globalRuleId = 'pidex-global:pidex-implementer:quality';
  const projectRuleId = `project:${'e'.repeat(24)}:pidex-implementer:quality`;
  const sliceB4Auth = { authorization: `Bearer ${process.env.PIDEX_PROVIDER_LIMITS_TOKEN}` };
  const sliceB4Post = (body, options = {}) => contractGovernorApiPost(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: options.method || 'POST', headers: { origin: options.origin || 'http://127.0.0.1:18777', 'content-type': options.contentType || 'application/json', ...(options.noAuth ? {} : sliceB4Auth), ...(options.authorization ? { authorization: options.authorization } : {}) }, body: options.body === undefined ? JSON.stringify(body) : options.body }), { root: sliceB4Root });

  const controlStatus = await contractGovernorApiGet(new Request('http://127.0.0.1:18777/api/quality/contract-governor'), { root: sliceB4Root });
  assert.equal(controlStatus.status, 200);
  assert.deepEqual((await controlStatus.json()).lifecycle_control, { status: 'available', publications: [] });

  const stopped = await sliceB4Post({ action: 'stop-local', rule_id: globalRuleId, request_nonce: 'nonce-stop-global' });
  assert.equal(stopped.status, 202, 'valid stop-local intent must be accepted');
  const stoppedBody = await stopped.json();
  assert.deepEqual(Object.keys(stoppedBody).sort(), ['correlation_id', 'status'], 'accepted control response exposes only safe correlation/status');
  assert.equal(stoppedBody.status, 'accepted'); assert.match(stoppedBody.correlation_id, /^action:[a-f0-9]{64}$/);  const verifyStop = openRuleLifecycleStore({ stateRoot: sliceB4State });
  assert.equal(verifyStop.readLocalRuleStop({ repository: 'pidex-root', scope_id: 'pidex-global', rule_id: globalRuleId }).reason_code, 'operator_stop');
  verifyStop.close();

  assert.equal((await sliceB4Post({ action: 'refinement-handoff', rule_id: globalRuleId, request_nonce: 'nonce-refinement-global' })).status, 202);
  const crossHost = await sliceB4Post({ action: 'stop-cross-host', rule_id: globalRuleId, request_nonce: 'nonce-cross-host' });
  assert.equal(crossHost.status, 202, 'cross-host stop with unavailable canonical authority must still apply local stop');
  assert.deepEqual(Object.keys(await crossHost.json()).sort(), ['correlation_id', 'status']);

  const reactivate = await sliceB4Post({ action: 'reactivate-monitor', rule_id: globalRuleId, request_nonce: 'nonce-reactivate' });
  assert.equal(reactivate.status, 409, 'reactivation without reconstructable authority must fail closed as stale');
  assert.deepEqual(await reactivate.json(), { error: 'Lifecycle state changed' });

  const unknown = await sliceB4Post({ action: 'purge-forever', rule_id: globalRuleId, request_nonce: 'nonce-purge' });
  assert.equal(unknown.status, 400); const unknownBody = await unknown.json(); assert.deepEqual(unknownBody, { error: 'Invalid lifecycle request' });
  for (const bad of [{ action: 'stop-local', rule_id: 'bad', request_nonce: 'x' }, { action: 'stop-local', rule_id: globalRuleId }]) { const badJson = await sliceB4Post(bad, bad.request_nonce ? {} : { body: '{bad' }); assert.equal(badJson.status, 400); assert.deepEqual(await badJson.json(), { error: 'Invalid lifecycle request' }); }
  const projectStop = await sliceB4Post({ action: 'stop-local', rule_id: projectRuleId, request_nonce: 'nonce-project' });
  assert.equal(projectStop.status, 503, 'project rule without enrolled transaction repository must fail closed tier-isolated');
  assert.deepEqual(await projectStop.json(), { error: 'Lifecycle action unavailable' });

  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';
  const crossOrigin = await sliceB4Post({ action: 'stop-local', rule_id: globalRuleId, request_nonce: 'nonce-x' }, { origin: 'http://evil.invalid' });
  assert.equal(crossOrigin.status, 403); assert.deepEqual(await crossOrigin.json(), { error: 'Operator access required' });
  const badToken = await sliceB4Post({ action: 'stop-local', rule_id: globalRuleId, request_nonce: 'nonce-x' }, { authorization: 'Bearer bad' });
  assert.equal(badToken.status, 403); assert.deepEqual(await badToken.json(), { error: 'Operator access required' });  delete process.env.PIDEX_DASHBOARD_PUBLIC_BIND;

  const leakBody = await (await sliceB4Post({ action: 'stop-local', rule_id: globalRuleId, request_nonce: 'nonce-leak' })).json();
  const leakText = JSON.stringify([stoppedBody, leakBody, unknownBody, await (await contractGovernorApiGet(new Request('http://127.0.0.1:18777/api/quality/contract-governor'), { root: sliceB4Root })).json()]);
  assert.doesNotMatch(leakText, /credential|secret|token|password|\/home\/|C:\\|VT11|lifecycle\.sqlite|result_bytes/i, 'control boundary must expose zero raw path/result/auth detail');

  const malformedConfig2 = root(); roots.push(malformedConfig2); writeFileSync(path.join(malformedConfig2, 'config/contract-governor.local.json'), '{bad');
  const badConfig2 = await getContractGovernorStatus(malformedConfig2);
  assert.equal(badConfig2.ok, false); assert.deepEqual(badConfig2.lifecycle_control, { status: 'unavailable', publications: [] });

  // ---- H-1 correction (Plan048 review H-1 + security F-296-01): store-owned control authority drives canonical 202 transitions; token required even on loopback (RED) ----
  const h1Root = root(); roots.push(h1Root); const h1State = path.join(h1Root, 'state'); const h1Store = openRuleLifecycleStore({ stateRoot: h1State });
  h1Store.enroll({ repository: 'pidex-root', scope_id: null, remote: 'https://example.invalid/global', branch: 'refs/heads/main' });
  const h1Writer = { normalized_remote_digest: 'b'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: 'c'.repeat(64), identity_platform: 'posix', root_identity_digest: 'd'.repeat(64), parent_identity_digest: 'e'.repeat(64), files_identity_digest: 'f'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  const h1Project = (ruleId, lifecycle_state) => { const parts = ruleId.split(':'); const repo = `pidex-root-${parts[2]}`; const paths = ['config/rule-baseline-manifest.json', `rules/${parts[1]}/index.md`, `rules/${parts[1]}/${parts[2]}.md`]; const head = { ...sliceB4Head, repository_identity: repo }; h1Store.enroll({ repository: repo, scope_id: null, remote: 'https://example.invalid/global', branch: 'refs/heads/main' }); h1Store.enrollPublicationTarget({ repository: repo, tier: 'global', scope_id: 'pidex-global', scope_digest: 'd'.repeat(64), rule_id: ruleId, predecessor: `commit:${'9'.repeat(40)}`, enrollment_digest: '9'.repeat(64), allowed_paths: paths, writer_authority: { ...h1Writer, repository_identity_digest: createHash('sha256').update(ruleId).digest('hex') } }); const entry = (state) => ({ rule_id: ruleId, rule_version: '6'.repeat(64), content_hash: '6'.repeat(64), accepted_commit: '9'.repeat(40), bytes: `<!-- pidex-rule-receipt-v1 {"rule_id":"${ruleId}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"${state}"} -->\n# ${parts[2]}\n`, tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: state, created_at: '2026-08-14T00:00:00.000Z', source_head: '9'.repeat(40), mirror_head: '9'.repeat(40), mirror_digest: '7'.repeat(64) }); h1Store.replaceProjection({ repository: repo, scope_id: null, accepted_head: '9'.repeat(40), head, entries: [entry('active')], event_kind: 'baseline_imported' }); if (lifecycle_state !== 'active') h1Store.replaceProjection({ repository: repo, scope_id: null, accepted_head: '9'.repeat(40), head, entries: [entry(lifecycle_state)], event_kind: 'lifecycle_action_projection' }); };
  h1Project(globalRuleId, 'deactivated'); h1Project('pidex-global:pidex-implementer:pin', 'active-pinned'); h1Project('pidex-global:pidex-implementer:monitor', 'active'); h1Store.close();
  const h1Post = (body, options = {}) => contractGovernorApiPost(new Request('http://127.0.0.1:18777/api/quality/contract-governor', { method: 'POST', headers: { origin: 'http://127.0.0.1:18777', 'content-type': 'application/json', ...(options.noAuth ? {} : sliceB4Auth) }, body: JSON.stringify(body) }), { root: h1Root });
  const h1Reactivate = await h1Post({ action: 'reactivate-monitor', rule_id: globalRuleId, request_nonce: 'nonce-h1-reactivate' });
  assert.equal(h1Reactivate.status, 202, 'H-1: reactivate-monitor with store-owned authority must be accepted');
  assert.deepEqual(Object.keys(await h1Reactivate.json()).sort(), ['correlation_id', 'status'], 'accepted canonical control exposes only safe correlation/status');
  assert.equal((await h1Post({ action: 'reactivate-pin', rule_id: globalRuleId, request_nonce: 'nonce-h1-reactivate-pin' })).status, 202, 'H-1: reactivate-pin accepted');
  assert.equal((await h1Post({ action: 'unpin', rule_id: 'pidex-global:pidex-implementer:pin', request_nonce: 'nonce-h1-unpin' })).status, 202, 'H-1: unpin accepted');
  const h1CrossHost = await h1Post({ action: 'stop-cross-host', rule_id: 'pidex-global:pidex-implementer:monitor', request_nonce: 'nonce-h1-cross-host' });
  assert.equal(h1CrossHost.status, 202, 'H-1: active stop-cross-host must produce prepared canonical deactivation TX');
  assert.deepEqual(Object.keys(await h1CrossHost.json()).sort(), ['correlation_id', 'status']);
  const h1Verify = openRuleLifecycleStore({ stateRoot: h1State });
  try {
    const h1Rows = h1Verify.listLifecycleActionStatusFacts();
    const byRule = (ruleId) => h1Rows.find((row) => row.rule_id === ruleId);
    assert.equal(byRule(globalRuleId).state, 'prepared', 'deactivated → reactivation pending: prepared TX row exists');
    assert.equal(h1Verify.readProjection({ repository: 'pidex-root-quality', scope_id: null }).entries[0].lifecycle_state, 'deactivated', 'reactivation pending keeps canonical deactivated truth until accepted');
    assert.equal(h1Verify.readLifecycleActionWriterFacts({ idempotency_key: `tx:${byRule(globalRuleId).transaction_digest}` }).action.lifecycle_transition, 'active-monitor', 'reactivation TX carries active-monitor transition');
    assert.equal(byRule('pidex-global:pidex-implementer:monitor').state, 'prepared');
    assert.equal(h1Verify.readLifecycleActionWriterFacts({ idempotency_key: `tx:${byRule('pidex-global:pidex-implementer:monitor').transaction_digest}` }).action.lifecycle_transition, 'deactivated', 'cross-host deactivation TX carries deactivated transition');
    assert.doesNotMatch(JSON.stringify(h1Rows), /\/home\/|C:\\|credential|secret|token|result_bytes|rule_bytes/);
  } finally { h1Verify.close(); }
  const h1NoToken = await h1Post({ action: 'reactivate-monitor', rule_id: globalRuleId, request_nonce: 'nonce-h1-no-token' }, { noAuth: true });
  assert.equal(h1NoToken.status, 403, 'F-296-01: lifecycle mutation requires configured token even on loopback/same-origin');
  assert.deepEqual(await h1NoToken.json(), { error: 'Operator access required' });
} finally { for (const value of roots) rmSync(value, { recursive: true, force: true }); }
console.log('contract governor read model tests passed');
