import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyDelegateAuthFailure, delegateAuthInvocationSpec } from './index.ts';

test('Windows delegate auth paths use separate Bash-safe arguments', () => {
  const standard = delegateAuthInvocationSpec('C:\\Users\\Example\\pidex', 'C:\\Users\\Example\\pidex\\config\\agents.json', 'win32');
  assert.equal(standard.command, 'bash');
  assert.equal(standard.cwd, 'C:\\Users\\Example\\pidex');
  assert.deepEqual(standard.args, ['scripts/delegate/check-auth.sh', '--config', 'config/agents.json']);
  assert.deepEqual(delegateAuthInvocationSpec('C:\\Users\\Example\\pidex', 'config\\agents.json', 'win32').args, ['scripts/delegate/check-auth.sh', '--config', 'config/agents.json']);

  const spaced = delegateAuthInvocationSpec('C:\\Users\\Example User\\pidex ü', 'C:\\Users\\Example User\\pidex ü\\config\\agents custom.json', 'win32');
  assert.equal(spaced.cwd, 'C:\\Users\\Example User\\pidex ü');
  assert.deepEqual(spaced.args, ['scripts/delegate/check-auth.sh', '--config', 'config/agents custom.json']);
  assert.equal(spaced.args.some((arg) => arg.includes('\\')), false);
});

test('Linux and macOS delegate auth invocation remains argument-safe', () => {
  for (const platform of ['linux', 'darwin']) {
    const spec = delegateAuthInvocationSpec('/home/example user/pidex', '/home/example user/pidex/config/agents.json', platform);
    assert.deepEqual(spec, {
      command: 'bash',
      args: ['scripts/delegate/check-auth.sh', '--config', 'config/agents.json'],
      cwd: '/home/example user/pidex',
    });
  }
});

test('Bash receives script and config as distinct arguments through paths with spaces and non-ASCII', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex auth ü-'));
  const script = path.join(root, 'scripts', 'delegate', 'check-auth.sh');
  const config = path.join(root, 'config', 'agents custom.json');
  mkdirSync(path.dirname(script), { recursive: true });
  mkdirSync(path.dirname(config), { recursive: true });
  writeFileSync(config, '{}\n');
  writeFileSync(script, '#!/usr/bin/env bash\nprintf "<%s>\\n" "$0" "$1" "$2"\n');
  const spec = delegateAuthInvocationSpec(root, config);
  const run = spawnSync(spec.command, spec.args, { cwd: spec.cwd, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.stdout.trim().split(/\r?\n/), ['<scripts/delegate/check-auth.sh>', '<--config>', '<config/agents custom.json>']);
});

test('launch/setup failures are distinct from credential failures', () => {
  assert.equal(classifyDelegateAuthFailure(0, ''), undefined);
  assert.equal(classifyDelegateAuthFailure(127, 'bash: checker: No such file or directory'), 'launch');
  assert.equal(classifyDelegateAuthFailure(1, 'ERROR: config file not found'), 'launch');
  assert.equal(classifyDelegateAuthFailure(1, 'FAIL codex: no usable tokens'), 'authentication');
  assert.equal(classifyDelegateAuthFailure(1, '', true, false), 'launch');
  assert.equal(classifyDelegateAuthFailure(1, '', false, true), 'launch');
});
