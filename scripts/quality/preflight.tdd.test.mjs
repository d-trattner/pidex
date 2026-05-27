#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build_expected_observed } from './report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts', 'quality', 'preflight.mjs');
const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-preflight-project-'));
const pipelineId = `preflight-test-${process.pid}-${Date.now()}`;
const cleanup = [];
try {
  const cp = spawnSync(process.execPath, [script, 'record', '--project', project, '--plan', '8', '--pipeline-id', pipelineId, '--task-class', 'feature', '--grill-skill', 'grill-with-docs', '--epic-ready', 'true', '--existing-project', 'true', '--context-read', 'pidex/context/CONTEXT.md,wiki/index.md', '--context-touched', 'pidex/context/CONTEXT.md', '--acceptance-count', '4', '--out-of-scope-count', '2'], { cwd: root, encoding: 'utf8' });
  assert.equal(cp.status, 0, cp.stderr || cp.stdout);
  const out = JSON.parse(cp.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.plan_key, 'plan-008');
  assert.equal(out.pipeline_id, pipelineId);
  assert.ok(existsSync(out.path));
  cleanup.push(out.path, path.dirname(out.path));
  const row = JSON.parse(readFileSync(out.path, 'utf8').trim());
  assert.equal(row.operator_type, 'OpPreflight');
  assert.equal(row.source, 'preflight-finalized');
  assert.equal(row.project_path, project);
  assert.equal(row.plan_key, 'plan-008');
  assert.equal(row.logical_decision.grill_skill_used, 'grill-with-docs');
  assert.equal(row.logical_decision.epic_statement_ready, true);
  assert.deepEqual(row.physical_action.context_paths_read, ['pidex/context/CONTEXT.md', 'wiki/index.md']);
  assert.equal(row.physical_action.acceptance_criteria_count, 4);

  const trace = build_expected_observed({
    metrics: [],
    pipeline_events: [{ plan: '8', event_type: 'pipeline_started', timestamp: '2026-05-21T00:00:00Z', _source_path: 'pipeline.jsonl' }],
    orchestrator_events: [row],
    rule_actions: []
  }, ['plan-008']);
  assert.equal(trace.expected_required, 1);
  assert.equal(trace.observed_required, 1);
  assert.equal(trace.findings.length, 0);
} finally {
  for (const target of cleanup) rmSync(target, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
console.log('preflight.mjs tests passed');
