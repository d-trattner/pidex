import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mod = await import(path.resolve('extensions/pidex/index.ts'));
const helperRel = ['modules', 'pidex', 'sandbox-runtime', 'scripts', 'sandbox', 'status.mjs'].join('/');
const helperAbs = path.resolve(helperRel);
const projectRoot = path.resolve('.');

test('sandboxHostBashAllowed permits one exact canonical node helper invocation', () => {
  assert.equal(mod.sandboxHostBashAllowed(`${process.execPath} ${helperAbs} --pidex-root ${projectRoot} --run-id sandbox-test01 --json`), true);
  assert.equal(mod.sandboxHostBashAllowed(`node ${helperAbs} --json`), true);
});

test('sandboxHostBashAllowed rejects relative or mutable workspace helper paths', () => {
  assert.equal(mod.sandboxHostBashAllowed(`node ${helperRel} --json`), false);
  const workspaceHelper = path.join(os.tmpdir(), 'pidex-sandbox-runs', 'abc', 'workspace', helperRel);
  mkdirSync(path.dirname(workspaceHelper), { recursive: true });
  writeFileSync(workspaceHelper, 'console.log("owned")\n');
  assert.equal(mod.sandboxHostBashAllowed(`node ${workspaceHelper} --json`), false);
});

test('sandboxHostBashAllowed rejects symlinked helper paths', () => {
  const dir = path.join(os.tmpdir(), `pidex-sandbox-helper-link-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const linked = path.join(dir, 'status.mjs');
  symlinkSync(helperAbs, linked);
  assert.equal(mod.sandboxHostBashAllowed(`node ${linked} --json`), false);
});

test('sandboxHostBashAllowed rejects chained host commands after helper', () => {
  assert.equal(mod.sandboxHostBashAllowed(`node ${helperAbs} --json; touch ${projectRoot}/HOST_MUTATION`), false);
  assert.equal(mod.sandboxHostBashAllowed(`node ${helperAbs} --json && git -C ${projectRoot} status`), false);
  assert.equal(mod.sandboxHostBashAllowed(`node ${helperAbs} --json | sh`), false);
  assert.equal(mod.sandboxHostBashAllowed(`node ${helperAbs} --json > ${projectRoot}/out`), false);
  assert.equal(mod.sandboxHostBashAllowed(`node ${helperAbs} --json $(touch ${projectRoot}/x)`), false);
});

test('commandMentionsSandboxRuntimeHelper detects malformed helper attempts for blocking', () => {
  assert.equal(mod.commandMentionsSandboxRuntimeHelper(`node ${helperRel} --json; touch /tmp/x`), true);
});
