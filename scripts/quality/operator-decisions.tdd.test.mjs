#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildDecisionRecord, recordDecision, validateDecision } from './operator-decisions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const rec = buildDecisionRecord({
  project: '/tmp/example-project',
  pipelineId: 'pipe 1',
  plan: '4',
  decision: 'skip_step',
  targetOperator: 'OpPreflight',
  reason: 'continuation-existing-plan',
  approvedBy: 'operator',
  riskAccepted: 'true',
  followUpRequired: 'false',
  evidencePath: 'agents.output/planner/plan-004.md',
});
assert.equal(rec.operator_type, 'OpDecision');
assert.equal(rec.plan_key, 'plan-004');
assert.equal(rec.pipeline_id, 'pipe-1');
assert.equal(rec.decision_type, 'skip_step');
assert.equal(rec.target_operator, 'OpPreflight');
assert.equal(rec.risk_accepted, true);
assert.equal(rec.follow_up_required, false);
assert.equal(rec.physical_action.evidence_path, 'agents.output/planner/plan-004.md');
assert.deepEqual(validateDecision(rec), []);

const invalid = buildDecisionRecord({
  project: '/tmp/example-project',
  pipelineId: 'pipe 1',
  plan: '4',
  decision: 'skip_step',
  targetOperator: 'OpPreflight',
  reason: 'made-up-reason',
});
assert.ok(validateDecision(invalid).some((err) => err.includes('reason must be one of')));

const dry = recordDecision({
  project: '/tmp/example-project',
  pipelineId: 'pipe 2',
  plan: '5',
  decision: 'manual_evidence',
  targetOperator: 'OpQualityReview',
  reason: 'terminal-event-backfill',
  approvedBy: 'operator',
  riskAccepted: 'false',
  followUpRequired: 'true',
  dryRun: true,
});
assert.equal(dry.ok, true);
assert.equal(dry.path, null);
assert.equal(dry.record.plan_key, 'plan-005');
assert.equal(dry.record.follow_up_required, true);

const cp = spawnSync(process.execPath, [
  path.join(ROOT, 'scripts/quality/operator-decisions.mjs'),
  'record',
  '--project', '/tmp/example-project',
  '--pipeline-id', 'pipe 3',
  '--plan', '6',
  '--decision', 'expectation_correction',
  '--target-operator', 'OpQualityReview',
  '--reason', 'expectation-wrong',
  '--approved-by', 'operator',
  '--extra-json', '{"proposed_expectation":{"required_if":"auto_pdq_enabled"}}',
  '--dry-run',
], { cwd: ROOT, encoding: 'utf8' });
assert.equal(cp.status, 0, cp.stderr || cp.stdout);
const parsed = JSON.parse(cp.stdout);
assert.equal(parsed.ok, true);
assert.equal(parsed.record.operator_type, 'OpDecision');
assert.equal(parsed.record.plan_key, 'plan-006');
assert.deepEqual(parsed.record.proposed_expectation, { required_if: 'auto_pdq_enabled' });

const bad = spawnSync(process.execPath, [
  path.join(ROOT, 'scripts/quality/operator-decisions.mjs'),
  'record',
  '--project', '/tmp/example-project',
  '--pipeline-id', 'pipe 4',
  '--plan', '7',
  '--decision', 'skip_step',
  '--target-operator', 'OpPreflight',
  '--reason', 'made-up-reason',
  '--dry-run',
], { cwd: ROOT, encoding: 'utf8' });
assert.equal(bad.status, 2);
assert.match(bad.stderr, /Invalid operator decision/);

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-opdecision-'));
try {
  const generic = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/quality/orchestrator-events.mjs'),
    '--project', tmp,
    '--pipeline-id', 'pipe-5',
    '--plan', '8',
    '--operator-type', 'OpDecision',
    '--reason', 'already-covered',
    '--extra-json', '{"decision_type":"skip_step","target_operator":"OpReview","approved_by":"operator"}',
    '--dry-run',
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(generic.status, 0, generic.stderr || generic.stdout);
  const row = JSON.parse(generic.stdout);
  assert.equal(row.operator_type, 'OpDecision');
  assert.equal(row.decision_type, 'skip_step');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('quality operator-decisions.mjs tests passed');
