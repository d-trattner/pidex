import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { makeModuleFixture } from './test-helpers.mjs';

test('run-check requires absolute project root', () => {
  const { root } = makeModuleFixture();
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', 'relative'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /--project must be absolute/);
});

test('run-check executes command and writes structured evidence', () => {
  const { root, project } = makeModuleFixture();
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, /fixture reference ok/);
  const evidenceDir = path.join(root, 'state/modules/evidence');
  assert.equal(existsSync(evidenceDir), true);
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(row.type, 'module_capability_evidence');
  assert.equal(row.module_id, 'pidex.release-safety');
  assert.equal(row.capability_id, 'release.reference-integrity');
  assert.equal(row.status, 'passed');
});

test('run-check rejects unknown capability', () => {
  const { root, project } = makeModuleFixture();
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'missing.capability', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /unknown capability/);
});

test('run-check rejects disabled capability', () => {
  const { root, project } = makeModuleFixture({ releaseEnabled: false });
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /capability unavailable: module_disabled/);
});

test('run-check propagates command failure and writes failed evidence', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['scripts/release/fail.mjs'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 7);
  assert.match(proc.stderr, /fixture failure/);
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(row.status, 'failed');
  assert.equal(row.exit_code, 7);
});
