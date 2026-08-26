import { createHash } from 'node:crypto';
import { canonicalCandidateBytes, validRuleLearningCandidate } from './rule-learning-candidate.mjs';
import { readFileSync } from 'node:fs';
import { acquireAcceptedRemoteReceipt, prepareLifecycleRuntimeContext, verifyLifecycleActionRemoteProof } from './rule-lifecycle-store.mjs';
import { verifyCanonicalBundledManifest } from './rule-lifecycle.mjs';
import { verifyManagedRuleIndex } from './rule-git-writer.mjs';
import { materializeVerifiedMirror, renderVerifiedRuntimeRules } from './rule-mirror-sync.mjs';

const HEX = /^[a-f0-9]{64}$/;
const HEAD = /^[a-f0-9]{40}$/;
const TERMINAL = new Set(['accepted_remote', 'deferred_remote_advanced', 'rejected_policy', 'abandoned']);
const ADMISSION_KEYS = Object.freeze(['schema_version', 'candidate_digest', 'candidate_content_hash', 'admission_policy_digest', 'admission_policy_version', 'tier', 'repository_scope_digest', 'vote_digests']);
const RC02_FACT_KEYS = Object.freeze(['remote_contains_exact_commit', 'parent_matches', 'manifest_base_matches', 'commit_tree_matches', 'member_digests_match', 'containing_commit']);
const RC03_FACT_KEYS = Object.freeze(['remote_contains_exact_commit', 'remote_head', 'manifest_base_matches', 'enrollment_valid', 'commit_tree_matches', 'member_digests_match']);
const RC04_FACT_KEYS = Object.freeze(['remote_contains_exact_commit', 'remote_head']);
const RC05_FACT_KEYS = Object.freeze(['remote_contains_exact_commit', 'enrollment_valid', 'commit_tree_matches', 'member_digests_match']);
const RC06_FACT_KEYS = Object.freeze(['authorized_abandonment']);
const RECEIPT_PENDING_KEYS = Object.freeze(['status', 'transaction', 'prepared_commit', 'observed_head', 'recovery_code']);

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function handoffTargetEpoch({ repository, scope_id, entry }) { return { repository_digest: digest(repository), scope_id: scope_id || 'pidex-global', rule_id: entry.rule_id, rule_version: entry.rule_version, activation_epoch: entry.activation_epoch }; }
function handoffProjectionDigest({ repository, scope_id, projection, target_epoch }) { return digest(Buffer.from(canonical({ repository, scope_id: scope_id || 'pidex-global', accepted_head: projection.accepted_head, head: projection.head, entries: projection.entries, target_epoch }))); }
function assertHandoffProjectionAuthority({ store, facts, receipt, scope_id, projection, payload, code }) {
  const entry = projection?.entries?.find((item) => item.rule_id === receipt.rule_id);
  const target_epoch = entry && handoffTargetEpoch({ repository: facts.target.repository, scope_id, entry });
  const epoch = target_epoch && store.readLifecycleEpoch?.({ repository: facts.target.repository, scope_id, rule_id: receipt.rule_id, rule_version: target_epoch.rule_version, activation_epoch: target_epoch.activation_epoch });
  if (!entry || entry.lifecycle_state !== 'active' || entry.rule_version !== receipt.content_hash || entry.content_hash !== receipt.content_hash || !entry.activation_epoch || !epoch || epoch.closed_at !== null || !epoch.opened_at || facts.local_stop_active || payload?.containing_head !== projection.accepted_head || payload?.target_epoch === undefined || canonical(payload.target_epoch) !== canonical(target_epoch) || payload.projection_digest !== handoffProjectionDigest({ repository: facts.target.repository, scope_id, projection, target_epoch })) throw new Error(code);
  return { entry, target_epoch };
}
function freeze(value) { if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function parseExactBytes(bytes, invalid) { if (!Buffer.isBuffer(bytes)) throw new Error(invalid); let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(invalid); } if (!exact(value, Object.keys(value || {})) || !Buffer.from(JSON.stringify(value), 'utf8').equals(bytes)) throw new Error(invalid); return value; }
function validCandidate(value, bytes) { const canonical = canonicalCandidateBytes(value); return validRuleLearningCandidate(value) && typeof canonical === 'string' && Buffer.from(canonical, 'utf8').equals(bytes); }
function validAdmission(value, candidate) { return exact(value, ADMISSION_KEYS) && value.schema_version === 'pidex-living-rule-admission-v1' && value.candidate_digest === candidate.candidate_digest && value.candidate_content_hash === candidate.content_hash && value.admission_policy_digest === candidate.admission_policy_digest && value.admission_policy_version === candidate.admission_policy_version && value.tier === candidate.tier && value.repository_scope_digest === candidate.scope_digest && Array.isArray(value.vote_digests) && value.vote_digests.length === (candidate.tier === 'global' ? 3 : 2) && value.vote_digests.every((item) => typeof item === 'string' && HEX.test(item)) && new Set(value.vote_digests).size === value.vote_digests.length; }
function preparedInput(input) {
  const candidate = parseExactBytes(input?.candidate_bytes, 'RULE_PUBLICATION_CANDIDATE_INVALID');
  const admission = parseExactBytes(input?.admission_bytes, 'RULE_PUBLICATION_ADMISSION_INVALID');
  const candidate_bytes = Buffer.from(input.candidate_bytes);
  const admission_bytes = Buffer.from(input.admission_bytes);
  if (!validCandidate(candidate, candidate_bytes) || !validAdmission(admission, candidate)) throw new Error('RULE_PUBLICATION_TRANSACTION_INVALID');
  return { candidate, candidate_bytes, admission_bytes, candidate_digest: candidate.candidate_digest, admission_digest: digest(admission_bytes) };
}
function canonicalTarget(target) { return [target.repository, target.tier, target.scope_id, target.scope_digest, target.rule_id, target.predecessor, target.enrollment_digest, JSON.stringify(target.allowed_paths), JSON.stringify(target.writer_authority)]; }

/** Deterministic TX identity binds canonical bytes, enrolled target, and expected base. */
export function derivePublicationIdempotencyKey({ candidate_digest, admission_digest, target, expected_base } = {}) {
  if (!HEX.test(candidate_digest || '') || !HEX.test(admission_digest || '') || !target || !HEAD.test(expected_base || '')) throw new Error('RULE_PUBLICATION_TRANSACTION_INVALID');
  const hash = createHash('sha256'); for (const field of ['pidex-rule-publication-transaction-v1', candidate_digest, admission_digest, ...canonicalTarget(target), expected_base]) { const bytes = Buffer.from(String(field), 'utf8'); hash.update(`${bytes.length}:`, 'ascii'); hash.update(bytes); }
  return `tx:${hash.digest('hex')}`;
}

/** Persists only a re-parsed, enrolled, exact-byte TX-01; candidate/admission confer no publication authority. */
export function preparePublicationTransaction({ store, target, expected_base, idempotency_key, now, ...input } = {}) {
  if (!store || typeof store.preparePublicationTransaction !== 'function' || !HEAD.test(expected_base || '') || typeof now !== 'string') throw new Error('RULE_PUBLICATION_TRANSACTION_INVALID');
  const prepared = preparedInput(input);
  if (!target || target.rule_id !== prepared.candidate.rule_id || target.tier !== prepared.candidate.tier || target.scope_digest !== prepared.candidate.scope_digest || target.predecessor !== prepared.candidate.predecessor_commit || target.predecessor !== `commit:${expected_base}`) throw new Error('RULE_PUBLICATION_TRANSACTION_INVALID');
  const derived = derivePublicationIdempotencyKey({ candidate_digest: prepared.candidate_digest, admission_digest: prepared.admission_digest, target, expected_base });
  if (idempotency_key !== derived) throw new Error('RULE_PUBLICATION_TRANSACTION_INVALID');
  return store.preparePublicationTransaction({ target, expected_base, idempotency_key: derived, created_at: now, candidate_bytes: prepared.candidate_bytes, admission_bytes: prepared.admission_bytes, candidate_digest: prepared.candidate_digest, admission_digest: prepared.admission_digest, manual_admission: input.manual_admission, fault: input.fault });
}

/** Records TX-02 local object facts only. This module never invokes Git. */
export function commitLocalPublicationTransaction({ store, idempotency_key, commit, parent, tree_digest, staged_member_digests, now } = {}) {
  if (!store || typeof store.commitLocalPublicationTransaction !== 'function') throw new Error('RULE_PUBLICATION_LOCAL_COMMIT_INVALID');
  return store.commitLocalPublicationTransaction({ idempotency_key, commit, parent, tree_digest, staged_member_digests, created_at: now });
}

/** Maps closed writer proof to receipt facts owned by durable enrollment/TX state; never accepts caller receipt bytes. */
export function acceptRemotePublicationTransaction({ store, writer_result, now, fault, handoff = acquireAcceptedRemoteReceipt, handoff_input = {}, descendant_adapter } = {}) {
  if (!store || typeof store.readPublicationWriterFacts !== 'function' || typeof store.acceptRemotePublicationTransaction !== 'function' || typeof store.attestPublicationRemoteProof !== 'function' || !exact(writer_result, RECEIPT_PENDING_KEYS) || writer_result.status !== 'receipt_pending' || !/^tx:[a-f0-9]{64}$/.test(writer_result.transaction || '') || !HEAD.test(writer_result.prepared_commit || '') || !HEAD.test(writer_result.observed_head || '') || !['RC-02', 'RC-03'].includes(writer_result.recovery_code) || typeof now !== 'string') throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
  const integrity = store.readPublicationReceiptIntegrity?.({ idempotency_key: writer_result.transaction });
  const existingReceipt = typeof store.readPublicationAcceptedReceipt === 'function' ? store.readPublicationAcceptedReceipt({ idempotency_key: writer_result.transaction }) : undefined;
  if (existingReceipt) {
    if (integrity?.status !== 'verified' || !HEX.test(integrity.receipt_digest || '') || existingReceipt.accepted_commit !== writer_result.prepared_commit) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
    if (typeof handoff !== 'function') return Object.freeze({ status: 'handoff_pending', transaction: writer_result.transaction, receipt_digest: integrity.receipt_digest });
    try { handoff({ store, descendant_adapter: handoff_input.descendant_adapter, receipt: existingReceipt, publication_proof: store.readPublicationHandoffHeadProofs?.({ idempotency_key: writer_result.transaction }).at(-1) }); } catch { return Object.freeze({ status: 'handoff_pending', transaction: writer_result.transaction, receipt_digest: integrity.receipt_digest }); }
    return Object.freeze({ status: 'existing', transaction: writer_result.transaction, receipt_digest: integrity.receipt_digest });
  }
  if (integrity?.status === 'receipt_incomplete') return Object.freeze({ status: 'receipt_incomplete', transaction: writer_result.transaction });
  const facts = store.readPublicationWriterFacts({ idempotency_key: writer_result.transaction });
  if (!facts || facts.state !== 'committed_local' || facts.idempotency_key !== writer_result.transaction || facts.local_commit !== writer_result.prepared_commit || facts.local_parent !== facts.expected_base || !HEX.test(facts.local_tree_digest || '') || !facts.staged_member_digests || !facts.target || !facts.writer_authority) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
  const global = facts.target.tier === 'global'; const rulePath = global ? `rules/${facts.candidate.agent}/${facts.candidate.slug}.md` : `pidex/rules/managed/${facts.candidate.agent}/${facts.candidate.slug}.md`;
  const content_hash = facts.staged_member_digests[rulePath];
  if (!HEX.test(content_hash || '') || facts.target.rule_id !== facts.candidate.rule_id) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: facts.writer_authority.repository_identity_digest, scope_id: global ? 'pidex-global' : facts.target.scope_id, rule_id: facts.target.rule_id, predecessor_commit: facts.expected_base, accepted_commit: facts.local_commit, tree_digest: facts.local_tree_digest, content_hash, admission_digest: facts.admission_digest, transaction_digest: facts.idempotency_key.slice(3), lifecycle_state: 'active' };
  const adapter = descendant_adapter || handoff_input.descendant_adapter;
  if (!adapter) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
  const fresh_proof = adapter.fetchEnrolledBranch({ repository_identity: facts.writer_authority.repository_identity_digest, normalized_remote_digest: facts.writer_authority.normalized_remote_digest, branch: facts.writer_authority.branch, author: facts.writer_authority.author, allowed_paths: facts.target.allowed_paths });
  const publication_proof = fresh_proof && { containing_head: fresh_proof.containing_head, entries: fresh_proof.entries, predecessor_boundary: fresh_proof.predecessor_boundary };
  const proof_capability = store.attestPublicationRemoteProof({ idempotency_key: facts.idempotency_key, receipt, publication_proof, adapter });
  const accepted = store.acceptRemotePublicationTransaction({ idempotency_key: facts.idempotency_key, receipt, publication_proof, proof_capability, created_at: now, fault });
  if (typeof handoff !== 'function') return Object.freeze({ status: 'handoff_pending', transaction: facts.idempotency_key, receipt_digest: accepted.receipt_digest });
  try { handoff({ store, descendant_adapter: handoff_input.descendant_adapter, receipt, publication_proof: store.readPublicationHandoffHeadProofs?.({ idempotency_key: facts.idempotency_key }).at(-1) }); } catch { return Object.freeze({ status: 'handoff_pending', transaction: facts.idempotency_key, receipt_digest: accepted.receipt_digest }); }
  return Object.freeze({ status: accepted.status, transaction: facts.idempotency_key, receipt_digest: accepted.receipt_digest });
}

/** Replays only committed durable TX-03 receipt/proof. Writer process memory never confers handoff authority. */
export function replayRemotePublicationHandoff({ store, idempotency_key, handoff = acquireAcceptedRemoteReceipt, handoff_input = {} } = {}) {
  if (!store || !/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || typeof store.readPublicationAcceptedReceipt !== 'function' || typeof store.readPublicationReceiptIntegrity !== 'function' || typeof store.readPublicationHandoffHeadProofs !== 'function') throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
  const integrity = store.readPublicationReceiptIntegrity({ idempotency_key }); const receipt = store.readPublicationAcceptedReceipt({ idempotency_key }); const publication_proof = store.readPublicationHandoffHeadProofs({ idempotency_key }).at(-1);
  if (integrity?.status === 'receipt_incomplete') return Object.freeze({ status: 'receipt_incomplete', transaction: idempotency_key });
  if (integrity?.status !== 'verified' || !receipt || !publication_proof || typeof handoff !== 'function') return Object.freeze({ status: 'handoff_pending', transaction: idempotency_key, receipt_digest: integrity?.receipt_digest || null });
  try { handoff({ store, descendant_adapter: handoff_input.descendant_adapter, receipt, publication_proof }); } catch { return Object.freeze({ status: 'handoff_pending', transaction: idempotency_key, receipt_digest: integrity.receipt_digest }); }
  return Object.freeze({ status: 'existing', transaction: idempotency_key, receipt_digest: integrity.receipt_digest });
}

function handoffRulePath(receipt) {
  const global = /^pidex-global:([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(receipt?.rule_id || '');
  if (global && receipt.scope_id === 'pidex-global') return { path: `rules/${global[1]}/${global[2]}.md`, index: `rules/${global[1]}/index.md`, global: true, slug: global[2] };
  const project = /^project:([a-f0-9]{24,64}):([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(receipt?.rule_id || '');
  return project && project[1] === receipt.scope_id ? { path: `pidex/rules/managed/${project[2]}/${project[3]}.md`, index: `pidex/rules/managed/${project[2]}/index.md`, global: false, slug: project[3] } : null;
}
function handoffGit(git, repository_root, args) {
  if (typeof git !== 'function' || typeof repository_root !== 'string') throw new Error('RULE_PUBLICATION_HANDOFF_BUNDLE_INVALID');
  const output = git(['-C', repository_root, ...args]); return Buffer.isBuffer(output) ? output : Buffer.from(String(output));
}
function acquireVerifiedPublicationBundle({ store, receipt, containing_head, repository_root, git } = {}) {
  const facts = store?.readPublicationWriterFacts?.({ idempotency_key: `tx:${receipt?.transaction_digest || ''}` }); const location = handoffRulePath(receipt);
  if (!facts || facts.state !== 'accepted_remote' || !location || !/^[a-f0-9]{40}$/.test(containing_head || '')) throw new Error('RULE_PUBLICATION_HANDOFF_BUNDLE_INVALID');
  let bytes; let index; let manifestBytes;
  try {
    bytes = handoffGit(git, repository_root, ['show', `${receipt.accepted_commit}:${location.path}`]);
    index = handoffGit(git, repository_root, ['show', `${receipt.accepted_commit}:${location.index}`]);
    if (location.global) manifestBytes = handoffGit(git, repository_root, ['show', `${receipt.accepted_commit}:config/rule-baseline-manifest.json`]);
  } catch { throw new Error('RULE_PUBLICATION_HANDOFF_BUNDLE_INVALID'); }
  let header; try { const match = bytes.toString('utf8').match(/^<!-- pidex-rule-receipt-v1 (\{[^\n]+\}) -->\n/); header = match && JSON.parse(match[1]); } catch {}
  const content_hash = digest(bytes);
  if (!header || !exact(header, ['rule_id', 'admission_digest', 'transaction_digest', 'lifecycle_state']) || header.rule_id !== receipt.rule_id || header.admission_digest !== receipt.admission_digest || header.transaction_digest !== receipt.transaction_digest || header.lifecycle_state !== receipt.lifecycle_state || content_hash !== receipt.content_hash) throw new Error('RULE_PUBLICATION_HANDOFF_BUNDLE_INVALID');
  try {
    verifyManagedRuleIndex({ bytes: index, tier: location.global ? 'global' : 'project', rule_id: receipt.rule_id, slug: location.slug });
    if (location.global) verifyCanonicalBundledManifest({ manifestBytes, acceptedHead: { accepted_commit: receipt.accepted_commit, first_parent_commit: receipt.predecessor_commit }, readMember: (memberPath) => handoffGit(git, repository_root, ['show', `${receipt.accepted_commit}:${memberPath}`]) });
  } catch { throw new Error('RULE_PUBLICATION_HANDOFF_BUNDLE_INVALID'); }
  const member = freeze({ rule_id: receipt.rule_id, path: location.path, content_hash, bytes: Buffer.from(bytes) });
  const bundle_digest = digest(Buffer.from(JSON.stringify({ schema: 'pidex-publication-handoff-bundle-v1', accepted_commit: receipt.accepted_commit, containing_head, member: { rule_id: member.rule_id, path: member.path, content_hash: member.content_hash } })));
  return freeze({ accepted_commit: receipt.accepted_commit, containing_head, bundle_digest, manifest_digest: location.global ? digest(manifestBytes) : null, member });
}

/** Consumes committed TX-03 once, then advances verified mirror through projection and fresh runtime attestation. */
export function continuePublicationHandoff({ store, transaction, stateRoot, repository_root, git, descendant_adapter, durabilitySupported, durabilitySync, now = new Date().toISOString(), fault } = {}) {
  if (!store || !/^tx:[a-f0-9]{64}$/.test(transaction || '') || typeof stateRoot !== 'string' || typeof now !== 'string' || typeof store.readPublicationAcceptedReceipt !== 'function' || typeof store.advancePublicationHandoffStage !== 'function') throw new Error('RULE_PUBLICATION_HANDOFF_INVALID');
  const receipt = store.readPublicationAcceptedReceipt({ idempotency_key: transaction }); const stage = store.readPublicationHandoffStage?.({ idempotency_key: transaction });
  if (!receipt || stage?.status !== 'verified') return freeze({ status: 'handoff_pending', transaction, receipt_digest: stage?.receipt_digest || null, stage: 'receipt_accepted' });
  const receipt_digest = stage.receipt_digest;
  const safeBundlePayload = (bundle, consumed) => ({ accepted_commit: bundle.accepted_commit, containing_head: bundle.containing_head, containing_tree_digest: consumed.containing_tree_digest, bundle_digest: bundle.bundle_digest, manifest_digest: bundle.manifest_digest, member: { rule_id: bundle.member.rule_id, path: bundle.member.path, content_hash: bundle.member.content_hash } });
  if (stage.stage === 'receipt_accepted') {
    const consumed = acquireAcceptedRemoteReceipt({ store, receipt, descendant_adapter });
    if (!HEX.test(consumed.containing_tree_digest || '')) throw new Error('RULE_PUBLICATION_HANDOFF_RECEIPT_INVALID');
    fault?.('after_receipt_consumption');
    store.advancePublicationHandoffStage({ idempotency_key: transaction, stage: 'receipt_consumed', payload: { accepted_commit: receipt.accepted_commit, containing_head: consumed.containing_head, containing_tree_digest: consumed.containing_tree_digest }, created_at: now, fault });
  }
  let current = store.readPublicationHandoffStage({ idempotency_key: transaction });
  if (current?.stage === 'receipt_consumed') {
    const consumed = acquireAcceptedRemoteReceipt({ store, receipt, descendant_adapter }); const bundle = acquireVerifiedPublicationBundle({ store, receipt, containing_head: consumed.containing_head, repository_root, git });
    fault?.('after_bundle_acquisition');
    store.advancePublicationHandoffStage({ idempotency_key: transaction, stage: 'bundle_verified', payload: safeBundlePayload(bundle, consumed), created_at: now, fault });
  }
  current = store.readPublicationHandoffStage({ idempotency_key: transaction });
  if (current?.stage === 'bundle_verified') {
    const consumed = acquireAcceptedRemoteReceipt({ store, receipt, descendant_adapter }); const bundle = acquireVerifiedPublicationBundle({ store, receipt, containing_head: consumed.containing_head, repository_root, git }); const facts = store.readPublicationWriterFacts({ idempotency_key: transaction });
    const mirrored = materializeVerifiedMirror({ stateRoot, repository: facts?.target.repository, scope_id: receipt.scope_id === 'pidex-global' ? null : receipt.scope_id, accepted_head: receipt.accepted_commit, member: bundle.member, durabilitySupported, durabilitySync });
    if (mirrored.status === 'non_attested') return freeze({ status: 'handoff_pending', transaction, receipt_digest, stage: current.stage });
    if (mirrored.status !== 'verified' || !readFileSync(mirrored.file).equals(bundle.member.bytes) || digest(readFileSync(mirrored.file)) !== bundle.member.content_hash) throw new Error('RULE_PUBLICATION_HANDOFF_MIRROR_INVALID');
    fault?.('after_mirror_materialization');
    store.advancePublicationHandoffStage({ idempotency_key: transaction, stage: 'mirror_verified', payload: safeBundlePayload(bundle, consumed), created_at: now, fault });
  }
  current = store.readPublicationHandoffStage({ idempotency_key: transaction });
  if (current?.stage === 'mirror_verified') {
    const facts = store.readPublicationWriterFacts({ idempotency_key: transaction }); const consumed = acquireAcceptedRemoteReceipt({ store, receipt, descendant_adapter }); const bundle = acquireVerifiedPublicationBundle({ store, receipt, containing_head: consumed.containing_head, repository_root, git });
    if (!facts || facts.state !== 'accepted_remote' || facts.local_stop_active || !HEX.test(consumed.containing_tree_digest || '')) throw new Error('RULE_PUBLICATION_HANDOFF_PROJECTION_INVALID');
    const scope_id = receipt.scope_id === 'pidex-global' ? null : receipt.scope_id; const existing = store.readProjection({ repository: facts.target.repository, scope_id }); const proof = store.readPublicationHandoffHeadProofs({ idempotency_key: transaction }).at(-1);
    const ancestry = (ancestor, descendant) => descendant === consumed.containing_head && (ancestor === proof?.predecessor_boundary || proof?.entries?.some((entry) => entry.commit_oid === ancestor));
    const entry = { rule_id: receipt.rule_id, rule_version: receipt.content_hash, content_hash: receipt.content_hash, accepted_commit: receipt.accepted_commit, bytes: bundle.member.bytes.toString('utf8'), tier: facts.target.tier, scope_id, protection_class: 'none', source: facts.target.tier === 'global' ? 'managed_global' : 'managed_project', lifecycle_state: receipt.lifecycle_state, created_at: facts.writer_authority.publication_timestamp, source_head: consumed.containing_head, mirror_head: receipt.accepted_commit, mirror_digest: receipt.content_hash, agent: facts.candidate.agent, applicability: facts.candidate.applicability };
    const entries = [...(existing?.entries || []).filter((item) => item.rule_id !== receipt.rule_id), entry].sort((left, right) => left.rule_id.localeCompare(right.rule_id));
    const head = { head_kind: facts.target.tier === 'global' ? 'accepted_remote' : 'current_project', repository_identity: facts.target.repository, accepted_remote_head: consumed.containing_head, baseline_parent_commit: receipt.predecessor_commit, manifest_digest: facts.target.tier === 'global' ? bundle.manifest_digest : null, tree_digest: consumed.containing_tree_digest, seeded_at: null, verified_at: facts.writer_authority.publication_timestamp, remote_checked_at: facts.writer_authority.publication_timestamp, freshness: 'exact_head' };
    fault?.('before_projection');
    store.replaceProjection({ repository: facts.target.repository, scope_id, accepted_head: consumed.containing_head, head, entries, is_descendant: ancestry, event_kind: 'publication_projection' });
    const projection = store.readProjection({ repository: facts.target.repository, scope_id }); const projected = projection.entries.find((item) => item.rule_id === receipt.rule_id);
    if (!projected) throw new Error('RULE_PUBLICATION_HANDOFF_PROJECTION_INVALID');
    const target_epoch = handoffTargetEpoch({ repository: facts.target.repository, scope_id, entry: projected });
    const epoch = store.readLifecycleEpoch({ repository: facts.target.repository, scope_id, rule_id: receipt.rule_id, rule_version: target_epoch.rule_version, activation_epoch: target_epoch.activation_epoch });
    if (projected.lifecycle_state !== 'active' || !epoch || epoch.closed_at !== null) throw new Error('RULE_PUBLICATION_HANDOFF_PROJECTION_INVALID');
    fault?.('after_projection');
    store.advancePublicationHandoffStage({ idempotency_key: transaction, stage: 'projection_applied', payload: { ...safeBundlePayload(bundle, consumed), projection_digest: handoffProjectionDigest({ repository: facts.target.repository, scope_id, projection, target_epoch }), target_epoch, activation_epoch: projected.activation_epoch }, created_at: now, fault });
  }
  current = store.readPublicationHandoffStage({ idempotency_key: transaction });
  const reattest = (payload, code) => {
    const facts = store.readPublicationWriterFacts({ idempotency_key: transaction }); const scope_id = receipt.scope_id === 'pidex-global' ? null : receipt.scope_id; const projection = store.readProjection({ repository: facts?.target.repository, scope_id });
    if (!facts || !projection?.entries) throw new Error(code);
    const { target_epoch } = assertHandoffProjectionAuthority({ store, facts, receipt, scope_id, projection, payload, code });
    const pipeline_id = `publication:${receipt_digest}`; const authority_descriptors = [{ repository: facts.target.repository, scope_id, accepted_head: projection.accepted_head, head: projection.head, entries: projection.entries }];
    try {
      const prepared = prepareLifecycleRuntimeContext({ store, pipeline_id, repository: facts.target.repository, scope_id, repositories: [{ repository: facts.target.repository, scope_id }], authority_descriptors, project_authority: { project_root: facts.target.repository }, run_identity: { run_id: pipeline_id } });
      const context = store.getOrCreateRuntimeContext(pipeline_id, prepared.input_digests, prepared.createRuntimeContext); const rendered = renderVerifiedRuntimeRules({ stateRoot, resolverSnapshot: context.resolver_snapshot }); const target = rendered.members.find((member) => member.rule_id === receipt.rule_id && member.path === (payload?.member?.path || handoffRulePath(receipt)?.path) && digest(Buffer.from(member.content, 'utf8')) === receipt.content_hash);
      if (!target) throw new Error(code);
      return { facts, scope_id, projection, target_epoch, context, rendered };
    } catch { throw new Error(code); }
  };
  if (current?.stage === 'projection_applied') {
    fault?.('before_reattest');
    const verified = reattest(current.payload, 'RULE_PUBLICATION_HANDOFF_REATTEST_INVALID');
    fault?.('after_reattest');
    const consumed = acquireAcceptedRemoteReceipt({ store, receipt, descendant_adapter }); const bundle = acquireVerifiedPublicationBundle({ store, receipt, containing_head: consumed.containing_head, repository_root, git });
    store.advancePublicationHandoffStage({ idempotency_key: transaction, stage: 'reattested', payload: { ...safeBundlePayload(bundle, consumed), projection_digest: handoffProjectionDigest({ repository: verified.facts.target.repository, scope_id: verified.scope_id, projection: verified.projection, target_epoch: verified.target_epoch }), target_epoch: verified.target_epoch, context_digest: digest(Buffer.from(canonical(verified.context))), render_digest: digest(Buffer.from(verified.rendered.rendered, 'utf8')), activation_epoch: verified.target_epoch.activation_epoch }, created_at: now, fault });
  }
  current = store.readPublicationHandoffStage({ idempotency_key: transaction });
  if (current?.stage === 'reattested') {
    reattest(current.payload, 'RULE_PUBLICATION_HANDOFF_STATUS_INVALID');
    fault?.('before_status_ready');
    store.advancePublicationHandoffStage({ idempotency_key: transaction, stage: 'status_ready', payload: current.payload, created_at: now, fault });
    fault?.('after_status_ready');
  }
  const complete = store.readPublicationHandoffStage({ idempotency_key: transaction });
  return complete?.stage === 'status_ready' ? freeze({ status: 'status_ready', transaction, receipt_digest, stage: complete.stage }) : freeze({ status: 'handoff_pending', transaction, receipt_digest, stage: complete?.stage || 'receipt_accepted' });
}

/** Classifies closed remote facts as advisory only; writer-owned verified facts must revalidate before terminal mutation. */
export function classifyPublicationRecovery({ store, idempotency_key, facts } = {}) {
  const unavailable = Object.freeze({ authority: 'advisory', action: 'reconciliation_required', recovery_code: null });
  if (!store || typeof store.readPublicationTransactionFacts !== 'function') return unavailable;
  const transaction = store.readPublicationTransactionFacts({ idempotency_key });
  if (!transaction) return unavailable;
  if (TERMINAL.has(transaction.state)) return Object.freeze({ authority: 'advisory', action: 'preserve_terminal', recovery_code: 'RC-01' });
  if (exact(facts, RC02_FACT_KEYS) && facts.remote_contains_exact_commit === true && facts.parent_matches === true && facts.manifest_base_matches === true && facts.commit_tree_matches === true && facts.member_digests_match === true && HEAD.test(facts.containing_commit || '')) return Object.freeze({ authority: 'advisory', action: 'accept_remote_exact', recovery_code: 'RC-02' });
  if (exact(facts, RC03_FACT_KEYS) && transaction.state === 'committed_local' && facts.remote_contains_exact_commit === false && facts.remote_head === transaction.expected_base && facts.manifest_base_matches === true && facts.enrollment_valid === true && facts.commit_tree_matches === true && facts.member_digests_match === true) return Object.freeze({ authority: 'advisory', action: 'push_exact_local', recovery_code: 'RC-03' });
  if (exact(facts, RC04_FACT_KEYS) && facts.remote_contains_exact_commit === false && HEAD.test(facts.remote_head) && facts.remote_head !== transaction.expected_base) return Object.freeze({ authority: 'advisory', action: 'defer_remote_advanced', recovery_code: 'RC-04' });
  if (exact(facts, RC05_FACT_KEYS) && facts.remote_contains_exact_commit === false && (facts.enrollment_valid === false || facts.commit_tree_matches === false || facts.member_digests_match === false)) return Object.freeze({ authority: 'advisory', action: 'reject_policy', recovery_code: 'RC-05' });
  if (exact(facts, RC06_FACT_KEYS) && facts.authorized_abandonment === true) return Object.freeze({ authority: 'advisory', action: 'abandon', recovery_code: 'RC-06' });
  return unavailable;
}

// ---- Plan048 Slice1/3A: separate lifecycle-action TX shape. Preserves rule body; changes only receipt lifecycle_state; no candidate semantics. ----
const ACTION_REQUEST_KEYS = Object.freeze(['schema', 'tier', 'repository_scope_digest', 'rule_id', 'predecessor_commit', 'version_hash', 'content_hash', 'activation_epoch', 'policy_id', 'policy_digest', 'closed_window_id', 'result_digest', 'lifecycle_transition', 'cadence_digest']);
const ACTION_TRANSITIONS = Object.freeze(['deactivated', 'active-monitor', 'active-pinned']);
const ACTION_TRANSITION_SOURCES = Object.freeze({ deactivated: ['active', 'active-monitor', 'active-pinned'], 'active-monitor': ['deactivated', 'active-pinned'], 'active-pinned': ['deactivated'] });
function validActionRequest(value) { return exact(value, ACTION_REQUEST_KEYS) && value.schema === 'pidex-rule-lifecycle-action-request-v1' && ACTION_TRANSITIONS.includes(value.lifecycle_transition) && ['global', 'project'].includes(value.tier) && [value.repository_scope_digest, value.version_hash, value.content_hash, value.policy_digest, value.result_digest, value.cadence_digest].every((item) => typeof item === 'string' && HEX.test(item)) && HEAD.test(value.predecessor_commit || '') && typeof value.activation_epoch === 'string' && value.activation_epoch.startsWith('epoch:') && typeof value.policy_id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value.policy_id) && typeof value.closed_window_id === 'string' && value.closed_window_id.length > 0 && value.closed_window_id.length <= 256 && typeof value.rule_id === 'string' && /^(?:pidex-global|project:[a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(value.rule_id); }
function lifecycleActionRuleBytes(action, rule_bytes) {
  if (!Buffer.isBuffer(rule_bytes)) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
  const match = /^(<!-- pidex-rule-receipt-v1 (\{[^\n]+\}) -->\n)/.exec(rule_bytes.toString('utf8'));
  let header;
  try { header = match && JSON.parse(match[2]); } catch { throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID'); }
  if (!header || header.rule_id !== action.rule_id || !ACTION_TRANSITION_SOURCES[action.lifecycle_transition]?.includes(header.lifecycle_state)) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
  const body = rule_bytes.toString('utf8').slice(match[1].length);
  return Buffer.from(`<!-- pidex-rule-receipt-v1 ${JSON.stringify({ ...header, lifecycle_state: action.lifecycle_transition })} -->\n${body}`, 'utf8');
}

/** Deterministic lifecycle-action TX identity binds exact action bytes and expected base; candidate/admission never participate. */
export function deriveLifecycleActionIdempotencyKey({ action, expected_base } = {}) {
  if (!validActionRequest(action) || !HEAD.test(expected_base || '')) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
  const hash = createHash('sha256');
  for (const field of ['pidex-rule-lifecycle-action-transaction-v1', canonical(action), expected_base]) { const bytes = Buffer.from(String(field), 'utf8'); hash.update(`${bytes.length}:`, 'ascii'); hash.update(bytes); }
  return `tx:${hash.digest('hex')}`;
}

/** TX-01 for one deactivation: preserves canonical rule body, changes only the pidex receipt lifecycle_state, and never fabricates a new-rule candidate. */
export function prepareLifecycleActionPublicationTransaction({ store, action, target, expected_base, rule_bytes, now, fault } = {}) {
  if (!store || typeof store.prepareLifecycleActionTransaction !== 'function' || !validActionRequest(action) || !HEAD.test(expected_base || '') || typeof now !== 'string') throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
  if (action.predecessor_commit !== expected_base || !target || target.rule_id !== action.rule_id || target.tier !== action.tier || target.scope_digest !== action.repository_scope_digest || target.predecessor !== `commit:${expected_base}`) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
  const deactivated = lifecycleActionRuleBytes(action, rule_bytes);
  const content_hash = createHash('sha256').update(deactivated).digest('hex');
  const idempotency_key = deriveLifecycleActionIdempotencyKey({ action, expected_base });
  return store.prepareLifecycleActionTransaction({ target, expected_base, idempotency_key, cadence_digest: action.cadence_digest, action, rule_bytes: deactivated, content_hash, created_at: now, fault });
}

/** TX-02 local object facts for lifecycle actions only; this module never invokes Git. */
export function commitLocalLifecycleActionTransaction({ store, idempotency_key, commit, parent, tree_digest, staged_member_digests, now } = {}) {
  if (!store || typeof store.commitLocalLifecycleActionTransaction !== 'function') throw new Error('RULE_LIFECYCLE_ACTION_LOCAL_COMMIT_INVALID');
  return store.commitLocalLifecycleActionTransaction({ idempotency_key, commit, parent, tree_digest, staged_member_digests, created_at: now });
}

/** Maps closed writer proof to a deactivated receipt owned by durable lifecycle-action TX state; never accepts caller receipt bytes. */
export function acceptLifecycleActionRemoteReceipt({ store, writer_result, now, fault, descendant_adapter } = {}) {
  if (!store || typeof store.readLifecycleActionWriterFacts !== 'function' || typeof store.attestLifecycleActionRemoteProof !== 'function' || typeof store.acceptLifecycleActionRemoteReceipt !== 'function' || !exact(writer_result, RECEIPT_PENDING_KEYS) || writer_result.status !== 'receipt_pending' || !/^tx:[a-f0-9]{64}$/.test(writer_result.transaction || '') || !HEAD.test(writer_result.prepared_commit || '') || !HEAD.test(writer_result.observed_head || '') || !['RC-02', 'RC-03'].includes(writer_result.recovery_code) || typeof now !== 'string') throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
  const existingReceipt = typeof store.readLifecycleActionAcceptedReceipt === 'function' ? store.readLifecycleActionAcceptedReceipt({ idempotency_key: writer_result.transaction }) : undefined;
  if (existingReceipt) {
    if (existingReceipt.accepted_commit !== writer_result.prepared_commit) throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
    return Object.freeze({ status: 'existing', transaction: writer_result.transaction, receipt_digest: createHash('sha256').update(canonical(existingReceipt)).digest('hex') });
  }
  const facts = store.readLifecycleActionWriterFacts({ idempotency_key: writer_result.transaction });
  if (!facts || facts.state !== 'committed_local' || facts.idempotency_key !== writer_result.transaction || facts.local_commit !== writer_result.prepared_commit || facts.local_parent !== facts.expected_base || !facts.staged_member_digests || !facts.target || !facts.writer_authority || !facts.action_digest) throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
  const global = facts.target.tier === 'global'; const parts = facts.target.rule_id.split(':');
  const rulePath = global ? `rules/${parts[1]}/${parts[2]}.md` : `pidex/rules/managed/${parts[2]}/${parts[3]}.md`;
  const content_hash = facts.staged_member_digests[rulePath];
  if (!HEX.test(content_hash || '') || facts.target.rule_id !== facts.action.rule_id) throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: facts.writer_authority.repository_identity_digest, scope_id: global ? 'pidex-global' : facts.target.scope_id, rule_id: facts.target.rule_id, predecessor_commit: facts.expected_base, accepted_commit: facts.local_commit, tree_digest: facts.local_tree_digest, content_hash, admission_digest: facts.action_digest, transaction_digest: facts.idempotency_key.slice(3), lifecycle_state: facts.action.lifecycle_transition };
  if (!descendant_adapter || typeof descendant_adapter.fetchEnrolledBranch !== 'function' || typeof descendant_adapter.inspectCommit !== 'function') throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
  const fresh_proof = descendant_adapter.fetchEnrolledBranch({ repository_identity: facts.writer_authority.repository_identity_digest, normalized_remote_digest: facts.writer_authority.normalized_remote_digest, branch: facts.writer_authority.branch, author: facts.writer_authority.author, allowed_paths: facts.target.allowed_paths });
  const publication_proof = fresh_proof && { containing_head: fresh_proof.containing_head, entries: fresh_proof.entries, predecessor_boundary: fresh_proof.predecessor_boundary };
  const proof_capability = store.attestLifecycleActionRemoteProof({ idempotency_key: facts.idempotency_key, receipt, publication_proof, adapter: descendant_adapter });
  const accepted = store.acceptLifecycleActionRemoteReceipt({ idempotency_key: facts.idempotency_key, receipt, publication_proof, proof_capability, created_at: now, fault });
  return Object.freeze({ status: accepted.status, transaction: facts.idempotency_key, receipt_digest: accepted.receipt_digest });
}

// ---- Plan048 Slice1C: deactivation handoff. Verified deactivated mirror, prior epoch closed, no new epoch. ----
function consumeLifecycleActionReceipt({ store, receipt, descendant_adapter } = {}) {
  if (!store || typeof store.consumeVerifiedReceipt !== 'function' || !receipt || typeof receipt !== 'object' || !['deactivated', 'active-monitor', 'active-pinned'].includes(receipt.lifecycle_state)) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_INVALID');
  const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
  return store.consumeVerifiedReceipt({
    receipt: { receipt_digest, transaction_digest: receipt.transaction_digest, accepted_commit: receipt.accepted_commit, tree_digest: receipt.tree_digest },
    verify: () => {
      if (!descendant_adapter || typeof descendant_adapter.fetchEnrolledBranch !== 'function' || typeof descendant_adapter.inspectCommit !== 'function') throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_INVALID');
      const transaction = `tx:${receipt.transaction_digest}`;
      const facts = store.readLifecycleActionWriterFacts?.({ idempotency_key: transaction });
      const stage = store.readLifecycleActionHandoffStage?.({ idempotency_key: transaction });
      const durableReceipt = store.readLifecycleActionAcceptedReceipt?.({ idempotency_key: transaction });
      if (canonical(durableReceipt) !== canonical(receipt) || !facts?.staged_member_digests || !facts.writer_authority || !facts.cadence_digest || stage?.status !== 'verified') throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_INVALID');
      let verified;
      try { verified = verifyLifecycleActionRemoteProof({ receipt, enrollment: { repository_identity: facts.writer_authority.repository_identity_digest, normalized_remote_digest: facts.writer_authority.normalized_remote_digest, branch: facts.writer_authority.branch, author: facts.writer_authority.author, allowed_paths: facts.target.allowed_paths }, durable: { predecessor_commit: facts.expected_base, accepted_commit: facts.local_commit, tree_digest: facts.local_tree_digest, staged_member_digests: facts.staged_member_digests, admission_digest: facts.action_digest, transaction_digest: facts.idempotency_key.slice(3), rule_id: facts.target.rule_id, tier: facts.target.tier }, cadence_digest: facts.cadence_digest, adapter: descendant_adapter }); } catch { throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_INVALID'); }
      return { accepted_commit: receipt.accepted_commit, tree_digest: receipt.tree_digest, result: freeze({ accepted_remote_head: verified.containing_head, accepted_commit: verified.accepted_commit, containing_head: verified.containing_head, containing_tree_digest: verified.containing_tree_digest, tree_digest: receipt.tree_digest }) };
    },
  });
}
function actionRulePath(receipt) {
  const global = /^pidex-global:([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(receipt?.rule_id || '');
  if (global && receipt.scope_id === 'pidex-global') return { path: `rules/${global[1]}/${global[2]}.md`, index: `rules/${global[1]}/index.md`, global: true, slug: global[2] };
  const project = /^project:([a-f0-9]{24,64}):([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(receipt?.rule_id || '');
  return project && project[1] === receipt.scope_id ? { path: `pidex/rules/managed/${project[2]}/${project[3]}.md`, index: `pidex/rules/managed/${project[2]}/index.md`, global: false, slug: project[3] } : null;
}
function acquireLifecycleActionBundle({ store, receipt, facts, containing_head, repository_root, git } = {}) {
  const location = actionRulePath(receipt);
  if (!facts || facts.state !== 'accepted_remote' || !location || !/^[a-f0-9]{40}$/.test(containing_head || '') || typeof git !== 'function' || typeof repository_root !== 'string') throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_BUNDLE_INVALID');
  let bytes; let index; let manifestBytes;
  try {
    const output = (args) => { const value = git(args); return Buffer.isBuffer(value) ? value : Buffer.from(String(value)); };
    bytes = output(['-C', repository_root, 'show', `${receipt.accepted_commit}:${location.path}`]);
    index = output(['-C', repository_root, 'show', `${receipt.accepted_commit}:${location.index}`]);
    if (location.global) manifestBytes = output(['-C', repository_root, 'show', `${receipt.accepted_commit}:config/rule-baseline-manifest.json`]);
  } catch { throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_BUNDLE_INVALID'); }
  let header; try { const match = bytes.toString('utf8').match(/^<!-- pidex-rule-receipt-v1 (\{[^\n]+\}) -->\n/); header = match && JSON.parse(match[1]); } catch {}
  const content_hash = digest(bytes);
  if (!header || !exact(header, ['rule_id', 'admission_digest', 'transaction_digest', 'lifecycle_state']) || header.rule_id !== receipt.rule_id || header.lifecycle_state !== receipt.lifecycle_state || content_hash !== receipt.content_hash) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_BUNDLE_INVALID');
  try { verifyManagedRuleIndex({ bytes: index, tier: location.global ? 'global' : 'project', rule_id: receipt.rule_id, slug: location.slug }); } catch { throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_BUNDLE_INVALID'); }
  const member = freeze({ rule_id: receipt.rule_id, path: location.path, content_hash, bytes: Buffer.from(bytes) });
  return freeze({ accepted_commit: receipt.accepted_commit, containing_head, manifest_digest: location.global ? digest(manifestBytes) : null, member });
}

/** Consumes the accepted deactivated receipt once, verifies mirror bytes, then projects deactivated truth with the prior epoch closed and no fresh epoch. */
export function continueLifecycleActionHandoff({ store, transaction, stateRoot, repository_root, git, descendant_adapter, durabilitySupported, durabilitySync, now = new Date().toISOString(), fault } = {}) {
  if (!store || !/^tx:[a-f0-9]{64}$/.test(transaction || '') || typeof stateRoot !== 'string' || typeof repository_root !== 'string' || typeof git !== 'function' || typeof now !== 'string' || typeof store.readLifecycleActionAcceptedReceipt !== 'function' || typeof store.readLifecycleActionHandoffStage !== 'function' || typeof store.advanceLifecycleActionHandoffStage !== 'function' || typeof store.consumeVerifiedReceipt !== 'function' || typeof store.replaceProjection !== 'function' || typeof store.readProjection !== 'function' || typeof store.listLifecycleEpochs !== 'function') throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_INVALID');
  const receipt = store.readLifecycleActionAcceptedReceipt({ idempotency_key: transaction }); const stage = store.readLifecycleActionHandoffStage({ idempotency_key: transaction });
  // Slice3A: reactivation receipts (active-monitor/active-pinned) continue the same verified handoff; the two-gate epoch check below mints a fresh epoch only on the verified active projection.
  if (!receipt || !['deactivated', 'active-monitor', 'active-pinned'].includes(receipt.lifecycle_state) || stage?.status !== 'verified') return freeze({ status: 'handoff_pending', transaction, stage: stage?.stage || 'receipt_accepted' });
  const facts = store.readLifecycleActionWriterFacts({ idempotency_key: transaction });
  if (!facts || facts.state !== 'accepted_remote') throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_INVALID');
  const safePayload = (bundle, consumed, extra = {}) => ({ accepted_commit: bundle.accepted_commit, containing_head: bundle.containing_head, containing_tree_digest: consumed.containing_tree_digest, ...extra });
  if (stage.stage === 'receipt_accepted') {
    const consumed = consumeLifecycleActionReceipt({ store, receipt, descendant_adapter });
    const bundle = acquireLifecycleActionBundle({ store, receipt, facts, containing_head: consumed.containing_head, repository_root, git });
    const mirrored = materializeVerifiedMirror({ stateRoot, repository: facts.target.repository, scope_id: receipt.scope_id === 'pidex-global' ? null : receipt.scope_id, accepted_head: receipt.accepted_commit, member: bundle.member, durabilitySupported, durabilitySync });
    if (mirrored.status === 'non_attested') return freeze({ status: 'handoff_pending', transaction, stage: 'receipt_accepted' });
    if (mirrored.status !== 'verified' || !readFileSync(mirrored.file).equals(bundle.member.bytes) || digest(readFileSync(mirrored.file)) !== bundle.member.content_hash) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_MIRROR_INVALID');
    store.advanceLifecycleActionHandoffStage({ idempotency_key: transaction, stage: 'mirror_verified', payload: safePayload(bundle, consumed, { mirror_head: mirrored.head, mirror_digest: mirrored.digest, content_hash: bundle.member.content_hash }), created_at: now, fault });
    // Durable unconverged pause: mirror verified but projection not yet applied. Prior accepted truth stays authoritative; no epoch is minted until a later call projects the deactivated entry.
    return freeze({ status: 'handoff_pending', transaction, stage: 'mirror_verified' });
  }
  const current = store.readLifecycleActionHandoffStage({ idempotency_key: transaction });
  if (current?.stage === 'mirror_verified') {
    const consumed = consumeLifecycleActionReceipt({ store, receipt, descendant_adapter }); const bundle = acquireLifecycleActionBundle({ store, receipt, facts, containing_head: consumed.containing_head, repository_root, git });
    const scope_id = receipt.scope_id === 'pidex-global' ? null : receipt.scope_id;
    const existing = store.readProjection({ repository: facts.target.repository, scope_id });
    const parts = receipt.rule_id.split(':');
    const entry = { rule_id: receipt.rule_id, rule_version: receipt.content_hash, content_hash: receipt.content_hash, accepted_commit: receipt.accepted_commit, bytes: bundle.member.bytes.toString('utf8'), tier: facts.target.tier, scope_id, protection_class: 'none', source: facts.target.tier === 'global' ? 'managed_global' : 'managed_project', lifecycle_state: receipt.lifecycle_state, created_at: facts.writer_authority.publication_timestamp, source_head: consumed.containing_head, mirror_head: receipt.accepted_commit, mirror_digest: receipt.content_hash, agent: parts[2], applicability: null };
    const entries = [...(existing?.entries || []).filter((item) => item.rule_id !== receipt.rule_id), entry].sort((left, right) => left.rule_id.localeCompare(right.rule_id));
    const head = { head_kind: facts.target.tier === 'global' ? 'accepted_remote' : 'current_project', repository_identity: facts.target.repository, accepted_remote_head: consumed.containing_head, baseline_parent_commit: receipt.predecessor_commit, manifest_digest: facts.target.tier === 'global' ? bundle.manifest_digest : null, tree_digest: consumed.containing_tree_digest, seeded_at: null, verified_at: facts.writer_authority.publication_timestamp, remote_checked_at: facts.writer_authority.publication_timestamp, freshness: 'exact_head' };
    const ancestry = (ancestor, descendant) => descendant === consumed.containing_head && ancestor === receipt.predecessor_commit;
    store.replaceProjection({ repository: facts.target.repository, scope_id, accepted_head: consumed.containing_head, head, entries, is_descendant: ancestry, event_kind: 'lifecycle_action_projection' });
    const projection = store.readProjection({ repository: facts.target.repository, scope_id }); const projected = projection.entries.find((item) => item.rule_id === receipt.rule_id);
    if (!projected || projected.lifecycle_state !== receipt.lifecycle_state) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_PROJECTION_INVALID');
    const epochs = store.listLifecycleEpochs({ repository: facts.target.repository, scope_id, rule_id: receipt.rule_id });
    if (['deactivated'].includes(receipt.lifecycle_state)) {
      // Deactivation truth requires every prior epoch closed and mints no fresh epoch.
      if (!epochs.length || epochs.some((epoch) => epoch.closed_at === null)) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_PROJECTION_INVALID');
    } else {
      // Two-gate reactivation: fresh epoch exists only after accepted_remote plus verified active mirror projection; store owns the epoch mint on projection.
      const epoch = projected.activation_epoch && store.readLifecycleEpoch({ repository: facts.target.repository, scope_id, rule_id: receipt.rule_id, rule_version: projected.rule_version, activation_epoch: projected.activation_epoch });
      if (!epoch || epoch.closed_at !== null || !projected.activation_epoch) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_PROJECTION_INVALID');
    }
    store.advanceLifecycleActionHandoffStage({ idempotency_key: transaction, stage: 'projection_applied', payload: safePayload(bundle, consumed, { content_hash: receipt.content_hash }), created_at: now, fault });
  }
  const done = store.readLifecycleActionHandoffStage({ idempotency_key: transaction });
  if (done?.stage === 'projection_applied') {
    const projection = store.readProjection({ repository: facts.target.repository, scope_id: receipt.scope_id === 'pidex-global' ? null : receipt.scope_id }); const entry = projection.entries.find((item) => item.rule_id === receipt.rule_id);
    if (!entry || entry.lifecycle_state !== receipt.lifecycle_state || entry.accepted_commit !== receipt.accepted_commit) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STATUS_INVALID');
    store.advanceLifecycleActionHandoffStage({ idempotency_key: transaction, stage: 'status_ready', payload: done.payload, created_at: now, fault });
  }
  const complete = store.readLifecycleActionHandoffStage({ idempotency_key: transaction });
  return complete?.stage === 'status_ready' ? freeze({ status: 'status_ready', transaction, stage: complete.stage }) : freeze({ status: 'handoff_pending', transaction, stage: complete?.stage || 'receipt_accepted' });
}
