import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const mod = await import(pathToFileURL(path.resolve('extensions/pidex/index.ts')).href);
const helperAbs = path.resolve(['modules', 'pidex', 'sandbox-runtime', 'scripts', 'sandbox', 'status.mjs'].join('/'));
const context = {
  mode: 'hardened-pipeline',
  runId: 'sandbox-test01',
  hostProjectRoot: path.resolve('.'),
  sandboxWorkspace: '/tmp/pidex-sandbox/workspace',
  allowedWriteRoot: '/tmp/pidex-sandbox/workspace',
};

function withSandboxContext(fn) {
  const prev = process.env.PIDEX_SANDBOX_CONTEXT;
  process.env.PIDEX_SANDBOX_CONTEXT = JSON.stringify(context);
  try { return fn(); }
  finally {
    if (prev === undefined) delete process.env.PIDEX_SANDBOX_CONTEXT;
    else process.env.PIDEX_SANDBOX_CONTEXT = prev;
  }
}

function inspect(command) {
  return withSandboxContext(() => mod.inspectSandboxToolCall({ toolName: 'bash', input: { command } }, { cwd: context.sandboxWorkspace }));
}

function git(cwd, args) { const p = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); return p.stdout.trim(); }
function tmpRepo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-extension-sandbox-test-'));
  git(dir, ['init']); git(dir, ['config', 'user.email', 't@example.invalid']); git(dir, ['config', 'user.name', 'T']);
  writeFileSync(path.join(dir, 'README.md'), 'base\n');
  writeFileSync(path.join(dir, '.gitignore'), '');
  git(dir, ['add', '-A']); git(dir, ['commit', '-m', 'base']);
  return dir;
}

test('active sandbox bash guard allows only canonical helper bash', () => {
  assert.equal(inspect(`node ${helperAbs} --pidex-root ${path.resolve('.')} --run-id sandbox-test01 --json`), undefined);
});

test('active sandbox bash guard denies raw host bash by default', () => {
  for (const command of [
    'cat ~/.npmrc',
    'env',
    'docker ps',
    'docker run -v /:/host alpine ls /host',
    'curl https://example.com',
    'touch /tmp/pidex-host-file',
  ]) {
    const result = inspect(command);
    assert.equal(result?.block, true, command);
    assert.match(result.reason, /blocks raw host bash/);
  }
});

test('active sandbox bash guard denies missing bash command', () => {
  const result = withSandboxContext(() => mod.inspectSandboxToolCall({ toolName: 'bash', input: {} }, { cwd: context.sandboxWorkspace }));
  assert.equal(result?.block, true);
  assert.match(result.reason, /without an explicit command/);
});

test('sandbox routing context must use agents.output artifact channel', () => {
  assert.deepEqual(mod.validateSandboxRoutingContext('pidex-qa', 'agents.output/qa/report.md'), { ok: true });
  const bad = mod.validateSandboxRoutingContext('pidex-qa', 'README.md');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /artifact channel/);
});

test('sandbox source status ignores PIDEX runtime paths and allowed gitignore additions', () => {
  const repo = tmpRepo();
  mkdirSync(path.join(repo, 'agents.output'), { recursive: true });
  writeFileSync(path.join(repo, 'agents.output/report.md'), 'artifact\n');
  mkdirSync(path.join(repo, 'pidex/context'), { recursive: true });
  writeFileSync(path.join(repo, 'pidex/context/CONTEXT.md'), 'context\n');
  mkdirSync(path.join(repo, '.fallow'), { recursive: true });
  writeFileSync(path.join(repo, '.fallow/cache.bin'), 'cache\n');
  writeFileSync(path.join(repo, '.gitignore'), 'agents.output/\npidex/state/\n.fallow/\n');
  assert.equal(mod.gitSourceStatusPorcelain(repo), '');
  writeFileSync(path.join(repo, 'README.md'), 'dirty\n');
  assert.match(mod.gitSourceStatusPorcelain(repo), /README\.md/);
});

test('validation source mutation ignores untracked local wiki but rejects tracked wiki', () => {
  const repo = tmpRepo();
  assert.deepEqual(mod.validationSourceMutationFiles(repo, [{ status: 'M', paths: ['wiki/log.md'] }]), []);
  mkdirSync(path.join(repo, 'wiki'), { recursive: true });
  writeFileSync(path.join(repo, 'wiki/product.md'), 'tracked\n');
  git(repo, ['add', 'wiki/product.md']);
  git(repo, ['commit', '-m', 'track wiki product doc']);
  assert.deepEqual(mod.validationSourceMutationFiles(repo, [{ status: 'M', paths: ['wiki/product.md'] }]), ['wiki/product.md']);
});
