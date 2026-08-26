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
    load(id) { if (id !== mockQueryId) return null; return `export function useDashboardQuery(key) { const data = key[0] === 'quality-contract-governor' ? { ok: true, status: 'pending', capability: 'manual-pending-only', runs: [], pending: [], approved: [], lifecycle_control: globalThis.__pidexLifecycleControl } : undefined; return { data, isLoading: false, isError: false, isFetching: false, refetch: async () => ({ data }) }; }`; },
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
  assert.match(quality, /role="status"/); assert.match(quality, /aria-live="polite"/); assert.match(quality, /<strong>pending<\/strong>/);
  assert.doesNotMatch(quality, /Hot mode active|auto-applied/);

  const settings = await renderRoute('/settings');
  assert.match(settings, /Settings/);
  assert.doesNotMatch(settings, /Hot mode ON|agent-review-auto-apply|Save governance config/);
  // ---- Plan048 Slice3B/4: lifecycle action card renders exact LS labels/aria, canonical-state column, controls (RED) ----
  const lifecycleRow = (overrides) => ({ transaction_digest: 'a'.repeat(64), rule_id: 'pidex-global:pidex-implementer:quality', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', handoff_stage: 'status_ready', receipt_digest: 'b'.repeat(64), accepted_commit: 'c'.repeat(40), content_hash: 'd'.repeat(64), receipt_lifecycle_state: 'deactivated', canonical_state: 'deactivated', mirror_verified: true, converged: true, epoch_open: false, local_stop_active: false, visible_label: 'Deactivated', aria: 'Rule deactivated', fallback: null, ...overrides });
  globalThis.__pidexLifecycleControl = { status: 'available', publications: [
    lifecycleRow({}),
    lifecycleRow({ transaction_digest: 'e'.repeat(64), rule_id: `project:${'1'.repeat(24)}:pidex-implementer:quality`, tier: 'project', scope_id: '1'.repeat(24), canonical_state: 'active', receipt_lifecycle_state: null, receipt_digest: null, accepted_commit: null, content_hash: null, epoch_open: true, visible_label: 'Active — monitoring', aria: 'Rule active and monitoring' }),
    lifecycleRow({ transaction_digest: 'f'.repeat(64), rule_id: 'pidex-global:pidex-implementer:seed', canonical_state: 'active-pinned', receipt_lifecycle_state: null, receipt_digest: null, accepted_commit: null, content_hash: null, epoch_open: true, visible_label: 'Active — pinned', aria: 'Rule active and pinned' }),
  ] };
  const lifecycle = await renderRoute('/quality');
  for (const pattern of [/Lifecycle actions/, /Authenticated reversible lifecycle controls\. Automatic deactivation needs no per-action approval\./, /aria-label="Global lifecycle actions table"/, /aria-label="Project lifecycle actions table"/, /<th>Rule<\/th><th>Lifecycle status<\/th><th>Canonical state<\/th><th>Actions<\/th>/, /aria-label="Rule deactivated"/, /aria-label="Rule active and monitoring"/, /aria-label="Rule active and pinned"/, />✓<\/span> Deactivated</, />✓<\/span> Active — monitoring</, />✓<\/span> Active — pinned</, />Active — monitoring<\/td>/, /Reactivate — monitor/, /Reactivate — pin/, /Stop locally/, /Deactivate on all hosts/, /Request refinement/, /Unpin/, /data-testid="quality-lifecycle-article"/]) assert.match(lifecycle, pattern);
  assert.ok(lifecycle.indexOf('<h3>Rule publication</h3>') < lifecycle.indexOf('<h3>Lifecycle actions</h3>'), 'lifecycle card must follow Rule publication'); assert.ok(lifecycle.indexOf('<h3>Lifecycle actions</h3>') < lifecycle.indexOf('<h3>Observational evidence</h3>'), 'lifecycle card must precede Observational evidence');
  assert.doesNotMatch(lifecycle, /canonical stopped|stopped — canonical|\/home\/|C:\\|cadence_digest|result_bytes/i);
  const lifecyclePanel = lifecycle.slice(lifecycle.indexOf('<h3>Lifecycle actions</h3>'), lifecycle.indexOf('</article>', lifecycle.indexOf('<h3>Lifecycle actions</h3>')));
  assert.doesNotMatch(lifecyclePanel, /VT11|receipt_json|action_json|rule_bytes/i);

  // LS-01 pending: no controls; canonical active truth separately visible
  globalThis.__pidexLifecycleControl = { status: 'available', publications: [lifecycleRow({ state: 'prepared', handoff_stage: null, canonical_state: 'active', receipt_digest: null, accepted_commit: null, content_hash: null, visible_label: 'Deactivation pending', aria: 'Deactivation pending remote acceptance' })] };
  const pending = await renderRoute('/quality');
  for (const pattern of [/Deactivation pending remote acceptance/, />…<\/span> Deactivation pending</, />Active — monitoring<\/td>/]) assert.match(pending, pattern);
  assert.doesNotMatch(pending.slice(pending.indexOf('Lifecycle actions'), pending.indexOf('Observational evidence')), /<button/, 'LS-01 must expose no action controls');

  // LS-05 stopped locally: stop disabled, canonical state separately visible
  globalThis.__pidexLifecycleControl = { status: 'available', publications: [lifecycleRow({ local_stop_active: true, canonical_state: 'active', visible_label: 'Stopped locally', aria: 'Rule stopped on this host only' })] };
  const stopped = await renderRoute('/quality');
  for (const pattern of [/Rule stopped on this host only/, />!<\/span> Stopped locally</, />Active — monitoring<\/td>/, /<button[^>]*disabled[^>]*>Stop locally<\/button>/]) assert.match(stopped, pattern);
  assert.doesNotMatch(stopped, /canonical stopped/);

  // fallback: unavailable row renders bounded copy and hides controls
  globalThis.__pidexLifecycleControl = { status: 'available', publications: [{ transaction_digest: '0'.repeat(64), rule_id: 'pidex-global:pidex-implementer:unknown', tier: 'global', scope_id: 'pidex-global', state: 'unavailable', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, receipt_lifecycle_state: null, canonical_state: null, mirror_verified: false, converged: false, epoch_open: false, local_stop_active: false, visible_label: 'Status unavailable', aria: 'Publication status unavailable', fallback: 'Publication status unavailable' }] };
  const unavailable = await renderRoute('/quality');
  assert.match(unavailable, /Publication status unavailable/);
  assert.doesNotMatch(unavailable.slice(unavailable.indexOf('Lifecycle actions'), unavailable.indexOf('Observational evidence')), /<button/, 'fallback row must hide controls');

  // empty: exact card-level empty copy
  globalThis.__pidexLifecycleControl = { status: 'available', publications: [] };
  const empty = await renderRoute('/quality');
  assert.match(empty, /No lifecycle actions available\./);

  // ---- M-1 (Plan048 review): LS-07 retry unlocks only after a fresh status refresh capability (RED) ----
  globalThis.__pidexLifecycleControl = { status: 'available', publications: [lifecycleRow({ state: 'deferred_remote_advanced', handoff_stage: null, receipt_digest: null, accepted_commit: null, content_hash: null, receipt_lifecycle_state: 'active-monitor', canonical_state: null, visible_label: 'Reactivation failed', aria: 'Reactivation failed; rule remains deactivated' })] };
  const failed = await renderRoute('/quality');
  for (const pattern of [/Reactivation failed; rule remains deactivated/, />!<\/span> Reactivation failed</, /<button[^>]*disabled[^>]*>Reactivate — monitor<\/button>/, /Lifecycle status refresh required/]) assert.match(failed, pattern);
  const { lifecycleRetryControl } = await server.ssrLoadModule('/routes/quality.tsx');
  const locked = { action: 'reactivate-monitor', label: 'Reactivate — monitor', disabled_reason: 'Lifecycle status refresh required', refresh_unlock: true };
  assert.equal(lifecycleRetryControl(locked, false).disabled_reason, 'Lifecycle status refresh required', 'retry stays locked before a fresh status refresh');
  assert.equal(lifecycleRetryControl(locked, true).disabled_reason, null, 'retry re-enables after a successful fresh status refresh');
} finally {
  await server.close();
}

console.log('rendered governor UI boundary tests passed');
