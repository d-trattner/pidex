import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePhase, detectEnvMetadata } from './policy.mjs';
import { commandForPreset, parseRunArgs, runSandboxCommand } from './run-command.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-run-test-')); }

test('parseRunArgs separates sandbox args from command argv', () => {
  assert.deepEqual(parseRunArgs(['--project', '/p', '--phase', 'test', '--', 'node', '--version']).command, ['node', '--version']);
});

test('runner-owned phase validation fails closed for unknown and install/env mismatch', () => {
  assert.equal(validatePhase('unknown', ['npm', 'test']).ok, false);
  const mismatch = validatePhase('test', ['pnpm', 'install']);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'phase-command-conflict-install-cannot-use-env');
  assert.equal(validatePhase('check', ['pnpm', 'run', 'check']).env_enabled, true);
  assert.equal(validatePhase('edit', ['node', 'script.mjs']).env_enabled, false);
});

test('env metadata records names/keys/hosts only for validated env-enabled phases', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, '.env.test'), 'API_BASE_URL=https://api.example.test/v1\nFEATURE_FLAG=1\n');
  const disabled = detectEnvMetadata(dir, validatePhase('edit', ['node', 'x']));
  assert.deepEqual(disabled.env_files, []);
  const enabled = detectEnvMetadata(dir, validatePhase('test', ['npm', 'test']));
  assert.deepEqual(enabled.env_files, ['.env.test']);
  assert.deepEqual(enabled.env_keys.sort(), ['API_BASE_URL', 'FEATURE_FLAG']);
  assert.deepEqual(enabled.sensitive_env_keys, []);
  assert.deepEqual(enabled.api_hosts, ['api.example.test']);
  assert.equal(enabled.env_values_recorded, false);
});

test('env metadata flags sensitive keys so runner can fail closed', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, '.env.test'), 'AWS_ACCESS_KEY_ID=abc\nNPM_TOKEN=abc\nSAFE_URL=https://safe.example.test\n');
  const enabled = detectEnvMetadata(dir, validatePhase('test', ['npm', 'test']));
  assert.deepEqual(enabled.sensitive_env_keys.map((item) => item.key), ['AWS_ACCESS_KEY_ID', 'NPM_TOKEN']);
});

test('runSandboxCommand redacts sensitive env key names in block result', () => {
  const project = tmp();
  const pidexRoot = tmp();
  writeFileSync(path.join(project, 'package.json'), '{"name":"fixture"}\n');
  writeFileSync(path.join(project, '.env.test'), 'NPM_TOKEN=secret\nAWS_ACCESS_KEY_ID=secret\n');
  const result = runSandboxCommand({ project, pidexRoot, mode: 'hardened-pipeline', phase: 'test', command: ['node', '--version'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sensitive-env-keys-blocked');
  assert.equal(result.sensitive_env_key_count, 2);
  assert.deepEqual(result.sensitive_env_key_reasons, ['sensitive-key-name']);
  assert.equal('sensitive_env_keys' in result, false);
  assert.equal(JSON.stringify(result).includes('NPM_TOKEN'), false);
});

test('package-install preset disables lifecycle scripts and uses supported package managers', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture","packageManager":"npm@11.0.0"}\n');
  writeFileSync(path.join(dir, 'package-lock.json'), '{"lockfileVersion":3}\n');
  const preset = commandForPreset('package-install-check', dir);
  assert.deepEqual(preset.argv, ['npm', 'ci', '--ignore-scripts']);
  assert.equal(preset.phase, 'install');
  assert.equal(preset.network, 'default');
});
