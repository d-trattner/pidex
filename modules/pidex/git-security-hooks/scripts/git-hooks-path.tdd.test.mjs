#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('git hook install/uninstall scripts use module-owned global hooks path', () => {
  const install = readFileSync(path.join(root, 'modules/pidex/git-security-hooks/scripts/install-global.sh'), 'utf8');
  const uninstall = readFileSync(path.join(root, 'modules/pidex/git-security-hooks/scripts/uninstall-global.sh'), 'utf8');
  assert.match(install, /HOOKS_PATH="\$PIDEX_ROOT\/modules\/pidex\/git-security-hooks\/scripts\/global"/);
  assert.match(uninstall, /HOOKS_PATH="\$PIDEX_ROOT\/modules\/pidex\/git-security-hooks\/scripts\/global"/);
  assert.doesNotMatch(install, /^HOOKS_PATH="\$PIDEX_ROOT\/scripts\/git-hooks\/global"/m);
  assert.doesNotMatch(uninstall, /^HOOKS_PATH="\$PIDEX_ROOT\/scripts\/git-hooks\/global"/m);
  assert.match(install, /^LEGACY_HOOKS_PATH="\$PIDEX_ROOT\/scripts\/git-hooks\/global"/m);
  assert.match(uninstall, /^LEGACY_HOOKS_PATH="\$PIDEX_ROOT\/scripts\/git-hooks\/global"/m);
});
