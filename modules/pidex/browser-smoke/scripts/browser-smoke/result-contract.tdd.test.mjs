import test from 'node:test';
import assert from 'node:assert/strict';
import { BROWSER_SMOKE_STATUS } from './status.mjs';
import { buildBrowserSmokeResult, isSafeRelativeEvidencePath, validateBrowserSmokeResult } from './result-contract.mjs';

test('buildBrowserSmokeResult emits canonical hyphenated browser-smoke status', () => {
  const result = buildBrowserSmokeResult({
    status: BROWSER_SMOKE_STATUS.PASS,
    project_id: 'pidex-demo-project',
    request_id: 'qa-phase-6-20260701T120000Z',
    phase_run_id: 'pprun-abc123/pidex-qa/phase-6',
    url: 'http://localhost:42080',
    checks: [{ type: 'title', ok: true }],
    screenshot: 'browser-smoke/qa-phase-6-20260701T120000Z/screenshot.png',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'BROWSER-SMOKE-PASS');
  assert.equal(validateBrowserSmokeResult(result).ok, true);
});

test('validateBrowserSmokeResult rejects invented statuses and unsafe screenshot paths', () => {
  const base = buildBrowserSmokeResult({ project_id: 'pidex-demo-project', request_id: 'req-1', phase_run_id: 'pprun-1/pidex-qa/phase-6' });
  assert.equal(validateBrowserSmokeResult({ ...base, status: 'PASSED' }).status_reason, 'invalid-status');
  assert.equal(validateBrowserSmokeResult({ ...base, screenshot: '/tmp/secret.png' }).status_reason, 'invalid-screenshot-path');
  assert.equal(validateBrowserSmokeResult({ ...base, screenshot: '../escape.png' }).status_reason, 'invalid-screenshot-path');
});

test('isSafeRelativeEvidencePath allows only relative archive references', () => {
  assert.equal(isSafeRelativeEvidencePath('browser-smoke/req/screenshot.png'), true);
  assert.equal(isSafeRelativeEvidencePath('C:/Users/Daniel/secret.png'), false);
  assert.equal(isSafeRelativeEvidencePath('/home/daniel/secret.png'), false);
  assert.equal(isSafeRelativeEvidencePath('browser-smoke/../secret.png'), false);
});
