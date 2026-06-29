import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { allocatePreviewPorts, choosePreviewBindMode, parsePreviewPortConfig, resolveOperatorHost } from './ports.mjs';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';

function tmpRoot() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-preview-ports-')); }

test('parsePreviewPortConfig validates defaults and invalid ranges', () => {
  assert.deepEqual(parsePreviewPortConfig({}), { base: 42000, poolSize: 2000, rangeSize: 20 });
  assert.throws(() => parsePreviewPortConfig({ PIDEX_PROJECT_PIPELINE_PORT_BASE: '65530', PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE: '20', PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE: '20' }), /preview_port_config_invalid/);
  assert.throws(() => parsePreviewPortConfig({ PIDEX_PROJECT_PIPELINE_PORT_BASE: 'abc' }), /preview_port_config_invalid/);
});

test('allocatePreviewPorts skips ranges already assigned to stale records', async () => {
  const root = tmpRoot();
  const other = createProjectRecord({ project_id: 'pp-other-abc123', name: 'other' });
  other.preview = { ports: { base: 42000, size: 20, container_base: 42000, host_bind: '127.0.0.1', assigned_at: '2026-06-25T00:00:00.000Z', assigned_by: 'create', generation: 1 } };
  saveProjectRecord(root, other);
  const target = createProjectRecord({ project_id: 'pp-target-abc123', name: 'target' });
  saveProjectRecord(root, target);
  const result = await allocatePreviewPorts(root, 'pp-target-abc123', { env: { PIDEX_PROJECT_PIPELINE_PORT_BASE: '42000', PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE: '60', PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE: '20' }, probePort: async () => true, now: () => '2026-06-25T01:00:00.000Z' });
  assert.equal(result.ports.base, 42020);
  assert.equal(result.ports.size, 20);
  assert.equal(result.record.preview.ports.assigned_by, 'preview-enable');
});

test('allocatePreviewPorts skips occupied host ports inside candidate range', async () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-target-def456', name: 'target' });
  saveProjectRecord(root, record);
  const result = await allocatePreviewPorts(root, 'pp-target-def456', { env: { PIDEX_PROJECT_PIPELINE_PORT_BASE: '42000', PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE: '40', PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE: '20' }, probePort: async (port) => port >= 42020, now: () => '2026-06-25T01:00:00.000Z' });
  assert.equal(result.ports.base, 42020);
});

test('choosePreviewBindMode and resolveOperatorHost never return 0.0.0.0 browser URL host', () => {
  assert.equal(choosePreviewBindMode({ platform: 'win32' }), '127.0.0.1');
  assert.equal(choosePreviewBindMode({ platform: 'linux', headless: true }), '0.0.0.0');
  assert.deepEqual(resolveOperatorHost({ hostBind: '127.0.0.1' }), { operatorHost: 'localhost', source: 'local' });
  assert.deepEqual(resolveOperatorHost({ hostBind: '0.0.0.0', env: { PIDEX_PROJECT_PIPELINE_PREVIEW_HOST: '192.0.2.5' } }), { operatorHost: '192.0.2.5', source: 'env' });
  assert.throws(() => resolveOperatorHost({ hostBind: '0.0.0.0', env: { PIDEX_PROJECT_PIPELINE_PREVIEW_HOST: 'http://bad' } }), /preview_operator_host_unknown/);
});
