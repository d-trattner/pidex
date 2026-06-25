import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parsePreviewArgs, previewLogs, previewStart, previewStatus, previewStop, summarizePreviewResult } from './preview.mjs';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';

function tmpRoot() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-preview-helper-')); }

test('parsePreviewArgs requires command tail after -- for start', () => {
  assert.throws(() => parsePreviewArgs(['start', '--pidex-root', '/tmp/x', '--project-id', 'pp-demo-abc123']), /preview start requires -- command/);
  assert.deepEqual(parsePreviewArgs(['start', '--pidex-root', '/tmp/x', '--project-id', 'pp-demo-abc123', '--', 'pnpm', 'dev', '--', '--host', '0.0.0.0']), { action: 'start', pidexRoot: '/tmp/x', projectId: 'pp-demo-abc123', command: ['pnpm', 'dev', '--', '--host', '0.0.0.0'], json: false });
});

test('previewStart auto-assigns ports, validates published state before process start, and returns operator URL without 0.0.0.0 browser host', async () => {
  const root = tmpRoot();
  saveProjectRecord(root, createProjectRecord({ project_id: 'pp-demo-prev1', name: 'demo' }));
  const events = [];
  const result = await previewStart({
    pidexRoot: root,
    projectId: 'pp-demo-prev1',
    command: ['pnpm', 'dev'],
    env: { PIDEX_PROJECT_PIPELINE_PORT_BASE: '42000', PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE: '20', PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE: '20', PIDEX_PROJECT_PIPELINE_PREVIEW_HOST: '10.0.0.5' },
    hostBind: '0.0.0.0',
    probePort: async () => true,
    lifecycleManager: { ensurePreviewContainerPublished: async ({ record }) => { events.push(`published:${record.preview.ports.base}`); return { ok: true, record }; } },
    processManager: { start: async () => { events.push('process-start'); return { ok: true, status: 'running' }; } },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(events, ['published:42000', 'process-start']);
  assert.equal(result.operator_url, 'http://10.0.0.5:42000');
  assert.equal(result.host_bind, '0.0.0.0');
  assert.match(result.exposure_note, /all interfaces/);
});

test('previewStart fails typed/redacted when safe published-port validation cannot be proven', async () => {
  const root = tmpRoot();
  saveProjectRecord(root, createProjectRecord({ project_id: 'pp-demo-prevfail1', name: 'demo' }));
  const result = await previewStart({
    pidexRoot: root,
    projectId: 'pp-demo-prevfail1',
    command: ['pnpm', 'dev'],
    env: { PIDEX_PROJECT_PIPELINE_PORT_BASE: '42000', PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE: '20', PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE: '20' },
    probePort: async () => true,
    lifecycleManager: { ensurePreviewContainerPublished: async () => ({ ok: false, error_category: 'preview_recreate_blocked', message: 'secret path /pidex-secrets/auth.json should not leak' }) },
    processManager: { start: async () => { throw new Error('process must not start'); } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error_category, 'preview_recreate_blocked');
  assert.doesNotMatch(JSON.stringify(result), /pidex-secrets|auth\.json/);
});

test('summarizePreviewResult omits helper JSON, Docker commands, secret paths, and unbounded logs', () => {
  const summary = summarizePreviewResult({ ok: true, action: 'start', project_id: 'pp-demo-prev2', operator_url: 'http://localhost:42000', host_bind: '127.0.0.1', host_port: 42000 });
  assert.match(summary, /Preview ready for pp-demo-prev2/);
  assert.doesNotMatch(summary, /0\.0\.0\.0|docker run|pidex-secrets|auth\.json|stdout|stderr|\{/);
});

test('preview facade uses real process manager for start/status/logs/stop', async () => {
  const root = tmpRoot();
  const workspace = path.join(root, 'workspace');
  const stateRoot = path.join(root, 'cache', 'pidex-preview');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(stateRoot, { recursive: true });
  saveProjectRecord(root, createProjectRecord({ project_id: 'pp-demo-real1', name: 'demo' }));
  const port = 46123;
  const common = { pidexRoot: root, projectId: 'pp-demo-real1', env: { PIDEX_PROJECT_PIPELINE_PORT_BASE: String(port), PIDEX_PROJECT_PIPELINE_PORT_POOL_SIZE: '20', PIDEX_PROJECT_PIPELINE_PORT_RANGE_SIZE: '20' }, probePort: async () => true, lifecycleManager: { ensurePreviewContainerPublished: async ({ record }) => ({ ok: true, record }) }, processStateRoot: stateRoot, workspace, readinessTimeoutMs: 2500, stopTimeoutMs: 1000 };
  const command = [process.execPath, '-e', "const http=require('http');console.log('token=abc secret=/pidex-secrets/auth.json');http.createServer((req,res)=>res.end('ok')).listen(process.env.PORT,'0.0.0.0');setInterval(()=>{},1000);"];
  const started = await previewStart({ ...common, command });
  assert.equal(started.ok, true);
  const status = await previewStatus(common);
  assert.equal(status.status, 'running');
  const logs = await previewLogs(common);
  assert.match(logs.log_excerpt, /token=<redacted>/);
  assert.doesNotMatch(logs.log_excerpt, /abc|pidex-secrets|auth\.json/);
  const stopped = await previewStop(common);
  assert.equal(stopped.status, 'stopped');
});
