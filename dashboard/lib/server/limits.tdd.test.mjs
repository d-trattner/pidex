import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

async function withSeededProviderLimits(mod, state, historyLines, fn) {
  const statePath = mod.STATE_FILE;
  const historyPath = mod.HISTORY_FILE;
  let previousState = null;
  let previousHistory = null;
  try {
    previousState = await fs.readFile(statePath, 'utf-8');
  } catch {}
  try {
    previousHistory = await fs.readFile(historyPath, 'utf-8');
  } catch {}

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state), 'utf-8');
  await fs.writeFile(historyPath, historyLines.map((line) => JSON.stringify(line)).join('\n'), 'utf-8');

  try {
    await fn();
  } finally {
    if (previousState === null) {
      await fs.unlink(statePath).catch(() => {});
    } else {
      await fs.writeFile(statePath, previousState, 'utf-8');
    }
    if (previousHistory === null) {
      await fs.unlink(historyPath).catch(() => {});
    } else {
      await fs.writeFile(historyPath, previousHistory, 'utf-8');
    }
  }
}

test('getLimits preserves active/profile data and codex providers', async () => {
  const mod = await import('./limits.ts');
  await withSeededProviderLimits(mod, {
    active_profile: 'codex-high',
    records: [
      { provider: 'codex', status: 'ok' },
      { provider: 'codex-spark', status: 'ok' }
    ]
  }, [], async () => {
    const payload = await mod.getLimits({ includeHistorical: true });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'recommended_profile'), false);
    assert.equal(payload.active_profile, 'codex-high');
    assert.ok(Array.isArray(payload.records));
    assert.deepEqual(payload.records.map((row) => row.provider), ['codex', 'codex-spark']);
  });
});

test('sanitizeLimitEntry preserves provider window duration metadata', async () => {
  const mod = await import('./limits.ts');
  const record = mod.sanitizeLimitEntry({ provider: 'codex', window: 'seven_day', limit_window_seconds: 604800 });
  assert.equal(record.limit_window_seconds, 604800);
});

test('getLimits enriches seven_day records with Running-Pi-style forecast', async () => {
  const mod = await import('./limits.ts');
  const now = Date.now();
  const reset = new Date(now + 10 * 3600 * 1000).toISOString();
  await withSeededProviderLimits(mod, {
    active_profile: 'codex-high',
    records: [
      { provider: 'codex-spark', window: 'seven_day', used_percent: 30, resets_at: reset, status: null }
    ]
  }, [
    { provider: 'codex-spark', window: 'seven_day', used_percent: 10, resets_at: reset, captured_at: new Date(now - 2 * 3600 * 1000).toISOString() },
    { provider: 'codex-spark', window: 'seven_day', used_percent: 20, resets_at: reset, captured_at: new Date(now - 1 * 3600 * 1000).toISOString() }
  ], async () => {
    const payload = await mod.getLimits({ includeHistorical: true });
    const record = payload.records[0];
    assert.equal(record.forecast_status, 'forecast-hit-before-reset');
    assert.equal(record.projected_before_reset, true);
    assert.equal(record.status, 'danger');
    assert.equal(record.forecast_points, 3);
    assert.ok(record.burn_percent_per_hour > 0);
  });
});

test('getLimits keeps missing usage visible as unknown-limit', async () => {
  const mod = await import('./limits.ts');
  await withSeededProviderLimits(mod, {
    active_profile: 'codex-high',
    records: [
      { provider: 'codex', window: 'seven_day', used_percent: null, resets_at: null, error: 'missing Codex token' }
    ]
  }, [], async () => {
    const payload = await mod.getLimits({ includeHistorical: true });
    const record = payload.records[0];
    assert.equal(record.provider, 'codex');
    assert.equal(record.forecast_status, 'unknown-limit');
    assert.equal(record.status, 'unknown');
    assert.equal(record.error, 'missing Codex token');
  });
});
