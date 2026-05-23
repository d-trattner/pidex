#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts/parallel-agents/run-lane.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-run-lane-'));
try {
  mkdirSync(path.join(tmp, 'config'), { recursive: true });
  mkdirSync(path.join(tmp, 'scripts', 'parallel-agents'), { recursive: true });
  writeFileSync(path.join(tmp, 'scripts', 'parallel-agents', 'status.mjs'), readFileSync(path.join(root, 'scripts', 'parallel-agents', 'status.mjs')), 'utf8');
  writeFileSync(path.join(tmp, 'config', 'parallel-agents.json'), JSON.stringify({ enabled: true, agents: { 'pidex-critic': { enabled: true, provider_models: [{ provider: 'deepseek', model: 'model' }] } } }), 'utf8');
  const cp = spawnSync(process.execPath, [script, '--root', tmp, '--lane', 'pidex-critic:deepseek:model', '--project', tmp, '--force'], { encoding: 'utf8' });
  assert.equal(cp.status, 1, cp.stderr || cp.stdout);
  assert.match(cp.stdout, /manual lane runner scaffold/);
  const statePath = path.join(tmp, 'state', 'parallel-agents', 'status.json');
  assert.ok(existsSync(statePath));
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(state.lanes['pidex-critic:deepseek:model'].warning_type, 'tooling-error');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('parallel-agents run-lane.mjs tests passed');
