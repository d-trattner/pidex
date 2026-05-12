import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('token consumption route files return generic 500 error string', async () => {
  const dashText = await readFile(new URL('../routes/api/token-consumption.tsx', import.meta.url), 'utf8');
  const underscoreText = await readFile(new URL('../routes/api/token_consumption.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(dashText, /error\.message/, 'dash route must not leak raw error.message');
  assert.match(dashText, /errorResponse\('token consumption failed',\s*500\)/, 'dash route must return generic message');

  assert.doesNotMatch(underscoreText, /error\.message/, 'underscore route must not leak raw error.message');
  assert.match(underscoreText, /errorResponse\('token consumption failed',\s*500\)/, 'underscore route must return generic message');
});
