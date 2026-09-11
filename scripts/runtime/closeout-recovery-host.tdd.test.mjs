import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { recordPipelineEvent, resolvePlanReviewAuthority, inspectHostCloseout } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';
import { spawnObservedExecution } from './review-execution.mjs';

test('exported host boundary captures before post-return failure; resume never calls runner or learning source', { skip: process.platform !== 'linux' }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-closeout-host-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = path.join(root, 'runtime'); const project = path.join(root, 'project'); const stateDir = path.join(root, 'state'); fs.mkdirSync(project);
  for (const name of ['agents', 'config', 'scripts']) fs.mkdirSync(path.join(runtime, name), { recursive: true });
  fs.writeFileSync(path.join(runtime, 'package.json'), '{"name":"pidex","version":"0.0.0"}');
  fs.writeFileSync(path.join(runtime, 'config/agents.json'), '{"defaults":{"provider":"pi"},"agents":{}}');
  fs.writeFileSync(path.join(runtime, 'agents/pidex-retrospective.md'), '---\nname: pidex-retrospective\n---\nFixture only.');
  const prior = process.env.PIDEX_ROOT; let boundary;
  try { process.env.PIDEX_ROOT = runtime; boundary = (await import('../../extensions/pidex/index.ts?closeout-recovery-host')).executeHostAgentBoundary; }
  finally { if (prior === undefined) delete process.env.PIDEX_ROOT; else process.env.PIDEX_ROOT = prior; }
  const context = { project, stateDir, planId: 'plan-001', pipelineId: 'host-recovery-001' };
  recordPipelineEvent({ ...context, plan: context.planId, event: 'pipeline_started' });
  const closeout = { action: 'start', planId: context.planId, pipelineId: context.pipelineId, artifactPath: 'agents.output/retrospective/001.md' };
  const params = { agent: 'pidex-retrospective', task: 'Historical context Plan 999, actual target is structurally bound.', closeout };
  let calls = 0;
  const options = {
    agentCwd: project, reviewLifecycle: { stateDir, pipelineId: context.pipelineId },
    loadConfig: () => ({ defaults: { provider: 'pi', model: 'openai-codex/gpt-5.6-terra', effort: 'medium' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    automaticRetrospectiveSource: () => { throw Error('must not start automatic learning'); },
    runConfigured: async p => {
      calls++; assert.match(p.task, /^Plan: 001/); assert.equal(p.reviewExecution, undefined); assert.equal(p.closeoutExecution.binding.kind, 'closeout');
      const child = spawnObservedExecution({ stateRoot: stateDir, binding: p.closeoutExecution.binding, command: process.execPath, args: ['-e', 'process.exitCode=0'], cwd: project, env: { PATH: process.env.PATH, HOME: root }, onProcessStarted: p.onProcessStarted, maxRuntimeMs: 3000 }); await once(child.proc, 'close');
      const id = p.closeoutExecution.binding.dispatchId;
      const finalText = `<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-pi\npost_retro_handoffs: none\ncloseout_dispatch: ${id}\ncloseout_obligations: none\ncontext_file: ${closeout.artifactPath}\n-->`;
      fs.mkdirSync(path.dirname(path.join(project, closeout.artifactPath)), { recursive: true }); fs.writeFileSync(path.join(project, closeout.artifactPath), finalText);
      p.onCloseoutReturned({ agent: p.agent, provider: 'pi', exitCode: 0, finalText, stderr: 'not stored', credentials: 'not stored' });
      throw Error('post-return-metrics-failure');
    },
  };
  await assert.rejects(boundary(params, options), /post-return-metrics-failure.*closeout_dispatch=/);
  const rows = resolvePlanReviewAuthority(context).rows; const id = rows.find(r => r.event_type === 'pipeline_closeout_dispatch_started').metadata.id;
  assert(rows.some(r => r.event_type === 'pipeline_closeout_return_captured')); assert(!JSON.stringify(rows).includes('not stored'));
  fs.unlinkSync(path.join(project, closeout.artifactPath));
  const resumed = await boundary({ ...params, closeout: { ...closeout, action: 'resume', dispatchId: id } }, options);
  assert.equal(resumed.replayed, true); assert.equal(calls, 1); assert.equal(resumed.closeoutCompletion.pendingObligations[0].actor, 'pidex-pi');
  await boundary({ ...params, closeout: { ...closeout, action: 'resume', dispatchId: id } }, options); assert.equal(calls, 1);
  assert.equal(inspectHostCloseout({ ...context, dispatchId: id }).status, 'completed');
  await assert.rejects(boundary({ ...params, closeout: { ...closeout, action: 'resume', dispatchId: id } }, { ...options, loadConfig: () => ({ defaults: { provider: 'pi', model: 'changed' }, agents: {} }) }), /SCOPE_CHANGED/); assert.equal(calls, 1);
  await assert.rejects(boundary(params, { ...options, resolveSandboxState: () => ({ enabled: true }), probeSandbox: () => { throw Error('must not probe'); } }), /RECOVERY_UNCOVERED/);
});
