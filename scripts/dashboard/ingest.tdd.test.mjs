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
  try { return Object.values(db.prepare(sql).get() || { value: null })[0]; }
  finally { db.close(); }
}
function all(dbPath, sql) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return db.prepare(sql).all(); }
  finally { db.close(); }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'pidex-ingest-mjs-'));
try {
  const state = path.join(tmp, 'state');
  const project = path.join(tmp, 'project');
  const dbPath = path.join(tmp, 'pidex.sqlite');
  const sandboxOnly = path.join(tmp, 'sandbox-only-host-project');
  const sandboxArchive = path.join(state, 'project-archives', 'pp-sandbox-only');
  mkdirSync(path.join(state, 'metrics', 'tmp-project'), { recursive: true });
  mkdirSync(path.join(state, 'pipeline-events', 'project'), { recursive: true });
  mkdirSync(path.join(state, 'sandbox-projects'), { recursive: true });
  mkdirSync(path.join(project, 'agents.output', 'parallel-agents'), { recursive: true });
  mkdirSync(path.join(sandboxArchive, 'agents.output', 'parallel-agents'), { recursive: true });

  writeFileSync(path.join(state, 'metrics', 'tmp-project', 'plan-001.jsonl'), `${JSON.stringify({
    timestamp: '2026-01-01T00:00:00Z', project, plan: '1', project_mode: 'project-pipeline', agent: 'pidex-planner', provider: 'codex', model: 'gpt-5.4-mini', input_tokens_estimate: 10, output_tokens_estimate: 20,
  })}\n`);
  writeFileSync(path.join(state, 'pipeline-events', 'project', 'pipe-1.jsonl'), `${JSON.stringify({
    timestamp: '2026-01-01T00:01:00Z', project_path: project, pipeline_id: 'pipe-1', plan_key: '1', event_type: 'pipeline_started', project_mode: 'project-pipeline', status: 'running', actor: 'orchestrator', metadata: { smoke: true }, source: 'test',
  })}\n`);
  writeFileSync(path.join(project, 'agents.output', 'parallel-agents', '001-merge.md'), `# Merge Summary\n\n| Source | Severity | Classification | Disposition | Summary |\n|---|---|---|---|---|\n| secondary | high | secondary-only | accepted | smoke finding |\n\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: user\n-->\n`);
  writeFileSync(path.join(state, 'sandbox-projects', 'pp-sandbox-only.json'), JSON.stringify({
    schema_version: 2,
    project_id: 'pp-sandbox-only',
    name: 'pp-sandbox-only',
    mode: 'project-pipeline',
    source: { kind: 'local', ref: sandboxOnly },
    archive: { path: sandboxArchive },
  }, null, 2));
  writeFileSync(path.join(sandboxArchive, 'agents.output', 'parallel-agents', '002-merge.md'), `# Sandbox Archive Merge Summary\n\n| Source | Severity | Classification | Disposition | Summary |\n|---|---|---|---|---|\n| archive-secondary | medium | secondary-only | accepted | archive finding |\n`);

  {
    const db = new DatabaseSync(dbPath);
    try {
      db.exec('CREATE TABLE projects (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL); CREATE TABLE artifacts (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, project_id INTEGER NOT NULL, plan_key TEXT, role TEXT, model_label TEXT, is_secondary INTEGER NOT NULL DEFAULT 0, has_routing INTEGER NOT NULL DEFAULT 0, verdict TEXT, route_to TEXT, gate TEXT, title TEXT, mtime TEXT, bytes INTEGER, content_hash TEXT); CREATE TABLE merge_findings (id INTEGER PRIMARY KEY, artifact_path TEXT NOT NULL, row_index INTEGER NOT NULL, project_id INTEGER NOT NULL, plan_key TEXT, source TEXT, severity TEXT, classification TEXT, disposition TEXT, summary TEXT);');
      db.prepare('INSERT INTO projects(path, name) VALUES (?, ?)').run(sandboxOnly, 'pp-sandbox-only');
      db.prepare('INSERT INTO projects(path, name) VALUES (?, ?)').run(sandboxArchive, 'Sandbox Only Project archive');
      const archivePid = db.prepare('SELECT id FROM projects WHERE path = ?').get(sandboxArchive).id;
      db.prepare('INSERT INTO artifacts(path, project_id, title) VALUES (?, ?, ?)').run(path.join(sandboxArchive, 'agents.output', 'old.md'), archivePid, 'old archive artifact');
      db.prepare('INSERT INTO merge_findings(artifact_path, row_index, project_id, summary) VALUES (?, ?, ?, ?)').run(path.join(sandboxArchive, 'agents.output', 'old.md'), 1, archivePid, 'old finding');
    } finally { db.close(); }
  }

  const report = runIngest(dbPath, project, { RUNNING_PI_STATE_DIR: state });
  assert.equal(report.project_pipeline_registry, 1);
  assert.equal(report.agent_runs, 1);
  assert.equal(report.pipeline_events, 1);
  assert.equal(report.artifacts, 2);
  assert.equal(report.merge_findings, 2);
  assert.equal(count(dbPath, 'agent_runs'), 1);
  assert.equal(count(dbPath, 'pipeline_events'), 1);
  assert.equal(value(dbPath, 'select project_mode from agent_runs'), 'project-pipeline');
  assert.equal(value(dbPath, 'select project_mode from pipeline_events'), 'project-pipeline');
  assert.equal(count(dbPath, 'artifacts'), 3);
  assert.equal(count(dbPath, 'merge_findings'), 3);
  assert.equal(value(dbPath, `select name from projects where path = '${sandboxOnly.replaceAll("'", "''")}'`), 'sandbox-only-host-project');
  assert.equal(value(dbPath, `select count(*) from projects where path = '${sandboxArchive.replaceAll("'", "''")}'`), 0);
  assert.deepEqual(all(dbPath, 'select name from projects order by name').map((row) => row.name), ['project', 'sandbox-only-host-project']);
  assert.equal(value(dbPath, `select count(*) from artifacts a join projects p on p.id = a.project_id where p.path = '${sandboxOnly.replaceAll("'", "''")}'`), 2);
  assert.equal(value(dbPath, `select count(*) from artifacts a join projects p on p.id = a.project_id where p.path = '${sandboxArchive.replaceAll("'", "''")}'`), 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log('ingest.mjs tests passed');
