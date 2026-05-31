import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function read(relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

test('install.sh uses fixed git-hook capability ids instead of direct hook script path', () => {
  const text = read('install.sh');
  assert.match(text, /run_module_capability\s+git-security-hooks\.install-dry-run/);
  assert.match(text, /run_module_capability\s+git-security-hooks\.install/);
  assert.doesNotMatch(text, /scripts\/git-hooks\/install-global\.sh/);
});

test('uninstall.sh uses fixed git-hook capability id instead of direct hook script path', () => {
  const text = read('uninstall.sh');
  assert.match(text, /run_module_capability\s+git-security-hooks\.uninstall/);
  assert.doesNotMatch(text, /scripts\/git-hooks\/uninstall-global\.sh/);
});

test('git security hook module exposes deterministic install and uninstall capabilities', () => {
  const manifest = JSON.parse(read('modules/pidex/git-security-hooks/module.json'));
  const capabilities = new Map(manifest.capabilities.map((capability) => [capability.id, capability]));
  for (const id of ['git-security-hooks.install-dry-run', 'git-security-hooks.install', 'git-security-hooks.uninstall']) {
    assert.ok(capabilities.has(id), `${id} capability exists`);
    assert.equal(capabilities.get(id).command.bin, 'bash');
  }
  assert.deepEqual(capabilities.get('git-security-hooks.install').mutability, ['writes-config', 'external-side-effects']);
  assert.deepEqual(capabilities.get('git-security-hooks.uninstall').mutability, ['writes-config', 'external-side-effects']);
});
