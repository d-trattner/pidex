#!/usr/bin/env node
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const state = mkdtempSync(path.join(os.tmpdir(), 'pidex-metrics-'));
try {
  const env = { ...process.env, PIDEX_STATE_DIR: state };
  const rec = spawnSync(process.execPath, [path.join(root, 'modules/pidex/analysis-metrics-history/scripts/metrics/record.mjs'), '--project', 'My Project', '--plan', 'plan-001', '--agent', 'pidex-planner', '--provider', 'codex', '--model', 'gpt-5.4-mini', '--project-mode', 'project-pipeline', '--input-tokens', '100', '--output-tokens', '50', '--duration-ms', '1200', '--exit-code', '0'], { encoding: 'utf8', env });
  assert.equal(rec.status, 0, rec.stderr || rec.stdout);
  const file = rec.stdout.trim();
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(row.project, 'My Project');
  assert.equal(row.input_tokens_estimate, 100);
  assert.equal(row.project_mode, 'project-pipeline');

  const sum = spawnSync(process.execPath, [path.join(root, 'modules/pidex/analysis-metrics-history/scripts/metrics/summarize.mjs'), '--plan', 'plan-001'], { encoding: 'utf8', env });
  assert.equal(sum.status, 0, sum.stderr || sum.stdout);
  assert.match(sum.stdout, /Running Pi metrics/);
  assert.match(sum.stdout, /pidex-planner/);
} finally {
  rmSync(state, { recursive: true, force: true });
}
// Exercise actual CLI defaults, without the state override that previously hid
// the module-depth and file-URL bugs. Special characters catch URL decoding too.
const fixture = mkdtempSync(path.join(os.tmpdir(), 'pidex metrics # % ü-'));
try {
  const moduleDir = 'modules/pidex/analysis-metrics-history';
  for (const relative of [`${moduleDir}/lib/state-root.mjs`, `${moduleDir}/scripts/metrics/record.mjs`, `${moduleDir}/scripts/metrics/summarize.mjs`]) {
    const destination = path.join(fixture, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(root, relative), destination);
  }
  mkdirSync(path.join(fixture, 'config'));
  writeFileSync(path.join(fixture, 'config/pricing.json'), JSON.stringify({ 'test-model': { input: 2, output: 4 } }));
  for (const variant of ['default', 'legacy', 'canonical']) {
    const env = { ...process.env, PIDEX_STATE_DIR: '', RUNNING_PI_STATE_DIR: '', RUNNING_PI_PRICING_FILE: '', PIDEX_SUMMARY_INCLUDE_ALL: '', PIDEX_RECORD_ALL_PROVIDERS: '' };
    if (variant !== 'default') env.RUNNING_PI_STATE_DIR = path.join(fixture, 'legacy');
    if (variant === 'canonical') env.PIDEX_STATE_DIR = path.join(fixture, 'canonical');
    const expectedState = path.join(fixture, variant === 'default' ? 'state' : variant);
    const rec = spawnSync(process.execPath, [path.join(fixture, moduleDir, 'scripts/metrics/record.mjs'), '--project', 'fixture', '--plan', variant, '--agent', 'fixture-agent', '--provider', 'codex', '--model', 'test-model', '--input-tokens', '1000000', '--output-tokens', '1000000'], { cwd: os.tmpdir(), env, encoding: 'utf8', timeout: 10000 });
    assert.equal(rec.status, 0, rec.stderr);
    assert.equal(rec.stdout.trim(), path.join(expectedState, 'metrics/fixture', `${variant}.jsonl`));
    assert.equal(JSON.parse(readFileSync(rec.stdout.trim(), 'utf8')).cost_usd_estimate, 6);
    const sum = spawnSync(process.execPath, [path.join(fixture, moduleDir, 'scripts/metrics/summarize.mjs'), '--plan', variant], { cwd: os.tmpdir(), env, encoding: 'utf8', timeout: 10000 });
    assert.equal(sum.status, 0, sum.stderr);
    assert.match(sum.stdout, /fixture-agent/);
    assert.match(sum.stdout, /\$6\.0000/);
  }
} finally { rmSync(fixture, { recursive: true, force: true }); }
console.log('metrics Node tests passed');
