import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('modules/pidex/sandbox-runtime/scripts/sandbox/status.mjs');
function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-status-test-')); }
function run(args) { return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); }

test('status.mjs prints sandbox metadata for an existing run', () => {
  const root = tmp();
  const runId = 'sandbox-status01';
  const dir = path.join(root, 'state', 'sandbox', 'runs', runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify({ ok: true, run_id: runId, mode: 'hardened-pipeline' }));
  const proc = run(['--pidex-root', root, '--run-id', runId, '--json']);
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.run_id, runId);
  assert.equal(parsed.mode, 'hardened-pipeline');
});

test('status.mjs returns structured failure for a missing run', () => {
  const root = tmp();
  const proc = run(['--pidex-root', root, '--run-id', 'sandbox-missing01', '--json']);
  assert.equal(proc.status, 1);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'sandbox-run-not-found');
});

test('status.mjs rejects traversal and absolute run IDs before metadata read', () => {
  const root = tmp();
  for (const bad of ['../sandbox-escape01', '/tmp/sandbox-escape01']) {
    const proc = run(['--pidex-root', root, '--run-id', bad, '--json']);
    assert.equal(proc.status, 1);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.reason, 'invalid-run-id');
  }
});
