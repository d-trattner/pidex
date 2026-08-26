import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { Worker } from 'node:worker_threads';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openRuleLifecycleStore, readManualRefinementIntake, readManualRefinementRequestFacts } from './rule-lifecycle-store.mjs';
import { createManualRefinementReader, createManualRefinementRequest, importManualRefinementCandidate, prepareManualRefinementTransaction, publishManualRefinement, readManualPublicationTarget, readManualRefinementAdmission, readManualRefinementEnvelope, resumeManualRefinementPublication } from './rule-manual-import.mjs';
import { materializeVerifiedMirror, readVerifiedMirrorMember } from './rule-mirror-sync.mjs';
import { createRuleLearningFinding, createRuleLearningSupport, findingDigest, lessonCode } from './rule-learning-contracts.mjs';
import { buildRuleLearningCandidate } from './rule-learning-candidate.mjs';
import { admitManualRefinementIntake, admitRuleLearningCandidate, prepareSemanticReviewContext } from './rule-learning-admission.mjs';

test('manual reader rejects a caller-owned behavior object', () => {
  const source = Buffer.from('{"slug":"quality","applicability":["implementation"],"instruction":"Validate contract.","trigger":"Before handoff.","expected_evidence":"Focused checks pass.","failure_behavior":"Defer publication.","rationale":"Repeated safe support."}\n', 'utf8');
  const predecessor = Buffer.from('canonical predecessor\n', 'utf8');
  const path_digest = 'a'.repeat(64); const current_content_digest = createHash('sha256').update(predecessor).digest('hex');
  const reader = Object.freeze({ acquireSelection: () => Object.freeze({}), identitySnapshot: () => ({ platform: 'posix', path_digest, root_identity: 'b'.repeat(64), parent_identity: 'c'.repeat(64), file_identity: 'd'.repeat(64), safety: 'no-follow' }), readNoFollow: () => source, readPredecessor: () => predecessor, release: () => {} });
  assert.throws(() => readManualRefinementEnvelope({ reader, request: { path_digest, current_content_digest, accepted_commit: 'e'.repeat(40) } }), /RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE/);
});

test('manual reader table rejects identity drift, unsafe selection, and malformed source without source disclosure', () => {
  const predecessor = Buffer.from('canonical predecessor\n', 'utf8');
  const current_content_digest = createHash('sha256').update(predecessor).digest('hex');
  const path_digest = 'a'.repeat(64);
  const source = Buffer.from('{"slug":"quality","applicability":["implementation"],"instruction":"Validate contract.","trigger":"Before handoff.","expected_evidence":"Focused checks pass.","failure_behavior":"Defer publication.","rationale":"Repeated safe support."}\n', 'utf8');
  const stable = { platform: 'posix', path_digest, root_identity: 'b'.repeat(64), parent_identity: 'c'.repeat(64), file_identity: 'd'.repeat(64), safety: 'no-follow' };
  const cases = [
    ...['root_identity', 'parent_identity', 'file_identity', 'path_digest', 'platform', 'safety'].map((field) => [`identity ${field} drift at each checkpoint`, { snapshots: [stable, { ...stable, [field]: field === 'platform' ? 'windows' : field === 'safety' ? 'follow-links' : 'e'.repeat(64) }] }]),
    ...['symlink', 'hardlink', 'reparse', 'junction', 'case alias', 'unicode alias', 'unsupported identity'].map((name) => [`${name} fails closed`, { snapshots: [{ ...stable, safety: name }] }]),
    ['source swap after read', { source: Buffer.from(`${source.toString('utf8')}swap`, 'utf8'), snapshots: [stable, stable, { ...stable, file_identity: 'e'.repeat(64) }] }],
    ['predecessor digest mismatch', { predecessor: Buffer.from('changed predecessor\n', 'utf8') }],
    ['selected path traversal adapter input', { extra_reader_key: 'path' }],
    ['selected path alias adapter input', { extra_reader_key: 'selection_path' }],
    ['missing envelope field', { source: Buffer.from('{}\n', 'utf8') }],
    ['extra envelope field', { source: Buffer.from(`${source.toString('utf8').trim().slice(0, -1)},"extra":true}\n`, 'utf8') }],
    ['noncanonical key order', { source: Buffer.from('{"trigger":"Before handoff.","slug":"quality","applicability":["implementation"],"instruction":"Validate contract.","expected_evidence":"Focused checks pass.","failure_behavior":"Defer publication.","rationale":"Repeated safe support."}\n', 'utf8') }],
    ['duplicate raw key', { source: Buffer.from('{"slug":"quality","slug":"quality","applicability":["implementation"],"instruction":"Validate contract.","trigger":"Before handoff.","expected_evidence":"Focused checks pass.","failure_behavior":"Defer publication.","rationale":"Repeated safe support."}\n', 'utf8') }],
    ['leading whitespace', { source: Buffer.from(` ${source.toString('utf8')}`, 'utf8') }],
    ['noncompact whitespace', { source: Buffer.from(source.toString('utf8').replace(':"quality"', ': "quality"'), 'utf8') }],
    ['CRLF newline', { source: Buffer.from(source.toString('utf8').replace('\n', '\r\n'), 'utf8') }],
    ['UTF-8 BOM', { source: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), source]) }],
    ['oversize envelope', { source: Buffer.alloc(4097, 97) }],
    ['invalid UTF8 envelope', { source: Buffer.from([0xff, 0x0a]) }],
  ];
  for (const [name, variant] of cases) {
    let released = 0; const selection = Object.freeze({}); let checkpoint = 0;
    const snapshots = variant.snapshots || [stable, stable, stable, stable];
    const reader = {
      acquireSelection: () => selection,
      identitySnapshot: () => snapshots[Math.min(checkpoint++, snapshots.length - 1)],
      readNoFollow: () => variant.source || source,
      readPredecessor: () => variant.predecessor || predecessor,
      release: () => { released += 1; },
    };
    if (variant.extra_reader_key) reader[variant.extra_reader_key] = '../caller-owned';
    assert.throws(() => readManualRefinementEnvelope({ reader, request: { path_digest, current_content_digest, accepted_commit: 'e'.repeat(40) } }), /RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE/, name);
    assert.equal(released, 0, name);
  }
  const windowsReader = { acquireSelection: () => Object.freeze({}), identitySnapshot: () => ({ ...stable, platform: 'windows' }), readNoFollow: () => source, readPredecessor: () => predecessor, release: () => {} };
  assert.throws(() => readManualRefinementEnvelope({ reader: windowsReader, request: { path_digest, current_content_digest, accepted_commit: 'e'.repeat(40) } }), /RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE/, 'caller-owned Windows behavior object remains rejected');
});

test('store mints no manual capability without current open request authority', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-manual-capability-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.throws(() => store.mintManualRefinementCapability({ request_id: `manual-refinement:${'a'.repeat(64)}` }), /RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE/);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});

test('manual intake rejects forged request capability before reader, candidate, or source disclosure', () => {
  assert.throws(() => importManualRefinementCandidate({
    store: {}, request_capability: Object.freeze({}), reader: {}, support: {}, findings: [], enrollment_authority: Object.freeze({}), now: '2026-08-14T00:00:00.000Z',
  }), /RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE/);
});

test('manual refinement creation accepts no caller-owned repository, path, head, or content authority', () => {
  assert.throws(() => createManualRefinementRequest({
    store: {},
    rule_id: 'pidex-global:pidex-implementer:quality',
    request_nonce: 'request:manual-001',
    now: '2026-08-14T00:00:00.000Z',
    repository: '/private/repository',
  }), /RULE_MANUAL_REFINEMENT_REQUEST_INVALID/);
});

test('manual refinement creation delegates only canonical identity, nonce, and time to durable authority', () => {
  const expected = Object.freeze({ status: 'open', request_id: `manual-refinement:${'a'.repeat(64)}`, rule_id: 'pidex-global:pidex-implementer:quality', scope_id: 'pidex-global', source_digest: 'b'.repeat(64) });
  const store = {
    createManualRefinementRequest({ rule_id, receipt_digest, request_nonce, now }) {
      assert.deepEqual({ rule_id, receipt_digest, request_nonce, now }, { rule_id: 'pidex-global:pidex-implementer:quality', receipt_digest: 'a'.repeat(64), request_nonce: 'request:manual-001', now: '2026-08-14T00:00:00.000Z' });
      return expected;
    },
  };
  assert.equal(createManualRefinementRequest({ store, rule_id: 'pidex-global:pidex-implementer:quality', receipt_digest: 'a'.repeat(64), request_nonce: 'request:manual-001', now: '2026-08-14T00:00:00.000Z' }), expected);
});

test('durable manual refinement authority fails closed without a current status-ready enrollment chain', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-manual-refinement-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.throws(() => store.createManualRefinementRequest({ rule_id: 'pidex-global:pidex-implementer:quality', receipt_digest: 'a'.repeat(64), request_nonce: 'request:manual-001', now: '2026-08-14T00:00:00.000Z' }), /RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE/);
  } finally {
    store.close();
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('manual intake reader rejects forged capability without exposing candidate bytes', () => {
  assert.equal(readManualRefinementIntake({ intake_capability: Object.freeze({}) }), null);
});

function manualIntakeE2EFixture({ tier = 'global' } = {}) {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-manual-intake-e2e-')); const project = tier === 'project'; const scope = project ? '1'.repeat(24) : '';
  const repository = path.join(stateRoot, 'private-reader-repository'); const rule_id = project ? `project:${scope}:pidex-implementer:quality` : 'pidex-global:pidex-implementer:quality'; const rulePath = project ? 'pidex/rules/managed/pidex-implementer/quality.md' : 'rules/pidex-implementer/quality.md'; const indexPath = project ? 'pidex/rules/managed/pidex-implementer/index.md' : 'rules/pidex-implementer/index.md'; const predecessor = 'b'.repeat(40); const accepted = predecessor; const transaction_digest = 'd'.repeat(64); const authority_digest = '9'.repeat(64); const sourceBytes = Buffer.from('{"slug":"quality","applicability":["implementation"],"instruction":"Validate contract.","trigger":"Before handoff.","expected_evidence":"Focused checks pass.","failure_behavior":"Defer publication.","rationale":"Repeated safe support."}\n'); const predecessorBytes = Buffer.from('# canonical predecessor\n'); const indexBytes = Buffer.from('- [quality](quality.md)\n'); const content_hash = createHash('sha256').update(predecessorBytes).digest('hex'); const indexHash = createHash('sha256').update(indexBytes).digest('hex');
  const finding = ({ scope, id, repo }) => createRuleLearningFinding({ schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${id.repeat(32)}`, producer: 'pidex-retrospective', completed_run_id: `run:completed-${id}`, plan_id: 'plan:047', project_scope_id: scope, repository_identity: `repo:${repo.repeat(64)}`, taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:validation-missing', lesson_summary: 'Safe recurrence.', evidence_digests: [id.repeat(64)], occurred_at: '2026-08-13T00:00:00.000Z', redaction_classes: ['none'] });
  const findings = [finding({ scope: '1'.repeat(24), id: 'c', repo: 'e' }), finding({ scope: '2'.repeat(24), id: 'f', repo: '0' })];
  const writer_authority = { normalized_remote_digest: '4'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX Test <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: '6'.repeat(64), identity_platform: 'posix', root_identity_digest: '1'.repeat(64), parent_identity_digest: '2'.repeat(64), files_identity_digest: '3'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  const globalTarget = { repository: project ? 'repo:unused-global' : repository, scope_id: null, tier: 'global', enabled: true, protected: false, scope_digest: '7'.repeat(64), predecessor: `commit:${predecessor}`, authority_digest, applicable_descriptors: [{ descriptor_digest: '5'.repeat(64) }], writer_authority };
  const projectTarget = { ...globalTarget, repository: project ? repository : 'repo:unused-project', scope_id: findings[0].project_scope_id, tier: 'project', scope_digest: `${findings[0].project_scope_id}${'8'.repeat(40)}`, rule_id: `project:${findings[0].project_scope_id}:pidex-implementer:quality` };
  const authority = { enrollment: { authority_digest, sources: findings.map((item) => ({ finding_id: item.finding_id, snapshot: { repository: item.repository_identity, scope_id: item.project_scope_id, tier: 'project', enabled: true, protected: false, repository_identity: item.repository_identity } })), targets: { project: projectTarget, global: globalTarget }, policy: { id: 'pidex-living-rule-admission-v1', version: '1', digest: '3'.repeat(64) }, generator_identity: { principal: 'generator:configured', attempt_id: 'attempt:generator-001' } }, reviewers: { configuration_generation: 'config:1', generator_principal: 'generator:configured', now: '2026-08-13T01:00:00.000Z', principals: ['one', 'two', 'three'].map((name) => ({ principal: `reviewer:${name}`, backend: `backend:${name}`, provider: 'provider', model: 'model' })) } };
  const store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority });
  const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
  try {
    for (const item of findings) store.enroll({ repository: item.repository_identity, scope_id: item.project_scope_id, remote: `https://example.invalid/${item.repository_identity}`, branch: 'main' });
    for (const item of Object.values(authority.enrollment.targets)) store.enroll({ repository: item.repository, scope_id: item.scope_id, remote: `https://example.invalid/${item.tier}`, branch: 'main' });
    mkdirSync(path.dirname(path.join(repository, rulePath)), { recursive: true }); writeFileSync(path.join(repository, rulePath), sourceBytes); writeFileSync(path.join(repository, indexPath), indexBytes);
    materializeVerifiedMirror({ stateRoot, repository, scope_id: scope, accepted_head: accepted, members: [{ rule_id, path: rulePath, content_hash, bytes: predecessorBytes }, { rule_id: project ? `project:${scope}:pidex-implementer:index` : 'pidex-global:pidex-implementer:index', path: indexPath, content_hash: indexHash, bytes: indexBytes }] });
    const head = { head_kind: 'accepted_remote', repository_identity: repository, accepted_remote_head: accepted, baseline_parent_commit: predecessor, manifest_digest: null, tree_digest: 'f'.repeat(64), seeded_at: null, verified_at: '2026-08-14T00:00:00.000Z', remote_checked_at: '2026-08-14T00:00:00.000Z', freshness: 'exact_head' };
    store.replaceProjection({ repository, scope_id: scope || null, accepted_head: accepted, head, entries: [{ rule_id, rule_version: content_hash, content_hash, accepted_commit: accepted, tier, lifecycle_state: 'active' }] });
    const entry = store.readProjection({ repository, scope_id: scope || null }).entries[0]; const paths = JSON.stringify(project ? [indexPath, rulePath] : ['config/rule-baseline-manifest.json', indexPath, rulePath]); const externalScope = project ? scope : 'pidex-global'; const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'f'.repeat(64), scope_id: externalScope, rule_id, predecessor_commit: predecessor, accepted_commit: accepted, tree_digest: 'f'.repeat(64), content_hash, admission_digest: '1'.repeat(64), transaction_digest, lifecycle_state: 'active' }; const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex'); const payload = { accepted_commit: accepted, containing_head: accepted, member: { rule_id, path: rulePath, content_hash }, target_epoch: { repository_digest: createHash('sha256').update(repository).digest('hex'), scope_id: externalScope, rule_id, rule_version: content_hash, activation_epoch: entry.activation_epoch } };
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); db.prepare('INSERT INTO publication_enrollment (repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,predecessor) VALUES (?,?,?,?,?,?)').run(repository, scope, rule_id, authority_digest, paths, `commit:${predecessor}`); db.prepare('UPDATE publication_enrollment SET normalized_remote_digest=?,branch=?,author=?,writer_enabled=?,trailer_policy=?,repository_identity_digest=?,identity_platform=?,root_identity_digest=?,parent_identity_digest=?,files_identity_digest=?,identity_proof=?,publication_timestamp=? WHERE repository=? AND scope_id=? AND rule_id=?').run(writer_authority.normalized_remote_digest, writer_authority.branch, writer_authority.author, 1, writer_authority.trailer_policy, writer_authority.repository_identity_digest, writer_authority.identity_platform, writer_authority.root_identity_digest, writer_authority.parent_identity_digest, writer_authority.files_identity_digest, writer_authority.identity_proof, writer_authority.publication_timestamp, repository, scope, rule_id); db.prepare('INSERT INTO publication_transaction (idempotency_key,repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,expected_base,candidate_digest,candidate_bytes,admission_digest,admission_bytes,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(`tx:${transaction_digest}`, repository, scope, rule_id, authority_digest, paths, predecessor, '2'.repeat(64), Buffer.from('{}'), '1'.repeat(64), Buffer.from('{}'), 'accepted_remote', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z'); db.prepare('INSERT INTO publication_accepted_receipt (idempotency_key,receipt_digest,receipt_json) VALUES (?,?,?)').run(`tx:${transaction_digest}`, receipt_digest, canonical(receipt)); db.prepare('INSERT INTO publication_handoff_stage_current (receipt_digest,transaction_digest,stage,payload_digest,payload_json,updated_at) VALUES (?,?,?,?,?,?)').run(receipt_digest, transaction_digest, 'status_ready', createHash('sha256').update(canonical(payload)).digest('hex'), canonical(payload), '2026-08-14T00:00:00.000Z'); db.close();
    const request = store.createManualRefinementRequest({ rule_id, receipt_digest, request_nonce: 'request:manual-e2e', now: '2026-08-14T00:00:00.000Z' }); const live = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); live.prepare('UPDATE manual_refinement_request SET expires_at = ? WHERE request_id = ?').run(new Date(Date.now() + 60_000).toISOString(), request.request_id); live.close();
    const selectedFindings = project ? [findings[0]] : findings; const support = createRuleLearningSupport({ schema_version: 'pidex-rule-learning-support-v1', tier, taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:validation-missing', lesson_code: lessonCode({ taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:validation-missing' }), occurrence_count: selectedFindings.length, scope_count: selectedFindings.length, finding_digests: selectedFindings.map(findingDigest).sort() });
    const request_capability = store.mintManualRefinementCapability({ request_capability: request.request_capability }); const reader_capability = createManualRefinementReader({ request_capability });
    const input = () => ({ store, request_capability, reader_capability, support, findings: selectedFindings, enrollment_authority: store.mintRuleLearningEnrollmentAuthority(), now: '2026-08-14T00:00:00.000Z' });
    return { stateRoot, repository, rule_id, rulePath, indexPath, scope, accepted, request, sourceBytes, predecessorBytes, indexBytes, content_hash, indexHash, store, input, support, findings: selectedFindings, authority, request_capability, reader_capability };
  } catch (error) { store.close(); rmSync(stateRoot, { recursive: true, force: true }); throw error; }
}

// Final acceptance fixture: real status_ready chain, opaque reader, current learning authority, and atomic durable intake.
test('PLAN047 correction B imports canonical manual candidate with retries, privacy, and atomicity', () => {
  const fixture = manualIntakeE2EFixture();
  try {
    const canonicalSupport = fixture.support; const build = (support, findings = fixture.findings) => buildRuleLearningCandidate({ support, findings, authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: () => ({ slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }) });
    assert.equal(build(canonicalSupport, [...fixture.findings].reverse()).status, 'candidate');
    assert.equal(build({ ...canonicalSupport, finding_digests: [...canonicalSupport.finding_digests].reverse() }).status, 'deferred');
    assert.equal(build({ ...canonicalSupport, finding_digests: ['0'.repeat(64), '1'.repeat(64)] }).status, 'deferred');
    assert.equal(build({ ...canonicalSupport, finding_digests: [canonicalSupport.finding_digests[0], canonicalSupport.finding_digests[0]] }).status, 'deferred');
    assert.equal(build({ ...canonicalSupport, occurrence_count: 3 }).status, 'deferred');
    const first = importManualRefinementCandidate(fixture.input());
    assert.equal(first.status, 'imported');
    const intake = readManualRefinementIntake({ intake_capability: first.intake_capability });
    assert.ok(intake); assert.equal(intake.candidate_digest, first.candidate_digest); assert.notEqual(intake.candidate_digest, intake.candidate_bytes_digest); assert.equal(createHash('sha256').update(intake.candidate_bytes).digest('hex'), intake.candidate_bytes_digest);
    const retry = importManualRefinementCandidate(fixture.input()); assert.equal(retry.status, 'existing');
    const publicRequest = readManualRefinementRequestFacts({ capability: fixture.request_capability }); const readerError = (() => { try { readManualRefinementEnvelope({ reader_capability: Object.freeze({}), request: publicRequest }); } catch (error) { return error.message; } })(); const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); const events = db.prepare('SELECT request_id,status,created_at FROM manual_refinement_request_event WHERE request_id = ?').all(fixture.request.request_id); const privateIntake = db.prepare('SELECT candidate_bytes FROM manual_refinement_request WHERE request_id = ?').get(fixture.request.request_id); db.close();
    assert.equal(Buffer.from(privateIntake.candidate_bytes).toString('utf8'), JSON.stringify(intake.candidate)); assert.equal(readerError, 'RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE');
    for (const value of [fixture.sourceBytes.toString('utf8'), fixture.repository, 'rules/pidex-implementer/quality.md']) assert.doesNotMatch(JSON.stringify({ publicRequest, events, first, retry, intake, readerError }), new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('PLAN047 correction B rejects altered, forged, foreign, drifted, and faulted intake while one of two handles imports', () => {
  const build = (fixture) => buildRuleLearningCandidate({ support: fixture.support, findings: fixture.findings, authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: () => ({ slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }) });
  const sourceDigest = (fixture) => createHash('sha256').update(fixture.sourceBytes).digest('hex');
  const cleanup = (fixture) => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); };
  let fixture = manualIntakeE2EFixture();
  try {
    assert.equal(importManualRefinementCandidate(fixture.input()).status, 'imported');
    writeFileSync(path.join(fixture.repository, 'rules/pidex-implementer/quality.md'), Buffer.from('{"slug":"quality","applicability":["implementation"],"instruction":"Check contract.","trigger":"Before handoff.","expected_evidence":"Focused checks pass.","failure_behavior":"Defer publication.","rationale":"Repeated safe support."}\n'));
    assert.throws(() => importManualRefinementCandidate(fixture.input()), /RULE_MANUAL_REFINEMENT_INTAKE_CONFLICT/);
  } finally { cleanup(fixture); }
  fixture = manualIntakeE2EFixture();
  try {
    const built = build(fixture); assert.equal(built.status, 'candidate');
    for (const record of [{ candidate: built.candidate, candidate_bytes: Buffer.from('forged-private-bytes') }, { candidate: { ...built.candidate, candidate_digest: '0'.repeat(64) }, candidate_bytes: Buffer.from(built.bytes) }]) assert.throws(() => fixture.store.recordManualRefinementCandidate({ capability: fixture.request_capability, source_digest: sourceDigest(fixture), candidate_digest: built.digest, ...record, now: '2026-08-14T00:00:00.000Z' }), /RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE/);
    assert.equal(readManualRefinementIntake({ intake_capability: Object.freeze({}) }), null);
  } finally { cleanup(fixture); }
  const left = manualIntakeE2EFixture(); const right = manualIntakeE2EFixture();
  try {
    const built = build(left); assert.throws(() => right.store.recordManualRefinementCandidate({ capability: left.request_capability, source_digest: sourceDigest(left), candidate_digest: built.digest, candidate_bytes: Buffer.from(built.bytes), candidate: built.candidate, now: '2026-08-14T00:00:00.000Z' }), /RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE/);
  } finally { cleanup(left); cleanup(right); }
  for (const mutation of ['enrollment_digest', 'allowed_paths_json']) {
    fixture = manualIntakeE2EFixture();
    try {
      const built = build(fixture); const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); db.prepare(`UPDATE publication_enrollment SET ${mutation} = ? WHERE repository = ?`).run(mutation === 'enrollment_digest' ? '0'.repeat(64) : '[]', fixture.repository); db.close();
      assert.throws(() => fixture.store.recordManualRefinementCandidate({ capability: fixture.request_capability, source_digest: sourceDigest(fixture), candidate_digest: built.digest, candidate_bytes: Buffer.from(built.bytes), candidate: built.candidate, now: '2026-08-14T00:00:00.000Z' }), /RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE/);
    } finally { cleanup(fixture); }
  }
  fixture = manualIntakeE2EFixture();
  try {
    const built = build(fixture); assert.throws(() => fixture.store.recordManualRefinementCandidate({ capability: fixture.request_capability, attestation: fixture.store.mintManualCandidateAttestation({ request_capability: fixture.request_capability, enrollment_authority: fixture.store.mintRuleLearningEnrollmentAuthority(), support: fixture.support, findings: fixture.findings, candidate: built.candidate, candidate_bytes: Buffer.from(built.bytes), source_digest: sourceDigest(fixture), now: '2026-08-14T00:00:00.000Z' }), source_digest: sourceDigest(fixture), candidate_digest: built.digest, candidate_bytes: Buffer.from(built.bytes), candidate: built.candidate, now: '2026-08-14T00:00:00.000Z', fault: (checkpoint) => { if (checkpoint === 'after_write') throw new Error('injected'); } }), /injected/);
    const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); const row = db.prepare('SELECT status, source_digest, candidate_bytes FROM manual_refinement_request WHERE request_id = ?').get(fixture.request.request_id); assert.equal(row.status, 'open'); assert.equal(row.source_digest, null); assert.equal(row.candidate_bytes, null); assert.equal(db.prepare("SELECT COUNT(*) AS count FROM manual_refinement_request_event WHERE request_id = ? AND status = 'imported'").get(fixture.request.request_id).count, 0); db.close();
  } finally { cleanup(fixture); }
  fixture = manualIntakeE2EFixture(); let second;
  try {
    second = openRuleLifecycleStore({ stateRoot: fixture.stateRoot, learningAuthority: fixture.authority }); const secondCapability = second.mintManualRefinementCapability({ request_capability: fixture.request.request_capability }); const secondInput = { store: second, request_capability: secondCapability, reader_capability: createManualRefinementReader({ request_capability: secondCapability }), support: fixture.support, findings: fixture.findings, enrollment_authority: second.mintRuleLearningEnrollmentAuthority(), now: '2026-08-14T00:00:00.000Z' };
    assert.deepEqual([importManualRefinementCandidate(fixture.input()).status, importManualRefinementCandidate(secondInput).status].sort(), ['existing', 'imported']);
  } finally { second?.close(); cleanup(fixture); }
});

test('manual sink accepts only exact store-bound candidate attestation', () => {
  const fixture = manualIntakeE2EFixture();
  try {
    const built = buildRuleLearningCandidate({ support: fixture.support, findings: fixture.findings, authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: () => ({ slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }) });
    const source_digest = createHash('sha256').update(fixture.sourceBytes).digest('hex');
    const attestation = fixture.store.mintManualCandidateAttestation({ request_capability: fixture.request_capability, enrollment_authority: fixture.store.mintRuleLearningEnrollmentAuthority(), support: fixture.support, findings: fixture.findings, candidate: built.candidate, candidate_bytes: Buffer.from(built.bytes), source_digest, now: '2026-08-14T00:00:00.000Z' });
    assert.equal(fixture.store.recordManualRefinementCandidate({ capability: fixture.request_capability, attestation, source_digest, candidate_digest: built.digest, candidate_bytes: Buffer.from(built.bytes), candidate: built.candidate, now: '2026-08-14T00:00:00.000Z' }).status, 'imported');
    for (const forged of [Object.freeze({}), fixture.store.mintManualCandidateAttestation({ request_capability: fixture.request_capability, enrollment_authority: fixture.store.mintRuleLearningEnrollmentAuthority(), support: fixture.support, findings: fixture.findings, candidate: built.candidate, candidate_bytes: Buffer.from(built.bytes), source_digest, now: '2026-08-14T00:00:00.000Z' })]) assert.throws(() => fixture.store.recordManualRefinementCandidate({ capability: fixture.request_capability, attestation: forged, source_digest, candidate_digest: built.digest, candidate_bytes: Buffer.from(built.bytes), candidate: { ...built.candidate, body: `${built.candidate.body}x` }, now: '2026-08-14T00:00:00.000Z' }), /RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE/);
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('manual request derives current authority from status-ready receipt, projection, and immutable enrollment', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-manual-refinement-authority-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const repository = path.join(stateRoot, 'manual-repository'); const rule_id = 'pidex-global:pidex-implementer:quality'; const accepted = 'a'.repeat(40); const predecessor = 'b'.repeat(40); const predecessorBytes = Buffer.from('# canonical predecessor\n'); const content_hash = createHash('sha256').update(predecessorBytes).digest('hex'); const transaction_digest = 'd'.repeat(64); const receipt_digest = 'e'.repeat(64); const pathDigest = createHash('sha256').update('rules/pidex-implementer/quality.md').digest('hex');
  try {
    const sourceBytes = Buffer.from('{"slug":"quality","applicability":["implementation"],"instruction":"Validate contract.","trigger":"Before handoff.","expected_evidence":"Focused checks pass.","failure_behavior":"Defer publication.","rationale":"Repeated safe support."}\n');
    mkdirSync(path.join(repository, 'rules/pidex-implementer'), { recursive: true });
    writeFileSync(path.join(repository, 'rules/pidex-implementer/quality.md'), sourceBytes);
    materializeVerifiedMirror({ stateRoot, repository, scope_id: '', accepted_head: accepted, member: { rule_id, path: 'rules/pidex-implementer/quality.md', content_hash, bytes: predecessorBytes } });
    const head = { head_kind: 'accepted_remote', repository_identity: repository, accepted_remote_head: accepted, baseline_parent_commit: predecessor, manifest_digest: null, tree_digest: 'f'.repeat(64), seeded_at: null, verified_at: '2026-08-14T00:00:00.000Z', remote_checked_at: '2026-08-14T00:00:00.000Z', freshness: 'exact_head' };
    store.replaceProjection({ repository, accepted_head: accepted, head, entries: [{ rule_id, rule_version: content_hash, content_hash, accepted_commit: accepted, tier: 'global', lifecycle_state: 'active' }] });
    const projection = store.readProjection({ repository }); const entry = projection.entries[0];
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    const paths = JSON.stringify(['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md']);
    const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'f'.repeat(64), scope_id: 'pidex-global', rule_id, predecessor_commit: predecessor, accepted_commit: accepted, tree_digest: 'f'.repeat(64), content_hash, admission_digest: '1'.repeat(64), transaction_digest, lifecycle_state: 'active' };
    const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
    const exactReceiptDigest = createHash('sha256').update(canonical(receipt)).digest('hex');
    const tx = `tx:${transaction_digest}`; const payload = { accepted_commit: accepted, containing_head: accepted, member: { rule_id, path: 'rules/pidex-implementer/quality.md', content_hash }, target_epoch: { repository_digest: createHash('sha256').update(repository).digest('hex'), scope_id: 'pidex-global', rule_id, rule_version: content_hash, activation_epoch: entry.activation_epoch } };
    db.prepare('INSERT INTO publication_enrollment (repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,predecessor) VALUES (?,?,?,?,?,?)').run(repository, '', rule_id, '9'.repeat(64), paths, `commit:${predecessor}`);
    db.prepare('INSERT INTO publication_transaction (idempotency_key,repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,expected_base,candidate_digest,candidate_bytes,admission_digest,admission_bytes,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(tx, repository, '', rule_id, '9'.repeat(64), paths, predecessor, '2'.repeat(64), Buffer.from('{}'), '1'.repeat(64), Buffer.from('{}'), 'accepted_remote', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z');
    db.prepare('INSERT INTO publication_accepted_receipt (idempotency_key,receipt_digest,receipt_json) VALUES (?,?,?)').run(tx, exactReceiptDigest, canonical(receipt));
    db.prepare('INSERT INTO publication_handoff_stage_current (receipt_digest,transaction_digest,stage,payload_digest,payload_json,updated_at) VALUES (?,?,?,?,?,?)').run(exactReceiptDigest, transaction_digest, 'status_ready', createHash('sha256').update(canonical(payload)).digest('hex'), canonical(payload), '2026-08-14T00:00:00.000Z');
    db.close();
    const created = store.createManualRefinementRequest({ rule_id, receipt_digest: exactReceiptDigest, request_nonce: 'request:manual-002', now: '2026-08-14T00:00:00.000Z' });
    assert.deepEqual(created, { status: 'open', request_id: `manual-refinement:${createHash('sha256').update(`pidex-manual-refinement-request-v1\0${rule_id}\0request:manual-002`).digest('hex')}`, request_digest: createHash('sha256').update(`pidex-manual-refinement-request-v1\0${rule_id}\0request:manual-002`).digest('hex'), request_capability: createHash('sha256').update(`pidex-manual-refinement-request-capability-v1\0${rule_id}\0${exactReceiptDigest}\0request:manual-002`).digest('hex'), rule_id, scope_id: 'pidex-global', path_digest: pathDigest, current_content_digest: content_hash, expires_at: '2026-08-14T00:05:00.000Z' });
    const liveExpiry = new Date(Date.now() + 60_000).toISOString();
    const live = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); live.prepare('UPDATE manual_refinement_request SET expires_at = ? WHERE request_id = ?').run(liveExpiry, created.request_id); live.close();
    const capability = store.mintManualRefinementCapability({ request_capability: created.request_capability });
    assert.deepEqual(readManualRefinementRequestFacts({ capability }), {
      request_id: created.request_id, request_digest: created.request_digest, rule_id, scope_id: 'pidex-global', tier: 'global', path_digest: pathDigest, current_content_digest: content_hash, predecessor_commit: predecessor, accepted_commit: accepted, expires_at: liveExpiry,
    });
    const request = readManualRefinementRequestFacts({ capability });
    const reader_capability = createManualRefinementReader({ request_capability: capability });
    assert.deepEqual(readManualRefinementEnvelope({ reader_capability, request }), { envelope: { slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }, source_digest: createHash('sha256').update(sourceBytes).digest('hex') });
    assert.equal(readManualRefinementRequestFacts({ capability: Object.freeze({}) }), null);
    assert.doesNotMatch(JSON.stringify(readManualRefinementRequestFacts({ capability })), /private\/manual-repository|rules\/pidex-implementer/);
    const verify = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); verify.prepare('DELETE FROM publication_enrollment WHERE repository = ?').run(repository); verify.close();
    assert.equal(readManualRefinementRequestFacts({ capability }), null);
    assert.throws(() => store.createManualRefinementRequest({ rule_id, receipt_digest: exactReceiptDigest, request_nonce: 'request:manual-003', now: '2026-08-14T00:00:00.000Z' }), /RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE/);
  } finally {
    store.close();
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('manual opaque POSIX reader rejects same-inode mutations after selection and returns detached stable content', () => {
  const sourcePath = (fixture) => path.join(fixture.repository, 'rules/pidex-implementer/quality.md');
  const changed = (fixture, rationale) => Buffer.from(fixture.sourceBytes.toString('utf8').replace('Repeated safe support.', rationale), 'utf8');
  const read = (fixture) => readManualRefinementEnvelope({ reader_capability: fixture.reader_capability, request: readManualRefinementRequestFacts({ capability: fixture.request_capability }) });
  const withReadMutation = (fixture, timing, mutate, allowWindowsSharingDenial = false) => {
    const nativeRead = fs.readSync; let sourceRead = false; let changedSource = false; let mutationError;
    const attemptMutation = () => { changedSource = true; try { mutate(); } catch (error) { mutationError = error; throw error; } };
    fs.readSync = (...args) => {
      const result = nativeRead(...args); const [, , , length, position] = args;
      if (!changedSource && position === 0 && length === fixture.sourceBytes.length) {
        sourceRead = true;
        if (timing === 'after-first-read') attemptMutation();
      } else if (!changedSource && timing === 'between-predecessor-and-final' && sourceRead && position === 0 && length === fixture.predecessorBytes.length) attemptMutation();
      return result;
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => read(fixture), /RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE/, timing);
      assert.equal(changedSource, true, `${timing} mutation reached real fd read`);
      if (mutationError && !(allowWindowsSharingDenial && process.platform === 'win32' && ['EPERM', 'EACCES'].includes(mutationError.code))) throw mutationError;
    } finally { fs.readSync = nativeRead; syncBuiltinESMExports(); }
  };
  const cleanup = (fixture) => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); };
  for (const [name, timing, mutate] of [
    ['same-size overwrite after first fd read', 'after-first-read', (fixture) => writeFileSync(sourcePath(fixture), changed(fixture, 'Mutation contract.'))],
    ['truncate after first fd read', 'after-first-read', (fixture) => writeFileSync(sourcePath(fixture), changed(fixture, 'Short.'))],
    ['extend after first fd read', 'after-first-read', (fixture) => writeFileSync(sourcePath(fixture), changed(fixture, 'Repeated safe support with extension.'))],
    ['same-size overwrite between predecessor and final fd read', 'between-predecessor-and-final', (fixture) => writeFileSync(sourcePath(fixture), changed(fixture, 'Mutation contract.'))],
  ]) {
    const fixture = manualIntakeE2EFixture();
    try { withReadMutation(fixture, timing, () => mutate(fixture)); } finally { cleanup(fixture); }
  }
  let fixture = manualIntakeE2EFixture();
  try {
    const beforeFirstRead = changed(fixture, 'Mutation contract.'); writeFileSync(sourcePath(fixture), beforeFirstRead);
    assert.equal(read(fixture).source_digest, createHash('sha256').update(beforeFirstRead).digest('hex'), 'before first read selects stable current bytes');
  } finally { cleanup(fixture); }
  fixture = manualIntakeE2EFixture();
  try {
    const mtimeBefore = read(fixture); utimesSync(sourcePath(fixture), new Date(), new Date());
    const mtimeAfter = read(fixture);
    assert.deepEqual(mtimeAfter, mtimeBefore, 'mtime-only change with equal bytes remains valid');
    writeFileSync(sourcePath(fixture), changed(fixture, 'Mutation contract.'));
    assert.deepEqual(mtimeBefore, { envelope: { slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }, source_digest: createHash('sha256').update(fixture.sourceBytes).digest('hex') }, 'returned content remains detached from later source mutation');
  } finally { cleanup(fixture); }
  fixture = manualIntakeE2EFixture();
  try {
    const replacement = `${sourcePath(fixture)}.replacement`; writeFileSync(replacement, changed(fixture, 'Mutation contract.'));
    withReadMutation(fixture, 'after-first-read', () => renameSync(replacement, sourcePath(fixture)), true);
  } finally { cleanup(fixture); }
  assert.doesNotMatch(readFileSync(new URL('./rule-manual-import.mjs', import.meta.url), 'utf8'), /\b(?:appendFile|rename|truncate|unlink|writeFile)Sync?\b/, 'opaque importer has no filesystem write capability');
});

test('manual opaque Windows reader accepts lossless identities and fails closed on zero identity', () => {
  const fixture = manualIntakeE2EFixture(); const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform'); const nativeLstat = fs.lstatSync; const nativeFstat = fs.fstatSync; let bigintPath = false; let bigintHandle = false;
  const read = () => readManualRefinementEnvelope({ reader_capability: fixture.reader_capability, request: readManualRefinementRequestFacts({ capability: fixture.request_capability }) });
  try {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
    fs.lstatSync = (...args) => { bigintPath ||= args[1]?.bigint === true; return nativeLstat(...args); };
    fs.fstatSync = (...args) => { bigintHandle ||= args[1]?.bigint === true; return nativeFstat(...args); };
    syncBuiltinESMExports();
    assert.equal(read().source_digest, createHash('sha256').update(fixture.sourceBytes).digest('hex'), 'stable Windows identity accepts same-handle bytes');
    assert.equal(bigintPath && bigintHandle, true, 'path and handle identities are acquired losslessly for large Windows file IDs');
    fs.lstatSync = (...args) => { const stat = nativeLstat(...args); return { ...stat, dev: 0 }; }; syncBuiltinESMExports();
    assert.throws(read, /RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE/, 'zero Windows volume identity fails closed');
  } finally {
    fs.lstatSync = nativeLstat; fs.fstatSync = nativeFstat; syncBuiltinESMExports(); Object.defineProperty(process, 'platform', originalPlatform); fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true });
  }
});

test('PLAN047 manual worker intake race', async () => {
  const fixture = manualIntakeE2EFixture();
  const candidate = buildRuleLearningCandidate({ support: fixture.support, findings: fixture.findings, authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: () => ({ slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }) });
  const source_digest = createHash('sha256').update(fixture.sourceBytes).digest('hex'); const signal = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2); const shared = new Int32Array(signal);
  const workerSource = `const { parentPort, workerData } = require('node:worker_threads'); (async () => { const { openRuleLifecycleStore } = await import(workerData.storeModule); const { createManualRefinementReader } = await import(workerData.importModule); const retry = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); let store; for (let attempt = 0; attempt < 4; attempt += 1) { try { store = openRuleLifecycleStore({ stateRoot: workerData.stateRoot, learningAuthority: workerData.authority }); break; } catch (error) { if (error.message !== 'RULE_LIFECYCLE_STORAGE_UNAVAILABLE' || attempt === 3) throw error; await retry((attempt + 1) * 10); } } try { const request_capability = store.mintManualRefinementCapability({ request_capability: workerData.request_capability }); const enrollment_authority = store.mintRuleLearningEnrollmentAuthority(); const attestation = store.mintManualCandidateAttestation({ request_capability, enrollment_authority, support: workerData.support, findings: workerData.findings, candidate: workerData.candidate, candidate_bytes: Buffer.from(workerData.candidate_bytes), source_digest: workerData.source_digest, now: workerData.now }); Atomics.add(new Int32Array(workerData.signal), 0, 1); Atomics.notify(new Int32Array(workerData.signal), 0); Atomics.wait(new Int32Array(workerData.signal), 1, 0); const output = store.recordManualRefinementCandidate({ capability: request_capability, attestation, source_digest: workerData.source_digest, candidate_digest: workerData.candidate.candidate_digest, candidate_bytes: Buffer.from(workerData.candidate_bytes), candidate: workerData.candidate, now: workerData.now }); parentPort.postMessage({ status: output.status }); } catch (error) { parentPort.postMessage({ error: error.message }); } finally { store?.close(); } })();`;
  try {
    assert.equal(candidate.status, 'candidate');
    const runWorker = () => new Promise((resolve, reject) => { const worker = new Worker(workerSource, { eval: true, workerData: { storeModule: new URL('./rule-lifecycle-store.mjs', import.meta.url).href, importModule: new URL('./rule-manual-import.mjs', import.meta.url).href, stateRoot: fixture.stateRoot, authority: fixture.authority, request_id: fixture.request.request_id, request_capability: fixture.request.request_capability, support: fixture.support, findings: fixture.findings, candidate: candidate.candidate, candidate_bytes: candidate.bytes, source_digest, now: '2026-08-14T00:00:00.000Z', signal } }); worker.once('message', resolve); worker.once('error', reject); worker.once('exit', (code) => { if (code !== 0) reject(new Error(`worker exited ${code}`)); }); });
    const workers = [runWorker(), runWorker()]; while (Atomics.load(shared, 0) !== 2) Atomics.wait(shared, 0, Atomics.load(shared, 0), 1000); Atomics.store(shared, 1, 1); Atomics.notify(shared, 1, 2);
    const outputs = await Promise.all(workers); assert.deepEqual(outputs.map((output) => output.status).sort(), ['existing', 'imported']);
    const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); const row = db.prepare('SELECT candidate_bytes FROM manual_refinement_request WHERE request_id = ?').get(fixture.request.request_id); const imported = db.prepare("SELECT COUNT(*) AS count FROM manual_refinement_request_event WHERE request_id = ? AND status = 'imported'").get(fixture.request.request_id).count; db.close();
    assert.ok(Buffer.from(row.candidate_bytes).equals(Buffer.from(candidate.bytes))); assert.equal(imported, 1);
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('PLAN047 manual intake admission matrix', () => {
  const cleanup = (fixture) => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); };
  const imported = (fixture) => { const output = importManualRefinementCandidate(fixture.input()); assert.equal(output.status, 'imported'); const intake = readManualRefinementIntake({ intake_capability: output.intake_capability }); assert.ok(intake); return { output, intake }; };
  const votes = (intake, reviewers, change = (vote) => vote) => reviewers.map((reviewer) => change({ schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: intake.candidate_digest, candidate_content_hash: intake.candidate.content_hash, admission_policy_digest: intake.candidate.admission_policy_digest, admission_policy_version: intake.candidate.admission_policy_version, tier: intake.candidate.tier, repository_scope_digest: intake.candidate.scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend, provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`, nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept' }));
  const zeroImported = (fixture) => { const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); const count = db.prepare("SELECT COUNT(*) AS count FROM manual_refinement_request_event WHERE request_id = ? AND status = 'imported'").get(fixture.request.request_id).count; db.close(); assert.equal(count, 0); };
  let fixture = manualIntakeE2EFixture();
  try {
    const { output, intake } = imported(fixture); const global = votes(intake, fixture.authority.reviewers.principals); const accepted = admitManualRefinementIntake({ store: fixture.store, intake_capability: output.intake_capability, votes: global, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() });
    assert.equal(accepted.status, 'admitted'); assert.equal(intake.candidate_digest, output.candidate_digest); assert.equal(createHash('sha256').update(intake.candidate_bytes).digest('hex'), intake.candidate_bytes_digest); assert.equal(JSON.stringify(accepted.admission), JSON.stringify({ schema_version: 'pidex-living-rule-admission-v1', candidate_digest: intake.candidate_digest, candidate_content_hash: intake.candidate.content_hash, admission_policy_digest: intake.candidate.admission_policy_digest, admission_policy_version: intake.candidate.admission_policy_version, tier: 'global', repository_scope_digest: intake.candidate.scope_digest, vote_digests: accepted.admission.vote_digests })); assert.equal(admitManualRefinementIntake({ store: fixture.store, intake_capability: output.intake_capability, votes: global, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).status, 'admitted', 'exact result retry returns durable admission');
  } finally { cleanup(fixture); }
  for (const [name, change] of [['disagree', (vote) => ({ ...vote, decision: 'reject' })], ['abstain', (vote) => ({ ...vote, decision: 'abstain' })], ['stale', (vote) => ({ ...vote, expires_at: '2026-08-13T01:00:00.000Z' })], ['generator reviewer', (vote) => ({ ...vote, reviewer_principal: 'generator:configured' })]]) {
    fixture = manualIntakeE2EFixture(); try { const { output, intake } = imported(fixture); for (let index = 0; index < 3; index += 1) { const changed = votes(intake, fixture.authority.reviewers.principals, (vote) => vote.reviewer_principal === fixture.authority.reviewers.principals[index].principal ? change(vote) : vote); assert.equal(admitManualRefinementIntake({ store: fixture.store, intake_capability: output.intake_capability, votes: changed, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).status, 'deferred', `${name}:${index}`); } } finally { cleanup(fixture); }
  }
  fixture = manualIntakeE2EFixture(); const foreign = manualIntakeE2EFixture();
  try { const local = imported(fixture); const other = imported(foreign); const global = votes(local.intake, fixture.authority.reviewers.principals); assert.equal(admitManualRefinementIntake({ intake_capability: Object.freeze({}), votes: global, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).status, 'deferred', 'forged intake'); assert.equal(admitManualRefinementIntake({ intake_capability: other.output.intake_capability, votes: global, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).status, 'deferred', 'cross-store intake'); assert.equal(admitManualRefinementIntake({ intake_capability: local.output.intake_capability, votes: global, reviewer_authority: foreign.store.mintRuleLearningReviewerAuthority() }).status, 'deferred', 'cross-store reviewer'); } finally { cleanup(fixture); cleanup(foreign); }
  fixture = manualIntakeE2EFixture();
  try { const candidate = buildRuleLearningCandidate({ support: fixture.support, findings: fixture.findings, authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: () => ({ slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }) }); const source_digest = createHash('sha256').update(fixture.sourceBytes).digest('hex'); const attestation = fixture.store.mintManualCandidateAttestation({ request_capability: fixture.request_capability, enrollment_authority: fixture.store.mintRuleLearningEnrollmentAuthority(), support: fixture.support, findings: fixture.findings, candidate: candidate.candidate, candidate_bytes: Buffer.from(candidate.bytes), source_digest, now: '2026-08-14T00:00:00.000Z' }); assert.throws(() => fixture.store.recordManualRefinementCandidate({ capability: fixture.request_capability, attestation, source_digest, candidate_digest: candidate.digest, candidate_bytes: Buffer.from(`${candidate.bytes}x`), candidate: candidate.candidate, now: '2026-08-14T00:00:00.000Z' }), /RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE/); zeroImported(fixture); } finally { cleanup(fixture); }
  for (const [name, mutate] of [['predecessor', (db, f) => db.prepare('UPDATE publication_enrollment SET predecessor = ? WHERE repository = ?').run(`commit:${'0'.repeat(40)}`, f.repository)], ['TX state', (db) => db.prepare("UPDATE publication_transaction SET state = 'prepared'").run()], ['stage payload digest', (db) => db.prepare('UPDATE publication_handoff_stage_current SET payload_digest = ?').run('0'.repeat(64))], ['projection head/content/state', (db) => db.prepare('UPDATE effective_projection SET accepted_head = ?, entries_json = ?').run('0'.repeat(40), '[]')], ['epoch delete', (db) => db.exec('DELETE FROM activation_epoch')], ['epoch close', (db) => db.exec("UPDATE activation_epoch SET closed_at = '2026-08-14T00:00:00.000Z'")], ['stop', (_, f) => f.store.setLocalRuleStop({ repository: f.repository, scope_id: 'pidex-global', rule_id: f.rule_id, reason_code: 'manual_stop' })], ['expiry', (db, f) => db.prepare("UPDATE manual_refinement_request SET expires_at = '2026-08-13T00:00:00.000Z' WHERE request_id = ?").run(f.request.request_id)]]) {
    fixture = manualIntakeE2EFixture(); try { const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); mutate(db, fixture); db.close(); assert.throws(() => importManualRefinementCandidate(fixture.input()), /RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE/, name); zeroImported(fixture); } finally { cleanup(fixture); }
  }
  fixture = manualIntakeE2EFixture();
  try { const support = createRuleLearningSupport({ schema_version: 'pidex-rule-learning-support-v1', tier: 'project', taxonomy: fixture.support.taxonomy, affected_agent: fixture.support.affected_agent, affected_phase: fixture.support.affected_phase, recurrence_key: 'quality:validation-missing', lesson_code: lessonCode({ taxonomy: fixture.support.taxonomy, affected_agent: fixture.support.affected_agent, affected_phase: fixture.support.affected_phase, recurrence_key: 'quality:validation-missing' }), occurrence_count: 1, scope_count: 1, finding_digests: [findingDigest(fixture.findings[0])] }); const built = buildRuleLearningCandidate({ support, findings: [fixture.findings[0]], authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: () => ({ slug: 'quality', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.' }) }); assert.equal(built.status, 'candidate', JSON.stringify(built)); const context = prepareSemanticReviewContext({ candidate: built.candidate }); const result = admitRuleLearningCandidate({ candidate: built.candidate, context, votes: votes({ ...built.candidate, candidate: built.candidate }, fixture.authority.reviewers.principals.slice(0, 2)), reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }); assert.equal(result.status, 'admitted', JSON.stringify(result)); } finally { cleanup(fixture); }
});

test('manual admission persists private canonical TX-01 authority and derives ordinary publication target', () => {
  const fixture = manualIntakeE2EFixture();
  try {
    const imported = importManualRefinementCandidate(fixture.input());
    const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability });
    const context = prepareSemanticReviewContext({ candidate: intake.candidate });
    const votes = fixture.authority.reviewers.principals.map((reviewer) => ({
      schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: context.candidate_digest, candidate_content_hash: context.candidate_content_hash,
      admission_policy_digest: context.admission_policy_digest, admission_policy_version: context.admission_policy_version, tier: context.tier,
      repository_scope_digest: context.repository_scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend,
      provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`,
      nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept',
    }));
    const admitted = admitManualRefinementIntake({ store: fixture.store, intake_capability: imported.intake_capability, votes, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() });
    assert.equal(admitted.status, 'admitted', JSON.stringify(admitted));
    const admission = readManualRefinementAdmission({ admission_capability: admitted.admission_capability });
    assert.ok(admission); assert.equal(admission.candidate_digest, imported.candidate_digest); assert.match(admission.admission_digest, /^[a-f0-9]{64}$/); assert.ok(admission.candidate_bytes.equals(intake.candidate_bytes)); assert.equal(JSON.parse(admission.admission_bytes).votes, undefined);
    const target = readManualPublicationTarget({ admission_capability: admitted.admission_capability });
    assert.deepEqual(target, { repository: fixture.repository, tier: 'global', scope_id: 'pidex-global', scope_digest: intake.candidate.scope_digest, rule_id: fixture.rule_id, predecessor: `commit:${'b'.repeat(40)}`, enrollment_digest: fixture.authority.enrollment.targets.global.authority_digest, allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md'], writer_authority: fixture.authority.enrollment.targets.global.writer_authority });
    const prepared = prepareManualRefinementTransaction({ store: fixture.store, admission_capability: admitted.admission_capability, now: '2026-08-14T00:00:00.000Z' });
    assert.deepEqual(prepared, { status: 'prepared', state: 'prepared', idempotency_key: prepared.idempotency_key, scope_id: 'pidex-global' });
    const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); assert.equal(db.prepare('SELECT transaction_id FROM manual_refinement_admission_result').get().transaction_id, prepared.idempotency_key, 'TX-01 binds durable manual admission atomically'); db.close();
    assert.equal(prepareManualRefinementTransaction({ store: fixture.store, admission_capability: admitted.admission_capability, now: '2026-08-14T00:00:00.000Z' }).status, 'existing');
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('manual durable admission recovers only same manual intent after each crash boundary', () => {
  const cleanup = (fixture) => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); };
  const input = (fixture) => importManualRefinementCandidate(fixture.input());
  const exactVotes = (fixture, intake) => fixture.authority.reviewers.principals.map((reviewer) => ({
    schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: intake.candidate_digest, candidate_content_hash: intake.candidate.content_hash,
    admission_policy_digest: intake.candidate.admission_policy_digest, admission_policy_version: intake.candidate.admission_policy_version, tier: intake.candidate.tier,
    repository_scope_digest: intake.candidate.scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend,
    provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`,
    nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept',
  }));
  const admit = (fixture, intake_capability, votes, fault) => admitManualRefinementIntake({ store: fixture.store, intake_capability, votes, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority(), fault });
  for (const checkpoint of ['before_intent', 'after_intent']) {
    const fixture = manualIntakeE2EFixture();
    try {
      const imported = input(fixture); const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability }); const votes = exactVotes(fixture, intake);
      assert.equal(admit(fixture, imported.intake_capability, votes, (point) => { if (point === checkpoint) throw new Error('crash'); }).status, 'deferred', checkpoint);
      assert.equal(admit(fixture, imported.intake_capability, votes).status, 'admitted', `${checkpoint} retry claims normally`);
    } finally { cleanup(fixture); }
  }
  for (const checkpoint of ['after_claim', 'after_result']) {
    const fixture = manualIntakeE2EFixture();
    try {
      const imported = input(fixture); const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability }); const votes = exactVotes(fixture, intake);
      assert.equal(admit(fixture, imported.intake_capability, votes, (point) => { if (point === checkpoint) throw new Error('crash'); }).status, 'deferred', checkpoint);
      if (checkpoint === 'after_claim') {
        const context = prepareSemanticReviewContext({ candidate: intake.candidate });
        assert.equal(admitRuleLearningCandidate({ candidate: intake.candidate, context, votes, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).status, 'deferred', 'generic vote replay stays unavailable');
        assert.equal(admit(fixture, imported.intake_capability, exactVotes(fixture, intake, (vote) => vote)).status, 'admitted', 'same manual intent reconciles claimed votes');
      } else {
        const retry = admit(fixture, imported.intake_capability, votes);
        assert.equal(retry.status, 'admitted', JSON.stringify(retry));
        assert.ok(retry.admission_capability, 'exact result retry returns opaque cap');
      }
    } finally { cleanup(fixture); }
  }
});

test('6B1A full vote intent rejects altered decision after durable claim and exposes no raw votes', () => {
  const fixture = manualIntakeE2EFixture();
  const votesFor = (intake, decision = 'accept') => fixture.authority.reviewers.principals.map((reviewer) => ({
    schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: intake.candidate_digest, candidate_content_hash: intake.candidate.content_hash,
    admission_policy_digest: intake.candidate.admission_policy_digest, admission_policy_version: intake.candidate.admission_policy_version, tier: intake.candidate.tier,
    repository_scope_digest: intake.candidate.scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend,
    provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`,
    nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision,
  }));
  try {
    const imported = importManualRefinementCandidate(fixture.input()); const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability }); const accepted = votesFor(intake);
    assert.equal(admitManualRefinementIntake({ store: fixture.store, intake_capability: imported.intake_capability, votes: accepted, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority(), fault: (point) => { if (point === 'after_claim') throw new Error('crash'); } }).status, 'deferred');
    const altered = [...accepted]; altered[0] = { ...altered[0], decision: 'reject' };
    assert.equal(admitManualRefinementIntake({ store: fixture.store, intake_capability: imported.intake_capability, votes: altered, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).status, 'deferred', 'decision binds exact manual retry');
    const admitted = admitManualRefinementIntake({ store: fixture.store, intake_capability: imported.intake_capability, votes: accepted, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() });
    assert.deepEqual(Object.keys(admitted).sort(), ['admission', 'admission_capability', 'status']);
    assert.equal(admitted.admission.votes, undefined);
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('6B1A remints durable manual intake across reopen at intent, claim, and result boundaries', () => {
  const fixture = manualIntakeE2EFixture(); let store = fixture.store;
  const votesFor = (intake) => fixture.authority.reviewers.principals.map((reviewer) => ({
    schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: intake.candidate_digest, candidate_content_hash: intake.candidate.content_hash,
    admission_policy_digest: intake.candidate.admission_policy_digest, admission_policy_version: intake.candidate.admission_policy_version, tier: intake.candidate.tier,
    repository_scope_digest: intake.candidate.scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend,
    provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`,
    nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept',
  }));
  const reopen = (request_id, intake_digest) => { store.close(); store = openRuleLifecycleStore({ stateRoot: fixture.stateRoot, learningAuthority: fixture.authority }); return store.remintManualRefinementIntakeCapability({ request_capability: fixture.request.request_capability, request_id, intake_digest }); };
  try {
    const imported = importManualRefinementCandidate(fixture.input()); const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability }); const accepted = votesFor(intake);
    assert.equal(admitManualRefinementIntake({ store, intake_capability: imported.intake_capability, votes: accepted, reviewer_authority: store.mintRuleLearningReviewerAuthority(), fault: (point) => { if (point === 'after_intent') throw new Error('crash'); } }).status, 'deferred');
    let intake_capability = reopen(fixture.request.request_id, intake.intake_digest);
    assert.equal(admitManualRefinementIntake({ store, intake_capability, votes: accepted, reviewer_authority: store.mintRuleLearningReviewerAuthority(), fault: (point) => { if (point === 'after_claim') throw new Error('crash'); } }).status, 'deferred');
    intake_capability = reopen(fixture.request.request_id, intake.intake_digest);
    assert.equal(admitManualRefinementIntake({ store, intake_capability, votes: accepted, reviewer_authority: store.mintRuleLearningReviewerAuthority(), fault: (point) => { if (point === 'after_result') throw new Error('crash'); } }).status, 'deferred');
    intake_capability = reopen(fixture.request.request_id, intake.intake_digest);
    const admitted = admitManualRefinementIntake({ store, intake_capability, votes: accepted, reviewer_authority: store.mintRuleLearningReviewerAuthority() });
    assert.equal(admitted.status, 'admitted'); assert.ok(admitted.admission_capability);
    const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM manual_refinement_admission_result').get().count, 1); assert.equal(db.prepare("SELECT COUNT(*) AS count FROM manual_refinement_request_event WHERE status = 'admitted'").get().count, 1); db.close();
  } finally { store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('PLAN047 project manual intake admits exactly two reviewers into ordinary TX-01', () => {
  const fixture = manualIntakeE2EFixture({ tier: 'project' }); let store = fixture.store;
  const vote = (intake, reviewer) => ({
    schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: intake.candidate_digest, candidate_content_hash: intake.candidate.content_hash,
    admission_policy_digest: intake.candidate.admission_policy_digest, admission_policy_version: intake.candidate.admission_policy_version, tier: intake.candidate.tier,
    repository_scope_digest: intake.candidate.scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend,
    provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`,
    nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept',
  });
  try {
    const projectScope = '1'.repeat(24); const projectRule = `project:${projectScope}:pidex-implementer:quality`; const projectPath = 'pidex/rules/managed/pidex-implementer/quality.md'; const projectIndex = 'pidex/rules/managed/pidex-implementer/index.md';
    assert.equal(fixture.rule_id, projectRule);
    assert.equal(fixture.request.scope_id, projectScope, 'external project scope stays concrete'); assert.equal(fixture.scope, projectScope, 'internal project scope maps identically');
    assert.ok(readVerifiedMirrorMember({ stateRoot: fixture.stateRoot, repository: fixture.repository, scope_id: fixture.scope, accepted_commit: fixture.accepted, path: projectPath, content_hash: fixture.content_hash }).equals(fixture.predecessorBytes));
    assert.ok(readVerifiedMirrorMember({ stateRoot: fixture.stateRoot, repository: fixture.repository, scope_id: fixture.scope, accepted_commit: fixture.accepted, path: projectIndex, content_hash: fixture.indexHash }).equals(fixture.indexBytes));
    assert.equal(fixture.support.tier, 'project'); assert.equal(fixture.support.occurrence_count, 1); assert.equal(fixture.support.scope_count, 1); assert.equal(fixture.findings.length, 1);
    const imported = importManualRefinementCandidate(fixture.input()); const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability }); assert.ok(intake);
    assert.equal(intake.candidate.tier, 'project'); assert.equal(intake.candidate.rule_id, projectRule);
    const configured = fixture.authority.reviewers.principals; const accepted = configured.slice(0, 2).map((reviewer) => vote(intake, reviewer));
    const reviewerAuthority = () => store.mintRuleLearningReviewerAuthority();
    assert.equal(admitManualRefinementIntake({ store, intake_capability: imported.intake_capability, votes: configured.map((reviewer) => vote(intake, reviewer)), reviewer_authority: reviewerAuthority() }).status, 'deferred', 'third reviewer defers');
    assert.equal(admitManualRefinementIntake({ store, intake_capability: imported.intake_capability, votes: accepted.slice(0, 1), reviewer_authority: reviewerAuthority() }).status, 'deferred', 'missing reviewer defers');
    assert.equal(admitManualRefinementIntake({ store, intake_capability: imported.intake_capability, votes: [accepted[0], { ...accepted[1], reviewer_principal: 'reviewer:foreign', backend_identity: 'backend:foreign', attempt_id: 'attempt:foreign', nonce: 'nonce:foreign' }], reviewer_authority: reviewerAuthority() }).status, 'deferred', 'foreign reviewer defers');
    const admitted = admitManualRefinementIntake({ store, intake_capability: imported.intake_capability, votes: accepted, reviewer_authority: reviewerAuthority() }); assert.equal(admitted.status, 'admitted');
    const target = readManualPublicationTarget({ admission_capability: admitted.admission_capability });
    assert.deepEqual(target.allowed_paths, [projectIndex, projectPath]); assert.equal(target.scope_id, projectScope); assert.equal(target.rule_id, projectRule); assert.ok(!target.allowed_paths.includes('config/rule-baseline-manifest.json'));
    assert.equal(prepareManualRefinementTransaction({ store, admission_capability: admitted.admission_capability, now: '2026-08-14T00:00:00.000Z' }).scope_id, projectScope);
    const db = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); assert.equal(db.prepare("SELECT stage FROM publication_handoff_stage_current").get().stage, 'status_ready'); assert.equal(db.prepare('SELECT scope_id FROM publication_transaction WHERE idempotency_key LIKE ?').get('tx:%').scope_id, projectScope); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM manual_refinement_admission_intent').get().count, 1); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM manual_refinement_admission_result').get().count, 1); db.close();
    store.close(); store = openRuleLifecycleStore({ stateRoot: fixture.stateRoot, learningAuthority: fixture.authority }); const reopened = store.remintManualRefinementIntakeCapability({ request_capability: fixture.request.request_capability, request_id: fixture.request.request_id, intake_digest: intake.intake_digest });
    const reopenedAdmission = admitManualRefinementIntake({ store, intake_capability: reopened, votes: accepted, reviewer_authority: reviewerAuthority() }); assert.equal(reopenedAdmission.status, 'admitted', 'reopen exact'); assert.equal(prepareManualRefinementTransaction({ store, admission_capability: reopenedAdmission.admission_capability, now: '2026-08-14T00:00:00.000Z' }).status, 'existing', 'reopen preserves ordinary project TX-01');
  } finally { store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});

test('PLAN047 manual publication composes global/project admission through shared writer and status handoff without source mutation', async () => {
  const now = '2026-08-14T00:00:00.000Z';
  const admit = (fixture) => {
    const imported = importManualRefinementCandidate(fixture.input()); const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability });
    const context = prepareSemanticReviewContext({ candidate: intake.candidate }); const reviewers = fixture.authority.reviewers.principals.slice(0, intake.candidate.tier === 'global' ? 3 : 2);
    const votes = reviewers.map((reviewer) => ({ schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: context.candidate_digest, candidate_content_hash: context.candidate_content_hash, admission_policy_digest: context.admission_policy_digest, admission_policy_version: context.admission_policy_version, tier: context.tier, repository_scope_digest: context.repository_scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend, provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`, nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept' }));
    return admitManualRefinementIntake({ store: fixture.store, intake_capability: imported.intake_capability, votes, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).admission_capability;
  };
  const fakeSharedWriter = (fixture) => {
    const writes = new Map(); const commit = 'c'.repeat(40); const gitMethods = ['fetchExpected', 'remoteUrl', 'resolveHead', 'identitySnapshot', 'createIsolatedWorkspace', 'readCanonicalMembers', 'writeFileNoFollow', 'stage', 'stagedEntries', 'commit', 'fetchObserved', 'pushFastForward', 'postPushObserve', 'containsCommit', 'inspectCommit', 'cleanup'];
    const facts = () => fixture.store.readPublicationWriterFacts({ idempotency_key: fixture.transaction }); const snapshot = () => { const authority = facts().target.writer_authority; return { platform: authority.identity_platform, root_identity_digest: authority.root_identity_digest, parent_identity_digest: authority.parent_identity_digest, files_digest: authority.files_identity_digest, no_follow: true, links: false, hardlinks: false, reparse: false, case_safe: true, unicode_safe: true, supported: true, identity_proof: authority.identity_proof }; };
    const remote = () => { const authority = facts().target.writer_authority; return { head: facts().expected_base, remote_digest: authority.normalized_remote_digest, branch: authority.branch, repository: facts().target.repository }; };
    const git = Object.fromEntries(gitMethods.map((method) => [method, (input) => {
      if (method === 'fetchExpected' || method === 'fetchObserved') return remote(); if (method === 'postPushObserve') return { ...remote(), head: commit }; if (method === 'remoteUrl') { const value = remote(); return { remote_digest: value.remote_digest, branch: value.branch, repository: value.repository }; } if (method === 'resolveHead') return facts().expected_base; if (method === 'identitySnapshot') return snapshot(); if (method === 'createIsolatedWorkspace') return { id: 'manual-shared-writer', clean: true }; if (method === 'readCanonicalMembers') return facts().target.tier === 'global' ? [{ path: 'rules/pidex-implementer/index.md', bytes: Buffer.from('# PIDEX Implementer Rules\n\n| Rule | File | PROC-NEW | Summary |\n|------|------|----------|---------|\n') }, { path: 'config/rule-baseline-manifest.json', bytes: Buffer.from('{}') }] : [{ path: 'pidex/rules/managed/pidex-implementer/index.md', bytes: Buffer.from('# PIDEX Implementer Rules\n\n| Rule ID | File | State |\n|---|---|---|\n') }]; if (method === 'writeFileNoFollow') { writes.set(input.path, Buffer.from(input.bytes)); return; } if (method === 'stagedEntries') return [...writes].map(([memberPath, bytes]) => ({ path: memberPath, digest: createHash('sha256').update(bytes).digest('hex') })); if (method === 'commit') return { commit, parent: facts().expected_base, tree_digest: createHash('sha256').update('manual-shared-tree').digest('hex') }; if (method === 'containsCommit') return input.commit === commit && input.head === commit; if (method === 'inspectCommit') { const value = facts(); return { commit, parents: [value.expected_base], tree_digest: createHash('sha256').update('manual-shared-tree').digest('hex'), author: value.target.writer_authority.author, subject: `rules(${value.target.tier}): publish ${value.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': value.target.rule_id, 'PIDEX-Transaction-Digest': value.idempotency_key.slice(3), 'PIDEX-Admission-Digest': value.admission_digest, 'PIDEX-Predecessor': `commit:${value.expected_base}` }, staged_member_digests: Object.fromEntries([...writes].map(([memberPath, bytes]) => [memberPath, createHash('sha256').update(bytes).digest('hex')])) }; }
    }]));
    const descendant_adapter = { fetchEnrolledBranch: () => { const value = facts(); const entries = [{ commit_oid: commit, parent_oids: [value.expected_base], tree_oid: 'd'.repeat(40) }]; const tree = Buffer.from('manual-shared-tree'); return { repository_identity: value.target.writer_authority.repository_identity_digest, normalized_remote_digest: value.target.writer_authority.normalized_remote_digest, branch: value.target.writer_authority.branch, containing_head: commit, containing_tree_bytes: tree, containing_tree_digest: createHash('sha256').update(tree).digest('hex'), entries, predecessor_boundary: value.expected_base }; }, inspectCommit: () => { const value = facts(); return { commit_oid: commit, parent_oids: [value.expected_base], tree_oid: 'd'.repeat(40), author: value.target.writer_authority.author, subject: `rules(${value.target.tier}): publish ${value.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': value.target.rule_id, 'PIDEX-Transaction-Digest': value.idempotency_key.slice(3), 'PIDEX-Admission-Digest': value.admission_digest, 'PIDEX-Predecessor': `commit:${value.expected_base}` }, managed_members: Object.fromEntries(Object.entries(value.staged_member_digests).map(([memberPath, content_hash], index) => [memberPath, { blob_oid: (index + 1).toString(16).padStart(40, '0'), content_hash }])) }; } };
    return { writes, writer: git, receipt_git: (args) => writes.get(args.at(-1).slice(`${commit}:`.length)), descendant: descendant_adapter, lock: { acquire: () => ({ lease_id: 'manual-shared', repository: facts().target.repository, scope_id: facts().target.scope_id }), release: () => undefined } };
  };
  for (const tier of ['global', 'project']) {
    const fixture = manualIntakeE2EFixture({ tier });
    try {
      const source = path.join(fixture.repository, fixture.rulePath); const before = { bytes: readFileSync(source), stat: statSync(source) }; const admission_capability = admit(fixture); const prepared = prepareManualRefinementTransaction({ store: fixture.store, admission_capability, now }); fixture.transaction = prepared.idempotency_key; const shared = fakeSharedWriter(fixture);
      const output = await publishManualRefinement({ store: fixture.store, admission_capability, stateRoot: fixture.stateRoot, repository_root: '/manual-shared-fixture', adapters: { writer: shared.writer, receipt_git: shared.receipt_git, descendant: shared.descendant }, lock: shared.lock, durabilitySupported: true, durabilitySync: () => {}, now, fault: undefined });
      assert.deepEqual(output, { status: 'status_ready', transaction: fixture.transaction, receipt_digest: output.receipt_digest, stage: 'status_ready' }); assert.match(output.receipt_digest, /^[a-f0-9]{64}$/);
      const relation = new DatabaseSync(path.join(fixture.stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); assert.equal(relation.prepare('SELECT transaction_id FROM manual_refinement_admission_result').get().transaction_id, fixture.transaction); relation.close();
      const resumed = await resumeManualRefinementPublication({ store: fixture.store, idempotency_key: fixture.transaction, stateRoot: fixture.stateRoot, repository_root: '/manual-shared-fixture', adapters: { writer: shared.writer, receipt_git: shared.receipt_git, descendant: shared.descendant }, lock: shared.lock, durabilitySupported: true, durabilitySync: () => {}, now }); assert.equal(resumed.status, 'status_ready', 'durable manual TX resumes without admission capability');
      const facts = fixture.store.readPublicationWriterFacts({ idempotency_key: fixture.transaction }); assert.equal(facts.state, 'accepted_remote'); assert.equal(shared.writes.size, tier === 'global' ? 3 : 2); assert.equal(shared.writes.has(fixture.rulePath), true); assert.equal(shared.writes.has(fixture.indexPath), true); assert.equal(shared.writes.has('config/rule-baseline-manifest.json'), tier === 'global'); assert.doesNotMatch(JSON.stringify([...shared.writes.values()].map((value) => value.toString())), /manual(?:_|-)flag|manual publication/i); assert.equal(readFileSync(source).equals(before.bytes), true); const after = statSync(source); assert.equal(after.mtimeMs, before.stat.mtimeMs); assert.equal(after.size, before.stat.size);
    } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
  }
});

function manualPublicationAdmission(fixture) {
  const imported = importManualRefinementCandidate(fixture.input()); const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability }); const context = prepareSemanticReviewContext({ candidate: intake.candidate }); const reviewers = fixture.authority.reviewers.principals.slice(0, intake.candidate.tier === 'global' ? 3 : 2); const votes = reviewers.map((reviewer) => ({ schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: context.candidate_digest, candidate_content_hash: context.candidate_content_hash, admission_policy_digest: context.admission_policy_digest, admission_policy_version: context.admission_policy_version, tier: context.tier, repository_scope_digest: context.repository_scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend, provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`, nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept' }));
  return admitManualRefinementIntake({ store: fixture.store, intake_capability: imported.intake_capability, votes, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() }).admission_capability;
}
function manualPublicationAdapters(fixture, options = {}) {
  const writes = options.writes || new Map(); const effects = { commit: 0, push: 0 }; const commit = 'c'.repeat(40); const methods = ['fetchExpected', 'remoteUrl', 'resolveHead', 'identitySnapshot', 'createIsolatedWorkspace', 'readCanonicalMembers', 'writeFileNoFollow', 'stage', 'stagedEntries', 'commit', 'fetchObserved', 'pushFastForward', 'postPushObserve', 'containsCommit', 'inspectCommit', 'cleanup']; const facts = () => fixture.store.readPublicationWriterFacts({ idempotency_key: fixture.transaction }); const remote = () => { const value = facts(); return { head: options.remoteAdvance ? 'f'.repeat(40) : value.expected_base, remote_digest: value.target.writer_authority.normalized_remote_digest, branch: value.target.writer_authority.branch, repository: value.target.repository }; }; const snapshot = () => { const authority = facts().target.writer_authority; return { platform: authority.identity_platform, root_identity_digest: authority.root_identity_digest, parent_identity_digest: authority.parent_identity_digest, files_digest: authority.files_identity_digest, no_follow: true, links: false, hardlinks: false, reparse: false, case_safe: true, unicode_safe: true, supported: true, identity_proof: authority.identity_proof }; };
  const writer = Object.fromEntries(methods.map((method) => [method, (input) => { if (method === 'fetchExpected') return remote(); if (method === 'fetchObserved') { if (options.afterTx02) throw new Error('after-tx02'); return remote(); } if (method === 'postPushObserve') { if (options.postPushAmbiguity) throw new Error('postpush ambiguity'); return { ...remote(), head: commit }; } if (method === 'remoteUrl') { const value = remote(); return { remote_digest: value.remote_digest, branch: value.branch, repository: value.repository }; } if (method === 'resolveHead') return facts().expected_base; if (method === 'identitySnapshot') return snapshot(); if (method === 'createIsolatedWorkspace') return { id: 'manual-resume-writer', clean: true }; if (method === 'readCanonicalMembers') return facts().target.tier === 'global' ? [{ path: 'rules/pidex-implementer/index.md', bytes: Buffer.from('# PIDEX Implementer Rules\n\n| Rule | File | PROC-NEW | Summary |\n|------|------|----------|---------|\n') }, { path: 'config/rule-baseline-manifest.json', bytes: Buffer.from('{}') }] : [{ path: 'pidex/rules/managed/pidex-implementer/index.md', bytes: Buffer.from('# PIDEX Implementer Rules\n\n| Rule ID | File | State |\n|---|---|---|\n') }]; if (method === 'writeFileNoFollow') { writes.set(input.path, Buffer.from(input.bytes)); return; } if (method === 'stagedEntries') return [...writes].map(([memberPath, bytes]) => ({ path: memberPath, digest: createHash('sha256').update(bytes).digest('hex') })); if (method === 'commit') { effects.commit += 1; return { commit, parent: facts().expected_base, tree_digest: createHash('sha256').update('manual-resume-tree').digest('hex') }; } if (method === 'pushFastForward') { effects.push += 1; return; } if (method === 'containsCommit') return input.commit === commit && input.head === commit; if (method === 'inspectCommit') { const value = facts(); return { commit, parents: [value.expected_base], tree_digest: createHash('sha256').update('manual-resume-tree').digest('hex'), author: value.target.writer_authority.author, subject: `rules(${value.target.tier}): publish ${value.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': value.target.rule_id, 'PIDEX-Transaction-Digest': value.idempotency_key.slice(3), 'PIDEX-Admission-Digest': value.admission_digest, 'PIDEX-Predecessor': `commit:${value.expected_base}` }, staged_member_digests: Object.fromEntries([...writes].map(([memberPath, bytes]) => [memberPath, createHash('sha256').update(bytes).digest('hex')])) }; } }]));
  const descendant = { fetchEnrolledBranch: () => { const value = facts(); const tree = Buffer.from('manual-resume-tree'); return { repository_identity: value.target.writer_authority.repository_identity_digest, normalized_remote_digest: value.target.writer_authority.normalized_remote_digest, branch: value.target.writer_authority.branch, containing_head: commit, containing_tree_bytes: tree, containing_tree_digest: createHash('sha256').update(tree).digest('hex'), entries: [{ commit_oid: commit, parent_oids: [value.expected_base], tree_oid: 'd'.repeat(40) }], predecessor_boundary: value.expected_base }; }, inspectCommit: () => { const value = facts(); return { commit_oid: commit, parent_oids: [value.expected_base], tree_oid: 'd'.repeat(40), author: value.target.writer_authority.author, subject: `rules(${value.target.tier}): publish ${value.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': value.target.rule_id, 'PIDEX-Transaction-Digest': value.idempotency_key.slice(3), 'PIDEX-Admission-Digest': value.admission_digest, 'PIDEX-Predecessor': `commit:${value.expected_base}` }, managed_members: Object.fromEntries(Object.entries(value.staged_member_digests).map(([memberPath, content_hash], index) => [memberPath, { blob_oid: (index + 1).toString(16).padStart(40, '0'), content_hash }])) }; } };
  return { writes, effects, adapters: { writer, receipt_git: (args) => writes.get(args.at(-1).slice(`${commit}:`.length)), descendant }, lock: { acquire: () => ({ lease_id: 'manual-resume', repository: facts().target.repository, scope_id: facts().target.scope_id }), release: () => undefined } };
}
async function manualResumeRecoveryFixture({ stage, tier = 'global' } = {}) {
  const fixture = manualIntakeE2EFixture({ tier }); const admission_capability = manualPublicationAdmission(fixture); fixture.transaction = prepareManualRefinementTransaction({ store: fixture.store, admission_capability, now: '2026-08-14T00:00:00.000Z' }).idempotency_key; const run = (adapters, fault) => resumeManualRefinementPublication({ store: fixture.store, idempotency_key: fixture.transaction, stateRoot: fixture.stateRoot, repository_root: '/manual-resume-fixture', adapters: adapters.adapters, lock: adapters.lock, durabilitySupported: true, durabilitySync: () => {}, now: '2026-08-14T00:00:00.000Z', fault }); const reopen = () => { fixture.store.close(); fixture.store = openRuleLifecycleStore({ stateRoot: fixture.stateRoot, learningAuthority: fixture.authority }); };
  if (stage === 'prepared') { const adapters = manualPublicationAdapters(fixture); const source = readFileSync(path.join(fixture.repository, fixture.rulePath)); reopen(); const result = await run(adapters); return { result, writes: adapters.writes, effects: adapters.effects, source_unchanged: readFileSync(path.join(fixture.repository, fixture.rulePath)).equals(source), close: () => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); } }; }
  if (stage === 'tx02') { const adapters = manualPublicationAdapters(fixture, { afterTx02: true }); await run(adapters); reopen(); return { result: await run(manualPublicationAdapters(fixture, { writes: adapters.writes })), close: () => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); } }; }
  if (stage === 'postpush') { const adapters = manualPublicationAdapters(fixture, { postPushAmbiguity: true }); await assert.rejects(run(adapters), /RULE_PUBLICATION_RECEIPT_INVALID/); reopen(); return { result: await run(manualPublicationAdapters(fixture, { writes: adapters.writes })), close: () => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); } }; }
  const checkpoint = stage === 'tx03' ? 'after_receipt_consumption' : stage === 'mirror_verified' ? 'before_projection' : 'before_reattest'; const adapters = manualPublicationAdapters(fixture); await assert.rejects(run(adapters, (point) => { if (point === checkpoint) throw new Error('pause'); }), /pause/); reopen(); return { result: await run(manualPublicationAdapters(fixture, { writes: adapters.writes })), close: () => { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); } };
}

test('6B2 direct resume after close/reopen from prepared TX01 reaches status_ready', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'prepared' });
  try { assert.equal(fixture.result.status, 'status_ready', JSON.stringify(fixture.result)); } finally { fixture.close(); }
});

test('6B2 direct resume after close/reopen from TX02 committed-local reaches status_ready', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'tx02' });
  try { assert.equal(fixture.result.status, 'status_ready', JSON.stringify(fixture.result)); } finally { fixture.close(); }
});
test('6B2 direct resume after close/reopen from post-push ambiguity reaches status_ready', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'postpush' });
  try { assert.equal(fixture.result.status, 'status_ready', JSON.stringify(fixture.result)); } finally { fixture.close(); }
});
test('6B2 direct resume after close/reopen from TX03 receipt reaches status_ready', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'tx03' });
  try { assert.equal(fixture.result.status, 'status_ready', JSON.stringify(fixture.result)); } finally { fixture.close(); }
});
test('6B2 direct resume after close/reopen from B1 mirror_verified reaches status_ready', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'mirror_verified' });
  try { assert.equal(fixture.result.status, 'status_ready', JSON.stringify(fixture.result)); } finally { fixture.close(); }
});
test('6B2 direct resume after close/reopen from B2 projection_applied reattests status_ready', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'projection_applied' });
  try { assert.equal(fixture.result.status, 'status_ready', JSON.stringify(fixture.result)); } finally { fixture.close(); }
});

test('6B2 global manual end-to-end keeps exact shared header, paths, source, and no manual flag', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'prepared', tier: 'global' });
  try { const paths = [...fixture.writes.keys()].sort(); const member = fixture.writes.get('rules/pidex-implementer/quality.md').toString('utf8'); assert.deepEqual(paths, ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md']); assert.match(member, /^<!-- pidex-rule-receipt-v1 \{"rule_id":"pidex-global:pidex-implementer:quality","admission_digest":"[a-f0-9]{64}","transaction_digest":"[a-f0-9]{64}","lifecycle_state":"active"\} -->\n# quality\n/); assert.doesNotMatch(member, /manual(?:_|-)flag|manual publication/i); assert.deepEqual(fixture.effects, { commit: 1, push: 1 }); assert.equal(fixture.source_unchanged, true); } finally { fixture.close(); }
});
test('6B2 project manual end-to-end keeps exact shared header, paths, source, and no manual flag', async () => {
  const fixture = await manualResumeRecoveryFixture({ stage: 'prepared', tier: 'project' });
  try { const paths = [...fixture.writes.keys()].sort(); const member = fixture.writes.get('pidex/rules/managed/pidex-implementer/quality.md').toString('utf8'); assert.deepEqual(paths, ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/quality.md']); assert.match(member, /^<!-- pidex-rule-receipt-v1 \{"rule_id":"project:[a-f0-9]{24}:pidex-implementer:quality","admission_digest":"[a-f0-9]{64}","transaction_digest":"[a-f0-9]{64}","lifecycle_state":"active"\} -->\n# quality\n/); assert.doesNotMatch(member, /manual(?:_|-)flag|manual publication/i); assert.deepEqual(fixture.effects, { commit: 1, push: 1 }); assert.equal(fixture.source_unchanged, true); } finally { fixture.close(); }
});
test('6B2 rejects wrong, missing, and cross-used adapter bundles before manual publication effect', async () => {
  const fixture = manualIntakeE2EFixture(); const admission_capability = manualPublicationAdmission(fixture); const prepared = prepareManualRefinementTransaction({ store: fixture.store, admission_capability, now: '2026-08-14T00:00:00.000Z' }); const valid = manualPublicationAdapters({ ...fixture, transaction: prepared.idempotency_key });
  try { for (const adapters of [{}, { writer: valid.adapters.writer, receipt_git: valid.adapters.receipt_git }, { writer: valid.adapters.writer, receipt_git: valid.adapters.writer, descendant: valid.adapters.descendant }]) { const output = await resumeManualRefinementPublication({ store: fixture.store, idempotency_key: prepared.idempotency_key, stateRoot: fixture.stateRoot, repository_root: '/manual-adapter-reject', adapters, lock: valid.lock, durabilitySupported: true, durabilitySync: () => {}, now: '2026-08-14T00:00:00.000Z' }); assert.equal(output.status, 'unavailable'); assert.equal(fixture.store.readPublicationTransaction({ idempotency_key: prepared.idempotency_key }).state, 'prepared'); assert.equal(valid.writes.size, 0); } } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});
test('6B2 TX04 remote advance and local stop leave composed manual terminal truthful', async () => {
  for (const mode of ['remoteAdvance', 'localStop']) { const fixture = manualIntakeE2EFixture(); const admission_capability = manualPublicationAdmission(fixture); const prepared = prepareManualRefinementTransaction({ store: fixture.store, admission_capability, now: '2026-08-14T00:00:00.000Z' }); fixture.transaction = prepared.idempotency_key; const adapters = manualPublicationAdapters(fixture); if (mode === 'remoteAdvance') { const authority = fixture.store.readPublicationWriterFacts({ idempotency_key: fixture.transaction }).target.writer_authority; adapters.adapters.writer.fetchObserved = () => ({ head: 'f'.repeat(40), remote_digest: authority.normalized_remote_digest, branch: authority.branch, repository: fixture.repository }); } try { if (mode === 'localStop') fixture.store.setLocalRuleStop({ repository: fixture.repository, scope_id: 'pidex-global', rule_id: fixture.rule_id, reason_code: 'operator_stop' }); const output = await resumeManualRefinementPublication({ store: fixture.store, idempotency_key: fixture.transaction, stateRoot: fixture.stateRoot, repository_root: '/manual-terminal', adapters: adapters.adapters, lock: adapters.lock, durabilitySupported: true, durabilitySync: () => {}, now: '2026-08-14T00:00:00.000Z' }); assert.equal(output.status, mode === 'remoteAdvance' ? 'deferred_remote_advanced' : 'unavailable', `${mode}:${JSON.stringify(output)}`); assert.equal(fixture.store.readPublicationTransaction({ idempotency_key: fixture.transaction }).state, mode === 'remoteAdvance' ? 'deferred_remote_advanced' : 'prepared'); assert.equal(adapters.writes.size, mode === 'remoteAdvance' ? 3 : 0); } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); } }
});

test('manual intake admission consumes same-store canonical intake through global three-reviewer quorum', () => {
  const fixture = manualIntakeE2EFixture();
  try {
    const imported = importManualRefinementCandidate(fixture.input());
    const intake = readManualRefinementIntake({ intake_capability: imported.intake_capability });
    const context = prepareSemanticReviewContext({ candidate: intake.candidate });
    const votes = fixture.authority.reviewers.principals.map((reviewer) => ({
      schema_version: 'pidex-living-rule-semantic-vote-v1', candidate_digest: context.candidate_digest, candidate_content_hash: context.candidate_content_hash,
      admission_policy_digest: context.admission_policy_digest, admission_policy_version: context.admission_policy_version, tier: context.tier,
      repository_scope_digest: context.repository_scope_digest, reviewer_principal: reviewer.principal, backend_identity: reviewer.backend,
      provider: reviewer.provider, model: reviewer.model, configuration_generation: 'config:1', attempt_id: `attempt:${reviewer.principal.slice(9)}`,
      nonce: `nonce:${reviewer.principal.slice(9)}`, issued_at: '2026-08-13T01:00:00.000Z', expires_at: '2026-08-13T01:05:00.000Z', decision: 'accept',
    }));
    const result = admitManualRefinementIntake({ store: fixture.store, intake_capability: imported.intake_capability, votes, reviewer_authority: fixture.store.mintRuleLearningReviewerAuthority() });
    assert.equal(result.status, 'admitted', JSON.stringify(result));
    assert.equal(JSON.stringify(result.admission), JSON.stringify({ schema_version: 'pidex-living-rule-admission-v1', candidate_digest: intake.candidate_digest, candidate_content_hash: intake.candidate.content_hash, admission_policy_digest: intake.candidate.admission_policy_digest, admission_policy_version: intake.candidate.admission_policy_version, tier: intake.candidate.tier, repository_scope_digest: intake.candidate.scope_digest, vote_digests: result.admission.vote_digests }));
  } finally { fixture.store.close(); rmSync(fixture.stateRoot, { recursive: true, force: true }); }
});
