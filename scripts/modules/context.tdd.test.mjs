import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeModuleFixture } from './test-helpers.mjs';

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

test('context rejects invalid module manifests through validation', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  writeFileSync(manifestPath, '{"id":"pidex.release-safety","schema_version":1,"kind":"core-toggleable","dependencies":[],"capabilities":[{"id":"bad","kind":"check","phases":["pre-release"],"scope":"install","importance":"required","allowed_agents":["pidex-devops"],"mutability":["read-only"],"command":{"bin":"node","args":["-e","console.log(1)"]}}]}');
  assert.throws(() => runContext(root, project), /module validation failed/);
});
