#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { packageManagerCommand, buildPackageManagerCommand } from './commands.mjs';

function fixture(name) {
  return mkdtempSync(path.join(tmpdir(), `pidex-pm-cmd-${name}-`));
}
function file(root, rel, content = '') {
  const target = path.join(root, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return target;
}
function pkg(root, data = {}) {
  file(root, 'package.json', `${JSON.stringify({ name: 'fixture', version: '1.0.0', ...data }, null, 2)}\n`);
}
function pnpmProject() {
  const root = fixture('pnpm');
  pkg(root, { packageManager: 'pnpm@10.1.2' });
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  return root;
}
function npmProject() {
  const root = fixture('npm');
  pkg(root);
  file(root, 'package-lock.json', '{}\n');
  return root;
}
const cli = path.resolve('scripts/package-manager/commands.mjs');

test('builds pnpm frozen install commands', () => {
  const root = pnpmProject();
  assert.deepEqual(packageManagerCommand({ project: root, operation: 'install-frozen' }).argv, ['pnpm', 'install', '--frozen-lockfile']);
  assert.deepEqual(packageManagerCommand({ project: root, operation: 'install-frozen-ignore-scripts' }).argv, ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts']);
});

test('builds npm frozen install commands for compatibility projects', () => {
  const root = npmProject();
  assert.deepEqual(packageManagerCommand({ project: root, operation: 'install-frozen' }).argv, ['npm', 'ci']);
  assert.deepEqual(packageManagerCommand({ project: root, operation: 'install-frozen-ignore-scripts' }).argv, ['npm', 'ci', '--ignore-scripts']);
});

test('builds pnpm and npm run-script commands', () => {
  assert.deepEqual(packageManagerCommand({ project: pnpmProject(), operation: 'run-script', script: 'test:unit', args: ['--', '--runInBand'] }).argv, ['pnpm', 'run', 'test:unit', '--', '--runInBand']);
  assert.deepEqual(packageManagerCommand({ project: npmProject(), operation: 'run-script', script: 'typecheck' }).argv, ['npm', 'run', 'typecheck']);
});

test('builds pnpm and npm exec commands without dlx/npx auto-download', () => {
  assert.deepEqual(packageManagerCommand({ project: pnpmProject(), operation: 'exec', bin: 'vitest', args: ['run'] }).argv, ['pnpm', 'exec', 'vitest', 'run']);
  assert.deepEqual(packageManagerCommand({ project: npmProject(), operation: 'exec', bin: '@scope/tool' }).argv, ['npm', 'exec', '--', '@scope/tool']);
});

test('builds audit moderate commands', () => {
  assert.deepEqual(packageManagerCommand({ project: pnpmProject(), operation: 'audit-moderate' }).argv, ['pnpm', 'audit', '--audit-level', 'moderate']);
  assert.deepEqual(packageManagerCommand({ project: npmProject(), operation: 'audit-moderate' }).argv, ['npm', 'audit', '--audit-level=moderate']);
});

test('fails closed for unsupported yarn and bun projects', () => {
  const yarn = fixture('yarn');
  pkg(yarn);
  file(yarn, 'yarn.lock', '# yarn\n');
  assert.throws(() => packageManagerCommand({ project: yarn, operation: 'install-frozen' }), /unsupported: yarn/);

  const bun = fixture('bun');
  pkg(bun);
  file(bun, 'bun.lock', '{}\n');
  assert.throws(() => packageManagerCommand({ project: bun, operation: 'install-frozen' }), /unsupported: bun/);
});

test('fails closed for unknown and conflict projects', () => {
  const unknown = fixture('unknown');
  pkg(unknown);
  assert.throws(() => packageManagerCommand({ project: unknown, operation: 'install-frozen' }), /unknown/);

  const conflict = fixture('conflict');
  pkg(conflict);
  file(conflict, 'package-lock.json', '{}\n');
  file(conflict, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  assert.throws(() => packageManagerCommand({ project: conflict, operation: 'install-frozen' }), /conflict/);
});

test('validates script and bin names', () => {
  const detection = { package_manager: 'pnpm', support: 'supported' };
  assert.throws(() => buildPackageManagerCommand(detection, { operation: 'run-script', script: 'test;rm -rf /' }), /invalid script/);
  assert.throws(() => buildPackageManagerCommand(detection, { operation: 'exec', bin: 'bad/tool/name' }), /invalid bin/);
  assert.throws(() => buildPackageManagerCommand(detection, { operation: 'exec', bin: 'vitest', args: ['ok\0bad'] }), /NUL/);
});

test('CLI emits command JSON', () => {
  const root = pnpmProject();
  const run = spawnSync(process.execPath, [cli, '--project', root, '--operation', 'run-script', '--script', 'test', '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.deepEqual(result.argv, ['pnpm', 'run', 'test']);
  assert.equal(result.detection.package_manager, 'pnpm');
});

test('CLI returns nonzero for unsupported package manager', () => {
  const root = fixture('cli-yarn');
  pkg(root);
  file(root, 'yarn.lock', '# yarn\n');
  const run = spawnSync(process.execPath, [cli, '--project', root, '--operation', 'install-frozen'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unsupported: yarn/);
});

console.log('package-manager command tests passed');
