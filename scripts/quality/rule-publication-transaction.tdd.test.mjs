import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, linkSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { candidateDigest } from './rule-learning-candidate.mjs';
import { acquireAcceptedRemoteReceipt, openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { derivePublicationIdempotencyKey, preparePublicationTransaction, commitLocalPublicationTransaction, classifyPublicationRecovery, acceptRemotePublicationTransaction, replayRemotePublicationHandoff, continuePublicationHandoff } from './rule-publication-transaction.mjs';
import { listRulePublicationStatus, readRulePublicationStatusDetail, RULE_PUBLICATION_STATUS_SCHEMA } from './rule-publication-status.mjs';

const hex = (char, length = 64) => char.repeat(length);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const now = '2026-08-14T00:00:00.000Z';
const qualityCandidateBody = '# quality\n\n## Instruction\nValidate quality checks.\n\n## Trigger\nBefore publication.\n\n## Expected evidence\nFocused checks pass.\n\n## Failure behavior\nDefer publication.\n\n## Rationale\nRepeated safe support.\n';
function fixture() {
  const expected_base = hex('a', 40);
  const candidate = { schema_version: 'pidex-managed-rule-v1', rule_id: 'pidex-global:pidex-implementer:quality', tier: 'global', agent: 'pidex-implementer', slug: 'quality', applicability: ['implementation'], body: qualityCandidateBody, predecessor_commit: `commit:${expected_base}`, support_digest: hex('b'), admission_policy_id: 'pidex-living-rule-admission', admission_policy_version: 'v1', admission_policy_digest: hex('c'), generator_principal: 'generator:one', generator_attempt_id: 'attempt:one', scope_digest: hex('d'), descriptor_digests: [hex('f')], authority_digest: hex('e'), content_hash: sha(Buffer.from(qualityCandidateBody)) };
  candidate.candidate_digest = candidateDigest(candidate);
  const candidate_bytes = Buffer.from(JSON.stringify(candidate));
  const admission = { schema_version: 'pidex-living-rule-admission-v1', candidate_digest: candidate.candidate_digest, candidate_content_hash: candidate.content_hash, admission_policy_digest: candidate.admission_policy_digest, admission_policy_version: candidate.admission_policy_version, tier: candidate.tier, repository_scope_digest: candidate.scope_digest, vote_digests: [hex('1'), hex('2'), hex('3')] };
  const admission_bytes = Buffer.from(JSON.stringify(admission));
  const writer_authority = { normalized_remote_digest: hex('a'), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: hex('b'), identity_platform: 'posix', root_identity_digest: hex('c'), parent_identity_digest: hex('d'), files_identity_digest: hex('e'), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  const target = { repository: 'repo:tx', tier: 'global', scope_id: 'pidex-global', scope_digest: candidate.scope_digest, rule_id: candidate.rule_id, predecessor: candidate.predecessor_commit, allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md'], enrollment_digest: hex('9'), writer_authority };
  const idempotency_key = derivePublicationIdempotencyKey({ candidate_digest: candidate.candidate_digest, admission_digest: sha(admission_bytes), target, expected_base });
  return { candidate, admission, candidate_bytes, admission_bytes, target, expected_base, idempotency_key };
}
function withStore(run) { const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-publication-tx-')); const store = openRuleLifecycleStore({ stateRoot }); try { return run(store, stateRoot); } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); } }
function prepared(store, input = fixture()) { store.enroll({ repository: input.target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: input.target.writer_authority.branch }); store.enrollPublicationTarget(input.target); preparePublicationTransaction({ store, ...input, now }); return input; }
function committed(store, input = fixture()) { prepared(store, input); commitLocalPublicationTransaction({ store, idempotency_key: input.idempotency_key, commit: hex('b', 40), parent: input.expected_base, tree_digest: hex('c'), staged_member_digests: Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, hex(String(index + 1))])), now }); return input; }
function acceptedReceipt(input) { return { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: input.target.writer_authority.repository_identity_digest, scope_id: 'pidex-global', rule_id: input.target.rule_id, predecessor_commit: input.expected_base, accepted_commit: hex('b', 40), tree_digest: hex('c'), content_hash: hex('3'), admission_digest: sha(input.admission_bytes), transaction_digest: input.idempotency_key.slice(3), lifecycle_state: 'active' }; }
function oid(number) { return number.toString(16).padStart(40, '0'); }
function writerShapedProof(store, input, descendants = 0) {
  const receipt = acceptedReceipt(input); const heads = Array.from({ length: descendants }, (_, index) => oid(index + 16));
  const ordered = [...heads].reverse().concat(receipt.accepted_commit);
  const entries = ordered.map((commit_oid, index) => ({ commit_oid, parent_oids: [index + 1 < ordered.length ? ordered[index + 1] : receipt.predecessor_commit], tree_oid: oid(index + 96) }));
  const members = Object.fromEntries(Object.entries(store.readPublicationWriterFacts({ idempotency_key: input.idempotency_key }).staged_member_digests).map(([memberPath, content_hash], index) => [memberPath, { blob_oid: oid(index + 128), content_hash }]));
  const trailers = { 'PIDEX-Rule-ID': receipt.rule_id, 'PIDEX-Transaction-Digest': receipt.transaction_digest, 'PIDEX-Admission-Digest': receipt.admission_digest, 'PIDEX-Predecessor': `commit:${receipt.predecessor_commit}` };
  const inspections = new Map(entries.map((entry, index) => [entry.commit_oid, index === entries.length - 1 ? { ...entry, author: input.target.writer_authority.author, subject: `rules(global): publish ${receipt.rule_id}`, trailers, managed_members: members } : { ...entry, managed_members: members }]));
  const containing_tree_bytes = Buffer.from(`canonical-tree:${entries[0].tree_oid}`); const containing_tree_digest = sha(containing_tree_bytes);
  return { receipt, containing_tree_digest, proof: { containing_head: entries[0].commit_oid, entries, predecessor_boundary: receipt.predecessor_commit }, descendant_adapter: { fetchEnrolledBranch: () => ({ repository_identity: receipt.repository_identity, normalized_remote_digest: input.target.writer_authority.normalized_remote_digest, branch: input.target.writer_authority.branch, containing_head: entries[0].commit_oid, containing_tree_bytes, containing_tree_digest, entries, predecessor_boundary: receipt.predecessor_commit }), inspectCommit: (commit) => inspections.get(commit) } };
}
function acceptanceCounts(stateRoot, idempotency_key) {
  const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
  try { return { tx03: db.prepare("SELECT COUNT(*) AS count FROM publication_transaction WHERE idempotency_key = ? AND state = 'accepted_remote'").get(idempotency_key).count, events: db.prepare("SELECT COUNT(*) AS count FROM publication_transaction_event WHERE idempotency_key = ? AND state = 'accepted_remote'").get(idempotency_key).count, proofs: db.prepare('SELECT COUNT(*) AS count FROM publication_handoff_head_proof WHERE transaction_digest = ?').get(idempotency_key.slice(3)).count, consumption: db.prepare('SELECT COUNT(*) AS count FROM receipt_consumption WHERE transaction_digest = ?').get(idempotency_key.slice(3)).count }; } finally { db.close(); }
}

test('TX03 proof attestation is store-owned, opaque, single-use, and rejects drift before writes', () => withStore((store, stateRoot) => {
  const input = committed(store); const shaped = writerShapedProof(store, input, 1);
  const attest = (target = store, receipt = shaped.receipt, proof = shaped.proof, adapter = shaped.descendant_adapter) => target.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt, publication_proof: proof, adapter });
  const drifted = { ...shaped.descendant_adapter, inspectCommit: (commit) => { const inspected = shaped.descendant_adapter.inspectCommit(commit); const memberPath = input.target.allowed_paths[0]; return { ...inspected, managed_members: { ...inspected.managed_members, [memberPath]: { ...inspected.managed_members[memberPath], content_hash: hex('9') } } }; } };
  assert.throws(() => attest(store, shaped.receipt, shaped.proof, drifted), /RULE_PUBLICATION_PROOF_CAPABILITY_INVALID/);
  assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 0, events: 0, proofs: 0, consumption: 0 });
  assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, created_at: now }), /RULE_PUBLICATION_PROOF_CAPABILITY_INVALID/);
  const capability = attest(); assert.equal(Object.isFrozen(capability), true); assert.deepEqual(Object.keys(capability), []);
  assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability: Object.freeze({}), created_at: now }), /RULE_PUBLICATION_PROOF_CAPABILITY_INVALID/);
  assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: { ...shaped.receipt, content_hash: hex('9') }, publication_proof: shaped.proof, proof_capability: capability, created_at: now }), /RULE_PUBLICATION_PROOF_CAPABILITY_INVALID/);
  const otherRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-other-proof-store-')); const other = openRuleLifecycleStore({ stateRoot: otherRoot }); try { committed(other, input); assert.throws(() => other.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability: capability, created_at: now }), /RULE_PUBLICATION_PROOF_CAPABILITY_INVALID/); } finally { other.close(); rmSync(otherRoot, { recursive: true, force: true }); }
  const fresh = attest(); assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability: fresh, created_at: now, fault: () => { throw new Error('rollback'); } }), /rollback/);
  assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 0, events: 0, proofs: 0, consumption: 0 });
  const accepted = store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability: attest(), created_at: now });
  assert.equal(accepted.status, 'accepted_remote'); assert.equal(store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, created_at: now }).status, 'existing');
}));
test('Slice5A composed writer-shaped exact/1/64 proof replays through rule-mirror-sync once and rejects unsafe proof classes', () => {
  for (const descendants of [0, 1, 64]) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-s5a-composed-${descendants}-`)); const store = openRuleLifecycleStore({ stateRoot });
    try {
      const input = committed(store); const shaped = writerShapedProof(store, input, descendants);
      const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter });
      store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability, created_at: now });
      assert.equal(replayRemotePublicationHandoff({ store, idempotency_key: input.idempotency_key, handoff_input: { descendant_adapter: shaped.descendant_adapter } }).status, 'existing');
      assert.deepEqual(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }), shaped.receipt);
      assert.equal(store.readPublicationHandoffHeadProofs({ idempotency_key: input.idempotency_key }).at(-1).containing_head, shaped.proof.containing_head);
      assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 1, events: 1, proofs: 1, consumption: 1 });
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
  {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s5a-composed-65-')); const store = openRuleLifecycleStore({ stateRoot });
    try { const input = committed(store); const shaped = writerShapedProof(store, input, 65); assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, created_at: now }), /RULE_PUBLICATION_RECEIPT_INVALID/); assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 0, events: 0, proofs: 0, consumption: 0 }); } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
  {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s5a-composed-member-drift-')); const store = openRuleLifecycleStore({ stateRoot });
    try {
      const input = committed(store); const shaped = writerShapedProof(store, input, 1); const memberPath = input.target.allowed_paths[0];
      const unsafeAdapter = { ...shaped.descendant_adapter, inspectCommit: (commit) => { const inspected = shaped.descendant_adapter.inspectCommit(commit); return { ...inspected, managed_members: { ...inspected.managed_members, [memberPath]: { ...inspected.managed_members[memberPath], content_hash: hex('9') } } }; } };
      assert.throws(() => store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, adapter: unsafeAdapter }), /RULE_PUBLICATION_PROOF_CAPABILITY_INVALID/);
      assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 0, events: 0, proofs: 0, consumption: 0 });
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
  for (const mutate of [
    (proof) => proof.entries.unshift({ commit_oid: oid(999), parent_oids: [proof.containing_head], tree_oid: oid(998) }),
    (proof) => { proof.entries[0].parent_oids.push(oid(997)); },
    (proof) => { proof.entries[0].commit_oid = oid(996); },
    (proof) => { proof.entries[0].tree_oid = 'A'.repeat(40); },
  ]) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s5a-composed-unsafe-')); const store = openRuleLifecycleStore({ stateRoot });
    try {
      const input = committed(store); const shaped = writerShapedProof(store, input, 64); mutate(shaped.proof);
      assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, created_at: now }), /RULE_PUBLICATION_RECEIPT_INVALID/);
      assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 0, events: 0, proofs: 0, consumption: 0 });
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('Slice5A worker TX03 TX04 schedules both terminal winners and blocks precommit consumption', async () => {
  const moduleUrl = new URL('./rule-lifecycle-store.mjs', import.meta.url).href;
  const workerSource = `const { parentPort, workerData } = require('node:worker_threads'); (async () => { const { openRuleLifecycleStore } = await import(workerData.moduleUrl); const store = openRuleLifecycleStore({ stateRoot: workerData.stateRoot }); let proof_capability; try { if (workerData.action === 'tx03') { const facts = store.readPublicationWriterFacts({ idempotency_key: workerData.idempotency_key }); const members = Object.fromEntries(Object.entries(facts.staged_member_digests).map(([memberPath, content_hash], index) => [memberPath, { blob_oid: (index + 128).toString(16).padStart(40, '0'), content_hash }])); const accepted = workerData.receipt.accepted_commit; const adapter = { fetchEnrolledBranch: () => ({ ...workerData.proof, repository_identity: facts.writer_authority.repository_identity_digest, normalized_remote_digest: facts.writer_authority.normalized_remote_digest, branch: facts.writer_authority.branch, containing_tree_bytes: Buffer.from(workerData.containing_tree_bytes), containing_tree_digest: workerData.containing_tree_digest }), inspectCommit: (commit) => { const entry = workerData.proof.entries.find((item) => item.commit_oid === commit); return commit === accepted ? { ...entry, author: facts.writer_authority.author, subject: \`rules(global): publish \${workerData.receipt.rule_id}\`, trailers: { 'PIDEX-Rule-ID': workerData.receipt.rule_id, 'PIDEX-Transaction-Digest': workerData.receipt.transaction_digest, 'PIDEX-Admission-Digest': workerData.receipt.admission_digest, 'PIDEX-Predecessor': \`commit:\${workerData.receipt.predecessor_commit}\` }, managed_members: members } : { ...entry, managed_members: members }; } }; proof_capability = store.attestPublicationRemoteProof({ idempotency_key: workerData.idempotency_key, receipt: workerData.receipt, publication_proof: workerData.proof, adapter }); } } catch (error) { parentPort.postMessage({ stage: 'done', action: workerData.action, error: error.message }); store.close(); return; } const signal = new Int32Array(workerData.signal); Atomics.add(signal, 0, 1); Atomics.notify(signal, 0); Atomics.wait(signal, workerData.gate, 0); parentPort.postMessage({ stage: 'started', action: workerData.action }); try { let output; if (workerData.action === 'tx03') { output = store.acceptRemotePublicationTransaction({ idempotency_key: workerData.idempotency_key, receipt: workerData.receipt, publication_proof: workerData.proof, proof_capability, created_at: workerData.now }); } else output = store.appendPublicationTerminal({ idempotency_key: workerData.idempotency_key, state: 'deferred_remote_advanced', reason_code: 'verified_remote', created_at: workerData.now }); parentPort.postMessage({ stage: 'done', action: workerData.action, output }); } catch (error) { parentPort.postMessage({ stage: 'done', action: workerData.action, error: error.message }); } finally { store.close(); } })();`;
  const run = async (winner) => {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-s5a-worker-${winner}-`)); const store = openRuleLifecycleStore({ stateRoot }); const input = committed(store); const shaped = writerShapedProof(store, input); const signal = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3); const shared = new Int32Array(signal);
    const spawnWorker = (action, gate) => new Promise((resolve, reject) => { const worker = new Worker(workerSource, { eval: true, workerData: { moduleUrl, stateRoot, signal, gate, action, idempotency_key: input.idempotency_key, receipt: shaped.receipt, proof: shaped.proof, containing_tree_bytes: shaped.descendant_adapter.fetchEnrolledBranch().containing_tree_bytes, containing_tree_digest: shaped.containing_tree_digest, now } }); worker.on('message', (message) => { if (message.stage === 'done') resolve(message); }); worker.on('error', reject); worker.on('exit', (code) => { if (code !== 0) reject(new Error(`worker ${action} exited ${code}`)); }); });
    try {
      assert.equal(replayRemotePublicationHandoff({ store, idempotency_key: input.idempotency_key }).status, 'handoff_pending', 'consumer cannot consume before receipt/proof TX03 commit');
      const firstGate = winner === 'tx03' ? 1 : 2; const secondGate = winner === 'tx03' ? 2 : 1; const first = spawnWorker(winner, firstGate); const second = spawnWorker(winner === 'tx03' ? 'tx04' : 'tx03', secondGate);
      while (Atomics.load(shared, 0) !== 2) await new Promise((resolve) => setTimeout(resolve, 1));
      Atomics.store(shared, firstGate, 1); Atomics.notify(shared, firstGate);
      await new Promise((resolve) => setTimeout(resolve, 10));
      Atomics.store(shared, secondGate, 1); Atomics.notify(shared, secondGate);
      const outcomes = await Promise.all([first, second]);
      const counts = acceptanceCounts(stateRoot, input.idempotency_key);
      if (winner === 'tx03') { assert.equal(outcomes.find((outcome) => outcome.action === 'tx03').output?.status, 'accepted_remote', JSON.stringify(outcomes)); assert.match(outcomes.find((outcome) => outcome.action === 'tx04').error, /RULE_PUBLICATION_TRANSACTION_CONFLICT/); assert.deepEqual(counts, { tx03: 1, events: 1, proofs: 1, consumption: 0 }); }
      else { assert.equal(outcomes.find((outcome) => outcome.action === 'tx04').output?.status, 'deferred_remote_advanced', JSON.stringify(outcomes)); assert.match(outcomes.find((outcome) => outcome.action === 'tx03').error, /RULE_PUBLICATION_TRANSACTION_CONFLICT/); assert.deepEqual(counts, { tx03: 0, events: 0, proofs: 0, consumption: 0 }); }
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  };
  await run('tx03'); await run('tx04');
});
test('Slice5A malformed proof aggregate reports distinct durable corruption categories and refuses replay', () => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s5a-integrity-source-')); let source = openRuleLifecycleStore({ stateRoot: sourceRoot }); const input = committed(source); const shaped = writerShapedProof(source, input); const proof_capability = source.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter }); source.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability, created_at: now }); source.close();
  try {
    for (const [name, sql, category] of [
      ['proof-json', "UPDATE publication_handoff_head_proof SET proof_json = '{'", 'malformed_proof_json'],
      ['proof-digest', "UPDATE publication_handoff_head_proof SET proof_digest = '0'", 'proof_digest_mismatch'],
      ['receipt-json', "UPDATE publication_accepted_receipt SET receipt_json = '{'", 'malformed_receipt_json'],
      ['receipt-digest', "UPDATE publication_accepted_receipt SET receipt_digest = '0'", 'receipt_digest_mismatch'],
    ]) {
      const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-s5a-integrity-${name}-`)); cpSync(path.join(sourceRoot, 'quality'), path.join(stateRoot, 'quality'), { recursive: true });
      const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); db.exec(sql); db.close(); const store = openRuleLifecycleStore({ stateRoot });
      try {
        assert.deepEqual(store.readPublicationReceiptIntegritySummary({ idempotency_key: input.idempotency_key }), { status: 'invalid', invalid_count: 1, categories: [category] });
        assert.notEqual(replayRemotePublicationHandoff({ store, idempotency_key: input.idempotency_key, handoff_input: { descendant_adapter: shaped.descendant_adapter } }).status, 'existing');
        const counts = acceptanceCounts(stateRoot, input.idempotency_key); const projection = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
        try { assert.deepEqual(counts, { tx03: 1, events: 1, proofs: 1, consumption: 0 }); assert.equal(projection.prepare('SELECT COUNT(*) AS count FROM effective_projection').get().count, 0); } finally { projection.close(); }
      } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
    }
  } finally { rmSync(sourceRoot, { recursive: true, force: true }); }
});
test('Slice5A VT11 privacy strips sentinels from outward transaction, proof, integrity, replay, error, and callback channels', () => withStore((store, stateRoot) => {
  const input = committed(store); const shaped = writerShapedProof(store, input); const sentinels = ['VT11_BODY', 'VT11_REPOSITORY', 'VT11_REMOTE', 'VT11_PATH', 'VT11_GIT_DIAGNOSTIC', 'VT11_RECEIPT_DIGEST', 'VT11_STAGED_DIGEST'];
  const unsafeInput = { body: sentinels[0], repository: sentinels[1], remote: sentinels[2], path: sentinels[3], receipt: sentinels[5], staged_member_digests: sentinels[6] };
  const outward = [];
  const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter });
  store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability, created_at: now });
  const failed = acceptRemotePublicationTransaction({ store, writer_result: { status: 'receipt_pending', transaction: input.idempotency_key, prepared_commit: shaped.receipt.accepted_commit, observed_head: shaped.proof.containing_head, recovery_code: 'RC-02' }, now, handoff_input: unsafeInput, handoff: () => { throw new Error(sentinels[4]); } });
  outward.push(failed, store.readPublicationTransaction({ idempotency_key: input.idempotency_key }), store.readPublicationHandoffHeadProofs({ idempotency_key: input.idempotency_key }), store.readPublicationReceiptIntegrity({ idempotency_key: input.idempotency_key }), store.readPublicationReceiptIntegritySummary({ idempotency_key: input.idempotency_key }));
  const callback = (value) => outward.push({ log_callback: value });
  const replay = replayRemotePublicationHandoff({ store, idempotency_key: input.idempotency_key, handoff_input: unsafeInput, handoff: ({ receipt, publication_proof }) => { const result = acquireAcceptedRemoteReceipt({ store, receipt, publication_proof, descendant_adapter: shaped.descendant_adapter }); callback({ receipt_digest: sha(Buffer.from(JSON.stringify(receipt))), containing_head: result.containing_head }); } });
  assert.equal(replay.status, 'existing'); outward.push(replay);
  const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
  try { outward.push(db.prepare('SELECT state, reason_code FROM publication_transaction_event WHERE idempotency_key = ? ORDER BY event_sequence').all(input.idempotency_key)); const consumption = db.prepare('SELECT receipt_digest, transaction_digest, result_json FROM receipt_consumption WHERE transaction_digest = ?').all(input.idempotency_key.slice(3)); const stages = db.prepare('SELECT receipt_digest, transaction_digest, stage, payload_digest, created_at FROM publication_handoff_stage_event WHERE transaction_digest = ?').all(input.idempotency_key.slice(3)); const current = db.prepare('SELECT receipt_digest, transaction_digest, stage, payload_digest, payload_json, updated_at FROM publication_handoff_stage_current WHERE transaction_digest = ?').all(input.idempotency_key.slice(3)); outward.push(consumption, stages, current); assert.equal(consumption.length, 1); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM effective_projection').get().count, 0); for (const table of ['publication_accepted_receipt', 'publication_handoff_head_proof', 'receipt_consumption', 'publication_handoff_stage_event', 'publication_handoff_stage_current']) assert.doesNotMatch(JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()), new RegExp(sentinels.join('|'))); } finally { db.close(); }
  const serialized = JSON.stringify(outward); for (const sentinel of sentinels) assert.doesNotMatch(serialized, new RegExp(sentinel));
}));
test('TX-03 atomically persists exact canonical receipt before accepted terminal and replays only immutable bytes', () => withStore((store) => {
  const input = committed(store); const shaped = writerShapedProof(store, input); const receipt = shaped.receipt;
  const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter });
  const first = store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, proof_capability, created_at: now });
  assert.equal(first.status, 'accepted_remote'); assert.match(first.receipt_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }), receipt);
  assert.equal(store.readPublicationTransaction({ idempotency_key: input.idempotency_key }).receipt.status, 'accepted_remote');
  assert.equal(store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, created_at: now }).status, 'existing');
  for (const [field, value] of Object.entries({ schema: 'wrong', status: 'prepared', repository_identity: hex('0'), scope_id: hex('a', 24), rule_id: 'pidex-global:pidex-implementer:other', predecessor_commit: hex('d', 40), accepted_commit: hex('e', 40), tree_digest: hex('f'), content_hash: hex('2'), admission_digest: hex('1'), transaction_digest: hex('0'), lifecycle_state: 'deactivated' })) assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: { ...receipt, [field]: value }, created_at: now }), /RULE_PUBLICATION_(?:RECEIPT_INVALID|TRANSACTION_CONFLICT)/);
  assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: { ...receipt, extra: true }, created_at: now }), /RULE_PUBLICATION_RECEIPT_INVALID/);
}));
test('RC02-D atomically stores append-only initial containing-head proof with receipt and TX-03', () => withStore((store) => {
  const input = committed(store); const shaped = writerShapedProof(store, input); const receipt = shaped.receipt;
  const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter });
  store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, proof_capability, created_at: now });
  assert.deepEqual(store.readPublicationHandoffHeadProofs({ idempotency_key: input.idempotency_key }).map((item) => item.containing_head), [receipt.accepted_commit]);
}));
test('TX-03 maps only writer RC02/RC03 proof to exact receipt and rolls every statement fault back', () => withStore((store) => {
  const input = committed(store); const shaped = writerShapedProof(store, input); const writer_result = { status: 'receipt_pending', transaction: input.idempotency_key, prepared_commit: hex('b', 40), observed_head: shaped.proof.containing_head, recovery_code: 'RC-02' };
  for (const faultStage of ['after_receipt', 'after_state', 'after_event']) {
    assert.throws(() => acceptRemotePublicationTransaction({ store, writer_result, now, descendant_adapter: shaped.descendant_adapter, fault: (stage) => { if (stage === faultStage) throw new Error('fault'); } }), /fault/);
    assert.equal(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }), undefined, faultStage);
    assert.equal(store.readPublicationTransactionFacts({ idempotency_key: input.idempotency_key }).state, 'committed_local', faultStage);
  }
  const accepted = acceptRemotePublicationTransaction({ store, writer_result, now, descendant_adapter: shaped.descendant_adapter, handoff: () => undefined });
  assert.equal(accepted.status, 'accepted_remote'); assert.deepEqual(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }), acceptedReceipt(input));
  assert.equal(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }).content_hash, hex('3'));
  assert.equal(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }).scope_id, 'pidex-global'); assert.equal(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }).repository_identity, input.target.writer_authority.repository_identity_digest);
  assert.throws(() => acceptRemotePublicationTransaction({ store, writer_result: { ...writer_result, recovery_code: 'postpush_verification_pending' }, now, descendant_adapter: shaped.descendant_adapter }), /RULE_PUBLICATION_RECEIPT_INVALID/);
}));
test('TX03 receipt, proof, initial-stage, state, and terminal event faults reopen all-or-none', () => {
  for (const faultStage of ['after_receipt', 'after_proof', 'after_stage_event', 'after_stage_current', 'after_state', 'after_terminal_event']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tx03-fault-')); let store = openRuleLifecycleStore({ stateRoot });
    try {
      const input = committed(store); const shaped = writerShapedProof(store, input);
      assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability: store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter }), created_at: now, fault: (stage) => { if (stage === faultStage) throw new Error('fault'); } }), /fault/, faultStage);
      store.close(); store = openRuleLifecycleStore({ stateRoot });
      assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 0, events: 0, proofs: 0, consumption: 0 }, faultStage);
      assert.equal(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }), undefined, faultStage);
      assert.equal(store.readPublicationHandoffStage({ idempotency_key: input.idempotency_key }), undefined, faultStage);
      assert.equal(store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability: store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter }), created_at: now }).status, 'accepted_remote');
      assert.deepEqual(acceptanceCounts(stateRoot, input.idempotency_key), { tx03: 1, events: 1, proofs: 1, consumption: 0 }, faultStage);
    } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('TX-01 reparses canonical candidate and admission bytes with embedded full digests', () => withStore((store) => {
  const input = fixture(); store.enroll({ repository: input.target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: input.target.writer_authority.branch }); store.enrollPublicationTarget(input.target);
  for (const patch of [
    { candidate_bytes: Buffer.from(JSON.stringify({ ...input.candidate, candidate_digest: hex('0') })) },
    { candidate_bytes: Buffer.from(JSON.stringify({ ...input.candidate, extra: true })) },
    { admission_bytes: Buffer.from(JSON.stringify({ ...input.admission, vote_digests: [hex('1'), hex('2')] })) },
    { admission_bytes: Buffer.from(JSON.stringify({ ...input.admission, extra: true })) },
  ]) assert.throws(() => preparePublicationTransaction({ store, ...input, ...patch, now }), /RULE_PUBLICATION_(?:CANDIDATE|ADMISSION|TRANSACTION)_INVALID/);
  const legacy = { ...input.candidate }; delete legacy.candidate_digest;
  const candidate = { ...input.candidate, candidate_digest: sha(Buffer.from(JSON.stringify(legacy))) };
  const candidate_bytes = Buffer.from(JSON.stringify(candidate));
  const admission = { ...input.admission, candidate_digest: candidate.candidate_digest };
  const admission_bytes = Buffer.from(JSON.stringify(admission));
  const idempotency_key = derivePublicationIdempotencyKey({ candidate_digest: candidate.candidate_digest, admission_digest: sha(admission_bytes), target: input.target, expected_base: input.expected_base });
  assert.throws(() => preparePublicationTransaction({ store, ...input, candidate_bytes, admission_bytes, idempotency_key, now }), /RULE_PUBLICATION_TRANSACTION_INVALID/);
}));
test('TX-01 derives deterministic idempotency instead of trusting caller token', () => withStore((store) => {
  const input = prepared(store); assert.equal(preparePublicationTransaction({ store, ...input, now }).status, 'existing');
  assert.throws(() => preparePublicationTransaction({ store, ...input, idempotency_key: `tx:${hex('0')}`, now }), /RULE_PUBLICATION_TRANSACTION_INVALID/);
}));
test('TX-01 binds rule tier scope predecessor and enrolled target exactly', () => withStore((store) => {
  const input = fixture(); store.enroll({ repository: input.target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: input.target.writer_authority.branch }); store.enrollPublicationTarget(input.target);
  for (const target of [{ ...input.target, tier: 'project' }, { ...input.target, scope_digest: hex('0') }, { ...input.target, predecessor: `commit:${hex('b', 40)}` }, { ...input.target, allowed_paths: input.target.allowed_paths.slice(1) }]) assert.throws(() => preparePublicationTransaction({ store, ...input, target, now }), /RULE_PUBLICATION_(?:ENROLLMENT|TRANSACTION)_INVALID/);
}));
test('TX-02 requires exact allowed member set, expected parent, and distinct commit', () => withStore((store) => {
  const input = prepared(store); const valid = Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, hex(String(index + 1))]));
  for (const patch of [{ staged_member_digests: { [input.target.allowed_paths[0]]: hex('1') } }, { staged_member_digests: { ...valid, 'rules/pidex-implementer/extra.md': hex('4') } }, { parent: hex('b', 40) }, { commit: input.expected_base }]) assert.throws(() => commitLocalPublicationTransaction({ store, idempotency_key: input.idempotency_key, commit: hex('b', 40), parent: input.expected_base, tree_digest: hex('c'), staged_member_digests: valid, now, ...patch }), /RULE_PUBLICATION_LOCAL_COMMIT_INVALID/);
}));
test('TX-02 exact local retry is idempotent and altered retry conflicts', () => withStore((store) => {
  const input = committed(store); const facts = store.readPublicationTransactionFacts({ idempotency_key: input.idempotency_key });
  assert.equal(commitLocalPublicationTransaction({ store, idempotency_key: input.idempotency_key, commit: facts.local_commit, parent: facts.local_parent, tree_digest: facts.local_tree_digest, staged_member_digests: facts.staged_member_digests, now }).status, 'existing');
  assert.throws(() => commitLocalPublicationTransaction({ store, idempotency_key: input.idempotency_key, commit: hex('c', 40), parent: facts.local_parent, tree_digest: facts.local_tree_digest, staged_member_digests: facts.staged_member_digests, now }), /RULE_PUBLICATION_TRANSACTION_CONFLICT/);
}));
test('TX terminal prepared matrix permits only rejected or abandoned', () => withStore((store) => {
  const input = prepared(store); assert.throws(() => store.appendPublicationTerminal({ idempotency_key: input.idempotency_key, state: 'accepted_remote', reason_code: 'verified_remote', created_at: now }), /RULE_PUBLICATION_TERMINAL_INVALID/);
  assert.equal(store.appendPublicationTerminal({ idempotency_key: input.idempotency_key, state: 'abandoned', reason_code: 'operator_stop', created_at: now }).status, 'abandoned');
}));
test('TX terminal committed matrix preserves TX04-06 and rejects generic TX03', () => {
  for (const state of ['deferred_remote_advanced', 'rejected_policy', 'abandoned']) withStore((store) => { const input = committed(store); assert.equal(store.appendPublicationTerminal({ idempotency_key: input.idempotency_key, state, reason_code: 'verified_remote', created_at: now }).state, state); assert.equal(store.appendPublicationTerminal({ idempotency_key: input.idempotency_key, state, reason_code: 'verified_remote', created_at: now }).status, 'existing'); assert.throws(() => store.appendPublicationTerminal({ idempotency_key: input.idempotency_key, state: 'abandoned', reason_code: 'operator_stop', created_at: now }), /RULE_PUBLICATION_TRANSACTION_CONFLICT/); });
  withStore((store) => { const input = committed(store); assert.throws(() => store.appendPublicationTerminal({ idempotency_key: input.idempotency_key, state: 'accepted_remote', reason_code: 'verified_remote', created_at: now }), /RULE_PUBLICATION_TERMINAL_INVALID/); });
});
test('TX durable mutation rolls back injected fault after row event or state', () => withStore((store) => {
  const input = fixture(); store.enroll({ repository: input.target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: input.target.writer_authority.branch }); store.enrollPublicationTarget(input.target);
  assert.throws(() => preparePublicationTransaction({ store, ...input, now, fault: (stage) => { if (stage === 'after_event') throw new Error('fault'); } }), /fault/);
  assert.equal(store.readPublicationTransaction({ idempotency_key: input.idempotency_key }), undefined);
}));
test('TX concurrent handles elect one terminal winner', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-publication-race-')); const one = openRuleLifecycleStore({ stateRoot }); const two = openRuleLifecycleStore({ stateRoot });
  try { const input = committed(one); const shaped = writerShapedProof(one, input); const proof_capability = one.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter }); const first = one.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: shaped.receipt, publication_proof: shaped.proof, proof_capability, created_at: now }); assert.equal(first.state, 'accepted_remote'); assert.throws(() => two.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: { ...shaped.receipt, content_hash: hex('4') }, publication_proof: shaped.proof, created_at: now }), /RULE_PUBLICATION_TRANSACTION_CONFLICT/); } finally { one.close(); two.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('RC classifier accepts closed facts only and returns advisory recovery results', () => withStore((store) => {
  const input = committed(store); const exact = { remote_contains_exact_commit: true, parent_matches: true, manifest_base_matches: true, commit_tree_matches: true, member_digests_match: true, containing_commit: hex('e', 40) };
  assert.deepEqual(classifyPublicationRecovery({ store, idempotency_key: input.idempotency_key, facts: exact }), { authority: 'advisory', action: 'accept_remote_exact', recovery_code: 'RC-02' });
  assert.deepEqual(classifyPublicationRecovery({ store, idempotency_key: input.idempotency_key, facts: { remote_contains_exact_commit: false, remote_head: input.expected_base, manifest_base_matches: true, enrollment_valid: true, commit_tree_matches: true, member_digests_match: true } }), { authority: 'advisory', action: 'push_exact_local', recovery_code: 'RC-03' });
  assert.deepEqual(classifyPublicationRecovery({ store, idempotency_key: input.idempotency_key, facts: { remote_contains_exact_commit: false, remote_head: hex('f', 40) } }), { authority: 'advisory', action: 'defer_remote_advanced', recovery_code: 'RC-04' });
  assert.deepEqual(classifyPublicationRecovery({ store, idempotency_key: input.idempotency_key, facts: { remote_contains_exact_commit: false, enrollment_valid: false, commit_tree_matches: true, member_digests_match: true } }), { authority: 'advisory', action: 'reject_policy', recovery_code: 'RC-05' });
  assert.deepEqual(classifyPublicationRecovery({ store, idempotency_key: input.idempotency_key, facts: { authorized_abandonment: true } }), { authority: 'advisory', action: 'abandon', recovery_code: 'RC-06' });
  assert.deepEqual(classifyPublicationRecovery({ store, idempotency_key: input.idempotency_key, facts: { ...exact, caller_authorized: true } }), { authority: 'advisory', action: 'reconciliation_required', recovery_code: null });
}));
test('BD12-13 enrollment persists only exact immutable safe writer authority facts', () => withStore((store) => {
  const input = fixture();
  const writer_authority = { normalized_remote_digest: hex('a'), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: hex('b'), identity_platform: 'posix', root_identity_digest: hex('c'), parent_identity_digest: hex('d'), files_identity_digest: hex('e'), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  const target = { ...input.target, writer_authority };
  store.enroll({ repository: target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: writer_authority.branch });
  store.enrollPublicationTarget(target);
  const enrolled = { ...input, target, idempotency_key: derivePublicationIdempotencyKey({ candidate_digest: input.candidate.candidate_digest, admission_digest: sha(input.admission_bytes), target, expected_base: input.expected_base }) };
  preparePublicationTransaction({ store, ...enrolled, now });
  const facts = store.readPublicationWriterFacts({ idempotency_key: enrolled.idempotency_key });
  assert.deepEqual(facts.writer_authority, writer_authority);
  assert.doesNotMatch(JSON.stringify(store.readPublicationTransaction({ idempotency_key: enrolled.idempotency_key })), /example\.invalid|refs\/heads|repo:tx/);
  for (const malformed of [{ ...writer_authority, author: 'PIDEX\n <pidex@example.invalid>' }, { ...writer_authority, branch: 'main' }, { ...writer_authority, root_identity_digest: 'no' }]) assert.throws(() => store.enrollPublicationTarget({ ...input.target, writer_authority: malformed }), /RULE_PUBLICATION_ENROLLMENT_INVALID/);
}));
test('F177 enrollment binds existing repository enrollment and rejects duplicate stable repository identity', () => withStore((store) => {
  const input = fixture();
  assert.throws(() => store.enrollPublicationTarget(input.target), /RULE_PUBLICATION_ENROLLMENT_INVALID/);
  store.enroll({ repository: input.target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: 'refs/heads/main' });
  assert.equal(store.enrollPublicationTarget(input.target).status, 'enrolled');
  const duplicate = { ...input.target, repository: 'repo:alias', rule_id: 'pidex-global:pidex-implementer:alias', allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/alias.md', 'rules/pidex-implementer/index.md'] };
  store.enroll({ repository: duplicate.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: 'refs/heads/main' });
  assert.throws(() => store.enrollPublicationTarget(duplicate), /RULE_PUBLICATION_ENROLLMENT_CONFLICT/);
}));
test('TX writer facts stay store-owned and expose exact private preparation only to writer boundary', () => withStore((store) => {
  const input = prepared(store); const writerFacts = store.readPublicationWriterFacts({ idempotency_key: input.idempotency_key });
  assert.equal(writerFacts.target.rule_id, input.target.rule_id);
  assert.deepEqual(writerFacts.candidate_bytes, input.candidate_bytes);
  assert.deepEqual(writerFacts.admission_bytes, input.admission_bytes);
  assert.equal(writerFacts.author, undefined);
}));
test('F178 reopened writer facts retain exact committed-local recovery material while public reads remain sanitized', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-publication-recovery-')); let store = openRuleLifecycleStore({ stateRoot }); const input = committed(store); store.close(); store = openRuleLifecycleStore({ stateRoot });
  try {
    const facts = store.readPublicationWriterFacts({ idempotency_key: input.idempotency_key });
    assert.deepEqual({ local_commit: facts.local_commit, local_parent: facts.local_parent, local_tree_digest: facts.local_tree_digest, staged_member_digests: facts.staged_member_digests }, { local_commit: hex('b', 40), local_parent: input.expected_base, local_tree_digest: hex('c'), staged_member_digests: Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, hex(String(index + 1))])) });
    assert.deepEqual(facts.candidate_bytes, input.candidate_bytes);
    assert.deepEqual(facts.admission_bytes, input.admission_bytes);
    assert.doesNotMatch(JSON.stringify(store.readPublicationTransaction({ idempotency_key: input.idempotency_key })), /Validate quality checks|config\/rule-baseline|repo:tx/);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('TX public reads after restart exclude private candidate admission bytes and paths', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-publication-privacy-')); let store = openRuleLifecycleStore({ stateRoot }); const input = prepared(store); store.close(); store = openRuleLifecycleStore({ stateRoot });
  try { const outward = JSON.stringify(store.readPublicationTransaction({ idempotency_key: input.idempotency_key })); assert.doesNotMatch(outward, /Validate quality checks|config\/rule-baseline|rules\/pidex|repo:tx/); } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('S5A global external scope maps only pidex-global, never empty/null/aliases, and receipt/outward reads never emit internal empty scope', () => withStore((store) => {
  const input = fixture();
  store.enroll({ repository: input.target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: input.target.writer_authority.branch });
  assert.equal(store.enrollPublicationTarget(input.target).scope_id, 'pidex-global');
  for (const scope_id of ['', null, 'global', 'pidex_global']) assert.throws(() => store.enrollPublicationTarget({ ...input.target, scope_id }), /RULE_PUBLICATION_ENROLLMENT_INVALID/);
  preparePublicationTransaction({ store, ...input, now });
  commitLocalPublicationTransaction({ store, idempotency_key: input.idempotency_key, commit: hex('b', 40), parent: input.expected_base, tree_digest: hex('c'), staged_member_digests: Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, hex(String(index + 1))])), now });
  assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: { ...acceptedReceipt(input), scope_id: '' }, created_at: now }), /RULE_PUBLICATION_RECEIPT_INVALID/);
  assert.equal(store.readPublicationTransaction({ idempotency_key: input.idempotency_key }).scope_id, 'pidex-global');
}));
test('S5A legacy receipt-less accepted_remote fails closed after reopen without inferred receipt or unsafe startup scan', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-publication-legacy-')); let store = openRuleLifecycleStore({ stateRoot }); const input = committed(store); store.close();
  const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
  try {
    db.prepare("UPDATE publication_transaction SET state = 'accepted_remote', terminal_reason = 'verified_remote' WHERE idempotency_key = ?").run(input.idempotency_key);
    db.prepare("INSERT INTO publication_transaction_event (idempotency_key, state, reason_code, created_at) VALUES (?, 'accepted_remote', 'verified_remote', ?)").run(input.idempotency_key, now);
  } finally { db.close(); }
  store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.equal(store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }), undefined);
    assert.deepEqual(store.readPublicationReceiptIntegrity({ idempotency_key: input.idempotency_key }), { status: 'receipt_incomplete', receipt_digest: null });
    assert.deepEqual(store.readPublicationReceiptIntegrityCount(), { accepted_remote: 1, receipt_incomplete: 1 });
    const publicResult = store.readPublicationTransaction({ idempotency_key: input.idempotency_key });
    assert.deepEqual(publicResult.receipt, { status: 'receipt_incomplete', receipt_digest: null });
    assert.deepEqual(acceptRemotePublicationTransaction({ store, writer_result: { status: 'receipt_pending', transaction: input.idempotency_key, prepared_commit: hex('b', 40), observed_head: hex('b', 40), recovery_code: 'RC-02' }, now }), { status: 'receipt_incomplete', transaction: input.idempotency_key });
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('S5A Plan045 acquire verifies exact global/project receipts, retries without fetch, and conflicts altered receipt', () => {
  for (const [rule_id, scope_id, paths] of [
    ['pidex-global:pidex-implementer:quality', 'pidex-global', ['rules/pidex-implementer/quality.md', 'rules/pidex-implementer/index.md', 'config/rule-baseline-manifest.json']],
    [`project:${'a'.repeat(24)}:pidex-implementer:quality`, 'a'.repeat(24), ['pidex/rules/managed/pidex-implementer/quality.md', 'pidex/rules/managed/pidex-implementer/index.md']],
  ]) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s5a-plan045-')); const parent = 'a'.repeat(40); const accepted = 'b'.repeat(40); const transaction = 'd'.repeat(64); const admission = 'e'.repeat(64); const rulePath = paths[0]; const indexPath = paths[1]; const member = Buffer.from(`<!-- pidex-rule-receipt-v1 {\"rule_id\":\"${rule_id}\",\"admission_digest\":\"${admission}\",\"transaction_digest\":\"${transaction}\",\"lifecycle_state\":\"active\"} -->\n# quality\n`); const content_hash = sha(member); const tree_digest = sha(Buffer.from('tree')); const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: `repo:${scope_id}`, scope_id, rule_id, predecessor_commit: parent, accepted_commit: accepted, tree_digest, content_hash, admission_digest: admission, transaction_digest: transaction, lifecycle_state: 'active' }; let fetches = 0;
    const git = (args) => { const command = args.slice(2).join(' '); if (command.startsWith('fetch ')) { fetches += 1; return ''; } if (command === 'remote get-url origin') return 'https://example.invalid/rules.git'; if (command === 'rev-parse refs/remotes/origin/main') return accepted; if (command === `merge-base --is-ancestor ${parent} ${accepted}` || command === `rev-parse ${accepted}^`) return command.startsWith('rev-parse') ? parent : ''; if (command === `rev-list --first-parent ${parent}..${accepted}`) return accepted; if (command === `diff-tree --no-commit-id --name-only -r ${parent} ${accepted}`) return `${paths.join('\n')}\n`; if (command === `cat-file -p ${accepted}^{tree}`) return Buffer.from('tree'); if (command === `show ${accepted}:${rulePath}`) return member; if (command === `show ${accepted}:${indexPath}`) return `- [${rule_id}](quality.md)\n`; if (command === `show ${accepted}:config/rule-baseline-manifest.json`) return JSON.stringify({ schema: 'pidex-bundled-rule-seed-v1', rules: [{ rule_id, path: rulePath, byte_hash: content_hash }] }); throw new Error(command); };
    const store = openRuleLifecycleStore({ stateRoot });
    try {
      const input = { store, receipt, repository_root: '/fixture', baseline_parent_commit: parent, enrollment: { repository_identity: receipt.repository_identity, scope_id, remote_name: 'origin', remote: 'https://example.invalid/rules.git', branch: 'main', allowed_paths: paths }, git };
      assert.equal(acquireAcceptedRemoteReceipt(input).accepted_remote_head, accepted); assert.equal(acquireAcceptedRemoteReceipt(input).accepted_remote_head, accepted); assert.equal(fetches, 1);
      assert.throws(() => acquireAcceptedRemoteReceipt({ ...input, receipt: { ...receipt, admission_digest: 'f'.repeat(64) } }), /RULE_RECEIPT_CONFLICT/);
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('S5A handoff throw survives reopen; retry reuses receipt and reaches one terminal only', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s5a-handoff-')); let store = openRuleLifecycleStore({ stateRoot }); const input = committed(store); const shaped = writerShapedProof(store, input); const writer_result = { status: 'receipt_pending', transaction: input.idempotency_key, prepared_commit: hex('b', 40), observed_head: shaped.proof.containing_head, recovery_code: 'RC-03' };
  try {
    const failed = acceptRemotePublicationTransaction({ store, writer_result, now, descendant_adapter: shaped.descendant_adapter, handoff: () => { throw new Error('PRIVATE_SENTINEL'); } });
    assert.deepEqual(failed, { status: 'handoff_pending', transaction: input.idempotency_key, receipt_digest: failed.receipt_digest }); assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_SENTINEL/);
    const receipt = store.readPublicationAcceptedReceipt({ idempotency_key: input.idempotency_key }); store.close(); store = openRuleLifecycleStore({ stateRoot }); let received;
    const retry = acceptRemotePublicationTransaction({ store, writer_result, now, descendant_adapter: shaped.descendant_adapter, handoff: ({ receipt: replay }) => { received = replay; } });
    assert.equal(retry.status, 'existing'); assert.deepEqual(received, receipt); assert.equal(store.readPublicationTransaction({ idempotency_key: input.idempotency_key }).terminal.state, 'accepted_remote');
  } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
});
test('RC02-D replays durable receipt and proof without writer-result memory', () => withStore((store) => {
  const input = committed(store); const shaped = writerShapedProof(store, input); const receipt = shaped.receipt; const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter }); store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, proof_capability, created_at: now }); let handedOff;
  const result = replayRemotePublicationHandoff({ store, idempotency_key: input.idempotency_key, handoff: ({ receipt: durable, publication_proof }) => { handedOff = { durable, publication_proof }; } });
  assert.equal(result.status, 'existing'); assert.deepEqual(handedOff.durable, receipt); assert.equal(handedOff.publication_proof.containing_head, receipt.accepted_commit);
}));
test('RC02-D replay verifies durable receipt plus fresh descendant proof and exact retry consumes once', () => withStore((store) => {
  const input = committed(store); const shaped = writerShapedProof(store, input, 1); const receipt = shaped.receipt;
  const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter });
  store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, proof_capability, created_at: now });
  const first = replayRemotePublicationHandoff({ store, idempotency_key: input.idempotency_key, handoff_input: { descendant_adapter: shaped.descendant_adapter } });
  assert.equal(first.status, 'existing');
  assert.equal(replayRemotePublicationHandoff({ store, idempotency_key: input.idempotency_key, handoff_input: { descendant_adapter: shaped.descendant_adapter } }).status, 'existing');
  assert.equal(store.readPublicationHandoffHeadProofs({ idempotency_key: input.idempotency_key }).length, 1);
}));
test('PLAN047 B2 projects verified global mirror then reattests before status', () => withStore((store, stateRoot) => {
  const input = prepared(store); const rulePath = 'rules/pidex-implementer/quality.md';
  const member = Buffer.from(`<!-- pidex-rule-receipt-v1 {\"rule_id\":\"${input.target.rule_id}\",\"admission_digest\":\"${sha(input.admission_bytes)}\",\"transaction_digest\":\"${input.idempotency_key.slice(3)}\",\"lifecycle_state\":\"active\"} -->\n# quality\n`);
  const staged = Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, hex(String(index + 1))])); staged[rulePath] = sha(member);
  commitLocalPublicationTransaction({ store, idempotency_key: input.idempotency_key, commit: hex('b', 40), parent: input.expected_base, tree_digest: hex('c'), staged_member_digests: staged, now });
  const shaped = writerShapedProof(store, input, 1); const receipt = { ...shaped.receipt, content_hash: sha(member) };
  const index = Buffer.from('# PIDEX Implementer Rules\n\n| Rule | File | PROC-NEW | Summary |\n|------|------|----------|---------|\n| Quality | [quality](quality.md) | PROC-NEW | Managed rule. |\n');
  const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
  const manifestBody = { schema: 'pidex-bundled-rule-seed-v1', source_kind: 'packaged_baseline', baseline_parent_commit: input.expected_base, agent_count: 0, rule_count: 2, agents: [], rules: [{ rule_id: 'legacy:rules:pidex-implementer:index', path: 'rules/pidex-implementer/index.md', byte_hash: sha(index), protection_class: 'legacy_baseline' }, { rule_id: receipt.rule_id, path: rulePath, byte_hash: receipt.content_hash, protection_class: 'legacy_baseline' }] };
  const manifest = Buffer.from(JSON.stringify({ ...manifestBody, aggregate_digest: sha(Buffer.from(canonical(manifestBody))) }));
  const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter });
  store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, proof_capability, created_at: now });
  const git = (args) => { const command = args.slice(2).join(' '); if (command === `show ${receipt.accepted_commit}:${rulePath}`) return member; if (command === `show ${receipt.accepted_commit}:rules/pidex-implementer/index.md`) return index; if (command === `show ${receipt.accepted_commit}:config/rule-baseline-manifest.json`) return manifest; throw new Error(command); };
  const unsupported = continuePublicationHandoff({ store, transaction: input.idempotency_key, stateRoot, repository_root: '/fixture', git, descendant_adapter: shaped.descendant_adapter, durabilitySupported: false, now });
  assert.deepEqual(unsupported, { status: 'handoff_pending', transaction: input.idempotency_key, receipt_digest: unsupported.receipt_digest, stage: 'bundle_verified' });
  assert.equal(store.readPublicationHandoffStage({ idempotency_key: input.idempotency_key }).stage, 'bundle_verified');
  const result = continuePublicationHandoff({ store, transaction: input.idempotency_key, stateRoot, repository_root: '/fixture', git, descendant_adapter: shaped.descendant_adapter, now });
  assert.deepEqual(result, { status: 'status_ready', transaction: input.idempotency_key, receipt_digest: result.receipt_digest, stage: 'status_ready' });
  assert.deepEqual(store.readPublicationHandoffStage({ idempotency_key: input.idempotency_key }).stage, 'status_ready');
  const projection = store.readProjection({ repository: input.target.repository, scope_id: null });
  assert.deepEqual({ accepted_remote_head: projection.head.accepted_remote_head, baseline_parent_commit: projection.head.baseline_parent_commit, manifest_digest: projection.head.manifest_digest, tree_digest: projection.head.tree_digest }, { accepted_remote_head: shaped.proof.containing_head, baseline_parent_commit: receipt.predecessor_commit, manifest_digest: sha(manifest), tree_digest: shaped.containing_tree_digest });
  const published = listRulePublicationStatus({ store }).publications.find((row) => row.transaction_digest === input.idempotency_key.slice(3));
  assert.deepEqual({ tier: published.tier, scope_id: published.scope_id, label: published.visible_label, refinement: published.refinement }, { tier: 'global', scope_id: 'pidex-global', label: 'Published and verified', refinement: true });
  const request = store.createManualRefinementRequest({ rule_id: input.target.rule_id, receipt_digest: result.receipt_digest, request_nonce: 'status:global', now });
  assert.equal(request.status, 'open');
  assert.equal(listRulePublicationStatus({ store }).publications.find((row) => row.transaction_digest === input.idempotency_key.slice(3)).refinement, false, 'open request disables refinement');
}));
test('S5A receipt schema matrix rejects every missing/malformed key, exact concurrent replay is immutable, and handoff cannot replace receipt with private input', () => withStore((store) => {
  const input = committed(store); const receipt = acceptedReceipt(input);
  for (const key of Object.keys(receipt)) {
    const missing = { ...receipt }; delete missing[key];
    assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: missing, created_at: now }), /RULE_PUBLICATION_RECEIPT_INVALID/, `missing ${key}`);
    assert.throws(() => store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt: { ...receipt, [key]: null }, created_at: now }), /RULE_PUBLICATION_RECEIPT_INVALID/, `malformed ${key}`);
  }
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s5a-race-')); const one = openRuleLifecycleStore({ stateRoot }); const two = openRuleLifecycleStore({ stateRoot });
  try {
    const raced = committed(one); const raced_shaped = writerShapedProof(one, raced); const proof_capability = one.attestPublicationRemoteProof({ idempotency_key: raced.idempotency_key, receipt: raced_shaped.receipt, publication_proof: raced_shaped.proof, adapter: raced_shaped.descendant_adapter }); const first = one.acceptRemotePublicationTransaction({ idempotency_key: raced.idempotency_key, receipt: raced_shaped.receipt, publication_proof: raced_shaped.proof, proof_capability, created_at: now });
    assert.equal(two.acceptRemotePublicationTransaction({ idempotency_key: raced.idempotency_key, receipt: raced_shaped.receipt, publication_proof: raced_shaped.proof, created_at: now }).status, 'existing'); assert.equal(first.receipt_digest, two.readPublicationReceiptIntegrity({ idempotency_key: raced.idempotency_key }).receipt_digest);
  } finally { one.close(); two.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  const shaped = writerShapedProof(store, input); const writer_result = { status: 'receipt_pending', transaction: input.idempotency_key, prepared_commit: hex('b', 40), observed_head: shaped.proof.containing_head, recovery_code: 'RC-02' }; let delivered;
  assert.equal(acceptRemotePublicationTransaction({ store, writer_result, now, descendant_adapter: shaped.descendant_adapter, handoff_input: { receipt: 'PRIVATE_SENTINEL', private_context: 'PRIVATE_SENTINEL' }, handoff: ({ receipt: exact }) => { delivered = exact; } }).status, 'accepted_remote');
  assert.deepEqual(delivered, receipt); assert.doesNotMatch(JSON.stringify(store.readPublicationTransaction({ idempotency_key: input.idempotency_key })), /PRIVATE_SENTINEL/);
}));
function projectB1Fixture(store) {
  const base = fixture(); const scope_id = base.candidate.scope_digest.slice(0, 24); const candidate = { ...base.candidate, tier: 'project', rule_id: `project:${scope_id}:pidex-implementer:quality` };
  candidate.candidate_digest = candidateDigest(candidate); const candidate_bytes = Buffer.from(JSON.stringify(candidate));
  const admission = { ...base.admission, candidate_digest: candidate.candidate_digest, tier: 'project', vote_digests: [hex('1'), hex('2')] }; const admission_bytes = Buffer.from(JSON.stringify(admission));
  const target = { ...base.target, repository: 'repo:project-b1', tier: 'project', scope_id, rule_id: candidate.rule_id, allowed_paths: ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/quality.md'] };
  const idempotency_key = derivePublicationIdempotencyKey({ candidate_digest: candidate.candidate_digest, admission_digest: sha(admission_bytes), target, expected_base: base.expected_base });
  const input = { ...base, candidate, candidate_bytes, admission, admission_bytes, target, idempotency_key };
  store.enroll({ repository: target.repository, scope_id, remote: 'https://example.invalid/project', branch: target.writer_authority.branch }); store.enrollPublicationTarget(target); preparePublicationTransaction({ store, ...input, now });
  const rulePath = target.allowed_paths[1]; const member = Buffer.from(`<!-- pidex-rule-receipt-v1 {\"rule_id\":\"${target.rule_id}\",\"admission_digest\":\"${sha(admission_bytes)}\",\"transaction_digest\":\"${idempotency_key.slice(3)}\",\"lifecycle_state\":\"active\"} -->\n# quality\n`);
  const staged = { [target.allowed_paths[0]]: hex('1'), [rulePath]: sha(member) }; commitLocalPublicationTransaction({ store, idempotency_key, commit: hex('b', 40), parent: base.expected_base, tree_digest: hex('c'), staged_member_digests: staged, now });
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: target.writer_authority.repository_identity_digest, scope_id, rule_id: target.rule_id, predecessor_commit: base.expected_base, accepted_commit: hex('b', 40), tree_digest: hex('c'), content_hash: sha(member), admission_digest: sha(admission_bytes), transaction_digest: idempotency_key.slice(3), lifecycle_state: 'active' };
  const shaped = shapedB1Proof(store, input, receipt); const capability = store.attestPublicationRemoteProof({ idempotency_key, receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter }); store.acceptRemotePublicationTransaction({ idempotency_key, receipt, publication_proof: shaped.proof, proof_capability: capability, created_at: now });
  const index = Buffer.from(`# Project Rules\n\n| Rule ID | File | State |\n|---|---|---|\n| \`${target.rule_id}\` | [quality](quality.md) | active |\n`);
  const calls = []; const git = (args) => { const command = args.slice(2).join(' '); calls.push(command); if (command === `show ${receipt.accepted_commit}:${rulePath}`) return member; if (command === `show ${receipt.accepted_commit}:${target.allowed_paths[0]}`) return index; if (command.includes('config/rule-baseline-manifest.json')) throw new Error('project never reads global manifest'); throw new Error(command); };
  return { input, receipt, shaped, member, rulePath, git, calls };
}
function shapedB1Proof(store, input, receipt) {
  const entries = [{ commit_oid: receipt.accepted_commit, parent_oids: [receipt.predecessor_commit], tree_oid: oid(96) }]; const members = Object.fromEntries(Object.entries(store.readPublicationWriterFacts({ idempotency_key: input.idempotency_key }).staged_member_digests).map(([memberPath, content_hash], index) => [memberPath, { blob_oid: oid(index + 128), content_hash }]));
  const trailers = { 'PIDEX-Rule-ID': receipt.rule_id, 'PIDEX-Transaction-Digest': receipt.transaction_digest, 'PIDEX-Admission-Digest': receipt.admission_digest, 'PIDEX-Predecessor': `commit:${receipt.predecessor_commit}` };
  const inspected = { ...entries[0], author: input.target.writer_authority.author, subject: `rules(project): publish ${receipt.rule_id}`, trailers, managed_members: members };
  const containing_tree_bytes = Buffer.from(`canonical-tree:${entries[0].tree_oid}`); const containing_tree_digest = sha(containing_tree_bytes);
  return { containing_tree_digest, proof: { containing_head: receipt.accepted_commit, entries, predecessor_boundary: receipt.predecessor_commit }, descendant_adapter: { fetchEnrolledBranch: () => ({ repository_identity: receipt.repository_identity, normalized_remote_digest: input.target.writer_authority.normalized_remote_digest, branch: input.target.writer_authority.branch, containing_head: receipt.accepted_commit, containing_tree_bytes, containing_tree_digest, entries, predecessor_boundary: receipt.predecessor_commit }), inspectCommit: () => inspected } };
}

test('PLAN047 B2 project fixture reaches status_ready with exact project grammar and no global manifest read', () => withStore((store, stateRoot) => {
  const fixture = projectB1Fixture(store); const result = continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now });
  assert.equal(result.stage, 'status_ready');
  assert.deepEqual([...new Set(fixture.calls)].sort(), [`show ${fixture.receipt.accepted_commit}:${fixture.rulePath}`, `show ${fixture.receipt.accepted_commit}:pidex/rules/managed/pidex-implementer/index.md`].sort()); assert.equal(fixture.calls.length, 8);
  const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); try { assert.deepEqual(JSON.parse(db.prepare('SELECT payload_json FROM publication_handoff_stage_current WHERE transaction_digest = ?').get(fixture.receipt.transaction_digest).payload_json).member, { rule_id: fixture.receipt.rule_id, path: fixture.rulePath, content_hash: fixture.receipt.content_hash }); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM effective_projection').get().count, 1); } finally { db.close(); }
  const detail = readRulePublicationStatusDetail({ store, transaction_digest: fixture.receipt.transaction_digest });
  assert.equal(detail.publication.visible_label, 'Published and verified'); assert.equal(detail.publication.refinement, true);
  assert.deepEqual(Object.keys(detail.publication).sort(), RULE_PUBLICATION_STATUS_SCHEMA.detail_keys.slice().sort()); assert.doesNotMatch(JSON.stringify(detail), /repo:project-b1/);
  store.setLocalRuleStop({ repository: fixture.input.target.repository, scope_id: fixture.receipt.scope_id, rule_id: fixture.receipt.rule_id, reason_code: 'operator_stop' });
  assert.equal(readRulePublicationStatusDetail({ store, transaction_digest: fixture.receipt.transaction_digest }).publication.refinement, false, 'local stop disables refinement');
}));
test('PLAN047 B1 stage API exact retry rejects alter/skip and rolls event/current faults back', () => withStore((store) => {
  const fixture = projectB1Fixture(store); const payload = { accepted_commit: fixture.receipt.accepted_commit, containing_head: fixture.receipt.accepted_commit };
  assert.equal(store.advancePublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key, stage: 'receipt_consumed', payload, created_at: now }).status, 'advanced');
  assert.equal(store.advancePublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key, stage: 'receipt_consumed', payload, created_at: now }).status, 'existing');
  assert.throws(() => store.advancePublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key, stage: 'receipt_consumed', payload: { ...payload, containing_head: hex('d', 40) }, created_at: now }), /RULE_PUBLICATION_HANDOFF_STAGE_CONFLICT/);
  assert.throws(() => store.advancePublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key, stage: 'mirror_verified', payload, created_at: now }), /RULE_PUBLICATION_HANDOFF_STAGE_TRANSITION_INVALID/);
  for (const checkpoint of ['after_event', 'after_current']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-b1-stage-${checkpoint}-`)); let reopened = openRuleLifecycleStore({ stateRoot });
    try {
      const row = projectB1Fixture(reopened); const expected = { accepted_commit: row.receipt.accepted_commit, containing_head: row.receipt.accepted_commit };
      assert.throws(() => reopened.advancePublicationHandoffStage({ idempotency_key: row.input.idempotency_key, stage: 'receipt_consumed', payload: expected, created_at: now, fault: (seen) => { if (seen === checkpoint) throw new Error(checkpoint); } }), new RegExp(checkpoint));
      reopened.close(); reopened = openRuleLifecycleStore({ stateRoot }); assert.equal(reopened.readPublicationHandoffStage({ idempotency_key: row.input.idempotency_key }).stage, 'receipt_accepted');
      assert.equal(reopened.advancePublicationHandoffStage({ idempotency_key: row.input.idempotency_key, stage: 'receipt_consumed', payload: expected, created_at: now }).status, 'advanced');
    } finally { try { reopened.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
}));
test('PLAN047 Slice5B2 projects verified project mirror, reattests fresh runtime, then exposes status', () => withStore((store, stateRoot) => {
  const fixture = projectB1Fixture(store);
  const result = continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now });
  assert.equal(result.status, 'status_ready');
  assert.equal(result.stage, 'status_ready');
  const projection = store.readProjection({ repository: fixture.input.target.repository, scope_id: fixture.receipt.scope_id });
  assert.equal(projection.head.accepted_remote_head, fixture.receipt.accepted_commit);
  assert.equal(projection.head.tree_digest, fixture.shaped.containing_tree_digest);
  assert.deepEqual(projection.entries.map(({ rule_id, rule_version, content_hash, lifecycle_state }) => ({ rule_id, rule_version, content_hash, lifecycle_state })), [{ rule_id: fixture.receipt.rule_id, rule_version: fixture.receipt.content_hash, content_hash: fixture.receipt.content_hash, lifecycle_state: 'active' }]);
}));
test('PLAN047 B2 tamper: projection digest/head drift after projection blocks status after reopen', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-b2-projection-tamper-')); let store = openRuleLifecycleStore({ stateRoot });
  try {
    const fixture = projectB1Fixture(store);
    assert.throws(() => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault: (checkpoint) => { if (checkpoint === 'before_reattest') throw new Error('fault'); } }), /fault/);
    assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, 'projection_applied');
    store.close();
    const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
    db.prepare('UPDATE effective_projection SET accepted_head = ? WHERE repository = ? AND scope_id = ?').run(hex('e', 40), fixture.input.target.repository, fixture.input.target.scope_id); db.close();
    store = openRuleLifecycleStore({ stateRoot });
    assert.throws(() => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now }), /RULE_PUBLICATION_HANDOFF_REATTEST_INVALID/);
    assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, 'projection_applied');
  } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
});
test('PLAN047 B2 tamper: closed epoch, stale mirror, and local stop block continuation until fresh authority recovers', () => {
  for (const [name, mutate, recover] of [
    ['epoch', (db, fixture) => db.prepare('UPDATE activation_epoch SET closed_at = ? WHERE repository = ? AND scope_id = ?').run(now, fixture.input.target.repository, fixture.input.target.scope_id), () => {}],
    ['mirror', () => {}, (stateRoot) => rmSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'mirrors'), { recursive: true, force: true })],
    ['stop', (db, fixture) => db.prepare('INSERT INTO local_narrowing (repository, scope_id, rule_id, reason_code) VALUES (?, ?, ?, ?)').run(fixture.input.target.repository, fixture.input.target.scope_id, fixture.receipt.rule_id, 'operator_stop'), () => {}],
  ]) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-b2-${name}-tamper-`)); let store = openRuleLifecycleStore({ stateRoot });
    try {
      const fixture = projectB1Fixture(store);
      assert.throws(() => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault: (checkpoint) => { if (checkpoint === 'before_reattest') throw new Error('fault'); } }), /fault/);
      store.close(); const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); mutate(db, fixture); db.close(); recover(stateRoot);
      store = openRuleLifecycleStore({ stateRoot });
      assert.throws(() => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now }), /RULE_PUBLICATION_HANDOFF_REATTEST_INVALID/);
      assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, 'projection_applied', name);
    } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('PLAN047 Slice5B2 restart boundaries keep status hidden until durable final stage', () => {
  const boundaries = [['before_projection', 'mirror_verified'], ['after_projection', 'mirror_verified'], ['before_reattest', 'projection_applied'], ['after_reattest', 'projection_applied'], ['before_status_ready', 'reattested'], ['after_status_ready', 'status_ready']];
  for (const [checkpoint, expectedStage] of boundaries) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-b2-${checkpoint}-`)); let store = openRuleLifecycleStore({ stateRoot });
    try {
      const fixture = projectB1Fixture(store); const run = (fault) => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault });
      assert.throws(() => run((seen) => { if (seen === checkpoint) throw new Error(checkpoint); }), new RegExp(checkpoint));
      assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, expectedStage);
      store.close(); store = openRuleLifecycleStore({ stateRoot });
      assert.equal(run().stage, 'status_ready');
    } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('PLAN047 B2 crash tamper matrix', () => {
  const sourceMutations = [
    ['projection-entry', (db, fixture) => { const row = db.prepare('SELECT entries_json FROM effective_projection WHERE repository = ? AND scope_id = ?').get(fixture.input.target.repository, fixture.input.target.scope_id); const entries = JSON.parse(row.entries_json); entries.find((entry) => entry.rule_id === fixture.receipt.rule_id).content_hash = hex('9'); db.prepare('UPDATE effective_projection SET entries_json = ? WHERE repository = ? AND scope_id = ?').run(JSON.stringify(entries), fixture.input.target.repository, fixture.input.target.scope_id); }],
    ['projection-head', (db, fixture) => db.prepare('UPDATE effective_projection SET accepted_head = ? WHERE repository = ? AND scope_id = ?').run(hex('e', 40), fixture.input.target.repository, fixture.input.target.scope_id)],
    ['projection-stage-digest', (db, fixture) => db.prepare('UPDATE publication_handoff_stage_current SET payload_digest = ? WHERE transaction_digest = ?').run(hex('0'), fixture.receipt.transaction_digest)],
    ['descriptor-only-epoch-missing', (db, fixture) => db.prepare('DELETE FROM activation_epoch WHERE repository = ? AND scope_id = ? AND rule_id = ?').run(fixture.input.target.repository, fixture.input.target.scope_id, fixture.receipt.rule_id)],
    ['epoch-close', (db, fixture) => db.prepare('UPDATE activation_epoch SET closed_at = ? WHERE repository = ? AND scope_id = ? AND rule_id = ?').run(now, fixture.input.target.repository, fixture.input.target.scope_id, fixture.receipt.rule_id)],
    ['epoch-activation-id', (db, fixture) => db.prepare('UPDATE activation_epoch SET activation_epoch = ? WHERE repository = ? AND scope_id = ? AND rule_id = ?').run('epoch:changed', fixture.input.target.repository, fixture.input.target.scope_id, fixture.receipt.rule_id)],
    ['descriptor-only-mirror-absent', (_db, fixture, stateRoot) => rmSync(path.dirname(b2MirrorGeneration(stateRoot, fixture)), { recursive: true, force: true })],
    ['mirror-member-bytes', (_db, fixture, stateRoot) => writeFileSync(b2MirrorMember(stateRoot, fixture), 'tampered')],
    ['mirror-generation-bytes', (_db, fixture, stateRoot) => writeFileSync(b2MirrorGeneration(stateRoot, fixture), '{}')],
    ['mirror-member-symlink', (_db, fixture, stateRoot) => { const member = b2MirrorMember(stateRoot, fixture); const external = path.join(stateRoot, 'outside-member'); writeFileSync(external, fixture.member); rmSync(member); symlinkSync(external, member); }],
    ['mirror-member-hardlink', (_db, fixture, stateRoot) => { const member = b2MirrorMember(stateRoot, fixture); const external = path.join(stateRoot, 'outside-member'); linkSync(member, external); rmSync(member); linkSync(external, member); }],
  ];
  for (const stage of ['projection_applied', 'reattested']) for (const [name, mutate] of sourceMutations) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-b2-${stage}-${name}-`)); let store = openRuleLifecycleStore({ stateRoot });
    try {
      const fixture = projectB1Fixture(store); const run = (fault) => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault });
      const checkpoint = stage === 'projection_applied' ? 'before_reattest' : 'before_status_ready'; assert.throws(() => run((seen) => { if (seen === checkpoint) throw new Error('pause'); }), /pause/); assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, stage);
      store.close(); const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); mutate(db, fixture, stateRoot); db.close(); store = openRuleLifecycleStore({ stateRoot });
      let result; try { result = run(); } catch (error) { assert.match(error.message, /^RULE_(?:PUBLICATION_HANDOFF|RUNTIME_MIRROR)_/); }
      assert.notEqual(result?.status, 'status_ready', `${stage}/${name}`); assert.notEqual(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key })?.stage, 'status_ready', `${stage}/${name}`);
      const db2 = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); try { assert.equal(db2.prepare("SELECT COUNT(*) AS count FROM publication_handoff_stage_event WHERE transaction_digest = ? AND stage = 'status_ready'").get(fixture.receipt.transaction_digest).count, 0); } finally { db2.close(); }
    } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
  for (const stage of ['projection_applied', 'reattested']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-b2-cache-${stage}-`)); let store = openRuleLifecycleStore({ stateRoot });
    try {
      const fixture = projectB1Fixture(store); const run = (fault) => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault }); assert.throws(() => run((seen) => { if (seen === 'after_reattest') throw new Error('pause'); }), /pause/);
      const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); db.prepare('UPDATE runtime_context SET context_json = ? WHERE pipeline_id = ?').run('{"private":"VT11_RUNTIME_CACHE"}', `publication:${store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).receipt_digest}`); db.close(); store.close(); store = openRuleLifecycleStore({ stateRoot });
      assert.equal(run().status, 'status_ready'); const cache = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); try { assert.doesNotMatch(cache.prepare('SELECT context_json FROM runtime_context').get().context_json, /VT11_RUNTIME_CACHE/); } finally { cache.close(); }
    } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
  for (const [tier, create] of [['project', projectB1Fixture], ['global', globalB2Fixture]]) for (const stage of ['projection_applied', 'reattested']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-b2-stop-${tier}-${stage}-`)); let store = openRuleLifecycleStore({ stateRoot });
    try {
      const fixture = create(store); const run = (fault) => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault }); const checkpoint = stage === 'projection_applied' ? 'before_reattest' : 'before_status_ready'; assert.throws(() => run((seen) => { if (seen === checkpoint) throw new Error('pause'); }), /pause/);
      store.setLocalRuleStop({ repository: fixture.input.target.repository, scope_id: fixture.receipt.scope_id, rule_id: fixture.receipt.rule_id, reason_code: 'operator_stop' }); store.close(); store = openRuleLifecycleStore({ stateRoot }); assert.throws(() => run(), /RULE_PUBLICATION_HANDOFF_/); assert.notEqual(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key })?.stage, 'status_ready'); store.clearLocalRuleStop({ repository: fixture.input.target.repository, scope_id: fixture.receipt.scope_id, rule_id: fixture.receipt.rule_id }); assert.equal(run().status, 'status_ready');
    } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
  for (const checkpoint of ['before_projection', 'after_projection', 'before_reattest', 'after_reattest', 'before_status_ready', 'after_status_ready']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-b2-crash-${checkpoint}-`)); let store = openRuleLifecycleStore({ stateRoot });
    try { const fixture = projectB1Fixture(store); const run = (fault) => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault }); assert.throws(() => run((seen) => { if (seen === checkpoint) throw new Error('crash'); }), /crash/); store.close(); store = openRuleLifecycleStore({ stateRoot }); assert.equal(run().status, 'status_ready'); assert.equal(run().status, 'status_ready'); const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); try { for (const stage of ['projection_applied', 'reattested', 'status_ready']) assert.equal(db.prepare('SELECT COUNT(*) AS count FROM publication_handoff_stage_event WHERE transaction_digest = ? AND stage = ?').get(fixture.receipt.transaction_digest, stage).count, 1, `${checkpoint}/${stage}`); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lifecycle_event').get().count, 1); } finally { db.close(); } } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('PLAN047 B2 VT11 final privacy', () => withStore((store, stateRoot) => {
  const fixture = projectB1Fixture(store); const run = (fault) => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault }); const sentinels = { body: 'VT11_BODY', path: 'VT11_PATH', repository: 'VT11_REPOSITORY', remote: 'VT11_REMOTE', raw_error: 'VT11_RAW_ERROR', receipt: 'VT11_RECEIPT', staged_digest: 'VT11_STAGED' }; const outward = [run()];
  const replay = replayRemotePublicationHandoff({ store, idempotency_key: fixture.input.idempotency_key, handoff_input: { ...sentinels, descendant_adapter: fixture.shaped.descendant_adapter }, handoff: (value) => outward.push(value) }); outward.push(replay, store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }), store.readPublicationTransaction({ idempotency_key: fixture.input.idempotency_key }), store.readProjection({ repository: fixture.input.target.repository, scope_id: fixture.receipt.scope_id }));
  const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); try { const privateContext = db.prepare('SELECT context_json FROM runtime_context').get().context_json; assert.doesNotMatch(privateContext, /Validate quality checks|VT11_/); outward.push(db.prepare('SELECT receipt_digest, transaction_digest, result_json FROM receipt_consumption').all(), db.prepare('SELECT stage, payload_digest, payload_json FROM publication_handoff_stage_current').all(), db.prepare('SELECT stage, payload_digest FROM publication_handoff_stage_event').all()); } finally { db.close(); }
  assert.doesNotMatch(JSON.stringify(outward), /VT11_|\"scope_id\":\"\"/);
}));
function globalB2Fixture(store) {
  const input = prepared(store); const rulePath = 'rules/pidex-implementer/quality.md'; const member = Buffer.from(`<!-- pidex-rule-receipt-v1 {\"rule_id\":\"${input.target.rule_id}\",\"admission_digest\":\"${sha(input.admission_bytes)}\",\"transaction_digest\":\"${input.idempotency_key.slice(3)}\",\"lifecycle_state\":\"active\"} -->\n# quality\n`); const staged = Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, hex(String(index + 1))])); staged[rulePath] = sha(member); commitLocalPublicationTransaction({ store, idempotency_key: input.idempotency_key, commit: hex('b', 40), parent: input.expected_base, tree_digest: hex('c'), staged_member_digests: staged, now }); const shaped = writerShapedProof(store, input, 1); const receipt = { ...shaped.receipt, content_hash: sha(member) }; const index = Buffer.from('# PIDEX Implementer Rules\n\n| Rule | File | PROC-NEW | Summary |\n|------|------|----------|---------|\n| Quality | [quality](quality.md) | PROC-NEW | Managed rule. |\n'); const manifestBody = { schema: 'pidex-bundled-rule-seed-v1', source_kind: 'packaged_baseline', baseline_parent_commit: input.expected_base, agent_count: 0, rule_count: 2, agents: [], rules: [{ rule_id: 'legacy:rules:pidex-implementer:index', path: 'rules/pidex-implementer/index.md', byte_hash: sha(index), protection_class: 'legacy_baseline' }, { rule_id: receipt.rule_id, path: rulePath, byte_hash: receipt.content_hash, protection_class: 'legacy_baseline' }] }; const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value); const manifest = Buffer.from(JSON.stringify({ ...manifestBody, aggregate_digest: sha(Buffer.from(canonical(manifestBody))) })); const capability = store.attestPublicationRemoteProof({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, adapter: shaped.descendant_adapter }); store.acceptRemotePublicationTransaction({ idempotency_key: input.idempotency_key, receipt, publication_proof: shaped.proof, proof_capability: capability, created_at: now }); const git = (args) => { const command = args.slice(2).join(' '); if (command === `show ${receipt.accepted_commit}:${rulePath}`) return member; if (command === `show ${receipt.accepted_commit}:rules/pidex-implementer/index.md`) return index; if (command === `show ${receipt.accepted_commit}:config/rule-baseline-manifest.json`) return manifest; throw new Error(command); }; return { input, receipt, shaped, member, rulePath, git };
}
function b2MirrorGeneration(stateRoot, fixture) { return path.join(stateRoot, 'quality', 'rule-lifecycle', 'mirrors', sha(Buffer.from(`${fixture.input.target.repository}\0${fixture.receipt.scope_id}`)), fixture.receipt.accepted_commit, 'generation.json'); }
function b2MirrorMember(stateRoot, fixture) { return path.join(path.dirname(b2MirrorGeneration(stateRoot, fixture)), fixture.rulePath); }

test('PLAN047 B1 durable coordinator replay converges one mirror and one stage row after reopen', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-b1-replay-')); let store = openRuleLifecycleStore({ stateRoot });
  try {
    const fixture = projectB1Fixture(store); const run = (fault) => continuePublicationHandoff({ store, transaction: fixture.input.idempotency_key, stateRoot, repository_root: '/project-fixture', git: fixture.git, descendant_adapter: fixture.shaped.descendant_adapter, now, fault });
    assert.throws(() => run((seen) => { if (seen === 'after_bundle_acquisition') throw new Error(seen); }), /after_bundle_acquisition/); assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, 'receipt_consumed');
    store.close(); store = openRuleLifecycleStore({ stateRoot }); assert.throws(() => run((seen) => { if (seen === 'after_mirror_materialization') throw new Error(seen); }), /after_mirror_materialization/); assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, 'bundle_verified');
    const mirrorFile = path.join(stateRoot, 'quality', 'rule-lifecycle', 'mirrors', sha(Buffer.from(`${fixture.input.target.repository}\0${fixture.receipt.scope_id}`)), fixture.receipt.accepted_commit, fixture.rulePath); writeFileSync(mirrorFile, '# collision\n'); assert.throws(() => run(), /RULE_MIRROR_GENERATION_COLLISION/); assert.equal(store.readPublicationHandoffStage({ idempotency_key: fixture.input.idempotency_key }).stage, 'bundle_verified'); writeFileSync(mirrorFile, fixture.member);
    store.close(); store = openRuleLifecycleStore({ stateRoot }); assert.equal(run().stage, 'status_ready'); assert.equal(run().stage, 'status_ready');
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); try {
      assert.deepEqual(db.prepare('SELECT stage, COUNT(*) AS count FROM publication_handoff_stage_event WHERE transaction_digest = ? GROUP BY stage ORDER BY MIN(event_sequence)').all(fixture.receipt.transaction_digest).map((row) => ({ ...row })), [{ stage: 'receipt_accepted', count: 1 }, { stage: 'receipt_consumed', count: 1 }, { stage: 'bundle_verified', count: 1 }, { stage: 'mirror_verified', count: 1 }, { stage: 'projection_applied', count: 1 }, { stage: 'reattested', count: 1 }, { stage: 'status_ready', count: 1 }]);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM receipt_consumption WHERE transaction_digest = ?').get(fixture.receipt.transaction_digest).count, 1); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM effective_projection').get().count, 1);
    } finally { db.close(); }
  } finally { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); }
});
import { deriveLifecycleActionIdempotencyKey, prepareLifecycleActionPublicationTransaction, commitLocalLifecycleActionTransaction, acceptLifecycleActionRemoteReceipt, continueLifecycleActionHandoff } from './rule-publication-transaction.mjs';

const ACTION_NOW = '2026-08-22T12:00:00.000Z';
function actionFixture(tier = 'project') {
  const expected_base = hex('a', 40); const scope_id = tier === 'global' ? 'pidex-global' : hex('7', 24);
  const rule_id = tier === 'global' ? 'pidex-global:pidex-implementer:quality' : `project:${scope_id}:pidex-implementer:quality`; const cadence_digest = hex('5');
  const action = { schema: 'pidex-rule-lifecycle-action-request-v1', tier, repository_scope_digest: hex('d'), rule_id, predecessor_commit: expected_base, version_hash: hex('6'), content_hash: hex('7'), activation_epoch: 'epoch:0123456789abcdef01234567', policy_id: 'passive-impact-v1', policy_digest: hex('8'), closed_window_id: 'window:slice1', result_digest: hex('9'), lifecycle_transition: 'deactivated', cadence_digest };
  const body = '# quality\n\n## Instruction\nValidate quality checks.\n';
  const rule_bytes = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${rule_id}","admission_digest":"${hex('e')}","transaction_digest":"${hex('f')}","lifecycle_state":"active"} -->\n${body}`, 'utf8');
  const writer_authority = { normalized_remote_digest: hex('a'), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: hex('b'), identity_platform: 'posix', root_identity_digest: hex('c'), parent_identity_digest: hex('d'), files_identity_digest: hex('e'), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  const allowed_paths = tier === 'global' ? ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md'] : ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/quality.md'];
  const target = { repository: 'repo:action', tier, scope_id, scope_digest: hex('d'), rule_id, predecessor: `commit:${expected_base}`, allowed_paths, enrollment_digest: hex('9'), writer_authority };
  return { action, rule_bytes, target, expected_base, idempotency_key: deriveLifecycleActionIdempotencyKey({ action, expected_base }), cadence_digest, scope_id, rule_id, tier };
}
function actionPrepared(store, input = actionFixture()) { store.enroll({ repository: input.target.repository, scope_id: input.scope_id === 'pidex-global' ? null : input.scope_id, remote: 'https://example.invalid/pidex', branch: input.target.writer_authority.branch }); store.enrollPublicationTarget(input.target); prepareLifecycleActionPublicationTransaction({ store, ...input, now: ACTION_NOW }); return { ...input, idempotency_key: deriveLifecycleActionIdempotencyKey({ action: input.action, expected_base: input.expected_base }) }; }
function reactivationInput(lifecycle_state, overrides = {}) { const base = actionFixture(); const action = { ...base.action, lifecycle_transition: lifecycle_state, ...(overrides.action || {}) }; if (overrides.cadence_digest) action.cadence_digest = overrides.cadence_digest; return { ...base, ...overrides, action, rule_bytes: Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${base.rule_id}","admission_digest":"${hex('e')}","transaction_digest":"${hex('f')}","lifecycle_state":"deactivated"} -->\n# quality\n`) }; }
function actionMember(input, lifecycle_state = 'deactivated') { return Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${input.rule_id}","admission_digest":"${hex('e')}","transaction_digest":"${input.idempotency_key.slice(3)}","lifecycle_state":"${lifecycle_state}"} -->\n# quality\n`); }
function actionCommitted(store, input, memberBytes, commit = hex('b', 40)) {
  const rulePath = input.target.allowed_paths.find((item) => item.endsWith('quality.md')); const content_hash = sha(memberBytes);
  commitLocalLifecycleActionTransaction({ store, idempotency_key: input.idempotency_key, commit, parent: input.expected_base, tree_digest: hex('c'), staged_member_digests: Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, item === rulePath ? content_hash : hex(String(index + 1))])), now: ACTION_NOW });
  return { commit, rulePath, content_hash };
}
function actionAdapter(input, commit, memberBytes) {
  const rulePath = input.target.allowed_paths.find((item) => item.endsWith('quality.md')); const content_hash = sha(memberBytes);
  const action_digest = sha(Buffer.from(JSON.stringify(input.action, Object.keys(input.action).sort())));
  const entries = [{ commit_oid: commit, parent_oids: [input.expected_base], tree_oid: oid(96) }];
  const members = Object.fromEntries(input.target.allowed_paths.map((memberPath, index) => [memberPath, { blob_oid: oid(index + 128), content_hash: memberPath === rulePath ? content_hash : hex(String(index + 1)) }]));
  const trailers = { 'PIDEX-Rule-ID': input.rule_id, 'PIDEX-Transaction-Digest': input.idempotency_key.slice(3), 'PIDEX-Admission-Digest': action_digest, 'PIDEX-Predecessor': `commit:${input.expected_base}`, 'PIDEX-Action-Cadence': input.cadence_digest };
  const containing_tree_bytes = Buffer.from(`canonical-tree:${oid(96)}`); const containing_tree_digest = sha(containing_tree_bytes);
  const descendant_adapter = { fetchEnrolledBranch: () => ({ repository_identity: input.target.writer_authority.repository_identity_digest, normalized_remote_digest: input.target.writer_authority.normalized_remote_digest, branch: input.target.writer_authority.branch, containing_head: commit, containing_tree_bytes, containing_tree_digest, entries, predecessor_boundary: input.expected_base }), inspectCommit: (value) => value === commit ? { commit_oid: commit, parent_oids: [input.expected_base], tree_oid: oid(96), author: input.target.writer_authority.author, subject: `rules(${input.tier === 'global' ? 'global' : 'project'}): publish ${input.rule_id}`, trailers, managed_members: members } : { commit_oid: value, parent_oids: [input.expected_base], tree_oid: oid(96), managed_members: members } };
  return { rulePath, content_hash, descendant_adapter };
}
function actionAccepted(store, input, lifecycle_state = 'deactivated', memberBytes = actionMember(input, lifecycle_state), commit = hex('b', 40)) {
  const { descendant_adapter } = actionAdapter(input, commit, memberBytes); actionCommitted(store, input, memberBytes, commit);
  const writer_result = { status: 'receipt_pending', transaction: input.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'RC-03' };
  const accepted = acceptLifecycleActionRemoteReceipt({ store, writer_result, now: ACTION_NOW, descendant_adapter }); assert.equal(accepted.status, 'accepted_remote', lifecycle_state);
  const receipt = store.readLifecycleActionAcceptedReceipt({ idempotency_key: input.idempotency_key }); assert.equal(receipt.lifecycle_state, lifecycle_state);
  return { input, commit, memberBytes, receipt, ...actionAdapter(input, commit, memberBytes) };
}
function projectionHead(input, headKind, manifestDigest) { return { head_kind: headKind, repository_identity: input.target.repository, accepted_remote_head: input.expected_base, baseline_parent_commit: input.expected_base, manifest_digest: manifestDigest, tree_digest: hex('9'), seeded_at: null, verified_at: '2026-08-14T00:00:00.000Z', remote_checked_at: '2026-08-14T00:00:00.000Z', freshness: 'exact_head' }; }
function projectionEntry(input, lifecycle_state) { return { rule_id: input.rule_id, rule_version: input.action.content_hash, content_hash: input.action.content_hash, accepted_commit: input.expected_base, bytes: '# quality\n', tier: input.tier, scope_id: input.scope_id === 'pidex-global' ? null : input.scope_id, protection_class: 'none', source: input.tier === 'global' ? 'managed_global' : 'managed_project', lifecycle_state, created_at: '2026-08-14T00:00:00.000Z', source_head: input.expected_base, mirror_head: input.expected_base, mirror_digest: input.action.content_hash, agent: 'pidex-implementer', applicability: null }; }
function seedActive(store, input, headKind = 'current_project', manifestDigest = null) {
  const scope_id = input.scope_id === 'pidex-global' ? null : input.scope_id;
  store.replaceProjection({ repository: input.target.repository, scope_id, accepted_head: input.expected_base, head: projectionHead(input, headKind, manifestDigest), entries: [projectionEntry(input, 'active')], event_kind: 'baseline_imported' });
  const priorEpoch = store.readProjection({ repository: input.target.repository, scope_id }).entries.find((item) => item.rule_id === input.rule_id).activation_epoch;
  assert.match(priorEpoch, /^epoch:[a-f0-9]{24}$/); assert.equal(store.readLifecycleEpoch({ repository: input.target.repository, scope_id, rule_id: input.rule_id, rule_version: input.action.content_hash, activation_epoch: priorEpoch }).closed_at, null, 'active era epoch open');
  return { scope_id, priorEpoch };
}
function seedDeactivatedProjection(store, input, headKind = 'current_project', manifestDigest = null) {
  const { scope_id, priorEpoch } = seedActive(store, input, headKind, manifestDigest);
  store.replaceProjection({ repository: input.target.repository, scope_id, accepted_head: input.expected_base, head: projectionHead(input, headKind, manifestDigest), entries: [projectionEntry(input, 'deactivated')], event_kind: 'lifecycle_action_projection' });
  const prior = store.readProjection({ repository: input.target.repository, scope_id }).entries.find((item) => item.rule_id === input.rule_id);
  assert.equal(prior.lifecycle_state, 'deactivated'); assert.equal(prior.activation_epoch, undefined, 'deactivated projection strips epoch');
  const epochs = store.listLifecycleEpochs({ repository: input.target.repository, scope_id, rule_id: input.rule_id });
  assert.deepEqual(epochs.map((epoch) => epoch.activation_epoch), [priorEpoch]); assert.ok(epochs.every((epoch) => epoch.closed_at !== null), 'prior deactivated era has zero open epoch');
  return { scope_id, priorEpoch };
}
function handoffRepo(stateRoot, dir, input, memberBytes, rulePath, indexBytes, manifestBytes = Buffer.from('preserved-global-manifest-v2')) {
  const repoRoot = path.join(stateRoot, dir); mkdirSync(repoRoot, { recursive: true });
  writeFileSync(path.join(repoRoot, 'quality.md'), memberBytes); writeFileSync(path.join(repoRoot, 'index.md'), indexBytes); if (manifestBytes) writeFileSync(path.join(repoRoot, 'rule-baseline-manifest.json'), manifestBytes);
  return { repoRoot, git: (args) => { const name = args[3] || args[2]; if (name.endsWith(rulePath)) return memberBytes; if (name.endsWith('index.md')) return indexBytes; if (name.endsWith('config/rule-baseline-manifest.json')) return manifestBytes; throw new Error('missing ' + name); } };
}
const actionIndex = (input) => Buffer.from('# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| `' + input.rule_id + '` | [quality](quality.md) | active |\n');
function handoff(store, stateRoot, repoRoot, input, descendant_adapter, git) { return continueLifecycleActionHandoff({ store, transaction: input.idempotency_key, stateRoot, repository_root: repoRoot, git, descendant_adapter, durabilitySupported: true, now: ACTION_NOW }); }

test('Slice1B lifecycle-action TX prepares a deterministic key, binds exact action bytes, and never uses candidate/admission semantics', () => withStore((store) => {
  const input = actionPrepared(store);
  assert.match(input.idempotency_key, /^tx:[a-f0-9]{64}$/);
  const facts = store.readLifecycleActionWriterFacts({ idempotency_key: input.idempotency_key });
  assert.deepEqual({ state: facts.state, cadence: facts.cadence_digest, action: facts.action, lifecycle_action: facts.lifecycle_action, candidate: facts.candidate, admission: facts.admission_digest }, { state: 'prepared', cadence: input.cadence_digest, action: input.action, lifecycle_action: undefined, candidate: undefined, admission: undefined });
  assert.equal(store.readPublicationTransaction({ idempotency_key: input.idempotency_key }), undefined);
  assert.equal(prepareLifecycleActionPublicationTransaction({ store, ...input, now: ACTION_NOW }).status, 'existing');
  assert.throws(() => prepareLifecycleActionPublicationTransaction({ store, ...input, action: { ...input.action, result_digest: hex('0') }, now: ACTION_NOW }), /RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT/);
}));
test('Slice1B lifecycle-action TX conflicts on duplicate cadence identity and commits local facts with bounded allowlist', () => withStore((store) => {
  const input = actionPrepared(store);
  const otherWindow = { ...input, action: { ...input.action, closed_window_id: 'window:other' }, idempotency_key: deriveLifecycleActionIdempotencyKey({ action: { ...input.action, closed_window_id: 'window:other' }, expected_base: input.expected_base }) };
  assert.throws(() => prepareLifecycleActionPublicationTransaction({ store, ...otherWindow, now: ACTION_NOW }), /RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT/);
  const { commit } = actionCommitted(store, input, actionMember(input));
  const facts = store.readLifecycleActionWriterFacts({ idempotency_key: input.idempotency_key });
  assert.deepEqual({ state: facts.state, local: facts.local_commit }, { state: 'committed_local', local: commit });
  assert.deepEqual(Object.keys(facts.staged_member_digests).sort(), input.target.allowed_paths.slice().sort());
  assert.throws(() => commitLocalLifecycleActionTransaction({ store, idempotency_key: input.idempotency_key, commit: hex('c', 40), parent: input.expected_base, tree_digest: hex('c'), staged_member_digests: Object.fromEntries(input.target.allowed_paths.map((item, index) => [item, hex(String(index + 1))])), now: ACTION_NOW }), /RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT/);
}));
test('Slice1B lifecycle-action acceptance records one deactivated receipt and exact replay returns existing', () => withStore((store) => {
  const input = actionPrepared(store); const { commit, descendant_adapter } = actionAccepted(store, input);
  const receipt = store.readLifecycleActionAcceptedReceipt({ idempotency_key: input.idempotency_key });
  assert.equal(receipt.lifecycle_state, 'deactivated'); assert.equal(receipt.accepted_commit, commit);
  const writer_result = { status: 'receipt_pending', transaction: input.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'RC-03' };
  assert.equal(acceptLifecycleActionRemoteReceipt({ store, writer_result, now: ACTION_NOW, descendant_adapter }).status, 'existing');
  assert.equal(store.readLifecycleActionAcceptedReceipt({ idempotency_key: input.idempotency_key }).transaction_digest, input.idempotency_key.slice(3));
  assert.equal(store.readLifecycleActionAcceptedReceipt({ idempotency_key: input.idempotency_key }).accepted_commit, commit);
}));
test('Slice1C deactivation handoff verifies deactivated mirror, closes prior epoch, and creates no new epoch', () => withStore((store, stateRoot) => {
  const { input, commit, rulePath, descendant_adapter, memberBytes } = actionAccepted(store, actionPrepared(store));
  const { scope_id, priorEpoch } = seedActive(store, input);
  const { repoRoot, git } = handoffRepo(stateRoot, 'repo-root', input, memberBytes, rulePath, actionIndex(input));
  assert.equal(handoff(store, stateRoot, repoRoot, input, descendant_adapter, git).status, 'handoff_pending');
  assert.equal(store.readLifecycleActionHandoffStage({ idempotency_key: input.idempotency_key }).stage, 'mirror_verified');
  assert.equal(handoff(store, stateRoot, repoRoot, input, descendant_adapter, git).status, 'status_ready');
  assert.equal(store.readLifecycleActionHandoffStage({ idempotency_key: input.idempotency_key }).stage, 'status_ready');
  const entry = store.readProjection({ repository: input.target.repository, scope_id }).entries.find((item) => item.rule_id === input.rule_id);
  assert.equal(entry.lifecycle_state, 'deactivated'); assert.equal(entry.accepted_commit, commit);
  const epochs = store.listLifecycleEpochs({ repository: input.target.repository, scope_id, rule_id: input.rule_id });
  assert.deepEqual(epochs.map((epoch) => epoch.activation_epoch), [priorEpoch], 'same prior epoch closed, no new epoch');
  assert.ok(epochs.every((epoch) => epoch.closed_at !== null), 'no open epoch after deactivation'); assert.equal(epochs.some((epoch) => epoch.closed_at === null), false);
}));
test('Slice1C deactivation handoff rejects unverified mirror, wrong bundle, and wrong epoch state with zero projection mutation', () => withStore((store, stateRoot) => {
  const { input, rulePath, descendant_adapter } = actionAccepted(store, actionPrepared(store));
  const tampered = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${input.rule_id}","lifecycle_state":"deactivated"} -->\nTampered body.\n`);
  const { repoRoot, git } = handoffRepo(stateRoot, 'repo-root2', input, tampered, rulePath, actionIndex(input));
  assert.throws(() => handoff(store, stateRoot, repoRoot, input, descendant_adapter, git), /RULE_LIFECYCLE_ACTION_HANDOFF_BUNDLE_INVALID/);
  assert.equal(store.readLifecycleActionHandoffStage({ idempotency_key: input.idempotency_key }).stage, 'receipt_accepted');
  assert.deepEqual(store.readProjection({ repository: input.target.repository, scope_id: input.scope_id === 'pidex-global' ? null : input.scope_id }), undefined);
}));
test('Slice2 global lifecycle-action receipt and handoff parity closes prior epoch, creates no new epoch, and preserves index/body', () => withStore((store, stateRoot) => {
  const input = actionPrepared(store, actionFixture('global'));
  const { commit, rulePath, descendant_adapter, memberBytes } = actionAccepted(store, input);
  const receipt = store.readLifecycleActionAcceptedReceipt({ idempotency_key: input.idempotency_key });
  assert.equal(receipt.lifecycle_state, 'deactivated'); assert.equal(receipt.scope_id, 'pidex-global');
  const { scope_id, priorEpoch } = seedActive(store, input, 'accepted_remote', sha(Buffer.from('prior-global-manifest')));
  const indexBytes = Buffer.from('# PIDEX Implementer Rules\n\n| Rule | File | PROC-NEW | Summary |\n|------|------|----------|---------|\n| Quality | [quality](quality.md) | PROC-NEW | Managed rule. |\n');
  const preservedManifest = Buffer.from('preserved-global-manifest-v2');
  const { repoRoot, git } = handoffRepo(stateRoot, 'repo-root-global', input, memberBytes, rulePath, indexBytes, preservedManifest);
  assert.equal(handoff(store, stateRoot, repoRoot, input, descendant_adapter, git).status, 'handoff_pending');
  assert.equal(handoff(store, stateRoot, repoRoot, input, descendant_adapter, git).status, 'status_ready');
  const entry = store.readProjection({ repository: input.target.repository, scope_id }).entries.find((item) => item.rule_id === input.rule_id);
  assert.equal(entry.lifecycle_state, 'deactivated'); assert.equal(entry.accepted_commit, commit); assert.equal(entry.tier, 'global');
  assert.equal(store.readProjection({ repository: input.target.repository, scope_id }).head.manifest_digest, sha(preservedManifest), 'M-4: projection head manifest digest is the actual preserved manifest bytes digest, never a synthetic constant');
  const epochs = store.listLifecycleEpochs({ repository: input.target.repository, scope_id, rule_id: input.rule_id });
  assert.deepEqual(epochs.map((epoch) => epoch.activation_epoch), [priorEpoch], 'same prior global epoch closed, no new epoch');
  assert.ok(epochs.every((epoch) => epoch.closed_at !== null), 'no open epoch after global deactivation');
}));
// ---- Slice3A reactivation: canonical active-monitor/active-pinned transitions, two-gate fresh epoch, unconverged preservation ----
test('Slice3A reactivation mints a fresh epoch only after accepted_remote plus verified active mirror projection, for active-monitor and active-pinned', () => withStore(() => {
  for (const lifecycle_state of ['active-monitor', 'active-pinned']) {
    const stateRoot2 = mkdtempSync(path.join(os.tmpdir(), 'pidex-reactivate-' + lifecycle_state + '-')); const store2 = openRuleLifecycleStore({ stateRoot: stateRoot2 });
    try {
      const { input, commit, rulePath, descendant_adapter, memberBytes } = actionAccepted(store2, actionPrepared(store2, reactivationInput(lifecycle_state)), lifecycle_state);
      const { scope_id, priorEpoch } = seedDeactivatedProjection(store2, input);
      const { repoRoot, git } = handoffRepo(stateRoot2, 'repo-root-reactivate', input, memberBytes, rulePath, actionIndex(input));
      assert.equal(handoff(store2, stateRoot2, repoRoot, input, descendant_adapter, git).status, 'handoff_pending', lifecycle_state);
      const beforeEpochs = store2.listLifecycleEpochs({ repository: input.target.repository, scope_id, rule_id: input.rule_id });
      const beforeProjection = store2.readProjection({ repository: input.target.repository, scope_id }).entries.find((item) => item.rule_id === input.rule_id);
      assert.equal(beforeProjection.lifecycle_state, 'deactivated', lifecycle_state + ': prior deactivated truth retained at mirror_verified');
      assert.deepEqual(beforeEpochs.map((epoch) => epoch.activation_epoch), [priorEpoch], lifecycle_state + ': zero epoch before mirror-verified projection');
      assert.ok(beforeEpochs.every((epoch) => epoch.closed_at !== null), lifecycle_state + ': no open epoch while unconverged');
      assert.equal(handoff(store2, stateRoot2, repoRoot, input, descendant_adapter, git).status, 'status_ready', lifecycle_state);
      const entry = store2.readProjection({ repository: input.target.repository, scope_id }).entries.find((item) => item.rule_id === input.rule_id);
      assert.equal(entry.lifecycle_state, lifecycle_state); assert.equal(entry.accepted_commit, commit);
      assert.match(entry.activation_epoch || '', /^epoch:[a-f0-9]{24}$/, lifecycle_state + ': fresh store-owned epoch minted on verified active projection');
      const epochs = store2.listLifecycleEpochs({ repository: input.target.repository, scope_id, rule_id: input.rule_id });
      assert.deepEqual(epochs.map((epoch) => epoch.activation_epoch).sort(), [entry.activation_epoch, priorEpoch].sort(), lifecycle_state);
      assert.equal(store2.readLifecycleEpoch({ repository: input.target.repository, scope_id, rule_id: input.rule_id, rule_version: entry.rule_version, activation_epoch: entry.activation_epoch }).closed_at, null, lifecycle_state + ': fresh epoch open');
      assert.equal(store2.readLifecycleEpoch({ repository: input.target.repository, scope_id, rule_id: input.rule_id, rule_version: input.action.content_hash, activation_epoch: priorEpoch }).closed_at !== null, true, lifecycle_state + ': prior era epoch stays closed');
      assert.notEqual(entry.activation_epoch, priorEpoch, lifecycle_state + ': fresh epoch invalidates prior evidence identity');
    } finally { try { store2.close(); } catch {} rmSync(stateRoot2, { recursive: true, force: true }); }
  }
}));
test('Slice3A reactivation preserves prior deactivated truth and zero epoch through prepared, committed-local, TX-04, and rejected outcomes', () => withStore((store, stateRoot) => {
  const input = actionPrepared(store, reactivationInput('active-monitor'));
  const { scope_id, priorEpoch } = seedDeactivatedProjection(store, input);
  const epochs = () => store.listLifecycleEpochs({ repository: input.target.repository, scope_id, rule_id: input.rule_id });
  const entry = () => store.readProjection({ repository: input.target.repository, scope_id }).entries.find((item) => item.rule_id === input.rule_id);
  assert.equal(entry().lifecycle_state, 'deactivated');
  assert.deepEqual(epochs().map((epoch) => epoch.activation_epoch), [priorEpoch], 'prepared stage mints no epoch');
  actionCommitted(store, input, actionMember(input));
  assert.deepEqual(epochs().map((epoch) => epoch.activation_epoch), [priorEpoch], 'committed-local stage mints no epoch');
  store.appendLifecycleActionTerminal({ idempotency_key: input.idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: ACTION_NOW });
  const pending = continueLifecycleActionHandoff({ store, transaction: input.idempotency_key, stateRoot, repository_root: path.join(stateRoot, 'missing'), git: () => { throw new Error('no git'); }, descendant_adapter: { fetchEnrolledBranch: () => { throw new Error('no remote'); }, inspectCommit: () => { throw new Error('no remote'); } }, durabilitySupported: true, now: ACTION_NOW });
  assert.equal(pending.status, 'handoff_pending');
  assert.equal(entry().lifecycle_state, 'deactivated', 'TX-04 outcome retains prior deactivated truth');
  assert.deepEqual(epochs().map((epoch) => epoch.activation_epoch), [priorEpoch], 'TX-04 outcome mints zero epoch');
  assert.ok(epochs().every((epoch) => epoch.closed_at !== null));
}));
test('Slice3A lifecycle-action TX and receipt allowlist accepts only deactivated, active-monitor, and active-pinned transitions and rejects unknown transitions', () => withStore((store) => {
  const base = actionFixture();
  for (const transition of ['active', 'stopped', 'purge', 'deactivated-active']) assert.throws(() => prepareLifecycleActionPublicationTransaction({ store, ...base, action: { ...base.action, lifecycle_transition: transition, cadence_digest: hex('5') }, now: ACTION_NOW }), /RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID/, transition);
  for (const [index, transition] of ['active-monitor', 'active-pinned'].entries()) {
    const cadence_digest = hex(String(index + 6)); // Distinct cadence identity per transition: one TX row per cadence key is a binding invariant.
    const input = actionPrepared(store, reactivationInput(transition, { cadence_digest }));
    const facts = store.readLifecycleActionWriterFacts({ idempotency_key: input.idempotency_key });
    assert.equal(facts.action.lifecycle_transition, transition);
    assert.match(facts.rule_bytes.toString('utf8'), new RegExp(`"lifecycle_state":"${transition}"`));
  }
  assert.equal(store.readLifecycleActionWriterFacts({ idempotency_key: actionPrepared(store, actionFixture()).idempotency_key }).action.lifecycle_transition, 'deactivated');
}));
