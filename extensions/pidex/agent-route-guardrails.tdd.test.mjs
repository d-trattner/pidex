import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHostAutomaticLearningProcessAdapter, createHostAutomaticLearningSource, executeHostAgentBoundary, resolveHostAgentRoute, runHostRetrospectiveAutomaticLearning } from './index.ts';
import { enrollAutomaticLearningProfileFromFile, resolveAutomaticLearningRoutes } from '../../scripts/quality/rule-lifecycle.mjs';
import { openRuleLifecycleStore } from '../../scripts/quality/rule-lifecycle-store.mjs';

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

const canonicalJson = (value) => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}` : JSON.stringify(value);

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

test('host retrospective seam accepts only successful confined regular artifacts and blocks absent source-owned authority', () => {
  const root = mkdtempSync(join(tmpdir(), 'pidex-host-retro-'));
  try {
    const artifact = join(root, 'agents.output', 'retrospective', 'finding.json');
    mkdirSync(join(root, 'agents.output', 'retrospective'), { recursive: true });
    writeFileSync(artifact, '{"not":"canonical"}');
    assert.deepEqual(runHostRetrospectiveAutomaticLearning({
      result: { exitCode: 0, finalText: '<!-- ROUTING\nverdict: COMPLETE\ncontext_file: agents.output/retrospective/finding.json\n-->' },
      agentCwd: root,
    }), { status: 'blocked_artifact_authority' });
    linkSync(artifact, join(root, 'agents.output', 'retrospective', 'linked.json'));
    assert.deepEqual(runHostRetrospectiveAutomaticLearning({
      result: { exitCode: 0, finalText: '<!-- ROUTING\nverdict: COMPLETE\ncontext_file: agents.output/retrospective/linked.json\n-->' },
      agentCwd: root,
    }), { status: 'blocked_artifact_authority' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('host retrospective seam awaits async coordinator before durable disposition', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pidex-host-retro-sidecar-'));
  try {
    const retrospective = join(root, 'agents.output', 'retrospective', 'report.md');
    const sidecar = join(root, 'agents.output', 'retrospective', 'report.rule-learning.json');
    mkdirSync(join(root, 'agents.output', 'retrospective'), { recursive: true }); writeFileSync(retrospective, '# retrospective\n'); writeFileSync(sidecar, '{"canonical":true}');
    let received; let disposition;
    const result = await runHostRetrospectiveAutomaticLearning({
      result: { exitCode: 0, finalText: '<!-- ROUTING\nverdict: COMPLETE\ncontext_file: agents.output/retrospective/report.md\n-->' }, agentCwd: root,
      source: { store: { appendAutomaticLearningDisposition(input) { disposition = input; return { status: 'recorded' }; } }, runner() {}, now: '2026-08-14T00:00:00.000Z' }, coordinator: async (input) => { received = input.finding_bytes.toString(); return { status: 'prepared' }; },
    });
    assert.deepEqual(result, { status: 'prepared'}); assert.equal(received, '{"canonical":true}'); assert.deepEqual(disposition, { status: 'prepared', occurred_at: '2026-08-14T00:00:00.000Z', disposition_id: `automatic-disposition:${createHash('sha256').update('pidex-automatic-disposition-v1\0{"canonical":true}\0prepared').digest('hex')}` });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Plan238 successful retrospective creates default automatic source when no test source is injected', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pidex-host-default-source-'));
  try {
    mkdirSync(join(root, 'agents.output', 'retrospective'), { recursive: true });
    writeFileSync(join(root, 'agents.output', 'retrospective', 'report.md'), '# retrospective\n');
    writeFileSync(join(root, 'agents.output', 'retrospective', 'report.rule-learning.json'), '{"canonical":true}');
    let received; let closed = 0;
    const result = await runHostRetrospectiveAutomaticLearning({ result: { exitCode: 0, finalText: '<!-- ROUTING\nverdict: COMPLETE\ncontext_file: agents.output/retrospective/report.md\n-->' }, agentCwd: root, sourceFactory: ({ finding_bytes }) => { received = finding_bytes.toString(); return { run: async () => ({ status: 'prepared', writer_handoff: { kind: 'TX-01' } }), close: () => { closed += 1; } }; } });
    assert.deepEqual(result, { status: 'prepared', writer_handoff: { kind: 'TX-01' } });
    assert.equal(received, '{"canonical":true}'); assert.equal(closed, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Plan238 P2 host source factory owns enrolled authority, exact runner bytes, sole event, and close', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pidex-host-bridge-'));
  try {
    const finding = '{"canonical":true}';
    mkdirSync(join(root, 'agents.output', 'retrospective'), { recursive: true });
    writeFileSync(join(root, 'agents.output', 'retrospective', 'report.md'), '# retrospective\n');
    writeFileSync(join(root, 'agents.output', 'retrospective', 'report.rule-learning.json'), finding);
    const calls = []; let closed = 0;
    const source = createHostAutomaticLearningSource({
      root, env: { PIDEX_STATE_DIR: join(root, 'state') }, tier: 'project', scope_id: 'a'.repeat(24),
      openRuntimeSource: () => ({
        configuration_generation: '1'.repeat(64),
        run: async (input) => { calls.push(input); return { status: 'blocked_target_authority' }; },
        close: () => { closed += 1; },
      }),
      runConfigured: async () => ({ exitCode: 0, finalText: '{"decision":"accept","schema_version":"pidex-rule-learning-review-v1"}' }),
      processAdapter: () => ({ status: 0, stdout: `${'b'.repeat(40)}\n` }), now: '2026-08-20T00:00:00.000Z',
    });
    const result = await runHostRetrospectiveAutomaticLearning({
      result: { exitCode: 0, finalText: '<!-- ROUTING\nverdict: COMPLETE\ncontext_file: agents.output/retrospective/report.md\n-->' }, agentCwd: root, source,
    });
    assert.deepEqual(result, { status: 'blocked_target_authority' });
    assert.equal(calls.length, 1); assert.equal(calls[0].finding_bytes.toString(), finding);
    assert.equal(closed, 1, 'bridge closes existing store after coordinator disposition');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Plan238 host base adapter spawns only bounded shell-free enrolled ls-remote', async () => {
  const calls = [];
  const adapter = createHostAutomaticLearningProcessAdapter({ spawnProcess(command, args, options) {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    queueMicrotask(() => { child.stdout.emit('data', `${'a'.repeat(40)}\trefs/heads/main\n`); child.emit('close', 0, null); });
    return child;
  } });
  assert.deepEqual(await adapter({ enrolledRepository: '/enrolled/repository', enrolledRemote: 'https://example.invalid/rules.git', branch: 'main' }), { status: 0, stdout: 'a'.repeat(40) });
  assert.deepEqual(calls, [{ command: 'git', args: ['-C', '/enrolled/repository', 'ls-remote', '--heads', 'https://example.invalid/rules.git', 'refs/heads/main'], options: { shell: false, stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 } }]);
});

test('F-254-02 host E2E enrolls profile through producer then closes and reopens production source', () => {
  const root = mkdtempSync(join(tmpdir(), 'pidex-host-profile-producer-')); const stateRoot = join(root, 'state'); const scope = 'a'.repeat(24); const repository = `repo:${'b'.repeat(64)}`; const now = '2026-08-20T00:00:00.000Z';
  const routes = Object.fromEntries(['pidex-pi', 'pidex-critic', 'pidex-code-reviewer'].map((principal) => [principal, { principal, provider: 'fake', model: `fake/${principal}`, effort: 'high' }]));
  const target = { repository, tier: 'project', scope_id: scope, scope_digest: 'c'.repeat(64), rule_id: `project:${scope}:pidex-implementer:producer`, predecessor: `commit:${'d'.repeat(40)}`, authority_digest: 'e'.repeat(64), enabled: true, protected: false, applicable_descriptors: [{ descriptor_digest: 'f'.repeat(64) }], existing: [] };
  const writer_authority = { normalized_remote_digest: '1'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: '2'.repeat(64), identity_platform: 'posix', root_identity_digest: '3'.repeat(64), parent_identity_digest: '4'.repeat(64), files_identity_digest: '5'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: now };
  try {
    mkdirSync(join(root, 'config'), { recursive: true }); writeFileSync(join(root, 'config', 'agents.json'), JSON.stringify({ agents: routes }));
    const configuration = resolveAutomaticLearningRoutes({ root, tier: 'project' }); const profile = { schema_version: 'pidex-automatic-learning-profile-v1', route_generation: configuration.configuration_generation, enrollment: { evaluator_host_id: `host:${'6'.repeat(64)}`, targets: { project: target } }, reviewers: { configuration_generation: configuration.configuration_generation } }; const profileFile = join(root, 'automatic-profile.json'); writeFileSync(profileFile, canonicalJson(profile));
    assert.equal(enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }).status, 'enrolled');
    const setup = openRuleLifecycleStore({ stateRoot }); setup.enroll({ repository, scope_id: scope, remote: 'https://example.invalid/producer.git', branch: 'refs/heads/main' }); setup.enrollPublicationTarget({ repository, tier: 'project', scope_id: scope, scope_digest: target.scope_digest, rule_id: target.rule_id, predecessor: target.predecessor, enrollment_digest: '7'.repeat(64), allowed_paths: ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/producer.md'], writer_authority }); setup.close();
    const source = createHostAutomaticLearningSource({ root, env: { PIDEX_STATE_DIR: stateRoot }, tier: 'project', scope_id: scope, retry_family_id: 'retry:host-producer', now, runConfigured: async () => ({ exitCode: 1 }) }); source.close();
    const reopened = createHostAutomaticLearningSource({ root, env: { PIDEX_STATE_DIR: stateRoot }, tier: 'project', scope_id: scope, retry_family_id: 'retry:host-producer', now, runConfigured: async () => ({ exitCode: 1 }) }); reopened.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('root check executes host route guardrail regression', () => {
  const check = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).scripts.check;
  assert.match(check, /node --experimental-strip-types extensions\/pidex\/agent-route-guardrails\.tdd\.test\.mjs/);
});
