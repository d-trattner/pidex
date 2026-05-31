#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const script = path.join(root, 'scripts/project-context/init.mjs');

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

function testSingleContextInitAndNoOverwrite() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-context-init-'));
  try {
    const result = run([dir]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const context = path.join(dir, 'pidex', 'context', 'CONTEXT.md');
    const readme = path.join(dir, 'pidex', 'context', 'README.template.md');
    assert.ok(existsSync(context));
    assert.ok(existsSync(readme));
    assert.match(readFileSync(context, 'utf8'), new RegExp(`# ${path.basename(dir)} Context`));

    writeFileSync(context, 'custom', 'utf8');
    const second = run([dir]);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /skip existing/);
    assert.equal(readFileSync(context, 'utf8'), 'custom');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function testMultiContextForce() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-context-init-multi-'));
  try {
    const result = run([dir, '--multi', '--context-name', 'Billing Domain']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const map = path.join(dir, 'pidex', 'context', 'CONTEXT-MAP.md');
    const context = path.join(dir, 'pidex', 'context', 'contexts', 'billing-domain', 'CONTEXT.md');
    assert.ok(existsSync(map));
    assert.ok(existsSync(context));
    assert.match(readFileSync(context, 'utf8'), /# Billing Domain Context/);

    writeFileSync(context, 'custom', 'utf8');
    const forced = run([dir, '--multi', '--context-name', 'Billing Domain', '--force']);
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);
    assert.notEqual(readFileSync(context, 'utf8'), 'custom');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

testSingleContextInitAndNoOverwrite();
testMultiContextForce();
console.log('project-context init.mjs tests passed');
