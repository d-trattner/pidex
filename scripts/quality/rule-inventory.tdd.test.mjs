import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reconcileRuleInventory } from './rule-inventory.mjs';
import { createRuleDescriptor } from './rule-identity.mjs';

function tempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), 'pidex-rule-inventory-'));
}

function write(root, relativePath, content) {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function seedCompleteInventory(root) {
  write(root, 'agents/pidex-alpha.md', '# Alpha\n\nalpha behavior\n');
  write(root, 'agents/pidex-beta.md', '# Beta\n\nbeta behavior\n');
  write(root, 'rules/pidex-implementer/index.md', '# Index\n\nindex behavior\n');
  write(root, 'rules/pidex-implementer/check.md', '# Check\n\ncheck behavior\n');
  write(root, 'pidex/rules/project.md', '# Project\n\nproject behavior\n');
  write(root, 'modules/pidex/sample/rules/alpha.md', '# Module alpha\n\nmodule alpha\n');
  write(root, 'modules/pidex/sample/rules/beta.md', '# Module beta\n\nmodule beta\n');
  write(root, 'modules/pidex/sample/module.json', JSON.stringify({
    id: 'pidex.sample',
    agent_rules: [
      { id: 'pidex.sample.alpha', path: 'rules/alpha.md' },
      { id: 'pidex.sample.beta', path: 'rules/beta.md' },
    ],
  }, null, 2));
}

function reconcile(root) {
  return reconcileRuleInventory({
    root,
    projectRoot: root,
    projectScopeId: 'a'.repeat(24),
    gitTrackedPaths: [
      'agents/pidex-alpha.md',
      'agents/pidex-beta.md',
      'rules/pidex-implementer/index.md',
      'rules/pidex-implementer/check.md',
      'pidex/rules/project.md',
      'modules/pidex/sample/module.json',
      'modules/pidex/sample/rules/alpha.md',
      'modules/pidex/sample/rules/beta.md',
    ],
  });
}

test('CI-49-V1 reconciles canonical and module sources exactly once with active/unmanaged defaults and byte-stable revision', () => {
  const root = tempRoot();
  try {
    seedCompleteInventory(root);
    const sourceBytes = new Map([
      ['agents/pidex-alpha.md', readFileSync(path.join(root, 'agents/pidex-alpha.md'))],
      ['rules/pidex-implementer/index.md', readFileSync(path.join(root, 'rules/pidex-implementer/index.md'))],
    ]);
    const first = reconcile(root);
    const second = reconcile(root);

    assert.equal(first.complete, true);
    assert.equal(first.entries.length, 7);
    assert.deepEqual(first.entries.map((entry) => entry.rule_id), [...first.entries.map((entry) => entry.rule_id)].sort());
    assert.ok(first.entries.every((entry) => entry.lifecycle_state === 'active' && entry.provenance === 'legacy_adapter' && entry.capabilities.length === 0));
    assert.equal(first.reconciliation_revision, second.reconciliation_revision);
    assert.deepEqual(first, second);
    for (const [relativePath, bytes] of sourceBytes) assert.deepEqual(readFileSync(path.join(root, relativePath)), bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CR-073-05 discovers managed project namespace only through verified mirror descriptor adapter', () => {
  const root = tempRoot();
  try {
    const scope = 'a'.repeat(24);
    const verifiedBytes = '# Verified managed rule\n'; const verifiedHash = createHash('sha256').update(verifiedBytes).digest('hex');
    const descriptor = createRuleDescriptor({
      rule_id: `project:${scope}:pidex-implementer:quality`, legacy_aliases: [], tier: 'project', scope_id: scope, agent: 'pidex-implementer', slug: 'quality', owner: 'repo:project', applicability: [], protection_class: 'none', action_policy: 'automatic', lifecycle_state: 'active', content_hash: verifiedHash,
      provenance_digest: 'c'.repeat(64), admission_policy_version: 'v1', admission_digest: 'd'.repeat(64), transaction_digest: 'e'.repeat(64), predecessor_commit: 'a'.repeat(40), accepted_commit: 'b'.repeat(40), source_kind: 'managed_project', rule_version: verifiedHash, project_override_policy: 'forbidden', overrides_rule_id: null,
    });
    write(root, 'pidex/rules/managed/pidex-implementer/quality.md', '# Mutable source must not win\n');
    const result = reconcileRuleInventory({
      root,
      projectRoot: root,
      gitTrackedPaths: [],
      managedMirror: {
        status: 'verified', repository_identity: 'repo:project', scope_id: scope, accepted_commit: 'b'.repeat(40),
        members: [{ path: 'pidex/rules/managed/pidex-implementer/quality.md', bytes: verifiedBytes, descriptor }],
      },
    });
    assert.equal(result.complete, true);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].rule_id, `project:${scope}:pidex-implementer:quality`);
    assert.equal(result.entries[0].source_kind, 'managed_project');
    assert.equal(result.entries[0].provenance, 'verified_mirror');
    assert.equal(result.entries[0].bytes, verifiedBytes);
    assert.equal(result.entries[0].descriptor.schema, 'pidex-rule-descriptor-v1');
    assert.equal(result.entries[0].descriptor.legacy_aliases.includes('rule:project:pidex/rules/managed/pidex-implementer/quality'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CR-075-03 admits exact managed-global mirror and rejects global/project tier, path, and scope substitution', () => {
  const root = tempRoot();
  try {
    const content = '# Exact global managed bytes\n'; const contentHash = createHash('sha256').update(content).digest('hex');
    const descriptor = createRuleDescriptor({
      rule_id: 'pidex-global:pidex-implementer:quality', legacy_aliases: [], tier: 'global', scope_id: null, agent: 'pidex-implementer', slug: 'quality', owner: 'repo:global', applicability: [], protection_class: 'none', action_policy: 'automatic', lifecycle_state: 'active', content_hash: contentHash,
      provenance_digest: 'c'.repeat(64), admission_policy_version: 'v1', admission_digest: 'd'.repeat(64), transaction_digest: 'e'.repeat(64), predecessor_commit: 'a'.repeat(40), accepted_commit: 'b'.repeat(40), source_kind: 'managed_global', rule_version: contentHash, project_override_policy: 'forbidden', overrides_rule_id: null,
    });
    const mirror = { status: 'verified', repository_identity: 'repo:global', scope_id: null, accepted_commit: 'b'.repeat(40), members: [{ path: 'rules/pidex-implementer/quality.md', bytes: content, descriptor }] };
    const result = reconcileRuleInventory({ root, projectRoot: root, gitTrackedPaths: [], managedMirror: mirror });
    assert.equal(result.complete, true); assert.equal(result.entries[0].source_kind, 'managed_global'); assert.deepEqual(result.entries[0].descriptor, descriptor);
    for (const bad of [{ ...mirror, scope_id: 'a'.repeat(24) }, { ...mirror, members: [{ ...mirror.members[0], path: 'pidex/rules/managed/pidex-implementer/quality.md' }] }, { ...mirror, members: [{ ...mirror.members[0], descriptor: { ...descriptor, source_kind: 'managed_project' } }] }]) {
      const rejected = reconcileRuleInventory({ root, projectRoot: root, gitTrackedPaths: [], managedMirror: bad });
      assert.equal(rejected.complete, false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CR-074-04 preserves exact mirror descriptor authority and canonicalizes legacy IDs as aliases only', () => {
  const root = tempRoot();
  try {
    const scope = 'a'.repeat(24); const content = '# Exact managed bytes\n'; const contentHash = createHash('sha256').update(content).digest('hex');
    write(root, 'agents/pidex-alpha.md', '# Legacy alpha\n');
    const descriptor = createRuleDescriptor({
      rule_id: `project:${scope}:pidex-implementer:quality`, legacy_aliases: ['rule:project:pidex/rules/managed/pidex-implementer/quality'], tier: 'project', scope_id: scope,
      agent: 'pidex-implementer', slug: 'quality', owner: 'repo:project', applicability: ['implementation'], protection_class: 'none', action_policy: 'automatic', lifecycle_state: 'deactivated',
      content_hash: contentHash, provenance_digest: 'c'.repeat(64), admission_policy_version: 'v9', admission_digest: 'd'.repeat(64), transaction_digest: 'e'.repeat(64),
      predecessor_commit: 'f'.repeat(40), accepted_commit: '1'.repeat(40), source_kind: 'managed_project', rule_version: contentHash, project_override_policy: 'forbidden', overrides_rule_id: null,
    });
    const result = reconcileRuleInventory({
      root, projectRoot: root, gitTrackedPaths: ['agents/pidex-alpha.md'],
      managedMirror: { status: 'verified', repository_identity: 'repo:project', scope_id: scope, accepted_commit: '1'.repeat(40), members: [{ path: 'pidex/rules/managed/pidex-implementer/quality.md', bytes: content, descriptor }] },
    });
    const managed = result.entries.find((entry) => entry.rule_id === descriptor.rule_id);
    assert.deepEqual(managed.descriptor, descriptor, 'mirror descriptor bytes, policy, lifecycle, predecessor, and digests stay authoritative');
    const legacy = result.entries.find((entry) => entry.source === 'agents/pidex-alpha.md');
    assert.equal(legacy.rule_id, 'pidex-global:pidex-alpha:legacy-aggregate');
    assert.deepEqual(legacy.descriptor.legacy_aliases, ['rule:agent:pidex-alpha']);
    assert.equal(legacy.descriptor.protection_class, 'legacy_baseline');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CR-076-04 preserves real module agent, phases, and applicability routing metadata', () => {
  const root = tempRoot();
  try {
    write(root, 'modules/pidex/reviewer/rules/outcome.md', '# outcome producer\n');
    write(root, 'modules/pidex/reviewer/module.json', JSON.stringify({ id: 'pidex.reviewer', agent_rules: [{ id: 'pidex.reviewer.outcome', agent: 'pidex-code-reviewer', phases: ['code-review'], applies_when: ['project-pipeline'], path: 'rules/outcome.md' }] }));
    const result = reconcileRuleInventory({ root, projectRoot: root, gitTrackedPaths: ['modules/pidex/reviewer/module.json', 'modules/pidex/reviewer/rules/outcome.md'] });
    assert.equal(result.complete, true);
    assert.deepEqual(result.entries[0].agent, 'pidex-code-reviewer');
    assert.deepEqual(result.entries[0].phases, ['code-review']);
    assert.deepEqual(result.entries[0].applicability, ['project-pipeline']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// CR-078-01: untracked admitted rule candidates now deny Git authority; only non-authority output may be ignored.
test('CR-078-01 rejects untracked project rule candidates before inventory attestation', () => {
  const root = tempRoot(); const project = tempRoot();
  try {
    write(project, 'pidex/rules/tracked.md', '# tracked HEAD bytes\n');
    for (const args of [['init'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Test'], ['add', '-A'], ['commit', '-m', 'fixture']]) execFileSync('git', ['-C', project, ...args]);
    write(project, 'pidex/rules/untracked.md', '# untracked mutable bytes\n');
    const result = reconcileRuleInventory({ root, projectRoot: project, projectScopeId: 'a'.repeat(24), gitTrackedPaths: ['pidex/rules/tracked.md'], immutableAuthority: true });
    assert.equal(result.complete, false);
    assert.ok(result.diagnostics.some((item) => item.code === 'source_unavailable'));
    assert.equal(result.entries.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('CR-078-01 fails closed when exact Git authority status is dirty or drifts in admitted paths', () => {
  const root = tempRoot(); const project = tempRoot();
  const tracked = 'pidex/rules/tracked.md';
  const initialize = () => {
    write(project, tracked, '# clean HEAD bytes\n');
    for (const args of [['init'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Test'], ['add', '-A'], ['commit', '-m', 'fixture']]) execFileSync('git', ['-C', project, ...args]);
  };
  const inventory = (operationHook) => reconcileRuleInventory({ root, projectRoot: project, projectScopeId: 'a'.repeat(24), gitTrackedPaths: [tracked], immutableAuthority: true, operationHook });
  try {
    initialize();
    assert.equal(inventory().complete, true, 'clean exact HEAD object remains attestable');
    for (const [name, mutate] of [
      ['worktree modification', () => write(project, tracked, '# mutable worktree bytes\n')],
      ['staged modification', () => { write(project, tracked, '# staged mutable bytes\n'); execFileSync('git', ['-C', project, 'add', tracked]); }],
      ['tracked deletion', () => execFileSync('git', ['-C', project, 'rm', tracked])],
      ['tracked rename', () => execFileSync('git', ['-C', project, 'mv', tracked, 'pidex/rules/renamed.md'])],
      ['untracked rule candidate', () => write(project, 'pidex/rules/untracked-$()[];.md', '# untracked rule\n')],
    ]) {
      execFileSync('git', ['-C', project, 'reset', '--hard', 'HEAD']); execFileSync('git', ['-C', project, 'clean', '-fd']);
      mutate();
      const result = inventory();
      assert.equal(result.complete, false, name);
      assert.ok(result.diagnostics.some((item) => ['source_unavailable', 'tracked_source_missing'].includes(item.code)), `${name}: ${JSON.stringify(result.diagnostics)}`);
    }
    execFileSync('git', ['-C', project, 'reset', '--hard', 'HEAD']); execFileSync('git', ['-C', project, 'clean', '-fd']);
    write(project, 'dist/ignored-output.txt', 'unrelated output');
    assert.equal(inventory().complete, true, 'explicitly unrelated untracked output does not block authority');
    const drifted = inventory(({ phase }) => { if (phase === 'before-git-object-read') write(project, 'pidex/rules/status-drift.md', '# drift\n'); });
    assert.equal(drifted.complete, false);
    assert.ok(drifted.diagnostics.some((item) => item.code === 'source_unavailable'));
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('CR-079-02 recursively rejects dirty authority candidates while unrelated output remains allowed', () => {
  const root = tempRoot(); const project = tempRoot();
  const tracked = 'pidex/rules/tracked.md';
  const inventory = () => reconcileRuleInventory({ root, projectRoot: project, projectScopeId: 'a'.repeat(24), gitTrackedPaths: [tracked], immutableAuthority: true });
  try {
    write(project, tracked, '# tracked HEAD bytes\n'); write(project, 'notes/source.md', '# rename source\n');
    for (const args of [['init'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Test'], ['add', '-A'], ['commit', '-m', 'fixture']]) execFileSync('git', ['-C', project, ...args]);
    for (const [name, mutate] of [
      ['nested project rule', () => write(project, 'pidex/rules/nested/deeper/untracked-$()[];.md', '# untracked\n')],
      ['nested module authority rule', () => write(project, 'modules/pidex/sample/rules/nested/deeper/untracked.md', '# untracked\n')],
      ['rename into project authority', () => { mkdirSync(path.join(project, 'pidex/rules/nested'), { recursive: true }); execFileSync('git', ['-C', project, 'mv', 'notes/source.md', 'pidex/rules/nested/renamed.md']); }],
    ]) {
      execFileSync('git', ['-C', project, 'reset', '--hard', 'HEAD']); execFileSync('git', ['-C', project, 'clean', '-fd']);
      mutate(); const result = inventory();
      assert.equal(result.complete, false, name);
      assert.ok(result.diagnostics.some((item) => item.code === 'source_unavailable'), `${name}: ${JSON.stringify(result.diagnostics)}`);
    }
    execFileSync('git', ['-C', project, 'reset', '--hard', 'HEAD']); execFileSync('git', ['-C', project, 'clean', '-fd']);
    write(project, 'agents.output/generated/status.md', '# unrelated generated output\n');
    assert.equal(inventory().complete, true);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('CR-076-02 rejects Git authority when HEAD moves between inventory identity and object read', () => {
  const root = tempRoot(); const project = tempRoot();
  try {
    write(project, 'pidex/rules/tracked.md', '# tracked HEAD bytes\n');
    for (const args of [['init'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'Test'], ['add', '-A'], ['commit', '-m', 'fixture']]) execFileSync('git', ['-C', project, ...args]);
    let moved = false;
    const result = reconcileRuleInventory({ root, projectRoot: project, projectScopeId: 'a'.repeat(24), gitTrackedPaths: ['pidex/rules/tracked.md'], immutableAuthority: true, operationHook: ({ phase }) => {
      if (!moved && phase === 'before-git-object-read') { moved = true; write(project, 'pidex/rules/tracked.md', '# moved HEAD bytes\n'); execFileSync('git', ['-C', project, 'add', '-A']); execFileSync('git', ['-C', project, 'commit', '-m', 'moved']); }
    } });
    assert.equal(result.complete, false);
    assert.ok(result.diagnostics.some((item) => item.code === 'source_head_moved'));
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('CI-49-V1 reconciles Git-index candidates in both directions before declaring a complete inventory', () => {
  const root = tempRoot();
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const result = reconcileRuleInventory({
      root,
      projectRoot: root,
      gitTrackedPaths: ['agents/pidex-beta.md'],
    });

    assert.equal(result.complete, false);
    assert.ok(result.diagnostics.some((item) => item.code === 'untracked_source' && item.path === 'agents/pidex-alpha.md'));
    assert.ok(result.diagnostics.some((item) => item.code === 'tracked_source_missing' && item.path === 'agents/pidex-beta.md'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CI-49-V1 fails closed with indexed typed diagnostics for missing, orphan, duplicate, conflict, unknown, and path-escape inventory items', () => {
  const cases = [
    ['missing-source', (root) => write(root, 'modules/pidex/sample/module.json', JSON.stringify({ id: 'pidex.sample', agent_rules: [{ id: 'pidex.sample.alpha', path: 'rules/missing.md' }] })), 'module_rule_missing'],
    ['orphan-module-rule', (root) => write(root, 'modules/pidex/sample/rules/orphan.md', '# Orphan\n'), 'module_rule_orphan'],
    ['duplicate-id', (root) => write(root, 'modules/pidex/other/rules/alpha.md', '# Other\n'), 'duplicate_rule_id'],
    ['conflicting-provenance', (root) => write(root, 'rules/pidex-alpha/legacy-aggregate.md', '# Override\n\ndifferent behavior\n'), 'conflicting_provenance'],
    ['unknown-item-key', (root) => write(root, 'modules/pidex/sample/module.json', JSON.stringify({ id: 'pidex.sample', agent_rules: [{ id: 'pidex.sample.alpha', path: 'rules/alpha.md', unexpected: true }, { id: 'pidex.sample.beta', path: 'rules/beta.md' }] })), 'unknown_item_key'],
    ['path-escape', (root) => write(root, 'modules/pidex/sample/module.json', JSON.stringify({ id: 'pidex.sample', agent_rules: [{ id: 'pidex.sample.alpha', path: '../outside.md' }] })), 'path_escape'],
  ];
  for (const [name, mutate, code] of cases) {
    const root = tempRoot();
    try {
      seedCompleteInventory(root);
      mutate(root);
      if (name === 'duplicate-id') write(root, 'modules/pidex/other/module.json', JSON.stringify({ id: 'pidex.other', agent_rules: [{ id: 'pidex.sample.alpha', path: 'rules/alpha.md' }] }));
      const result = reconcile(root);
      assert.equal(result.complete, false, name);
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === code), `${name}: ${JSON.stringify(result.diagnostics)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('rejects Windows absolute/reserved declarations and noncanonical tracked path casing', () => {
  const root = tempRoot();
  try {
    seedCompleteInventory(root);
    write(root, 'modules/pidex/sample/module.json', JSON.stringify({ id: 'pidex.sample', agent_rules: [
      { id: 'pidex.sample.absolute', path: 'C:\\outside\\rule.md' },
      { id: 'pidex.sample.reserved', path: 'rules/CON.md' },
    ] }));
    const result = reconcileRuleInventory({ root, projectRoot: root, gitTrackedPaths: ['Rules/unsafe.md', 'modules/pidex/sample/module.json'] });
    assert.equal(result.complete, false);
    assert.ok(result.diagnostics.some((item) => item.code === 'path_escape'));
    assert.ok(result.diagnostics.some((item) => item.code === 'noncanonical_case'));
    assert.doesNotMatch(JSON.stringify(result.diagnostics), /^[A-Za-z]:\\/m);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('post-hook identity revalidation rejects a source swapped to a symlink before read', () => {
  const root = tempRoot();
  try {
    seedCompleteInventory(root); write(root, 'outside.md', '# SECRET_OUTSIDE\n'); let swapped = false;
    const target = path.join(root, 'agents/pidex-alpha.md');
    const result = reconcileRuleInventory({ root, projectRoot: root, gitTrackedPaths: [
      'agents/pidex-alpha.md', 'agents/pidex-beta.md', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/check.md', 'pidex/rules/project.md', 'modules/pidex/sample/module.json', 'modules/pidex/sample/rules/alpha.md', 'modules/pidex/sample/rules/beta.md',
    ], operationHook: ({ phase, file }) => { if (!swapped && phase === 'before-source-read' && file === target) { swapped = true; rmSync(target); symlinkSync(path.join(root, 'outside.md'), target); } } });
    assert.equal(result.complete, false); assert.ok(result.diagnostics.some((item) => item.code === 'source_identity_changed' && item.path === 'agents/pidex-alpha.md'));
    assert.doesNotMatch(JSON.stringify(result), /SECRET_OUTSIDE/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CI-49-V1 rejects symlink escapes and validates invalid candidates after valid entries instead of silently publishing a complete revision', () => {
  const root = tempRoot();
  try {
    seedCompleteInventory(root);
    write(root, 'outside.md', '# Outside\n');
    symlinkSync(path.join(root, 'outside.md'), path.join(root, 'modules/pidex/sample/rules/escape.md'));
    const result = reconcile(root);
    assert.equal(result.complete, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'path_escape'));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.path.endsWith('escape.md')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
