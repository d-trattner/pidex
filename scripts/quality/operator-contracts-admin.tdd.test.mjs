#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONTRACTS, loadContracts, resetContractCache } from './operator-contracts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(ROOT, 'scripts/quality/operator-contracts-admin.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-contract-admin-'));
function run(args) { return spawnSync(process.execPath, [script, ...args, '--root', tmp], { encoding: 'utf8' }); }
try {
  const unsupported = run(['propose', '--id', 'bad', '--operator-type', 'OpQualityReview', '--change-type', 'required_when', '--new-value', 'never', '--reason', 'bad']);
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /CONTRACT_OVERRIDE_PATCH_UNSUPPORTED/);

  const reasons = [...CONTRACTS.OpQualityReview.allowed_skip_reasons, 'manual-terminal-import'].join(',');
  const propose = run(['propose', '--id', 'corr-1', '--operator-type', 'OpQualityReview', '--change-type', 'allowed_skip_reasons', '--new-value', reasons, '--reason', 'manual imports need explicit skip']);
  assert.equal(propose.status, 0, propose.stderr || propose.stdout);
  assert.equal(JSON.parse(propose.stdout).correction.status, 'pending');
  const ledgerBeforeBadDate = readFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), 'utf8');
  const badDate = run(['approve', '--id', 'corr-1', '--approved-by', 'operator', '--effective-from', 'not-a-date']);
  assert.equal(badDate.status, 1);
  assert.match(badDate.stderr, /CONTRACT_OVERRIDE_APPROVAL_INVALID/);
  assert.equal(readFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), 'utf8'), ledgerBeforeBadDate);

  const approve = run(['approve', '--id', 'corr-1', '--approved-by', 'operator', '--effective-from', '2026-01-01T00:00:00Z']);
  assert.equal(approve.status, 0, approve.stderr || approve.stdout);
  const local = JSON.parse(readFileSync(path.join(tmp, 'config/operator-contracts.local.json'), 'utf8'));
  assert.equal(local.version, 2);
  assert.equal(local.overrides[0].status, 'approved');
  resetContractCache();
  assert.ok(loadContracts(tmp).OpQualityReview.allowed_skip_reasons.includes('manual-terminal-import'));
  writeFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), `${JSON.stringify({ timestamp: '2026-01-02T00:00:00Z', id: 'corr-1', status: 'validated', validation_metrics: { matching_findings_after: 9 } })}\n`, { flag: 'a' });

  const supersede = run(['supersede', '--id', 'corr-1', '--approved-by', 'operator', '--reason', 'reconciled as inconclusive']);
  assert.equal(supersede.status, 0, supersede.stderr || supersede.stdout);
  assert.equal(JSON.parse(readFileSync(path.join(tmp, 'config/operator-contracts.local.json'), 'utf8')).overrides.length, 0);
  const rows = readFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(rows.at(-1).status, 'superseded');
  assert.equal(rows.at(-1).monitoring_status, 'inconclusive');
  assert.equal(rows.at(-1).operator_type, 'OpQualityReview');
  assert.equal(rows.at(-1).contract_id, CONTRACTS.OpQualityReview.contract_id);

  const propose2 = run(['propose', '--id', 'corr-2', '--operator-type', 'OpQualityReview', '--change-type', 'allowed_skip_reasons', '--new-value', reasons, '--reason', 'malformed local test']);
  assert.equal(propose2.status, 0, propose2.stderr || propose2.stdout);
  const localPath = path.join(tmp, 'config/operator-contracts.local.json');
  writeFileSync(localPath, '{bad json\n');
  const malformedBefore = readFileSync(localPath, 'utf8');
  const ledgerBeforeMalformed = readFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), 'utf8');
  const malformed = run(['approve', '--id', 'corr-2', '--approved-by', 'operator', '--effective-from', 'now']);
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /CONTRACT_OVERRIDE_JSON_INVALID/);
  assert.equal(readFileSync(localPath, 'utf8'), malformedBefore);
  assert.equal(readFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), 'utf8'), ledgerBeforeMalformed);
} finally {
  rmSync(tmp, { recursive: true, force: true });
  resetContractCache();
}
console.log('quality operator-contracts-admin.mjs tests passed');
