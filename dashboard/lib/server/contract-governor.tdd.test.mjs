#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getContractGovernorStatus } from './contract-governor.ts';

const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-governor-read-model-'));
try {
  mkdirSync(path.join(root, 'config'), { recursive: true });
  mkdirSync(path.join(root, 'state/quality'), { recursive: true });
  writeFileSync(path.join(root, 'config/contract-governor.json'), JSON.stringify({ version: 2, capability: 'manual-pending-only', timeout_seconds: 60, max_proposals_per_run: 5 }));
  writeFileSync(path.join(root, 'state/quality/contract-corrections.jsonl'), [
    { timestamp: '2026-01-01T00:00:00Z', id: 'legacy', status: 'approved', operator_type: 'OpQualityReview', approved_by: 'daniel' },
    { timestamp: '2026-01-02T00:00:00Z', id: 'legacy', status: 'validated', monitoring_status: 'validated', validation_metrics: { matching_findings_after: 9 } },
    { timestamp: '2026-01-03T00:00:00Z', id: 'pending', status: 'pending', operator_type: 'OpQualityReview' },
  ].map(JSON.stringify).join('\n') + '\n');
  const status = await getContractGovernorStatus(root);
  assert.equal(status.capability, 'manual-pending-only');
  assert.deepEqual(status.effective_config, { version: 2, capability: 'manual-pending-only', timeout_seconds: 60, max_proposals_per_run: 5 });
  assert.equal(status.pending.length, 1);
  const legacy = status.approved.find((row) => row.id === 'legacy');
  assert.equal(legacy.source_status, 'validated');
  assert.equal(legacy.assessment, 'inconclusive');
  assert.equal(legacy.approved_by, 'daniel');
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('contract governor read model tests passed');
