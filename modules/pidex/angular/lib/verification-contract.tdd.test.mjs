import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildVerificationRequests, redactAngularOutput, runAngularVerification } from './verification-contract.mjs';

function fixture({ nx = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-verify-'));
  const dependencies = { '@angular/core': '22.1.4', ...(nx ? { nx: '23.1.2', '@nx/angular': '23.1.2' } : {}) };
  writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ packageManager: 'pnpm@10.33.0', scripts: { build: 'ng build', test: 'ng test', lint: 'ng lint' }, dependencies })}\n`);
  writeFileSync(path.join(root, 'angular.json'), '{"projects":{"app":{"root":"apps/app"}}}\n');
  if (nx) {
    writeFileSync(path.join(root, 'nx.json'), '{}\n');
    mkdirSync(path.join(root, 'node_modules/nx/bin'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules/nx/bin/nx.js'), '#!/usr/bin/env node\n'); chmodSync(path.join(root, 'node_modules/nx/bin/nx.js'), 0o755);
  }
  return root;
}

test('plain Angular verification builds structured package-manager requests', () => {
  const root = fixture();
  try {
    const one = buildVerificationRequests({ project: root, operation: 'build' });
    assert.deepEqual(one.requests, [{ id: 'build', bin: 'pnpm', args: ['run', 'build'] }]);
    const all = buildVerificationRequests({ project: root, operation: 'all' });
    assert.deepEqual(all.requests.map((item) => item.id), ['build', 'test', 'lint']);
    assert.throws(() => buildVerificationRequests({ project: root, operation: 'affected' }), /REQUIRES_NX/);
    assert.throws(() => buildVerificationRequests({ project: root, operation: 'shell' }), /OPERATION_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Nx verification uses local binary, resolved target token and affected operation', () => {
  const root = fixture({ nx: true });
  try {
    const build = buildVerificationRequests({ project: root, operation: 'build', projectName: 'web-app' });
    assert.deepEqual(build.requests[0].args.slice(1), ['run', 'web-app:build', '--outputStyle=static']);
    assert.equal(build.requests[0].bin, process.execPath);
    const affected = buildVerificationRequests({ project: root, operation: 'affected' });
    assert.deepEqual(affected.requests[0].args.slice(1), ['affected', '-t', 'build,test,lint', '--outputStyle=static']);
    assert.throws(() => buildVerificationRequests({ project: root, operation: 'build', projectName: '../bad' }), /PROJECT_NAME_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('verification emits bounded typed pass/fail/timeout/cleanup results without invented coverage', async () => {
  const root = fixture();
  try {
    const pass = await runAngularVerification({ project: root, operation: 'all', execute: async () => ({ status: 0, signal: null, stdout: 'ok', stderr: '' }) });
    assert.equal(pass.status, 'passed'); assert.equal(pass.results.length, 3); assert.equal(pass.coverage.status, 'NOT_CONFIGURED');
    const fail = await runAngularVerification({ project: root, operation: 'build', execute: async () => ({ status: 1, signal: null, stdout: '', stderr: 'bad' }) });
    assert.equal(fail.status, 'failed'); assert.equal(fail.results[0].stderr, 'bad');
    const timeout = await runAngularVerification({ project: root, operation: 'build', execute: async () => ({ status: null, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true }) });
    assert.equal(timeout.status, 'timed_out');
    const cleanup = await runAngularVerification({ project: root, operation: 'build', execute: async () => ({ status: null, signal: 'SIGKILL', stdout: '', stderr: '', cleanupIncomplete: true }) });
    assert.equal(cleanup.status, 'cleanup_incomplete');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('verification redacts credentials and bounds output', () => {
  const value = `token sk-proj-${'a'.repeat(50)} github ghp_${'b'.repeat(36)} ${'x'.repeat(100000)}`;
  const redacted = redactAngularOutput(value);
  assert.doesNotMatch(redacted, /sk-proj-|ghp_/);
  assert.ok(redacted.length <= 64 * 1024);
});
