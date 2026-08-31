import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { angular22NodeCompatibility, inspectAngularWorkspace, resolveNxWorkspace } from './workspace-inspector.mjs';

function project(files = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-inspect-'));
  for (const [name, value] of Object.entries(files)) {
    const target = path.join(root, name); mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
  return root;
}

test('Angular 22 Node compatibility accepts exact supported floors', () => {
  for (const value of ['22.22.3', '22.99.0', '24.15.0', '26.0.0', '26.2.0']) assert.equal(angular22NodeCompatibility(value), 'supported');
  for (const value of ['22.22.2', '24.14.9', '25.0.0', '27.0.0']) assert.equal(angular22NodeCompatibility(value), 'unsupported');
  assert.equal(angular22NodeCompatibility('bad'), 'unknown');
});

test('inspector detects Angular, Material and Nx declarations and alignment warnings', () => {
  const root = project({
    'package.json': { packageManager: 'pnpm@10.33.0', dependencies: { '@angular/core': '22.1.4', '@angular/material': '22.1.4', '@angular/cdk': '22.1.3', nx: '23.1.2', '@nx/angular': '23.1.1' } },
    'angular.json': { projects: { app: { root: 'apps/app', sourceRoot: 'apps/app/src', projectType: 'application', targets: { build: {}, test: {} } } } },
    'nx.json': { plugins: [] },
  });
  try {
    const result = inspectAngularWorkspace({ project: root });
    assert.equal(result.status, 'angular_workspace');
    assert.equal(result.material.detected, true);
    assert.equal(result.nx.detected, true);
    assert.deepEqual(result.angular.projects[0].targets, ['build', 'test']);
    assert.deepEqual(result.warnings, ['material_cdk_version_mismatch', 'nx_package_version_mismatch']);
    assert.equal(result.nx.resolution.status, 'not_requested');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Nx resolution uses structured resolved projects and graph output', () => {
  const root = project({ 'node_modules/nx/bin/nx.js': '#!/usr/bin/env node\n' });
  chmodSync(path.join(root, 'node_modules/nx/bin/nx.js'), 0o755);
  const calls = [];
  const spawn = (_bin, rawArgs) => {
    const args = rawArgs.slice(1); calls.push(args);
    if (args.join(' ') === 'show projects --json') return { status: 0, signal: null, stdout: '["app","ui"]', stderr: '' };
    if (args[0] === 'show' && args[1] === 'project') return { status: 0, signal: null, stdout: JSON.stringify({ root: args[2] === 'app' ? 'apps/app' : 'libs/ui', projectType: args[2] === 'app' ? 'application' : 'library', tags: ['scope:web'], targets: { build: {}, test: {} } }), stderr: '' };
    return { status: 0, signal: null, stdout: '{"graph":{"nodes":{},"dependencies":{}}}', stderr: '' };
  };
  try {
    const result = resolveNxWorkspace(root, { spawn });
    assert.equal(result.status, 'resolved');
    assert.deepEqual(result.projects.map((item) => item.name), ['app', 'ui']);
    assert.equal(calls.length, 4);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('inspector classifies non-Angular and malformed projects', () => {
  const plain = project({ 'package.json': { name: 'plain', packageManager: 'npm@11.0.0' } });
  try { assert.equal(inspectAngularWorkspace({ project: plain }).status, 'not_angular'); }
  finally { rmSync(plain, { recursive: true, force: true }); }
  const bad = project({ 'package.json': '{' });
  try { assert.throws(() => inspectAngularWorkspace({ project: bad }), /JSON_INVALID/); }
  finally { rmSync(bad, { recursive: true, force: true }); }
});
