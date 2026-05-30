import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { makeModuleFixture } from './test-helpers.mjs';

test('lists core-required modules as locked and toggleable config state', () => {
  const { root } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/list.mjs', '--pidex-root', root], { cwd: process.cwd(), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.equal(data.ok, true);
  const core = data.modules.find((item) => item.id === 'pidex.core');
  const release = data.modules.find((item) => item.id === 'pidex.release-safety');
  assert.equal(core.enabled, true);
  assert.equal(core.locked, true);
  assert.equal(release.enabled, true);
  assert.equal(release.locked, false);
  assert.equal(release.source, 'config');
});
