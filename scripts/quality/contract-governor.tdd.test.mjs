#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectContractCorrections } from './contract-correction-detector.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

assert.deepEqual(detectContractCorrections({ report: { summary: { operator_trace: { findings: [] } } }, opDecisions: [] }), []);
const report = { generated_at: '2026-01-01T00:00:00Z', project_path: '/tmp/project', summary: { operator_trace: { findings: [
  { type: 'instrumentation_missing', operator_type: 'OpQualityReview', plan_key: 'plan-001', severity: 'low', reason: 'A terminal pipeline event exists, but no structured OpQualityReview event or explicit skip was found.', contract_id: 'operator.OpQualityReview.terminal-pdq' },
  { type: 'instrumentation_missing', operator_type: 'OpQualityReview', plan_key: 'plan-002', severity: 'low', reason: 'A terminal pipeline event exists, but no structured OpQualityReview event or explicit skip was found.', contract_id: 'operator.OpQualityReview.terminal-pdq' },
  { type: 'instrumentation_missing', operator_type: 'OpQualityReview', plan_key: 'plan-003', severity: 'low', reason: 'A terminal pipeline event exists, but no structured OpQualityReview event or explicit skip was found.', contract_id: 'operator.OpQualityReview.terminal-pdq' }
] } } };
assert.equal(detectContractCorrections({ report, reportFile: 'r.json', opDecisions: [] }).length, 1);

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-governor-'));
try {
  const project = path.join(tmp, 'project'); mkdirSync(project, { recursive: true }); mkdirSync(path.join(tmp, 'state/quality'), { recursive: true }); mkdirSync(path.join(tmp, 'config'), { recursive: true });
  writeFileSync(path.join(tmp, 'config/contract-governor.json'), JSON.stringify({ version: 1, enabled: true, mode: 'deterministic-only', auto_apply: 'off', hot_mode: false, max_proposals_per_run: 5 }), 'utf8');
  const reportFile = path.join(tmp, 'state/quality/report.json'); writeFileSync(reportFile, JSON.stringify({ ...report, project_path: project }), 'utf8');
  const cp = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/contract-governor.mjs'), 'run', '--root', tmp, '--project', project, '--report', reportFile], { encoding: 'utf8' });
  assert.equal(cp.status, 0, cp.stderr || cp.stdout);
  const result = JSON.parse(cp.stdout);
  assert.equal(result.proposals_reviewed, 1);
  assert.equal(result.auto_applied, 0);
  assert.equal(JSON.parse(readFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), 'utf8').trim().split(/\r?\n/)[0]).status, 'pending');

  mkdirSync(path.join(tmp, 'state/orchestrator-events/test'), { recursive: true });
  writeFileSync(path.join(tmp, 'state/orchestrator-events/test/events.jsonl'), `${JSON.stringify({ timestamp: '2026-01-01T00:01:00Z', operator_type: 'OpDecision', decision_type: 'expectation_correction', target_operator: 'OpQualityReview', plan_key: 'plan-001', reason: 'expectation-wrong', confidence: 'high', project_path: project, contract_patch: { required_when: 'terminal pipeline event exists and auto-PDQ hooks were enabled' } })}\n`, 'utf8');
  writeFileSync(path.join(tmp, 'config/contract-governor.local.json'), JSON.stringify({ enabled: true, mode: 'deterministic-only', auto_apply: 'low-risk', hot_mode: true }), 'utf8');
  const cp2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/contract-governor.mjs'), 'run', '--root', tmp, '--project', project, '--report', reportFile], { encoding: 'utf8', env: { ...process.env, PIDEX_CONTRACT_GOVERNOR_HOT_MODE: '1' } });
  assert.equal(cp2.status, 0, cp2.stderr || cp2.stdout);
  assert.equal(JSON.parse(cp2.stdout).auto_applied, 1);
  assert.ok(readFileSync(path.join(tmp, 'config/operator-contracts.local.json'), 'utf8').includes('approved'));
  const gateReportFile = path.join(tmp, 'state/quality/gate-report.json');
  writeFileSync(gateReportFile, JSON.stringify({ ...report, project_path: project, summary: { operator_trace: { findings: [] } } }), 'utf8');
  writeFileSync(path.join(tmp, 'state/orchestrator-events/test/gate.jsonl'), `${JSON.stringify({ timestamp: '2026-01-01T00:02:00Z', operator_type: 'OpDecision', decision_type: 'expectation_correction', target_operator: 'OpGate', plan_key: 'plan-001', reason: 'expectation-wrong', confidence: 'high', project_path: project, contract_patch: { required_when: 'never' } })}\n`, 'utf8');
  const cpForbidden = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/contract-governor.mjs'), 'run', '--root', tmp, '--project', project, '--report', gateReportFile], { encoding: 'utf8', env: { ...process.env, PIDEX_CONTRACT_GOVERNOR_HOT_MODE: '1' } });
  assert.equal(cpForbidden.status, 0, cpForbidden.stderr || cpForbidden.stdout);
  assert.equal(JSON.parse(cpForbidden.stdout).decisions.some((d) => d.proposal.operator_type === 'OpGate' && d.applied), false);

  const evalRun = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/contract-governor.mjs'), 'evaluate', '--root', tmp, '--project', project, '--correction-id', JSON.parse(cp2.stdout).decisions.find((d) => d.applied).proposal.id], { encoding: 'utf8' });
  assert.equal(evalRun.status, 0, evalRun.stderr || evalRun.stdout);
  assert.ok(['validated', 'needs_review'].includes(JSON.parse(evalRun.stdout).evaluation.monitoring_status));
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log('quality contract-governor.mjs tests passed');
