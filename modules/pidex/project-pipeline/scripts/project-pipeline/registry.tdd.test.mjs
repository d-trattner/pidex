import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProjectRecord, dockerResourceNames, loadProjectRecord, newProjectId, projectFile, safeProjectId, saveProjectRecord, validateProjectRecord } from './registry.mjs';

function tmpRoot() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-pipeline-registry-')); }

test('safeProjectId rejects traversal and unsafe names', () => {
  assert.equal(safeProjectId('PP-demo_1'), 'pp-demo_1');
  for (const value of ['..', '../x', 'x/y', 'x\\y', 'a', '-bad', 'bad space']) {
    assert.throws(() => safeProjectId(value), /invalid project id/);
  }
});

test('createProjectRecord produces schema v2 local project metadata and label-safe docker names', () => {
  const record = createProjectRecord({ name: 'CLI Notes', suffix: 'abc12345', now: '2026-06-18T00:00:00.000Z' });
  assert.equal(record.schema_version, 2);
  assert.equal(record.project_id, 'pp-cli-notes-abc12345');
  assert.equal(record.mode, 'project-pipeline');
  assert.equal(record.target.kind, 'local');
  assert.equal(record.status, 'creating');
  assert.deepEqual(validateProjectRecord(record), []);
  assert.equal(record.docker.container_name, 'pidex-project-pp-cli-notes-abc12345');
});

test('registry save/load uses contained project file and atomic JSON shape', () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-abc123', name: 'demo' });
  const file = saveProjectRecord(root, record);
  assert.equal(file, projectFile(root, 'pp-demo-abc123'));
  assert.equal(existsSync(file), true);
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(raw.project_id, 'pp-demo-abc123');
  const loaded = loadProjectRecord(root, 'pp-demo-abc123');
  assert.equal(loaded.project_id, record.project_id);
});

test('validateProjectRecord accepts legacy v1 records and rejects wrong docker names', () => {
  const record = createProjectRecord({ project_id: 'pp-demo-def456', name: 'demo' });
  assert.deepEqual(validateProjectRecord({ ...record, schema_version: 1 }), []);
  assert.deepEqual(validateProjectRecord({ ...record, schema_version: 99 }), ['unsupported schema_version: 99']);
  const bad = structuredClone(record);
  bad.docker.workspace_volume = 'other-volume';
  assert.match(validateProjectRecord(bad).join('\n'), /invalid docker.workspace_volume/);
});

test('dockerResourceNames are deterministic', () => {
  assert.deepEqual(dockerResourceNames('pp-demo-xyz789'), {
    container_name: 'pidex-project-pp-demo-xyz789',
    workspace_volume: 'pidex-project-pp-demo-xyz789-workspace',
    secrets_volume: 'pidex-project-pp-demo-xyz789-secrets',
    cache_volume: 'pidex-project-pp-demo-xyz789-cache',
  });
});
