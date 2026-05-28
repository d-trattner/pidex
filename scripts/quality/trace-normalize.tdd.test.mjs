#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-trace-normalize-'));
try {
  const project = path.join(tmp, 'project');
  mkdirSync(path.join(tmp, 'state/quality'), { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(path.join(tmp, 'state/quality/report.json'), JSON.stringify({ generated_at: '2026-05-20T00:00:00Z', project_path: project, summary: { operator_trace: { findings: [
    { type: 'unlogged_operator', operator_type: 'OpSpawn', plan_key: 'plan-001', agent: 'pidex-qa', confidence: 'low', evidence: 'metrics.jsonl' },
    { type: 'unlogged_operator', operator_type: 'OpRoute', plan_key: 'plan-001', agent: 'pidex-qa', expected_route_to: 'pidex-devops', confidence: 'low' },
    { type: 'missing_operator', operator_type: 'OpGate', plan_key: 'plan-001', gate: 'G9', confidence: 'high' }
  ] } } }), 'utf8');

  const dry = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/trace-normalize.mjs'), 'dry-run', '--root', tmp, '--project', project, '--before', '2026-05-21T00:00:00Z'], { encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr || dry.stdout);
  const dryJson = JSON.parse(dry.stdout);
  assert.equal(dryJson.candidates, 2);
  assert.equal(dryJson.sample[0].operator_type, 'OpDecision');
  assert.equal(dryJson.sample[0].target_operator, 'OpSpawn');

  const apply = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/trace-normalize.mjs'), 'apply', '--root', tmp, '--project', project, '--before', '2026-05-21T00:00:00Z', '--approved-by', 'operator'], { encoding: 'utf8' });
  assert.equal(apply.status, 0, apply.stderr || apply.stdout);
  assert.equal(JSON.parse(apply.stdout).applied, 2);

  const dry2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts/quality/trace-normalize.mjs'), 'dry-run', '--root', tmp, '--project', project, '--before', '2026-05-21T00:00:00Z'], { encoding: 'utf8' });
  assert.equal(dry2.status, 0, dry2.stderr || dry2.stdout);
  assert.equal(JSON.parse(dry2.stdout).candidates, 0);
  const rows = readFileSync(path.join(tmp, 'state/quality/trace-normalization.jsonl'), 'utf8').trim().split(/\r?\n/);
  assert.equal(rows.length, 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('quality trace-normalize.mjs tests passed');
