import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';
import { runProjectPipelineOrchestration, runProjectLifecycleActionInvocation } from './orchestrator.mjs';
import { invokeLifecycleActionFromOrdinaryResult } from './rule-exposure-tracer.mjs';
import { decideRuleLifecycleAction } from '../../../../../scripts/quality/rule-lifecycle-action.mjs';
import { loadPlan046ImpactResultExamples } from '../../../../../scripts/quality/fixtures/plan046-contract-examples.mjs';
import { parseImpactEvaluationBytes } from '../../../../../scripts/quality/rule-impact-results.mjs';

for (const enabled of [false, true]) {
  test(`real orchestration entry completes honestly without an enrolled result source (enabled=${enabled})`, async t => {
    const pidexRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-action-completion-'));
    t.after(() => rmSync(pidexRoot, { recursive: true, force: true }));
    const projectId = 'pp-action-completion';
    const archiveWorkspace = path.join(pidexRoot, 'archive-workspace');
    const record = createProjectRecord({ project_id: projectId, name: projectId });
    record.status = 'ready'; record.is_test_project = false;
    record.archive.path = path.join(pidexRoot, 'state/project-archives', projectId);
    record.control_project_path = path.join(pidexRoot, 'host-project');
    mkdirSync(record.archive.path, { recursive: true }); mkdirSync(record.control_project_path);
    saveProjectRecord(pidexRoot, record);
    const actionState = path.join(pidexRoot, 'action-state');
    let traced = 0;
    const result = await runProjectPipelineOrchestration({
      pidexRoot, projectId, task: 'Plan 051', phases: ['pidex-planner'], archiveWorkspace, moduleRules: false,
      ruleExposureEnv: { PIDEX_STATE_DIR: actionState, ...(enabled ? { PIDEX_LIFECYCLE_ACTION_ENABLED: '1' } : {}) },
      runner: args => {
        if (args[0] !== 'exec' || !args.includes('pi')) return 'ok';
        const context = 'agents.output/pidex-planner/artifact.md';
        mkdirSync(path.dirname(path.join(archiveWorkspace, context)), { recursive: true });
        writeFileSync(path.join(archiveWorkspace, context), '# fixture');
        return { status: 0, stdout: `<!-- ROUTING\ncontext_file: ${context}\n-->` };
      },
      ruleExposureTracer: () => {
        traced++;
        return { exposure: { exposure_id: `exposure:${'a'.repeat(64)}`, quality: 'complete', quality_flags: [] }, artifacts: {}, usable_for_evidence: true };
      },
    });
    assert.equal(result.ok, true); assert.equal(traced, 1);
    assert.equal(existsSync(actionState), false, 'no result source means no store to open or leak');
    assert.deepEqual(result.lifecycle_action, { status: 'no_op', reason: enabled ? 'action_unavailable' : 'kill_switch' });
  });
}

test('closed seam checks kill switch before source acquisition and contains input/invoker failures', async () => {
  let sources = 0; let invokes = 0; let closes = 0;
  const source = () => { sources++; return { store: { close() { closes++; } }, result_bytes: Buffer.from('{}'), result_digest: 'a'.repeat(64), current: { tier: 'project' } }; };
  const invoker = () => { invokes++; throw new Error('private failure'); };
  assert.deepEqual(await runProjectLifecycleActionInvocation({ source, invoker, env: {} }), { status: 'no_op', reason: 'kill_switch' });
  assert.equal(sources, 0);
  for (const nonAttestationFlag of ['test_project', 'unknown_test_state', 'mirror_degraded']) {
    assert.deepEqual(await runProjectLifecycleActionInvocation({ source, invoker, nonAttestationFlag, env: { PIDEX_LIFECYCLE_ACTION_ENABLED: '1' } }), { status: 'no_op', reason: 'non_attested' });
  }
  assert.equal(sources, 0);
  const env = { PIDEX_LIFECYCLE_ACTION_ENABLED: '1' };
  assert.deepEqual(await runProjectLifecycleActionInvocation({ source, invoker, env }), { status: 'no_op', reason: 'action_unavailable' });
  assert.equal(invokes, 1); assert.equal(closes, 0, 'caller owns a supplied store; helper never opens one');
  for (const bad of [() => { throw new Error('source failure'); }, () => null, () => ({ result_bytes: 'not-bytes' })]) {
    assert.deepEqual(await runProjectLifecycleActionInvocation({ source: bad, invoker, env }), { status: 'no_op', reason: 'action_unavailable' });
  }
});

test('helper reaches real closed invoker and decision validator, not an exposure-as-result substitute', async () => {
  const parsed = loadPlan046ImpactResultExamples().map(({ bytes }) => parseImpactEvaluationBytes(bytes));
  const safe = parsed.find(result => result.artifact.state !== 'repeated_observational_harm');
  const current = { tier: 'global', rule_id: 'pidex-global:pidex-implementer:quality' };
  const env = { PIDEX_LIFECYCLE_ACTION_ENABLED: '1' };
  let validated = 0;
  const invoker = input => invokeLifecycleActionFromOrdinaryResult({ ...input, trace: data => { validated++; return decideRuleLifecycleAction(data); } });
  const run = (result_bytes, result_digest, state = current) => runProjectLifecycleActionInvocation({
    env, invoker, source: () => ({ store: { persistLifecycleActionIntent() { assert.fail('pure no-op must not persist'); } }, result_bytes, result_digest, current: state }),
  });
  assert.deepEqual(await run(safe.bytes, safe.result_digest), { status: 'no_op', reason: 'result_not_harmful' });
  assert.deepEqual(await run(Buffer.from(`exposure:${'a'.repeat(64)}`), safe.result_digest), { status: 'no_op', reason: 'result_invalid' });
  assert.deepEqual(await run(safe.bytes, 'b'.repeat(64)), { status: 'no_op', reason: 'result_invalid' });
  const harmful = parsed.find(result => result.artifact.state === 'repeated_observational_harm');
  assert.deepEqual(await run(harmful.bytes, harmful.result_digest), { status: 'no_op', reason: 'authority_invalid' });
  assert.equal(validated, 4);
});
