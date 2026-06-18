import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDockerExecArgs, extractRouting, runProjectPipelineAgent, validateRouting } from './run-agent.mjs';
import { createProjectRecord, loadProjectRecord, saveProjectRecord } from './registry.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-run-agent-')); }
function setup(root, id = 'pp-run-abc123') { const r = createProjectRecord({ project_id: id, name: 'demo' }); r.status = 'ready'; saveProjectRecord(root, r); return r; }

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
  assert.equal(result.archive_context_file.endsWith(path.join('state', 'project-archives', 'pp-run-abc123', 'agents.output', 'implementation', 'x.md')), true);
  const loaded = loadProjectRecord(root, 'pp-run-abc123');
  assert.equal(loaded.status, 'sync-pending');
  assert.equal(loaded.runs[0].project_run_id, 'pprun-fixed');
  assert.equal(loaded.runs[0].exit_code, 0);
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
