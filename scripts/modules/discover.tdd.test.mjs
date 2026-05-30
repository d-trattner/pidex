import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeModuleFixture } from './test-helpers.mjs';

test('discovery returns runner invocation and hides raw command by default', () => {
  const { root, project } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/discover.mjs', '--pidex-root', root, '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.equal(data.ok, true);
  assert.equal(data.capabilities.length, 1);
  assert.equal(data.capabilities[0].available, true);
  assert.equal(data.capabilities[0].execute.args[0], 'scripts/modules/run-check.mjs');
  assert.equal(data.capabilities[0].command, undefined);
});

test('discovery includes disabled capability with module_disabled reason', () => {
  const { root, project } = makeModuleFixture({ releaseEnabled: false });
  const out = execFileSync(process.execPath, ['scripts/modules/discover.mjs', '--pidex-root', root, '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.equal(data.capabilities[0].available, false);
  assert.equal(data.capabilities[0].reason, 'module_disabled');
});

test('discovery marks disabled release-safety protected for pidex self-release context', () => {
  const { root } = makeModuleFixture({ releaseEnabled: false });
  const out = execFileSync(process.execPath, ['scripts/modules/discover.mjs', '--pidex-root', root, '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', root], { cwd: process.cwd(), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.equal(data.capabilities[0].available, false);
  assert.equal(data.capabilities[0].reason, 'protected_module_disabled');
  assert.equal(data.capabilities[0].requirement_active, true);
});

test('orchestrator discovery returns phase-grouped map', () => {
  const { root, project } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/discover.mjs', '--pidex-root', root, '--agent', 'orchestrator', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.equal(Array.isArray(data.pipeline_map), true);
  assert.equal(data.pipeline_map.some((phase) => phase.phase === 'pre-release' && phase.status === 'current'), true);
});

test('debug discovery includes raw manifest command', () => {
  const { root, project } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/discover.mjs', '--pidex-root', root, '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--debug'], { cwd: process.cwd(), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.deepEqual(data.capabilities[0].command, { bin: 'node', args: ['scripts/release/reference-integrity.mjs'] });
});

test('discovery shows current-phase capability denied to current agent', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].allowed_agents = ['pidex-pi'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const out = execFileSync(process.execPath, ['scripts/modules/discover.mjs', '--pidex-root', root, '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  const data = JSON.parse(out);
  assert.equal(data.capabilities[0].available, false);
  assert.equal(data.capabilities[0].reason, 'agent_not_allowed');
});
