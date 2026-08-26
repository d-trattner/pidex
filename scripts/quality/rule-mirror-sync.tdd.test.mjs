import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, fstatSync, linkSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireAcceptedHeadFacts, consumeAcceptedRemoteReceipt, flushReopenMode, materializeVerifiedMirror, readVerifiedMirrorMember, renderVerifiedRuntimeRules, syncDirectory, validateRequiredReviewerProducer, verifyAcceptedRemoteDescendantProof } from './rule-mirror-sync.mjs';

const bytes = Buffer.from('# Quality\n');
const hash = (value) => value.repeat(64);
const byteHash = createHash('sha256').update(bytes).digest('hex');

test('PLAN258 native Windows reopens verified writes writable without truncation while POSIX remains read-only', () => {
  assert.equal(flushReopenMode('win32'), 'r+');
  assert.equal(flushReopenMode('linux'), 'r');
});

test('PLAN258 Windows witness durability rejects drift and links, but turns directory EPERM into verified witness flush', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-windows-directory-witness-')); const directory = path.join(root, 'generation'); const witness = path.join(directory, 'generation.json');
  try {
    mkdirSync(directory); writeFileSync(witness, '{"generation":1}');
    const expectedDigest = createHash('sha256').update(readFileSync(witness)).digest('hex'); const flushed = [];
    assert.equal(syncDirectory(directory, { platform: 'win32', witnessPath: witness, expectedDigest, sync: (descriptor) => {
      if (fstatSync(descriptor).isDirectory()) throw Object.assign(new Error('native Windows directory fsync EPERM'), { code: 'EPERM' });
      flushed.push(fstatSync(descriptor).size);
    } }), true);
    assert.deepEqual(flushed, [readFileSync(witness).length], 'Windows must fsync only verified regular witness');
    const posix = [];
    assert.equal(syncDirectory(directory, { platform: 'linux', sync: (descriptor) => posix.push(fstatSync(descriptor).isDirectory()) }), true);
    assert.deepEqual(posix, [true], 'POSIX retains directory-descriptor fsync');
    writeFileSync(witness, '{"generation":2}');
    assert.throws(() => syncDirectory(directory, { platform: 'win32', witnessPath: witness, expectedDigest }), /RULE_MIRROR_STATE_PATH_INVALID/);
    writeFileSync(witness, '{"generation":1}'); linkSync(witness, path.join(directory, 'generation-copy.json'));
    assert.throws(() => syncDirectory(directory, { platform: 'win32', witnessPath: witness, expectedDigest }), /RULE_MIRROR_STATE_PATH_INVALID/);
    rmSync(witness); symlinkSync(path.join(directory, 'generation-copy.json'), witness);
    assert.throws(() => syncDirectory(directory, { platform: 'win32', witnessPath: witness, expectedDigest }), /RULE_MIRROR_STATE_PATH_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('PLAN258 materialization flushes staged and renamed generation witnesses on win32 without directory fsync', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-windows-materialize-')); const calls = [];
  try {
    const result = materializeVerifiedMirror({ stateRoot, repository: 'repo:win32-witness', scope_id: null, accepted_head: 'a'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes }, platform: 'win32', durabilitySync: (descriptor) => {
      const stat = fstatSync(descriptor);
      if (stat.isDirectory()) throw Object.assign(new Error('native Windows directory fsync EPERM'), { code: 'EPERM' });
      calls.push(stat.size);
    } });
    assert.equal(result.status, 'verified');
    assert.equal(calls.length, 2, 'stage and post-rename parent sync must each flush generation witness');
    assert.equal(calls.every((size) => size > 0), true);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('BD45-15 writes verified accepted bytes only beneath external mirror state', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-'));
  try {
    const result = materializeVerifiedMirror({ stateRoot, repository: 'repo:global', scope_id: null, accepted_head: 'a'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes } });
    assert.equal(result.status, 'verified');
    assert.equal(existsSync(result.file), true);
    assert.deepEqual(readFileSync(result.file), bytes);
    assert.doesNotMatch(result.file, /\/home\//);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('manual reader obtains exact predecessor only from verified immutable mirror member', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-manual-predecessor-'));
  const member = { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes };
  try {
    materializeVerifiedMirror({ stateRoot, repository: 'repo:manual', scope_id: 'pidex-global', accepted_head: 'a'.repeat(40), member });
    assert.deepEqual(readVerifiedMirrorMember({ stateRoot, repository: 'repo:manual', scope_id: 'pidex-global', accepted_commit: 'a'.repeat(40), path: member.path, content_hash: byteHash }), bytes);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('RH45-01/03 returns immutable verified packaged/current baselines and only consumes an exact supplied accepted receipt', () => {
  const packaged = acquireAcceptedHeadFacts({ kind: 'packaged_seed', repository_identity: 'repo:global', scope_id: 'scope:global', baseline_parent_commit: 'a'.repeat(40), manifest_digest: 'b'.repeat(64), verified_at: '2026-08-11T00:00:00.000Z' });
  assert.deepEqual(packaged, { schema: 'pidex-accepted-head-facts-v1', repository_identity: 'repo:global', scope_id: 'scope:global', accepted_remote_head: null, baseline_parent_commit: 'a'.repeat(40), manifest_digest: 'b'.repeat(64), tree_digest: null, verified_at: '2026-08-11T00:00:00.000Z', remote_checked_at: null });
  assert.equal(Object.isFrozen(packaged), true);
  const current = acquireAcceptedHeadFacts({ kind: 'current_project', repository_identity: 'repo:project', scope_id: 'scope:project', accepted_remote_head: 'c'.repeat(40), baseline_parent_commit: 'a'.repeat(40), tree_digest: 'd'.repeat(64), verified_at: '2026-08-11T00:00:00.000Z', remote_checked_at: '2026-08-11T00:00:01.000Z' });
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'repo:project', scope_id: 'scope:project', rule_id: 'project:scope:pidex-implementer:quality', predecessor_commit: 'a'.repeat(40), accepted_commit: 'c'.repeat(40), tree_digest: 'd'.repeat(64), content_hash: 'e'.repeat(64), admission_digest: 'f'.repeat(64), transaction_digest: '0'.repeat(64), lifecycle_state: 'active' };
  assert.throws(() => consumeAcceptedRemoteReceipt(receipt, { verified_head_facts: current }), /RULE_ACCEPTED_RECEIPT_MISMATCH/);
  assert.throws(() => consumeAcceptedRemoteReceipt({ ...receipt, status: 'prepared' }, { verified_head_facts: current }), /RULE_ACCEPTED_RECEIPT_INVALID/);
  assert.throws(() => consumeAcceptedRemoteReceipt(receipt, { verified_head_facts: { ...current, tree_digest: 'f'.repeat(64) } }), /RULE_ACCEPTED_RECEIPT_MISMATCH/);
});

test('CR-073-02 acquires accepted remote facts through read-only canonical Git commands', () => {
  const head = 'c'.repeat(40); const parent = 'a'.repeat(40); const treeBytes = Buffer.from('tree bytes'); const manifestBytes = Buffer.from('{"rules":[]}');
  const calls = [];
  const git = (args) => {
    calls.push(args);
    const command = args.slice(2).join(' ');
    if (command === 'fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main') return '';
    if (command === 'remote get-url origin') return 'https://example.invalid/rules.git\n';
    if (command === 'rev-parse refs/remotes/origin/main') return `${head}\n`;
    if (command === `merge-base --is-ancestor ${parent} ${head}`) return '';
    if (command === `rev-parse ${head}^`) return `${parent}\n`;
    if (command === `rev-list --first-parent ${parent}..${head}`) return `${head}\n`;
    if (command === `cat-file -p ${head}^{tree}`) return treeBytes;
    if (command === `show ${head}:config/rule-baseline-manifest.json`) return manifestBytes;
    if (command === `diff-tree --no-commit-id --name-only -r ${parent} ${head}`) return 'rules/pidex-implementer/quality.md\n';
    throw new Error(`unexpected Git command: ${command}`);
  };
  const facts = acquireAcceptedHeadFacts({ kind: 'accepted_remote', repository_root: '/read-only/repo', enrollment: { repository_identity: 'repo:global', scope_id: 'scope:global', remote_name: 'origin', remote: 'https://example.invalid/rules.git', branch: 'main' }, baseline_parent_commit: parent, git });
  assert.equal(facts.accepted_remote_head, head);
  assert.equal(facts.tree_digest, createHash('sha256').update(treeBytes).digest('hex'));
  assert.equal(facts.manifest_digest, createHash('sha256').update(manifestBytes).digest('hex'));
  assert.equal(calls.some((args) => args.includes('fetch')), true);
  assert.equal(calls.some((args) => args.includes('push') || args.includes('reset') || args.includes('checkout')), false);
});

test('CR-073-03 publishes only complete immutable mirror generations and rejects collisions', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-'));
  try {
    const first = Buffer.from('# First\n'); const second = Buffer.from('# Second\n');
    const members = [
      { rule_id: 'pidex-global:pidex-implementer:first', path: 'rules/pidex-implementer/first.md', content_hash: createHash('sha256').update(first).digest('hex'), bytes: first },
      { rule_id: 'pidex-global:pidex-implementer:second', path: 'rules/pidex-implementer/second.md', content_hash: createHash('sha256').update(second).digest('hex'), bytes: second },
    ];
    const result = materializeVerifiedMirror({ stateRoot, repository: 'repo:global', scope_id: null, accepted_head: 'd'.repeat(40), members });
    assert.equal(result.status, 'verified');
    assert.equal(result.files.length, 2);
    assert.deepEqual(readFileSync(result.files[1]), second);
    assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: 'repo:global', scope_id: null, accepted_head: 'd'.repeat(40), members: [{ ...members[0], bytes: Buffer.from('# Mutated\n'), content_hash: createHash('sha256').update(Buffer.from('# Mutated\n')).digest('hex') }, members[1]] }), /RULE_MIRROR_GENERATION_COLLISION/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('B1 mirror reopen rejects symlink and hardlink members even when declared bytes match', () => {
  for (const link of ['symlink', 'hardlink']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), `pidex-mirror-${link}-`)); const outside = path.join(stateRoot, 'outside.md');
    try {
      writeFileSync(outside, bytes);
      const first = materializeVerifiedMirror({ stateRoot, repository: `repo:${link}`, scope_id: null, accepted_head: '1'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes } });
      rmSync(first.file);
      if (link === 'symlink') symlinkSync(outside, first.file); else linkSync(outside, first.file);
      assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: `repo:${link}`, scope_id: null, accepted_head: '1'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes } }), /RULE_MIRROR_GENERATION_COLLISION/);
    } finally { rmSync(stateRoot, { recursive: true, force: true }); }
  }
});

test('CR-074-02 canonical receipt consumption fetches enrolled remote without checkout mutation and rejects stale supplied facts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-receipt-'));
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  try {
    const remote = path.join(root, 'remote.git'); const source = path.join(root, 'source'); const consumer = path.join(root, 'consumer');
    git('init', '--bare', remote); git('init', '-b', 'main', source); git('-C', source, 'config', 'user.email', 'test@example.invalid'); git('-C', source, 'config', 'user.name', 'Test');
    mkdirSync(path.join(source, 'config'), { recursive: true }); mkdirSync(path.join(source, 'rules/pidex-implementer'), { recursive: true }); writeFileSync(path.join(source, 'config/rule-baseline-manifest.json'), '{}\n'); writeFileSync(path.join(source, 'rules/pidex-implementer/base.md'), '# base\n'); git('-C', source, 'add', '.'); git('-C', source, 'commit', '-m', 'baseline'); const parent = git('-C', source, 'rev-parse', 'HEAD'); git('-C', source, 'remote', 'add', 'origin', remote); git('-C', source, 'push', '-u', 'origin', 'main'); git('--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    git('clone', remote, consumer);
    const member = Buffer.from('<!-- pidex-rule-receipt-v1 {"rule_id":"pidex-global:pidex-implementer:next","admission_digest":"' + 'c'.repeat(64) + '","transaction_digest":"' + 'd'.repeat(64) + '","lifecycle_state":"active"} -->\n# next\n'); writeFileSync(path.join(source, 'rules/pidex-implementer/next.md'), member); writeFileSync(path.join(source, 'rules/pidex-implementer/index.md'), '- [pidex-global:pidex-implementer:next](next.md)\n'); writeFileSync(path.join(source, 'config/rule-baseline-manifest.json'), JSON.stringify({ schema: 'pidex-bundled-rule-seed-v1', rules: [{ rule_id: 'pidex-global:pidex-implementer:next', path: 'rules/pidex-implementer/next.md', byte_hash: createHash('sha256').update(member).digest('hex') }] })); git('-C', source, 'add', '.'); git('-C', source, 'commit', '-m', 'rule only'); const accepted = git('-C', source, 'rev-parse', 'HEAD'); git('-C', source, 'push');
    const treeDigest = createHash('sha256').update(execFileSync('git', ['-C', source, 'cat-file', '-p', `${accepted}^{tree}`])).digest('hex');
    const stale = acquireAcceptedHeadFacts({ kind: 'current_project', repository_identity: 'repo:remote', scope_id: 'scope:remote', accepted_remote_head: parent, baseline_parent_commit: parent, tree_digest: 'a'.repeat(64), verified_at: '2026-08-11T00:00:00.000Z', remote_checked_at: '2026-08-11T00:00:00.000Z' });
    const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'repo:remote', scope_id: 'scope:remote', rule_id: 'pidex-global:pidex-implementer:next', predecessor_commit: parent, accepted_commit: accepted, tree_digest: treeDigest, content_hash: createHash('sha256').update(member).digest('hex'), admission_digest: 'c'.repeat(64), transaction_digest: 'd'.repeat(64), lifecycle_state: 'active' };
    const enrollment = { repository_identity: 'repo:remote', scope_id: 'scope:remote', remote_name: 'origin', remote, branch: 'main', allowed_paths: ['rules/pidex-implementer/next.md', 'rules/pidex-implementer/index.md', 'config/rule-baseline-manifest.json'] };
    const before = git('-C', consumer, 'rev-parse', 'HEAD');
    const facts = consumeAcceptedRemoteReceipt(receipt, { repository_root: consumer, baseline_parent_commit: parent, enrollment, verified_head_facts: stale });
    assert.equal(facts.accepted_remote_head, accepted); assert.equal(git('-C', consumer, 'rev-parse', 'HEAD'), before);
    assert.throws(() => consumeAcceptedRemoteReceipt({ ...receipt, accepted_commit: parent, predecessor_commit: parent, tree_digest: 'a'.repeat(64) }, { repository_root: consumer, baseline_parent_commit: parent, enrollment, verified_head_facts: stale }), /RULE_ACCEPTED_RECEIPT_MISMATCH/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CR-075-02 rejects forged receipt content identity and out-of-path Markdown after canonical fetch', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-receipt-forged-'));
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  try {
    const remote = path.join(root, 'remote.git'); const source = path.join(root, 'source'); const consumer = path.join(root, 'consumer');
    git('init', '--bare', remote); git('init', '-b', 'main', source); git('-C', source, 'config', 'user.email', 'test@example.invalid'); git('-C', source, 'config', 'user.name', 'Test');
    mkdirSync(path.join(source, 'config'), { recursive: true }); mkdirSync(path.join(source, 'rules/pidex-implementer'), { recursive: true }); writeFileSync(path.join(source, 'config/rule-baseline-manifest.json'), '{}\n'); writeFileSync(path.join(source, 'rules/pidex-implementer/base.md'), '# base\n'); git('-C', source, 'add', '.'); git('-C', source, 'commit', '-m', 'base'); const parent = git('-C', source, 'rev-parse', 'HEAD'); git('-C', source, 'remote', 'add', 'origin', remote); git('-C', source, 'push', '-u', 'origin', 'main'); git('--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/main'); git('clone', remote, consumer);
    const member = Buffer.from('<!-- pidex-rule-receipt-v1 {"rule_id":"pidex-global:pidex-implementer:quality","admission_digest":"' + 'c'.repeat(64) + '","transaction_digest":"' + 'd'.repeat(64) + '","lifecycle_state":"active"} -->\n# canonical managed rule\n'); writeFileSync(path.join(source, 'rules/pidex-implementer/quality.md'), member); writeFileSync(path.join(source, 'rules/pidex-implementer/index.md'), '- [pidex-global:pidex-implementer:quality](quality.md)\n'); writeFileSync(path.join(source, 'config/rule-baseline-manifest.json'), JSON.stringify({ schema: 'pidex-bundled-rule-seed-v1', rules: [{ rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', byte_hash: createHash('sha256').update(member).digest('hex') }] })); git('-C', source, 'add', '.'); git('-C', source, 'commit', '-m', 'rule'); const accepted = git('-C', source, 'rev-parse', 'HEAD'); git('-C', source, 'push');
    const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'repo:global', scope_id: 'scope:global', rule_id: 'pidex-global:pidex-implementer:quality', predecessor_commit: parent, accepted_commit: accepted, tree_digest: createHash('sha256').update(execFileSync('git', ['-C', source, 'cat-file', '-p', `${accepted}^{tree}`])).digest('hex'), content_hash: createHash('sha256').update(member).digest('hex'), admission_digest: 'c'.repeat(64), transaction_digest: 'd'.repeat(64), lifecycle_state: 'active' };
    const enrollment = { repository_identity: 'repo:global', scope_id: 'scope:global', remote_name: 'origin', remote, branch: 'main', allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/quality.md', 'rules/pidex-implementer/index.md'] };
    assert.doesNotThrow(() => consumeAcceptedRemoteReceipt(receipt, { repository_root: consumer, baseline_parent_commit: parent, enrollment }));
    // Deterministic valid-but-different values: prior first-character replacement was a flaky no-op when a Git digest began with `f`.
    for (const field of ['rule_id', 'content_hash', 'admission_digest', 'transaction_digest', 'lifecycle_state', 'predecessor_commit', 'accepted_commit', 'tree_digest', 'repository_identity', 'scope_id']) assert.throws(() => { const value = `${receipt[field]}`; return consumeAcceptedRemoteReceipt({ ...receipt, [field]: field === 'lifecycle_state' ? 'deactivated' : `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}` }, { repository_root: consumer, baseline_parent_commit: parent, enrollment }); }, /RULE_ACCEPTED_RECEIPT_MISMATCH/);
    writeFileSync(path.join(source, 'notes.md'), '# unrelated markdown\n'); git('-C', source, 'add', '.'); git('-C', source, 'commit', '-m', 'bad markdown'); git('-C', source, 'push');
    assert.throws(() => consumeAcceptedRemoteReceipt(receipt, { repository_root: consumer, baseline_parent_commit: parent, enrollment }), /RULE_ACCEPTED_RECEIPT_MISMATCH/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CR-074-03 verifies exact durable generation manifest: extras and metadata drift collide', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-'));
  try {
    const member = { rule_id: 'pidex-global:pidex-implementer:exact', path: 'rules/pidex-implementer/exact.md', content_hash: byteHash, bytes };
    const first = materializeVerifiedMirror({ stateRoot, repository: 'repo:exact', scope_id: null, accepted_head: 'e'.repeat(40), member });
    writeFileSync(path.join(path.dirname(first.file), 'unexpected.md'), '# torn extra\n');
    assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: 'repo:exact', scope_id: null, accepted_head: 'e'.repeat(40), member }), /RULE_MIRROR_GENERATION_COLLISION/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('CR-074-05 renders only exact resolver-selected immutable mirror bytes and fails closed on digest drift', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-runtime-mirror-'));
  try {
    const governed = Buffer.from('# Governed rule\n\nExact body.\n'); const unrelated = Buffer.from('# Unselected\n');
    const governedHash = createHash('sha256').update(governed).digest('hex'); const unrelatedHash = createHash('sha256').update(unrelated).digest('hex');
    materializeVerifiedMirror({ stateRoot, repository: 'repo:runtime', scope_id: null, accepted_head: 'f'.repeat(40), members: [
      { rule_id: 'pidex-global:pidex-implementer:governed', path: 'rules/pidex-implementer/governed.md', content_hash: governedHash, bytes: governed },
      { rule_id: 'pidex-global:pidex-implementer:unselected', path: 'rules/pidex-implementer/unselected.md', content_hash: unrelatedHash, bytes: unrelated },
    ] });
    const snapshot = { schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: 'snapshot:runtime', active_rules: [{ rule_id: 'pidex-global:pidex-implementer:governed', version_hash: governedHash, content_hash: governedHash, accepted_commit: 'f'.repeat(40), mirror_digest: governedHash }] };
    const rendered = renderVerifiedRuntimeRules({ stateRoot, resolverSnapshot: snapshot });
    assert.equal(rendered.rendered, '# Governed rule\n\nExact body.\n');
    assert.doesNotMatch(rendered.rendered, /Unselected/);
    assert.throws(() => renderVerifiedRuntimeRules({ stateRoot, resolverSnapshot: { ...snapshot, active_rules: [{ ...snapshot.active_rules[0], mirror_digest: 'a'.repeat(64) }] } }), /RULE_RUNTIME_MIRROR_MISMATCH/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('CR-079-01 preserves canonical immutable producer member association; unrelated schema markers cannot satisfy reviewer contract', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-reviewer-producer-'));
  const agent = 'pidex-code-reviewer'; const phase = 'code-review';
  const ruleId = 'pidex.analysis-metrics-history.structured-review-outcome.code-review';
  const canonicalPath = 'modules/pidex/analysis-metrics-history/rules/structured-review-outcome.md';
  const incomplete = '# incomplete canonical producer\n';
  const complete = '```pidex-review-outcome-v1\n{\n  "schemaVersion": "pidex-review-outcome-v1"\n}\n```\n';
  const markerBearingUnrelated = '# unrelated\n```pidex-review-outcome-v1\n{\n  "schemaVersion": "pidex-review-outcome-v1"\n}\n```\n';
  const taskResult = ({ producerBytes = complete, producerPath = canonicalPath, includeProducer = true, duplicateProducer = false } = {}) => {
    const members = [
      ...(includeProducer ? [{ rule_id: ruleId, path: producerPath, bytes: Buffer.from(producerBytes) }] : []),
      { rule_id: 'pidex-global:pidex-code-reviewer:unrelated', path: 'rules/pidex-code-reviewer/unrelated.md', bytes: Buffer.from(markerBearingUnrelated) },
    ].map((member) => ({ ...member, content_hash: createHash('sha256').update(member.bytes).digest('hex') }));
    const head = createHash('sha256').update(JSON.stringify(members.map(({ rule_id: id, path: memberPath, content_hash }) => ({ id, memberPath, content_hash })))).digest('hex').slice(0, 40);
    materializeVerifiedMirror({ stateRoot, repository: `repo:producer:${head}`, scope_id: null, accepted_head: head, members });
    const active = (member) => ({ rule_id: member.rule_id, version_hash: member.content_hash, content_hash: member.content_hash, mirror_digest: member.content_hash, accepted_commit: head, agent, phases: [phase], lifecycle_state: 'active' });
    const producer = members.find((member) => member.rule_id === ruleId);
    const snapshot = { schema: 'pidex-rule-resolver-snapshot-v1', active_rules: [...(producer ? [active(producer)] : []), ...(duplicateProducer && producer ? [active(producer)] : []), active(members.at(-1))] };
    return renderVerifiedRuntimeRules({ stateRoot, resolverSnapshot: snapshot, agent, phase });
  };
  try {
    const exact = taskResult();
    assert.equal(exact.rendered, `${complete}\n\n${markerBearingUnrelated}`);
    assert.deepEqual(exact.members[0], { rule_id: ruleId, path: canonicalPath, content: complete });
    assert.doesNotThrow(() => validateRequiredReviewerProducer({ agent, phase, resolverSnapshot: { active_rules: [{ rule_id: ruleId, agent, phases: [phase], lifecycle_state: 'active' }] }, rendered: exact }));
    assert.throws(() => validateRequiredReviewerProducer({ agent, phase, resolverSnapshot: { active_rules: [{ rule_id: ruleId, agent, phases: [phase], lifecycle_state: 'active' }] }, rendered: taskResult({ producerBytes: incomplete }) }), /RULE_RUNTIME_MIRROR_MISMATCH/, 'incomplete canonical producer plus unrelated markers rejects');
    for (const bad of [taskResult({ includeProducer: false }), taskResult({ duplicateProducer: true }), taskResult({ producerPath: 'modules/pidex/analysis-metrics-history/rules/not-the-producer.md' })]) assert.throws(() => validateRequiredReviewerProducer({ agent, phase, resolverSnapshot: { active_rules: [{ rule_id: ruleId, agent, phases: [phase], lifecycle_state: 'active' }] }, rendered: bad }), /RULE_RUNTIME_MIRROR_MISMATCH/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('CR-075-05 renders only active exact mirror members applicable to target agent and phase', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-runtime-selection-'));
  try {
    const members = [
      ['pidex-global:pidex-implementer:global', '# global applicable\n', 'rules/pidex-implementer/global.md'],
      ['project:aaaaaaaaaaaaaaaaaaaaaaaa:pidex-implementer:project', '# project applicable\n', 'pidex/rules/managed/pidex-implementer/project.md'],
      ['pidex-global:pidex-reviewer:wrong-agent', '# wrong agent\n', 'rules/pidex-reviewer/wrong-agent.md'],
      ['pidex-global:pidex-implementer:wrong-phase', '# wrong phase\n', 'rules/pidex-implementer/wrong-phase.md'],
      ['pidex-global:pidex-implementer:deactivated', '# deactivated\n', 'rules/pidex-implementer/deactivated.md'],
    ].map(([rule_id, body, memberPath]) => ({ rule_id, body, path: memberPath, content_hash: createHash('sha256').update(body).digest('hex') }));
    materializeVerifiedMirror({ stateRoot, repository: 'repo:runtime-selection', scope_id: null, accepted_head: 'f'.repeat(40), members: members.map(({ rule_id, body, path: memberPath, content_hash }) => ({ rule_id, path: memberPath, content_hash, bytes: Buffer.from(body) })) });
    const active = (member, agent, phases, lifecycle_state = 'active') => ({ rule_id: member.rule_id, version_hash: member.content_hash, content_hash: member.content_hash, accepted_commit: 'f'.repeat(40), mirror_digest: member.content_hash, agent, applicability: [], phases, lifecycle_state });
    const snapshot = { schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: 'snapshot:selection', active_rules: [
      active(members[0], 'pidex-implementer', ['implementation']), active(members[1], 'pidex-implementer', ['implementation']),
      active(members[2], 'pidex-reviewer', ['implementation']), active(members[3], 'pidex-implementer', ['qa']), active(members[4], 'pidex-implementer', ['implementation'], 'deactivated'),
    ] };
    const rendered = renderVerifiedRuntimeRules({ stateRoot, resolverSnapshot: snapshot, agent: 'pidex-implementer', phase: 'implementation' });
    assert.equal(rendered.rendered, '# global applicable\n\n\n# project applicable\n');
    assert.doesNotMatch(rendered.rendered, /wrong agent|wrong phase|deactivated/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('RC02-D exact containing-head proof keeps receipt accepted identity distinct from fetched head', () => {
  const parent = 'a'.repeat(40); const accepted = 'b'.repeat(40); const tree = Buffer.from('tree');
  const ruleId = 'pidex-global:pidex-implementer:quality'; const rulePath = 'rules/pidex-implementer/quality.md'; const indexPath = 'rules/pidex-implementer/index.md'; const member = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${ruleId}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"active"} -->\n# quality\n`);
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'repo:global', scope_id: 'scope:global', rule_id: ruleId, predecessor_commit: parent, accepted_commit: accepted, tree_digest: createHash('sha256').update(tree).digest('hex'), content_hash: createHash('sha256').update(member).digest('hex'), admission_digest: 'e'.repeat(64), transaction_digest: 'f'.repeat(64), lifecycle_state: 'active' };
  const git = (args) => { const command = args.slice(2).join(' '); if (command.startsWith('fetch ')) return ''; if (command === 'remote get-url origin') return 'https://example.invalid/rules.git'; if (command === 'rev-parse refs/remotes/origin/main') return accepted; if (command === `merge-base --is-ancestor ${parent} ${accepted}`) return ''; if (command === `rev-parse ${accepted}^`) return parent; if (command === `rev-list --first-parent ${parent}..${accepted}`) return accepted; if (command === `diff-tree --no-commit-id --name-only -r ${parent} ${accepted}`) return `${rulePath}\n${indexPath}\nconfig/rule-baseline-manifest.json\n`; if (command === `cat-file -p ${accepted}^{tree}`) return tree; if (command === `show ${accepted}:${rulePath}`) return member; if (command === `show ${accepted}:${indexPath}`) return `- [${ruleId}](quality.md)\n`; if (command === 'show ' + accepted + ':config/rule-baseline-manifest.json') return JSON.stringify({ schema: 'pidex-bundled-rule-seed-v1', rules: [{ rule_id: ruleId, path: rulePath, byte_hash: receipt.content_hash }] }); throw new Error(command); };
  const proof = { containing_head: accepted, entries: [{ commit_oid: accepted, parent_oids: [parent], tree_oid: 'c'.repeat(40) }], predecessor_boundary: parent };
  const result = consumeAcceptedRemoteReceipt(receipt, { repository_root: '/fixture', baseline_parent_commit: parent, enrollment: { repository_identity: receipt.repository_identity, scope_id: receipt.scope_id, remote_name: 'origin', remote: 'https://example.invalid/rules.git', branch: 'main', allowed_paths: [rulePath, indexPath, 'config/rule-baseline-manifest.json'] }, publication_proof: proof, git });
  assert.deepEqual({ accepted_commit: result.accepted_commit, containing_head: result.containing_head }, { accepted_commit: accepted, containing_head: accepted });
});

test('F-081-SEC-02 rejects receipts without a closed canonical allowed-path enrollment', () => {
  const parent = 'a'.repeat(40); const accepted = 'b'.repeat(40); const tree = Buffer.from('tree');
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'repo:global', scope_id: 'scope:global', rule_id: 'pidex-global:pidex-implementer:quality', predecessor_commit: parent, accepted_commit: accepted, tree_digest: createHash('sha256').update(tree).digest('hex'), content_hash: 'd'.repeat(64), admission_digest: 'e'.repeat(64), transaction_digest: 'f'.repeat(64), lifecycle_state: 'active' };
  const git = (args) => { const command = args.slice(2).join(' '); if (command.startsWith('fetch ')) return ''; if (command === 'remote get-url origin') return 'https://example.invalid/rules.git'; if (command === 'rev-parse refs/remotes/origin/main') return accepted; if (command === `merge-base --is-ancestor ${parent} ${accepted}`) return ''; if (command === `rev-parse ${accepted}^`) return parent; if (command === `rev-list --first-parent ${parent}..${accepted}`) return accepted; if (command === `diff-tree --no-commit-id --name-only -r ${parent} ${accepted}`) return 'rules/pidex-implementer/quality.md'; if (command === `cat-file -p ${accepted}^{tree}`) return tree; if (command === `show ${accepted}:config/rule-baseline-manifest.json`) return '{}'; throw new Error(command); };
  assert.throws(() => consumeAcceptedRemoteReceipt(receipt, { repository_root: '/fixture', baseline_parent_commit: parent, enrollment: { repository_identity: receipt.repository_identity, scope_id: receipt.scope_id, remote_name: 'origin', remote: 'https://example.invalid/rules.git', branch: 'main' }, git }), /RULE_ACCEPTED_RECEIPT_MISMATCH/);
});

test('F-081-SEC-03 rejects a symlinked state-root quality parent before mirror write', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-link-')); const outside = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-outside-'));
  try {
    symlinkSync(outside, path.join(stateRoot, 'quality'));
    assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: 'repo:global', scope_id: null, accepted_head: 'a'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes } }), /RULE_MIRROR_STATE_PATH_INVALID/);
    assert.deepEqual(readdirSync(outside), []);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('S3 binds finite FS-1..9 checkpoints and returns non-attested when durability unsupported', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-checkpoints-'));
  try {
    const checkpoints = [];
    const result = materializeVerifiedMirror({ stateRoot, repository: 'repo:checkpoints', scope_id: null, accepted_head: 'a'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes }, checkpoint: (name, phase) => checkpoints.push(`${phase}:${name}`) });
    assert.equal(result.status, 'verified');
    assert.deepEqual([...new Set(checkpoints.map((entry) => entry.split(':').slice(1).join(':')))], ['create-stage', 'create-parent', 'open/write-member', 'file-fsync', 'manifest-write/fsync', 'stage-directory-fsync', 'rename', 'mirror-verify-read', 'parent-fsync']);
    const unsupported = materializeVerifiedMirror({ stateRoot: mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-unsupported-')), repository: 'repo:unsupported', scope_id: null, accepted_head: 'b'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes }, durabilitySupported: false });
    assert.equal(unsupported.status, 'non_attested');
    const unsupportedSync = materializeVerifiedMirror({ stateRoot: mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-unsupported-sync-')), repository: 'repo:unsupported-sync', scope_id: null, accepted_head: 'c'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes }, platform: 'linux', durabilitySync: () => { const error = new Error('unsupported'); error.code = 'EINVAL'; throw error; } });
    assert.equal(unsupportedSync.status, 'non_attested');
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('F-086-SEC-03 rejects deterministic stage swaps at every FS-1..9 hook without attesting', () => {
  const names = ['create-stage', 'create-parent', 'open/write-member', 'file-fsync', 'manifest-write/fsync', 'stage-directory-fsync', 'rename', 'mirror-verify-read', 'parent-fsync'];
  for (const phase of ['pre', 'post']) for (const name of names) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-sec086-')); const outside = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-sec086-outside-'));
    try {
      let swapped = false;
      assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: `repo:sec086:${phase}:${name}`, scope_id: null, accepted_head: 'c'.repeat(40), member: { rule_id: 'pidex-global:pidex-security:security', path: 'rules/pidex-security/security.md', content_hash: byteHash, bytes }, checkpoint: (seen, seenPhase, chain) => {
        if (!swapped && seen === name && seenPhase === phase) {
          if (existsSync(chain.stage)) renameSync(chain.stage, `${chain.stage}.held`);
          symlinkSync(outside, chain.stage); swapped = true;
        }
      } }), /RULE_MIRROR_STATE_PATH_INVALID|RULE_MIRROR_GENERATION_COLLISION/);
      assert.equal(swapped, true, `${phase}:${name} hook must expose stage identity`);
      if (phase === 'pre') assert.deepEqual(readdirSync(outside), [], `${name} pre-hook must not write outside`);
    } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  }
});

test('F-087-SEC-03 rejects published member-parent substitutions at every post-publication checkpoint', () => {
  const hooks = [['rename', 'post'], ['mirror-verify-read', 'pre'], ['mirror-verify-read', 'post'], ['parent-fsync', 'pre'], ['parent-fsync', 'post']];
  for (const [name, phase] of hooks) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-sec087-')); const outside = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-sec087-outside-'));
    try {
      let swapped = false;
      assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: `repo:sec087:${phase}:${name}`, scope_id: null, accepted_head: 'd'.repeat(40), member: { rule_id: 'pidex-global:pidex-security:security', path: 'rules/pidex-security/security.md', content_hash: byteHash, bytes }, checkpoint: (seen, seenPhase, chain) => {
        if (!swapped && seen === name && seenPhase === phase) {
          const publishedParent = path.join(chain.root, 'rules', 'pidex-security');
          mkdirSync(outside, { recursive: true }); writeFileSync(path.join(outside, 'security.md'), bytes);
          renameSync(publishedParent, `${publishedParent}.held`); symlinkSync(outside, publishedParent); swapped = true;
        }
      } }), /RULE_MIRROR_STATE_PATH_INVALID|RULE_MIRROR_GENERATION_COLLISION/);
      assert.equal(swapped, true, `${phase}:${name} must expose published member parent`);
    } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  }
});

test('SEC45-02 rejects hash mismatch without materializing unverified bytes', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-mirror-'));
  try {
    assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: 'repo:global', scope_id: null, accepted_head: 'a'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: hash('a'), bytes } }), /RULE_MIRROR_DIGEST_MISMATCH/);
    assert.equal(existsSync(path.join(stateRoot, 'quality/rule-lifecycle/mirrors')), false);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

function rc02VerifierFixture(descendants = 0) {
  const oid = (number) => number.toString(16).padStart(40, '0');
  const parent = oid(1); const accepted = oid(2); const heads = Array.from({ length: descendants }, (_, index) => oid(index + 3));
  const managed = {
    'config/rule-baseline-manifest.json': { blob_oid: oid(101), content_hash: 'a'.repeat(64) },
    'rules/pidex-implementer/index.md': { blob_oid: oid(102), content_hash: 'b'.repeat(64) },
    'rules/pidex-implementer/quality.md': { blob_oid: oid(103), content_hash: 'c'.repeat(64) },
  };
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'd'.repeat(64), scope_id: 'pidex-global', rule_id: 'pidex-global:pidex-implementer:quality', predecessor_commit: parent, accepted_commit: accepted, tree_digest: 'e'.repeat(64), content_hash: managed['rules/pidex-implementer/quality.md'].content_hash, admission_digest: 'f'.repeat(64), transaction_digest: '1'.repeat(64), lifecycle_state: 'active' };
  const enrollment = { repository_identity: receipt.repository_identity, normalized_remote_digest: '2'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', allowed_paths: Object.keys(managed).sort() };
  const durable = { predecessor_commit: parent, accepted_commit: accepted, tree_digest: receipt.tree_digest, staged_member_digests: Object.fromEntries(Object.entries(managed).map(([memberPath, fact]) => [memberPath, fact.content_hash])), admission_digest: receipt.admission_digest, transaction_digest: receipt.transaction_digest, rule_id: receipt.rule_id, tier: 'global' };
  const ordered = [...heads].reverse().concat(accepted);
  const entries = ordered.map((commit_oid, index) => ({ commit_oid, parent_oids: [index + 1 < ordered.length ? ordered[index + 1] : parent], tree_oid: oid(index + 201) }));
  const inspections = new Map(entries.map((entry, index) => [entry.commit_oid, index === entries.length - 1 ? { ...entry, author: enrollment.author, subject: `rules(global): publish ${receipt.rule_id}`, trailers: { 'PIDEX-Rule-ID': receipt.rule_id, 'PIDEX-Transaction-Digest': receipt.transaction_digest, 'PIDEX-Admission-Digest': receipt.admission_digest, 'PIDEX-Predecessor': `commit:${parent}` }, managed_members: managed } : { ...entry, managed_members: managed }]));
  const containing_tree_bytes = Buffer.from(`canonical-tree:${entries[0].tree_oid}`); const containing_tree_digest = createHash('sha256').update(containing_tree_bytes).digest('hex');
  const fresh = { repository_identity: enrollment.repository_identity, normalized_remote_digest: enrollment.normalized_remote_digest, branch: enrollment.branch, containing_head: ordered[0], containing_tree_bytes, containing_tree_digest, entries, predecessor_boundary: parent };
  return { receipt, enrollment, durable, fresh, inspect: (commit) => inspections.get(commit), replaceInspection: (commit, patch) => inspections.set(commit, { ...inspections.get(commit), ...patch }) };
}

test('RC02-D verifier accepts exact head through 64 descendants and returns separate immutable safe identities', () => {
  for (const descendants of [0, 1, 64]) {
    const fixture = rc02VerifierFixture(descendants);
    const result = verifyAcceptedRemoteDescendantProof({ receipt: fixture.receipt, enrollment: fixture.enrollment, durable: fixture.durable, adapter: { fetchEnrolledBranch: () => fixture.fresh, inspectCommit: fixture.inspect } });
    assert.deepEqual(result, { accepted_commit: fixture.receipt.accepted_commit, containing_head: fixture.fresh.containing_head, containing_tree_digest: fixture.fresh.containing_tree_digest });
    assert.equal(Object.isFrozen(result), true);
  }
});

test('RC02-D verifier fails closed for VT01-06 topology, enrollment, managed-member, and accepted metadata variants', () => {
  const rejects = (mutate) => { const fixture = rc02VerifierFixture(2); mutate(fixture); assert.throws(() => verifyAcceptedRemoteDescendantProof({ receipt: fixture.receipt, enrollment: fixture.enrollment, durable: fixture.durable, adapter: { fetchEnrolledBranch: () => fixture.fresh, inspectCommit: fixture.inspect } }), /RULE_ACCEPTED_RECEIPT_MISMATCH/); };
  // VT01/02: exact boundary, 65th transition, and truncation fail.
  rejects((f) => { f.fresh.entries.pop(); });
  assert.throws(() => { const f = rc02VerifierFixture(65); return verifyAcceptedRemoteDescendantProof({ receipt: f.receipt, enrollment: f.enrollment, durable: f.durable, adapter: { fetchEnrolledBranch: () => f.fresh, inspectCommit: f.inspect } }); }, /RULE_ACCEPTED_RECEIPT_MISMATCH/);
  // VT03: merge, gap, repeat/cycle, non-lowercase OID, and extra keys fail closed.
  for (const mutate of [
    (f) => { f.fresh.entries[0].parent_oids.push('0'.repeat(40)); },
    (f) => { f.fresh.entries[0].parent_oids[0] = '0'.repeat(40); },
    (f) => { f.fresh.entries[1].commit_oid = f.fresh.entries[0].commit_oid; },
    (f) => { f.fresh.entries[0].tree_oid = 'A'.repeat(40); },
    (f) => { f.fresh.entries[0].extra = true; },
  ]) rejects(mutate);
  // VT04: redirect/repository/branch/stale fetched head fail before graph use.
  for (const mutate of [
    (f) => { f.fresh.normalized_remote_digest = '3'.repeat(64); },
    (f) => { f.fresh.repository_identity = '4'.repeat(64); },
    (f) => { f.fresh.branch = 'refs/heads/other'; },
    (f) => { f.fresh.containing_head = '0'.repeat(40); },
  ]) rejects(mutate);
  // VT05: every managed path rejects remove/alias/blob/hash/change-restore variants.
  for (const memberPath of Object.keys(rc02VerifierFixture().durable.staged_member_digests)) for (const mutate of [
    (f) => { const current = f.inspect(f.fresh.containing_head); const { [memberPath]: _, ...managed_members } = current.managed_members; f.replaceInspection(f.fresh.containing_head, { managed_members }); },
    (f) => { const current = f.inspect(f.fresh.containing_head); const managed_members = { ...current.managed_members, 'rules/pidex-implementer/renamed.md': current.managed_members[memberPath] }; delete managed_members[memberPath]; f.replaceInspection(f.fresh.containing_head, { managed_members }); },
    (f) => { const current = f.inspect(f.fresh.containing_head); f.replaceInspection(f.fresh.containing_head, { managed_members: { ...current.managed_members, [memberPath]: { ...current.managed_members[memberPath], blob_oid: '9'.repeat(40) } } }); },
    (f) => { f.durable.staged_member_digests[memberPath] = '9'.repeat(64); },
    (f) => { const middle = f.fresh.entries[1].commit_oid; const current = f.inspect(middle); f.replaceInspection(middle, { managed_members: { ...current.managed_members, [memberPath]: { ...current.managed_members[memberPath], content_hash: '9'.repeat(64) } } }); },
  ]) rejects(mutate);
  // VT06: accepted parent/tree/member/author/subject/trailers/admission/transaction mismatch fail.
  for (const mutate of [
    (f) => f.replaceInspection(f.receipt.accepted_commit, { parent_oids: ['9'.repeat(40)] }),
    (f) => f.replaceInspection(f.receipt.accepted_commit, { tree_oid: '9'.repeat(40) }),
    (f) => { const current = f.inspect(f.receipt.accepted_commit); f.replaceInspection(f.receipt.accepted_commit, { managed_members: { ...current.managed_members, 'rules/pidex-implementer/quality.md': { ...current.managed_members['rules/pidex-implementer/quality.md'], content_hash: '9'.repeat(64) } } }); },
    (f) => f.replaceInspection(f.receipt.accepted_commit, { author: 'Other <other@example.invalid>' }),
    (f) => f.replaceInspection(f.receipt.accepted_commit, { subject: 'different' }),
    (f) => f.replaceInspection(f.receipt.accepted_commit, { trailers: {} }),
    (f) => { f.durable.admission_digest = '9'.repeat(64); },
    (f) => { f.durable.transaction_digest = '9'.repeat(64); },
  ]) rejects(mutate);
});

test('PLAN047 B1 synthetic Windows checkpoint simulation rejects reparse/identity drift; supported and unsupported lanes stay truthful', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-b1-synthetic-windows-')); const unsupportedRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-b1-synthetic-windows-unsupported-')); const outside = mkdtempSync(path.join(os.tmpdir(), 'pidex-b1-synthetic-windows-outside-'));
  const member = { rule_id: 'pidex-global:pidex-implementer:quality', path: 'rules/pidex-implementer/quality.md', content_hash: byteHash, bytes };
  try {
    const supported = materializeVerifiedMirror({ stateRoot, repository: 'repo:synthetic-windows-supported', scope_id: null, accepted_head: 'a'.repeat(40), member, checkpoint: (_name, _phase, chain) => { assert.equal(chain.root.includes('mirrors'), true); } });
    assert.equal(supported.status, 'verified');
    const unsupported = materializeVerifiedMirror({ stateRoot: unsupportedRoot, repository: 'repo:synthetic-windows-unsupported', scope_id: null, accepted_head: 'b'.repeat(40), member, durabilitySupported: false }); assert.deepEqual(unsupported, { status: 'non_attested', reason_code: 'RULE_MIRROR_DURABILITY_UNSUPPORTED' });
    let injected = false;
    assert.throws(() => materializeVerifiedMirror({ stateRoot, repository: 'repo:synthetic-windows-reparse', scope_id: null, accepted_head: 'c'.repeat(40), member, checkpoint: (name, phase, chain) => {
      if (!injected && name === 'rename' && phase === 'post') { const parent = path.join(chain.root, 'rules', 'pidex-implementer'); renameSync(parent, `${parent}.identity-changed`); symlinkSync(outside, parent); injected = true; }
    } }), /RULE_MIRROR_STATE_PATH_INVALID|RULE_MIRROR_GENERATION_COLLISION/);
    assert.equal(injected, true, 'synthetic reparse/file-identity change reached post-publish checkpoint');
  } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(unsupportedRoot, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
