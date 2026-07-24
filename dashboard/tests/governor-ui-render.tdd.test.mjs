#!/usr/bin/env node
import assert from 'node:assert/strict';
import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const mockQueryId = '\0pidex-governor-ui-query';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
  plugins: [{
    name: 'pidex-governor-ui-query',
    enforce: 'pre',
    resolveId(source) { return source.endsWith('/lib/client/use-dashboard-query') || source.endsWith('../lib/client/use-dashboard-query') ? mockQueryId : null; },
    load(id) { if (id !== mockQueryId) return null; return `export function useDashboardQuery(key) { const data = key[0] === 'quality-contract-governor' ? { capability: 'manual-pending-only', runs: [], pending: [], approved: [] } : undefined; return { data, isLoading: false, isError: false, isFetching: false, refetch: async () => ({ data }) }; }`; },
  }],
});

async function renderRoute(route) {
  const { getRouter } = await server.ssrLoadModule('/app/router.tsx');
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [route] }) });
  await router.load();
  const stream = await renderToReadableStream(React.createElement(RouterProvider, { router }));
  await stream.allReady;
  return new Response(stream).text();
}

try {
  const quality = await renderRoute('/quality');
  assert.match(quality, /Manual contract governance/);
  assert.match(quality, /The governor is manual and pending-only/);
  assert.match(quality, /cannot approve, apply, delegate, or validate/);
  assert.match(quality, />pending-only</);
  assert.doesNotMatch(quality, /Hot mode active|auto-applied/);

  const settings = await renderRoute('/settings');
  assert.match(settings, /Settings/);
  assert.doesNotMatch(settings, /Hot mode ON|agent-review-auto-apply|Save governance config/);
} finally {
  await server.close();
}

console.log('rendered governor UI boundary tests passed');
