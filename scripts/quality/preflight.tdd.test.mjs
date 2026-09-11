#!/usr/bin/env node
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  // Exercise real CLI writes without touching the checkout's default state store.
  const fixtureRoot = path.join(project, 'code');
  for (const relative of ['scripts/quality/preflight.mjs', 'modules/pidex/analysis-metrics-history/lib/state-root.mjs']) {
    const target = path.join(fixtureRoot, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, relative), target);
  }
  const cleanEnv = { ...process.env };
  delete cleanEnv.PIDEX_STATE_DIR;
  delete cleanEnv.RUNNING_PI_STATE_DIR;
  const canonical = path.join(project, 'canonical-state');
  const legacy = path.join(project, 'legacy-state');
  const cases = [
    { name: 'canonical-wins', env: { PIDEX_STATE_DIR: canonical, RUNNING_PI_STATE_DIR: legacy }, expected: canonical },
    { name: 'legacy', env: { RUNNING_PI_STATE_DIR: legacy }, expected: legacy },
    { name: 'empty-canonical', env: { PIDEX_STATE_DIR: '', RUNNING_PI_STATE_DIR: legacy }, expected: legacy },
    { name: 'default', env: {}, expected: path.join(fixtureRoot, 'state') },
    { name: 'relative', env: { PIDEX_STATE_DIR: 'relative-state' }, expected: path.join(project, 'relative-state') },
  ];
  for (const entry of cases) {
    const id = `${pipelineId}-${entry.name}`;
    const child = spawnSync(process.execPath, [path.join(fixtureRoot, 'scripts/quality/preflight.mjs'), 'record', '--project', project, '--plan', '8', '--pipeline-id', id], { cwd: project, env: { ...cleanEnv, ...entry.env }, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, child.stderr);
    const output = JSON.parse(child.stdout);
    assert.ok(output.path.startsWith(entry.expected + path.sep), `${entry.name}: unexpected state path ${output.path}`);
    const record = JSON.parse(readFileSync(output.path, 'utf8').trim());
    assert.equal(record.pipeline_id, id);
    assert.equal(record.project_path, project);
    assert.equal(record.plan_key, 'plan-008');
    rmSync(entry.expected, { recursive: true, force: true });
    assert.equal(existsSync(path.join(fixtureRoot, 'state')), false, 'override must not write a second store');
  }
  const missingState = path.join(project, 'missing-id-state');
  const missing = spawnSync(process.execPath, [path.join(fixtureRoot, 'scripts/quality/preflight.mjs'), 'record', '--project', project, '--plan', '8'], { env: { ...cleanEnv, PIDEX_STATE_DIR: missingState }, encoding: 'utf8', timeout: 10000 });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /PREFLIGHT_PIPELINE_ID_REQUIRED/);
  assert.equal(existsSync(missingState), false, 'no guessed run identity may be persisted');
  const dryState = path.join(project, 'dry-state');
  const dry = spawnSync(process.execPath, [path.join(fixtureRoot, 'scripts/quality/preflight.mjs'), 'record', '--project', project, '--dry-run'], { env: { ...cleanEnv, PIDEX_STATE_DIR: dryState }, encoding: 'utf8', timeout: 10000 });
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(JSON.parse(dry.stdout).path, null);
  assert.equal(existsSync(dryState), false);

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
