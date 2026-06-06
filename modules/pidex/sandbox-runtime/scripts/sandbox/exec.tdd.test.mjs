import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const script = path.resolve('modules/pidex/sandbox-runtime/scripts/sandbox/exec.mjs');
function run(args) { return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); }

test('exec.mjs delegates to run-command parser and returns sandbox-mode-off without Docker', () => {
  const proc = run(['--mode', 'off', '--project', process.cwd(), '--json', '--', 'node', '--version']);
  assert.equal(proc.status, 1);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'sandbox-mode-off');
});

test('exec.mjs returns parser error for unknown args', () => {
  const proc = run(['--not-a-real-arg']);
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /unknown argument/);
});
