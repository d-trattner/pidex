#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const state = mkdtempSync(path.join(os.tmpdir(), 'pidex-metrics-'));
try {
  const env = { ...process.env, RUNNING_PI_STATE_DIR: state };
  const rec = spawnSync(process.execPath, [path.join(root, 'scripts/metrics/record.mjs'), '--project', 'My Project', '--plan', 'plan-001', '--agent', 'pidex-planner', '--provider', 'codex', '--model', 'gpt-5.3-codex', '--input-tokens', '100', '--output-tokens', '50', '--duration-ms', '1200', '--exit-code', '0'], { encoding: 'utf8', env });
  assert.equal(rec.status, 0, rec.stderr || rec.stdout);
  const file = rec.stdout.trim();
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(row.project, 'My Project');
  assert.equal(row.input_tokens_estimate, 100);

  const sum = spawnSync(process.execPath, [path.join(root, 'scripts/metrics/summarize.mjs'), '--plan', 'plan-001'], { encoding: 'utf8', env });
  assert.equal(sum.status, 0, sum.stderr || sum.stdout);
  assert.match(sum.stdout, /Running Pi metrics/);
  assert.match(sum.stdout, /pidex-planner/);
} finally {
  rmSync(state, { recursive: true, force: true });
}
console.log('metrics Node tests passed');
