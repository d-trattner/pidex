#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const script = path.join(root, 'modules/pidex/parallel-agents/scripts/status.mjs');

function run(tmpRoot, args, ok = true) {
  const cp = spawnSync(process.execPath, [script, '--root', tmpRoot, ...args], { encoding: 'utf8' });
  if (ok) assert.equal(cp.status, 0, cp.stderr || cp.stdout);
  else assert.notEqual(cp.status, 0);
  return cp.stdout ? JSON.parse(cp.stdout) : null;
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-parallel-status-'));
try {
  mkdirSync(path.join(tmp, 'config'), { recursive: true });
  const config = {
    enabled: true,
    agents: {
      'pidex-critic': {
        enabled: true,
        trigger: 'after-plan',
        provider_models: [
          { provider: 'deepseek', model: 'deepseek-v4-flash', effort: 'low' },
          { provider: 'codex', model: 'gpt-5.1-codex', effort: 'medium' }
        ]
      }
    }
  };
  writeFileSync(path.join(tmp, 'config', 'parallel-agents.json'), JSON.stringify(config), 'utf8');

  const eligible = run(tmp, ['eligible', '--agent', 'pidex-critic', '--trigger', 'after-plan', '--json']);
  assert.equal(eligible.ok, true);
  assert.equal(eligible.lanes.length, 2);
  assert.equal(eligible.lanes[0].runner_provider, 'pi');
  assert.equal(eligible.lanes[0].runner_model, 'deepseek/deepseek-v4-flash');
  assert.equal(eligible.lanes[1].runner_provider, 'codex');

  const classified = spawnSync(process.execPath, [script, '--root', tmp, 'classify', '--message', '429 quota limit reached'], { encoding: 'utf8' });
  assert.equal(classified.status, 0, classified.stderr || classified.stdout);
  assert.equal(classified.stdout.trim(), 'usage-limit-or-balance');

  run(tmp, ['warn', '--lane', 'pidex-critic:deepseek:deepseek-v4-flash', '--message', 'secret-token-abcdefghijklmnopqrstuvwxyz quota', '--no-telegram']);
  const statePath = path.join(tmp, 'state', 'parallel-agents', 'status.json');
  assert.ok(existsSync(statePath));
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const lane = state.lanes['pidex-critic:deepseek:deepseek-v4-flash'];
  assert.equal(lane.warning_active, true);
  assert.equal(lane.warning_type, 'usage-limit-or-balance');
  assert.match(lane.last_message, /secr…wxyz/);

  run(tmp, ['success', '--lane', 'pidex-critic:deepseek:deepseek-v4-flash']);
  const afterSuccess = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(afterSuccess.lanes['pidex-critic:deepseek:deepseek-v4-flash'].warning_active, false);

  writeFileSync(path.join(tmp, 'config', 'parallel-agents.local.json'), JSON.stringify({ enabled: false, agents: {} }), 'utf8');
  const localStatus = run(tmp, ['show']);
  assert.equal(localStatus.config_path, path.join(tmp, 'config', 'parallel-agents.local.json'));
  assert.equal(localStatus.enabled, false);
  const saveResult = run(tmp, ['save-config', '--config-json', JSON.stringify(config)]);
  assert.equal(saveResult.config_path, path.join(tmp, 'config', 'parallel-agents.local.json'));
  assert.equal(existsSync(path.join(tmp, 'config', 'parallel-agents.local.json')), true);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('parallel-agents status.mjs tests passed');
