#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireGovernorLock } from './contract-governor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(ROOT, 'scripts/quality/contract-governor.mjs');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-governor-v2-'));
const project = path.join(tmp, 'project');
function run(args = [], env = {}) { return spawnSync(process.execPath, [script, ...args, '--root', tmp, '--project', project], { encoding: 'utf8', env: { ...process.env, ...env } }); }
try {
  mkdirSync(path.join(tmp, 'config'), { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(path.join(tmp, 'config/contract-governor.json'), JSON.stringify({ version: 2, capability: 'manual-pending-only', timeout_seconds: 60, max_proposals_per_run: 5 }));
  const reportFile = path.join(tmp, 'report.json');
  writeFileSync(reportFile, JSON.stringify({ generated_at: '2026-01-01T00:00:00Z', project_path: project, summary: { operator_trace: { findings: [] } } }));
  mkdirSync(path.join(tmp, 'state/orchestrator-events/test'), { recursive: true });
  writeFileSync(path.join(tmp, 'state/orchestrator-events/test/events.jsonl'), [1, 2].map((n) => JSON.stringify({ timestamp: `2026-01-01T00:00:0${n}Z`, project_path: project, operator_type: 'OpDecision', decision_type: 'skip_step', target_operator: 'OpQualityReview', reason: 'manual-terminal-import', confidence: 'high', plan_key: `plan-00${n}` })).join('\n') + '\n');

  const first = run(['run', '--report', reportFile]);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const firstOut = JSON.parse(first.stdout);
  assert.equal(firstOut.capability, 'pending-only');
  assert.equal(firstOut.status, 'completed_pending');
  assert.equal(firstOut.proposals_pending, 1);
  assert.equal('auto_applied' in firstOut, false);

  const second = run(['run', '--report', reportFile]);
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(JSON.parse(second.stdout).duplicates, 1);
  const ledger = readFileSync(path.join(tmp, 'state/quality/contract-corrections.jsonl'), 'utf8').trim().split(/\r?\n/);
  assert.equal(ledger.length, 1, 'duplicate pending lifecycle rows are forbidden');

  const beforeEntries = readdirSync(path.join(tmp, 'state/quality/contract-governor')).length;
  const unsupported = run(['run', '--report', reportFile], { PIDEX_CONTRACT_GOVERNOR_HOT_MODE: '1' });
  assert.equal(unsupported.status, 2);
  assert.match(unsupported.stderr, /GOVERNOR_AUTOMATION_UNSUPPORTED/);
  assert.equal(readdirSync(path.join(tmp, 'state/quality/contract-governor')).length, beforeEntries);

  const evaluate = run(['evaluate', '--correction-id', 'anything']);
  assert.equal(evaluate.status, 2);
  assert.match(evaluate.stderr, /GOVERNOR_COMMAND_UNSUPPORTED/);

  const invalid = run(['run', '--report', path.join(tmp, 'missing-report.json')]);
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).status, 'invalid_input');

  const lockDir = path.join(tmp, 'state/quality/contract-governor/.lock');
  mkdirSync(lockDir, { recursive: true });
  writeFileSync(path.join(lockDir, 'meta.json'), '{}');
  utimesSync(lockDir, new Date(0), new Date(0));
  const locked = run(['run', '--report', reportFile]);
  assert.equal(locked.status, 0, locked.stderr || locked.stdout);
  assert.equal(JSON.parse(locked.stdout).status, 'locked');
  assert.ok(existsSync(lockDir), 'old uncertain lock must not be deleted');
  rmSync(lockDir, { recursive: true, force: true });

  const owned = acquireGovernorLock(tmp);
  assert.ok(owned);
  const meta = path.join(tmp, 'state/quality/contract-governor/.lock/meta.json');
  writeFileSync(meta, JSON.stringify({ token: 'replacement' }));
  assert.equal(owned.release(), false);
  assert.ok(existsSync(path.dirname(meta)), 'token mismatch must preserve lock');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('quality contract-governor.mjs tests passed');
