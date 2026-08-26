import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyBundledBaseline } from './rule-lifecycle.mjs';
import { classifyActionCadenceHistory, publishRuleWithInjectedGit, verifyManagedRuleIndex } from './rule-git-writer.mjs';

const head = 'a'.repeat(40); const commit = 'b'.repeat(40); const hex = (value) => createHash('sha256').update(value).digest('hex');
const requiredGitMethods = ['fetchExpected', 'remoteUrl', 'resolveHead', 'identitySnapshot', 'createIsolatedWorkspace', 'readCanonicalMembers', 'writeFileNoFollow', 'stage', 'stagedEntries', 'commit', 'fetchObserved', 'pushFastForward', 'postPushObserve', 'containsCommit', 'inspectCommit', 'cleanup'];
function fixture({ observed = head } = {}) {
  const rule_id = 'pidex-global:pidex-implementer:focused-tests';
  const candidate = { rule_id, tier: 'global', agent: 'pidex-implementer', slug: 'focused-tests', body: 'Run focused tests before broad checks.', candidate_digest: 'c'.repeat(64), admission_digest: 'd'.repeat(64), predecessor_commit: `commit:${head}` };
  const writer_authority = { normalized_remote_digest: 'a'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: 'b'.repeat(64), identity_platform: 'posix', root_identity_digest: 'c'.repeat(64), parent_identity_digest: 'd'.repeat(64), files_identity_digest: 'e'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T03:00:00.000Z' };
  const target = { repository: 'repo-safe-id', tier: 'global', scope_id: 'pidex-global', scope_digest: 'e'.repeat(64), rule_id, predecessor: `commit:${head}`, enrollment_digest: 'f'.repeat(64), allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/focused-tests.md', 'rules/pidex-implementer/index.md'], writer_authority };
  const facts = { idempotency_key: `tx:${'1'.repeat(64)}`, state: 'prepared', expected_base: head, local_stop_active: false, local_stop_reason_code: null, target, candidate, admission_digest: candidate.admission_digest };
  const calls = []; const writes = new Map(); const store = { readPublicationWriterFacts: () => facts, commitLocalPublicationTransaction: (value) => { calls.push(['tx02', value]); return { state: 'committed_local' }; }, appendPublicationTerminal: (value) => { calls.push(['terminal', value]); return value; } };
  const baselineMembers = [
    { path: 'rules/pidex-implementer/index.md', bytes: Buffer.from('# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n', 'utf8') },
    { path: 'config/rule-baseline-manifest.json', bytes: Buffer.from('{"schema":"pidex-bundled-rule-seed-v1","baseline_parent_commit":"' + head + '","members":[],"aggregate_digest":"' + '0'.repeat(64) + '"}', 'utf8') },
  ];
  const git = Object.fromEntries(requiredGitMethods.map((method) => [method, (...args) => {
    calls.push([method, ...args]);
    if (method === 'fetchExpected' || method === 'fetchObserved') return { head: method === 'fetchObserved' ? observed : head, remote_digest: writer_authority.normalized_remote_digest, branch: writer_authority.branch, repository: facts.target.repository };
    if (method === 'postPushObserve') return { head: commit, remote_digest: writer_authority.normalized_remote_digest, branch: writer_authority.branch, repository: facts.target.repository };
    if (method === 'remoteUrl') return { remote_digest: writer_authority.normalized_remote_digest, repository: facts.target.repository, branch: writer_authority.branch };
    if (method === 'resolveHead') return head;
    if (method === 'createIsolatedWorkspace') return { id: 'synthetic-workspace', clean: true };
    if (method === 'readCanonicalMembers') return baselineMembers;
    if (method === 'identitySnapshot') return { platform: 'posix', root_identity_digest: writer_authority.root_identity_digest, parent_identity_digest: writer_authority.parent_identity_digest, files_digest: 'e'.repeat(64), no_follow: true, links: false, hardlinks: false, reparse: false, case_safe: true, unicode_safe: true, supported: true, identity_proof: 'supported-v1' };
    if (method === 'writeFileNoFollow') { writes.set(args[0].path, Buffer.from(args[0].bytes)); return undefined; }
    if (method === 'stagedEntries') return [...writes].map(([path, bytes]) => ({ path, digest: hex(bytes) })).sort((a, b) => a.path.localeCompare(b.path));
    if (method === 'commit') return { commit, parent: head, tree_digest: hex('tree') };
    if (method === 'containsCommit') return args[0].head === commit;
    if (method === 'inspectCommit') return { commit, parents: [head], tree_digest: hex('tree'), author: writer_authority.author, subject: `rules(global): publish ${rule_id}`, trailers: { 'PIDEX-Rule-ID': rule_id, 'PIDEX-Transaction-Digest': facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': candidate.admission_digest, 'PIDEX-Predecessor': `commit:${head}` }, staged_member_digests: Object.fromEntries([...writes].map(([path, bytes]) => [path, hex(bytes)])) };
    return undefined;
  }]));
  const lock = { acquire: () => ({ lease_id: 'writer-lock', repository: facts.target.repository, scope_id: facts.target.scope_id }), release: () => undefined };
  return { store, git, lock, calls, writes, facts };
}

test('B1 shared index verifier accepts canonical global/project rows and rejects duplicate or trailing rows', () => {
  const global = Buffer.from('# PIDEX Implementer Rules\n\n| Rule | File | PROC-NEW | Summary |\n|------|------|----------|---------|\n| Quality | [quality](quality.md) | PROC-NEW | Managed rule. |\n');
  assert.equal(verifyManagedRuleIndex({ bytes: global, tier: 'global', slug: 'quality' }).file, 'quality.md');
  assert.throws(() => verifyManagedRuleIndex({ bytes: Buffer.concat([global, Buffer.from('junk\n')]), tier: 'global', slug: 'quality' }), /RULE_MANAGED_INDEX_INVALID/);
  const project = Buffer.from('# PIDEX Implementer Rules\n\n| Rule ID | File | State |\n|---|---|---|\n| `project:scope:pidex-implementer:quality` | [quality](quality.md) | active |\n');
  assert.equal(verifyManagedRuleIndex({ bytes: project, tier: 'project', rule_id: 'project:scope:pidex-implementer:quality', slug: 'quality' }).file, 'quality.md');
  assert.throws(() => verifyManagedRuleIndex({ bytes: Buffer.concat([project, project.slice(project.indexOf(Buffer.from('| `')))]), tier: 'project', rule_id: 'project:scope:pidex-implementer:quality', slug: 'quality' }), /RULE_MANAGED_INDEX_INVALID/);
});
test('BD08-17 writer uses only closed injected fake Git, commits exact global bytes, and never invokes host Git', async () => {
  const f = fixture(); const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'receipt_pending', transaction: f.facts.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'RC-03' });
  assert.deepEqual(Object.keys(f.git).sort(), requiredGitMethods.slice().sort());
  assert.equal(f.calls.filter(([name]) => name === 'pushFastForward').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'cleanup').length, 1);
  assert.equal(f.calls.some(([name]) => /spawn|exec|git |rebase|merge|amend|force|checkout/.test(name)), false);
  assert.match(f.writes.get('rules/pidex-implementer/focused-tests.md').toString(), /^<!-- pidex-rule-receipt-v1 /);
  assert.match(f.writes.get('config/rule-baseline-manifest.json').toString(), /"baseline_parent_commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/);
  assert.deepEqual(f.calls.find(([name]) => name === 'tx02')[1].parent, head);
});
test('BD12 writer rejects live identity platform/root/parent/proof drift before materialization', async () => {
  const f = fixture();
  f.facts.target.writer_authority = { ...f.facts.target.writer_authority };
  const identity = f.git.identitySnapshot;
  f.git.identitySnapshot = (...args) => ({ ...identity(...args), platform: 'posix', root_identity_digest: '0'.repeat(64), parent_identity_digest: 'd'.repeat(64), files_digest: 'e'.repeat(64), identity_proof: 'supported-v1' });
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'unavailable', transaction: f.facts.idempotency_key, reason: 'writer_invariant_failed' });
  assert.equal(f.writes.size, 0);
});
test('TX04 remote advance never pushes or leaks private candidate bytes', async () => {
  const f = fixture({ observed: '9'.repeat(40) }); const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'deferred_remote_advanced', transaction: f.facts.idempotency_key, reason: 'remote_advanced' });
  assert.equal(f.calls.some(([name]) => name === 'pushFastForward'), false);
  assert.deepEqual(f.calls.find(([name]) => name === 'terminal')[1].state, 'deferred_remote_advanced');
  assert.doesNotMatch(JSON.stringify(result), /focused-tests|repo-safe-id|example\.invalid/);
});
test('push rejection keeps TX-02 committed-local recovery and appends no terminal', async () => {
  const f = fixture(); f.git.pushFastForward = () => { throw new Error('synthetic push rejection'); };
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'receipt_pending', transaction: f.facts.idempotency_key, prepared_commit: commit, observed_head: null, recovery_code: 'postpush_verification_pending' });
  assert.equal(f.calls.filter(([name]) => name === 'tx02').length, 1);
  assert.equal(f.calls.some(([name]) => name === 'terminal'), false);
});
test('Matrix A preserves managed/project and global canonical layouts before fake adapter write', async () => {
  const f = fixture();
  const alphaId = 'pidex-global:pidex-implementer:alpha';
  const alpha = Buffer.from('<!-- pidex-rule-receipt-v1 {"rule_id":"pidex-global:pidex-implementer:alpha"} -->\nExisting alpha rule.\n', 'utf8');
  const oldIndex = Buffer.from(`# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| \`${alphaId}\` | [alpha](alpha.md) | active |\n`, 'utf8');
  f.git.readCanonicalMembers = () => [
    { path: 'rules/pidex-implementer/alpha.md', bytes: alpha },
    { path: 'rules/pidex-implementer/index.md', bytes: oldIndex },
    { path: 'config/rule-baseline-manifest.json', bytes: Buffer.from('{"schema":"pidex-bundled-rule-seed-v1","baseline_parent_commit":"' + head + '","members":[],"aggregate_digest":"' + '0'.repeat(64) + '"}', 'utf8') },
  ];
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(result.status, 'receipt_pending');
  assert.equal(f.writes.get('rules/pidex-implementer/index.md').toString(), `# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| \`${alphaId}\` | [alpha](alpha.md) | active |\n| \`${f.facts.candidate.rule_id}\` | [focused-tests](focused-tests.md) | active |\n`);
  const manifest = JSON.parse(f.writes.get('config/rule-baseline-manifest.json'));
  assert.equal(f.writes.get('rules/pidex-implementer/focused-tests.md').toString(), `<!-- pidex-rule-receipt-v1 {"rule_id":"${f.facts.candidate.rule_id}","admission_digest":"${f.facts.admission_digest}","transaction_digest":"${f.facts.idempotency_key.slice(3)}","lifecycle_state":"active"} -->\nRun focused tests before broad checks.\n`);
  assert.deepEqual(Object.keys(manifest), ['schema', 'source_kind', 'baseline_parent_commit', 'agent_count', 'rule_count', 'agents', 'rules', 'aggregate_digest']);
  assert.equal(manifest.aggregate_digest, hex(canonical({ agent_count: manifest.agent_count, agents: manifest.agents, baseline_parent_commit: head, rule_count: manifest.rule_count, rules: manifest.rules, schema: manifest.schema, source_kind: manifest.source_kind })));
});
test('Matrix A rejects commit identity and metadata substitutions before push', async () => {
  const substitutions = [
    ['same_as_parent', (f) => { f.git.commit = () => ({ commit: head, parent: head, tree_digest: hex('tree') }); f.git.inspectCommit = () => ({ commit: head, parents: [head], tree_digest: hex('tree'), author: f.facts.target.writer_authority.author, subject: `rules(global): publish ${f.facts.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': f.facts.target.rule_id, 'PIDEX-Transaction-Digest': f.facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': f.facts.admission_digest, 'PIDEX-Predecessor': `commit:${head}` }, staged_member_digests: Object.fromEntries([...f.writes].map(([path, bytes]) => [path, hex(bytes)])) }); }],
    ['wrong_parent', (f) => { f.git.commit = () => ({ commit, parent: 'e'.repeat(40), tree_digest: hex('tree') }); }],
    ['wrong_tree', (f) => { const inspect = f.git.inspectCommit; f.git.inspectCommit = (...args) => ({ ...inspect(...args), tree_digest: hex('other-tree') }); }],
    ['wrong_author', (f) => { const inspect = f.git.inspectCommit; f.git.inspectCommit = (...args) => ({ ...inspect(...args), author: 'Other <other@example.invalid>' }); }],
    ['wrong_subject', (f) => { const inspect = f.git.inspectCommit; f.git.inspectCommit = (...args) => ({ ...inspect(...args), subject: 'rules(global): publish other' }); }],
    ['missing_trailer', (f) => { const inspect = f.git.inspectCommit; f.git.inspectCommit = (...args) => { const value = inspect(...args); delete value.trailers['PIDEX-Predecessor']; return value; }; }],
    ['extra_or_folded_trailer', (f) => { const inspect = f.git.inspectCommit; f.git.inspectCommit = (...args) => ({ ...inspect(...args), trailers: { ...inspect(...args).trailers, Extra: 'folded\n value' } }); }],
    ['member_digest_mismatch', (f) => { const inspect = f.git.inspectCommit; f.git.inspectCommit = (...args) => ({ ...inspect(...args), staged_member_digests: { 'rules/pidex-implementer/focused-tests.md': '0'.repeat(64) } }); }],
  ];
  for (const [name, substitute] of substitutions) {
    const f = fixture(); substitute(f);
    const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.equal(result.status, 'unavailable', name);
    assert.equal(f.calls.some(([call]) => call === 'pushFastForward'), false, name);
  }
});
test('Matrix A rejects remote, workspace, staged, path, and identity drift without a fake push', async () => {
  const failures = [
    ['expected_remote', (f) => { f.git.fetchExpected = () => ({ head, remote_digest: '0'.repeat(64), branch: 'refs/heads/main', repository: f.facts.target.repository }); }],
    ['expected_repository', (f) => { f.git.fetchExpected = () => ({ head, remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: 'refs/heads/main', repository: 'other-repository' }); }],
    ['expected_branch', (f) => { f.git.fetchExpected = () => ({ head, remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: 'refs/heads/other', repository: f.facts.target.repository }); }],
    ['workspace_remote', (f) => { f.git.remoteUrl = () => ({ remote_digest: '0'.repeat(64), repository: f.facts.target.repository, branch: f.facts.target.writer_authority.branch }); }],
    ['workspace_repository', (f) => { f.git.remoteUrl = () => ({ remote_digest: f.facts.target.writer_authority.normalized_remote_digest, repository: 'other-repository', branch: f.facts.target.writer_authority.branch }); }],
    ['workspace_branch', (f) => { f.git.remoteUrl = () => ({ remote_digest: f.facts.target.writer_authority.normalized_remote_digest, repository: f.facts.target.repository, branch: 'refs/heads/other' }); }],
    ['remote_url', (f) => { f.git.remoteUrl = () => '0'.repeat(64); }],
    ['observed_repository', (f) => { const fetch = f.git.fetchObserved; f.git.fetchObserved = (...args) => ({ ...fetch(...args), repository: 'other-repository' }); }],
    ['observed_branch', (f) => { const fetch = f.git.fetchObserved; f.git.fetchObserved = (...args) => ({ ...fetch(...args), branch: 'refs/heads/other' }); }],
    ['observed_remote', (f) => { const fetch = f.git.fetchObserved; f.git.fetchObserved = (...args) => ({ ...fetch(...args), remote_digest: '0'.repeat(64) }); }],
    ['dirty_workspace', (f) => { f.git.createIsolatedWorkspace = () => ({ id: 'synthetic-workspace', clean: false }); }],
    ['staged_extra', (f) => { const staged = f.git.stagedEntries; f.git.stagedEntries = (...args) => [...staged(...args), { path: 'rules/pidex-implementer/extra.md', digest: '0'.repeat(64) }]; }],
    ['staged_duplicate', (f) => { const staged = f.git.stagedEntries; f.git.stagedEntries = (...args) => { const entries = staged(...args); return [...entries, entries[0]]; }; }],
    ['staged_digest', (f) => { const staged = f.git.stagedEntries; f.git.stagedEntries = (...args) => staged(...args).map((entry, index) => index ? entry : { ...entry, digest: '0'.repeat(64) }); }],
  ];
  for (const [name, substitute] of failures) {
    const f = fixture(); substitute(f);
    const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.equal(result.status, 'unavailable', name);
    assert.equal(f.calls.some(([call]) => call === 'pushFastForward'), false, name);
  }
  for (const [name, mutate] of [['links', (v) => ({ ...v, links: true })], ['hardlinks', (v) => ({ ...v, hardlinks: true })], ['reparse_or_junction', (v) => ({ ...v, reparse: true })], ['no_follow', (v) => ({ ...v, no_follow: false })], ['case_safe', (v) => ({ ...v, case_safe: false })], ['unicode_safe', (v) => ({ ...v, unicode_safe: false })], ['supported', (v) => ({ ...v, supported: false })], ['root', (v) => ({ ...v, root_identity_digest: '0'.repeat(64) })], ['parent', (v) => ({ ...v, parent_identity_digest: '0'.repeat(64) })], ['files', (v) => ({ ...v, files_digest: '0'.repeat(64) })]]) {
    for (let checkpoint = 2; checkpoint <= 9; checkpoint += 1) {
      const f = fixture(); const snapshot = f.git.identitySnapshot; let count = 0; f.git.identitySnapshot = (...args) => (++count === checkpoint ? mutate(snapshot(...args)) : snapshot(...args));
      const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
      assert.deepEqual(result, { status: 'unavailable', transaction: f.facts.idempotency_key, reason: 'writer_invariant_failed' }, `${name} checkpoint ${checkpoint}`);
      assert.equal(f.calls.some(([call]) => call === 'pushFastForward'), false, `${name} checkpoint ${checkpoint}`);
    }
  }
});
test('Matrix A writes only managed project members and leaves legacy adapter sentinel untouched', async () => {
  const f = fixture(); const legacy = 'pidex/rules/pidex-implementer.md';
  Object.assign(f.facts.target, { tier: 'project', scope_id: 'project-scope', allowed_paths: ['pidex/rules/managed/pidex-implementer/focused-tests.md', 'pidex/rules/managed/pidex-implementer/index.md'] });
  Object.assign(f.facts.candidate, { tier: 'project', rule_id: 'project:project-scope:pidex-implementer:focused-tests' });
  f.facts.target.rule_id = f.facts.candidate.rule_id;
  f.git.readCanonicalMembers = () => [{ path: 'pidex/rules/managed/pidex-implementer/index.md', bytes: Buffer.from('# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| `project:project-scope:pidex-implementer:alpha` | [alpha](alpha.md) | active |\n', 'utf8') }];
  f.git.inspectCommit = () => ({ commit, parents: [head], tree_digest: hex('tree'), author: f.facts.target.writer_authority.author, subject: `rules(project): publish ${f.facts.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': f.facts.target.rule_id, 'PIDEX-Transaction-Digest': f.facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': f.facts.admission_digest, 'PIDEX-Predecessor': `commit:${head}` }, staged_member_digests: Object.fromEntries([...f.writes].map(([path, bytes]) => [path, hex(bytes)])) });
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(result.status, 'receipt_pending');
  assert.deepEqual([...f.writes.keys()].sort(), f.facts.target.allowed_paths.slice().sort());
  assert.equal(f.writes.has(legacy), false);
  assert.equal(f.calls.some(([call, value]) => call === 'writeFileNoFollow' && value.path === legacy), false);
  assert.equal(f.writes.get('pidex/rules/managed/pidex-implementer/index.md').toString(), '# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| `project:project-scope:pidex-implementer:alpha` | [alpha](alpha.md) | active |\n| `project:project-scope:pidex-implementer:focused-tests` | [focused-tests](focused-tests.md) | active |\n');
});
test('Matrix A rejects traversal, reserved, long, case, and Unicode aliases before any write', async () => {
  for (const slug of ['../escape', 'con', 'a'.repeat(256), 'Focused-tests', 'fócussed-tests']) {
    const f = fixture(); f.facts.candidate.slug = slug; f.facts.target.allowed_paths = ['config/rule-baseline-manifest.json', `rules/pidex-implementer/${slug}.md`, 'rules/pidex-implementer/index.md'];
    const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.equal(result.status, 'unavailable', slug);
    assert.equal(f.writes.size, 0, slug);
  }
});
test('Matrix A detects files identity drift at every revalidation checkpoint', async () => {
  for (let checkpoint = 2; checkpoint <= 9; checkpoint += 1) {
    const f = fixture(); const snapshot = f.git.identitySnapshot; let count = 0;
    f.git.identitySnapshot = (...args) => (++count === checkpoint ? { ...snapshot(...args), files_digest: '0'.repeat(64) } : snapshot(...args));
    const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.deepEqual(result, { status: 'unavailable', transaction: f.facts.idempotency_key, reason: 'writer_invariant_failed' }, `checkpoint ${checkpoint}`);
    assert.equal(f.calls.some(([call]) => call === 'pushFastForward'), false, `checkpoint ${checkpoint}`);
  }
});
test('Matrix A requires remoteUrl to bind remote digest, repository, and branch', async () => {
  const f = fixture();
  f.git.remoteUrl = () => ({ remote_digest: f.facts.target.writer_authority.normalized_remote_digest, repository: f.facts.target.repository, branch: f.facts.target.writer_authority.branch });
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(result.status, 'receipt_pending');
});
test('F177 canonical global writer preserves table index grammar and emits Plan045 manifest bytes', async () => {
  const f = fixture();
  const index = Buffer.from('# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| `pidex-global:pidex-implementer:alpha` | [alpha](alpha.md) | active |\n', 'utf8');
  const alpha = Buffer.from('alpha\n', 'utf8');
  f.git.readCanonicalMembers = () => [
    { path: 'rules/pidex-implementer/alpha.md', bytes: alpha },
    { path: 'rules/pidex-implementer/index.md', bytes: index },
    { path: 'config/rule-baseline-manifest.json', bytes: Buffer.from('{}', 'utf8') },
  ];
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(result.status, 'receipt_pending');
  assert.equal(f.writes.get('rules/pidex-implementer/index.md').toString(), '# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| `pidex-global:pidex-implementer:alpha` | [alpha](alpha.md) | active |\n| `pidex-global:pidex-implementer:focused-tests` | [focused-tests](focused-tests.md) | active |\n');
  const manifestBytes = f.writes.get('config/rule-baseline-manifest.json');
  assert.equal(manifestBytes.at(-1), 0x0a);
  const manifest = JSON.parse(manifestBytes);
  assert.deepEqual(Object.keys(manifest), ['schema', 'source_kind', 'baseline_parent_commit', 'agent_count', 'rule_count', 'agents', 'rules', 'aggregate_digest']);
  assert.equal(manifest.source_kind, 'packaged_baseline');
  assert.equal(manifest.rule_count, 3);
  assert.equal(manifest.agents.length, 0);
});
test('writer source and test harness contain no host Git process boundary', () => {
  const source = readFileSync(new URL('./rule-git-writer.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bprocess\b|node:child_process|\bexeca\b|\bspawn(?:Sync)?\s*\(|\bexec(?:File|Sync)?\s*\(|\bgit\s+(?:commit|push|fetch|status|diff)\b/);
});
test('writer defers without an injected complete fake Git adapter', async () => {
  const f = fixture(); const result = await publishRuleWithInjectedGit({ store: f.store, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'unavailable', transaction: f.facts.idempotency_key, reason: 'git_adapter_unavailable' });
  assert.equal(f.calls.length, 0);
});
test('Matrix B RC02 records receipt-pending exact safe facts without terminal or push', async () => {
  const f = fixture({ observed: '9'.repeat(40) });
  f.git.containsCommit = () => true;
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'receipt_pending', transaction: f.facts.idempotency_key, prepared_commit: commit, observed_head: '9'.repeat(40), recovery_code: 'RC-02' });
  assert.equal(f.calls.some(([name]) => name === 'pushFastForward'), false);
  assert.equal(f.calls.some(([name]) => name === 'terminal'), false);
  assert.doesNotMatch(JSON.stringify(result), /focused-tests|repo-safe-id|example\.invalid/);
});
test('Matrix B remote advance terminalizes TX04 once; push success stays receipt-pending', async () => {
  const deferred = fixture({ observed: '9'.repeat(40) });
  const first = await publishRuleWithInjectedGit({ store: deferred.store, git: deferred.git, lock: deferred.lock, idempotency_key: deferred.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(first.status, 'deferred_remote_advanced');
  assert.equal(deferred.calls.filter(([name]) => name === 'terminal').length, 1);
  const pushed = fixture();
  const result = await publishRuleWithInjectedGit({ store: pushed.store, git: pushed.git, lock: pushed.lock, idempotency_key: pushed.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'receipt_pending', transaction: pushed.facts.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'RC-03' });
  assert.equal(pushed.calls.some(([name]) => name === 'terminal'), false);
});
test('Matrix B rejects malformed leases and releases exact acquired lease once after every fake adapter fault', async () => {
  const invalid = fixture(); invalid.lock.acquire = () => 'foreign-owner';
  const noLease = await publishRuleWithInjectedGit({ store: invalid.store, git: invalid.git, lock: invalid.lock, idempotency_key: invalid.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(noLease.status, 'unavailable');
  const boundaries = ['createIsolatedWorkspace', 'writeFileNoFollow', 'stage', 'commit', 'fetchObserved', 'pushFastForward'];
  for (const boundary of boundaries) {
    const f = fixture(); const lease = { lease_id: `lease-${boundary}`, repository: f.facts.target.repository, scope_id: f.facts.target.scope_id }; let released = 0;
    f.lock.acquire = () => lease; f.lock.release = (value) => { assert.equal(value, lease); released += 1; };
    f.git[boundary] = () => { throw new Error(`fault:${boundary}`); };
    const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.equal(result.status, boundary === 'pushFastForward' ? 'receipt_pending' : 'unavailable', boundary);
    assert.equal(released, 1, boundary);
    assert.equal(f.calls.filter(([name]) => name === 'cleanup').length, boundary === 'createIsolatedWorkspace' ? 0 : 1, boundary);
  }
});
test('Matrix B multi-host same-base race uses only fake ordinary FF and exact commit containment', async () => {
  const winner = fixture(); const loser = fixture({ observed: commit });
  loser.git.containsCommit = () => true;
  const won = await publishRuleWithInjectedGit({ store: winner.store, git: winner.git, lock: winner.lock, idempotency_key: winner.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  const recovered = await publishRuleWithInjectedGit({ store: loser.store, git: loser.git, lock: loser.lock, idempotency_key: loser.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(won.status, 'receipt_pending');
  assert.deepEqual(recovered, { status: 'receipt_pending', transaction: loser.facts.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'RC-02' });
  assert.equal([...winner.calls, ...loser.calls].some(([name]) => /force|rebase|merge|amend/.test(name)), false);
});
test('Matrix B never creates a nondeterministic second local commit for existing TX02', async () => {
  const f = fixture(); f.facts.state = 'committed_local'; let commitCalls = 0;
  f.git.commit = () => { commitCalls += 1; return { commit: 'c'.repeat(40), parent: head, tree_digest: hex('tree') }; };
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(result.status, 'unavailable');
  assert.equal(commitCalls, 0);
});
test('F178 committed-local recovery pushes only durable exact local commit when remote remains at expected base', async () => {
  const f = fixture();
  Object.assign(f.facts, { state: 'committed_local', local_commit: commit, local_parent: head, local_tree_digest: hex('tree'), staged_member_digests: Object.fromEntries(f.facts.target.allowed_paths.map((path, index) => [path, hex(String(index + 1))])) });
  f.git.inspectCommit = () => { f.facts.staged_member_digests = Object.fromEntries([...f.writes].map(([path, bytes]) => [path, hex(bytes)])); return { commit, parents: [head], tree_digest: hex('tree'), author: f.facts.target.writer_authority.author, subject: `rules(global): publish ${f.facts.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': f.facts.target.rule_id, 'PIDEX-Transaction-Digest': f.facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': f.facts.admission_digest, 'PIDEX-Predecessor': `commit:${head}` }, staged_member_digests: f.facts.staged_member_digests }; };
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'receipt_pending', transaction: f.facts.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'RC-03' });
  assert.equal(f.calls.filter(([name]) => name === 'commit').length, 1);
  assert.equal(f.calls.find(([name]) => name === 'commit')[1].parent, head);
  assert.equal(f.calls.filter(([name]) => name === 'pushFastForward').length, 1);
  assert.equal(f.calls.filter(([name]) => name === 'terminal').length, 0);
});
test('F178 binds enrolled immutable publication timestamp as both commit timestamps', async () => {
  const f = fixture();
  f.facts.target.writer_authority = { ...f.facts.target.writer_authority, publication_timestamp: '2026-08-14T03:00:00.000Z' };
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2099-01-01T00:00:00.000Z' });
  assert.equal(result.status, 'receipt_pending');
  assert.deepEqual(f.calls.find(([name]) => name === 'commit')[1].metadata, { author: 'PIDEX <pidex@example.invalid>', author_timestamp: '2026-08-14T03:00:00.000Z', committer_timestamp: '2026-08-14T03:00:00.000Z', subject: `rules(global): publish ${f.facts.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': f.facts.target.rule_id, 'PIDEX-Transaction-Digest': f.facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': f.facts.admission_digest, 'PIDEX-Predecessor': `commit:${head}` } });
});
function barrierLock() {
  const queues = new Map(); const active = new Set(); let maxActive = 0; const released = [];
  const drain = (key) => {
    const queue = queues.get(key); if (!queue?.length || active.has(key)) return;
    active.add(key); maxActive = Math.max(maxActive, active.size); queue.shift()({ key, opaque: true });
  };
  return {
    acquire: ({ repository, scope_id }) => new Promise((resolve) => { const key = `${repository}\u0000${scope_id}`; const queue = queues.get(key) || []; queue.push((lease) => resolve(Object.freeze(lease))); queues.set(key, queue); drain(key); }),
    release: (lease) => { assert.equal(lease?.opaque, true); assert.equal(active.delete(lease.key), true); released.push(lease); drain(lease.key); },
    get maxActive() { return maxActive; },
    released,
  };
}

function assertSafeFailure(result, f) {
  assert.equal(result.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(result), /private-body-sentinel|rules\/pidex-implementer\/focused-tests\.md|repo-safe-id|pidex@example\.invalid/);
  assert.equal(f.calls.filter(([name]) => name === 'cleanup').length, 1);
}

test('Matrix B serializes same repository/scope opaque leases while distinct keys overlap', async () => {
  const sameLock = barrierLock(); const first = fixture(); const second = fixture(); first.lock = sameLock; second.lock = sameLock;
  const [one, two] = await Promise.all([
    publishRuleWithInjectedGit({ store: first.store, git: first.git, lock: first.lock, idempotency_key: first.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }),
    publishRuleWithInjectedGit({ store: second.store, git: second.git, lock: second.lock, idempotency_key: second.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }),
  ]);
  assert.equal(sameLock.maxActive, 1);
  assert.equal(sameLock.released.length, 2);
  assert.notEqual(sameLock.released[0], sameLock.released[1]);
  assert.deepEqual([one.status, two.status], ['receipt_pending', 'receipt_pending']);

  const separateLock = barrierLock(); const left = fixture(); const right = fixture(); left.lock = separateLock; right.lock = separateLock;
  right.facts.target.repository = 'other-safe-id'; right.facts.target.scope_id = 'other-scope';
  const [leftResult, rightResult] = await Promise.all([
    publishRuleWithInjectedGit({ store: left.store, git: left.git, lock: left.lock, idempotency_key: left.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }),
    publishRuleWithInjectedGit({ store: right.store, git: right.git, lock: right.lock, idempotency_key: right.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }),
  ]);
  assert.ok(separateLock.maxActive >= 2);
  assert.equal(separateLock.released.length, 2);
  assert.deepEqual([leftResult.status, rightResult.status], ['receipt_pending', 'receipt_pending']);
});
test('Matrix B named crash boundaries preserve durable TX facts, exact cleanup/release, and sanitized failures', async () => {
  const boundaries = [
    ['before first write/materialization', (f) => { const snapshot = f.git.identitySnapshot; let count = 0; f.git.identitySnapshot = (...args) => (++count === 2 ? (() => { throw new Error('fault:before-materialization'); })() : snapshot(...args)); }, 'prepared'],
    ['after all writes before stage', (f) => { f.git.stage = () => { throw new Error('fault:after-writes'); }; }, 'prepared'],
    ['after stage before commit', (f) => { f.git.commit = () => { throw new Error('fault:after-stage'); }; }, 'prepared'],
    ['after commit before TX02', (f) => { const snapshot = f.git.identitySnapshot; let count = 0; f.git.identitySnapshot = (...args) => (++count === 6 ? (() => { throw new Error('fault:after-commit'); })() : snapshot(...args)); }, 'prepared'],
    ['TX02 store throw', (f) => { f.store.commitLocalPublicationTransaction = () => { throw new Error('fault:tx02'); }; }, 'prepared'],
    ['after TX02 before refetch', (f) => { f.git.fetchObserved = () => { throw new Error('fault:after-tx02'); }; }, 'committed_local'],
    ['after refetch before prepush identity', (f) => { const snapshot = f.git.identitySnapshot; let count = 0; f.git.identitySnapshot = (...args) => (++count === 8 ? (() => { throw new Error('fault:prepush-identity'); })() : snapshot(...args)); }, 'committed_local'],
    ['push throws', (f) => { f.git.pushFastForward = () => { throw new Error('fault:push'); }; }, 'committed_local'],
    ['push succeeds then caller crash before receipt', (f) => { f.git.postPushObserve = () => { throw new Error('fault:caller-crash'); }; }, 'committed_local'],
  ];
  for (const [name, fault, expectedState] of boundaries) {
    const f = fixture(); const lease = Object.freeze({ boundary: name }); let releases = 0; let durable = 'prepared';
    f.facts.candidate.body = 'private-body-sentinel'; f.lock.acquire = () => lease; f.lock.release = (value) => { assert.equal(value, lease, name); releases += 1; };
    const commitLocal = f.store.commitLocalPublicationTransaction; f.store.commitLocalPublicationTransaction = (value) => { durable = 'committed_local'; return commitLocal(value); };
    fault(f);
    const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    if (['push throws', 'push succeeds then caller crash before receipt'].includes(name)) assert.equal(result.status, 'receipt_pending', name); else assertSafeFailure(result, f);
    assert.equal(durable, expectedState, name); assert.equal(releases, 1, name); assert.equal(f.calls.some(([call]) => call === 'terminal'), false, name);
  }
});
test('C2 writer rereads store facts after lock and refuses active local narrowing before workspace creation', async () => {
  const f = fixture(); let reads = 0;
  f.store.readPublicationWriterFacts = () => {
    reads += 1;
    return reads === 1 ? f.facts : { ...f.facts, local_stop_active: true, local_stop_reason_code: 'operator_stop' };
  };
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'unavailable', transaction: f.facts.idempotency_key, reason: 'writer_local_stop' });
  assert.equal(reads, 2);
  assert.equal(f.calls.some(([name]) => name === 'createIsolatedWorkspace'), false);
  f.store.readPublicationWriterFacts = () => ({ ...f.facts, local_stop_active: false, local_stop_reason_code: null });
  assert.equal((await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' })).status, 'receipt_pending');
});
test('C3 inspectCommit accepts only exact one-parent adapter shape', async () => {
  const f = fixture();
  f.git.inspectCommit = () => ({ commit, parents: [head], tree_digest: hex('tree'), author: f.facts.target.writer_authority.author, subject: `rules(global): publish ${f.facts.target.rule_id}`, trailers: { 'PIDEX-Rule-ID': f.facts.target.rule_id, 'PIDEX-Transaction-Digest': f.facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': f.facts.admission_digest, 'PIDEX-Predecessor': `commit:${head}` }, staged_member_digests: Object.fromEntries([...f.writes].map(([path, bytes]) => [path, hex(bytes)])) });
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(result.status, 'receipt_pending');
});
test('C4 rejects workspace creation that supplies canonical members before identity baseline', async () => {
  const f = fixture(); f.git.createIsolatedWorkspace = () => ({ id: 'synthetic-workspace', clean: true, members: [] });
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'unavailable', transaction: f.facts.idempotency_key, reason: 'writer_invariant_failed' });
  assert.equal(f.calls.some(([name]) => name === 'readCanonicalMembers'), false);
});
test('C1 remote advance before local commit appends exactly one TX04 without push or raw sentinels', async () => {
  const f = fixture(); const advanced = '9'.repeat(40);
  f.facts.candidate.body = 'PRIVATE_BODY_SENTINEL';
  f.git.fetchExpected = () => ({ head: advanced, remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: f.facts.target.writer_authority.branch, repository: f.facts.target.repository });
  const one = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(one, { status: 'deferred_remote_advanced', transaction: f.facts.idempotency_key, reason: 'remote_advanced' });
  assert.equal(f.calls.filter(([name]) => name === 'terminal').length, 1);
  assert.equal(f.calls.some(([name]) => name === 'pushFastForward'), false);
  assert.doesNotMatch(JSON.stringify(one), /PRIVATE_BODY_SENTINEL|repo-safe-id|pidex@example\.invalid/);
});
test('C3 cleanup and release private failures never reject, attempt both finalizers, and report safe recovery after TX02', async () => {
  for (const fault of ['cleanup', 'release', 'both']) {
    const f = fixture(); const lease = Object.freeze({ private_lease_sentinel: 'PRIVATE_LEASE_SENTINEL' }); let cleanup = 0; let release = 0;
    f.lock.acquire = () => lease;
    f.git.cleanup = () => { cleanup += 1; if (fault === 'cleanup' || fault === 'both') throw new Error('PRIVATE_CLEANUP_SENTINEL'); };
    f.lock.release = (value) => { assert.equal(value, lease); release += 1; if (fault === 'release' || fault === 'both') throw new Error('PRIVATE_RELEASE_SENTINEL'); };
    const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.deepEqual(result, { status: 'receipt_pending', transaction: f.facts.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'finalization_unavailable' }, fault);
    assert.equal(cleanup, 1, fault); assert.equal(release, 1, fault);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_(?:LEASE|CLEANUP|RELEASE)_SENTINEL/, fault);
  }
});
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function localScopeLock() {
  let active = false; const waiting = [];
  const next = () => { if (!active && waiting.length) { active = true; waiting.shift()({ local: true }); } };
  return {
    acquire() { return new Promise((resolve) => { waiting.push(resolve); next(); }); },
    release(lease) { assert.equal(lease?.local, true); active = false; next(); },
  };
}

class SharedRemote {
  constructor(initialHead) { this.head = initialHead; this.commits = new Map(); this.casPushes = 0; }
  compareAndSwapPush(expected, next) { if (this.head !== expected) return false; this.head = next; this.casPushes += 1; return true; }
}

function sharedAdapter(remote, host, f) {
  const workspaces = new Map();
  const tree = (writes) => hex(canonical([...writes].map(([path, bytes]) => [path, hex(bytes)]).sort(([left], [right]) => left.localeCompare(right))));
  const inspect = ({ commit: requested }) => {
    const stored = remote.commits.get(requested);
    if (!stored) return null;
    return { commit: requested, parents: [stored.parent], tree_digest: stored.tree_digest, author: stored.metadata.author, subject: stored.metadata.subject, trailers: stored.metadata.trailers, staged_member_digests: stored.staged_member_digests };
  };
  const adapter = { ...f.git,
    fetchExpected: () => ({ head: remote.head, remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: f.facts.target.writer_authority.branch, repository: f.facts.target.repository }),
    fetchObserved: () => ({ head: remote.head, remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: f.facts.target.writer_authority.branch, repository: f.facts.target.repository }),
    remoteUrl: () => ({ remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: f.facts.target.writer_authority.branch, repository: f.facts.target.repository }),
    resolveHead: () => f.facts.expected_base,
    postPushObserve: () => ({ head: remote.head, remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: f.facts.target.writer_authority.branch, repository: f.facts.target.repository }),
    createIsolatedWorkspace: () => { const workspace = { id: host, clean: true }; workspaces.set(workspace, new Map()); return workspace; },
    writeFileNoFollow: ({ workspace, path, bytes }) => { workspaces.get(workspace).set(path, Buffer.from(bytes)); },
    stagedEntries: (workspace) => [...workspaces.get(workspace)].map(([path, bytes]) => ({ path, digest: hex(bytes) })).sort((left, right) => left.path.localeCompare(right.path)),
    commit: ({ workspace, parent, metadata }) => { const writes = workspaces.get(workspace); const staged_member_digests = Object.fromEntries([...writes].map(([path, bytes]) => [path, hex(bytes)])); const tree_digest = tree(writes); const value = { parent, tree_digest, author: metadata.author, subject: metadata.subject, trailers: metadata.trailers, author_time: metadata.author_timestamp, committer_time: metadata.committer_timestamp, member_digests: staged_member_digests }; const sha = createHash('sha1').update(canonical(value)).digest('hex'); remote.commits.set(sha, { ...value, metadata, staged_member_digests }); return { commit: sha, parent, tree_digest }; },
    inspectCommit: inspect,
    containsCommit: ({ head, commit: candidate }) => head === candidate && remote.commits.has(candidate),
    pushFastForward: ({ expected_base, commit: candidate }) => { if (!remote.compareAndSwapPush(expected_base, candidate)) throw new Error('CAS_REJECTED'); },
  };
  return { adapter, workspaces };
}

test('C1 shared CAS remote makes deterministic same-base writers converge RC03 plus RC02 and distinct advance TX04', async () => {
  const first = fixture(); const second = fixture(); const remote = new SharedRemote(head); const lock = localScopeLock();
  const sharedStore = { readPublicationWriterFacts: () => { sharedStore.reads.push(first.facts.state); return first.facts; }, commitLocalPublicationTransaction: (value) => { Object.assign(first.facts, { state: 'committed_local', local_commit: value.commit, local_parent: value.parent, local_tree_digest: value.tree_digest, staged_member_digests: value.staged_member_digests }); return { state: 'committed_local' }; }, appendPublicationTerminal: (value) => { sharedStore.terminals.push(value); return value; }, terminals: [], reads: [] };
  first.store = sharedStore; second.store = sharedStore; first.lock = lock; second.lock = lock;
  const one = sharedAdapter(remote, 'host-one', first); const two = sharedAdapter(remote, 'host-two', second);
  const [left, right] = await Promise.all([publishRuleWithInjectedGit({ store: sharedStore, git: one.adapter, lock, idempotency_key: first.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }), publishRuleWithInjectedGit({ store: sharedStore, git: two.adapter, lock, idempotency_key: first.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' })]);
  assert.deepEqual([left.recovery_code, right.recovery_code].sort(), ['RC-02', 'RC-03']);
  assert.equal(remote.casPushes, 1); assert.ok(sharedStore.reads.includes('committed_local')); assert.equal(one.workspaces.size, 1); assert.equal(two.workspaces.size, 0);
  const advanced = fixture(); const advanceRemote = new SharedRemote('9'.repeat(40)); const advanceStore = { readPublicationWriterFacts: () => advanced.facts, commitLocalPublicationTransaction: () => { throw new Error('must not commit'); }, appendPublicationTerminal: (value) => { advanceStore.terminals.push(value); return value; }, terminals: [] };
  const advance = sharedAdapter(advanceRemote, 'host-advance', advanced);
  const deferred = await publishRuleWithInjectedGit({ store: advanceStore, git: advance.adapter, lock: localScopeLock(), idempotency_key: advanced.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(deferred, { status: 'deferred_remote_advanced', transaction: advanced.facts.idempotency_key, reason: 'remote_advanced' });
  assert.equal(advanceRemote.casPushes, 0); assert.equal(advanceStore.terminals.length, 1);
});
test('C4 every writer result/error row and finalizer fault resolves with no body/path/remote/author/credential sentinel', async () => {
  const rows = [
    ['receipt', () => ({})],
    ['adapter unavailable', () => ({ git: undefined })],
    ['authority unavailable', () => ({ store: {} })],
    ['local stop', (f) => { f.facts.local_stop_active = true; f.facts.local_stop_reason_code = 'operator_stop'; return {}; }],
    ['malformed lease', (f) => { f.lock.acquire = () => 'PRIVATE_LEASE_SENTINEL'; return {}; }],
    ['remote advance', (f) => { f.git.fetchExpected = () => ({ head: '9'.repeat(40), remote_digest: f.facts.target.writer_authority.normalized_remote_digest, branch: f.facts.target.writer_authority.branch, repository: f.facts.target.repository }); return {}; }],
    ['push unavailable', (f) => { f.git.pushFastForward = () => { throw new Error('PRIVATE_CREDENTIAL_SENTINEL'); }; return {}; }],
    ['invariant unavailable', (f) => { f.git.identitySnapshot = () => ({ private: 'PRIVATE_PATH_SENTINEL' }); return {}; }],
    ['cleanup fault', (f) => { f.git.cleanup = () => { throw new Error('PRIVATE_CREDENTIAL_SENTINEL'); }; return {}; }],
    ['release fault', (f) => { f.lock.release = () => { throw new Error('PRIVATE_AUTHOR_SENTINEL'); }; return {}; }],
  ];
  for (const [name, arrange] of rows) {
    const f = fixture(); Object.assign(f.facts.candidate, { slug: 'path-sentinel', rule_id: 'pidex-global:pidex-implementer:path-sentinel', body: 'PRIVATE_BODY_SENTINEL PRIVATE_CREDENTIAL_SENTINEL' }); Object.assign(f.facts.target, { repository: 'PRIVATE_REMOTE_SENTINEL', rule_id: f.facts.candidate.rule_id, allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/path-sentinel.md'] }); f.facts.target.writer_authority = { ...f.facts.target.writer_authority, author: 'Private Author <private-author-sentinel@example.invalid>' };
    const options = arrange(f); const settled = await Promise.allSettled([publishRuleWithInjectedGit({ store: options.store || f.store, git: options.git === undefined && Object.hasOwn(options, 'git') ? undefined : f.git, lock: options.lock || f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' })]);
    assert.equal(settled[0].status, 'fulfilled', name);
    assert.doesNotMatch(JSON.stringify(settled[0].value), /PRIVATE_(?:BODY|PATH|REMOTE|AUTHOR|CREDENTIAL|LEASE)_SENTINEL|private-author-sentinel/i, name);
  }
});
async function persistentPublication() {
  const [{ mkdtempSync, rmSync }, os, path, { openRuleLifecycleStore }, { candidateDigest }, transaction] = await Promise.all([import('node:fs'), import('node:os'), import('node:path'), import('./rule-lifecycle-store.mjs'), import('./rule-learning-candidate.mjs'), import('./rule-publication-transaction.mjs')]);
  const stateRoot = mkdtempSync(path.join(os.default.tmpdir(), 'pidex-writer-reopen-')); const expected_base = head;
  const body = '# quality\n\n## Instruction\nValidate quality checks.\n\n## Trigger\nBefore publication.\n\n## Expected evidence\nFocused checks pass.\n\n## Failure behavior\nDefer publication.\n\n## Rationale\nRepeated safe support.\n';
  const candidate = { schema_version: 'pidex-managed-rule-v1', rule_id: 'pidex-global:pidex-implementer:quality', tier: 'global', agent: 'pidex-implementer', slug: 'quality', applicability: ['implementation'], body, predecessor_commit: `commit:${expected_base}`, support_digest: 'b'.repeat(64), admission_policy_id: 'pidex-living-rule-admission', admission_policy_version: 'v1', admission_policy_digest: 'c'.repeat(64), generator_principal: 'generator:one', generator_attempt_id: 'attempt:one', scope_digest: 'd'.repeat(64), descriptor_digests: ['f'.repeat(64)], authority_digest: 'e'.repeat(64), content_hash: hex(body) };
  candidate.candidate_digest = candidateDigest(candidate); const candidate_bytes = Buffer.from(JSON.stringify(candidate));
  const admission = { schema_version: 'pidex-living-rule-admission-v1', candidate_digest: candidate.candidate_digest, candidate_content_hash: candidate.content_hash, admission_policy_digest: candidate.admission_policy_digest, admission_policy_version: candidate.admission_policy_version, tier: candidate.tier, repository_scope_digest: candidate.scope_digest, vote_digests: ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64)] }; const admission_bytes = Buffer.from(JSON.stringify(admission));
  const writer_authority = { normalized_remote_digest: 'a'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: 'b'.repeat(64), identity_platform: 'posix', root_identity_digest: 'c'.repeat(64), parent_identity_digest: 'd'.repeat(64), files_identity_digest: 'e'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  const target = { repository: 'repo:writer-reopen', tier: 'global', scope_id: 'pidex-global', scope_digest: candidate.scope_digest, rule_id: candidate.rule_id, predecessor: candidate.predecessor_commit, allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md'], enrollment_digest: '9'.repeat(64), writer_authority };
  const input = { candidate, candidate_bytes, admission_bytes, target, expected_base, idempotency_key: transaction.derivePublicationIdempotencyKey({ candidate_digest: candidate.candidate_digest, admission_digest: hex(admission_bytes), target, expected_base }) };
  let store = openRuleLifecycleStore({ stateRoot }); store.enroll({ repository: target.repository, scope_id: null, remote: 'https://example.invalid/pidex', branch: writer_authority.branch }); store.enrollPublicationTarget(target); transaction.preparePublicationTransaction({ store, ...input, now: '2026-08-14T00:00:00.000Z' });
  return { input, stateRoot, get store() { return store; }, reopen() { store.close(); store = openRuleLifecycleStore({ stateRoot }); return store; }, close() { try { store.close(); } catch {} rmSync(stateRoot, { recursive: true, force: true }); } };
}

function writerFixture(input) {
  const f = fixture(); f.facts = { ...f.facts, idempotency_key: input.idempotency_key, expected_base: input.expected_base, target: input.target, candidate: input.candidate, admission_digest: hex(input.admission_bytes), state: 'prepared' }; return f;
}

test('C2 reopened SQLite TX02, post-push ambiguity, and pre-TX02 orphan recover truthfully', async () => {
  for (const [name, fault, expected] of [
    ['after durable TX02', (adapter, store) => ({ ...store, commitLocalPublicationTransaction(value) { const saved = store.commitLocalPublicationTransaction(value); throw new Error('fault-after-real-tx02'); } }), 'RC-03'],
    ['after push before receipt', (adapter, store) => { adapter.postPushObserve = () => { throw new Error('fault-after-push'); }; return store; }, 'RC-02'],
    ['pre-TX02 orphan', (adapter) => { const commitOnce = adapter.commit; adapter.commit = (value) => { commitOnce(value); throw new Error('fault-before-tx02'); }; return null; }, 'RC-03'],
  ]) {
    const persistent = await persistentPublication(); const remote = new SharedRemote(head); const first = writerFixture(persistent.input); const initial = sharedAdapter(remote, `${name}-first`, first); const configured = fault(initial.adapter, persistent.store) || persistent.store;
    const firstResult = await publishRuleWithInjectedGit({ store: configured, git: initial.adapter, lock: localScopeLock(), idempotency_key: persistent.input.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.equal(firstResult.status, name === 'after push before receipt' ? 'receipt_pending' : 'unavailable', name); const reopened = persistent.reopen();
    assert.doesNotMatch(JSON.stringify(reopened.readPublicationTransaction({ idempotency_key: persistent.input.idempotency_key })), /PRIVATE_BODY_SENTINEL|repo:writer-reopen|rules\/pidex/i, name);
    const retry = writerFixture(persistent.input); const adapter = sharedAdapter(remote, `${name}-retry`, retry); let retryTx02 = 0; const retryStore = name === 'pre-TX02 orphan' ? { readPublicationWriterFacts: reopened.readPublicationWriterFacts.bind(reopened), appendPublicationTerminal: reopened.appendPublicationTerminal.bind(reopened), commitLocalPublicationTransaction(value) { retryTx02 += 1; return reopened.commitLocalPublicationTransaction(value); } } : reopened; const orphanCommit = remote.commits.keys().next().value;
    if (name === 'pre-TX02 orphan') assert.equal(retryStore.readPublicationWriterFacts({ idempotency_key: persistent.input.idempotency_key }).state, 'prepared', name);
    const result = await publishRuleWithInjectedGit({ store: retryStore, git: adapter.adapter, lock: localScopeLock(), idempotency_key: persistent.input.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
    assert.equal(result.recovery_code, expected, name); assert.equal(remote.casPushes, 1, name);
    if (name === 'pre-TX02 orphan') { assert.equal(result.prepared_commit, orphanCommit, name); assert.equal(remote.commits.size, 1, name); assert.equal(retryTx02, 1, name); }
    persistent.close();
  }
});
test('F179 canonical writer bytes pass Plan045 verifier and preserve checked-in global index grammar', async () => {
  const f = fixture(); const originalIndex = readFileSync(new URL('../../rules/pidex-implementer/index.md', import.meta.url));
  f.git.readCanonicalMembers = () => [
    { path: 'rules/pidex-implementer/index.md', bytes: originalIndex },
    { path: 'config/rule-baseline-manifest.json', bytes: Buffer.from('{}') },
  ];
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.equal(result.status, 'receipt_pending');
  const rewritten = f.writes.get('rules/pidex-implementer/index.md');
  assert.ok(rewritten, 'actual checked-in index materializes');
  const beforeRows = originalIndex.toString().split('\n').filter((line) => line.startsWith('| '));
  const afterRows = rewritten.toString().split('\n').filter((line) => line.startsWith('| '));
  assert.deepEqual(afterRows.filter((line) => !line.includes('focused-tests')), beforeRows, 'unrelated table rows byte-preserved');
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-writer-manifest-'));
  try {
    for (const [memberPath, bytes] of f.writes) { mkdirSync(path.dirname(path.join(root, memberPath)), { recursive: true }); writeFileSync(path.join(root, memberPath), bytes); }
    assert.doesNotThrow(() => verifyBundledBaseline({ root, acceptedHead: { accepted_commit: commit, first_parent_commit: head } }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('F179 independent host locks use shared CAS remote: identical loses RC02, distinct loses TX04', async () => {
  const sameA = fixture(); const sameB = fixture(); const sameRemote = new SharedRemote(head);
  const sameLeft = sharedAdapter(sameRemote, 'host-a', sameA); const sameRight = sharedAdapter(sameRemote, 'host-b', sameB);
  const same = await Promise.all([publishRuleWithInjectedGit({ store: sameA.store, git: sameLeft.adapter, lock: localScopeLock(), idempotency_key: sameA.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }), publishRuleWithInjectedGit({ store: sameB.store, git: sameRight.adapter, lock: localScopeLock(), idempotency_key: sameB.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' })]);
  assert.deepEqual(same.map((value) => value.recovery_code).sort(), ['RC-02', 'RC-03']); assert.equal(sameRemote.casPushes, 1);
  const left = fixture(); const right = fixture(); right.facts.candidate.body = 'Distinct canonical body.'; const remote = new SharedRemote(head); const one = sharedAdapter(remote, 'host-c', left); const two = sharedAdapter(remote, 'host-d', right);
  const distinct = await Promise.all([publishRuleWithInjectedGit({ store: left.store, git: one.adapter, lock: localScopeLock(), idempotency_key: left.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }), publishRuleWithInjectedGit({ store: right.store, git: two.adapter, lock: localScopeLock(), idempotency_key: right.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' })]);
  assert.deepEqual(distinct.map((value) => value.status).sort(), ['deferred_remote_advanced', 'receipt_pending']); assert.equal(remote.casPushes, 1); assert.equal([...left.calls, ...right.calls].filter(([name]) => name === 'terminal').length, 1);
});
test('F179 post-push ambiguity remains receipt-pending and malformed caller identity never escapes', async () => {
  const f = fixture(); f.git.postPushObserve = () => ({ head: commit, remote_digest: '0'.repeat(64), branch: f.facts.target.writer_authority.branch, repository: f.facts.target.repository });
  const result = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' });
  assert.deepEqual(result, { status: 'receipt_pending', transaction: f.facts.idempotency_key, prepared_commit: commit, observed_head: commit, recovery_code: 'postpush_verification_pending' }); assert.equal(f.calls.filter(([name]) => name === 'pushFastForward').length, 1);
  for (const options of [{}, { git: fixture().git, store: {} }]) {
    const safe = await publishRuleWithInjectedGit({ ...options, idempotency_key: 'PRIVATE_IDEMPOTENCY_SENTINEL' });
    assert.doesNotMatch(JSON.stringify(safe), /PRIVATE_IDEMPOTENCY_SENTINEL/); assert.equal(Object.hasOwn(safe, 'transaction'), false);
  }
});
test('F179 Windows synthetic identity matrix fails pre-effect and preserves durable ambiguity post-effect', async () => {
  for (const [name, mutate, status] of [
    ['supported', (f) => { f.facts.target.writer_authority = { ...f.facts.target.writer_authority, identity_platform: 'windows' }; const snapshot = f.git.identitySnapshot; f.git.identitySnapshot = (...args) => ({ ...snapshot(...args), platform: 'windows' }); }, 'receipt_pending'],
    ['unsupported', (f) => { const snapshot = f.git.identitySnapshot; f.git.identitySnapshot = (...args) => ({ ...snapshot(...args), supported: false }); }, 'unavailable'],
    ['junction', (f) => { const snapshot = f.git.identitySnapshot; f.git.identitySnapshot = (...args) => ({ ...snapshot(...args), reparse: true }); }, 'unavailable'],
    ['case unicode', (f) => { const snapshot = f.git.identitySnapshot; f.git.identitySnapshot = (...args) => ({ ...snapshot(...args), case_safe: false, unicode_safe: false }); }, 'unavailable'],
  ]) { const f = fixture(); mutate(f); const value = await publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z' }); assert.equal(value.status, status, name); assert.equal(f.calls.filter(([call]) => call === 'pushFastForward').length, status === 'unavailable' ? 0 : 1, name); }
});
function actionFixture({ tier = 'project', observed = head } = {}) {
  const global = tier === 'global'; const expected_base = head; const scope_id = global ? 'pidex-global' : '112233445566778899001122'; const rule_id = global ? GLOBAL_RULE : ACTION_RULE; const cadence_digest = CAD;
  const writer_authority = { normalized_remote_digest: 'a'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: 'b'.repeat(64), identity_platform: 'posix', root_identity_digest: 'c'.repeat(64), parent_identity_digest: 'd'.repeat(64), files_identity_digest: 'e'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T03:00:00.000Z' };
  const allowed_paths = global ? ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md'] : ['pidex/rules/managed/pidex-implementer/quality.md', 'pidex/rules/managed/pidex-implementer/index.md'];
  const target = { repository: 'repo-safe-id', tier, scope_id, scope_digest: 'd'.repeat(64), rule_id, predecessor: `commit:${expected_base}`, enrollment_digest: 'f'.repeat(64), allowed_paths, writer_authority };
  const action = { schema: 'pidex-rule-lifecycle-action-request-v1', tier, repository_scope_digest: 'd'.repeat(64), rule_id, predecessor_commit: expected_base, version_hash: '6'.repeat(64), content_hash: '7'.repeat(64), activation_epoch: 'epoch:0123456789abcdef01234567', policy_id: 'passive-impact-v1', policy_digest: '8'.repeat(64), closed_window_id: 'window:slice1', result_digest: '9'.repeat(64), lifecycle_transition: 'deactivated', cadence_digest };
  const action_digest = hex(Buffer.from(JSON.stringify(action, Object.keys(action).sort()))); const body = global ? 'Existing global rule body preserved.\n' : 'Existing rule body preserved.\n';
  const deactivatedBytes = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${rule_id}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"deactivated"} -->\n${body}`); const activeRule = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${rule_id}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"active"} -->\n${body}`);
  const indexBytes = global ? Buffer.from('# PIDEX Implementer Rules\n\n| Rule | File | PROC-NEW | Summary |\n|------|------|----------|---------|\n| Quality | [quality](quality.md) | PROC-NEW | Managed rule. |\n') : Buffer.from('# PIDEX Implementer Rules\n\n<!-- managed-index-v1 -->\n\n| Rule ID | File | State |\n|---|---|---|\n| `project:112233445566778899001122:pidex-implementer:quality` | [quality](quality.md) | active |\n');
  const manifestBytes = global ? Buffer.from(`{"schema":"pidex-bundled-rule-seed-v1","baseline_parent_commit":"${head}","rule_count":1,"rules":[{"rule_id":"${rule_id}","path":"rules/pidex-implementer/quality.md","byte_hash":"${hex('manifest-member')}"}],"aggregate_digest":"${hex('manifest-aggregate')}"}\n`) : null;
  const facts = { idempotency_key: `tx:${(global ? '3' : '2').repeat(64)}`, state: 'prepared', expected_base, local_stop_active: false, local_stop_reason_code: null, target, action, action_digest, cadence_digest, content_hash: hex(deactivatedBytes), rule_bytes: deactivatedBytes };
  const calls = []; const writes = new Map();
  const store = { readPublicationWriterFacts: () => facts, commitLocalLifecycleActionTransaction: (value) => { calls.push(['tx02', value]); return { state: 'committed_local' }; }, appendLifecycleActionTerminal: (value) => { calls.push(['terminal', value]); return value; } };
  const canonicalMembers = global ? [{ path: 'rules/pidex-implementer/quality.md', bytes: activeRule }, { path: 'rules/pidex-implementer/index.md', bytes: indexBytes }, { path: 'config/rule-baseline-manifest.json', bytes: manifestBytes }] : [{ path: 'pidex/rules/managed/pidex-implementer/quality.md', bytes: activeRule }, { path: 'pidex/rules/managed/pidex-implementer/index.md', bytes: indexBytes }];
  const git = Object.fromEntries(requiredGitMethods.map((method) => [method, (...args) => {
    calls.push([method, ...args]);
    if (method === 'fetchExpected' || method === 'fetchObserved') return { head: method === 'fetchObserved' ? observed : head, remote_digest: writer_authority.normalized_remote_digest, branch: writer_authority.branch, repository: facts.target.repository };
    if (method === 'postPushObserve') return { head: commit, remote_digest: writer_authority.normalized_remote_digest, branch: writer_authority.branch, repository: facts.target.repository };
    if (method === 'remoteUrl') return { remote_digest: writer_authority.normalized_remote_digest, repository: facts.target.repository, branch: writer_authority.branch };
    if (method === 'resolveHead') return head;
    if (method === 'createIsolatedWorkspace') return { id: 'synthetic-workspace', clean: true };
    if (method === 'readCanonicalMembers') return canonicalMembers;
    if (method === 'identitySnapshot') return { platform: 'posix', root_identity_digest: writer_authority.root_identity_digest, parent_identity_digest: writer_authority.parent_identity_digest, files_digest: 'e'.repeat(64), no_follow: true, links: false, hardlinks: false, reparse: false, case_safe: true, unicode_safe: true, supported: true, identity_proof: 'supported-v1' };
    if (method === 'writeFileNoFollow') { writes.set(args[0].path, Buffer.from(args[0].bytes)); return undefined; }
    if (method === 'stagedEntries') return [...writes].map(([path, bytes]) => ({ path, digest: hex(bytes) })).sort((a, b) => a.path.localeCompare(b.path));
    if (method === 'commit') return { commit, parent: head, tree_digest: hex('tree') };
    if (method === 'containsCommit') return args[0].head === commit;
    if (method === 'inspectCommit') return { commit, parents: [head], tree_digest: hex('tree'), author: writer_authority.author, subject: `rules(${global ? 'global' : 'project'}): publish ${rule_id}`, trailers: { 'PIDEX-Rule-ID': rule_id, 'PIDEX-Transaction-Digest': facts.idempotency_key.slice(3), 'PIDEX-Admission-Digest': action_digest, 'PIDEX-Predecessor': `commit:${head}`, 'PIDEX-Action-Cadence': cadence_digest }, staged_member_digests: Object.fromEntries([...writes].map(([path, bytes]) => [path, hex(bytes)])) };
    return undefined;
  }]));
  const lock = { acquire: () => ({ lease_id: 'writer-lock', repository: facts.target.repository, scope_id: facts.target.scope_id }), release: () => undefined };
  return { store, git, lock, calls, writes, facts, activeRule, indexBytes, manifestBytes };
}

const publishAction = (f, extra = {}) => publishRuleWithInjectedGit({ store: f.store, git: f.git, lock: f.lock, idempotency_key: f.facts.idempotency_key, now: '2026-08-14T03:00:00.000Z', ...extra });
test('Slice1B writer commits lifecycle action with exactly one bounded PIDEX-Action-Cadence trailer and unchanged rule/index allowlist', async () => {
  const f = actionFixture(); const result = await publishAction(f); assert.equal(result.status, 'receipt_pending');
  const rule = f.writes.get('pidex/rules/managed/pidex-implementer/quality.md').toString();
  assert.match(rule, /^<!-- pidex-rule-receipt-v1 \{.*"lifecycle_state":"deactivated"\} -->\nExisting rule body preserved\.\n$/);
  assert.equal(f.writes.get('pidex/rules/managed/pidex-implementer/index.md').toString(), f.indexBytes.toString());
  assert.deepEqual([...f.writes.keys()].sort(), f.facts.target.allowed_paths.slice().sort());
  assert.equal(f.calls.filter(([name]) => name === 'pushFastForward').length, 1); assert.equal(f.calls.some(([name]) => /spawn|exec|git |rebase|merge|amend|force/.test(name)), false); assert.equal(f.calls.find(([name]) => name === 'tx02')[1].parent, head);
});
test('Slice1B writer rejects folded, duplicate, uppercase, wrong, or missing cadence trailers before any push', async () => {
  const cases = [
    ['missing', (trailers) => { const next = { ...trailers }; delete next['PIDEX-Action-Cadence']; return next; }],
    ['folded', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence': 'aaaa\n bbbb' })],
    ['uppercase', (trailers, facts) => ({ ...trailers, 'PIDEX-Action-Cadence': facts.cadence_digest.toUpperCase() })],
    ['wrong_digest', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence': '0'.repeat(64) })],
    ['raw_key_leak', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence': 'window:slice1|project|scope' })],
    ['extra_cadence_alias', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence-2': '5'.repeat(64) })],
  ];
  for (const [name, mutate] of cases) {
    const f = actionFixture(); const inspect = f.git.inspectCommit;
    f.git.inspectCommit = (...args) => ({ ...inspect(...args), trailers: mutate(inspect(...args).trailers, f.facts) });
    const result = await publishAction(f); assert.equal(result.status, 'unavailable', name); assert.equal(f.calls.some(([call]) => call === 'pushFastForward'), false, name);
  }
});
test('Slice1B writer fails closed on lifecycle-action body/content drift and never leaks raw cadence fields', async () => {
  const f = actionFixture(); f.git.readCanonicalMembers = () => [{ path: 'pidex/rules/managed/pidex-implementer/quality.md', bytes: Buffer.from('<!-- pidex-rule-receipt-v1 {"rule_id":"project:112233445566778899001122:pidex-implementer:quality","lifecycle_state":"active"} -->\nTampered body.\n') }, { path: 'pidex/rules/managed/pidex-implementer/index.md', bytes: f.indexBytes }];
  const result = await publishAction(f); assert.equal(result.status, 'unavailable'); assert.equal(f.writes.size, 0);
  assert.doesNotMatch(JSON.stringify(result), /window:slice1|112233445566778899001122|passive-impact/);
});
const cid = (value) => hex(value).slice(0, 40);
const ACTION_RULE = 'project:112233445566778899001122:pidex-implementer:quality';
const GLOBAL_RULE = 'pidex-global:pidex-implementer:quality';
const CAD = '5a'.repeat(32); const OTHER_CAD = '6b'.repeat(32);
function layoutPaths(rule_id) {
  const global = /^pidex-global:([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(rule_id || '');
  if (global) return { paths: ['config/rule-baseline-manifest.json', `rules/${global[1]}/${global[2]}.md`, `rules/${global[1]}/index.md`], rule: `rules/${global[1]}/${global[2]}.md` };
  const project = /^project:([a-f0-9]{24,64}):([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(rule_id || '');
  return { paths: [`pidex/rules/managed/${project[2]}/${project[3]}.md`, `pidex/rules/managed/${project[2]}/index.md`], rule: `pidex/rules/managed/${project[2]}/${project[3]}.md` };
}
function plainCommit(id, parents, staged = {}) { return { commit: id, parents, tree_digest: hex(id + 'tree'), author: 'PIDEX <pidex@example.invalid>', subject: 'chore: unrelated', trailers: {}, staged_member_digests: staged }; }
function cadenceCommit({ id, parent, rule_id = ACTION_RULE, cadence_digest = CAD, transaction = 'f'.repeat(64), admission = 'e'.repeat(64), rule_digest = hex('deactivated'), index_digest = hex('index'), manifest_digest = hex('manifest'), staged, trailers, parents }) {
  const layout = layoutPaths(rule_id); const digests = { [layout.rule]: rule_digest };
  for (const entry of layout.paths) if (entry !== layout.rule) digests[entry] = entry.endsWith('index.md') ? index_digest : manifest_digest;
  const tier = rule_id.startsWith('pidex-global') ? 'global' : 'project';
  const parentOid = parents?.[0] || parent;
  return { commit: id, parents: parents || [parent], tree_digest: hex(id + 'tree'), author: 'PIDEX <pidex@example.invalid>', subject: `rules(${tier}): publish ${rule_id}`, trailers: trailers || { 'PIDEX-Rule-ID': rule_id, 'PIDEX-Transaction-Digest': transaction, 'PIDEX-Admission-Digest': admission, 'PIDEX-Predecessor': `commit:${parentOid}`, 'PIDEX-Action-Cadence': cadence_digest }, staged_member_digests: staged || digests };
}
function historyAdapter(map) { return { inspectCommit: ({ commit }) => { const value = map.get(commit); if (!value) throw new Error('history missing ' + commit); return value; } }; }
function classify(map, remote_head, bound_from, overrides = {}) { return classifyActionCadenceHistory({ adapter: historyAdapter(map), remote_head, bound_from, max_commits: overrides.max_commits || 8, cadence_digest: overrides.cadence_digest || CAD, expected: overrides.expected || { tier: 'project', rule_id: ACTION_RULE, predecessor_commit: bound_from } }); }

test('Slice2 classifier returns clear for bounded first-parent history with no cadence consumption', () => {
  const base = cid('base'); const map = new Map([[base, plainCommit(base, [])]]);
  assert.deepEqual(classify(map, base, base), { state: 'clear', reason: 'no_consumption' });
});
test('Slice2 classifier counts one conforming lifecycle commit with exact cadence digest as consumed and skips other cadences', () => {
  const base = cid('base'); const consumed = cadenceCommit({ id: cid('c1'), parent: base });
  const other = cadenceCommit({ id: cid('c0'), parent: consumed.commit, cadence_digest: OTHER_CAD, rule_digest: hex('third') });
  const map = new Map([[base, plainCommit(base, [], { [layoutPaths(ACTION_RULE).rule]: hex('active'), 'pidex/rules/managed/pidex-implementer/index.md': hex('index') })], [consumed.commit, consumed], [other.commit, other]]);
  assert.deepEqual(classify(map, other.commit, base), { state: 'consumed', commit: consumed.commit, transaction_digest: consumed.trailers['PIDEX-Transaction-Digest'], containing_head: other.commit });
});
test('Slice2 classifier quarantines duplicate, folded, uppercase, raw, and missing-metadata cadence trailers', () => {
  const base = cid('base'); const parentStaged = { [layoutPaths(ACTION_RULE).rule]: hex('active'), 'pidex/rules/managed/pidex-implementer/index.md': hex('index') };
  const malformed = [
    ['folded', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence': `${CAD}\n continuation` })], ['uppercase', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence': CAD.toUpperCase() })], ['raw', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence': 'window:slice1|project|scope' })], ['wrong_length', (trailers) => ({ ...trailers, 'PIDEX-Action-Cadence': 'a'.repeat(63) })], ['missing_rule_metadata', (trailers) => { const next = { ...trailers }; delete next['PIDEX-Rule-ID']; return next; }], ['missing_transaction_metadata', (trailers) => { const next = { ...trailers }; delete next['PIDEX-Transaction-Digest']; return next; }],
  ];
  for (const [name, mutate] of malformed) {
    const bad = cadenceCommit({ id: cid('c1'), parent: base, trailers: mutate(cadenceCommit({ id: cid('c1'), parent: base }).trailers) });
    const map = new Map([[base, plainCommit(base, [], parentStaged)], [bad.commit, bad]]);
    const result = classify(map, bad.commit, base); assert.equal(result.state, 'quarantined', name); assert.match(result.reason, /^cadence_/, name);
  }
  const duplicated = cadenceCommit({ id: cid('c1'), parent: base, trailers: [['PIDEX-Rule-ID', ACTION_RULE], ['PIDEX-Transaction-Digest', 'f'.repeat(64)], ['PIDEX-Admission-Digest', 'e'.repeat(64)], ['PIDEX-Predecessor', `commit:${base}`], ['PIDEX-Action-Cadence', CAD], ['PIDEX-Action-Cadence', CAD]] });
  const map = new Map([[base, plainCommit(base, [], parentStaged)], [duplicated.commit, duplicated]]);
  assert.equal(classify(map, duplicated.commit, base).reason, 'cadence_duplicate');
});
test('Slice2 classifier quarantines first-parent gaps, oversized ranges, cycles, and unverifiable history', () => {
  const base = cid('base'); const gap = cid('gap');
  const root = plainCommit(gap, []); const top = plainCommit(cid('top'), [gap]);
  const gapMap = new Map([[gap, root], [top.commit, top]]);
  assert.equal(classify(gapMap, top.commit, base).reason, 'first_parent_gap');
  const cyclic = plainCommit(cid('cyc'), [cid('cyc')]); const cycleMap = new Map([[cyclic.commit, cyclic]]);
  assert.equal(classify(cycleMap, cyclic.commit, cid('other-bound')).reason, 'first_parent_gap');
  const long = [0, 1, 2, 3, 4].map((index) => cid('l' + index));
  const longMap = new Map(long.map((id, index) => [id, plainCommit(id, index + 1 < long.length ? [long[index + 1]] : [])]));
  assert.equal(classify(longMap, long[0], base, { max_commits: 3 }).reason, 'history_range_oversized');
  const missingMap = new Map([[cid('m0'), plainCommit(cid('m0'), [cid('m1')])]]);
  assert.equal(classify(missingMap, cid('m0'), base).reason, 'history_unavailable');
});
test('Slice2 classifier quarantines mixed lifecycle/code diffs, receipt mismatches, missing expected metadata, and conflicting same-cadence consumption', () => {
  const base = cid('base'); const rulePath = layoutPaths(ACTION_RULE).rule; const indexPath = 'pidex/rules/managed/pidex-implementer/index.md';
  const parentStaged = { [rulePath]: hex('active'), [indexPath]: hex('index') };
  const baseMap = (commit) => new Map([[base, plainCommit(base, [], parentStaged)], [commit.commit, commit]]);
  const mixedCode = cadenceCommit({ id: cid('c1'), parent: base, staged: { [rulePath]: hex('deactivated'), [indexPath]: hex('index'), 'src/code.js': hex('code') } });
  assert.equal(classify(baseMap(mixedCode), mixedCode.commit, base).reason, 'diff_mixed');
  const changedIndex = cadenceCommit({ id: cid('c1'), parent: base, index_digest: hex('index2') });
  assert.equal(classify(baseMap(changedIndex), changedIndex.commit, base).reason, 'diff_mixed');
  const unchangedRule = cadenceCommit({ id: cid('c1'), parent: base, rule_digest: hex('active') });
  assert.equal(classify(baseMap(unchangedRule), unchangedRule.commit, base).reason, 'diff_mixed');
  const receiptMismatch = cadenceCommit({ id: cid('c1'), parent: base });
  const receiptResult = classify(baseMap(receiptMismatch), receiptMismatch.commit, base, { expected: { tier: 'project', rule_id: ACTION_RULE, predecessor_commit: base, content_hash: hex('expected-content') } });
  assert.equal(receiptResult.reason, 'receipt_mismatch');
  const wrongRule = cadenceCommit({ id: cid('c1'), parent: base, rule_id: 'project:112233445566778899001122:pidex-implementer:alpha' });
  const wrongRuleResult = classify(baseMap(wrongRule), wrongRule.commit, base, { expected: { tier: 'project', rule_id: ACTION_RULE, predecessor_commit: base, content_hash: hex('x') } });
  assert.equal(wrongRuleResult.reason, 'cross_match_mismatch');
  assert.equal(classify(baseMap(cadenceCommit({ id: cid('c1'), parent: base })), cid('c1'), base, { expected: { tier: 'project' } }).reason, 'expected_metadata_missing'); assert.equal(classify(baseMap(cadenceCommit({ id: cid('c1'), parent: base })), cid('c1'), base, { expected: { tier: 'project', rule_id: ACTION_RULE, predecessor_commit: 'zzz' } }).reason, 'expected_metadata_missing');
  const first = cadenceCommit({ id: cid('c1'), parent: base });
  const second = cadenceCommit({ id: cid('c0'), parent: first.commit, rule_digest: hex('third') });
  const conflictMap = new Map([[base, plainCommit(base, [], parentStaged)], [first.commit, first], [second.commit, second]]);
  assert.equal(classify(conflictMap, second.commit, base, { expected: { tier: 'project', rule_id: ACTION_RULE } }).reason, 'cadence_conflict');
});
test('Slice2 classifier denial parity is deterministic across global/project tiers and platform-shaped trailer bytes, and never leaks raw fields', () => {
  const base = cid('base');
  for (const [tier, rule_id, paths] of [['global', GLOBAL_RULE, ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md']], ['project', ACTION_RULE, ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/quality.md']]]) {
    const rulePath = paths.find((entry) => entry.endsWith('quality.md')); const indexPath = paths.find((entry) => entry.endsWith('index.md'));
    const bad = cadenceCommit({ id: cid('c1'), parent: base, rule_id, cadence_digest: OTHER_CAD, trailers: { 'PIDEX-Rule-ID': rule_id, 'PIDEX-Transaction-Digest': 'f'.repeat(64), 'PIDEX-Admission-Digest': 'e'.repeat(64), 'PIDEX-Predecessor': `commit:${base}`, 'PIDEX-Action-Cadence': CAD.toUpperCase() } });
    const map = new Map([[base, plainCommit(base, [], { [rulePath]: hex('active'), [indexPath]: hex('index') })], [bad.commit, bad]]);
    const result = classify(map, bad.commit, base, { expected: { tier, rule_id, predecessor_commit: base }, cadence_digest: CAD });
    assert.equal(result.state, 'quarantined', tier); assert.equal(result.reason, 'cadence_malformed', tier);
    assert.doesNotMatch(JSON.stringify(result), /window:slice1|112233445566778899001122|pidex-implementer|credential|secret|\/home\//i);
  }
  const crlf = cadenceCommit({ id: cid('c1'), parent: base, trailers: { 'PIDEX-Rule-ID': ACTION_RULE, 'PIDEX-Transaction-Digest': 'f'.repeat(64), 'PIDEX-Admission-Digest': 'e'.repeat(64), 'PIDEX-Predecessor': `commit:${base}`, 'PIDEX-Action-Cadence': `${CAD}\r` } });
  const crlfMap = new Map([[base, plainCommit(base, [], { [layoutPaths(ACTION_RULE).rule]: hex('active'), 'pidex/rules/managed/pidex-implementer/index.md': hex('index') })], [crlf.commit, crlf]]);
  assert.equal(classify(crlfMap, crlf.commit, base).reason, 'cadence_malformed');
});
test('Slice2 global lifecycle-action writer preserves manifest and index, flips only the rule receipt to deactivated, and pushes once', async () => {
  const f = actionFixture({ tier: 'global' }); const result = await publishAction(f); assert.equal(result.status, 'receipt_pending');
  assert.deepEqual([...f.writes.keys()].sort(), f.facts.target.allowed_paths.slice().sort());
  const rule = f.writes.get('rules/pidex-implementer/quality.md').toString();
  assert.match(rule, /^<!-- pidex-rule-receipt-v1 \{.*"lifecycle_state":"deactivated"\} -->\nExisting global rule body preserved\.\n$/);
  assert.equal(f.writes.get('rules/pidex-implementer/index.md').toString(), f.indexBytes.toString());
  assert.equal(f.writes.get('config/rule-baseline-manifest.json').toString(), f.manifestBytes.toString());
  assert.equal(f.calls.filter(([name]) => name === 'pushFastForward').length, 1); assert.equal(f.calls.find(([name]) => name === 'tx02')[1].parent, head);
});
test('Slice2 writer rechecks bounded canonical history at expected base and denies with zero mutation when cadence is already consumed below base', async () => {
  const f = actionFixture({ tier: 'global' });
  const rulePath = 'rules/pidex-implementer/quality.md'; const indexPath = 'rules/pidex-implementer/index.md';
  const bound = cid('bound'); const consumed = cadenceCommit({ id: cid('consumed'), parent: bound, rule_id: GLOBAL_RULE, cadence_digest: CAD, transaction: '9'.repeat(64) });
  const historyChain = new Map([
    [head, plainCommit(head, [consumed.commit], { [rulePath]: hex('active2'), [indexPath]: hex('index') })],
    [consumed.commit, consumed],
    [bound, plainCommit(bound, [], { [rulePath]: hex('active'), [indexPath]: hex('index') })],
  ]);
  f.git.inspectCommit = ({ commit: target }) => { const value = historyChain.get(target); if (!value) return undefined; return value; };
  const result = await publishAction(f, { history_bound: { from: bound, max_commits: 8 } });
  assert.deepEqual(result, { status: 'unavailable', transaction: f.facts.idempotency_key, reason: 'cadence_history_invalid' });
  assert.equal(f.writes.size, 0);
  assert.equal(f.calls.some(([name]) => name === 'pushFastForward'), false); assert.equal(f.calls.some(([call]) => call === 'tx02'), false); assert.equal(f.calls.some(([call]) => call === 'terminal'), false);
});
// ---- Slice3A writer: reactivation transitions preserve body/index/manifest and reject unknown transitions ----
test('Slice3A writer commits active-monitor and active-pinned transitions preserving body/index and one bounded cadence trailer', async () => {
  for (const transition of ['active-monitor', 'active-pinned']) {
    const f = actionFixture();
    const rule_id = f.facts.target.rule_id;
    const deactivatedBytes = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${rule_id}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"deactivated"} -->\nExisting rule body preserved.\n`);
    const reactivated = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${rule_id}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"${transition}"} -->\nExisting rule body preserved.\n`);
    f.facts = Object.assign(f.facts, { action: { ...f.facts.action, lifecycle_transition: transition }, rule_bytes: reactivated, content_hash: hex(reactivated) });
    f.git.readCanonicalMembers = () => [{ path: 'pidex/rules/managed/pidex-implementer/quality.md', bytes: deactivatedBytes }, { path: 'pidex/rules/managed/pidex-implementer/index.md', bytes: f.indexBytes }];
    const result = await publishAction(f); assert.equal(result.status, 'receipt_pending', transition);
    const rule = f.writes.get('pidex/rules/managed/pidex-implementer/quality.md').toString();
    assert.match(rule, new RegExp(`"lifecycle_state":"${transition}"`), transition);
    assert.ok(rule.endsWith('Existing rule body preserved.\n'), transition + ' body preserved');
    assert.equal(f.writes.get('pidex/rules/managed/pidex-implementer/index.md').toString(), f.indexBytes.toString(), transition + ' index preserved');
    assert.deepEqual([...f.writes.keys()].sort(), f.facts.target.allowed_paths.slice().sort(), transition);
    assert.equal(f.calls.filter(([name]) => name === 'pushFastForward').length, 1, transition);
    const trailers = f.git.inspectCommit().trailers;
    assert.equal(trailers['PIDEX-Action-Cadence'], f.facts.cadence_digest, transition + ' exactly one bounded cadence trailer');
    assert.equal(f.calls.some(([name]) => /spawn|exec|git |rebase|merge|amend|force/.test(name)), false, transition);
  }
});
test('Slice3A writer fails closed on unknown lifecycle transitions and reactivation body drift with zero writes', async () => {
  const unknown = actionFixture();
  unknown.facts = Object.assign(unknown.facts, { action: { ...unknown.facts.action, lifecycle_transition: 'purge' } });
  const rejected = await publishAction(unknown); assert.equal(rejected.status, 'unavailable'); assert.equal(unknown.writes.size, 0);
  const drifted = actionFixture();
  const reactivated = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${drifted.facts.target.rule_id}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"active-monitor"} -->\nExisting rule body preserved.\n`);
  drifted.facts = Object.assign(drifted.facts, { action: { ...drifted.facts.action, lifecycle_transition: 'active-monitor' }, rule_bytes: reactivated, content_hash: hex(reactivated) });
  drifted.git.readCanonicalMembers = () => [{ path: 'pidex/rules/managed/pidex-implementer/quality.md', bytes: Buffer.from('<!-- pidex-rule-receipt-v1 {"rule_id":"project:112233445566778899001122:pidex-implementer:quality","lifecycle_state":"deactivated"} -->\nTampered body.\n') }, { path: 'pidex/rules/managed/pidex-implementer/index.md', bytes: drifted.indexBytes }];
  const driftedResult = await publishAction(drifted); assert.equal(driftedResult.status, 'unavailable'); assert.equal(drifted.writes.size, 0);
  assert.doesNotMatch(JSON.stringify({ rejected, driftedResult }), /window:slice1|112233445566778899001122|passive-impact/);
});
