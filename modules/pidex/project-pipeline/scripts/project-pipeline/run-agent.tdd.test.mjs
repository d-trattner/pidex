import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDockerExecArgs, diffWorkspaceManifests, extractRouting, normalizeExpectedArtifactPath, parseArgs, runProjectPipelineAgent, validateRouting } from './run-agent.mjs';
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
  const finalRouting = extractRouting('<!-- ROUTING\nverdict: IN_PROGRESS\nroute_to: orchestrator\ncontext_file: agents.output/draft.md\n-->\ntext\n<!-- ROUTING\nverdict: REJECTED\nroute_to: pidex-planner\ncontext_file: agents.output/final.md\n-->');
  assert.equal(finalRouting.verdict, 'REJECTED');
  assert.equal(finalRouting.route_to, 'pidex-planner');
  assert.equal(finalRouting.context_file, 'agents.output/final.md');
});

test('expected artifact paths are normalized under agents.output only', () => {
  assert.equal(normalizeExpectedArtifactPath('agents.output/plans/034.md'), 'agents.output/plans/034.md');
  assert.throws(() => normalizeExpectedArtifactPath('/workspace/agents.output/plans/034.md'), /relative/);
  assert.throws(() => normalizeExpectedArtifactPath('agents.output/../README.md'), /normalized/);
  assert.throws(() => normalizeExpectedArtifactPath('wiki/034.md'), /agents.output/);
  assert.throws(() => normalizeExpectedArtifactPath('agents.output\\plans\\034.md'), /backslashes/);
});

test('run-agent CLI accepts provider and exact artifact overrides', () => {
  assert.deepEqual(parseArgs(['--pidex-root', '/tmp/pidex', '--project-id', 'pp-demo', '--agent', 'pidex-critic', '--task', 'review', '--provider', 'pi', '--model', 'deepseek/model', '--effort', 'medium', '--expected-input', 'agents.output/plans/034.md', '--expected-output', 'agents.output/parallel-agents/out.md', '--review-write-fence', '--json']), {
    json: true,
    pidexRoot: '/tmp/pidex', projectId: 'pp-demo', agent: 'pidex-critic', task: 'review', providerOverride: 'pi', modelOverride: 'deepseek/model', effortOverride: 'medium', expectedInputPath: 'agents.output/plans/034.md', expectedOutputPath: 'agents.output/parallel-agents/out.md', reviewWriteFence: true,
  });
  assert.throws(() => parseArgs(['--agent', 'pidex-critic', '--task', 'review']), /--project-id is required/);
  assert.throws(() => parseArgs(['--project-id', 'pp-demo', '--task', 'review']), /--agent is required/);
  assert.throws(() => parseArgs(['--project-id', 'pp-demo', '--agent', 'pidex-critic']), /--task is required/);
});

test('workspace manifest diff permits only the assigned artifact', () => {
  const before = { 'src/a.js': 'file:1', 'agents.output/parallel-agents/existing.md': 'file:2' };
  const after = { ...before, 'agents.output/parallel-agents/assigned.md': 'file:3' };
  assert.deepEqual(diffWorkspaceManifests(before, after, 'agents.output/parallel-agents/assigned.md').unauthorized_paths, []);
  const changed = { ...after, 'src/a.js': 'file:changed', 'agents.output/parallel-agents/extra.md': 'file:4' };
  assert.deepEqual(diffWorkspaceManifests(before, changed, 'agents.output/parallel-agents/assigned.md').unauthorized_paths, ['agents.output/parallel-agents/extra.md', 'src/a.js']);
});

test('buildDockerExecArgs sets recursion guard env and workspace', () => {
  const record = createProjectRecord({ project_id: 'pp-run-def456', name: 'demo' });
  const built = buildDockerExecArgs(record, { project_run_id: 'pprun-test', agent: 'pidex-implementer', task: 'do it' });
  assert.equal(built.project_run_id, 'pprun-test');
  assert.equal(built.args.includes('--user'), true);
  assert.equal(built.args.includes('node'), true);
  assert.equal(built.args.includes('--workdir'), true);
  assert.equal(built.args.includes('/workspace'), true);
  assert.equal(built.args.includes('PIDEX_PROJECT_PIPELINE_CHILD=1'), true);
  assert.equal(built.args.includes('PIDEX_PROJECT_ID=pp-run-def456'), true);
  assert.equal(built.args.includes('pidex-project-pp-run-def456'), true);
  assert.match(built.args.at(-1), /Task:\ndo it/);
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
    archiveFromContainer: false,
    runner: () => ({ status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\ncontext_file: agents.output/implementation/x.md\n-->', stderr: '' })
  });
  assert.equal(result.ok, true);
  assert.equal(result.context_file, 'agents.output/implementation/x.md');
  assert.equal(result.archive_context_file, undefined);
  assert.equal(result.archive_sync_status, 'pending');
  const loaded = loadProjectRecord(root, 'pp-run-abc123');
  assert.equal(loaded.status, 'sync-pending');
  assert.equal(loaded.runs[0].project_run_id, 'pprun-fixed');
  assert.equal(loaded.runs[0].agent, 'pidex-implementer');
  assert.equal(loaded.runs[0].context_file, 'agents.output/implementation/x.md');
  assert.equal(loaded.runs[0].exit_code, 0);
});

test('runProjectPipelineAgent validates exact input/output and recovers missing final routing without retry', () => {
  const root = tmp();
  const workspace = tmp();
  setup(root, 'pp-run-exact1');
  write(path.join(workspace, 'agents.output/plans/034-current.md'), '# Current plan\n');
  let childRuns = 0;
  const result = runProjectPipelineAgent({
    pidexRoot: root,
    projectId: 'pp-run-exact1',
    project_run_id: 'pprun-exact',
    agent: 'pidex-critic',
    task: 'review exact plan',
    expectedInputPath: 'agents.output/plans/034-current.md',
    expectedOutputPath: 'agents.output/parallel-agents/exact-review.md',
    reviewWriteFence: true,
    archiveWorkspace: workspace,
    runner: () => {
      childRuns += 1;
      write(path.join(workspace, 'agents.output/parallel-agents/exact-review.md'), '# Review\nNo blockers.\n');
      return { status: 0, stdout: 'Done', stderr: '' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.context_file, 'agents.output/parallel-agents/exact-review.md');
  assert.equal(result.routing_recovered, true);
  assert.equal(result.routing.route_to, 'orchestrator');
  assert.equal(childRuns, 1);
});

test('runProjectPipelineAgent rejects artifact ROUTING to a different path instead of synthesizing success', () => {
  const root = tmp();
  const workspace = tmp();
  setup(root, 'pp-run-wrong-route');
  write(path.join(workspace, 'agents.output/plans/034.md'), '# Canonical container plan\n');
  const result = runProjectPipelineAgent({
    pidexRoot: root, projectId: 'pp-run-wrong-route', agent: 'pidex-critic', task: 'review',
    expectedInputPath: 'agents.output/plans/034.md', expectedOutputPath: 'agents.output/parallel-agents/review.md', archiveWorkspace: workspace,
    runner: () => {
      write(path.join(workspace, 'agents.output/parallel-agents/review.md'), '# Review\n<!-- ROUTING\nroute_to: orchestrator\ncontext_file: agents.output/parallel-agents/wrong.md\n-->\n');
      return { status: 0, stdout: 'Done', stderr: '' };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'routing-invalid');
  assert.match(result.reason, /mismatch/);
});

test('explicit adjudication routing can be recovered from the exact assigned artifact', () => {
  const root = tmp();
  const workspace = tmp();
  setup(root, 'pp-run-explicit-artifact');
  write(path.join(workspace, 'agents.output/critiques/primary.md'), '# Primary\n');
  const result = runProjectPipelineAgent({
    pidexRoot: root, projectId: 'pp-run-explicit-artifact', agent: 'pidex-critic', task: 'adjudicate', requireExplicitRouting: true,
    expectedInputPath: 'agents.output/critiques/primary.md', expectedOutputPath: 'agents.output/parallel-agents/merge.md', archiveWorkspace: workspace,
    runner: () => { write(path.join(workspace, 'agents.output/parallel-agents/merge.md'), '# Merge\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: orchestrator\nreason: adjudicated\ncontext_file: agents.output/parallel-agents/merge.md\n-->\n'); return { status: 0, stdout: 'Done', stderr: '' }; },
  });
  assert.equal(result.ok, true);
  assert.equal(result.routing_recovered, true);
  assert.equal(result.routing.context_file, 'agents.output/parallel-agents/merge.md');
});

test('runProjectPipelineAgent can require explicit routing for adjudication', () => {
  const root = tmp();
  const workspace = tmp();
  setup(root, 'pp-run-explicit-route');
  write(path.join(workspace, 'agents.output/critiques/primary.md'), '# Primary\n');
  const result = runProjectPipelineAgent({
    pidexRoot: root, projectId: 'pp-run-explicit-route', agent: 'pidex-critic', task: 'adjudicate', requireExplicitRouting: true,
    expectedInputPath: 'agents.output/critiques/primary.md', expectedOutputPath: 'agents.output/parallel-agents/merge.md', archiveWorkspace: workspace,
    runner: () => { write(path.join(workspace, 'agents.output/parallel-agents/merge.md'), '# Merge without routing\n'); return { status: 0, stdout: 'Done', stderr: '' }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'routing-invalid');
  assert.equal(result.reason, 'routing-missing');
});

test('exact container artifact identity ignores stale same-number host plan', () => {
  const root = tmp();
  const host = tmp();
  setup(root, 'pp-run-stale-host');
  write(path.join(host, 'agents.output/plans/034.md'), '# STALE HOST PLAN\n');
  let childPrompt = '';
  let outputWritten = false;
  const result = runProjectPipelineAgent({
    pidexRoot: root, projectId: 'pp-run-stale-host', agent: 'pidex-critic', task: `Review exact input; host path is untrusted: ${host}`,
    expectedInputPath: 'agents.output/plans/034-current.md', expectedOutputPath: 'agents.output/parallel-agents/review.md', archiveFromContainer: false,
    runner: (args) => {
      if (args.includes('pi')) { childPrompt = String(args.at(-1)); outputWritten = true; return { status: 0, stdout: 'Done', stderr: '' }; }
      const requested = String(args.at(-1));
      if (requested === 'agents.output/plans/034-current.md') return { status: 0, stdout: JSON.stringify({ exists: true, nonempty: true, text: '# CANONICAL CONTAINER PLAN\n' }), stderr: '' };
      if (requested === 'agents.output/parallel-agents/review.md') return { status: 0, stdout: JSON.stringify({ exists: outputWritten, nonempty: outputWritten, text: outputWritten ? '# Review\n' : '' }), stderr: '' };
      return { status: 1, stdout: '', stderr: 'unexpected docker operation' };
    },
  });
  assert.equal(result.ok, true);
  assert.match(childPrompt, /Exact input artifact\(s\): agents\.output\/plans\/034-current\.md/);
  assert.doesNotMatch(childPrompt, /agents\.output\/plans\/034\.md/);
  assert.equal(readFileSync(path.join(host, 'agents.output/plans/034.md'), 'utf8'), '# STALE HOST PLAN\n');
});

test('runProjectPipelineAgent fails review write fence on an extra artifact', () => {
  const root = tmp();
  const workspace = tmp();
  setup(root, 'pp-run-fence1');
  write(path.join(workspace, 'agents.output/plans/034.md'), '# Plan\n');
  const result = runProjectPipelineAgent({
    pidexRoot: root,
    projectId: 'pp-run-fence1',
    agent: 'pidex-critic',
    task: 'review',
    expectedInputPath: 'agents.output/plans/034.md',
    expectedOutputPath: 'agents.output/parallel-agents/review.md',
    reviewWriteFence: true,
    archiveWorkspace: workspace,
    runner: () => {
      write(path.join(workspace, 'agents.output/parallel-agents/review.md'), '# Review\n');
      write(path.join(workspace, 'agents.output/parallel-agents/extra.md'), '# Extra\n');
      return { status: 0, stdout: '<!-- ROUTING\nroute_to: orchestrator\ncontext_file: agents.output/parallel-agents/review.md\n-->', stderr: '' };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'write-fence-violation');
  assert.deepEqual(result.write_fence.unauthorized_paths, ['agents.output/parallel-agents/extra.md']);
  const loaded = loadProjectRecord(root, 'pp-run-fence1');
  assert.equal(loaded.status, 'ready');
  assert.equal(loaded.runs.at(-1).archive_sync_status, 'failed');
  assert.equal(loaded.runs.at(-1).error, 'write-fence-violation');
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
  assert.equal(loaded.runs[0].archive_context_file, result.archive_context_file);
});

test('runProjectPipelineAgent mirrors archived artifacts into required host project', () => {
  const root = tmp();
  const workspace = tmp();
  const host = tmp();
  const record = setup(root, 'pp-run-host-mirror');
  record.control_project_path = host;
  record.source = { kind: 'host-path', ref: host };
  saveProjectRecord(root, record);
  const result = runProjectPipelineAgent({
    pidexRoot: root, projectId: 'pp-run-host-mirror', agent: 'pidex-qa', task: 'write report',
    expectedOutputPath: 'agents.output/qa/report.md', archiveWorkspace: workspace,
    runner: () => {
      write(path.join(workspace, 'agents.output/qa/report.md'), '# QA\n<!-- ROUTING\nverdict: COMPLETE\nroute_to: orchestrator\ncontext_file: agents.output/qa/report.md\n-->\n');
      return { status: 0, stdout: 'Done', stderr: '' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.project_mirror.status, 'complete');
  assert.equal(result.project_mirror.degraded, false);
  assert.equal(existsSync(path.join(host, 'agents.output/qa/report.md')), true);
  const saved = loadProjectRecord(root, 'pp-run-host-mirror');
  assert.equal(saved.runs.at(-1).project_mirror_status, 'complete');
});

test('runProjectPipelineAgent syncs artifacts copied from container by default', () => {
  const root = tmp();
  setup(root, 'pp-run-container1');
  const result = runProjectPipelineAgent({
    pidexRoot: root,
    projectId: 'pp-run-container1',
    project_run_id: 'pprun-container',
    agent: 'pidex-implementer',
    task: 'test',
    runner: (args) => {
      if (args[0] === 'exec') return { status: 0, stdout: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-qa\ncontext_file: agents.output/implementation/x.md\n-->', stderr: '' };
      if (args[0] === 'cp' && String(args[1]).endsWith('/agents.output')) {
        write(path.join(args[2], 'implementation/x.md'), '# impl\n');
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 1, stdout: '', stderr: 'missing' };
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.archive_sync_status, 'complete');
  assert.equal(existsSync(result.archive_context_file), true);
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
