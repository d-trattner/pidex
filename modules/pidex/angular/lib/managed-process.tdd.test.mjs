import test from 'node:test';
import assert from 'node:assert/strict';
import { runManagedProcess } from './managed-process.mjs';

test('managed process captures bounded output and reports clean completion', async () => {
  const result = await runManagedProcess({ bin: process.execPath, args: ['-e', "process.stdout.write('ok')"], cwd: process.cwd(), env: process.env, timeoutMs: 5000, captureBytes: 1024 });
  assert.equal(result.status, 0); assert.equal(result.stdout, 'ok'); assert.equal(result.cleanupIncomplete, false);
});

test('managed process terminates a timed out process group', async () => {
  const result = await runManagedProcess({ bin: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd(), env: process.env, timeoutMs: 100, captureBytes: 1024 });
  assert.equal(result.timedOut, true); assert.equal(result.cleanupIncomplete, false);
});
