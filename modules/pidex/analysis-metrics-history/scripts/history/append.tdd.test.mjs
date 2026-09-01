import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const runner = path.join(root, 'scripts/modules/run-check.mjs');

function invoke(project, state, passthrough) {
  return spawnSync(process.execPath, [runner, '--capability', 'analysis-metrics-history.history-append', '--agent', 'orchestrator', '--phase', 'planning', '--project', project, '--', ...passthrough], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PIDEX_ROOT: root, PIDEX_STATE_DIR: state },
  });
}

test('history capability accepts bounded natural epic text and rejects unknown/control arguments', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'pidex-history-capability-'));
  const project = path.join(temp, 'Angular benchmark project'); const state = path.join(temp, 'state');
  mkdirSync(project, { recursive: true });
  try {
    const epic = "Implement routes, Signal Forms (Angular 22), and user's accessible flow.";
    const accepted = invoke(project, state, ['--event', 'direct-start', '--cwd', project, '--mode', 'direct', '--epic', epic]);
    assert.equal(accepted.status, 0, accepted.stderr);
    const row = JSON.parse(readFileSync(path.join(state, 'history.jsonl'), 'utf8').trim());
    assert.equal(row.event, 'direct-start');
    assert.equal(row.cwd, project);
    assert.equal(row.mode, 'direct');
    assert.equal(row.epic, epic);

    const unknown = invoke(project, state, ['--event', 'direct-start', '--unknown', 'value']);
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /passthrough args rejected/);

    const control = invoke(project, state, ['--event', 'direct-abort', '--reason', 'line one\nline two']);
    assert.equal(control.status, 2);
    assert.match(control.stderr, /passthrough args rejected/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
