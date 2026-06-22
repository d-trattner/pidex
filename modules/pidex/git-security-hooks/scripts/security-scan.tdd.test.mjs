#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const scanner = path.join(repoRoot, 'modules/pidex/git-security-hooks/scripts/lib/security-scan.sh');

function bashPath(file) {
  if (process.platform !== 'win32') return file;
  const proc = spawnSync('cygpath', ['-u', file], { encoding: 'utf8' });
  if (proc.status === 0 && proc.stdout.trim()) return proc.stdout.trim();
  return file.replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`).replaceAll('\\', '/');
}

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

function chmodTreeWritable(target) {
  try {
    chmodSync(target, 0o700);
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      const child = path.join(target, entry.name);
      if (entry.isDirectory()) chmodTreeWritable(child);
      else chmodSync(child, 0o600);
    }
  } catch {
    // Best effort only; Windows Git/Bash may hold transient handles.
  }
}

function cleanup(dir) {
  chmodTreeWritable(dir);
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
  } catch (error) {
    if (process.platform === 'win32' && (error?.code === 'EPERM' || error?.code === 'EBUSY')) return;
    throw error;
  }
}

{
  const dir = initRepo();
  try {
    writeFileSync(path.join(dir, '.gitignore'), 'agents.output/\n');
    writeFileSync(path.join(dir, 'README.md'), '# ok\n');
    assert.equal(run('git', ['add', '.gitignore', 'README.md'], dir).status, 0);
    const result = run('bash', [bashPath(scanner), '--staged'], dir);
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
    const result = run('bash', [bashPath(scanner), '--staged'], dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /COMMIT BLOCKED: Ignored files are staged/);
    assert.match(result.stdout, /agents\.output\/qa\/leak\.md/);
  } finally {
    cleanup(dir);
  }
}

console.log('security-scan ignored-file tests passed');
