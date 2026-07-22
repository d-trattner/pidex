#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const load = (name) => JSON.parse(readFileSync(path.join(root, 'config', 'profiles', `${name}.json`), 'utf8'));
const balanced = load('5.6-hybrid-balanced');
const lowcost = load('5.6-hybrid-lowcost');
const solQuality = load('5.6-sol-quality');

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

test('profile catalog contains only supported GPT-5.6 presets', () => {
  const profiles = readdirSync(path.join(root, 'config', 'profiles'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -5))
    .sort();
  assert.deepEqual(profiles, ['5.6-hybrid-balanced', '5.6-hybrid-lowcost', '5.6-sol-quality']);
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

test('supported profiles keep schema/version/fallback contract and do not use low effort', () => {
  for (const profile of [balanced, lowcost, solQuality]) {
    assert.equal(profile.$schema, 'https://pidex.dev/agents.schema.json');
    assert.equal(profile.version, '1.3.0');
    assert.deepEqual(profile.fallback, { on_error: 'pi', retries: 0, reason_prefix: 'DELEGATE_FAIL' });
    for (const route of Object.values(profile.agents)) {
      assert.ok(['medium', 'high'].includes(route.effort));
      assert.match(route.model, /^openai-codex\/gpt-5\.6-(sol|terra|luna)$/);
    }
  }
});
