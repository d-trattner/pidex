import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./reference-integrity.mjs', import.meta.url));

function run(root) {
  return spawnSync(process.execPath, [checker, '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
}

test('Docker image coordinates in the pidex namespace are not treated as package paths', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'pidex-reference-integrity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'README.md'), [
    'Run `docker run pidex/project-node22:local`.',
    'Then run `node scripts/release/real-check.mjs`.',
    '',
  ].join('\n'));

  const failed = run(root);
  assert.equal(failed.status, 1, failed.stderr);
  assert.deepEqual(JSON.parse(failed.stdout).findings.map(item => item.ref), ['scripts/release/real-check.mjs']);

  mkdirSync(path.join(root, 'scripts/release'), { recursive: true });
  writeFileSync(path.join(root, 'scripts/release/real-check.mjs'), '');
  const passed = run(root);
  assert.equal(passed.status, 0, passed.stderr);
  assert.deepEqual(JSON.parse(passed.stdout), { ok: true, findings: [] });
});
