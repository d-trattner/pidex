// Prepared only; execution deferred until Point4 implementation is complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readDashboardDecisionStatus } from './decision-status.ts';

test('server adapter selects only configured root and never forwards a Pi ready claim', () => {
  let calls = 0;
  const result = readDashboardDecisionStatus((roots, options) => {
    calls++; assert.equal(roots.bootstrapRoot, roots.runtimeRoot); assert.equal(options.observer, 'dashboard');
    return { schema_version: 1, status: 'ready', binding: 'baseline', bound_baseline_id: 'baseline:' + 'a'.repeat(64), can_dispatch: true, load_assurance: 'controlled_start', reasons: [], config: { coverage: 'complete', omitted: 'DO_NOT_EMIT' }, source: { coverage: 'complete', runtime: { root: '/DO_NOT_EMIT', commit: 'b'.repeat(40) } }, observed_scope: { platform: 'linux', arch: 'x64', node_version: '22', pi_version: '0.85', mode: 'host-direct' } };
  });
  assert.equal(calls, 1); assert.equal(result.observer, 'dashboard'); assert.notEqual(result.readiness.state, 'ready_bound_scope'); assert(!JSON.stringify(result).includes('DO_NOT_EMIT'));
});
test('observer errors are redacted and unavailable, never empty-success data', () => {
  const result = readDashboardDecisionStatus(() => { throw Error('/private/DO_NOT_EMIT'); });
  assert.equal(result.runtime_status, 'unavailable'); assert(!JSON.stringify(result).includes('DO_NOT_EMIT'));
});
test('dashboard runtime read is manual and separate from project KPI polling', () => {
  const panel = fs.readFileSync(new URL('../../components/runtime-decision-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /enabled: false/); assert.match(panel, /retry: false/); assert.match(panel, /gcTime: 0/); assert.doesNotMatch(panel, /refetchInterval:/);
  assert.match(panel, /!query.isError && !query.isFetching/); assert.match(panel, /aria-live="polite"/);
  const route = fs.readFileSync(new URL('../../routes/api/summary.tsx', import.meta.url), 'utf8');
  assert(route.indexOf('readDashboardDecisionStatus()') < route.indexOf('await getSummary('));
});
