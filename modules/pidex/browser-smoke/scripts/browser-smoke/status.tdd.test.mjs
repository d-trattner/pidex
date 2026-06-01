import assert from 'node:assert/strict';
import { BROWSER_SMOKE_STATUS, BROWSER_SMOKE_STATUS_VALUES, isBrowserSmokeStatus } from './status.mjs';

assert.deepEqual(BROWSER_SMOKE_STATUS, Object.freeze({
  PASS: 'BROWSER-SMOKE-PASS',
  SKIP_NOT_REQUIRED: 'BROWSER-SMOKE-SKIP-NOT-REQUIRED',
  SKIP_NOT_CONFIGURED: 'BROWSER-SMOKE-SKIP-NOT-CONFIGURED',
  BLOCKED_INFRA: 'BROWSER-SMOKE-BLOCKED-INFRA',
  FAILED_FEATURE: 'BROWSER-SMOKE-FAILED-FEATURE',
}));

assert.equal(BROWSER_SMOKE_STATUS_VALUES.length, 5);
for (const value of BROWSER_SMOKE_STATUS_VALUES) assert.equal(isBrowserSmokeStatus(value), true);
assert.equal(isBrowserSmokeStatus('BROWSER-SMOKE-SKIP'), false);

console.log('browser-smoke status contract tests passed');
