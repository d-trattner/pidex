import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

async function withSeededState(mod, fn) {
  const statePath = mod.STATE_FILE;
  let previous = null;
  try {
    previous = await fs.readFile(statePath, 'utf-8');
  } catch {}

  await fs.mkdir(new URL('.', `file://${statePath}`).pathname, { recursive: true }).catch(() => {});
  await fs.writeFile(statePath, JSON.stringify({
    active_profile: 'codex-high',
    records: [
      { provider: 'codex', status: 'ok' },
      { provider: 'codex-spark', status: 'ok' }
    ]
  }), 'utf-8');

  try {
    await fn();
  } finally {
    if (previous === null) {
      await fs.unlink(statePath).catch(() => {});
    } else {
      await fs.writeFile(statePath, previous, 'utf-8');
    }
  }
}

test('getLimits preserves active/profile data and codex providers', async () => {
  const mod = await import('./limits.ts');
  await withSeededState(mod, async () => {
    const payload = await mod.getLimits({ includeHistorical: true });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'recommended_profile'), false);
    assert.equal(payload.active_profile, 'codex-high');
    assert.ok(Array.isArray(payload.records));
    assert.deepEqual(payload.records.map((row) => row.provider), ['codex', 'codex-spark']);
  });
});
