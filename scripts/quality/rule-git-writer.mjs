import { createHash } from 'node:crypto';

const HEAD = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const GIT_METHODS = Object.freeze(['fetchExpected', 'remoteUrl', 'resolveHead', 'identitySnapshot', 'createIsolatedWorkspace', 'readCanonicalMembers', 'writeFileNoFollow', 'stage', 'stagedEntries', 'commit', 'fetchObserved', 'pushFastForward', 'postPushObserve', 'containsCommit', 'inspectCommit', 'cleanup']);
const SAFE_REASON = Object.freeze({ adapter: 'git_adapter_unavailable', authority: 'writer_authority_unavailable', invariant: 'writer_invariant_failed', stop: 'writer_local_stop', remote: 'remote_advanced', push: 'push_unavailable', history: 'cadence_history_invalid' });
const sha = (value) => createHash('sha256').update(value).digest('hex');
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
function exactAdapter(git) { return git && typeof git === 'object' && Object.keys(git).length === GIT_METHODS.length && GIT_METHODS.every((method) => typeof git[method] === 'function') && Object.keys(git).every((method) => GIT_METHODS.includes(method)); }
function safeResult(status, transaction, reason) { return Object.freeze({ status, ...(typeof transaction === 'string' && /^tx:[a-f0-9]{64}$/.test(transaction) ? { transaction } : {}), reason }); }
function receiptPending(transaction, prepared_commit, observed_head, recovery_code) { return Object.freeze({ status: 'receipt_pending', transaction, prepared_commit, observed_head, recovery_code }); }
function validLease(lease) { return lease !== null && typeof lease === 'object' && !Array.isArray(lease); }
function validRemote(value, authority, target) { return value && HEAD.test(value.head || '') && value.remote_digest === authority.normalized_remote_digest && value.branch === authority.branch && value.repository === target.repository; }
function validPath(path) { return typeof path === 'string' && path.length <= 240 && /^(?:config\/rule-baseline-manifest\.json|rules\/[a-z][a-z0-9-]*\/(?:index\.md|[a-z][a-z0-9-]*\.md)|pidex\/rules\/managed\/[a-z][a-z0-9-]*\/(?:index\.md|[a-z][a-z0-9-]*\.md))$/.test(path) && path.normalize('NFC') === path && !/(?:^|\/)(?:\.|\.\.)(?:\/|$)/.test(path) && !/(?:^|\/)(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\/|$)/.test(path); }
function validAuthority(value) { return value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'author,branch,files_identity_digest,identity_platform,identity_proof,normalized_remote_digest,parent_identity_digest,publication_timestamp,repository_identity_digest,root_identity_digest,trailer_policy,writer_enabled' && DIGEST.test(value.normalized_remote_digest || '') && /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(value.branch || '') && !value.branch.includes('..') && /^[A-Za-z][A-Za-z .'-]{0,126} <[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9.-]{1,190}>$/.test(value.author || '') && typeof value.publication_timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.publication_timestamp) && new Date(value.publication_timestamp).toISOString() === value.publication_timestamp && value.writer_enabled === true && value.trailer_policy === 'publication-v1' && DIGEST.test(value.repository_identity_digest || '') && ['posix', 'windows'].includes(value.identity_platform) && DIGEST.test(value.root_identity_digest || '') && DIGEST.test(value.parent_identity_digest || '') && DIGEST.test(value.files_identity_digest || '') && value.identity_proof === 'supported-v1'; }
function validStagedMemberDigests(value, allowedPaths) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === allowedPaths.length && Object.keys(value).every((path) => allowedPaths.includes(path) && DIGEST.test(value[path])); }
function validActionFacts(facts) {
  const target = facts?.target; const action = facts?.action;
  const durable = facts?.state !== 'committed_local' || (HEAD.test(facts.local_commit || '') && facts.local_commit !== facts.expected_base && facts.local_parent === facts.expected_base && DIGEST.test(facts.local_tree_digest || '') && validStagedMemberDigests(facts.staged_member_digests, target?.allowed_paths || []));
  return facts && /^tx:[a-f0-9]{64}$/.test(facts.idempotency_key || '') && ['prepared', 'committed_local'].includes(facts.state) && durable && typeof facts.local_stop_active === 'boolean' && (facts.local_stop_active ? /^[a-z][a-z0-9_]{2,63}$/.test(facts.local_stop_reason_code || '') : facts.local_stop_reason_code === null) && HEAD.test(facts.expected_base || '') && target && action && validAuthority(target.writer_authority) && typeof target.rule_id === 'string' && target.rule_id === action.rule_id && target.predecessor === `commit:${facts.expected_base}` && facts.expected_base === action.predecessor_commit && Array.isArray(target.allowed_paths) && target.allowed_paths.length === (target.tier === 'global' ? 3 : 2) && new Set(target.allowed_paths).size === target.allowed_paths.length && target.allowed_paths.every(validPath) && action.schema === 'pidex-rule-lifecycle-action-request-v1' && ['deactivated', 'active-monitor', 'active-pinned'].includes(action.lifecycle_transition) && DIGEST.test(facts.cadence_digest || '') && DIGEST.test(facts.content_hash || '') && DIGEST.test(facts.action_digest || '') && Buffer.isBuffer(facts.rule_bytes) && sha(facts.rule_bytes) === facts.content_hash;
}
function validFacts(facts) { return facts?.action ? validActionFacts(facts) : publicationFacts(facts); }
function publicationFacts(facts) { const target = facts?.target; const candidate = facts?.candidate; const durable = facts?.state !== 'committed_local' || (HEAD.test(facts.local_commit || '') && facts.local_commit !== facts.expected_base && facts.local_parent === facts.expected_base && DIGEST.test(facts.local_tree_digest || '') && validStagedMemberDigests(facts.staged_member_digests, target?.allowed_paths || [])); return facts && /^tx:[a-f0-9]{64}$/.test(facts.idempotency_key || '') && ['prepared', 'committed_local'].includes(facts.state) && durable && typeof facts.local_stop_active === 'boolean' && (facts.local_stop_active ? /^[a-z][a-z0-9_]{2,63}$/.test(facts.local_stop_reason_code || '') : facts.local_stop_reason_code === null) && HEAD.test(facts.expected_base || '') && target && candidate && validAuthority(target.writer_authority) && typeof target.rule_id === 'string' && target.rule_id === candidate.rule_id && target.predecessor === `commit:${facts.expected_base}` && Array.isArray(target.allowed_paths) && target.allowed_paths.length === (target.tier === 'global' ? 3 : 2) && new Set(target.allowed_paths).size === target.allowed_paths.length && target.allowed_paths.every(validPath) && candidate.tier === target.tier && typeof candidate.body === 'string' && candidate.body.length > 0 && !/[\u0000-\u001f\u007f]/.test(candidate.body.replace(/\n/g, '')); }
function actionLayout(facts) { const parts = facts.action.rule_id.split(':'); const rule = facts.target.tier === 'global' ? `rules/${parts[1]}/${parts[2]}.md` : `pidex/rules/managed/${parts[2]}/${parts[3]}.md`; const index = facts.target.tier === 'global' ? `rules/${parts[1]}/index.md` : `pidex/rules/managed/${parts[2]}/index.md`; if (!facts.target.allowed_paths.includes(rule) || !facts.target.allowed_paths.includes(index)) return null; return { rule, index, manifest: facts.target.tier === 'global' ? 'config/rule-baseline-manifest.json' : null }; }
function actionMaterialize(facts, existingMembers) {
  const layout = actionLayout(facts); if (!layout) return null;
  const rule_bytes = facts.rule_bytes;
  if (!Buffer.isBuffer(rule_bytes) || sha(rule_bytes) !== facts.content_hash || !Array.isArray(existingMembers) || !existingMembers.every((member) => member && Object.keys(member).sort().join(',') === 'bytes,path' && Buffer.isBuffer(member.bytes)) || new Set(existingMembers.map((member) => member.path)).size !== existingMembers.length || !existingMembers.some((member) => member.path === layout.rule) || !existingMembers.some((member) => member.path === layout.index) || (layout.manifest && !existingMembers.some((member) => member.path === layout.manifest))) return null;
  const current = existingMembers.find((member) => member.path === layout.rule);
  const currentText = current.bytes.toString('utf8'); const ruleText = rule_bytes.toString('utf8');
  if (currentText.slice(currentText.indexOf('\n') + 1) !== ruleText.slice(ruleText.indexOf('\n') + 1)) return null;
  const members = existingMembers.map((member) => member.path === layout.rule ? [layout.rule, Buffer.from(rule_bytes)] : [member.path, Buffer.from(member.bytes)]);
  const ordered = members.sort(([left], [right]) => bytewise(left, right));
  return ordered.length === facts.target.allowed_paths.length && ordered.every(([path], index) => path === [...facts.target.allowed_paths].sort(bytewise)[index]) ? ordered : null;
}
function actionTrailers(facts) { return { 'PIDEX-Rule-ID': facts.target.rule_id, 'PIDEX-Transaction-Digest': facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': facts.action_digest, 'PIDEX-Predecessor': `commit:${facts.expected_base}`, 'PIDEX-Action-Cadence': facts.cadence_digest }; }
function actionCommitMatches(inspected, facts, commit, treeDigest, members) {
  const expectedTrailers = actionTrailers(facts);
  const staged = Array.isArray(members) ? stagedMatches(Object.entries(inspected?.staged_member_digests || {}).map(([path, digest]) => ({ path, digest })), members) : stable(inspected?.staged_member_digests) === stable(members);
  return inspected && typeof inspected === 'object' && !Array.isArray(inspected) && Object.keys(inspected).sort().join(',') === 'author,commit,parents,staged_member_digests,subject,trailers,tree_digest' && inspected.commit === commit && Array.isArray(inspected.parents) && inspected.parents.length === 1 && inspected.parents[0] === facts.expected_base && inspected.tree_digest === treeDigest && DIGEST.test(inspected.tree_digest || '') && inspected.author === facts.target.writer_authority.author && inspected.subject === `rules(${facts.target.tier}): publish ${facts.target.rule_id}` && stable(inspected.trailers) === stable(expectedTrailers) && staged;
}
function memberLayout(facts) { const { target, candidate } = facts; const rule = target.tier === 'global' ? `rules/${candidate.agent}/${candidate.slug}.md` : `pidex/rules/managed/${candidate.agent}/${candidate.slug}.md`; const index = target.tier === 'global' ? `rules/${candidate.agent}/index.md` : `pidex/rules/managed/${candidate.agent}/index.md`; if (!target.allowed_paths.includes(rule) || !target.allowed_paths.includes(index)) return null; return { rule, index, manifest: target.tier === 'global' ? 'config/rule-baseline-manifest.json' : null }; }
function ruleBytes(facts) { const { candidate, idempotency_key } = facts; const header = { rule_id: candidate.rule_id, admission_digest: candidate.admission_digest || facts.admission_digest, transaction_digest: idempotency_key.slice(3), lifecycle_state: 'active' }; if (!DIGEST.test(header.admission_digest || '') || !DIGEST.test(header.transaction_digest)) return null; return Buffer.from(`<!-- pidex-rule-receipt-v1 ${JSON.stringify(header)} -->\n${candidate.body}\n`, 'utf8'); }
const bytewise = (left, right) => Buffer.from(left, 'utf8').compare(Buffer.from(right, 'utf8'));
function indexRows(bytes) {
  const lines = bytes.toString('utf8').split('\n'); const heading = lines.findIndex((line) => /^# .+Rules(?: Index)?$/.test(line));
  const table = lines.findIndex((line) => line === '| Rule ID | File | State |' || line === '| Rule | File | PROC-NEW | Summary |');
  if (heading < 0 || table < 0) return null;
  const legacy = lines[table] === '| Rule ID | File | State |';
  if (lines[table + 1] !== (legacy ? '|---|---|---|' : '|------|------|----------|---------|')) return null;
  const rows = []; let end = table + 2;
  while (end < lines.length) {
    const line = lines[end]; const match = legacy
      ? line.match(/^\| `([^`]+)` \| \[([a-z][a-z0-9-]*)\]\(([a-z][a-z0-9-]*\.md)\) \| active \|$/)
      : line.match(/^\| ([^|]+) \| \[([^\]]+)\]\(([^)]+)\) \| ([^|]+) \| (.+) \|$/);
    if (!match) break;
    if (legacy && match[2] !== match[3].slice(0, -3)) return null;
    rows.push(legacy ? { id: match[1], file: match[3], raw: line } : { id: match[1], file: match[3], raw: line }); end += 1;
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) return null;
  return { prefix: lines.slice(0, table + 2), suffix: lines.slice(end), rows, legacy };
}
/** Parses actual managed index grammars and verifies one canonical target row. */
export function verifyManagedRuleIndex({ bytes, tier, rule_id, slug } = {}) {
  const parsed = Buffer.isBuffer(bytes) && indexRows(bytes);
  if (!parsed || !['global', 'project'].includes(tier) || (tier === 'project') !== parsed.legacy || !Array.isArray(parsed.suffix) || parsed.suffix.some((line) => line !== '')) throw new Error('RULE_MANAGED_INDEX_INVALID');
  const title = typeof slug === 'string' && slug ? slug.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ') : null;
  const expectedId = parsed.legacy ? rule_id : title;
  if (typeof expectedId !== 'string' || !expectedId) throw new Error('RULE_MANAGED_INDEX_INVALID');
  const target = parsed.rows.filter((row) => row.id === expectedId && row.file === `${slug}.md`);
  if (target.length !== 1 || parsed.rows.filter((row) => row.file === `${slug}.md`).length !== 1 || !parsed.rows.every((row, index) => index === 0 || bytewise(parsed.rows[index - 1].id, row.id) < 0)) throw new Error('RULE_MANAGED_INDEX_INVALID');
  return Object.freeze({ file: target[0].file, raw: target[0].raw });
}

function renderIndex(parsed, candidate) {
  const title = candidate.slug.split('-').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  const added = parsed.legacy ? { id: candidate.rule_id, file: `${candidate.slug}.md`, raw: `| \`${candidate.rule_id}\` | [${candidate.slug}](${candidate.slug}.md) | active |` } : { id: title, file: `${candidate.slug}.md`, raw: `| ${title} | [${candidate.slug}](${candidate.slug}.md) | PROC-NEW | Managed rule. |` };
  const identity = parsed.legacy ? candidate.rule_id : title;
  const existing = parsed.rows.filter((row) => row.id !== identity);
  const insertAt = existing.findIndex((row) => bytewise(identity, row.id) < 0);
  const rows = insertAt < 0 ? [...existing, added] : [...existing.slice(0, insertAt), added, ...existing.slice(insertAt)];
  return Buffer.from([...parsed.prefix, ...rows.map((row) => row.raw), ...parsed.suffix].join('\n'), 'utf8');
}
function canonicalWorkspaceMembers(input, facts, layout) { const global = facts.target.tier === 'global'; const prefix = global ? 'rules/' : 'pidex/rules/managed/'; const allowed = (member) => member.path.startsWith(prefix) || (global && member.path.startsWith('agents/')) || member.path === layout.manifest; if (!Array.isArray(input) || !input.every((member) => member && Object.keys(member).sort().join(',') === 'bytes,path' && allowed(member) && Buffer.isBuffer(member.bytes)) || new Set(input.map((member) => member.path)).size !== input.length) return null; const members = input.filter((member) => member.path !== layout.rule && member.path !== layout.index && member.path !== layout.manifest).map((member) => [member.path, Buffer.from(member.bytes)]); const currentIndex = input.find((member) => member.path === layout.index); const parsed = currentIndex && indexRows(currentIndex.bytes); if (!parsed) return null; const index = renderIndex(parsed, facts.candidate); members.push([layout.rule, ruleBytes(facts)], [layout.index, index]); return members.every(([, bytes]) => Buffer.isBuffer(bytes)) ? { members, index, rows: parsed.rows } : null; }
function materialize(facts, existingMembers) { const layout = memberLayout(facts); const receipt = ruleBytes(facts); if (!layout || !receipt) return null; const canonicalMembers = canonicalWorkspaceMembers(existingMembers, facts, layout); if (!canonicalMembers) return null; const members = [[layout.rule, receipt], [layout.index, canonicalMembers.index]]; if (layout.manifest) { const all = canonicalMembers.members; const memberId = new Map(canonicalMembers.rows.map((row) => [`rules/${facts.candidate.agent}/${row.file}`, row.id])); memberId.set(layout.rule, facts.candidate.rule_id); memberId.set(layout.index, `legacy:${layout.index.replaceAll('/', ':').replace(/\.md$/, '')}`); const agents = all.filter(([path]) => path.startsWith('agents/')).map(([path, bytes]) => ({ path, byte_hash: sha(bytes) })).sort((left, right) => bytewise(left.path, right.path)); const rules = all.filter(([path]) => path.startsWith('rules/')).map(([path, bytes]) => ({ rule_id: memberId.get(path) || `legacy:${path.replaceAll('/', ':').replace(/\.md$/, '')}`, path, byte_hash: sha(bytes), protection_class: 'legacy_baseline' })).sort((left, right) => bytewise(left.path, right.path)); const body = { schema: 'pidex-bundled-rule-seed-v1', source_kind: 'packaged_baseline', baseline_parent_commit: facts.expected_base, agent_count: agents.length, rule_count: rules.length, agents, rules }; const manifest = { ...body, aggregate_digest: sha(Buffer.from(stable(body), 'utf8')) }; members.push([layout.manifest, Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8')]); }
  const ordered = members.sort(([left], [right]) => bytewise(left, right)); return ordered.length === facts.target.allowed_paths.length && ordered.every(([path], index) => path === [...facts.target.allowed_paths].sort(bytewise)[index]) ? ordered : null;
}
function validIdentitySnapshot(value, authority) { return value && typeof value === 'object' && Object.keys(value).sort().join(',') === 'case_safe,files_digest,hardlinks,identity_proof,links,no_follow,parent_identity_digest,platform,reparse,root_identity_digest,supported,unicode_safe' && value.platform === authority.identity_platform && value.root_identity_digest === authority.root_identity_digest && value.parent_identity_digest === authority.parent_identity_digest && value.files_digest === authority.files_identity_digest && DIGEST.test(value.files_digest || '') && value.no_follow === true && value.links === false && value.hardlinks === false && value.reparse === false && value.case_safe === true && value.unicode_safe === true && value.supported === true && value.identity_proof === authority.identity_proof; }
function sameIdentity(left, right, authority) { return validIdentitySnapshot(left, authority) && validIdentitySnapshot(right, authority) && stable(left) === stable(right); }
function stagedMatches(entries, members) { if (!Array.isArray(entries) || entries.length !== members.length) return false; const expected = new Map(members.map(([path, bytes]) => [path, sha(bytes)])); return entries.every((entry) => entry && expected.get(entry.path) === entry.digest) && new Set(entries.map((entry) => entry.path)).size === entries.length; }
function commitMatches(inspected, facts, commit, treeDigest, members) { const expectedTrailers = { 'PIDEX-Rule-ID': facts.target.rule_id, 'PIDEX-Transaction-Digest': facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': facts.admission_digest, 'PIDEX-Predecessor': `commit:${facts.expected_base}` }; const staged = Array.isArray(members) ? stagedMatches(Object.entries(inspected?.staged_member_digests || {}).map(([path, digest]) => ({ path, digest })), members) : stable(inspected?.staged_member_digests) === stable(members); return inspected && typeof inspected === 'object' && !Array.isArray(inspected) && Object.keys(inspected).sort().join(',') === 'author,commit,parents,staged_member_digests,subject,trailers,tree_digest' && inspected.commit === commit && Array.isArray(inspected.parents) && inspected.parents.length === 1 && inspected.parents[0] === facts.expected_base && inspected.tree_digest === treeDigest && DIGEST.test(inspected.tree_digest || '') && inspected.author === facts.target.writer_authority.author && inspected.subject === `rules(${facts.target.tier}): publish ${facts.target.rule_id}` && stable(inspected.trailers) === stable(expectedTrailers) && staged; }
async function call(git, method, value) { return git[method](value); }

const ACTION_TRAILER_KEYS = Object.freeze(['PIDEX-Rule-ID', 'PIDEX-Transaction-Digest', 'PIDEX-Admission-Digest', 'PIDEX-Predecessor', 'PIDEX-Action-Cadence']);
function actionLayoutPaths(rule_id) {
  const global = String(rule_id || '').match(/^pidex-global:([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/);
  if (global) return { paths: ['config/rule-baseline-manifest.json', `rules/${global[1]}/${global[2]}.md`, `rules/${global[1]}/index.md`], rule: `rules/${global[1]}/${global[2]}.md`, index: `rules/${global[1]}/index.md`, manifest: 'config/rule-baseline-manifest.json' };
  const project = String(rule_id || '').match(/^project:([a-f0-9]{24,64}):([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/);
  if (project) return { paths: [`pidex/rules/managed/${project[2]}/${project[3]}.md`, `pidex/rules/managed/${project[2]}/index.md`], rule: `pidex/rules/managed/${project[2]}/${project[3]}.md`, index: `pidex/rules/managed/${project[2]}/index.md`, manifest: null };
  return null;
}
function trailerEntries(trailers) {
  if (trailers && Array.isArray(trailers)) {
    const entries = [];
    for (const item of trailers) { if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string') return null; entries.push([item[0], item[1]]); }
    return entries;
  }
  return trailers && typeof trailers === 'object' ? Object.entries(trailers) : null;
}
function quarantine(reason) { return Object.freeze({ state: 'quarantined', reason }); }
function singleEntry(entries, key) { const found = entries.filter(([name]) => name === key); return found.length === 1 ? found[0][1] : null; }
function cadenceLayout(entries, expected) {
  if (expected.rule_id) { const layout = actionLayoutPaths(expected.rule_id); if (layout) return layout; }
  const rule = singleEntry(entries, 'PIDEX-Rule-ID'); return rule ? actionLayoutPaths(rule) : null;
}
function diffVerdict(inspected, layout, expected, parentInspected) {
  const staged = inspected.staged_member_digests;
  if (!staged || typeof staged !== 'object' || Array.isArray(staged) || Object.keys(staged).length !== layout.paths.length || Object.keys(staged).every((path) => layout.paths.includes(path)) !== true || Object.keys(staged).some((path) => !validPath(path) || !DIGEST.test(staged[path]))) return 'diff_mixed';
  const parentStaged = parentInspected?.staged_member_digests;
  for (const path of layout.paths) {
    const parentValue = parentStaged && typeof parentStaged === 'object' && DIGEST.test(parentStaged[path] || '') ? parentStaged[path] : undefined;
    if (path === layout.rule) {
      if (parentValue === undefined || parentValue === staged[path]) return 'diff_mixed';
      if (expected.content_hash && staged[path] !== expected.content_hash) return 'receipt_mismatch';
    } else if (parentValue === undefined) return 'diff_unverifiable';
    else if (parentValue !== staged[path]) return 'diff_mixed';
  }
  return 'ok';
}
/** Bounded validated canonical first-parent history classifier for one cadence key. State is clear | consumed | quarantined; DB caches never replace it. */
export function classifyActionCadenceHistory({ adapter, remote_head, bound_from, max_commits, cadence_digest, expected = {} } = {}) {
  if (!adapter || typeof adapter.inspectCommit !== 'function' || !HEAD.test(remote_head || '') || !HEAD.test(bound_from || '') || !Number.isSafeInteger(max_commits) || max_commits < 1 || !DIGEST.test(cadence_digest || '')) return quarantine('history_unavailable');
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) || !['global', 'project'].includes(expected.tier) || typeof expected.rule_id !== 'string' || !/^(?:pidex-global|project:[a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/.test(expected.rule_id) || (expected.predecessor_commit !== undefined && !HEAD.test(expected.predecessor_commit)) || (expected.transaction_digest !== undefined && !DIGEST.test(expected.transaction_digest)) || (expected.admission_digest !== undefined && !DIGEST.test(expected.admission_digest)) || (expected.content_hash !== undefined && !DIGEST.test(expected.content_hash))) return quarantine('expected_metadata_missing');
  const commits = []; const visited = new Set(); let current = remote_head;
  for (;;) {
    if (visited.has(current) || commits.length >= max_commits) return quarantine(visited.has(current) ? 'first_parent_gap' : 'history_range_oversized');
    visited.add(current);
    let inspected;
    try { inspected = adapter.inspectCommit({ commit: current }); } catch { return quarantine('history_unavailable'); }
    if (!inspected || typeof inspected !== 'object' || inspected.commit !== current || !Array.isArray(inspected.parents)) return quarantine('history_unavailable');
    commits.push({ commit: current, inspected });
    if (current === bound_from) break;
    const next = inspected.parents[0];
    if (!HEAD.test(next || '') || next === current || visited.has(next)) return quarantine('first_parent_gap');
    current = next;
  }
  let consumption = null;
  for (let index = 0; index < commits.length; index += 1) {
    const { commit, inspected } = commits[index];
    const entries = trailerEntries(inspected.trailers);
    if (!entries) continue;
    const cadenceEntries = entries.filter(([name]) => name === 'PIDEX-Action-Cadence');
    if (!cadenceEntries.length) continue;
    if (cadenceEntries.length !== 1) return quarantine('cadence_duplicate');
    const value = cadenceEntries[0][1];
    if (typeof value !== 'string' || !DIGEST.test(value) || value.normalize('NFC') !== value) return quarantine('cadence_malformed');
    const required = ACTION_TRAILER_KEYS.filter((key) => key !== 'PIDEX-Action-Cadence');
    for (const key of required) if (entries.filter(([name]) => name === key).length !== 1) return quarantine('cadence_missing_metadata');
    if (inspected.parents.length !== 1) return quarantine('cadence_parents_invalid');
    const isTarget = value === cadence_digest;
    if (isTarget) {
      if (singleEntry(entries, 'PIDEX-Rule-ID') !== expected.rule_id) return quarantine('cross_match_mismatch');
      if (expected.predecessor_commit && singleEntry(entries, 'PIDEX-Predecessor') !== `commit:${expected.predecessor_commit}`) return quarantine('cross_match_mismatch');
      if (expected.transaction_digest && singleEntry(entries, 'PIDEX-Transaction-Digest') !== expected.transaction_digest) return quarantine('cross_match_mismatch');
      if (expected.admission_digest && singleEntry(entries, 'PIDEX-Admission-Digest') !== expected.admission_digest) return quarantine('cross_match_mismatch');
    }
    const layout = cadenceLayout(entries, expected);
    if (!layout) return quarantine('cadence_malformed');
    const parent = commits[index + 1];
    const verdict = diffVerdict(inspected, layout, expected, parent?.inspected);
    if (verdict !== 'ok') return quarantine(verdict);
    if (!isTarget) continue;
    if (consumption) return quarantine('cadence_conflict');
    consumption = { commit, transaction_digest: singleEntry(entries, 'PIDEX-Transaction-Digest'), containing_head: remote_head };
  }
  return consumption ? Object.freeze({ state: 'consumed', ...consumption }) : Object.freeze({ state: 'clear', reason: 'no_consumption' });
}

/** Writes only through closed injected adapter capability. Never operates host checkout. */
export async function publishRuleWithInjectedGit({ store, git, lock, idempotency_key, now, history_bound } = {}) {
  if (!exactAdapter(git)) return safeResult('unavailable', idempotency_key, SAFE_REASON.adapter);
  if (!store || typeof store.readPublicationWriterFacts !== 'function' || (typeof store.commitLocalPublicationTransaction !== 'function' && typeof store.commitLocalLifecycleActionTransaction !== 'function') || (typeof store.appendPublicationTerminal !== 'function' && typeof store.appendLifecycleActionTerminal !== 'function') || !/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || typeof now !== 'string') return safeResult('unavailable', idempotency_key, SAFE_REASON.authority);
  if (history_bound && (!history_bound || !HEAD.test(history_bound.from || '') || !Number.isSafeInteger(history_bound.max_commits) || history_bound.max_commits < 1)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
  const prelockFacts = store.readPublicationWriterFacts({ idempotency_key }); if (!validFacts(prelockFacts)) return safeResult('unavailable', idempotency_key, SAFE_REASON.authority);
  if (!lock || typeof lock.acquire !== 'function' || typeof lock.release !== 'function') return safeResult('unavailable', idempotency_key, SAFE_REASON.authority);
  let lease; let workspace; let irreversible = false; let pushEffect = false; let preparedCommit = null; let observedHead = null;
  try {
    lease = await lock.acquire({ repository: prelockFacts.target.repository, scope_id: prelockFacts.target.scope_id }); if (!validLease(lease)) return safeResult('unavailable', idempotency_key, SAFE_REASON.authority);
    const facts = store.readPublicationWriterFacts({ idempotency_key }); if (!validFacts(facts)) return safeResult('unavailable', idempotency_key, SAFE_REASON.authority);
    if (facts.local_stop_active) return safeResult('unavailable', idempotency_key, SAFE_REASON.stop);
    const authority = facts.target.writer_authority;
    // Fresh under-lock observation decides recovery before any workspace mutation.
    if (facts.state === 'committed_local') {
      const observed = await call(git, 'fetchObserved', facts.target);
      if (!validRemote(observed, authority, facts.target)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
      if (observed.head !== facts.expected_base) {
        if (await call(git, 'containsCommit', { head: observed.head, commit: facts.local_commit })) {
          const containing = await call(git, 'inspectCommit', { commit: facts.local_commit, remote_head: observed.head });
          if ((facts.action ? actionCommitMatches(containing, facts, facts.local_commit, facts.local_tree_digest, facts.staged_member_digests) : commitMatches(containing, facts, facts.local_commit, facts.local_tree_digest, facts.staged_member_digests))) return receiptPending(idempotency_key, facts.local_commit, observed.head, 'RC-02');
        }
        (typeof facts.action !== 'undefined' ? store.appendLifecycleActionTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now }) : store.appendPublicationTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now }));
        return safeResult('deferred_remote_advanced', idempotency_key, SAFE_REASON.remote);
      }
    }
    const expected = await call(git, 'fetchExpected', facts.target);
    if (!validRemote(expected, authority, facts.target)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    if (expected.head !== facts.expected_base) {
      (typeof facts.action !== 'undefined' ? store.appendLifecycleActionTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now }) : store.appendPublicationTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now }));
      return safeResult('deferred_remote_advanced', idempotency_key, SAFE_REASON.remote);
    }
    // Plan048 cadence invariant: recheck bounded canonical first-parent history at the expected base before any preparation. Validated history is the only consumption authority; a stale DB cache can never assert clear.
    if (facts.action && history_bound) {
      const historyState = classifyActionCadenceHistory({ adapter: git, remote_head: expected.head, bound_from: history_bound.from, max_commits: history_bound.max_commits, cadence_digest: facts.cadence_digest, expected: { tier: facts.target.tier, rule_id: facts.target.rule_id } });
      if (historyState.state !== 'clear') return safeResult('unavailable', idempotency_key, SAFE_REASON.history);
    }
    const before = await call(git, 'identitySnapshot', { target: facts.target, paths: facts.target.allowed_paths });
    workspace = await call(git, 'createIsolatedWorkspace', { base: facts.expected_base, target: facts.target }); if (!workspace || Object.keys(workspace).sort().join(',') !== 'clean,id' || workspace.clean !== true) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    const remote = await call(git, 'remoteUrl', workspace); if (!remote || remote.remote_digest !== authority.normalized_remote_digest || remote.repository !== facts.target.repository || remote.branch !== authority.branch || await call(git, 'resolveHead', workspace) !== facts.expected_base) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    if (!sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    const existingMembers = await call(git, 'readCanonicalMembers', { workspace, target: facts.target }); const members = facts.action ? actionMaterialize(facts, existingMembers) : materialize(facts, existingMembers); if (!members || !sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    for (const [path, bytes] of members) await call(git, 'writeFileNoFollow', { workspace, path, bytes });
    if (!sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    await call(git, 'stage', { workspace, paths: facts.target.allowed_paths }); if (!sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority) || !stagedMatches(await call(git, 'stagedEntries', workspace), members)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    const metadata = { author: authority.author, author_timestamp: authority.publication_timestamp, committer_timestamp: authority.publication_timestamp, subject: `rules(${facts.target.tier}): publish ${facts.target.rule_id}`, trailers: facts.action ? actionTrailers(facts) : { 'PIDEX-Rule-ID': facts.target.rule_id, 'PIDEX-Transaction-Digest': facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': facts.admission_digest, 'PIDEX-Predecessor': `commit:${facts.expected_base}` } };
    const prepared = await call(git, 'commit', { workspace, parent: facts.expected_base, metadata }); if (!prepared || !HEAD.test(prepared.commit || '') || prepared.commit === facts.expected_base || prepared.parent !== facts.expected_base || !DIGEST.test(prepared.tree_digest || '') || (facts.state === 'committed_local' && (prepared.commit !== facts.local_commit || prepared.tree_digest !== facts.local_tree_digest)) || !sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    preparedCommit = prepared.commit;
    const inspected = await call(git, 'inspectCommit', { workspace, commit: prepared.commit }); if (!(facts.action ? actionCommitMatches(inspected, facts, prepared.commit, prepared.tree_digest, members) : commitMatches(inspected, facts, prepared.commit, prepared.tree_digest, members)) || (facts.state === 'committed_local' && stable(inspected.staged_member_digests) !== stable(facts.staged_member_digests)) || !sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    if (facts.state === 'prepared') (facts.action ? store.commitLocalLifecycleActionTransaction({ idempotency_key, commit: prepared.commit, parent: prepared.parent, tree_digest: prepared.tree_digest, staged_member_digests: inspected.staged_member_digests, created_at: now }) : store.commitLocalPublicationTransaction({ idempotency_key, commit: prepared.commit, parent: prepared.parent, tree_digest: prepared.tree_digest, staged_member_digests: inspected.staged_member_digests, created_at: now }));
    irreversible = true;
    const observed = await call(git, 'fetchObserved', facts.target); if (!validRemote(observed, authority, facts.target) || !sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    if (observed.head !== facts.expected_base) {
      if (await call(git, 'containsCommit', { head: observed.head, commit: prepared.commit })) {
        const containing = await call(git, 'inspectCommit', { workspace, commit: prepared.commit, remote_head: observed.head });
        if ((facts.action ? actionCommitMatches(containing, facts, prepared.commit, prepared.tree_digest, members) : commitMatches(containing, facts, prepared.commit, prepared.tree_digest, members))) return receiptPending(idempotency_key, prepared.commit, observed.head, 'RC-02');
      }
      (typeof facts.action !== 'undefined' ? store.appendLifecycleActionTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now }) : store.appendPublicationTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now })); return safeResult('deferred_remote_advanced', idempotency_key, SAFE_REASON.remote);
    }
    if (!sameIdentity(before, await call(git, 'identitySnapshot', { workspace, paths: facts.target.allowed_paths }), authority) || !stagedMatches(await call(git, 'stagedEntries', workspace), members)) return safeResult('unavailable', idempotency_key, SAFE_REASON.invariant);
    pushEffect = true;
    try { await call(git, 'pushFastForward', { workspace, branch: authority.branch, expected_base: facts.expected_base, commit: prepared.commit }); }
    catch {
      const remoteAfterRace = await call(git, 'fetchObserved', facts.target);
      if (validRemote(remoteAfterRace, authority, facts.target) && remoteAfterRace.head !== facts.expected_base) {
        observedHead = remoteAfterRace.head;
        if (await call(git, 'containsCommit', { head: remoteAfterRace.head, commit: prepared.commit })) {
          const containing = await call(git, 'inspectCommit', { workspace, commit: prepared.commit, remote_head: remoteAfterRace.head });
          if ((facts.action ? actionCommitMatches(containing, facts, prepared.commit, prepared.tree_digest, members) : commitMatches(containing, facts, prepared.commit, prepared.tree_digest, members))) return receiptPending(idempotency_key, prepared.commit, remoteAfterRace.head, 'RC-02');
        }
        (typeof facts.action !== 'undefined' ? store.appendLifecycleActionTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now }) : store.appendPublicationTerminal({ idempotency_key, state: 'deferred_remote_advanced', reason_code: 'remote_advanced', created_at: now })); return safeResult('deferred_remote_advanced', idempotency_key, SAFE_REASON.remote);
      }
      return receiptPending(idempotency_key, prepared.commit, observedHead, 'postpush_verification_pending');
    }
    const postPush = await call(git, 'postPushObserve', facts.target); observedHead = postPush?.head || null;
    // Push is irreversible. Observation failure defers verification; it cannot relabel durable local publication failed.
    if (!validRemote(postPush, authority, facts.target)) return receiptPending(idempotency_key, prepared.commit, observedHead, 'postpush_verification_pending');
    if (await call(git, 'containsCommit', { head: postPush.head, commit: prepared.commit })) {
      const containing = await call(git, 'inspectCommit', { workspace, commit: prepared.commit, remote_head: postPush.head });
      if ((facts.action ? actionCommitMatches(containing, facts, prepared.commit, prepared.tree_digest, members) : commitMatches(containing, facts, prepared.commit, prepared.tree_digest, members))) return receiptPending(idempotency_key, prepared.commit, postPush.head, 'RC-03');
    }
    return receiptPending(idempotency_key, prepared.commit, observedHead, 'postpush_verification_pending');
  } catch { return pushEffect && preparedCommit ? receiptPending(idempotency_key, preparedCommit, observedHead, 'postpush_verification_pending') : safeResult('unavailable', idempotency_key, SAFE_REASON.push); }
  finally {
    let finalizationFailed = false;
    try { if (workspace) await call(git, 'cleanup', workspace); } catch { finalizationFailed = true; }
    try { if (lease) await lock.release(lease); } catch { finalizationFailed = true; }
    if (finalizationFailed) {
      if (irreversible && preparedCommit) return receiptPending(idempotency_key, preparedCommit, observedHead, 'finalization_unavailable');
      return safeResult('unavailable', idempotency_key, 'finalization_unavailable');
    }
  }
}
