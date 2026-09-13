#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const load = (name) => JSON.parse(readFileSync(path.join(root, 'config', 'profiles', `${name}.json`), 'utf8'));
const balanced = load('5.6-hybrid-balanced');
const lowcost = load('5.6-hybrid-lowcost');
const solQuality = load('5.6-sol-quality');
const activeAgents = JSON.parse(readFileSync(path.join(root, 'config', 'agents.json'), 'utf8'));

const expectedBalanced = {
  'pidex-analyst': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-architect': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-code-reviewer': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-critic': ['openai-codex/gpt-5.6-sol', 'medium'],
  'pidex-designer': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-devops': ['openai-codex/gpt-5.6-terra', 'medium'],
  'pidex-implementer': ['openai-codex/gpt-5.6-terra', 'high'],
  'pidex-pi': ['openai-codex/gpt-5.6-terra', 'medium'],
  'pidex-planner': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-qa': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-retrospective': ['openai-codex/gpt-5.6-luna', 'medium'],
  'pidex-roadmap': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-security': ['openai-codex/gpt-5.6-sol', 'high'],
  'pidex-uat': ['openai-codex/gpt-5.6-terra', 'medium'],
};

const selectedRoute = (profile, agent) => [profile.agents[agent].model, profile.agents[agent].effort];

test('profile catalog preserves GPT-5.6 rollback presets and adds Astra presets', () => {
  const profiles = readdirSync(path.join(root, 'config', 'profiles'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5))
    .sort();
  assert.deepEqual(profiles, ['5.6-hybrid-balanced', '5.6-hybrid-lowcost', '5.6-sol-quality', 'astra-balanced', 'astra-quality']);
});

test('Sol-quality profile retains all 14 roles and only supported Sol routes', () => {
  assert.deepEqual(Object.keys(solQuality.agents).sort(), Object.keys(expectedBalanced).sort());
  assert.doesNotMatch(JSON.stringify(solQuality), /codex-spark/i);
  for (const [agent, route] of Object.entries(solQuality.agents)) {
    assert.equal(route.provider, 'pi', agent);
    assert.equal(route.model, 'openai-codex/gpt-5.6-sol', agent);
    assert.ok(['medium', 'high'].includes(route.effort), agent);
  }
});

test('balanced profile matches the evidence-approved 14-agent table', () => {
  assert.deepEqual(Object.keys(balanced.agents).sort(), Object.keys(expectedBalanced).sort());
  for (const [agent, route] of Object.entries(expectedBalanced)) {
    assert.deepEqual(selectedRoute(balanced, agent), route, agent);
    assert.equal(balanced.agents[agent].provider, 'pi', agent);
  }
  assert.equal(balanced.agents['pidex-designer'].condition, 'plan_has_ui_scope');
  assert.doesNotMatch(JSON.stringify(balanced), /codex-spark/i);
});

test('lowcost differs from balanced only for bounded code review and QA routes', () => {
  assert.deepEqual(Object.keys(lowcost.agents).sort(), Object.keys(balanced.agents).sort());
  assert.deepEqual(lowcost.defaults, balanced.defaults);
  assert.deepEqual(lowcost.fallback, balanced.fallback);

  const changed = [];
  for (const agent of Object.keys(balanced.agents).sort()) {
    const base = balanced.agents[agent];
    const economical = lowcost.agents[agent];
    assert.equal(economical.provider, base.provider, agent);
    assert.equal(economical.timeout_seconds, base.timeout_seconds, agent);
    assert.equal(economical.condition, base.condition, agent);
    if (JSON.stringify(selectedRoute(lowcost, agent)) !== JSON.stringify(selectedRoute(balanced, agent))) changed.push(agent);
  }

  assert.deepEqual(changed, ['pidex-code-reviewer', 'pidex-qa']);
  assert.deepEqual(selectedRoute(lowcost, 'pidex-code-reviewer'), ['openai-codex/gpt-5.6-terra', 'medium']);
  assert.deepEqual(selectedRoute(lowcost, 'pidex-qa'), ['openai-codex/gpt-5.6-terra', 'medium']);
  assert.deepEqual(selectedRoute(lowcost, 'pidex-designer'), ['openai-codex/gpt-5.6-sol', 'high']);
  assert.doesNotMatch(JSON.stringify(lowcost), /codex-spark/i);
});

test('supported profiles preserve every configured principal authority field', () => {
  const authorities = Object.entries(activeAgents.agents).filter(([, route]) => route.principal).map(([agent, route]) => [agent, route.principal]);
  assert.ok(authorities.length > 0);
  for (const profile of [balanced, lowcost, solQuality, load('astra-balanced'), load('astra-quality')]) {
    for (const [agent, principal] of authorities) assert.equal(profile.agents[agent]?.principal, principal, `${profile.description}:${agent}`);
  }
});

test('supported profiles keep schema/version/fallback contract and do not use low effort', () => {
  for (const profile of [balanced, lowcost, solQuality, load('astra-balanced'), load('astra-quality')]) {
    assert.equal(profile.$schema, 'https://pidex.dev/agents.schema.json');
    assert.equal(profile.version, '1.3.0');
    assert.deepEqual(profile.fallback, { on_error: 'pi', retries: 0, reason_prefix: 'DELEGATE_FAIL' });
    for (const route of Object.values(profile.agents)) {
      assert.ok(['medium', 'high'].includes(route.effort));
      assert.match(route.model, /^openai-codex\/(gpt-5\.6-(sol|terra|luna)|gpt-6-astra)$/);
    }
  }
});

const astraRoles = ['pidex-analyst', 'pidex-architect', 'pidex-planner', 'pidex-critic', 'pidex-code-reviewer', 'pidex-security', 'pidex-roadmap', 'pidex-pi'];
for (const [name, promoted] of [
  ['astra-balanced', astraRoles],
  ['astra-quality', [...astraRoles, 'pidex-implementer', 'pidex-qa', 'pidex-retrospective']],
]) {
  test(`${name} changes only the approved role models, preserving all other controls`, () => {
    const profile = load(name);
    const expected = structuredClone(balanced);
    expected.description = profile.description;
    for (const role of promoted) expected.agents[role].model = 'openai-codex/gpt-6-astra';
    assert.deepEqual(profile, expected);
  });
}

test('candidate default is Astra balanced; unspecified roles retain Terra fallback', () => {
  assert.deepEqual(activeAgents, load('astra-balanced'));
  assert.deepEqual(activeAgents.defaults, balanced.defaults);
});

test('real profile CLI selects, reports and rolls back without quota/model access', () => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'pidex-astra-profile-'));
  try {
    const relative = 'modules/pidex/provider-governance/scripts/provider-limits/probe.mjs';
    const script = path.join(fixture, relative);
    mkdirSync(path.dirname(script), { recursive: true });
    copyFileSync(path.join(root, relative), script);
    mkdirSync(path.join(fixture, 'config/profiles'), { recursive: true });
    for (const name of ['5.6-hybrid-balanced', '5.6-hybrid-lowcost', '5.6-sol-quality', 'astra-balanced', 'astra-quality']) {
      copyFileSync(path.join(root, 'config/profiles', `${name}.json`), path.join(fixture, 'config/profiles', `${name}.json`));
    }
    const target = path.join(fixture, 'config/agents.json');
    writeFileSync(target, JSON.stringify(load('astra-balanced')));
    const guard = path.join(fixture, 'no-network.mjs');
    writeFileSync(guard, "import net from 'node:net';globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};net.Socket.prototype.connect=function(){throw Error('NETWORK_FORBIDDEN')};");
    const invoke = (...args) => {
      const result = spawnSync(process.execPath, [script, ...args], {
        cwd: fixture, encoding: 'utf8', timeout: 10000,
        env: { PATH: process.env.PATH, HOME: fixture, USERPROFILE: fixture, NODE_OPTIONS: `--import=${JSON.stringify(guard)}`, PIDEX_PROVIDER_LIMITS_DISABLE_AUTO_SWITCH: '1' },
      });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    };
    assert.equal(invoke('latest').active_profile, 'astra-balanced', 'fresh checkout must not infer alphabetical first profile');
    assert.equal(invoke('use', 'astra-quality').active_profile, 'astra-quality');
    assert.deepEqual(JSON.parse(readFileSync(target)), load('astra-quality'));
    assert.equal(invoke('use', '5.6-hybrid-balanced').active_profile, '5.6-hybrid-balanced');
    assert.deepEqual(JSON.parse(readFileSync(target)), balanced);
    assert.equal(invoke('use', 'astra-balanced').active_profile, 'astra-balanced');
    // A cached valid selection is not authority for different actual routing bytes.
    writeFileSync(target, JSON.stringify(balanced));
    assert.equal(invoke('latest').active_profile, '5.6-hybrid-balanced');
    writeFileSync(target, JSON.stringify({ ...balanced, description: 'local custom routing' }));
    assert.equal(invoke('latest').active_profile, 'custom');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
