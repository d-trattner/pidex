import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { reconcileRuleInventory } from './rule-inventory.mjs';

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
    assert.ok(first.entries.every((entry) => entry.lifecycle_state === 'active' && entry.provenance === 'unmanaged' && entry.capabilities.length === 0));
    assert.equal(first.reconciliation_revision, second.reconciliation_revision);
    assert.deepEqual(first, second);
    for (const [relativePath, bytes] of sourceBytes) assert.deepEqual(readFileSync(path.join(root, relativePath)), bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    ['conflicting-provenance', (root) => write(root, 'pidex/rules/pidex-alpha.md', '# Override\n\ndifferent behavior\n'), 'conflicting_provenance'],
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
