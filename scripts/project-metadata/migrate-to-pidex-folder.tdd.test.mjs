#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts/project-metadata/migrate-to-pidex-folder.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-metadata-migrate-'));
try {
  mkdirSync(path.join(tmp, 'wiki', 'rules'), { recursive: true });
  writeFileSync(path.join(tmp, 'wiki', 'rules', 'one.md'), 'rule', 'utf8');
  writeFileSync(path.join(tmp, 'wiki', '.hygiene-state.json'), '{"ok":true}', 'utf8');
  const dry = spawnSync(process.execPath, [script, '--dry-run', tmp], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr || dry.stdout);
  assert.equal(existsSync(path.join(tmp, 'pidex', 'rules')), false);
  const run = spawnSync(process.execPath, [script, tmp], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const payload = JSON.parse(run.stdout);
  assert.equal(payload.ok, true);
  assert.equal(readFileSync(path.join(tmp, 'pidex', 'rules', 'one.md'), 'utf8'), 'rule');
  assert.equal(readFileSync(path.join(tmp, 'pidex', 'state', 'wiki-hygiene.json'), 'utf8'), '{"ok":true}');
  assert.equal(existsSync(path.join(tmp, 'wiki', 'rules')), false);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('project-metadata migrate Node tests passed');
