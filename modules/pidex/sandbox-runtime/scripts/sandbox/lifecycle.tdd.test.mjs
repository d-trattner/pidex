import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyProjectToWorkspace, createSandboxRun } from './lifecycle.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-life-test-')); }
function git(cwd, args) { const p = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout.trim(); }
function initProject() { const dir = tmp(); git(dir, ['init']); git(dir, ['config', 'user.email', 't@example.invalid']); git(dir, ['config', 'user.name', 'T']); writeFileSync(path.join(dir, 'package.json'), '{"name":"fixture"}\n'); writeFileSync(path.join(dir, '.env'), 'SECRET=x\n'); mkdirSync(path.join(dir, 'node_modules'), { recursive: true }); writeFileSync(path.join(dir, 'node_modules/x.js'), 'x'); git(dir, ['add', 'package.json']); git(dir, ['commit', '-m', 'init']); return dir; }

test('createSandboxRun copies project without env/runtime dirs and initializes baseline git', () => {
  const project = initProject();
  const pidexRoot = tmp();
  const run = createSandboxRun({ project, pidexRoot, runId: 'sandbox-test01' });
  assert.equal(run.ok, true);
  assert.equal(existsSync(path.join(run.workspace, 'package.json')), true);
  assert.equal(existsSync(path.join(run.workspace, '.env')), false);
  assert.equal(existsSync(path.join(run.workspace, 'node_modules')), false);
  assert.equal(existsSync(path.join(run.workspace, '.git')), true);
  const metadata = JSON.parse(readFileSync(run.metadata_path, 'utf8'));
  assert.equal(metadata.mode, 'hardened-pipeline');
  assert.equal(metadata.container_user_mode, 'image-default');
  assert.equal(metadata.container_user_enforced, false);
  assert.equal(metadata.install_scripts, 'disabled');
});

test('copyProjectToWorkspace uses git exclude-standard in Git projects', () => {
  const project = tmp();
  const workspace = tmp();
  git(project, ['init']);
  git(project, ['config', 'user.email', 't@example.invalid']);
  git(project, ['config', 'user.name', 'T']);
  writeFileSync(path.join(project, '.gitignore'), 'ignored.log\nignored-dir/\n');
  writeFileSync(path.join(project, 'tracked.txt'), 'tracked\n');
  writeFileSync(path.join(project, 'untracked.txt'), 'untracked\n');
  writeFileSync(path.join(project, 'ignored.log'), 'ignored\n');
  mkdirSync(path.join(project, 'ignored-dir'), { recursive: true });
  writeFileSync(path.join(project, 'ignored-dir', 'file.txt'), 'ignored\n');
  git(project, ['add', '.gitignore', 'tracked.txt']);
  git(project, ['commit', '-m', 'init']);

  const copied = copyProjectToWorkspace(project, workspace);
  assert.equal(copied.source, 'git-ls-files');
  assert.equal(existsSync(path.join(workspace, 'tracked.txt')), true);
  assert.equal(existsSync(path.join(workspace, 'untracked.txt')), true);
  assert.equal(existsSync(path.join(workspace, 'ignored.log')), false);
  assert.equal(existsSync(path.join(workspace, 'ignored-dir')), false);
});

test('copyProjectToWorkspace has no hard size limit by default but fails closed when configured', () => {
  const project = tmp();
  const workspace = tmp();
  writeFileSync(path.join(project, 'large.txt'), 'x'.repeat(1024 * 1024 + 1));
  const copied = copyProjectToWorkspace(project, workspace);
  assert.equal(copied.copied_count, 1);
  assert.equal(existsSync(path.join(workspace, 'large.txt')), true);

  const limitedWorkspace = tmp();
  assert.throws(() => copyProjectToWorkspace(project, limitedWorkspace, { max_file_size_mb: 0.5 }), /copy policy limit exceeded/);
});
