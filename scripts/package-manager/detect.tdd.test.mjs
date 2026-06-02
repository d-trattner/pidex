#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectPackageManager } from './detect.mjs';

function fixture(name) {
  return mkdtempSync(path.join(tmpdir(), `pidex-pm-${name}-`));
}
function file(root, rel, content = '') {
  const target = path.join(root, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return target;
}
function pkg(root, rel = 'package.json', data = {}) {
  file(root, rel, `${JSON.stringify({ name: 'fixture', version: '1.0.0', ...data }, null, 2)}\n`);
}

const detector = path.resolve('scripts/package-manager/detect.mjs');

test('detects npm from package-lock as compatibility support', () => {
  const root = fixture('npm');
  pkg(root);
  file(root, 'package-lock.json', '{}\n');
  const result = detectPackageManager({ project: root, mode: 'existing' });
  assert.equal(result.package_manager, 'npm');
  assert.equal(result.support, 'compatibility');
  assert.equal(result.confidence, 'lockfile');
  assert.equal(result.lockfile, 'package-lock.json');
  assert.equal(result.package_root, root);
});

test('detects pnpm from pnpm-lock as supported', () => {
  const root = fixture('pnpm');
  pkg(root);
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  const result = detectPackageManager({ project: root, mode: 'existing' });
  assert.equal(result.package_manager, 'pnpm');
  assert.equal(result.support, 'supported');
  assert.equal(result.confidence, 'lockfile');
  assert.equal(result.lockfile, 'pnpm-lock.yaml');
});

test('packageManager-only pnpm is supported with packageManager confidence', () => {
  const root = fixture('field-pnpm');
  pkg(root, 'package.json', { packageManager: 'pnpm@10.1.2' });
  const result = detectPackageManager({ project: root, mode: 'existing' });
  assert.equal(result.package_manager, 'pnpm');
  assert.equal(result.support, 'supported');
  assert.equal(result.confidence, 'packageManager');
  assert.equal(result.package_manager_field, 'pnpm@10.1.2');
});

test('packageManager pnpm plus package-lock at same root is conflict', () => {
  const root = fixture('field-lock-conflict');
  pkg(root, 'package.json', { packageManager: 'pnpm@10.1.2' });
  file(root, 'package-lock.json', '{}\n');
  const result = detectPackageManager({ project: root, mode: 'existing' });
  assert.equal(result.support, 'conflict');
  assert.equal(result.confidence, 'conflict');
  assert.match(result.warnings.join('\n'), /packageManager_lockfile_conflict:pnpm:npm/);
});

test('packageManager npm plus pnpm-lock at same root is conflict', () => {
  const root = fixture('field-lock-conflict-npm');
  pkg(root, 'package.json', { packageManager: 'npm@10.9.0' });
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  const result = detectPackageManager({ project: root, mode: 'existing' });
  assert.equal(result.support, 'conflict');
  assert.equal(result.confidence, 'conflict');
  assert.match(result.warnings.join('\n'), /packageManager_lockfile_conflict:npm:pnpm/);
});

test('multiple lockfile managers at same package root conflict', () => {
  const root = fixture('multi-lock');
  pkg(root);
  file(root, 'package-lock.json', '{}\n');
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  const result = detectPackageManager({ project: root, mode: 'existing' });
  assert.equal(result.support, 'conflict');
  assert.equal(result.lockfile, 'multiple');
  assert.match(result.warnings.join('\n'), /multiple_lockfiles_same_root/);
});

test('pnpm workspace root is detected from package subdir without local lockfile', () => {
  const root = fixture('workspace');
  pkg(root, 'package.json', { packageManager: 'pnpm@10.1.2' });
  file(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  pkg(root, 'packages/app/package.json', { name: '@fixture/app' });
  const project = path.join(root, 'packages/app/src');
  mkdirSync(project, { recursive: true });
  const result = detectPackageManager({ project, mode: 'existing' });
  assert.equal(result.package_manager, 'pnpm');
  assert.equal(result.support, 'supported');
  assert.equal(result.package_root, path.join(root, 'packages/app'));
  assert.equal(result.workspace_root, root);
  assert.equal(result.lockfile_root, root);
});

test('nested package local lockfile overrides parent workspace lockfile without conflict', () => {
  const root = fixture('nested-override');
  pkg(root, 'package.json', { packageManager: 'pnpm@10.1.2' });
  file(root, 'pnpm-workspace.yaml', 'packages:\n  - examples/*\n');
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  pkg(root, 'examples/legacy/package.json', { name: 'legacy' });
  file(root, 'examples/legacy/package-lock.json', '{}\n');
  const result = detectPackageManager({ project: path.join(root, 'examples/legacy'), mode: 'existing' });
  assert.equal(result.package_manager, 'npm');
  assert.equal(result.support, 'compatibility');
  assert.equal(result.lockfile_root, path.join(root, 'examples/legacy'));
  assert.equal(result.workspace_root, root);
});

test('child packageManager mismatch with workspace lockfile is conflict', () => {
  const root = fixture('workspace-field-mismatch');
  pkg(root, 'package.json', { packageManager: 'pnpm@10.1.2' });
  file(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  pkg(root, 'packages/legacy/package.json', { name: 'legacy', packageManager: 'npm@10.9.0' });
  const result = detectPackageManager({ project: path.join(root, 'packages/legacy'), mode: 'existing' });
  assert.equal(result.package_manager, 'unknown');
  assert.equal(result.support, 'conflict');
  assert.equal(result.confidence, 'conflict');
  assert.match(result.warnings.join('\n'), /packageManager_lockfile_conflict:npm:pnpm/);
});

test('existing project with no evidence remains unknown', () => {
  const root = fixture('unknown-existing');
  pkg(root);
  const result = detectPackageManager({ project: root, mode: 'existing' });
  assert.equal(result.package_manager, 'unknown');
  assert.equal(result.support, 'unknown');
  assert.equal(result.confidence, 'fallback');
});

test('greenfield project with no evidence defaults to pnpm', () => {
  const root = fixture('greenfield');
  const result = detectPackageManager({ project: root, mode: 'greenfield' });
  assert.equal(result.package_manager, 'pnpm');
  assert.equal(result.support, 'supported');
  assert.equal(result.confidence, 'greenfield-default');
  assert.equal(result.package_root, root);
});

test('yarn and bun are detected as unsupported', () => {
  const yarnRoot = fixture('yarn');
  pkg(yarnRoot);
  file(yarnRoot, 'yarn.lock', '# yarn\n');
  const yarn = detectPackageManager({ project: yarnRoot, mode: 'existing' });
  assert.equal(yarn.package_manager, 'yarn');
  assert.equal(yarn.support, 'unsupported');

  const bunRoot = fixture('bun');
  pkg(bunRoot);
  file(bunRoot, 'bun.lock', '{}\n');
  const bun = detectPackageManager({ project: bunRoot, mode: 'existing' });
  assert.equal(bun.package_manager, 'bun');
  assert.equal(bun.support, 'unsupported');
});

test('unsupported packageManager field fails closed instead of falling through to lockfile', () => {
  const fieldOnly = fixture('unsupported-field');
  pkg(fieldOnly, 'package.json', { packageManager: 'foo@1.0.0' });
  const unsupported = detectPackageManager({ project: fieldOnly, mode: 'existing' });
  assert.equal(unsupported.package_manager, 'unknown');
  assert.equal(unsupported.support, 'unsupported');
  assert.equal(unsupported.confidence, 'packageManager');
  assert.match(unsupported.warnings.join('\n'), /unsupported_packageManager_field:foo@1.0.0/);

  const withLock = fixture('unsupported-field-lock');
  pkg(withLock, 'package.json', { packageManager: 'foo@1.0.0' });
  file(withLock, 'package-lock.json', '{}\n');
  const conflict = detectPackageManager({ project: withLock, mode: 'existing' });
  assert.equal(conflict.support, 'conflict');
  assert.match(conflict.warnings.join('\n'), /packageManager_lockfile_conflict:foo:npm/);
});

test('ancestor npm lockfile classifies nested package as npm compatibility', () => {
  const root = fixture('ancestor-npm');
  pkg(root);
  file(root, 'package-lock.json', '{}\n');
  pkg(root, 'packages/app/package.json', { name: '@fixture/app' });
  const project = path.join(root, 'packages/app/src');
  mkdirSync(project, { recursive: true });
  const result = detectPackageManager({ project, mode: 'existing' });
  assert.equal(result.package_manager, 'npm');
  assert.equal(result.support, 'compatibility');
  assert.equal(result.package_root, path.join(root, 'packages/app'));
  assert.equal(result.lockfile_root, root);
  assert.equal(result.lockfile, 'package-lock.json');
});

test('CLI emits JSON and defaults to existing mode', () => {
  const root = fixture('cli');
  pkg(root);
  file(root, 'pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
  const run = spawnSync(process.execPath, [detector, '--project', root, '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.mode, 'existing');
  assert.equal(result.package_manager, 'pnpm');
});

console.log('package-manager detect tests passed');
