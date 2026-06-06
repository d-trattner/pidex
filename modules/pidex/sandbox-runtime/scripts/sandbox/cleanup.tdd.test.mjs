import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, utimesSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupRun, cleanupStale, confinedRunPaths } from './cleanup.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-clean-test-')); }

test('confinedRunPaths rejects traversal and symlink workspace', () => {
  const root = tmp();
  assert.throws(() => confinedRunPaths(root, '../bad'), /invalid run_id|traversal/);
  const runRoot = path.join(root, 'state', 'sandbox', 'runs', 'sandbox-test01');
  mkdirSync(runRoot, { recursive: true });
  symlinkSync(tmp(), path.join(runRoot, 'workspace'));
  assert.throws(() => confinedRunPaths(root, 'sandbox-test01'), /symlink/);
});

test('cleanupRun removes workspace on success and preserves on failure by default', () => {
  const root = tmp();
  const id = 'sandbox-test02';
  const workspace = path.join(root, 'state', 'sandbox', 'runs', id, 'workspace');
  mkdirSync(workspace, { recursive: true });
  const result = cleanupRun({ pidexRoot: root, runId: id, success: false, preserveOnFailure: true });
  assert.equal(result.workspace_status, 'preserved');
  assert.equal(existsSync(workspace), true);
  const result2 = cleanupRun({ pidexRoot: root, runId: id, success: true });
  assert.equal(result2.workspace_status, 'removed');
  assert.equal(existsSync(workspace), false);
});

test('cleanupStale removes only old workspaces under sandbox run root', () => {
  const root = tmp();
  const oldId = 'sandbox-old01';
  const newId = 'sandbox-new01';
  const oldRun = path.join(root, 'state', 'sandbox', 'runs', oldId);
  const newRun = path.join(root, 'state', 'sandbox', 'runs', newId);
  const oldWorkspace = path.join(oldRun, 'workspace');
  const newWorkspace = path.join(newRun, 'workspace');
  mkdirSync(oldWorkspace, { recursive: true });
  mkdirSync(newWorkspace, { recursive: true });
  const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
  utimesSync(oldRun, oldTime, oldTime);
  const result = cleanupStale({ pidexRoot: root, olderThanHours: 24 });
  assert.equal(typeof result.ok, 'boolean');
  assert.equal(existsSync(oldWorkspace), false);
  assert.equal(existsSync(newWorkspace), true);
  assert.equal(result.removed.some((item) => item.run_id === oldId), true);
});
