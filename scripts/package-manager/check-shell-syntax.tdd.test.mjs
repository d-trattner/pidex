import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkShellSyntax } from './check-shell-syntax.mjs';

test('checks every file separately, ordered and bounded, then stops at first failure', () => {
  const calls = [];
  const spawn = (command, args, options) => {
    calls.push({ command, args, options });
    return { status: args.at(-1) === 'bad.sh' ? 2 : 0 };
  };
  assert.equal(checkShellSyntax(['first.sh', 'second with space.sh', 'bad.sh', 'unreached.sh'], { spawn }), 2);
  assert.deepEqual(calls.map(call => call.args), [['-n', '--', 'first.sh'], ['-n', '--', 'second with space.sh'], ['-n', '--', 'bad.sh']]);
  assert.ok(calls.every(call => call.command === 'bash' && call.options.shell === false && call.options.timeout === 10000));
});

test('empty input and spawn/timeout failures cannot pass', () => {
  assert.throws(() => checkShellSyntax([]));
  for (const result of [{ status: null, error: { code: 'ENOENT' } }, { status: null, signal: 'SIGTERM' }]) {
    assert.equal(checkShellSyntax(['test.sh'], { spawn: () => result }), 1);
  }
});

test('real bash detects invalid second file without executing the valid first file', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pidex shell syntax-'));
  try {
    writeFileSync(path.join(root, 'good.sh'), 'echo executed > marker\n');
    writeFileSync(path.join(root, 'bad.sh'), 'if then\n');
    assert.notEqual(checkShellSyntax(['good.sh', 'bad.sh'], { cwd: root }), 0);
    assert.equal(existsSync(path.join(root, 'marker')), false);
    writeFileSync(path.join(root, 'bad.sh'), 'echo valid now\n');
    assert.equal(checkShellSyntax(['good.sh', 'bad.sh'], { cwd: root }), 0);
    assert.equal(existsSync(path.join(root, 'marker')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
