import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CHECK_STAGES,
  runCheckStages,
  stageInvocation,
} from './run-check-stages.mjs';

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);
const parallelStatusSource = await readFile(
  new URL('../../modules/pidex/parallel-agents/scripts/status.mjs', import.meta.url),
  'utf8',
);

// cmd.exe rejects command lines near 8191 characters. Keep a safety margin for
// pnpm's wrapper and environment-specific quoting.
const WINDOWS_SAFE_SCRIPT_LENGTH = 7000;

test('Windows checkout preserves executable module shebang as LF bytes', () => {
  assert.ok(parallelStatusSource.startsWith('#!/usr/bin/env node\n'));
  assert.equal(parallelStatusSource.includes('\r\n'), false);
});

test('check dispatches ordered Windows-safe stages through a short Node entrypoint', () => {
  assert.equal(
    packageJson.scripts.check,
    'node scripts/package-manager/run-check-stages.mjs',
  );

  for (const name of CHECK_STAGES) {
    const command = packageJson.scripts[name];
    assert.equal(typeof command, 'string', `${name} must exist`);
    assert.ok(command.length > 0, `${name} must not be empty`);
    assert.ok(
      command.length < WINDOWS_SAFE_SCRIPT_LENGTH,
      `${name} is too long for a safely wrapped Windows command: ${command.length}`,
    );
    const invocation = stageInvocation(name, 'win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' });
    assert.equal(invocation.command, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(invocation.args, ['/d', '/s', '/c', `pnpm.cmd run ${name}`]);
  }
});

test('dispatcher preserves stage order and stops at the first failure', () => {
  const calls = [];
  const status = runCheckStages({
    platform: 'win32',
    env: { ComSpec: 'cmd.exe' },
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: calls.length === 3 ? 7 : 0 };
    },
  });

  assert.equal(status, 7);
  assert.deepEqual(
    calls.map((call) => call.args.at(-1)),
    CHECK_STAGES.slice(0, 3).map((name) => `pnpm.cmd run ${name}`),
  );
  assert.ok(calls.every((call) => call.options.shell === false));
});

test('Windows dispatcher reaches standalone pnpm.cmd through the real command processor', {
  skip: process.platform !== 'win32' ? 'native Windows only' : false,
}, () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-check-dispatch-'));
  const log = path.join(root, 'stages.log');
  const shim = path.join(root, 'pnpm.cmd');
  try {
    writeFileSync(shim, '@echo off\r\necho %*>>"%PIDEX_STAGE_LOG%"\r\nexit /b 0\r\n');
    const env = {
      ...process.env,
      PATH: `${root};${process.env.PATH || ''}`,
      PIDEX_STAGE_LOG: log,
    };
    assert.equal(runCheckStages({ platform: 'win32', env }), 0);
    assert.deepEqual(
      readFileSync(log, 'utf8').trim().split(/\r?\n/),
      CHECK_STAGES.map((name) => `run ${name}`),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
