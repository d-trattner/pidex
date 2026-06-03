#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scanner = path.join(repoRoot, 'modules/pidex/git-security-hooks/scripts/lib/security-scan.sh');

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function initRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pidex-security-scan-'));
  assert.equal(run('git', ['init'], dir).status, 0);
  assert.equal(run('git', ['config', 'user.email', 'test@example.invalid'], dir).status, 0);
  assert.equal(run('git', ['config', 'user.name', 'Test User'], dir).status, 0);
  return dir;
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = initRepo();
  try {
    writeFileSync(path.join(dir, '.gitignore'), 'agents.output/\n');
    writeFileSync(path.join(dir, 'README.md'), '# ok\n');
    assert.equal(run('git', ['add', '.gitignore', 'README.md'], dir).status, 0);
    const result = run('bash', [scanner, '--staged'], dir);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    cleanup(dir);
  }
}

{
  const dir = initRepo();
  try {
    writeFileSync(path.join(dir, '.gitignore'), 'agents.output/\n');
    mkdirSync(path.join(dir, 'agents.output', 'qa'), { recursive: true });
    writeFileSync(path.join(dir, 'agents.output', 'qa', 'leak.md'), 'runtime evidence\n');
    assert.equal(run('git', ['add', '.gitignore'], dir).status, 0);
    assert.equal(run('git', ['add', '-f', 'agents.output/qa/leak.md'], dir).status, 0);
    const result = run('bash', [scanner, '--staged'], dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /COMMIT BLOCKED: Ignored files are staged/);
    assert.match(result.stdout, /agents\.output\/qa\/leak\.md/);
  } finally {
    cleanup(dir);
  }
}

console.log('security-scan ignored-file tests passed');
