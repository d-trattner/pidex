#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts', 'quality', 'run-auto-pdq.mjs');
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-auto-pdq-project-'));
const pipelineId = `auto-pdq-test-${process.pid}-${Date.now()}`;
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readEventually(file, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try {
      return readFileSync(file, 'utf8');
    } catch (error) {
      lastError = error;
      sleep(25);
    }
  }
  if (process.platform === 'win32') {
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Content -LiteralPath $args[0] -Raw', file], { encoding: 'utf8' });
    if (ps.status === 0 && ps.stdout) return ps.stdout;
  }
  throw lastError;
}

const cleanup = [];
try {
  const cp = spawnSync(process.execPath, [script, '--project', project, '--plan', '7', '--pipeline-id', pipelineId, '--terminal-event', 'pipeline_completed'], { cwd: root, encoding: 'utf8' });
  assert.equal(cp.status, 0, cp.stderr || cp.stdout);
  const lines = cp.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length >= 1, cp.stdout);
  const opOut = JSON.parse(lines.at(-1));
  const reportOut = lines.length >= 2 ? JSON.parse(lines.slice(0, -1).join('\n')) : null;
  if (reportOut) assert.equal(reportOut.plans[0], 'plan-007');
  assert.ok(opOut.op_quality_review);
  const rows = readEventually(opOut.op_quality_review).trim().split(/\r?\n/).map((line) => JSON.parse(line));
  const row = rows.find((item) => item.operator_type === 'OpQualityReview' && item.pipeline_id === pipelineId);
  assert.ok(row, 'OpQualityReview row not found');
  assert.equal(row.plan_key, 'plan-007');
  assert.equal(row.source, 'auto-pdq');
  assert.equal(row.logical_decision.trigger, 'pipeline_completed');
  assert.deepEqual(row.plans_reviewed, ['plan-007']);
  if (reportOut) {
    assert.equal(row.physical_action.json_report, reportOut.json);
    assert.equal(row.physical_action.markdown_report, reportOut.markdown);
  } else {
    assert.equal(row.physical_action.json_report ?? null, null);
    assert.equal(row.physical_action.markdown_report ?? null, null);
  }
  cleanup.push(...[row.physical_action.json_report, row.physical_action.markdown_report, opOut.op_quality_review, path.dirname(opOut.op_quality_review)].filter(Boolean));
} finally {
  for (const target of cleanup) rmSync(target, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
console.log('run-auto-pdq.mjs tests passed');
