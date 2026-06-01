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

test('run-check substitutes __PIDEX_PROJECT__ in manifest commands', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.args = ['scripts/release/reference-integrity.mjs', '__PIDEX_PROJECT__', '__PIDEX_PROJECT__/pidex/state'];
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log(process.argv.slice(2).join('\\n'));\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, new RegExp(project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.command.args, ['scripts/release/reference-integrity.mjs', '__PIDEX_PROJECT__', '__PIDEX_PROJECT__/pidex/state']);
  assert.deepEqual(row.executed_command.args, ['scripts/release/reference-integrity.mjs', project, `${project}/pidex/state`]);
});

test('run-check appends passthrough args only when manifest allows it', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^[A-Za-z0-9_.:/=@-]+$'] };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log(process.argv.slice(2).join(' '));\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const out = execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', 'show', '--json'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.match(out, /show --json/);
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.passthrough_args, ['show', '--json']);
  assert.deepEqual(row.executed_command.args.slice(-2), ['show', '--json']);
});

test('run-check redacts sensitive passthrough evidence', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^[A-Za-z0-9_.:/=@-]+$'] };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log('ok');\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--token', 'secret-value', '--api-key=abc123'], { cwd: process.cwd(), encoding: 'utf8' });
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.passthrough_args, ['--token', '[REDACTED]', '--api-key=[REDACTED]']);
});

test('run-check scrubs secret-like passthrough values even without sensitive flag names', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^[A-Za-z0-9_-]+$'] };
  writeFileSync(path.join(root, 'scripts/release/reference-integrity.mjs'), "console.log('ok');\n");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  execFileSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', 'sk-proj-' + 'a'.repeat(48)], { cwd: process.cwd(), encoding: 'utf8' });
  const evidenceDir = path.join(root, 'state/modules/evidence');
  const file = path.join(evidenceDir, readdirSync(evidenceDir)[0]);
  const row = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.deepEqual(row.passthrough_args, ['[REDACTED]']);
});

test('run-check rejects absolute passthrough paths outside project', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^/.*$'], allow_absolute_project_paths: true };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '/etc/passwd'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /rejected by capability policy/);
});

test('run-check rejects parent traversal passthrough args', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^.*$'], allow_absolute_project_paths: true };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '../state'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /rejected by capability policy/);
});

test('run-check rejects passthrough args that violate manifest policy', () => {
  const { root, project } = makeModuleFixture();
  const manifestPath = path.join(root, 'modules/pidex/release-safety/module.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.capabilities[0].command.passthrough = true;
  manifest.capabilities[0].command.passthrough_policy = { allowed_patterns: ['^--json$'] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--xml'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /rejected by capability policy/);
});

test('run-check rejects passthrough args unless manifest allows it', () => {
  const { root, project } = makeModuleFixture();
  const proc = spawnSync(process.execPath, ['scripts/modules/run-check.mjs', '--pidex-root', root, '--capability', 'release.reference-integrity', '--agent', 'pidex-devops', '--phase', 'pre-release', '--project', project, '--', '--json'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /does not allow passthrough/);
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
