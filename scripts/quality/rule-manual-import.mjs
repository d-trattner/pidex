import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { buildRuleLearningCandidate } from './rule-learning-candidate.mjs';
import { readManualPublicationTarget as readTarget, readManualRefinementAdmission as readAdmission, readManualRefinementReaderFacts, readManualRefinementRequestFacts } from './rule-lifecycle-store.mjs';
import { acceptRemotePublicationTransaction, continuePublicationHandoff, derivePublicationIdempotencyKey, preparePublicationTransaction } from './rule-publication-transaction.mjs';
import { publishRuleWithInjectedGit } from './rule-git-writer.mjs';
import { readVerifiedMirrorMember } from './rule-mirror-sync.mjs';

const REQUEST_KEYS = Object.freeze(['store', 'rule_id', 'receipt_digest', 'request_nonce', 'now']);
const readerCapabilities = new WeakMap();
const ENVELOPE_KEYS = Object.freeze(['slug', 'applicability', 'instruction', 'trigger', 'expected_evidence', 'failure_behavior', 'rationale']);
const HEX = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const ADAPTER_KEYS = Object.freeze(['writer', 'receipt_git', 'descendant']);
const WRITER_METHODS = Object.freeze(['fetchExpected', 'remoteUrl', 'resolveHead', 'identitySnapshot', 'createIsolatedWorkspace', 'readCanonicalMembers', 'writeFileNoFollow', 'stage', 'stagedEntries', 'commit', 'fetchObserved', 'pushFastForward', 'postPushObserve', 'containsCommit', 'inspectCommit', 'cleanup']);

function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function bytes(value) { return Buffer.isBuffer(value) || value instanceof Uint8Array ? Buffer.from(value) : null;
}
function stableNumber(value) { return typeof value === 'bigint' ? value > 0n : typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function stableIdentity(stat) { return stat && stableNumber(stat.dev) && stableNumber(stat.ino) && stableNumber(stat.nlink); }
function oneLink(value) { return value === 1 || value === 1n; }
function boundedSize(value) {
  if (typeof value === 'bigint') return value >= 0n && value <= 4096n ? Number(value) : null;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 4096 ? value : null;
}
function pathStat(target) { return lstatSync(target, { bigint: true }); }
function descriptorStat(descriptor) { return fstatSync(descriptor, { bigint: true }); }
function reparseVisible(stat) { return Boolean(stat?.reparsePoint || stat?.isReparsePoint?.()); }
function sameIdentity(left, right) { return stableIdentity(left) && stableIdentity(right) && left.dev === right.dev && left.ino === right.ino; }
function inside(root, target) { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function sameFileState(left, right) { return sameIdentity(left, right) && left.nlink === right.nlink && left.size === right.size && left.isFile() === right.isFile(); }
function sameSnapshot(left, right) { return sameIdentity(left, right) && left.nlink === right.nlink && left.size === right.size && left.type === right.type; }
function validDirectory(stat) { return stableIdentity(stat) && stat.isDirectory() && !stat.isSymbolicLink() && !reparseVisible(stat); }
function validSourceFile(stat) { return stableIdentity(stat) && stat.isFile() && !stat.isSymbolicLink() && !reparseVisible(stat) && oneLink(stat.nlink) && boundedSize(stat.size) !== null; }
function canonicalPath(value) { return value.normalize('NFC'); }
function componentSnapshots(root, target) {
  const relative = path.relative(root, target); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('invalid source identity');
  const components = relative.split(path.sep); const snapshots = []; let current = root;
  for (const [index, component] of components.entries()) {
    if (!component || component === '.' || component === '..') throw new Error('invalid source identity');
    current = path.join(current, component); const stat = pathStat(current); const leaf = index === components.length - 1;
    if (leaf ? !validSourceFile(stat) : !validDirectory(stat)) throw new Error('invalid source identity');
    snapshots.push(Object.freeze({ path: current, stat, type: leaf ? 'file' : 'directory' }));
  }
  return snapshots;
}
function sameComponents(left, right) { return left.length === right.length && left.every((component, index) => component.path === right[index].path && component.type === right[index].type && (component.type === 'file' ? sameFileState(component.stat, right[index].stat) : sameSnapshot(component.stat, right[index].stat))); }
function readDescriptorSnapshot(descriptor, target) {
  const before = descriptorStat(descriptor);
  if (!validSourceFile(before)) throw new Error('invalid source identity');
  const contents = Buffer.alloc(boundedSize(before.size)); let offset = 0;
  while (offset < contents.length) { const count = readSync(descriptor, contents, offset, contents.length - offset, offset); if (count <= 0) throw new Error('short read'); offset += count; }
  const after = descriptorStat(descriptor); const named = pathStat(target);
  if (!sameFileState(before, after) || !sameFileState(after, named) || named.isSymbolicLink()) throw new Error('identity drift');
  return Object.freeze({ contents, content_digest: createHash('sha256').update(contents).digest('hex'), size: after.size, dev: after.dev, ino: after.ino, nlink: after.nlink, type: 'file' });
}
function readSourceNoFollow(facts, readPredecessor) {
  const requestedRoot = path.resolve(facts.repository); const root = realpathSync(requestedRoot);
  if (canonicalPath(root) !== canonicalPath(requestedRoot)) throw new Error('invalid source identity');
  const segments = facts.rule_path.split('/'); const target = path.join(root, ...segments); const expectedTarget = path.resolve(root, ...segments);
  if (target !== expectedTarget || !inside(root, target)) throw new Error('invalid source identity');
  const rootBefore = pathStat(root); const componentsBefore = componentSnapshots(root, target); const fileBefore = componentsBefore.at(-1).stat; const realTargetBefore = realpathSync(target);
  if (!validDirectory(rootBefore) || canonicalPath(realTargetBefore) !== canonicalPath(target) || canonicalPath(path.relative(root, realTargetBefore).split(path.sep).join('/')) !== facts.rule_path) throw new Error('invalid source identity');
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); const openedBefore = descriptorStat(descriptor);
    if (!validSourceFile(openedBefore) || !sameFileState(fileBefore, openedBefore)) throw new Error('invalid source identity');
    const selected = readDescriptorSnapshot(descriptor, target); const predecessor = readPredecessor(); const final = readDescriptorSnapshot(descriptor, target);
    const rootAfter = pathStat(root); const componentsAfter = componentSnapshots(root, target); const realTargetAfter = realpathSync(target); const openedAfter = descriptorStat(descriptor);
    if (!validDirectory(rootAfter) || !sameSnapshot(rootBefore, rootAfter) || !sameComponents(componentsBefore, componentsAfter) || !sameFileState(openedBefore, openedAfter) || !sameSnapshot(selected, final) || selected.content_digest !== final.content_digest || !selected.contents.equals(final.contents) || canonicalPath(realTargetAfter) !== canonicalPath(target) || realTargetBefore !== realTargetAfter) throw new Error('identity drift');
    return Object.freeze({ source: Buffer.from(final.contents), predecessor: Buffer.from(predecessor) });
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function parseEnvelope(source) {
  if (!source || source.length === 0 || source.length > 4096 || source.at(-1) !== 10 || source.length > 1 && source.at(-2) === 10 || !Buffer.from(source.toString('utf8'), 'utf8').equals(source)) return null;
  let parsed; try { parsed = JSON.parse(source.toString('utf8')); } catch { return null; }
  if (!exact(parsed, ENVELOPE_KEYS)) return null;
  const envelope = {
    slug: parsed.slug,
    applicability: parsed.applicability,
    instruction: parsed.instruction,
    trigger: parsed.trigger,
    expected_evidence: parsed.expected_evidence,
    failure_behavior: parsed.failure_behavior,
    rationale: parsed.rationale,
  };
  if (!Buffer.from(`${JSON.stringify(envelope)}\n`, 'utf8').equals(source)) return null;
  return Object.freeze(envelope);
}

/** Starts refinement from exact canonical receipt identity only; source authority stays store-owned. */
export function createManualRefinementRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== REQUEST_KEYS.length || !REQUEST_KEYS.every((key) => Object.hasOwn(input, key))) throw new Error('RULE_MANUAL_REFINEMENT_REQUEST_INVALID');
  if (typeof input.store.createManualRefinementRequest !== 'function') throw new Error('RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE');
  return input.store.createManualRefinementRequest({ rule_id: input.rule_id, receipt_digest: input.receipt_digest, request_nonce: input.request_nonce, now: input.now });
}

/** Mints opaque production read authority from store-owned current facts. */
export function createManualRefinementReader({ request_capability } = {}) {
  const facts = readManualRefinementReaderFacts({ capability: request_capability });
  if (!facts || facts.path_digest !== createHash('sha256').update(facts.rule_path, 'utf8').digest('hex')) throw new Error('RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE');
  const capability = Object.freeze({}); readerCapabilities.set(capability, facts); return capability;
}

/** Reads bounded manual source and verified same-path predecessor through opaque factory authority. */
export function readManualRefinementEnvelope({ reader_capability, request } = {}) {
  const facts = readerCapabilities.get(reader_capability);
  if (!facts || !request || typeof request !== 'object' || !HEX.test(request.path_digest) || !HEX.test(request.current_content_digest) || !COMMIT.test(request.accepted_commit) || facts.path_digest !== request.path_digest || facts.current_content_digest !== request.current_content_digest || facts.accepted_commit !== request.accepted_commit) throw new Error('RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE');
  try {
    const stable = readSourceNoFollow(facts, () => readVerifiedMirrorMember({ stateRoot: facts.state_root, repository: facts.repository, scope_id: facts.scope_id, accepted_commit: facts.accepted_commit, path: facts.rule_path, content_hash: facts.current_content_digest }));
    const source = bytes(stable.source); const predecessor = stable.predecessor;
    if (!source || !predecessor || createHash('sha256').update(predecessor).digest('hex') !== request.current_content_digest) throw new Error('invalid');
    const envelope = parseEnvelope(source); if (!envelope) throw new Error('invalid');
    return Object.freeze({ envelope, source_digest: createHash('sha256').update(source).digest('hex') });
  } catch { throw new Error('RULE_MANUAL_REFINEMENT_SOURCE_UNAVAILABLE'); }
}

/** Builds one deterministic candidate from stable bytes, then atomically consumes opaque request authority. */
/** Private manual admission material stays capability-bound to owning lifecycle store. */
export function readManualRefinementAdmission({ admission_capability } = {}) { return readAdmission({ admission_capability }); }
/** Private target has no caller-provided repository, path, base, or writer authority. */
export function readManualPublicationTarget({ admission_capability } = {}) { return readTarget({ admission_capability }); }
/** Prepares ordinary TX-01 from exact durable manual candidate/admission bytes and current target. */
export function prepareManualRefinementTransaction({ store, admission_capability, now } = {}) {
  const admission = readAdmission({ admission_capability }); const target = readTarget({ admission_capability });
  if (!store || !admission || !target || typeof now !== 'string' || target.predecessor !== `commit:${JSON.parse(admission.candidate_bytes.toString('utf8')).predecessor_commit.slice(7)}`) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
  const expected_base = target.predecessor.slice('commit:'.length);
  return preparePublicationTransaction({ store, target, expected_base, idempotency_key: derivePublicationIdempotencyKey({ candidate_digest: admission.candidate_digest, admission_digest: admission.admission_digest, target, expected_base }), candidate_bytes: admission.candidate_bytes, admission_bytes: admission.admission_bytes, manual_admission: { request_digest: admission.request_digest, intake_digest: admission.intake_digest, admission_digest: admission.admission_digest }, now });
}

function validAdapters(adapters) {
  return exact(adapters, ADAPTER_KEYS) && adapters.writer && typeof adapters.writer === 'object' && Object.keys(adapters.writer).length === WRITER_METHODS.length && WRITER_METHODS.every((method) => typeof adapters.writer[method] === 'function') && Object.keys(adapters.writer).every((method) => WRITER_METHODS.includes(method)) && typeof adapters.receipt_git === 'function' && adapters.descendant && typeof adapters.descendant.fetchEnrolledBranch === 'function' && typeof adapters.descendant.inspectCommit === 'function';
}
function manualUnavailable() { return Object.freeze({ status: 'unavailable', reason: 'manual_publication_authority_unavailable' }); }
function continueManualPublication({ store, transaction, stateRoot, repository_root, adapters, durabilitySupported, durabilitySync, now, fault }) {
  return continuePublicationHandoff({ store, transaction, stateRoot, repository_root, git: adapters.receipt_git, descendant_adapter: adapters.descendant, durabilitySupported, durabilitySync, now, fault });
}
async function publishPreparedManualTransaction({ store, transaction, stateRoot, repository_root, adapters, lock, durabilitySupported, durabilitySync, now, fault }) {
  const writer = await publishRuleWithInjectedGit({ store, git: adapters.writer, lock, idempotency_key: transaction, now });
  if (writer.status === 'receipt_pending') {
    const accepted = acceptRemotePublicationTransaction({ store, writer_result: writer, descendant_adapter: adapters.descendant, handoff: null, now, fault });
    if (!['accepted_remote', 'existing', 'handoff_pending'].includes(accepted.status)) return accepted;
  } else if (writer.status !== 'accepted_remote') return writer;
  return continueManualPublication({ store, transaction, stateRoot, repository_root, adapters, durabilitySupported, durabilitySync, now, fault });
}
/** Composes manual admission with shared writer and receipt handoff using closed, non-interchangeable adapters. */
export async function publishManualRefinement({ store, admission_capability, stateRoot, repository_root, adapters, lock, durabilitySupported, durabilitySync, now, fault } = {}) {
  if (!store || !validAdapters(adapters) || typeof stateRoot !== 'string' || typeof repository_root !== 'string' || typeof now !== 'string') return manualUnavailable();
  let prepared; try { prepared = prepareManualRefinementTransaction({ store, admission_capability, now }); } catch { return manualUnavailable(); }
  return publishPreparedManualTransaction({ store, transaction: prepared.idempotency_key, stateRoot, repository_root, adapters, lock, durabilitySupported, durabilitySync, now, fault });
}
/** Resumes only store-verified durable manual transactions; no ephemeral admission capability or caller target is accepted. */
export async function resumeManualRefinementPublication({ store, idempotency_key, stateRoot, repository_root, adapters, lock, durabilitySupported, durabilitySync, now, fault } = {}) {
  if (!store || typeof store.readManualPublicationRecoveryFacts !== 'function' || !validAdapters(adapters) || typeof stateRoot !== 'string' || typeof repository_root !== 'string' || typeof now !== 'string') return manualUnavailable();
  const facts = store.readManualPublicationRecoveryFacts({ idempotency_key });
  if (!facts) return manualUnavailable();
  if (facts.state === 'accepted_remote') return continueManualPublication({ store, transaction: facts.idempotency_key, stateRoot, repository_root, adapters, durabilitySupported, durabilitySync, now, fault });
  if (facts.state === 'prepared' || facts.state === 'committed_local') return publishPreparedManualTransaction({ store, transaction: facts.idempotency_key, stateRoot, repository_root, adapters, lock, durabilitySupported, durabilitySync, now, fault });
  return Object.freeze({ status: facts.state, transaction: facts.idempotency_key });
}

export function importManualRefinementCandidate(input = {}) {
  const keys = ['store', 'request_capability', 'reader_capability', 'support', 'findings', 'enrollment_authority', 'now'];
  if (!exact(input, keys) || !input.store || typeof input.store.recordManualRefinementCandidate !== 'function' || typeof input.store.mintManualCandidateAttestation !== 'function') throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
  try {
    const request = readManualRefinementRequestFacts({ capability: input.request_capability });
    if (!request || !Array.isArray(input.findings)) throw new Error('invalid');
    const source = readManualRefinementEnvelope({ reader_capability: input.reader_capability, request });
    const built = buildRuleLearningCandidate({ support: input.support, findings: input.findings, authority: input.enrollment_authority, generator: () => source.envelope });
    if (built.status !== 'candidate' || built.candidate.rule_id !== request.rule_id || built.candidate.tier !== request.tier || built.candidate.predecessor_commit !== `commit:${request.predecessor_commit}` || built.bytes !== JSON.stringify(built.candidate)) throw new Error('invalid');
    const candidate_bytes = Buffer.from(built.bytes, 'utf8');
    const attestation = input.store.mintManualCandidateAttestation({ request_capability: input.request_capability, enrollment_authority: input.enrollment_authority, support: input.support, findings: input.findings, candidate: built.candidate, candidate_bytes, source_digest: source.source_digest, now: input.now });
    const stored = input.store.recordManualRefinementCandidate({ capability: input.request_capability, attestation, source_digest: source.source_digest, candidate_digest: built.digest, candidate_bytes, candidate: built.candidate, now: input.now });
    return Object.freeze({ status: stored.status, candidate_bytes: Buffer.from(stored.candidate_bytes), candidate_digest: stored.candidate_digest, intake_capability: stored.intake_capability });
  } catch (error) { throw new Error(error?.message === 'RULE_MANUAL_REFINEMENT_INTAKE_CONFLICT' ? 'RULE_MANUAL_REFINEMENT_INTAKE_CONFLICT' : 'RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE'); }
}
