import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

function run(command, args) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8' });
}

test('release-safety public-readiness shim forwards --help to fixed-core authority', () => {
  const core = run('bash', ['scripts/release/public-readiness.sh', '--help']);
  const shim = run('bash', ['modules/pidex/release-safety/scripts/public-readiness.sh', '--help']);
  assert.equal(core.status, 0);
  assert.equal(shim.status, 0);
  assert.equal(shim.stdout, core.stdout);
});

test('release-safety public-readiness shim forwards error behavior', () => {
  const core = run('bash', ['scripts/release/public-readiness.sh', '--bogus']);
  const shim = run('bash', ['modules/pidex/release-safety/scripts/public-readiness.sh', '--bogus']);
  assert.notEqual(core.status, 0);
  assert.notEqual(shim.status, 0);
  assert.equal(shim.status, core.status);
  assert.equal(shim.stderr, core.stderr);
});

test('release-safety public-readiness-check shim forwards helper command', () => {
  const core = run(process.execPath, ['scripts/release/public-readiness-check.mjs', 'parallel-defaults']);
  const shim = run(process.execPath, ['modules/pidex/release-safety/scripts/public-readiness-check.mjs', 'parallel-defaults']);
  assert.equal(core.status, 0, core.stderr);
  assert.equal(shim.status, 0, shim.stderr);
  assert.equal(shim.stdout, core.stdout);
});

test('release-safety public-readiness-check shim forwards error behavior', () => {
  const core = run(process.execPath, ['scripts/release/public-readiness-check.mjs']);
  const shim = run(process.execPath, ['modules/pidex/release-safety/scripts/public-readiness-check.mjs']);
  assert.notEqual(core.status, 0);
  assert.notEqual(shim.status, 0);
  assert.equal(shim.status, core.status);
  assert.equal(shim.stderr, core.stderr);
});

test('release-safety reference-integrity shim forwards to fixed-core helper', () => {
  const core = run(process.execPath, ['scripts/release/reference-integrity.mjs']);
  const shim = run(process.execPath, ['modules/pidex/release-safety/scripts/reference-integrity.mjs']);
  assert.equal(core.status, 0, core.stderr);
  assert.equal(shim.status, 0, shim.stderr);
  assert.equal(shim.stdout, core.stdout);
});

test('release-safety public-readiness shim forwards invalid-argument failure', () => {
  const core = run('bash', ['scripts/release/public-readiness.sh', '--definitely-invalid']);
  const shim = run('bash', ['modules/pidex/release-safety/scripts/public-readiness.sh', '--definitely-invalid']);
  assert.equal(core.status, 2);
  assert.equal(shim.status, core.status);
  assert.equal(shim.stderr, core.stderr);
});

test('release-safety public-readiness-check shim forwards helper failure', () => {
  const core = run(process.execPath, ['scripts/release/public-readiness-check.mjs', 'definitely-invalid']);
  const shim = run(process.execPath, ['modules/pidex/release-safety/scripts/public-readiness-check.mjs', 'definitely-invalid']);
  assert.equal(core.status, 1);
  assert.equal(shim.status, core.status);
  assert.equal(shim.stderr, core.stderr);
});
