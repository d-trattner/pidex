import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_SMOKE_STATUS } from './status.mjs';
import { validateBrowserSmokeCheck, validateBrowserSmokeRequest } from './request-schema.mjs';

function request(overrides = {}) {
  return {
    schema: 1,
    requester: 'pidex-qa',
    project_id: 'pidex-demo-project',
    request_id: 'qa-phase-6-20260701T120000Z',
    phase_run_id: 'pprun-abc123/pidex-qa/phase-6',
    created_at: '2026-07-01T12:00:00.000Z',
    preview: { managed: true, process: 'preview' },
    checks: [
      { type: 'title', contains: 'Demo' },
      { type: 'text', contains: 'Ready' },
      { type: 'selector', exists: '.render-panel' },
    ],
    capture: { screenshot: true, console_errors: true },
    timeout_ms: 10000,
    reason: 'validate preview',
    ...overrides,
  };
}

test('validateBrowserSmokeRequest accepts project-agnostic safe QA request', () => {
  const result = validateBrowserSmokeRequest(request());
  assert.equal(result.ok, true);
  assert.equal(result.request.requester, 'pidex-qa');
  assert.equal(result.request.preview.process, 'preview');
  assert.equal(result.request.checks.length, 3);
});

test('validateBrowserSmokeRequest rejects arbitrary js shell and unmanaged preview', () => {
  assert.equal(validateBrowserSmokeRequest(request({ checks: [{ type: 'javascript', source: 'alert(1)' }] })).status, BROWSER_SMOKE_STATUS.BLOCKED_INFRA);
  assert.equal(validateBrowserSmokeRequest(request({ checks: [{ type: 'shell', command: 'rm -rf /' }] })).ok, false);
  assert.equal(validateBrowserSmokeRequest(request({ preview: { managed: false } })).status_reason, 'invalid-preview');
});

test('validateBrowserSmokeRequest keeps browser-smoke generic without requester policy beyond shape', () => {
  const result = validateBrowserSmokeRequest(request({ requester: 'pidex-devops', checks: [{ type: 'title', contains: 'Allowed by generic substrate; bridge restricts devops' }] }));
  assert.equal(result.ok, true);
});

test('validateBrowserSmokeCheck constrains selectors urls and console checks', () => {
  assert.equal(validateBrowserSmokeCheck({ type: 'selector', exists: '.card .title' }).ok, true);
  assert.equal(validateBrowserSmokeCheck({ type: 'selector', exists: 'div; body { color:red }' }).status_reason, 'invalid-selector');
  assert.equal(validateBrowserSmokeCheck({ type: 'url', path_contains: '/dashboard' }).ok, true);
  assert.equal(validateBrowserSmokeCheck({ type: 'url' }).ok, false);
  assert.equal(validateBrowserSmokeCheck({ type: 'console', errors: 'none' }, 'pidex-devops').ok, true);
  assert.equal(validateBrowserSmokeCheck({ type: 'console', errors: 'all' }, 'pidex-devops').status_reason, 'invalid-check');
});

test('validateBrowserSmokeRequest rejects invalid ids timeout and missing checks', () => {
  assert.equal(validateBrowserSmokeRequest(request({ request_id: '../escape' })).ok, false);
  assert.equal(validateBrowserSmokeRequest(request({ phase_run_id: 'x' })).ok, false);
  assert.equal(validateBrowserSmokeRequest(request({ timeout_ms: 1000000 })).status_reason, 'invalid-timeout');
  assert.equal(validateBrowserSmokeRequest(request({ checks: [] })).status_reason, 'invalid-checks');
});
