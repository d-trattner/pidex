import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractArtifacts, preflightArtifacts } from './extract-artifacts.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-artifact-test-')); }

test('extractArtifacts promotes only orchestrator-assigned agents.output paths', () => {
  const workspace = tmp();
  const project = tmp();
  mkdirSync(path.join(workspace, 'agents.output', 'qa'), { recursive: true });
  writeFileSync(path.join(workspace, 'agents.output', 'qa', 'report.md'), 'ok\n');
  const result = extractArtifacts({ workspace, project, assigned: ['agents.output/qa/report.md'] });
  assert.equal(result.ok, true);
  assert.equal(existsSync(path.join(project, 'agents.output', 'qa', 'report.md')), true);
});

test('preflightArtifacts catches target collision before copy', () => {
  const workspace = tmp();
  const project = tmp();
  mkdirSync(path.join(workspace, 'agents.output'), { recursive: true });
  mkdirSync(path.join(project, 'agents.output'), { recursive: true });
  writeFileSync(path.join(workspace, 'agents.output', 'same.md'), 'new');
  writeFileSync(path.join(project, 'agents.output', 'same.md'), 'old');
  const result = preflightArtifacts({ workspace, project, assigned: ['agents.output/same.md'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'artifact-target-collision');
  assert.equal(result.ready.length, 0);
});

test('extractArtifacts check mode does not copy files', () => {
  const workspace = tmp();
  const project = tmp();
  mkdirSync(path.join(workspace, 'agents.output'), { recursive: true });
  writeFileSync(path.join(workspace, 'agents.output', 'report.md'), 'new');
  const result = extractArtifacts({ workspace, project, assigned: ['agents.output/report.md'], check: true });
  assert.equal(result.ok, true);
  assert.equal(result.check_only, true);
  assert.equal(existsSync(path.join(project, 'agents.output', 'report.md')), false);
});

test('extractArtifacts fails on target collision and rejects traversal', () => {
  const workspace = tmp();
  const project = tmp();
  mkdirSync(path.join(workspace, 'agents.output'), { recursive: true });
  mkdirSync(path.join(project, 'agents.output'), { recursive: true });
  writeFileSync(path.join(workspace, 'agents.output', 'same.md'), 'new');
  writeFileSync(path.join(project, 'agents.output', 'same.md'), 'old');
  const result = extractArtifacts({ workspace, project, assigned: ['agents.output/same.md'] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'artifact-target-collision');
  assert.throws(() => extractArtifacts({ workspace, project, assigned: ['../x'] }), /agents.output/);
});
