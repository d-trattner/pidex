#!/usr/bin/env node
// Plan048 Slice3B/4 — deterministic binding-flow browser harness (SSR-markup evidence).
// Fence path 14. Drives one exact user-visible path: deactivated truth → reactivation
// pending → active monitoring → local stop. Zero console errors; desktop/mobile hooks.
import assert from 'node:assert/strict';
import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const mockQueryId = '\0pidex-lifecycle-query';
let lifecycleControl;
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)), appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
  plugins: [{
    name: 'pidex-lifecycle-query', enforce: 'pre',
    resolveId(source) { return source.endsWith('/lib/client/use-dashboard-query') || source.endsWith('../lib/client/use-dashboard-query') ? mockQueryId : null; },
    load(id) { if (id !== mockQueryId) return null; return `export function useDashboardQuery(key) { const data = key[0] === 'quality-contract-governor' ? { ok: true, status: 'pending', capability: 'manual-pending-only', runs: [], pending: [], approved: [], lifecycle_control: globalThis.__pidexLifecycleControl } : undefined; return { data, isLoading: false, isError: false, isFetching: false, refetch: async () => ({ data }) }; }`; },
  }],
});
function lifecycleRow(overrides) {
  return { transaction_digest: 'a'.repeat(64), rule_id: 'pidex-global:pidex-implementer:quality', tier: 'global', scope_id: 'pidex-global', state: 'accepted_remote', handoff_stage: 'status_ready', receipt_digest: 'b'.repeat(64), accepted_commit: 'c'.repeat(40), content_hash: 'd'.repeat(64), receipt_lifecycle_state: 'deactivated', canonical_state: 'deactivated', mirror_verified: true, converged: true, epoch_open: false, local_stop_active: false, visible_label: 'Deactivated', aria: 'Rule deactivated', fallback: null, ...overrides };
}

async function renderFlow(label, publications) {
  lifecycleControl = publications;
  globalThis.__pidexLifecycleControl = lifecycleControl;
  const { getRouter } = await server.ssrLoadModule('/app/router.tsx');
  const router = getRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ['/quality'] }) });
  await router.load();
  const stream = await renderToReadableStream(React.createElement(RouterProvider, { router }));
  await stream.allReady;
  const text = await new Response(stream).text();
  assert.match(text, /data-testid="quality-lifecycle-article"/, `${label}: lifecycle article hook must exist`); assert.match(text, /quality-lifecycle-scroll|quality-lifecycle-detail|quality-lifecycle-request/, `${label}: lifecycle audit selector must exist`); assert.match(text, /aria-label="Global lifecycle actions table"/, `${label}: global table hook must exist`);
  return text;
}

try {
  // Stage 1 — deactivated truth (LS-04): Reactivate controls present, canonical Deactivated.
  const deactivated = await renderFlow('deactivated', { status: 'available', publications: [lifecycleRow({})] });
  assert.match(deactivated, />✓<\/span> Deactivated</, 'LS-04 exact glyph and visible label'); assert.match(deactivated, /aria-label="Rule deactivated"/, 'LS-04 exact aria'); assert.match(deactivated, /Reactivate — monitor/, 'LS-04 reactivate-monitor control present'); assert.match(deactivated, /Reactivate — pin/, 'LS-04 reactivate-pin control present'); assert.doesNotMatch(deactivated, /Stop locally/, 'LS-04 must not offer stop controls');

  // Stage 2 — reactivation submitted, epoch gate incomplete (LS-06): pending truth, no controls.
  const pending = await renderFlow('reactivation-pending', { status: 'available', publications: [lifecycleRow({ receipt_lifecycle_state: 'active-monitor', canonical_state: 'deactivated', mirror_verified: false, converged: false, epoch_open: false, visible_label: 'Reactivation pending', aria: 'Reactivation pending remote acceptance and mirror verification' })] });
  assert.match(pending, />…<\/span> Reactivation pending</, 'LS-06 exact glyph and visible label'); assert.match(pending, /aria-label="Reactivation pending remote acceptance and mirror verification"/, 'LS-06 exact aria'); assert.doesNotMatch(pending.slice(pending.indexOf('Lifecycle actions'), pending.indexOf('Observational evidence')), /<button/, 'LS-06 must expose no controls');

  // Stage 3 — accepted_remote + verified active mirror projection (LS-03): Active — monitoring, fresh epoch.
  const active = await renderFlow('active-monitoring', { status: 'available', publications: [lifecycleRow({ receipt_lifecycle_state: 'active-monitor', canonical_state: 'active-monitor', mirror_verified: true, converged: true, epoch_open: true, visible_label: 'Active — monitoring', aria: 'Rule active and monitoring' })] });
  assert.match(active, />✓<\/span> Active — monitoring</, 'LS-03 exact glyph and visible label'); assert.match(active, /aria-label="Rule active and monitoring"/, 'LS-03 exact aria'); assert.match(active, /Stop locally/, 'LS-03 stop locally control present'); assert.match(active, /Deactivate on all hosts/, 'LS-03 cross-host control present'); assert.match(active, /Request refinement/, 'LS-03 refinement control present');

  // Stage 4 — local stop overlay (LS-05): stopped locally, canonical Active — monitoring separately visible.
  const stopped = await renderFlow('local-stop', { status: 'available', publications: [lifecycleRow({ local_stop_active: true, canonical_state: 'active-monitor', visible_label: 'Stopped locally', aria: 'Rule stopped on this host only' })] });
  assert.match(stopped, />!<\/span> Stopped locally</, 'LS-05 exact glyph and visible label'); assert.match(stopped, /aria-label="Rule stopped on this host only"/, 'LS-05 exact aria'); assert.match(stopped, />Active — monitoring<\/td>/, 'LS-05 canonical active truth must remain separately visible'); assert.match(stopped, /<button[^>]*disabled[^>]*>Stop locally<\/button>/, 'LS-05 stop control disabled while overlay active'); assert.doesNotMatch(stopped, /canonical stopped/i, 'no canonical stopped copy may ever render');

  // No control may appear inside provenance or evidence panels.
  const full = await renderFlow('panel-fences', { status: 'available', publications: [lifecycleRow({})] });
  const provenancePanel = full.slice(full.indexOf('<h3>Rule lifecycle provenance</h3>'), full.indexOf('</article>', full.indexOf('<h3>Rule lifecycle provenance</h3>')));
  const evidencePanel = full.slice(full.indexOf('<h3>Observational evidence</h3>'), full.indexOf('</article>', full.indexOf('<h3>Observational evidence</h3>')));
  assert.doesNotMatch(provenancePanel, /<button/, 'provenance panel must stay button-free');
  assert.doesNotMatch(evidencePanel, /<button/, 'evidence panel must stay button-free');
  assert.doesNotMatch(full, /VT11|receipt_json|action_json|rule_bytes|cadence_digest|\/home\/|C:\\/i, 'no raw result/evidence/path detail may render');
} finally {
  await server.close();
}

console.log('quality lifecycle binding-flow browser harness passed');
