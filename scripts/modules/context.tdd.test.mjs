import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { addFixtureAgentRule, makeModuleFixture } from './test-helpers.mjs';

function runContext(root, project, extra = []) {
  return execFileSync(process.execPath, ['scripts/modules/context.mjs', '--pidex-root', root, '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, ...extra], { cwd: process.cwd(), encoding: 'utf8' });
}

test('context emits advisory markdown with runner invocations', () => {
  const { root, project } = makeModuleFixture();
  const out = runContext(root, project);
  assert.match(out, /## Module capabilities for this phase/);
  assert.match(out, /Advisory only: discovery\/context output does not grant execution authority/);
  assert.match(out, /Required available checks:/);
  assert.match(out, /release\.reference-integrity/);
  assert.match(out, /node scripts\/modules\/run-check\.mjs --capability release\.reference-integrity --agent pidex-devops --phase pre-release/);
  assert.doesNotMatch(out, /scripts\/release\/reference-integrity\.mjs/);
});

test('context surfaces unavailable required capabilities with reasons', () => {
  const { root, project } = makeModuleFixture({ releaseEnabled: false });
  const out = runContext(root, project);
  assert.match(out, /Unavailable required\/current-phase capabilities:/);
  assert.match(out, /release\.reference-integrity .*module_disabled/);
});

test('context quotes project paths safely in command lines', () => {
  const { root, project } = makeModuleFixture();
  const spacedProject = path.join(project, 'project with space');
  // makeModuleFixture creates a temp project root; context only requires the path exists.
  execFileSync('mkdir', ['-p', spacedProject]);
  const out = runContext(root, spacedProject);
  assert.match(out, /--project '.*project with space'/);
});

test('context emits metadata-only module-scoped agent_rules when mode and capability match', () => {
  const { root, project } = makeModuleFixture();
  addFixtureAgentRule(root, { rule: { summary: 'Release safety rule' } });
  const out = runContext(root, project, ['--mode', 'release']);
  assert.match(out, /## Module rules for this phase/);
  assert.match(out, /Core PIDEX rules and explicit user instructions take precedence/);
  assert.match(out, /pidex\.release-safety\.pre-release-devops/);
  assert.match(out, /module: pidex\.release-safety/);
  assert.match(out, /source: rules\/pidex-devops\/pre-release\.md/);
  assert.match(out, /mode=release/);
  assert.doesNotMatch(out, /# Release module rule/);
  assert.doesNotMatch(out, /scripts\/release\/reference-integrity\.mjs/);
  assert.doesNotMatch(out, /javascript:alert/);
  assert.doesNotMatch(out, /<b>/);
});

test('context suppresses module-scoped agent_rules for missing mode wrong mode disabled module and unavailable capability', () => {
  const missingMode = makeModuleFixture();
  addFixtureAgentRule(missingMode.root);
  assert.doesNotMatch(runContext(missingMode.root, missingMode.project), /pidex\.release-safety\.pre-release-devops/);
  assert.doesNotMatch(runContext(missingMode.root, missingMode.project, ['--mode', 'other']), /pidex\.release-safety\.pre-release-devops/);

  const disabled = makeModuleFixture({ releaseEnabled: false });
  addFixtureAgentRule(disabled.root);
  assert.doesNotMatch(runContext(disabled.root, disabled.project, ['--mode', 'release']), /pidex\.release-safety\.pre-release-devops/);

  const unavailable = makeModuleFixture();
  addFixtureAgentRule(unavailable.root);
  const manifestPath = path.join(unavailable.root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].allowed_agents = ['pidex-pi'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  assert.doesNotMatch(runContext(unavailable.root, unavailable.project, ['--mode', 'release']), /pidex\.release-safety\.pre-release-devops/);
});

test('context emits module-scoped agent_rules in deterministic sorted order', () => {
  const { root, project } = makeModuleFixture();
  addFixtureAgentRule(root);
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  writeFileSync(path.join(root, 'modules/pidex/release-safety/rules/pidex-devops/second.md'), '# second\n');
  manifest.agent_rules.push({ ...manifest.agent_rules[0], id: 'pidex.release-safety.a-first', path: 'rules/pidex-devops/second.md' });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const out = runContext(root, project, ['--mode', 'release']);
  assert.ok(out.indexOf('pidex.release-safety.a-first') < out.indexOf('pidex.release-safety.pre-release-devops'));
});

test('context rejects invalid module manifests through validation', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  writeFileSync(manifestPath, '{"id":"pidex.release-safety","schema_version":1,"kind":"core-toggleable","dependencies":[],"capabilities":[{"id":"bad","kind":"check","phases":["pre-release"],"scope":"install","importance":"required","allowed_agents":["pidex-devops"],"mutability":["read-only"],"command":{"bin":"node","args":["-e","console.log(1)"]}}]}');
  assert.throws(() => runContext(root, project), /module validation failed/);
});
