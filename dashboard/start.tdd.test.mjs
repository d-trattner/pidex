import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { findNodeBinUpwards, findPackageBinUpwards, parseDashboardStartArgs, resolveViteInvocation } from './start.mjs';

test('parseDashboardStartArgs supports cross-platform dashboard launcher flags', () => {
  const parsed = parseDashboardStartArgs(['--host', '0.0.0.0', '--port', '18888', '--domain', 'pidex.local', '--no-build', '--no-ingest', '--dev', '--foreground', '--public-read', '--public-write']);
  assert.equal(parsed.host, '0.0.0.0');
  assert.equal(parsed.port, '18888');
  assert.equal(parsed.domain, 'pidex.local');
  assert.equal(parsed.build, false);
  assert.equal(parsed.ingest, false);
  assert.equal(parsed.dev, true);
  assert.equal(parsed.foreground, true);
  assert.equal(parsed.publicRead, true);
  assert.equal(parsed.publicWrite, true);
});

test('findNodeBinUpwards locates Windows cmd shims without requiring Bash', () => {
  const root = path.join(os.tmpdir(), `pidex-dashboard-start-${process.pid}-${Date.now()}`);
  try {
    const nested = path.join(root, 'a', 'b', 'dashboard');
    const bin = path.join(root, 'a', 'node_modules', '.bin');
    mkdirSync(nested, { recursive: true });
    mkdirSync(bin, { recursive: true });
    const viteCmd = path.join(bin, 'vite.cmd');
    writeFileSync(viteCmd, '@echo off\n');
    assert.equal(findNodeBinUpwards(nested, 'vite', 'win32'), viteCmd);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveViteInvocation prefers JS entrypoint over Windows cmd shim', () => {
  const root = path.join(os.tmpdir(), `pidex-dashboard-vite-${process.pid}-${Date.now()}`);
  try {
    const dashboard = path.join(root, 'dashboard');
    const bin = path.join(root, 'node_modules', '.bin');
    const viteBin = path.join(root, 'node_modules', 'vite', 'bin');
    mkdirSync(dashboard, { recursive: true });
    mkdirSync(bin, { recursive: true });
    mkdirSync(viteBin, { recursive: true });
    writeFileSync(path.join(bin, 'vite.cmd'), '@echo off\n');
    const viteJs = path.join(viteBin, 'vite.js');
    writeFileSync(viteJs, '#!/usr/bin/env node\n');

    assert.equal(findPackageBinUpwards(dashboard, 'vite', path.join('bin', 'vite.js')), viteJs);
    const invocation = resolveViteInvocation(dashboard, 'win32');
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.baseArgs, [viteJs]);
    assert.equal(invocation.shell, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
