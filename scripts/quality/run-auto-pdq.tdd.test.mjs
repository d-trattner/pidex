#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts', 'quality', 'run-auto-pdq.mjs');
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-auto-pdq-project-'));
const pipelineId = `auto-pdq-test-${process.pid}-${Date.now()}`;
function eventuallyExists(file, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (existsSync(file)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  return existsSync(file);
}

const cleanup = [];
try {
  const cp = spawnSync(process.execPath, [script, '--project', project, '--plan', '7', '--pipeline-id', pipelineId, '--terminal-event', 'pipeline_completed'], { cwd: root, encoding: 'utf8' });
  assert.equal(cp.status, 0, cp.stderr || cp.stdout);
  const lines = cp.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length >= 2, cp.stdout);
  const opOut = JSON.parse(lines.at(-1));
  const reportOut = JSON.parse(lines.slice(0, -1).join('\n'));
  assert.equal(reportOut.plans[0], 'plan-007');
  assert.ok(opOut.op_quality_review);
  assert.ok(eventuallyExists(opOut.op_quality_review), JSON.stringify(opOut));
  const rows = readFileSync(opOut.op_quality_review, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const row = rows.find((item) => item.operator_type === 'OpQualityReview' && item.pipeline_id === pipelineId);
  assert.ok(row, 'OpQualityReview row not found');
  assert.equal(row.plan_key, 'plan-007');
  assert.equal(row.source, 'auto-pdq');
  assert.equal(row.logical_decision.trigger, 'pipeline_completed');
  assert.deepEqual(row.plans_reviewed, ['plan-007']);
  assert.equal(row.physical_action.json_report, reportOut.json);
  assert.equal(row.physical_action.markdown_report, reportOut.markdown);
  cleanup.push(reportOut.json, reportOut.markdown, opOut.op_quality_review, path.dirname(opOut.op_quality_review));
} finally {
  for (const target of cleanup) rmSync(target, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
console.log('run-auto-pdq.mjs tests passed');
