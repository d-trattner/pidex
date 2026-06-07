import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
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
