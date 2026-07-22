#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { appendCodexRateLimit, nonSparkFallbackProfile } from './probe.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const script = path.join(root, 'modules/pidex/provider-governance/scripts/provider-limits/probe.mjs');

function run(args = [], cwd = root, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd, env: { ...process.env, ...env } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const weeklyOnly = [];
appendCodexRateLimit(weeklyOnly, { plan_type: 'plus' }, {
  allowed: true,
  primary_window: { used_percent: 26, limit_window_seconds: 604800, reset_at: 1784487627 },
  secondary_window: null,
}, 'codex');
assert.deepEqual(weeklyOnly.map(({ window, used_percent, limit_window_seconds }) => ({ window, used_percent, limit_window_seconds })), [
  { window: 'seven_day', used_percent: 26, limit_window_seconds: 604800 },
]);

const legacyWindows = [];
appendCodexRateLimit(legacyWindows, {}, {
  primary_window: { used_percent: 10 },
  secondary_window: { used_percent: 20 },
}, 'codex');
assert.deepEqual(legacyWindows.map((record) => record.window), ['five_hour', 'seven_day']);

assert.equal(
  nonSparkFallbackProfile('future-plus-spark-balanced', ['future-no-spark-balanced']),
  'future-no-spark-balanced',
);
assert.equal(
  nonSparkFallbackProfile('future-plus-spark-balanced', ['unrelated-no-spark-balanced']),
  null,
);
assert.equal(
  nonSparkFallbackProfile('5.6-hybrid-balanced', ['unrelated-no-spark-balanced']),
  null,
);

// Use the real repo paths for a non-mutating latest smoke. It may write latest.json
// under PIDEX state, matching the legacy helper behavior.
const latest = run(['latest']);
assert.ok(Array.isArray(latest.profiles));
assert.ok(Array.isArray(latest.records));
assert.equal('recommended_profile' in latest, false);

// Validate Pi auth fallback without printing token values.
const authTmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-provider-auth-'));
try {
  const piAuth = path.join(authTmp, 'auth.json');
  writeFileSync(piAuth, JSON.stringify({ 'openai-codex': { type: 'oauth', access: 'test-access-token-value-that-must-not-print' } }));
  const status = run(['auth-status'], root, { CODEX_PI_AUTH_FILE: piAuth, CODEX_AUTH_FILE: path.join(authTmp, 'missing-codex-auth.json'), CODEX_TOKEN: '' });
  assert.equal(status.ok, true);
  assert.equal(status.sources.pi_auth_openai_codex, true);
  assert.equal(JSON.stringify(status).includes('test-access-token'), false);
} finally {
  rmSync(authTmp, { recursive: true, force: true });
}

// Validate use rejects unknown profiles without relying on network.
const bad = spawnSync(process.execPath, [script, 'use', '__missing_profile__'], { encoding: 'utf8', cwd: root });
assert.notEqual(bad.status, 0);
assert.match(bad.stderr, /unknown profile/);

console.log('provider-limits probe.mjs tests passed');
