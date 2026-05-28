#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContracts, resetContractCache } from './operator-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-contract-admin-'));
try {
  const propose = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/operator-contracts-admin.mjs'), 'propose', '--root', tmp, '--id', 'corr-1', '--operator-type', 'OpQualityReview', '--change-type', 'required_when', '--new-value', 'terminal event and hooks enabled', '--reason', 'manual backfills exist'], { encoding: 'utf8' });
  assert.equal(propose.status, 0, propose.stderr || propose.stdout);
  assert.equal(JSON.parse(propose.stdout).correction.status, 'pending');

  resetContractCache();
  assert.equal(loadContracts(tmp).OpQualityReview.required_when, 'terminal pipeline event exists');

  const approve = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/operator-contracts-admin.mjs'), 'approve', '--root', tmp, '--id', 'corr-1', '--approved-by', 'operator', '--effective-from', 'now'], { encoding: 'utf8' });
  assert.equal(approve.status, 0, approve.stderr || approve.stdout);
  const local = JSON.parse(readFileSync(path.join(tmp, 'config/operator-contracts.local.json'), 'utf8'));
  assert.equal(local.overrides[0].status, 'approved');
  resetContractCache();
  assert.equal(loadContracts(tmp).OpQualityReview.required_when, 'terminal event and hooks enabled');

  const list = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/operator-contracts-admin.mjs'), 'list', '--root', tmp, '--status', 'approved'], { encoding: 'utf8' });
  assert.equal(list.status, 0, list.stderr || list.stdout);
  assert.equal(JSON.parse(list.stdout).corrections.length, 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
  resetContractCache();
}
console.log('quality operator-contracts-admin.mjs tests passed');
