import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeHostAgentBoundary, resolveHostAgentRoute } from './index.ts';

const config = {
  defaults: { provider: 'pi', model: 'openai-codex/gpt-5.6-terra', effort: 'medium', timeout_seconds: 300 },
  agents: {
    'pidex-planner': {
      model: 'openai-codex/gpt-5.6-sol', effort: 'high', timeout_seconds: 420,
      tools: ['read', 'write'], permission_mode: 'acceptEdits', allowed_tools: ['read'],
      disallowed_tools: ['bash'], add_dirs: ['../shared'], dangerously_skip_permissions: true,
    },
    'pidex-critic': {
      model: 'openai-codex/gpt-5.6-terra', effort: 'high',
      tools: ['read', 'grep'], permission_mode: 'dontAsk', allowed_tools: ['read'],
      disallowed_tools: ['write'], add_dirs: ['../critics'], dangerously_skip_permissions: true,
    },
  },
};

const lanes = [
  { lane_id: 'pidex-critic:deepseek:deepseek-v4-flash', agent: 'pidex-critic', trigger: 'after-plan', runner_provider: 'pi', runner_model: 'deepseek/deepseek-v4-flash', effort: 'low', timeout_seconds: 600 },
  { lane_id: 'pidex-critic:minimax:MiniMax-M2.7', agent: 'pidex-critic', trigger: 'after-plan', runner_provider: 'pi', runner_model: 'minimax/MiniMax-M2.7', effort: 'medium', timeout_seconds: 600 },
];

test('configured primary route preserves full configured agent execution fields', () => {
  assert.deepEqual(resolveHostAgentRoute({ agent: 'pidex-planner' }, config, lanes), {
    provider: 'pi', model: 'openai-codex/gpt-5.6-sol', effort: 'high', timeout_seconds: 420, timeoutSeconds: 420,
    tools: ['read', 'write'], permission_mode: 'acceptEdits', allowed_tools: ['read'],
    disallowed_tools: ['bash'], add_dirs: ['../shared'], dangerously_skip_permissions: true,
    routeSource: 'configured-primary',
  });
});

test('manual primary route fields fail before a spawn route is returned', () => {
  for (const fields of [{ provider: 'pi' }, { model: 'deepseek/deepseek-v3.2' }, { effort: 'low' }]) {
    assert.throws(() => resolveHostAgentRoute({ agent: 'pidex-critic', ...fields }, config, lanes), /caller-supplied provider, model, or effort/);
  }
});

test('exact eligible secondary lane resolves its configured runner route', () => {
  // Revision 2 M-1R: secondary lanes retain configured controls while lane fields stay authoritative.
  assert.deepEqual(resolveHostAgentRoute({ agent: 'pidex-critic', laneId: 'pidex-critic:deepseek:deepseek-v4-flash', trigger: 'after-plan' }, config, lanes), {
    provider: 'pi', model: 'deepseek/deepseek-v4-flash', effort: 'low', timeout_seconds: 600, timeoutSeconds: 600,
    tools: ['read', 'grep'], permission_mode: 'dontAsk', allowed_tools: ['read'],
    disallowed_tools: ['write'], add_dirs: ['../critics'], dangerously_skip_permissions: true,
    routeSource: 'configured-secondary:pidex-critic:deepseek:deepseek-v4-flash',
  });
});

test('secondary route rejects mixed manual fields, blank identity, wrong agent, wrong trigger, and unknown lane', () => {
  assert.throws(() => resolveHostAgentRoute({ agent: 'pidex-critic', laneId: lanes[0].lane_id, trigger: 'after-plan', model: 'other/model' }, config, lanes), /cannot include provider, model, or effort/);
  for (const laneId of ['', '   ']) assert.throws(() => resolveHostAgentRoute({ agent: 'pidex-critic', laneId }, config, lanes), /non-empty laneId/);
  assert.throws(() => resolveHostAgentRoute({ agent: 'pidex-planner', laneId: lanes[0].lane_id, trigger: 'after-plan' }, config, lanes), /not eligible/);
  assert.throws(() => resolveHostAgentRoute({ agent: 'pidex-critic', laneId: lanes[0].lane_id, trigger: 'after-implementation' }, config, lanes), /not eligible/);
  assert.throws(() => resolveHostAgentRoute({ agent: 'pidex-critic', laneId: 'unknown', trigger: 'after-plan' }, config, lanes), /not eligible/);
});

test('configured secondary route reaches runner seam with agent controls and lane route fields', async () => {
  let received;
  await executeHostAgentBoundary({ agent: 'pidex-critic', task: 'review', laneId: lanes[0].lane_id, trigger: 'after-plan' }, {
    agentCwd: process.cwd(),
    agentProjectMode: { ok: true, mode: 'host-direct' },
    loadEligibleLanes: () => lanes,
    loadConfig: () => config,
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => {
      received = params.route;
      return { agent: params.agent, exitCode: 0, stderr: '', finalText: '<!-- ROUTING\ncontext_file: agents.output/review.md\n-->' };
    },
  });
  assert.deepEqual(received, {
    provider: 'pi', model: 'deepseek/deepseek-v4-flash', effort: 'low', timeout_seconds: 600, timeoutSeconds: 600,
    tools: ['read', 'grep'], permission_mode: 'dontAsk', allowed_tools: ['read'],
    disallowed_tools: ['write'], add_dirs: ['../critics'], dangerously_skip_permissions: true,
    routeSource: 'configured-secondary:pidex-critic:deepseek:deepseek-v4-flash',
  });
});

test('registered host boundary rejects malformed requests before lane helper, runners, metadata, or ROUTING evidence', async () => {
  for (const sandboxEnabled of [false, true]) {
    let laneHelperCalls = 0;
    let configuredRunnerCalls = 0;
    let sandboxRunnerCalls = 0;
    const progress = [];
    const options = {
      agentCwd: process.cwd(),
      agentProjectMode: { ok: true, mode: sandboxEnabled ? 'hardened-pipeline' : 'host-direct' },
      loadEligibleLanes: () => { laneHelperCalls += 1; return lanes; },
      loadConfig: () => config,
      resolveSandboxState: () => ({ enabled: sandboxEnabled }),
      probeSandbox: () => ({ ok: true, summary: 'ready' }),
      runConfigured: async () => { configuredRunnerCalls += 1; throw new Error('configured runner must not execute'); },
      runSandboxed: async () => { sandboxRunnerCalls += 1; throw new Error('sandbox runner must not execute'); },
      onUpdate: (text) => progress.push(text),
    };
    for (const params of [
      { agent: 'pidex-critic', task: 'review', provider: 'pi' },
      { agent: 'pidex-critic', task: 'review', laneId: '', trigger: 'after-plan' },
      { agent: 'pidex-critic', task: 'review', laneId: '  ', trigger: 'after-plan' },
      { agent: 'pidex-critic', task: 'review', laneId: lanes[0].lane_id, model: 'manual/model' },
      { agent: 'pidex-critic', task: 'review', laneId: lanes[0].lane_id },
    ]) {
      await assert.rejects(() => executeHostAgentBoundary(params, options), /reject caller-supplied|non-empty laneId|cannot include|require trigger/);
    }
    assert.equal(laneHelperCalls, 0, `lane helper ran in ${sandboxEnabled ? 'hardened' : 'host-direct'} mode`);
    assert.equal(configuredRunnerCalls, 0);
    assert.equal(sandboxRunnerCalls, 0);
    assert.deepEqual(progress, []);
  }
});

test('registered host boundary rejects valid-shape ineligible lanes before runners or child evidence in both modes', async () => {
  const validShapeIneligibleLanes = [...lanes, { lane_id: 'pidex-implementer:disabled', agent: 'pidex-implementer', trigger: 'after-plan' }];
  for (const sandboxEnabled of [false, true]) {
    let laneHelperCalls = 0;
    let configuredRunnerCalls = 0;
    let sandboxRunnerCalls = 0;
    const evidenceDir = mkdtempSync(join(tmpdir(), 'pidex-host-boundary-'));
    const evidenceFile = join(evidenceDir, 'child-run.json');
    const options = {
      agentCwd: process.cwd(),
      agentProjectMode: { ok: true, mode: sandboxEnabled ? 'hardened-pipeline' : 'host-direct' },
      loadEligibleLanes: () => { laneHelperCalls += 1; return validShapeIneligibleLanes; },
      loadConfig: () => config,
      resolveSandboxState: () => ({ enabled: sandboxEnabled }),
      probeSandbox: () => ({ ok: true, summary: 'ready' }),
      runConfigured: async () => { configuredRunnerCalls += 1; writeFileSync(evidenceFile, 'configured'); throw new Error('configured runner must not execute'); },
      runSandboxed: async () => { sandboxRunnerCalls += 1; writeFileSync(evidenceFile, 'sandbox'); throw new Error('sandbox runner must not execute'); },
    };
    try {
      for (const params of [
        { agent: 'pidex-implementer', task: 'implement', laneId: lanes[0].lane_id, trigger: 'after-plan' },
        { agent: 'pidex-implementer', task: 'implement', laneId: 'pidex-implementer:disabled', trigger: 'after-implementation' },
        { agent: 'pidex-implementer', task: 'implement', laneId: 'unknown', trigger: 'after-plan' },
        { agent: 'pidex-implementer', task: 'implement', laneId: 'pidex-implementer:disabled', trigger: 'after-plan' },
      ]) {
        await assert.rejects(() => executeHostAgentBoundary(params, options), /not eligible/);
      }
      assert.equal(laneHelperCalls, 4, `valid-shape lanes load status in ${sandboxEnabled ? 'hardened' : 'host-direct'} mode`);
      assert.equal(configuredRunnerCalls, 0);
      assert.equal(sandboxRunnerCalls, 0);
      assert.equal(existsSync(evidenceFile), false, 'rejected requests create no child-run evidence');
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  }
});

test('configured primary route reaches runner seam with configured tool and permission controls intact', async () => {
  let received;
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'plan' }, {
    agentCwd: process.cwd(),
    agentProjectMode: { ok: true, mode: 'host-direct' },
    loadConfig: () => config,
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => {
      received = params.route;
      return { agent: params.agent, exitCode: 0, stderr: '', finalText: '<!-- ROUTING\ncontext_file: agents.output/plan.md\n-->' };
    },
  });
  assert.deepEqual(received, resolveHostAgentRoute({ agent: 'pidex-planner' }, config, lanes));
  assert.deepEqual(received.tools, ['read', 'write']);
  assert.equal(received.permission_mode, 'acceptEdits');
  assert.deepEqual(received.allowed_tools, ['read']);
  assert.deepEqual(received.disallowed_tools, ['bash']);
  assert.deepEqual(received.add_dirs, ['../shared']);
  assert.equal(received.dangerously_skip_permissions, true);
});

test('root check executes host route guardrail regression', () => {
  const check = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts.check;
  assert.match(check, /node --experimental-strip-types extensions\/pidex\/agent-route-guardrails\.tdd\.test\.mjs/);
});
