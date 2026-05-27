#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts/pipeline/event.mjs');
const state = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-event-'));
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-project-'));
try {
  const env = { ...process.env, RUNNING_PI_STATE_DIR: state, PIDEX_AUTO_PDQ: '0' };
  const started = spawnSync(process.execPath, [script, '--project', project, '--plan', '7', '--event', 'pipeline_started', '--metadata-json', '{"x":1}'], { encoding: 'utf8', env });
  assert.equal(started.status, 0, started.stderr || started.stdout);
  const match = started.stdout.match(/pipeline_id=([^\s]+)/);
  assert.ok(match);
  const pipelineId = match[1];
  const current = path.join(state, 'pipeline-events', path.basename(project), 'plan-007.current');
  assert.ok(existsSync(current));

  const completed = spawnSync(process.execPath, [script, '--project', project, '--plan', '7', '--event', 'pipeline_completed'], { encoding: 'utf8', env });
  assert.equal(completed.status, 0, completed.stderr || completed.stdout);
  assert.equal(existsSync(current), false);
  const jsonl = path.join(state, 'pipeline-events', path.basename(project), `${pipelineId}.jsonl`);
  const rows = readFileSync(jsonl, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].plan_key, 'plan-007');
  assert.equal(rows[1].event_type, 'pipeline_completed');

  const orphan = spawnSync(process.execPath, [script, '--project', project, '--plan', '8', '--event', 'pipeline_failed'], { encoding: 'utf8', env });
  assert.notEqual(orphan.status, 0);
  assert.match(orphan.stderr, /no active pipeline id/);
} finally {
  rmSync(state, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
console.log('pipeline event.mjs tests passed');
