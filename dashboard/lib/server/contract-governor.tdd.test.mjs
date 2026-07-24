#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { contractGovernorReadResponse, getContractGovernorStatus, rejectContractGovernorWrite } from './contract-governor.ts';

function root() { const value = mkdtempSync(path.join(os.tmpdir(), 'pidex-governor-read-model-')); mkdirSync(path.join(value, 'config'), { recursive: true }); mkdirSync(path.join(value, 'state/quality'), { recursive: true }); writeFileSync(path.join(value, 'config/contract-governor.json'), JSON.stringify({ version: 2, capability: 'manual-pending-only', max_proposals_per_run: 5 })); return value; }
const roots = [];
try {
  const valid = root(); roots.push(valid);
  writeFileSync(path.join(valid, 'config/contract-governor.local.json'), JSON.stringify({ max_proposals_per_run: 9 }));
  writeFileSync(path.join(valid, 'state/quality/contract-corrections.jsonl'), [
    { timestamp: '2026-01-01T00:00:00Z', id: 'contract-correction-588aef3563e77972', status: 'approved', operator_type: 'OpQualityReview', contract_id: 'operator.OpQualityReview.terminal-pdq', approved_by: 'daniel' },
    { timestamp: '2026-01-02T00:00:00Z', id: 'contract-correction-588aef3563e77972', status: 'validated', source: 'contract-governor-evaluate', monitoring_status: 'validated', validation_metrics: { matching_findings_after: 9 } },
    { timestamp: '2026-01-02T00:00:00Z', id: 'unrelated', status: 'approved', operator_type: 'OpQualityReview', contract_id: 'operator.OpQualityReview.terminal-pdq', approved_by: 'operator' },
    { timestamp: '2026-01-03T00:00:00Z', id: 'unrelated', status: 'validated', source: 'contract-governor-evaluate', validation_metrics: { matching_findings_after: 1 } },
    { timestamp: '2026-01-04T00:00:00Z', id: 'pending', status: 'pending', operator_type: 'OpQualityReview' },
  ].map(JSON.stringify).join('\n') + '\n');
  const status = await getContractGovernorStatus(valid);
  assert.equal(status.ok, true);
  assert.deepEqual(status.effective_config, { version: 2, capability: 'manual-pending-only', max_proposals_per_run: 9 });
  assert.equal(status.pending.length, 1);
  assert.equal(status.approved.find((row) => row.id === 'contract-correction-588aef3563e77972').assessment, 'inconclusive');
  assert.equal(status.approved.find((row) => row.id === 'unrelated').assessment, undefined, 'unrelated future correction must retain source meaning');
  const localPath = path.join(valid, 'config/contract-governor.local.json'); const localBefore = readFileSync(localPath, 'utf8');
  const post = rejectContractGovernorWrite();
  assert.equal(post.status, 405); assert.match(await post.text(), /GOVERNOR_CONFIG_READ_ONLY/); assert.equal(readFileSync(localPath, 'utf8'), localBefore);

  const malformedConfig = root(); roots.push(malformedConfig); writeFileSync(path.join(malformedConfig, 'config/contract-governor.local.json'), '{bad');
  const badConfig = await getContractGovernorStatus(malformedConfig);
  assert.equal(badConfig.ok, false); assert.equal(badConfig.error_code, 'GOVERNOR_CONFIG_INVALID');

  const malformedLedger = root(); roots.push(malformedLedger); writeFileSync(path.join(malformedLedger, 'state/quality/contract-corrections.jsonl'), '{bad\n');
  const badLedger = await getContractGovernorStatus(malformedLedger);
  assert.equal(badLedger.ok, false); assert.equal(badLedger.error_code, 'GOVERNOR_LEDGER_INVALID');
  const degradedResponse = await contractGovernorReadResponse(malformedLedger); assert.equal(degradedResponse.status, 503); assert.equal((await degradedResponse.json()).error_code, 'GOVERNOR_LEDGER_INVALID');
} finally { for (const value of roots) rmSync(value, { recursive: true, force: true }); }
console.log('contract governor read model tests passed');
