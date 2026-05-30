import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeModuleFixture } from './test-helpers.mjs';

test('validates a correct module fixture', () => {
  const { root, project } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(JSON.parse(out).ok, true);
});

test('rejects core-required modules in config', () => {
  const { root, project } = makeModuleFixture();
  writeFileSync(path.join(root, 'config/modules.json'), JSON.stringify({ modules: { 'pidex.core': { enabled: false } } }, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /core-required module must not be configurable/);
});

test('rejects disabled release-safety for pidex self-release context', () => {
  const { root } = makeModuleFixture({ releaseEnabled: false });
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', root], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /pidex\.release-safety cannot be disabled/);
});

test('rejects command file args escaping pidex root', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['../outside.mjs'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /command file arg escapes PIDEX root/);
});

test('rejects risky interpreter flags in module commands', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['-e', 'console.log(1)'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /risky interpreter flag is not allowed/);
});

test('rejects command bins outside the stage 1 allowlist', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.bin = 'python';
  manifest.capabilities[0].command.args = ['scripts/release/reference-integrity.mjs'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/validate.mjs', '--pidex-root', root, '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stdout, /command bin is not allowed/);
});
