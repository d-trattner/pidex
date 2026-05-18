import test from 'node:test';
import assert from 'node:assert/strict';

import { authorizeProviderLimitsRequest } from './provider-limits-auth.ts';

test.afterEach(() => {
  delete process.env.PIDEX_DASHBOARD_PUBLIC_BIND;
  delete process.env.PIDEX_PROVIDER_LIMITS_TOKEN;
  delete process.env.PROVIDER_LIMITS_TOKEN;
  delete process.env.PIDEX_PROVIDER_LIMITS_PUBLIC_READ;
});

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

test('public bind denies loopback-host spoof without token', () => {
  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';
  const spoofed = new Request('http://127.0.0.1:18777/api/provider-limits');
  const result = authorizeProviderLimitsRequest(spoofed, { method: 'GET' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('public bind allows read with valid token', () => {
  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';
  process.env.PIDEX_PROVIDER_LIMITS_TOKEN = 'secret';
  const request = new Request('http://127.0.0.1:18777/api/provider-limits', {
    headers: { authorization: 'Bearer secret' },
  });
  const result = authorizeProviderLimitsRequest(request, { method: 'GET' });
  assert.equal(result.allowed, true);
});

test('public bind allows same-origin browser reads without public token', () => {
  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';
  const read = new Request('http://pi.lan:18777/api/provider-limits', {
    headers: { referer: 'http://pi.lan:18777/usage' },
  });
  assert.equal(authorizeProviderLimitsRequest(read, { method: 'GET' }).allowed, true);

  const fetchRead = new Request('http://pi.lan:18777/api/provider-limits', {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  assert.equal(authorizeProviderLimitsRequest(fetchRead, { method: 'GET' }).allowed, true);
});

test('public bind can opt into public read while keeping writes protected', () => {
  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';
  process.env.PIDEX_PROVIDER_LIMITS_PUBLIC_READ = '1';
  const read = new Request('http://pi.lan:18777/api/provider-limits');
  assert.equal(authorizeProviderLimitsRequest(read, { method: 'GET' }).allowed, true);

  const write = new Request('http://pi.lan:18777/api/provider-limits', {
    method: 'POST',
    headers: { origin: 'http://pi.lan:18777' },
  });
  const result = authorizeProviderLimitsRequest(write, { method: 'POST' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('public bind write still blocks cross-origin even with token', () => {
  process.env.PIDEX_DASHBOARD_PUBLIC_BIND = '1';
  process.env.PIDEX_PROVIDER_LIMITS_TOKEN = 'secret';
  const request = new Request('http://127.0.0.1:18777/api/provider-limits', {
    method: 'POST',
    headers: {
      authorization: 'Bearer secret',
      origin: 'http://evil.test',
    },
  });
  const result = authorizeProviderLimitsRequest(request, { method: 'POST' });
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});
