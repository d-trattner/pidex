import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePreviewArgs, previewStart, summarizePreviewResult } from './preview.mjs';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';

function tmpRoot() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-preview-helper-')); }

test('parsePreviewArgs requires command tail after -- for start', () => {
  assert.throws(() => parsePreviewArgs(['start', '--pidex-root', '/tmp/x', '--project-id', 'pp-demo-abc123']), /preview start requires -- command/);
  assert.deepEqual(parsePreviewArgs(['start', '--pidex-root', '/tmp/x', '--project-id', 'pp-demo-abc123', '--', 'pnpm', 'dev', '--', '--host', '0.0.0.0']), { action: 'start', pidexRoot: '/tmp/x', projectId: 'pp-demo-abc123', command: ['pnpm', 'dev', '--', '--host', '0.0.0.0'], json: false });
});

test('previewStart auto-assigns ports and returns operator URL without 0.0.0.0 browser host', async () => {
  const root = tmpRoot();
  saveProjectRecord(root, createProjectRecord({ project_id: 'pp-demo-prev1', name: 'demo' }));
  const result = await previewStart({ pidexRoot: root, projectId: 'pp-demo-prev1', command: ['pnpm', 'dev'], env: { PIDEX_PROJECT_PIPELINE_PORT_BASE: '42000', PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE: '20', PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE: '20', PIDEX_PROJECT_PIPELINE_PREVIEW_HOST: '10.0.0.5' }, hostBind: '0.0.0.0', probePort: async () => true, processManager: { start: async () => ({ ok: true, status: 'running' }) } });
  assert.equal(result.ok, true);
  assert.equal(result.operator_url, 'http://10.0.0.5:42000');
  assert.equal(result.host_bind, '0.0.0.0');
  assert.match(result.exposure_note, /all interfaces/);
});

test('summarizePreviewResult omits helper JSON, Docker commands, secret paths, and unbounded logs', () => {
  const summary = summarizePreviewResult({ ok: true, action: 'start', project_id: 'pp-demo-prev2', operator_url: 'http://localhost:42000', host_bind: '127.0.0.1', host_port: 42000 });
  assert.match(summary, /Preview ready for pp-demo-prev2/);
  assert.doesNotMatch(summary, /0\.0\.0\.0|docker run|pidex-secrets|auth\.json|stdout|stderr|\{/);
});
