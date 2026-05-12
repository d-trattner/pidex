import test from 'node:test';
import assert from 'node:assert/strict';

import { authorizeProviderLimitsRequest } from './provider-limits-auth.ts';

test('blocks non-local read without token', () => {
  const request = new Request('http://192.168.1.10:18777/api/provider-limits');
  const result = authorizeProviderLimitsRequest(request, { method: 'GET' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('allows local write only with same-origin origin', () => {
  const ok = new Request('http://127.0.0.1:18777/api/provider-limits', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:18777' },
  });
  const bad = new Request('http://127.0.0.1:18777/api/provider-limits', {
    method: 'POST',
    headers: { origin: 'http://evil.test' },
  });
  assert.equal(authorizeProviderLimitsRequest(ok, { method: 'POST' }).allowed, true);
  const denied = authorizeProviderLimitsRequest(bad, { method: 'POST' });
  assert.equal(denied.allowed, false);
  assert.equal(denied.status, 403);
});
