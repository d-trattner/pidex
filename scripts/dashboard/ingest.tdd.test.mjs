#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(root, 'scripts/dashboard/ingest.mjs');

function runIngest(dbPath, projectPath, env = {}) {
  const result = spawnSync(process.execPath, ['--no-warnings', script, '--db', dbPath, '--project', projectPath], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function count(dbPath, table) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return db.prepare(`select count(*) as n from ${table}`).get().n; }
  finally { db.close(); }
}
function value(dbPath, sql) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return Object.values(db.prepare(sql).get())[0]; }
  finally { db.close(); }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-ingest-mjs-'));
try {
  const state = path.join(tmp, 'state');
  const project = path.join(tmp, 'project');
  const dbPath = path.join(tmp, 'pidex.sqlite');
  mkdirSync(path.join(state, 'metrics', 'tmp-project'), { recursive: true });
  mkdirSync(path.join(state, 'pipeline-events', 'project'), { recursive: true });
  mkdirSync(path.join(project, 'agents.output', 'parallel-agents'), { recursive: true });

  writeFileSync(path.join(state, 'metrics', 'tmp-project', 'plan-001.jsonl'), `${JSON.stringify({
    timestamp: '2026-01-01T00:00:00Z', project, plan: '1', project_mode: 'project-pipeline', agent: 'pidex-planner', provider: 'codex', model: 'gpt-5.4-mini', input_tokens_estimate: 10, output_tokens_estimate: 20,
  })}\n`);
  writeFileSync(path.join(state, 'pipeline-events', 'project', 'pipe-1.jsonl'), `${JSON.stringify({
    timestamp: '2026-01-01T00:01:00Z', project_path: project, pipeline_id: 'pipe-1', plan_key: '1', event_type: 'pipeline_started', project_mode: 'project-pipeline', status: 'running', actor: 'orchestrator', metadata: { smoke: true }, source: 'test',
  })}\n`);
  writeFileSync(path.join(project, 'agents.output', 'parallel-agents', '001-merge.md'), `# Merge Summary\n\n| Source | Severity | Classification | Disposition | Summary |\n|---|---|---|---|---|\n| secondary | high | secondary-only | accepted | smoke finding |\n\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: user\n-->\n`);

  const report = runIngest(dbPath, project, { RUNNING_PI_STATE_DIR: state });
  assert.equal(report.agent_runs, 1);
  assert.equal(report.pipeline_events, 1);
  assert.equal(report.artifacts, 1);
  assert.equal(report.merge_findings, 1);
  assert.equal(count(dbPath, 'agent_runs'), 1);
  assert.equal(count(dbPath, 'pipeline_events'), 1);
  assert.equal(value(dbPath, 'select project_mode from agent_runs'), 'project-pipeline');
  assert.equal(value(dbPath, 'select project_mode from pipeline_events'), 'project-pipeline');
  assert.equal(count(dbPath, 'artifacts'), 1);
  assert.equal(count(dbPath, 'merge_findings'), 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('ingest.mjs tests passed');
