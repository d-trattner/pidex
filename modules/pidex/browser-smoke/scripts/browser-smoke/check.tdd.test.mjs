import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSER_SMOKE_STATUS } from './status.mjs';
import { runBrowserSmokeCheck } from './check.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-browser-smoke-check-')); }

function request(overrides = {}) {
  return {
    schema: 1,
    requester: 'pidex-qa',
    project_id: 'pidex-browser-smoke-demo',
    request_id: 'qa-phase-6-check',
    phase_run_id: 'pprun-abc123/pidex-qa/phase-6',
    created_at: '2026-07-01T12:00:00.000Z',
    preview: { managed: true, process: 'preview' },
    checks: [{ type: 'title', contains: 'Demo' }, { type: 'text', contains: 'Ready' }, { type: 'selector', exists: '.render-panel' }, { type: 'url', path_contains: '/' }, { type: 'console', errors: 'none' }],
    capture: { screenshot: true, console_errors: true },
    timeout_ms: 10000,
    ...overrides,
  };
}

function fakePlaywright({ title = 'Demo App', text = 'Ready body', selectorCount = 1, consoleErrors = [], launchOptions = [] } = {}) {
  const page = {
    on: (event, cb) => { if (event === 'console') for (const msg of consoleErrors) cb({ type: () => 'error', text: () => msg }); },
    goto: async () => {},
    title: async () => title,
    locator: (selector) => ({
      textContent: async () => selector === 'body' ? text : '',
      count: async () => selector === '.render-panel' ? selectorCount : 0,
    }),
    screenshot: async ({ path: file }) => { await import('node:fs').then((fs) => fs.writeFileSync(file, 'png')); },
  };
  return { chromium: { launch: async (options) => { launchOptions.push(options); return { newPage: async () => page, close: async () => {} }; } } };
}

test('runBrowserSmokeCheck passes safe checks and writes result evidence', async () => {
  const outputDir = tmp();
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request(), outputDir, playwright: fakePlaywright() });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.PASS);
  assert.equal(result.preview_url_source, 'caller-provided-url');
  assert.equal(result.ok, true);
  assert.equal(result.screenshot, 'screenshot.png');
  assert.equal(existsSync(path.join(outputDir, 'screenshot.png')), true);
  assert.equal(JSON.parse(readFileSync(path.join(outputDir, 'browser-smoke-result.json'), 'utf8')).status, BROWSER_SMOKE_STATUS.PASS);
});

test('runBrowserSmokeCheck accepts trusted previewUrlSource from host bridge', async () => {
  const outputDir = tmp();
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request(), outputDir, previewUrlSource: 'project-pipeline-registry', playwright: fakePlaywright() });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.PASS);
  assert.equal(result.preview_url_source, 'project-pipeline-registry');
  assert.equal(JSON.parse(readFileSync(path.join(outputDir, 'browser-smoke-result.json'), 'utf8')).preview_url_source, 'project-pipeline-registry');
});

test('runBrowserSmokeCheck reports failed feature when assertion fails and does not disable Chromium sandbox', async () => {
  const launchOptions = [];
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request(), outputDir: tmp(), playwright: fakePlaywright({ title: 'Other', launchOptions }) });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.FAILED_FEATURE);
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.type === 'title').ok, false);
  assert.deepEqual(launchOptions[0], { headless: true });
});

test('runBrowserSmokeCheck returns typed skip when Playwright is not configured', async () => {
  const outputDir = tmp();
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request(), outputDir, project: path.join(outputDir, 'missing-project'), stateDir: path.join(outputDir, 'missing-state') });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.SKIP_NOT_CONFIGURED);
  assert.equal(result.status_reason, 'playwright-not-configured');
  assert.equal(existsSync(path.join(outputDir, 'browser-smoke-result.json')), true);
});

test('runBrowserSmokeCheck rejects invalid/unsafe urls and arbitrary request before browser launch with result artifacts', async () => {
  const invalidUrlDir = tmp();
  const result = await runBrowserSmokeCheck({ url: 'file:///etc/passwd', request: request(), outputDir: invalidUrlDir, playwright: fakePlaywright() });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  assert.equal(result.status_reason, 'invalid-url');
  assert.equal(JSON.parse(readFileSync(path.join(invalidUrlDir, 'browser-smoke-result.json'), 'utf8')).status_reason, 'invalid-url');

  const remoteUrlDir = tmp();
  const remote = await runBrowserSmokeCheck({ url: 'https://example.com/', request: request(), outputDir: remoteUrlDir, playwright: fakePlaywright() });
  assert.equal(remote.status_reason, 'unsafe-url-host');

  const metadataUrlDir = tmp();
  const metadata = await runBrowserSmokeCheck({ url: 'http://169.254.169.254/latest/meta-data/', request: request(), outputDir: metadataUrlDir, playwright: fakePlaywright() });
  assert.equal(metadata.status_reason, 'unsafe-url-host');

  const lanUrlDir = tmp();
  const lan = await runBrowserSmokeCheck({ url: 'http://192.168.0.1/', request: request(), outputDir: lanUrlDir, playwright: fakePlaywright() });
  assert.equal(lan.status_reason, 'unsafe-url-host');

  const invalidRequestDir = tmp();
  const badRequest = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request({ checks: [{ type: 'javascript', source: 'alert(1)' }] }), outputDir: invalidRequestDir, playwright: fakePlaywright() });
  assert.equal(badRequest.status_reason, 'invalid-check-type');
  assert.equal(JSON.parse(readFileSync(path.join(invalidRequestDir, 'browser-smoke-result.json'), 'utf8')).status_reason, 'invalid-check-type');
});

test('runBrowserSmokeCheck confines output dir by realpath output root and rejects symlink escapes', async () => {
  const root = tmp();
  const outside = tmp();
  const symlinkDir = path.join(root, 'link-out');
  symlinkSync(outside, symlinkDir, 'dir');
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request(), outputDir: symlinkDir, outputRoot: root, playwright: fakePlaywright() });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  assert.equal(result.status_reason, 'invalid-output-dir');
  assert.equal(existsSync(path.join(outside, 'browser-smoke-result.json')), false);
});

test('runBrowserSmokeCheck redacts and caps console errors', async () => {
  const errors = [
    'Authorization: Bearer abc.def.ghi',
    'api_key=secret-value',
    'token access_token=super-secret',
    'openai sk-abcdefghijklmnopqrstuvwxyz',
    ...Array.from({ length: 40 }, (_, i) => `extra-${i}-${'x'.repeat(200)}`),
  ];
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request(), outputDir: tmp(), playwright: fakePlaywright({ consoleErrors: errors }) });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.FAILED_FEATURE);
  assert.ok(result.console_errors.length <= 20);
  assert.ok(JSON.stringify(result.console_errors).length < 5000);
  assert.ok(!JSON.stringify(result.console_errors).includes('abc.def.ghi'));
  assert.ok(!JSON.stringify(result.console_errors).includes('secret-value'));
  assert.ok(!JSON.stringify(result.console_errors).includes('sk-abcdefghijklmnopqrstuvwxyz'));
});

test('runBrowserSmokeCheck writes blocked result when Chromium API is unavailable', async () => {
  const outputDir = tmp();
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: request(), outputDir, playwright: {} });
  assert.equal(result.status, BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  assert.equal(result.status_reason, 'chromium-api-unavailable');
  assert.equal(JSON.parse(readFileSync(path.join(outputDir, 'browser-smoke-result.json'), 'utf8')).status_reason, 'chromium-api-unavailable');
});

test('runBrowserSmokeCheck writes blocked result for malformed or unreadable request files', async () => {
  const malformedDir = tmp();
  const malformedRequest = path.join(malformedDir, 'request.json');
  writeFileSync(malformedRequest, '{not-json');
  const malformed = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', requestPath: malformedRequest, outputDir: malformedDir, playwright: fakePlaywright() });
  assert.equal(malformed.status, BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  assert.equal(malformed.status_reason, 'invalid-request');
  assert.equal(JSON.parse(readFileSync(path.join(malformedDir, 'browser-smoke-result.json'), 'utf8')).status_reason, 'invalid-request');

  const missingDir = tmp();
  const missing = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', requestPath: path.join(missingDir, 'missing.json'), outputDir: missingDir, playwright: fakePlaywright() });
  assert.equal(missing.status, BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  assert.equal(missing.status_reason, 'invalid-request');
  assert.equal(JSON.parse(readFileSync(path.join(missingDir, 'browser-smoke-result.json'), 'utf8')).status_reason, 'invalid-request');
});
