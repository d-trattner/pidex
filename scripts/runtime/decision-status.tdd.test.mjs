// Prepared for the post-Point4 validation phase. Not evidence until executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDecisionStatus, formatDecisionStatus, isDecisionStatus } from './decision-status.mjs';
const scope = { platform: 'linux', arch: 'x64', node_version: '22.22.0', pi_version: '0.85.1', mode: 'host-direct' };
const options = { observer: 'pi', observedAt: '2026-09-11T12:00:00.000Z' };
function raw(extra = {}) {
  return { schema_version: 1, status: 'ready', binding: 'baseline', observed_scope: scope,
    bound_baseline_id: 'baseline:' + 'a'.repeat(64), selected_baseline_id: 'baseline:' + 'a'.repeat(64), can_dispatch: true,
    load_assurance: 'controlled_start', load_observed_source_commit: 'b'.repeat(40), reasons: [], source: { coverage: 'complete', runtime: { commit: 'b'.repeat(40) } }, config: { coverage: 'complete' }, ...extra };
}
test('readiness, accepted scope, load, installation and project completion are distinct', () => {
  const d = projectDecisionStatus(raw(), options);
  assert.equal(d.readiness.state, 'ready_bound_scope'); assert.equal(d.validation.state, 'accepted_scope');
  assert.equal(d.load.state, 'controlled_start'); assert.equal(d.loaded_source_commit, 'b'.repeat(40)); assert.equal(d.installation.state, 'unconfirmed'); assert.equal(d.task_completion.state, 'not_assessed');
  assert.equal(isDecisionStatus(d), true);
  assert.equal(isDecisionStatus({ schema: d.schema, observer: 'dashboard' }), false);
  assert.equal(isDecisionStatus({ ...d, observer: 'dashboard' }), false);
  assert.equal(d.next_action.automatic, false); assert.equal(d.next_action.id, 'continue_bound_scope');
  assert.match(formatDecisionStatus(d), /Installiert: Nicht nachgewiesen/);
});
test('dashboard and CLI cannot inherit a Pi-process ready verdict', () => {
  for (const observer of ['dashboard', 'cli']) {
    const d = projectDecisionStatus(raw(), { ...options, observer });
    assert.notEqual(d.readiness.state, 'ready_bound_scope'); assert.equal(d.load.state, 'unconfirmed'); assert.equal(d.loaded_source_commit, null); assert.equal(d.next_action.id, 'inspect_pi_session');
  }
});
test('legacy permission and selected baseline alone do not imply acceptance', () => {
  const d = projectDecisionStatus(raw({ status: 'unregistered', binding: 'unbound', bound_baseline_id: null, load_assurance: 'observed_at_load' }), options);
  assert.equal(d.dispatch_policy_hint, 'legacy_permitted_not_accepted'); assert.equal(d.validation.state, 'not_bound'); assert.equal(d.readiness.state, 'unconfirmed');
  assert.match(formatDecisionStatus(d), /Legacy-Dispatch erlaubt ≠/);
});
test('accepted scope remains distinct from missing load confirmation', () => {
  const d = projectDecisionStatus(raw({ status: 'unconfirmed', load_assurance: 'observed_at_load', reasons: [{ code: 'LOAD_UNCONFIRMED' }] }), options);
  assert.equal(d.validation.state, 'accepted_scope'); assert.equal(d.readiness.state, 'blocked_or_unconfirmed');
  const invalidLoad = projectDecisionStatus(raw({ status: 'unconfirmed', reasons: [{ code: 'LOAD_UNCONFIRMED' }] }), options);
  assert.equal(invalidLoad.load.state, 'unconfirmed');
});
test('drift, scope, lock and unknown data cannot become ready', () => {
  for (const [status, reason, action] of [
    ['restart_required', 'SOURCE_DRIFT', 'inspect_source_then_restart'],
    ['configuration_changed', 'CONFIG_DRIFT', 'inspect_configuration'],
    ['scope_not_accepted', 'SCOPE_NOT_ACCEPTED', 'inspect_scope'],
    ['invalid', 'STORE_LOCKED', 'inspect_blocker'],
  ]) {
    const d = projectDecisionStatus(raw({ status, reasons: [{ code: reason }] }), options);
    assert.notEqual(d.readiness.state, 'ready_bound_scope'); assert.equal(d.validation.state, 'unconfirmed'); assert.equal(d.next_action.id, action);
  }
  assert.equal(projectDecisionStatus(null, options).runtime_status, 'unavailable');
  assert.notEqual(projectDecisionStatus(raw({ observed_scope: null }), options).readiness.state, 'ready_bound_scope');
});
test('projection is pure, bounded and never emits raw paths/config/errors', () => {
  const input = raw({ source: { coverage: 'complete', runtime: { root: '/private/SENTINEL', commit: 'b'.repeat(40) } }, config: { coverage: 'complete', value: 'SENTINEL' }, reasons: [{ code: '/private/SENTINEL' }] });
  const before = JSON.stringify(input); const d = projectDecisionStatus(input, options);
  assert.equal(JSON.stringify(input), before); assert(!JSON.stringify(d).includes('SENTINEL')); assert.notEqual(d.readiness.state, 'ready_bound_scope');
  assert.throws(() => projectDecisionStatus(input, { observer: 'remote-pi' }), /DECISION_OBSERVER_INVALID/);
});
