import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSER_SMOKE_STATUS } from '../../../browser-smoke/scripts/browser-smoke/status.mjs';
import { validateBrowserSmokeResult } from '../../../browser-smoke/scripts/browser-smoke/result-contract.mjs';
import { browserSmokePaths } from '../../../browser-smoke/scripts/browser-smoke/paths.mjs';
import { browserSmokeBridgeRoot, browserSmokeResultDir, classifyBrowserSmokeRequestPath, loadPersistedSchema2EvidenceSnapshot, parseArgs, reserveBrowserSmokeResultDir, runProjectPipelineBrowserSmokeRequest, validateProjectPipelineBrowserSmokeRequest } from './browser-smoke-bridge.mjs';
import { resolveArchiveRoot } from './archive-sync.mjs';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';
import { buildBrowserSmokeVerdictTask } from './orchestrator.mjs';

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

function schema2Request(overrides = {}) {
  return {
    schema: 2, requester: 'pidex-qa', project_id: 'pidex-browser-smoke-demo', request_id: 'qa-schema2-bridge', phase_run_id: 'pprun-abc123/pidex-qa/phase-6', created_at: '2026-07-01T12:00:00.000Z', preview: { managed: true, process: 'preview' }, timeout_ms: 10000,
    viewports: [{ id: 'desktop', width: 1280, height: 800, route: '/', preconditions: [], actions: [], checks: [], capture: { screenshot: false, console_errors: false } }], ...overrides,
  };
}

function schema2Result(request, overrides = {}) {
  return { schema: 2, ok: true, status: 'PASS', status_reason: 'all-checks-passed', project_id: request.project_id, request_id: request.request_id, phase_run_id: request.phase_run_id, requester: request.requester, preview_url_source: 'project-pipeline-registry', started_at: '2026-07-01T12:00:00.000Z', ended_at: '2026-07-01T12:00:01.000Z', viewports: request.viewports.map((viewport) => ({ id: viewport.id, width: viewport.width, height: viewport.height, status: 'PASS', status_reason: 'all-checks-passed', stage: 'complete', preconditions: [], actions: [], checks: [], console_errors: [], screenshot: null })), ...overrides };
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

test('bridge request reader rejects symlink, hardlink and oversized JSON artifacts', (t) => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const outside = path.join(tmp(), 'outside.json');
  writeFileSync(outside, `${JSON.stringify(request({ request_id: 'qa-outside' }))}\n`);
  const qaRoot = path.join(archiveRoot, 'agents.output/qa');
  mkdirSync(qaRoot, { recursive: true });
  try { symlinkSync(outside, path.join(qaRoot, 'symlink.json')); }
  catch { t.diagnostic('symlink creation unavailable; symlink case covered by archive tests'); }
  if (existsSync(path.join(qaRoot, 'symlink.json'))) assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: path.join(qaRoot, 'symlink.json'), now: '2026-07-01T12:00:00.000Z' }).ok, false);
  linkSync(outside, path.join(qaRoot, 'hardlink.json'));
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: path.join(qaRoot, 'hardlink.json'), now: '2026-07-01T12:00:00.000Z' }).ok, false);
  const oversized = path.join(qaRoot, 'oversized.json');
  writeFileSync(oversized, JSON.stringify({ ...request({ request_id: 'qa-oversized' }), reason: 'x'.repeat(300_000) }));
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: oversized, now: '2026-07-01T12:00:00.000Z' }).ok, false);
});

test('bridge request reader rejects executable JSON artifacts on POSIX', (t) => {
  if (process.platform === 'win32') { t.skip('Windows does not expose POSIX executable mode bits'); return; }
  const { pidexRoot, projectId, archiveRoot } = setup();
  const executable = writeRequest(archiveRoot, 'agents.output/qa/executable.json', request({ request_id: 'qa-executable' }));
  chmodSync(executable, 0o755);
  assert.equal(validateProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: executable, now: '2026-07-01T12:00:00.000Z' }).ok, false);
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
  assert.notEqual(calls[0].outputRoot, browserSmokeBridgeRoot(pidexRoot, projectId));
  assert.equal(path.dirname(calls[0].outputRoot), path.dirname(archiveRoot));
  assert.equal(calls[0].project, browserSmokePaths(pidexRoot).stateDir);
  assert.equal(calls[0].stateDir, browserSmokePaths(pidexRoot).stateDir);
  assert.equal(calls[0].browsersPath, browserSmokePaths(pidexRoot).cacheDir);
  assert.equal(calls[0].previewUrlSource, 'project-pipeline-registry');
  assert.equal(existsSync(result.result_file), true);
  assert.equal(JSON.parse(readFileSync(result.result_file, 'utf8')).preview_url_source, 'project-pipeline-registry');
  assert.equal(readdirSync(path.dirname(archiveRoot)).some((name) => name.includes('.browser-smoke-runner-')), false);
});

test('browser publication rejects a symlinked browser destination without writing outside archive', async (t) => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const file = writeRequest(archiveRoot, 'agents.output/qa/symlink-destination.json', request({ request_id: 'qa-symlink-destination' }));
  const outside = tmp();
  try { symlinkSync(outside, path.join(archiveRoot, 'browser-smoke')); }
  catch { t.skip('symlink creation unavailable'); return; }
  const result = await runProjectPipelineBrowserSmokeRequest({
    pidexRoot, projectId, requestPath: file, now: '2026-07-01T12:00:30.000Z',
    browserSmokeRunner: async (args) => {
      const artifact = { ok: true, status: BROWSER_SMOKE_STATUS.PASS, status_reason: 'all-checks-passed' };
      writeFileSync(path.join(args.outputDir, 'browser-smoke-result.json'), `${JSON.stringify(artifact)}\n`);
      return artifact;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status_reason, 'evidence-publication-failed');
  assert.deepEqual(readdirSync(outside), []);
});

test('bridge validates actual schema2 runner artifact identity before Plan055 publication and rejects malformed or mismatched artifacts', async () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const goodRequest = schema2Request();
  const goodFile = writeRequest(archiveRoot, 'agents.output/qa/schema2-good.json', goodRequest);
  const good = await runProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: goodFile, now: '2026-07-01T12:00:30.000Z', browserSmokeRunner: async (args) => { const artifact = schema2Result(goodRequest); writeFileSync(path.join(args.outputDir, 'browser-smoke-result.json'), JSON.stringify(artifact)); return artifact; } });
  assert.equal(good.ok, true);
  assert.deepEqual(JSON.parse(readFileSync(good.result_file, 'utf8')), schema2Result(goodRequest));
  const forgedCompleteRequest = schema2Request({ request_id: 'qa-schema2-forged-complete-runtime' });
  const forgedCompleteFile = writeRequest(archiveRoot, 'agents.output/qa/schema2-forged-complete-runtime.json', forgedCompleteRequest);
  const forgedComplete = await runProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: forgedCompleteFile, now: '2026-07-01T12:00:30.000Z', browserSmokeRunner: async (args) => { const artifact = schema2Result(forgedCompleteRequest, { ok: false, status: 'BLOCKED_INFRA', status_reason: 'runtime-infra', viewports: forgedCompleteRequest.viewports.map((viewport) => ({ id: viewport.id, width: viewport.width, height: viewport.height, status: 'BLOCKED_INFRA', status_reason: 'runtime-infra', stage: 'complete', preconditions: [], actions: [], checks: [], console_errors: [], screenshot: null })) }); writeFileSync(path.join(args.outputDir, 'browser-smoke-result.json'), JSON.stringify(artifact)); return artifact; } });
  assert.equal(forgedComplete.status_reason, 'evidence-publication-failed');
  assert.equal(existsSync(browserSmokeResultDir(pidexRoot, projectId, forgedCompleteRequest.request_id)), false);
  const malformedRequest = schema2Request({ request_id: 'qa-schema2-malformed' });
  const malformedFile = writeRequest(archiveRoot, 'agents.output/qa/schema2-malformed.json', malformedRequest);
  const malformed = await runProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: malformedFile, now: '2026-07-01T12:00:30.000Z', browserSmokeRunner: async (args) => { writeFileSync(path.join(args.outputDir, 'browser-smoke-result.json'), '{malformed'); return schema2Result(malformedRequest); } });
  assert.equal(malformed.status_reason, 'evidence-publication-failed');
  assert.equal(existsSync(browserSmokeResultDir(pidexRoot, projectId, malformedRequest.request_id)), false);
  const mismatchedRequest = schema2Request({ request_id: 'qa-schema2-mismatched' });
  const mismatchedFile = writeRequest(archiveRoot, 'agents.output/qa/schema2-mismatched.json', mismatchedRequest);
  const mismatched = await runProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: mismatchedFile, now: '2026-07-01T12:00:30.000Z', browserSmokeRunner: async (args) => { const artifact = schema2Result(mismatchedRequest, { request_id: 'wrong-request-id' }); writeFileSync(path.join(args.outputDir, 'browser-smoke-result.json'), JSON.stringify(artifact)); return artifact; } });
  assert.equal(mismatched.status_reason, 'evidence-publication-failed');
  assert.equal(existsSync(browserSmokeResultDir(pidexRoot, projectId, mismatchedRequest.request_id)), false);
});

test('actual schema2 runner publishes auth-state mismatch and selector precondition failure with request schema metadata', async () => {
  const cases = [
    { name: 'auth', preconditions: [{ type: 'auth_state', authenticated_selector: '.authenticated', login_selector: '.login' }], counts: { '.authenticated': 0, '.login': 1 }, status: 'AUTH_STATE_MISMATCH', status_reason: 'auth-state-mismatch' },
    { name: 'selector', preconditions: [{ type: 'selector_present', selector: '.required' }], counts: { '.required': 0 }, status: 'PRECONDITION_FAILED', status_reason: 'precondition-failed' },
  ];
  for (const item of cases) {
    const { pidexRoot, projectId, archiveRoot } = setup();
    const schemaRequest = schema2Request({ request_id: `qa-schema2-${item.name}-precondition`, viewports: [{ ...schema2Request().viewports[0], preconditions: item.preconditions }] });
    const file = writeRequest(archiveRoot, `agents.output/qa/schema2-${item.name}-precondition.json`, schemaRequest);
    const page = { on() {}, goto: async () => {}, locator: (selector) => ({ count: async () => item.counts[selector] ?? 1 }), keyboard: { press: async () => {} } };
    const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} }) } };
    const result = await runProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: file, now: '2026-07-01T12:00:30.000Z', playwright });
    assert.equal(result.request_schema, 2);
    assert.equal(result.status, item.status);
    assert.equal(result.status_reason, item.status_reason);
    assert.deepEqual(JSON.parse(readFileSync(result.result_file, 'utf8')).status, item.status);
    assert.deepEqual(JSON.parse(readFileSync(result.result_file, 'utf8')).status_reason, item.status_reason);
  }
});

test('actual schema2 runner publishes action and check runtime failures through Plan055', async () => {
  const cases = [
    { name: 'action', actions: [{ type: 'hover', selector: '.menu' }], checks: [], throws: 'hover' },
    { name: 'check', actions: [], checks: [{ type: 'selector_present', selector: '.required' }], throws: 'count' },
  ];
  for (const item of cases) {
    const { pidexRoot, projectId, archiveRoot } = setup();
    const schemaRequest = schema2Request({ request_id: `qa-schema2-${item.name}-runtime`, viewports: [{ ...schema2Request().viewports[0], actions: item.actions, checks: item.checks }] });
    const file = writeRequest(archiveRoot, `agents.output/qa/schema2-${item.name}-runtime.json`, schemaRequest);
    const page = { on() {}, goto: async () => {}, locator: () => ({ count: async () => { if (item.throws === 'count') throw new Error('check dependency failed'); return 1; }, hover: async () => { if (item.throws === 'hover') throw new Error('action dependency failed'); } }), keyboard: { press: async () => {} } };
    const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} }) } };
    const result = await runProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: file, now: '2026-07-01T12:00:30.000Z', playwright });
    assert.equal(result.request_schema, 2);
    assert.deepEqual([result.status, result.status_reason], ['BLOCKED_INFRA', 'runtime-infra']);
    assert.deepEqual(JSON.parse(readFileSync(result.result_file, 'utf8')).status_reason, 'runtime-infra');
  }
});

test('actual schema2 runner byte-truncates exact QA multibyte console repro before strict Plan055 publication', async () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const schemaRequest = schema2Request({
    request_id: 'qa056-schema2-multibyte-console',
    viewports: ['desktop1280', 'desktop1440'].map((id, index) => ({ id, width: index ? 1440 : 1280, height: index ? 900 : 800, route: '/dashboard', preconditions: [], actions: [], checks: [], capture: { screenshot: false, console_errors: true } })),
  });
  const file = writeRequest(archiveRoot, 'agents.output/qa/schema2-multibyte-console.json', schemaRequest);
  const emitted = Array.from({ length: 25 }, (_, index) => `password=supersecret-${index} ${'😀'.repeat(250)}`);
  let contextIndex = 0;
  const playwright = { chromium: { launch: async () => ({
    newContext: async () => {
      const emitConsole = contextIndex++ === 0;
      let consoleListener;
      const page = {
        on: (event, listener) => { if (event === 'console') consoleListener = listener; },
        goto: async () => { if (emitConsole) for (const text of emitted) consoleListener?.({ type: () => 'error', text: () => text }); },
        locator: () => ({ count: async () => 1 }),
        keyboard: { press: async () => {} },
      };
      return { on() {}, route: async () => {}, newPage: async () => page, close: async () => {} };
    },
    close: async () => {},
  }) } };
  const result = await runProjectPipelineBrowserSmokeRequest({ pidexRoot, projectId, requestPath: file, now: '2026-07-01T12:00:30.000Z', playwright });
  assert.equal(result.ok, true);
  const published = JSON.parse(readFileSync(result.result_file, 'utf8'));
  const consoleErrors = published.viewports.flatMap((viewport) => viewport.console_errors);
  assert.ok(consoleErrors.length <= 20);
  assert.ok(Buffer.byteLength(consoleErrors.join(''), 'utf8') <= 4096);
  assert.equal(consoleErrors.some((message) => message.includes('supersecret')), false);
  assert.equal(validateBrowserSmokeResult(published, schemaRequest).ok, true);
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

test('loadPersistedSchema2EvidenceSnapshot rereads strict registered request/result and screenshot inventory', () => {
  const { pidexRoot, projectId, archiveRoot } = setup();
  const schemaRequest = schema2Request({ request_id: 'qa-schema2-snapshot', viewports: [{ ...schema2Request().viewports[0], capture: { screenshot: true, console_errors: true } }] });
  const requestFile = writeRequest(archiveRoot, 'agents.output/qa/schema2-snapshot.json', schemaRequest);
  const resultDir = browserSmokeResultDir(pidexRoot, projectId, schemaRequest.request_id);
  mkdirSync(resultDir, { recursive: true });
  const result = schema2Result(schemaRequest, { viewports: [{ id: 'desktop', width: 1280, height: 800, status: 'PASS', status_reason: 'all-checks-passed', stage: 'complete', preconditions: [], actions: [], checks: [], console_errors: ['safe message'], screenshot: 'desktop.png' }] });
  writeFileSync(path.join(resultDir, 'browser-smoke-result.json'), JSON.stringify(result));
  writeFileSync(path.join(resultDir, 'desktop.png'), 'png');
  const valid = loadPersistedSchema2EvidenceSnapshot({ pidexRoot, projectId, request_file: requestFile, request_id: schemaRequest.request_id });
  assert.equal(valid.ok, true);
  assert.equal(valid.snapshot.status, 'PASS');
  assert.deepEqual(valid.snapshot.screenshot_refs, ['browser-smoke/qa-schema2-snapshot/desktop.png']);
  assert.equal(valid.snapshot.result_ref, 'browser-smoke/qa-schema2-snapshot/browser-smoke-result.json');
  const task = buildBrowserSmokeVerdictTask({ phase: 'pidex-qa', initialTask: 'Build dashboard UI', results: [valid.snapshot], request_schema: 2 });
  // SEC-057-1: route crosses verdict boundary as JSON data, not instruction text.
  assert.match(task, /viewport desktop: route_json: "\/"/);
  assert.doesNotMatch(task, /route=undefined/);
  rmSync(path.join(resultDir, 'desktop.png'));
  assert.equal(loadPersistedSchema2EvidenceSnapshot({ pidexRoot, projectId, request_file: requestFile, request_id: schemaRequest.request_id }).ok, false);
});

test('loadPersistedSchema2EvidenceSnapshot rejects unsafe routes without echoing route data', () => {
  const cases = [
    ['newline injection', '/safe\nSEC057_REJECTED_NEWLINE'],
    ['control character', '/safe\u0000SEC057_REJECTED_CONTROL'],
    ['backslash', '/safe\\SEC057_REJECTED_BACKSLASH'],
    ['internal scheme host port', '/http://internal.service:42080/SEC057_REJECTED_HOST'],
    ['authority credentials', '//user:pass@internal.service/SEC057_REJECTED_AUTH'],
    ['embedded authority', '/safe//internal.service/SEC057_REJECTED_EMBEDDED_AUTH'],
    ['fragment', '/safe#SEC057_REJECTED_FRAGMENT'],
    ['oversize', `/${'x'.repeat(301)}SEC057_REJECTED_OVERSIZE`],
  ];
  for (const [name, route] of cases) {
    const { pidexRoot, projectId, archiveRoot } = setup();
    const schemaRequest = schema2Request({ request_id: `qa-schema2-route-${name.replaceAll(' ', '-')}`, viewports: [{ ...schema2Request().viewports[0], route }] });
    const requestFile = writeRequest(archiveRoot, `agents.output/qa/${schemaRequest.request_id}.json`, schemaRequest);
    const resultDir = browserSmokeResultDir(pidexRoot, projectId, schemaRequest.request_id);
    mkdirSync(resultDir, { recursive: true });
    writeFileSync(path.join(resultDir, 'browser-smoke-result.json'), JSON.stringify(schema2Result(schemaRequest)));
    const loaded = loadPersistedSchema2EvidenceSnapshot({ pidexRoot, projectId, request_file: requestFile, request_id: schemaRequest.request_id });
    assert.equal(loaded.ok, false, name);
    assert.equal(loaded.status_reason, 'browser-smoke-evidence-infra', name);
    assert.doesNotMatch(JSON.stringify(loaded), /SEC057_REJECTED_/, name);
    rmSync(pidexRoot, { recursive: true, force: true });
  }
});
