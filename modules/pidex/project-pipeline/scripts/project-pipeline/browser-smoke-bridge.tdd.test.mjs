import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSER_SMOKE_STATUS } from '../../../browser-smoke/scripts/browser-smoke/status.mjs';
import { browserSmokePaths } from '../../../browser-smoke/scripts/browser-smoke/paths.mjs';
import { browserSmokeBridgeRoot, browserSmokeResultDir, classifyBrowserSmokeRequestPath, parseArgs, reserveBrowserSmokeResultDir, runProjectPipelineBrowserSmokeRequest, validateProjectPipelineBrowserSmokeRequest } from './browser-smoke-bridge.mjs';
import { resolveArchiveRoot } from './archive-sync.mjs';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-browser-smoke-')); }

function setup() {
  const pidexRoot = tmp();
  const projectId = 'pidex-browser-smoke-demo';
  const archiveRoot = resolveArchiveRoot({ pidexRoot, projectId });
  const record = createProjectRecord({ project_id: projectId, name: 'demo' });
  record.status = 'ready';
  record.archive.path = archiveRoot;
  record.preview = { ports: { base: 42080, size: 20, container_base: 42080, host_bind: '127.0.0.1', generation: 1 }, processes: { preview: { status: 'running', operator_url: 'http://localhost:42080', host_port: 42080, container_port: 42080 } } };
  saveProjectRecord(pidexRoot, record);
  return { pidexRoot, projectId, archiveRoot, record };
}

function request(overrides = {}) {
  return {
    schema: 1,
    requester: 'pidex-qa',
    project_id: 'pidex-browser-smoke-demo',
    request_id: 'qa-phase-6-20260701T120000Z',
    phase_run_id: 'pprun-abc123/pidex-qa/phase-6',
    created_at: '2026-07-01T12:00:00.000Z',
    preview: { managed: true, process: 'preview' },
    checks: [{ type: 'title', contains: 'Demo' }],
    capture: { screenshot: true, console_errors: true },
    timeout_ms: 10000,
    ...overrides,
  };
}

function writeRequest(archiveRoot, rel, data) {
  const file = path.join(archiveRoot, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

test('validateProjectPipelineBrowserSmokeRequest accepts QA request and resolves managed preview from registry', () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const file = writeRequest(archiveRoot, 'agents.output/qa/browser-smoke-request-phase-6.json', request());
  const result = validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: file, now: '2026-07-01T12:00:30.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.preview_url, 'http://localhost:42080');
  assert.equal(result.preview_url_source, 'project-pipeline-registry');
  assert.match(result.result_dir, /browser-smoke/);
});

test('bridge rejects path escape requester mismatch project mismatch stale and duplicate requests', () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  assert.equal(classifyBrowserSmokeRequestPath(archiveRoot, path.join(path.dirname(archiveRoot), 'agents.output/qa/request.json')).status_reason, 'request-path-escape');
  const mismatch = writeRequest(archiveRoot, 'agents.output/uat/request.json', request({ requester: 'pidex-qa' }));
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: mismatch, now: '2026-07-01T12:00:00.000Z' }).status_reason, 'requester-path-mismatch');
  const wrongProject = writeRequest(archiveRoot, 'agents.output/qa/wrong-project.json', request({ project_id: 'pidex-other-project', request_id: 'qa-phase-6-other' }));
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: wrongProject, now: '2026-07-01T12:00:00.000Z' }).status_reason, 'project-id-mismatch');
  const stale = writeRequest(archiveRoot, 'agents.output/qa/stale.json', request({ request_id: 'qa-phase-6-stale', created_at: '2026-06-01T00:00:00.000Z' }));
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: stale, now: '2026-07-01T12:00:00.000Z', maxAgeMs: 60_000 }).status_reason, 'stale-request');
  const dup = writeRequest(archiveRoot, 'agents.output/qa/dup.json', request({ request_id: 'qa-phase-6-dup' }));
  reserveBrowserSmokeResultDir(browserSmokeResultDir(pidexRoot, projectId, 'qa-phase-6-dup'));
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: dup, now: '2026-07-01T12:00:00.000Z' }).status_reason, 'duplicate-request');
});

test('bridge rejects request when registered archive root does not match derived project archive root', () => {
  const { pidexRoot, projectId, archiveRoot, record } = setup();
  record.archive.path = path.join(path.dirname(archiveRoot), 'other-archive-root');
  const file = writeRequest(archiveRoot, 'agents.output/qa/archive-mismatch.json', request({ request_id: 'qa-phase-6-archive-mismatch' }));
  const result = validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: file, record, now: '2026-07-01T12:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.equal(result.status_reason, 'archive-root-mismatch');
});

test('bridge restricts devops to reachability checks and returns canonical blocked status', () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const devopsUi = writeRequest(archiveRoot, 'agents.output/devops/request.json', request({ requester: 'pidex-devops', request_id: 'devops-phase-1-title', phase_run_id: 'pprun-abc123/pidex-devops/phase-1', checks: [{ type: 'title', contains: 'Demo' }] }));
  const blocked = validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: devopsUi, now: '2026-07-01T12:00:00.000Z' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  assert.equal(blocked.status_reason, 'devops-check-not-allowed');
  const devopsReachability = writeRequest(archiveRoot, 'agents.output/devops/reachability.json', request({ requester: 'pidex-devops', request_id: 'devops-phase-1-url', phase_run_id: 'pprun-abc123/pidex-devops/phase-1', checks: [{ type: 'url', path_contains: '/' }, { type: 'console', errors: 'none' }] }));
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: devopsReachability, now: '2026-07-01T12:00:00.000Z' }).ok, true);
});

test('bridge rejects missing or stopped managed preview instead of trusting request URL text', () => {
  const { pidexRoot, projectId, archiveRoot, record } = setup();
  record.preview.processes.preview.status = 'stopped';
  const file = writeRequest(archiveRoot, 'agents.output/qa/stopped.json', request({ request_id: 'qa-phase-6-stopped' }));
  const result = validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: file, record, now: '2026-07-01T12:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.equal(result.status_reason, 'preview-not-running');
});

test('runProjectPipelineBrowserSmokeRequest reserves result dir and invokes generic check with registry URL', async () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const file = writeRequest(archiveRoot, 'agents.output/qa/run-request.json', request({ request_id: 'qa-phase-6-run' }));
  const calls = [];
  const result = await runProjectPipelineBrowserSmokeRequest({
    pidexRoot,
    projectId,
    requestPath: file,
    now: '2026-07-01T12:00:30.000Z',
    browserSmokeRunner: async (args) => {
      calls.push(args);
      const artifact = { ok: true, status: BROWSER_SMOKE_STATUS.PASS, status_reason: 'all-checks-passed', preview_url_source: args.previewUrlSource };
      writeFileSync(path.join(args.outputDir, 'browser-smoke-result.json'), `${JSON.stringify(artifact, null, 2)}\n`);
      return artifact;
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:42080');
  assert.equal(calls[0].requestPath, file);
  assert.equal(calls[0].outputRoot, browserSmokeBridgeRoot(pidexRoot, projectId));
  assert.equal(calls[0].project, browserSmokePaths(pidexRoot).stateDir);
  assert.equal(calls[0].stateDir, browserSmokePaths(pidexRoot).stateDir);
  assert.equal(calls[0].browsersPath, browserSmokePaths(pidexRoot).cacheDir);
  assert.equal(calls[0].previewUrlSource, 'project-pipeline-registry');
  assert.equal(existsSync(result.result_file), true);
  assert.equal(JSON.parse(readFileSync(result.result_file, 'utf8')).preview_url_source, 'project-pipeline-registry');
});

test('browser smoke bridge CLI rejects caller-controlled project runtime root', () => {
  assert.throws(() => parseArgs(['--project-id', 'pp-demo', '--request', 'state/project-archives/pp-demo/agents.output/qa/request.json', '--project', 'state/project-archives/pp-demo', '--json']), /unknown argument: --project/);
});

test('runProjectPipelineBrowserSmokeRequest is no-overwrite and does not invoke runner for duplicates', async () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const file = writeRequest(archiveRoot, 'agents.output/qa/duplicate-run-request.json', request({ request_id: 'qa-phase-6-duplicate-run' }));
  reserveBrowserSmokeResultDir(browserSmokeResultDir(pidexRoot, projectId, 'qa-phase-6-duplicate-run'));
  let invoked = false;
  const result = await runProjectPipelineBrowserSmokeRequest({
    pidexRoot,
    projectId,
    requestPath: file,
    now: '2026-07-01T12:00:30.000Z',
    browserSmokeRunner: async () => { invoked = true; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status_reason, 'duplicate-request');
  assert.equal(invoked, false);
});
