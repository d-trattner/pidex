import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);

const checkStages = [
  'check:bootstrap',
  'check:runtime',
  'check:quality',
  'check:release',
];

// cmd.exe rejects command lines near 8191 characters. Keep a safety margin for
// pnpm's wrapper and environment-specific quoting.
const WINDOWS_SAFE_SCRIPT_LENGTH = 7000;

test('check is split into Windows-safe command lines without dropping stages', () => {
  assert.equal(
    packageJson.scripts.check,
    checkStages.map((name) => `corepack pnpm run ${name}`).join(' && '),
  );

  for (const name of checkStages) {
    const command = packageJson.scripts[name];
    assert.equal(typeof command, 'string', `${name} must exist`);
    assert.ok(command.length > 0, `${name} must not be empty`);
    assert.ok(
      command.length < WINDOWS_SAFE_SCRIPT_LENGTH,
      `${name} is too long for a safely wrapped Windows command: ${command.length}`,
    );
  }
});
