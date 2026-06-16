import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(path.resolve('extensions/pidex/index.ts')).href);
const projectRoot = path.resolve('.');

const sandboxContext = {
  mode: 'hardened-pipeline',
  runId: 'sandbox-test01',
  hostProjectRoot: projectRoot,
  sandboxWorkspace: '/tmp/pidex-sandbox/workspace',
  allowedWriteRoot: '/tmp/pidex-sandbox/workspace',
};

test('built-in-only child agents disable extensions outside sandbox', () => {
  assert.equal(mod.shouldDisableChildExtensions(['read', 'write', 'edit', 'bash'], undefined), true);
});

test('sandboxed child agents keep extensions loaded even with built-in-only tools', () => {
  assert.equal(mod.shouldDisableChildExtensions(['read', 'write', 'edit', 'bash'], sandboxContext), false);
});

test('custom-tool child agents keep extensions loaded', () => {
  assert.equal(mod.shouldDisableChildExtensions(['read', 'pidex_agent'], undefined), false);
});

test('Windows child Pi spawn avoids npm shim command resolution', () => {
  const spec = mod.piChildSpawnSpec(['--version'], 'win32');
  assert.notEqual(spec.command, 'pi');
  assert.ok(spec.args.includes('--version'));
});
