import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDockerExecArgs, extractRouting, runProjectPipelineAgent, validateRouting } from './run-agent.mjs';
import { createProjectRecord, loadProjectRecord, saveProjectRecord } from './registry.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-run-agent-')); }
function setup(root, id = 'pp-run-abc123') { const r = createProjectRecord({ project_id: id, name: 'demo' }); r.status = 'ready'; saveProjectRecord(root, r); return r; }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }

test('extractRouting and validateRouting accept agents.output context only', () => {
  const routing = extractRouting('done\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\ncontext_file: agents.output/implementation/x.md\n-->');
  assert.equal(routing.verdict, 'COMPLETE');
  assert.equal(validateRouting(routing).ok, true);
  assert.equal(validateRouting({ context_file: 'README.md' }).ok, false);
  assert.equal(validateRouting({ context_file: 'agents.output/../x.md' }).ok, false);
});

test('buildDockerExecArgs sets recursion guard env and workspace', () => {
  const record = createProjectRecord({ project_id: 'pp-run-def456', name: 'demo' });
  const built = buildDockerExecArgs(record, { project_run_id: 'pprun-test', agent: 'pidex-implementer', task: 'do it' });
  assert.equal(built.project_run_id, 'pprun-test');
  assert.equal(built.args.includes('--workdir'), true);
  assert.equal(built.args.includes('/workspace'), true);
  assert.equal(built.args.includes('PIDEX_PROJECT_PIPELINE_CHILD=1'), true);
  assert.equal(built.args.includes('PIDEX_PROJECT_ID=pp-run-def456'), true);
  assert.equal(built.args.includes('pidex-project-pp-run-def456'), true);
});

test('runProjectPipelineAgent returns typed output and records run metadata', () => {
  const root = tmp();
  setup(root);
  const result = runProjectPipelineAgent({
    pidexRoot: root,
    projectId: 'pp-run-abc123',
    project_run_id: 'pprun-fixed',
    agent: 'pidex-implementer',
    task: 'test',
    runner: () => ({ status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\ncontext_file: agents.output/implementation/x.md\n-->', stderr: '' })
  });
  assert.equal(result.ok, true);
  assert.equal(result.context_file, 'agents.output/implementation/x.md');
  assert.equal(result.archive_context_file, undefined);
  assert.equal(result.archive_sync_status, 'pending');
  const loaded = loadProjectRecord(root, 'pp-run-abc123');
  assert.equal(loaded.status, 'sync-pending');
  assert.equal(loaded.runs[0].project_run_id, 'pprun-fixed');
  assert.equal(loaded.runs[0].exit_code, 0);
});

test('runProjectPipelineAgent can sync archive and then expose archive_context_file', () => {
  const root = tmp();
  const workspace = tmp();
  setup(root, 'pp-run-sync1');
  write(path.join(workspace, 'agents.output/implementation/x.md'), '# impl\n');
  const result = runProjectPipelineAgent({
    pidexRoot: root,
    projectId: 'pp-run-sync1',
    project_run_id: 'pprun-sync',
    agent: 'pidex-implementer',
    task: 'test',
    archiveWorkspace: workspace,
    runner: () => ({ status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\ncontext_file: agents.output/implementation/x.md\n-->', stderr: '' })
  });
  assert.equal(result.ok, true);
  assert.equal(result.archive_sync_status, 'complete');
  assert.equal(existsSync(result.archive_context_file), true);
  const loaded = loadProjectRecord(root, 'pp-run-sync1');
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.runs[0].archive_sync_status, 'complete');
});

test('runProjectPipelineAgent fails closed when routed artifact is missing after archive sync', () => {
  const root = tmp();
  const workspace = tmp();
  setup(root, 'pp-run-missing1');
  const result = runProjectPipelineAgent({
    pidexRoot: root,
    projectId: 'pp-run-missing1',
    project_run_id: 'pprun-missing',
    agent: 'pidex-implementer',
    task: 'test',
    archiveWorkspace: workspace,
    runner: () => ({ status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\ncontext_file: agents.output/implementation/missing.md\n-->', stderr: '' })
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'archive-context-missing');
  const loaded = loadProjectRecord(root, 'pp-run-missing1');
  assert.equal(loaded.status, 'sync-failed');
  assert.equal(loaded.runs[0].archive_sync_status, 'failed');
});

test('runProjectPipelineAgent fails closed on child failure or invalid routing without fallback', () => {
  const root = tmp();
  setup(root, 'pp-run-fail1');
  const failed = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-fail1', agent: 'pidex-qa', task: 'test', runner: () => ({ status: 1, stdout: 'nope', stderr: 'bad' }) });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'child-pi-failed');
  setup(root, 'pp-run-fail2');
  const invalid = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-fail2', agent: 'pidex-qa', task: 'test', runner: () => ({ status: 0, stdout: 'no routing', stderr: '' }) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, 'routing-invalid');
});

test('runProjectPipelineAgent recursion guard blocks nested project-pipeline execution', () => {
  const root = tmp();
  setup(root, 'pp-run-guard1');
  const old = process.env.PIDEX_PROJECT_PIPELINE_CHILD;
  process.env.PIDEX_PROJECT_PIPELINE_CHILD = '1';
  try {
    const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-guard1', agent: 'pidex-qa', task: 'test', runner: () => { throw new Error('must not run'); } });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'project-pipeline-recursion-guard');
  } finally {
    if (old === undefined) delete process.env.PIDEX_PROJECT_PIPELINE_CHILD;
    else process.env.PIDEX_PROJECT_PIPELINE_CHILD = old;
  }
});
