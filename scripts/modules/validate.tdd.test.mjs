import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
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
