import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateSandboxDiff, validateChangedFiles, parseNameStatus } from './diff.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-diff-test-')); }
function git(cwd, args) { const p = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout.trim(); }
function initRepo() { const dir = tmp(); git(dir, ['init']); git(dir, ['config', 'user.email', 't@example.invalid']); git(dir, ['config', 'user.name', 'T']); writeFileSync(path.join(dir, 'a.txt'), 'a\n'); git(dir, ['add', '-A']); git(dir, ['commit', '-m', 'base']); return dir; }

test('generateSandboxDiff stages untracked files into binary-capable patch', () => {
  const repo = initRepo();
  writeFileSync(path.join(repo, 'new.txt'), 'new\n');
  const result = generateSandboxDiff({ workspace: repo, patches: path.join(repo, '..', 'patches') });
  assert.equal(result.ok, true);
  assert.equal(result.changed_files.some((entry) => entry.paths.includes('new.txt')), true);
});

test('generateSandboxDiff rejects forbidden secret/runtime paths', () => {
  const repo = initRepo();
  writeFileSync(path.join(repo, '.env.production'), 'SECRET=x\n');
  const result = generateSandboxDiff({ workspace: repo, patches: path.join(repo, '..', 'patches') });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'forbidden-patch-paths');
  assert.equal(result.findings[0].path, '.env.production');
});

test('generateSandboxDiff excludes artifacts from source patch channel', () => {
  const repo = initRepo();
  mkdirSync(path.join(repo, 'agents.output'), { recursive: true });
  writeFileSync(path.join(repo, 'agents.output', 'report.md'), 'artifact\n');
  writeFileSync(path.join(repo, 'src.txt'), 'source\n');
  const result = generateSandboxDiff({ workspace: repo, patches: path.join(repo, '..', 'patches') });
  assert.equal(result.ok, true);
  assert.equal(result.changed_files.some((entry) => entry.paths.includes('agents.output/report.md')), false);
  assert.equal(result.changed_files.some((entry) => entry.paths.includes('src.txt')), true);
});

test('generateSandboxDiff ignores gitignored agents.output artifacts without blocking source diff', () => {
  const repo = initRepo();
  writeFileSync(path.join(repo, '.gitignore'), 'agents.output/\n');
  git(repo, ['add', '.gitignore']);
  git(repo, ['commit', '-m', 'ignore artifacts']);
  mkdirSync(path.join(repo, 'agents.output', 'implementation'), { recursive: true });
  writeFileSync(path.join(repo, 'agents.output', 'implementation', 'note.md'), 'artifact\n');
  writeFileSync(path.join(repo, 'src.txt'), 'source\n');
  const result = generateSandboxDiff({ workspace: repo, patches: path.join(repo, '..', 'patches') });
  assert.equal(result.ok, true);
  assert.equal(result.changed_files.some((entry) => entry.paths.includes('agents.output/implementation/note.md')), false);
  assert.equal(result.changed_files.some((entry) => entry.paths.includes('src.txt')), true);
  assert.equal(readFileSync(result.patch_path, 'utf8').includes('agents.output'), false);
});
