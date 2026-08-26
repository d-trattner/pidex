import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function mirrorKey(repository, scopeId) { return createHash('sha256').update(`${repository}\0${scopeId || ''}`).digest('hex'); }
function validPath(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9._/-]*\.md$/.test(value) && !value.includes('..') && !value.includes('//'); }
function validMember(member) { return member && typeof member.rule_id === 'string' && validPath(member.path) && /^[a-f0-9]{64}$/.test(member.content_hash) && Buffer.isBuffer(member.bytes); }
function validInput(input) { const members = input?.members || (input?.member ? [input.member] : []); return input && typeof input.stateRoot === 'string' && typeof input.repository === 'string' && /^[a-f0-9]{40}$/.test(input.accepted_head) && members.length > 0 && members.every(validMember) && new Set(members.map((member) => member.path)).size === members.length; }
function validCommit(value) { return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value); }
function validDigest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function validTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function statePathInvalid() { return Object.assign(new Error('RULE_MIRROR_STATE_PATH_INVALID'), { code: 'RULE_MIRROR_STATE_PATH_INVALID' }); }
function sameIdentity(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function secureMirrorRoot(stateRoot, parts) {
  const root = path.resolve(stateRoot);
  let rootStat; let rootReal;
  try { rootStat = lstatSync(root); rootReal = realpathSync(root); } catch { throw statePathInvalid(); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw statePathInvalid();
  let current = root;
  for (const part of parts) {
    const before = lstatSync(current);
    if (!before.isDirectory() || before.isSymbolicLink() || !sameIdentity(before, current === root ? rootStat : before) || !isWithinOrSame(rootReal, realpathSync(current))) throw statePathInvalid();
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    const after = lstatSync(current);
    if (!after.isDirectory() || after.isSymbolicLink() || !isWithinOrSame(rootReal, realpathSync(current))) throw statePathInvalid();
  }
  const recheckedRoot = lstatSync(root);
  if (!sameIdentity(rootStat, recheckedRoot) || !isWithinOrSame(rootReal, realpathSync(current))) throw statePathInvalid();
  return current;
}
function isWithinOrSame(root, target) { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)); }
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
const HEAD_FACT_KEYS = Object.freeze(['schema', 'repository_identity', 'scope_id', 'accepted_remote_head', 'baseline_parent_commit', 'manifest_digest', 'tree_digest', 'verified_at', 'remote_checked_at']);
const RECEIPT_KEYS = Object.freeze(['schema', 'status', 'repository_identity', 'scope_id', 'rule_id', 'predecessor_commit', 'accepted_commit', 'tree_digest', 'content_hash', 'admission_digest', 'transaction_digest', 'lifecycle_state']);
const MAX_FIRST_PARENT_STEPS = 64;
const DESCENDANT_ENROLLMENT_KEYS = Object.freeze(['repository_identity', 'normalized_remote_digest', 'branch', 'author', 'allowed_paths']);
const DESCENDANT_DURABLE_KEYS = Object.freeze(['predecessor_commit', 'accepted_commit', 'tree_digest', 'staged_member_digests', 'admission_digest', 'transaction_digest', 'rule_id', 'tier']);
const DESCENDANT_FETCH_KEYS = Object.freeze(['repository_identity', 'normalized_remote_digest', 'branch', 'containing_head', 'containing_tree_bytes', 'containing_tree_digest', 'entries', 'predecessor_boundary']);
const GRAPH_ENTRY_KEYS = Object.freeze(['commit_oid', 'parent_oids', 'tree_oid']);
const DESCENDANT_INSPECTION_KEYS = Object.freeze(['commit_oid', 'parent_oids', 'tree_oid', 'managed_members']);
const ACCEPTED_INSPECTION_KEYS = Object.freeze(['commit_oid', 'parent_oids', 'tree_oid', 'author', 'subject', 'trailers', 'managed_members']);
const MANAGED_MEMBER_KEYS = Object.freeze(['blob_oid', 'content_hash']);
function exactKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function validHeadFacts(value) { return exactKeys(value, HEAD_FACT_KEYS) && value.schema === 'pidex-accepted-head-facts-v1' && typeof value.repository_identity === 'string' && value.repository_identity && typeof value.scope_id === 'string' && value.scope_id && (value.accepted_remote_head === null || validCommit(value.accepted_remote_head)) && validCommit(value.baseline_parent_commit) && (value.manifest_digest === null || validDigest(value.manifest_digest)) && (value.tree_digest === null || validDigest(value.tree_digest)) && validTime(value.verified_at) && (value.remote_checked_at === null || validTime(value.remote_checked_at)); }

function gitOutput(input, args) {
  const command = ['-C', input.repository_root, ...args];
  const output = input.git ? input.git(command) : execFileSync('git', command, { encoding: 'buffer' });
  return Buffer.isBuffer(output) ? output : Buffer.from(String(output));
}
function acquiredRemoteFacts(input) {
  const { repository_root, enrollment, baseline_parent_commit } = input;
  if (typeof repository_root !== 'string' || !enrollment || !validCommit(baseline_parent_commit) || ![enrollment.repository_identity, enrollment.scope_id, enrollment.remote_name, enrollment.remote, enrollment.branch].every((value) => typeof value === 'string' && value)) throw new Error('RULE_ACCEPTED_HEAD_FACTS_INVALID');
  // Exact remote-tracking ref fetch; never checks out, resets, or updates a worktree branch.
  gitOutput(input, ['fetch', '--no-tags', enrollment.remote_name, `+refs/heads/${enrollment.branch}:refs/remotes/${enrollment.remote_name}/${enrollment.branch}`]);
  const remote = gitOutput(input, ['remote', 'get-url', enrollment.remote_name]).toString().trim();
  const accepted_remote_head = gitOutput(input, ['rev-parse', `refs/remotes/${enrollment.remote_name}/${enrollment.branch}`]).toString().trim();
  if (remote !== enrollment.remote || !validCommit(accepted_remote_head)) throw new Error('RULE_ACCEPTED_HEAD_FACTS_MISMATCH');
  try { gitOutput(input, ['merge-base', '--is-ancestor', baseline_parent_commit, accepted_remote_head]); } catch { throw new Error('RULE_ACCEPTED_HEAD_ANCESTRY_INVALID'); }
  const firstParentCommit = gitOutput(input, ['rev-parse', `${accepted_remote_head}^`]).toString().trim();
  if (firstParentCommit !== baseline_parent_commit) throw new Error('RULE_ACCEPTED_HEAD_ANCESTRY_INVALID');
  const firstParent = gitOutput(input, ['rev-list', '--first-parent', `${baseline_parent_commit}..${accepted_remote_head}`]).toString().trim().split('\n').filter(Boolean);
  if (!firstParent.length || !firstParent.every(validCommit)) throw new Error('RULE_ACCEPTED_HEAD_ANCESTRY_INVALID');
  const changed = gitOutput(input, ['diff-tree', '--no-commit-id', '--name-only', '-r', baseline_parent_commit, accepted_remote_head]).toString().trim().split('\n').filter(Boolean);
  const expectedPaths = input.expected_paths;
  const validPaths = (paths) => Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length && paths.every((member) => validPath(member) || member === 'config/rule-baseline-manifest.json');
  const samePaths = (left, right) => left.length === right.length && left.every((member) => right.includes(member));
  if (!changed.every((member) => validPath(member) || member === 'config/rule-baseline-manifest.json') || (expectedPaths !== undefined && (!validPaths(expectedPaths) || !samePaths(changed, expectedPaths))) || (expectedPaths === undefined && enrollment.allowed_paths !== undefined && (!validPaths(enrollment.allowed_paths) || !samePaths(changed, enrollment.allowed_paths)))) throw new Error('RULE_ACCEPTED_HEAD_HISTORY_INVALID');
  const tree_digest = sha256(gitOutput(input, ['cat-file', '-p', `${accepted_remote_head}^{tree}`]));
  const manifest_digest = sha256(gitOutput(input, ['show', `${accepted_remote_head}:config/rule-baseline-manifest.json`]));
  return { schema: 'pidex-accepted-head-facts-v1', repository_identity: enrollment.repository_identity, scope_id: enrollment.scope_id, accepted_remote_head, baseline_parent_commit, manifest_digest, tree_digest, verified_at: new Date().toISOString(), remote_checked_at: new Date().toISOString() };
}

/** Acquires canonical remote facts read-only, or validates a supplied packaged seed. */
export function acquireAcceptedHeadFacts(input = {}) {
  if (input.kind === 'accepted_remote') {
    const result = acquiredRemoteFacts(input);
    if (!validHeadFacts(result)) throw new Error('RULE_ACCEPTED_HEAD_FACTS_INVALID');
    return freeze(result);
  }
  const { kind, repository_identity, scope_id, accepted_remote_head = null, baseline_parent_commit, manifest_digest = null, tree_digest = null, verified_at, remote_checked_at = null } = input;
  const result = { schema: 'pidex-accepted-head-facts-v1', repository_identity, scope_id, accepted_remote_head, baseline_parent_commit, manifest_digest, tree_digest, verified_at, remote_checked_at };
  if (!['packaged_seed', 'current_project'].includes(kind) || !validHeadFacts(result) || (kind === 'packaged_seed' && (accepted_remote_head !== null || tree_digest !== null || remote_checked_at !== null || !validDigest(manifest_digest))) || (kind === 'current_project' && (!validCommit(accepted_remote_head) || !validDigest(tree_digest) || !validTime(remote_checked_at)))) throw new Error('RULE_ACCEPTED_HEAD_FACTS_INVALID');
  return freeze(result);
}

/** Verifies one bounded first-parent proof using only immutable facts and injected fetch/inspect capabilities. */
export function verifyAcceptedRemoteDescendantProof({ receipt, enrollment, durable, adapter } = {}) {
  const mismatch = () => { throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH'); };
  const validReceipt = exactKeys(receipt, RECEIPT_KEYS) && receipt.schema === 'pidex-accepted-remote-receipt-v1' && receipt.status === 'accepted_remote' && [receipt.repository_identity, receipt.scope_id, receipt.rule_id].every((value) => typeof value === 'string' && value) && [receipt.predecessor_commit, receipt.accepted_commit].every(validCommit) && [receipt.tree_digest, receipt.content_hash, receipt.admission_digest, receipt.transaction_digest].every(validDigest) && ['active', 'deactivated'].includes(receipt.lifecycle_state);
  const validPaths = (paths) => Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length && paths.every((memberPath) => validPath(memberPath) || memberPath === 'config/rule-baseline-manifest.json');
  const validStaged = (staged) => staged && typeof staged === 'object' && !Array.isArray(staged) && validPaths(Object.keys(staged)) && Object.values(staged).every(validDigest);
  if (!validReceipt || !exactKeys(enrollment, DESCENDANT_ENROLLMENT_KEYS) || !validDigest(enrollment.normalized_remote_digest) || !validPaths(enrollment.allowed_paths) || typeof enrollment.repository_identity !== 'string' || !enrollment.repository_identity || typeof enrollment.branch !== 'string' || !enrollment.branch || typeof enrollment.author !== 'string' || !enrollment.author || !exactKeys(durable, DESCENDANT_DURABLE_KEYS) || ![durable.predecessor_commit, durable.accepted_commit].every(validCommit) || ![durable.tree_digest, durable.admission_digest, durable.transaction_digest].every(validDigest) || !validStaged(durable.staged_member_digests) || durable.rule_id !== receipt.rule_id || !['global', 'project'].includes(durable.tier) || durable.predecessor_commit !== receipt.predecessor_commit || durable.accepted_commit !== receipt.accepted_commit || durable.tree_digest !== receipt.tree_digest || durable.admission_digest !== receipt.admission_digest || durable.transaction_digest !== receipt.transaction_digest || typeof adapter?.fetchEnrolledBranch !== 'function' || typeof adapter?.inspectCommit !== 'function') mismatch();
  const managedPaths = Object.keys(durable.staged_member_digests).sort();
  if (JSON.stringify(managedPaths) !== JSON.stringify([...enrollment.allowed_paths].sort())) mismatch();
  let fresh;
  try { fresh = adapter.fetchEnrolledBranch(enrollment); } catch { mismatch(); }
  if (!exactKeys(fresh, DESCENDANT_FETCH_KEYS) || fresh.repository_identity !== enrollment.repository_identity || fresh.normalized_remote_digest !== enrollment.normalized_remote_digest || fresh.branch !== enrollment.branch || !validCommit(fresh.containing_head) || !Buffer.isBuffer(fresh.containing_tree_bytes) || !validDigest(fresh.containing_tree_digest) || sha256(fresh.containing_tree_bytes) !== fresh.containing_tree_digest || fresh.predecessor_boundary !== receipt.predecessor_commit || !Array.isArray(fresh.entries) || fresh.entries.length < 1 || fresh.entries.length > MAX_FIRST_PARENT_STEPS + 1) mismatch();
  const seen = new Set();
  for (let index = 0; index < fresh.entries.length; index += 1) {
    const entry = fresh.entries[index];
    if (!exactKeys(entry, GRAPH_ENTRY_KEYS) || !validCommit(entry.commit_oid) || !Array.isArray(entry.parent_oids) || entry.parent_oids.length !== 1 || !validCommit(entry.parent_oids[0]) || !validCommit(entry.tree_oid) || (index === 0 && entry.commit_oid !== fresh.containing_head) || (index > 0 && fresh.entries[index - 1].parent_oids[0] !== entry.commit_oid) || seen.has(entry.commit_oid)) mismatch();
    seen.add(entry.commit_oid);
  }
  const acceptedIndex = fresh.entries.findIndex((entry) => entry.commit_oid === receipt.accepted_commit);
  if (acceptedIndex !== fresh.entries.length - 1 || acceptedIndex > MAX_FIRST_PARENT_STEPS || fresh.entries[acceptedIndex].parent_oids[0] !== fresh.predecessor_boundary) mismatch();
  const expectedTrailers = { 'PIDEX-Rule-ID': receipt.rule_id, 'PIDEX-Transaction-Digest': receipt.transaction_digest, 'PIDEX-Admission-Digest': receipt.admission_digest, 'PIDEX-Predecessor': `commit:${receipt.predecessor_commit}` };
  const inspections = [];
  for (let index = 0; index < fresh.entries.length; index += 1) {
    const entry = fresh.entries[index]; let inspected;
    try { inspected = adapter.inspectCommit(entry.commit_oid); } catch { mismatch(); }
    const accepted = index === acceptedIndex;
    if (!exactKeys(inspected, accepted ? ACCEPTED_INSPECTION_KEYS : DESCENDANT_INSPECTION_KEYS) || inspected.commit_oid !== entry.commit_oid || JSON.stringify(inspected.parent_oids) !== JSON.stringify(entry.parent_oids) || inspected.tree_oid !== entry.tree_oid || !inspected.managed_members || typeof inspected.managed_members !== 'object' || Array.isArray(inspected.managed_members) || JSON.stringify(Object.keys(inspected.managed_members).sort()) !== JSON.stringify(managedPaths)) mismatch();
    for (const memberPath of managedPaths) {
      const member = inspected.managed_members[memberPath];
      if (!exactKeys(member, MANAGED_MEMBER_KEYS) || !validCommit(member.blob_oid) || !validDigest(member.content_hash) || member.content_hash !== durable.staged_member_digests[memberPath]) mismatch();
    }
    if (accepted && (inspected.author !== enrollment.author || inspected.subject !== `rules(${durable.tier}): publish ${receipt.rule_id}` || JSON.stringify(inspected.trailers) !== JSON.stringify(expectedTrailers))) mismatch();
    inspections.push(inspected);
  }
  const acceptedMembers = inspections[acceptedIndex].managed_members;
  for (const inspected of inspections.slice(0, -1)) for (const memberPath of managedPaths) {
    const member = inspected.managed_members[memberPath]; const expected = acceptedMembers[memberPath];
    if (member.blob_oid !== expected.blob_oid || member.content_hash !== expected.content_hash) mismatch();
  }
  return freeze({ accepted_commit: receipt.accepted_commit, containing_head: fresh.containing_head, containing_tree_digest: fresh.containing_tree_digest });
}

/** Canonically fetches and verifies enrolled remote facts before accepting one receipt. */
export function consumeAcceptedRemoteReceipt(receipt, input = {}) {
  const enrollment = input.enrollment;
  if (!exactKeys(receipt, RECEIPT_KEYS) || receipt.schema !== 'pidex-accepted-remote-receipt-v1' || receipt.status !== 'accepted_remote' || ![receipt.repository_identity, receipt.scope_id, receipt.rule_id].every((value) => typeof value === 'string' && value) || ![receipt.predecessor_commit, receipt.accepted_commit].every(validCommit) || ![receipt.tree_digest, receipt.content_hash, receipt.admission_digest, receipt.transaction_digest].every(validDigest) || !['active', 'deactivated'].includes(receipt.lifecycle_state)) throw new Error('RULE_ACCEPTED_RECEIPT_INVALID');
  const allowed = enrollment?.allowed_paths;
  const members = canonicalReceiptMembers(receipt.rule_id, receipt.scope_id);
  const samePaths = (left, right) => left.length === right.length && left.every((member) => right.includes(member));
  if (!members || !Array.isArray(allowed) || new Set(allowed).size !== allowed.length || !samePaths(allowed, members.paths)) throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH');
  let facts;
  try { facts = acquireAcceptedHeadFacts({ kind: 'accepted_remote', repository_root: input.repository_root, enrollment, baseline_parent_commit: input.baseline_parent_commit, expected_paths: members.paths, git: input.git }); } catch { throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH'); }
  if (facts.repository_identity !== receipt.repository_identity || facts.scope_id !== receipt.scope_id || facts.accepted_remote_head !== receipt.accepted_commit || facts.baseline_parent_commit !== receipt.predecessor_commit || facts.tree_digest !== receipt.tree_digest) throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH');
  {
    let bytes; let metadata;
    try {
      bytes = gitOutput({ ...input, repository_root: input.repository_root }, ['show', `${receipt.accepted_commit}:${members.rulePath}`]);
      const match = bytes.toString('utf8').match(/^<!-- pidex-rule-receipt-v1 (\{[^\n]+\}) -->\n/);
      metadata = match && JSON.parse(match[1]);
      const index = gitOutput({ ...input, repository_root: input.repository_root }, ['show', `${receipt.accepted_commit}:${members.indexPath}`]).toString('utf8');
      if (!new RegExp(`^- \\[${escapeRegExp(receipt.rule_id)}\\]\\(${escapeRegExp(members.slug)}\\.md\\)$`, 'm').test(index) || index.match(new RegExp(`^- \\[${escapeRegExp(receipt.rule_id)}\\]\\(${escapeRegExp(members.slug)}\\.md\\)$`, 'gm')).length !== 1) throw new Error('index membership');
      if (members.global) {
        const manifest = JSON.parse(gitOutput({ ...input, repository_root: input.repository_root }, ['show', `${receipt.accepted_commit}:config/rule-baseline-manifest.json`]).toString('utf8'));
        const entries = Array.isArray(manifest?.rules) ? manifest.rules.filter((entry) => entry?.rule_id === receipt.rule_id) : [];
        if (manifest?.schema !== 'pidex-bundled-rule-seed-v1' || entries.length !== 1 || entries[0].path !== members.rulePath || entries[0].byte_hash !== receipt.content_hash) throw new Error('manifest membership');
      }
    } catch { throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH'); }
    if (!exactKeys(metadata, ['rule_id', 'admission_digest', 'transaction_digest', 'lifecycle_state']) || sha256(bytes) !== receipt.content_hash || metadata.rule_id !== receipt.rule_id || metadata.admission_digest !== receipt.admission_digest || metadata.transaction_digest !== receipt.transaction_digest || metadata.lifecycle_state !== receipt.lifecycle_state) throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH');
  }
  const proof = input.publication_proof;
  if (proof !== undefined) {
    if (!exactKeys(proof, ['containing_head', 'entries', 'predecessor_boundary']) || !validCommit(proof.containing_head) || !validCommit(proof.predecessor_boundary) || !Array.isArray(proof.entries) || proof.entries.length < 1 || proof.entries.length > 65 || proof.containing_head !== facts.accepted_remote_head || proof.predecessor_boundary !== receipt.predecessor_commit) throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH');
    for (let index = 0; index < proof.entries.length; index += 1) {
      const entry = proof.entries[index];
      if (!exactKeys(entry, ['commit_oid', 'parent_oids', 'tree_oid']) || !validCommit(entry.commit_oid) || !Array.isArray(entry.parent_oids) || entry.parent_oids.length !== 1 || !validCommit(entry.parent_oids[0]) || !validCommit(entry.tree_oid) || (index === 0 && entry.commit_oid !== proof.containing_head) || (index > 0 && proof.entries[index - 1].parent_oids[0] !== entry.commit_oid) || (index === proof.entries.length - 1 && (entry.commit_oid !== receipt.accepted_commit || entry.parent_oids[0] !== proof.predecessor_boundary)) || proof.entries.findIndex((candidate) => candidate.commit_oid === entry.commit_oid) !== index) throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH');
    }
    if (proof.entries.length - 1 > 64) throw new Error('RULE_ACCEPTED_RECEIPT_MISMATCH');
  }
  return freeze({ ...facts, accepted_commit: receipt.accepted_commit, containing_head: proof?.containing_head || facts.accepted_remote_head });
}
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function canonicalReceiptMembers(ruleId, scopeId) {
  const global = /^pidex-global:([a-z0-9-]+):([a-z0-9-]+)$/.exec(ruleId || '');
  if (global) { const [, agent, slug] = global; const rulePath = `rules/${agent}/${slug}.md`; return { global: true, slug, rulePath, indexPath: `rules/${agent}/index.md`, paths: [rulePath, `rules/${agent}/index.md`, 'config/rule-baseline-manifest.json'] }; }
  const project = /^project:([a-f0-9]{24,64}):([a-z0-9-]+):([a-z0-9-]+)$/.exec(ruleId || '');
  if (!project || project[1] !== scopeId) return undefined;
  const [, , agent, slug] = project; const parent = `pidex/rules/managed/${agent}`; const rulePath = `${parent}/${slug}.md`;
  return { global: false, slug, rulePath, indexPath: `${parent}/index.md`, paths: [rulePath, `${parent}/index.md`] };
}

function generationBytes(acceptedHead, members) {
  return Buffer.from(JSON.stringify({ schema: 'pidex-rule-mirror-generation-v1', accepted_head: acceptedHead, members: members.map(({ rule_id, path: memberPath, content_hash }) => ({ rule_id, path: memberPath, content_hash })).sort((left, right) => left.path.localeCompare(right.path)) }));
}
function readNoFollowVerifiedFile(rootReal, target) {
  const before = lstatSync(target); const real = realpathSync(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !isWithinOrSame(rootReal, real)) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
  let descriptor;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened)) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
    const contents = Buffer.alloc(opened.size); let offset = 0;
    while (offset < contents.length) { const count = readSync(descriptor, contents, offset, contents.length - offset, offset); if (count <= 0) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE'); offset += count; }
    const after = lstatSync(target);
    if (!sameIdentity(before, after) || after.size !== before.size || after.nlink !== 1 || after.isSymbolicLink()) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
    return contents;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}
/** Returns exact immutable mirror member bytes after generation, path, link, identity, and hash proof. */
export function readVerifiedMirrorMember({ stateRoot, repository, scope_id, accepted_commit, path: memberPath, content_hash } = {}) {
  if (typeof stateRoot !== 'string' || typeof repository !== 'string' || !repository || typeof scope_id !== 'string' || !validCommit(accepted_commit) || !validPath(memberPath) || !validDigest(content_hash)) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
  try {
    const stateReal = realpathSync(path.resolve(stateRoot)); const root = path.join(stateReal, 'quality', 'rule-lifecycle', 'mirrors', mirrorKey(repository, scope_id), accepted_commit);
    const rootStat = lstatSync(root); const rootReal = realpathSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !isWithinOrSame(stateReal, rootReal)) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
    const generationBytesRead = readNoFollowVerifiedFile(rootReal, path.join(root, 'generation.json'));
    const generation = JSON.parse(generationBytesRead.toString('utf8'));
    if (generation?.schema !== 'pidex-rule-mirror-generation-v1' || generation.accepted_head !== accepted_commit || !Array.isArray(generation.members) || !generation.members.every((member) => member && typeof member.rule_id === 'string' && validPath(member.path) && validDigest(member.content_hash)) || !generationBytesRead.equals(generationBytes(accepted_commit, generation.members))) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
    const selected = generation.members.filter((member) => member.path === memberPath && member.content_hash === content_hash);
    if (selected.length !== 1) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
    for (const member of generation.members) { const memberBytes = readNoFollowVerifiedFile(rootReal, path.join(root, ...member.path.split('/'))); if (sha256(memberBytes) !== member.content_hash) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE'); }
    const result = readNoFollowVerifiedFile(rootReal, path.join(root, ...memberPath.split('/')));
    if (sha256(result) !== content_hash || !sameIdentity(rootStat, lstatSync(root))) throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE');
    return Buffer.from(result);
  } catch { throw new Error('RULE_MIRROR_MEMBER_UNAVAILABLE'); }
}
function verifiedGenerationFile(root, file, expectedDigest) {
  const rootReal = realpathSync(root); const target = path.join(root, ...file.split('/'));
  const before = lstatSync(target); const real = realpathSync(target);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !isWithinOrSame(rootReal, real)) return false;
  const bytes = readFileSync(target); const after = lstatSync(target);
  return sameIdentity(before, after) && before.size === after.size && after.isFile() && !after.isSymbolicLink() && after.nlink === 1 && sha256(bytes) === expectedDigest;
}
function verifyGeneration(root, acceptedHead, members) {
  const manifest = generationBytes(acceptedHead, members);
  try {
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !isWithinOrSame(realpathSync(root), realpathSync(root))) return false;
    const files = (function collect(current = root) { return readdirSync(current, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? collect(path.join(current, entry.name)) : [path.relative(root, path.join(current, entry.name)).split(path.sep).join('/')]); })().sort();
    const expected = [...members.map((member) => member.path), 'generation.json'].sort();
    if (JSON.stringify(files) !== JSON.stringify(expected) || !verifiedGenerationFile(root, 'generation.json', sha256(manifest))) return false;
    return members.every((member) => verifiedGenerationFile(root, member.path, member.content_hash));
  } catch { return false; }
}
function verifiedDirectoryWitness(directory, witnessPath, expectedDigest) {
  let directoryStat; let directoryReal; let before; let witnessReal;
  try { directoryStat = lstatSync(directory); directoryReal = realpathSync(directory); before = lstatSync(witnessPath); witnessReal = realpathSync(witnessPath); } catch { throw statePathInvalid(); }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || !before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || !validDigest(expectedDigest) || !isWithinOrSame(directoryReal, witnessReal) || sha256(readFileSync(witnessPath)) !== expectedDigest) throw statePathInvalid();
  return { before, witnessReal };
}
export function syncDirectory(directory, { platform = process.platform, witnessPath, expectedDigest, sync = fsyncSync } = {}) {
  if (platform !== 'win32') {
    try { const descriptor = openSync(directory, 'r'); try { sync(descriptor); } finally { closeSync(descriptor); } } catch (error) { if (['EINVAL', 'ENOTSUP', 'EOPNOTSUPP'].includes(error?.code)) return false; throw error; }
    return true;
  }
  const witness = verifiedDirectoryWitness(directory, witnessPath, expectedDigest); let descriptor;
  try {
    descriptor = openSync(witness.witnessReal, 'r+');
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(witness.before, opened) || opened.size !== witness.before.size) throw statePathInvalid();
    sync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  const after = verifiedDirectoryWitness(directory, witnessPath, expectedDigest);
  if (!sameIdentity(witness.before, after.before) || after.before.size !== witness.before.size || after.witnessReal !== witness.witnessReal) throw statePathInvalid();
  return true;
}
function boundDirectory(rootReal, target, prior) {
  let stat; let real;
  try { stat = lstatSync(target); real = realpathSync(target); } catch { throw statePathInvalid(); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || !isWithinOrSame(rootReal, real) || (prior && !sameIdentity(stat, prior))) throw statePathInvalid();
  return stat;
}
function validatePublishedChain(chain) {
  if (existsSync(chain.stage)) throw statePathInvalid();
  chain.rootIdentity = boundDirectory(chain.rootReal, chain.root, chain.rootIdentity);
  chain.memberParents = chain.memberParents.map((member) => ({ ...member, identity: boundDirectory(chain.rootReal, member.path, member.identity) }));
}
function rebasePublishedMemberParents(chain) {
  chain.memberParents = chain.memberParents.map((member) => {
    const relative = path.relative(chain.stage, member.path);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw statePathInvalid();
    const publishedPath = path.join(chain.root, relative);
    return { path: publishedPath, identity: boundDirectory(chain.rootReal, publishedPath) };
  });
}
function checkpoint(input, parts, name, action, chain) {
  const validate = () => {
    secureMirrorRoot(input.stateRoot, parts.slice(0, -1));
    if (chain.published) validatePublishedChain(chain);
    else if (chain.stageIdentity) {
      chain.stageIdentity = boundDirectory(chain.rootReal, chain.stage, chain.stageIdentity);
      chain.memberParents = chain.memberParents.map((member) => ({ ...member, identity: boundDirectory(chain.rootReal, member.path, member.identity) }));
    } else if (existsSync(chain.stage)) throw statePathInvalid();
  };
  validate();
  input.checkpoint?.(name, 'pre', chain);
  validate();
  const result = action();
  if (name === 'create-stage') chain.stageIdentity = boundDirectory(chain.rootReal, chain.stage);
  if (name === 'rename') { chain.rootIdentity = boundDirectory(chain.rootReal, chain.root); chain.published = true; rebasePublishedMemberParents(chain); }
  input.checkpoint?.(name, 'post', chain);
  validate();
  return result;
}
export function flushReopenMode(platform = process.platform) { return platform === 'win32' ? 'r+' : 'r'; }
function writeVerified(file, bytes, digest) {
  writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
  const descriptor = openSync(file, flushReopenMode());
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
  if (sha256(readFileSync(file)) !== digest) throw new Error('RULE_MIRROR_DIGEST_MISMATCH');
}
/** Stages complete verified mirror generation then atomically publishes immutable directory. */
/** Reads exact resolver-selected bytes from immutable mirror generations; no source fallback. */
function appliesToRuntime(rule, agent, phase) {
  if (rule.lifecycle_state !== undefined && rule.lifecycle_state !== 'active') return false;
  if (agent !== undefined && rule.agent !== undefined && rule.agent !== agent) return false;
  if (phase !== undefined && Array.isArray(rule.phases) && rule.phases.length > 0 && !rule.phases.includes(phase)) return false;
  return true;
}

const REVIEWER_PRODUCERS = Object.freeze({
  'pidex-critic': Object.freeze({ rule_id: 'pidex.analysis-metrics-history.structured-review-outcome.critic', path: 'modules/pidex/analysis-metrics-history/rules/structured-review-outcome.md' }),
  'pidex-code-reviewer': Object.freeze({ rule_id: 'pidex.analysis-metrics-history.structured-review-outcome.code-review', path: 'modules/pidex/analysis-metrics-history/rules/structured-review-outcome.md' }),
  'pidex-security': Object.freeze({ rule_id: 'pidex.analysis-metrics-history.structured-review-outcome.security', path: 'modules/pidex/analysis-metrics-history/rules/structured-review-outcome.md' }),
  'pidex-qa': Object.freeze({ rule_id: 'pidex.analysis-metrics-history.structured-review-outcome.qa', path: 'modules/pidex/analysis-metrics-history/rules/structured-review-outcome.md' }),
});

/** Requires reviewer outcome schema in exact canonical immutable member, never concatenated prompt bytes. */
export function validateRequiredReviewerProducer({ agent, phase, resolverSnapshot, rendered } = {}) {
  const expected = REVIEWER_PRODUCERS[agent];
  if (!expected) return;
  const producer = resolverSnapshot?.active_rules?.filter((rule) => rule?.rule_id === expected.rule_id && rule.agent === agent && Array.isArray(rule.phases) && rule.phases.includes(phase) && rule.lifecycle_state === 'active');
  const members = rendered?.members?.filter((member) => member?.rule_id === expected.rule_id && member.path === expected.path && typeof member.content === 'string');
  if (producer?.length !== 1 || members?.length !== 1 || !members[0].content.includes('```pidex-review-outcome-v1') || !members[0].content.includes('"schemaVersion": "pidex-review-outcome-v1"')) throw new Error('RULE_RUNTIME_MIRROR_MISMATCH');
}

export function renderVerifiedRuntimeRules({ stateRoot, resolverSnapshot, agent, phase } = {}) {
  if (typeof stateRoot !== 'string' || resolverSnapshot?.schema !== 'pidex-rule-resolver-snapshot-v1' || !Array.isArray(resolverSnapshot.active_rules)) throw new Error('RULE_RUNTIME_MIRROR_MISMATCH');
  const mirrorRoot = path.join(path.resolve(stateRoot), 'quality', 'rule-lifecycle', 'mirrors');
  const generations = [];
  try {
    for (const repository of readdirSync(mirrorRoot, { withFileTypes: true })) {
      if (!repository.isDirectory()) continue;
      for (const generation of readdirSync(path.join(mirrorRoot, repository.name), { withFileTypes: true })) {
        if (generation.isDirectory()) generations.push(path.join(mirrorRoot, repository.name, generation.name));
      }
    }
  } catch { throw new Error('RULE_RUNTIME_MIRROR_MISMATCH'); }
  const selected = resolverSnapshot.active_rules.filter((rule) => appliesToRuntime(rule, agent, phase)).map((rule) => {
    if (!rule || typeof rule.rule_id !== 'string' || !validCommit(rule.accepted_commit) || ![rule.version_hash, rule.content_hash, rule.mirror_digest].every(validDigest) || rule.version_hash !== rule.content_hash || rule.content_hash !== rule.mirror_digest) throw new Error('RULE_RUNTIME_MIRROR_MISMATCH');
    const matches = [];
    for (const root of generations.filter((candidate) => path.basename(candidate) === rule.accepted_commit)) {
      try {
        const generation = path.join(root, 'generation.json'); const generationStat = lstatSync(generation);
        if (!generationStat.isFile() || generationStat.isSymbolicLink() || generationStat.nlink !== 1) continue;
        const generationContents = readFileSync(generation); const manifest = JSON.parse(generationContents.toString('utf8'));
        if (manifest?.schema !== 'pidex-rule-mirror-generation-v1' || manifest.accepted_head !== rule.accepted_commit || !Array.isArray(manifest.members) || !manifest.members.every((member) => member && typeof member.rule_id === 'string' && validPath(member.path) && validDigest(member.content_hash)) || !generationContents.equals(generationBytes(rule.accepted_commit, manifest.members))) continue;
        const member = manifest.members.filter((item) => item.rule_id === rule.rule_id && item.content_hash === rule.content_hash);
        if (member.length !== 1) continue;
        const memberFile = path.join(root, ...member[0].path.split('/')); const memberStat = lstatSync(memberFile);
        if (!memberStat.isFile() || memberStat.isSymbolicLink() || memberStat.nlink !== 1) continue;
        const bytes = readFileSync(memberFile);
        if (sha256(bytes) === rule.content_hash) matches.push(Object.freeze({ path: member[0].path, content: bytes.toString('utf8') }));
      } catch { /* invalid generation cannot provide runtime authority */ }
    }
    if (matches.length !== 1) throw new Error('RULE_RUNTIME_MIRROR_MISMATCH');
    return Object.freeze({ rule_id: rule.rule_id, path: matches[0].path, content: matches[0].content });
  });
  return Object.freeze({ rendered: selected.map((member) => member.content).join('\n\n'), members: Object.freeze(selected) });
}

export function materializeVerifiedMirror(input = {}) {
  if (!validInput(input)) throw new Error('RULE_MIRROR_INPUT_INVALID');
  const members = input.members || [input.member];
  if (!members.every((member) => sha256(member.bytes) === member.content_hash)) throw new Error('RULE_MIRROR_DIGEST_MISMATCH');
  const parts = ['quality', 'rule-lifecycle', 'mirrors', mirrorKey(input.repository, input.scope_id), input.accepted_head];
  const root = path.join(secureMirrorRoot(input.stateRoot, parts.slice(0, -1)), parts.at(-1));
  if (existsSync(root) && (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink() || !isWithinOrSame(realpathSync(path.resolve(input.stateRoot)), realpathSync(root)))) throw statePathInvalid();
  const files = members.map((member) => path.join(root, ...member.path.split('/')));
  if (existsSync(root)) {
    if (!verifyGeneration(root, input.accepted_head, members)) throw new Error('RULE_MIRROR_GENERATION_COLLISION');
    return Object.freeze({ status: 'verified', head: input.accepted_head, digest: members[0].content_hash, file: files[0], files: Object.freeze(files) });
  }
  const staged = `${root}.stage-${randomUUID()}`;
  const chain = { rootReal: realpathSync(path.resolve(input.stateRoot)), root, stage: staged, stageIdentity: undefined, rootIdentity: undefined, memberParents: [], published: false };
  const ensureMemberParent = (memberPath) => {
    let current = staged;
    for (const part of memberPath.split('/').slice(0, -1)) {
      boundDirectory(chain.rootReal, current, current === staged ? chain.stageIdentity : undefined);
      current = path.join(current, part);
      if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
      const identity = boundDirectory(chain.rootReal, current);
      if (!chain.memberParents.some((member) => member.path === current)) chain.memberParents.push({ path: current, identity });
    }
    return current;
  };
  const nonAttested = () => Object.freeze({ status: 'non_attested', reason_code: 'RULE_MIRROR_DURABILITY_UNSUPPORTED' });
  const platform = input.platform || process.platform;
  const syncWitness = (directory, witnessPath, expectedDigest) => syncDirectory(directory, { platform, witnessPath, expectedDigest, sync: input.durabilitySync || fsyncSync });
  if (input.durabilitySupported === false) return nonAttested();
  try {
    checkpoint(input, parts, 'create-stage', () => mkdirSync(staged, { mode: 0o700 }), chain);
    for (const member of members) {
      const target = path.join(staged, ...member.path.split('/'));
      checkpoint(input, parts, 'create-parent', () => ensureMemberParent(member.path), chain);
      checkpoint(input, parts, 'open/write-member', () => writeVerified(target, member.bytes, member.content_hash), chain);
      checkpoint(input, parts, 'file-fsync', () => undefined, chain);
    }
    const manifest = generationBytes(input.accepted_head, members);
    checkpoint(input, parts, 'manifest-write/fsync', () => writeVerified(path.join(staged, 'generation.json'), manifest, sha256(manifest)), chain);
    const manifestDigest = sha256(manifest);
    if (!checkpoint(input, parts, 'stage-directory-fsync', () => syncWitness(staged, path.join(staged, 'generation.json'), manifestDigest), chain)) return nonAttested();
    checkpoint(input, parts, 'rename', () => { try { renameSync(staged, root); } catch (error) { if (!existsSync(root) || !verifyGeneration(root, input.accepted_head, members)) throw error; } }, chain);
    checkpoint(input, parts, 'mirror-verify-read', () => { if (!verifyGeneration(root, input.accepted_head, members)) throw new Error('RULE_MIRROR_GENERATION_COLLISION'); }, chain);
    if (!checkpoint(input, parts, 'parent-fsync', () => syncWitness(path.dirname(root), path.join(root, 'generation.json'), manifestDigest), chain)) return nonAttested();
    if (!verifyGeneration(root, input.accepted_head, members)) throw new Error('RULE_MIRROR_GENERATION_COLLISION');
    return Object.freeze({ status: 'verified', head: input.accepted_head, digest: members[0].content_hash, file: files[0], files: Object.freeze(files) });
  } finally {
    try {
      if (!chain.published && chain.stageIdentity) { boundDirectory(chain.rootReal, staged, chain.stageIdentity); rmSync(staged, { recursive: true, force: true }); }
    } catch { /* drifted path remains untouched; no cleanup through unvalidated identity */ }
  }
}
