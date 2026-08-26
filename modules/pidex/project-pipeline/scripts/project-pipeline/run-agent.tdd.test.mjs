import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { buildDockerExecArgs, diffWorkspaceManifests, extractRouting, normalizeExpectedArtifactPath, parseArgs, prepareProjectPipelineAgentTask, runProjectPipelineAgent, validateRouting } from './run-agent.mjs';
import { createProjectRecord, loadProjectRecord, saveProjectRecord } from './registry.mjs';
import { loadModuleSystem } from '../../../../../scripts/modules/lib.mjs';
import { materializeVerifiedMirror } from '../../../../../scripts/quality/rule-mirror-sync.mjs';

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

test('correction child prompt routes COMPLETE back to the canonical reviewer', () => {
  const record = createProjectRecord({ project_id: 'pp-correction-route', name: 'demo' });
  const built = buildDockerExecArgs(record, { agent: 'pidex-implementer', task: 'fix D1', reviewGate: 'code-review', reviewMode: 'correction1', expectedOutputPath: 'agents.output/implementation/c1.md' });
  assert.match(String(built.args.at(-1)), /verdict: COMPLETE[\s\S]*route_to: pidex-code-reviewer/);
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
    moduleRules: false,
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
    moduleRules: false,
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
    pidexRoot: root, projectId: 'pp-run-wrong-route', agent: 'pidex-critic', task: 'review', moduleRules: false,
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
    pidexRoot: root, projectId: 'pp-run-explicit-artifact', agent: 'pidex-critic', task: 'adjudicate', moduleRules: false, requireExplicitRouting: true,
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
    pidexRoot: root, projectId: 'pp-run-explicit-route', agent: 'pidex-critic', task: 'adjudicate', moduleRules: false, requireExplicitRouting: true,
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
    pidexRoot: root, projectId: 'pp-run-stale-host', agent: 'pidex-critic', task: `Review exact input; host path is untrusted: ${host}`, moduleRules: false,
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
    moduleRules: false,
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
    moduleRules: false,
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
    pidexRoot: root, projectId: 'pp-run-host-mirror', agent: 'pidex-qa', task: 'write report', moduleRules: false,
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
    moduleRules: false,
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
    moduleRules: false,
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
  const failed = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-fail1', agent: 'pidex-qa', task: 'test', moduleRules: false, runner: () => ({ status: 1, stdout: 'nope', stderr: 'bad' }) });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'child-pi-failed');
  setup(root, 'pp-run-fail2');
  const invalid = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-fail2', agent: 'pidex-qa', task: 'test', moduleRules: false, runner: () => ({ status: 0, stdout: 'no routing', stderr: '' }) });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error, 'routing-invalid');
});

test('runProjectPipelineAgent classifies docker daemon denial as sandbox-unavailable, never child-pi-failed', () => {
  const root = tmp();
  setup(root, 'pp-run-sandbox-daemon');
  const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-sandbox-daemon', agent: 'pidex-qa', task: 'test', moduleRules: false, runner: () => ({ status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?' }) });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'sandbox-unavailable');
  const record = loadProjectRecord(root, 'pp-run-sandbox-daemon');
  assert.equal(record.runs.at(-1).error, 'sandbox-unavailable');
  assert.equal(record.runs.at(-1).archive_sync_status, 'failed');
  rmSync(root, { recursive: true, force: true });
});

test('runProjectPipelineAgent classifies docker binary spawn failure as sandbox-unavailable', () => {
  const root = tmp();
  setup(root, 'pp-run-sandbox-spawn');
  const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-sandbox-spawn', agent: 'pidex-qa', task: 'test', moduleRules: false, runner: () => ({ status: 1, stdout: '', stderr: '', spawnError: 'spawn docker ENOENT' }) });
  assert.equal(result.error, 'sandbox-unavailable');
  rmSync(root, { recursive: true, force: true });
});

test('runProjectPipelineAgent sanitizes and bounds child-controlled reason strings (SEC-3)', () => {
  const root = tmp();
  setup(root, 'pp-run-reason-sanitize');
  const probeValue = 'SECRET_TOKEN_abcdef1234567890';
  // Controls + ANSI must be stripped; the embedded secret sits beyond the 200-char
  // cap so truncation removes it; the stable typed code must be preserved.
  const evil = `agents.output/../x.md\u0000\b\u001b[31m${'z'.repeat(220)}${probeValue}`;
  const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-reason-sanitize', agent: 'pidex-qa', task: 'test', moduleRules: false, runner: () => ({ status: 0, stdout: `<!-- ROUTING\ncontext_file: ${evil}\n-->`, stderr: '' }) });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'routing-invalid', 'stable safe typed error code preserved');
  const record = loadProjectRecord(root, 'pp-run-reason-sanitize');
  const persisted = record.runs.at(-1).reason;
  assert.match(persisted, /context-file-invalid:/, 'typed prefix retained');
  assert.equal(persisted.includes(probeValue), false, 'raw child-controlled secret not persisted in reason');
  assert.equal(/[\u0000-\u001F\u007F]/.test(persisted), false, 'control characters stripped');
  assert.equal(persisted.includes('\u001b'), false, 'ANSI escape sequences stripped');
  assert.equal(persisted.length <= 200, true, 'reason capped at 200 chars');
  setup(root, 'pp-run-reason-cap');
  const longInvalid = `agents.output\\${'a'.repeat(300)}.md`;
  const capped = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-reason-cap', agent: 'pidex-qa', task: 'test', moduleRules: false, runner: () => ({ status: 0, stdout: `<!-- ROUTING\ncontext_file: ${longInvalid}\n-->`, stderr: '' }) });
  assert.equal(capped.error, 'routing-invalid');
  const capRecord = loadProjectRecord(root, 'pp-run-reason-cap');
  assert.equal(capRecord.runs.at(-1).reason.length <= 200, true, 'oversized reason truncated');
  rmSync(root, { recursive: true, force: true });
});

test('same-slot failed skeleton replaces only with matching recorded provenance and never recovers incomplete streamed JSON', () => {
  const root = tmp(); const workspace = tmp(); setup(root, 'pp-run-retry-provenance');
  const output = 'agents.output/parallel-agents/review.md'; let calls = 0;
  const first = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-retry-provenance', project_run_id: 'pprun-first', agent: 'pidex-critic', task: 'review', moduleRules: false, expectedOutputPath: output, reviewWriteFence: true, archiveWorkspace: workspace, runner: () => { calls += 1; write(path.join(workspace, output), '# IN_PROGRESS\n'); return { status: 1, stdout: 'stream ends mid-tool JSON: {"write":', stderr: '' }; } });
  assert.equal(first.error, 'child-pi-failed');
  const retry = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-retry-provenance', project_run_id: 'pprun-retry', retryOfProjectRunId: 'pprun-first', agent: 'pidex-critic', task: 'review retry', moduleRules: false, expectedOutputPath: output, reviewWriteFence: true, archiveWorkspace: workspace, runner: () => { calls += 1; write(path.join(workspace, output), '# Complete\n<!-- ROUTING\nroute_to: orchestrator\ncontext_file: agents.output/parallel-agents/review.md\n-->'); return { status: 0, stdout: 'done', stderr: '' }; } });
  assert.equal(retry.ok, true); assert.equal(calls, 2);
  write(path.join(workspace, output), '# CHANGED AFTER FAILED ATTEMPT\n');
  const changed = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-retry-provenance', project_run_id: 'pprun-changed', retryOfProjectRunId: 'pprun-first', agent: 'pidex-critic', task: 'must not start', moduleRules: false, expectedOutputPath: output, archiveWorkspace: workspace, runner: () => { throw new Error('changed artifact must not launch'); } });
  assert.equal(changed.error, 'retry-artifact-provenance-invalid');
});

test('runProjectPipelineAgent denies symlink at assigned output before launch on first attempt', () => {
  // QA-FIND-1 / BD-62-12 / AC-62-13: a linked path at the assigned output must
  // deny before child launch, never be treated as absent (lstat must not follow).
  const root = tmp(); const workspace = tmp(); setup(root, 'pp-run-symlink-first');
  const output = 'agents.output/parallel-agents/review.md';
  write(path.join(workspace, 'outside.md'), '# target\n');
  mkdirSync(path.join(workspace, 'agents.output/parallel-agents'), { recursive: true });
  symlinkSync(path.join(workspace, 'outside.md'), path.join(workspace, output));
  let childCalls = 0;
  const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-symlink-first', project_run_id: 'pprun-sym-first', agent: 'pidex-critic', task: 'must not launch', moduleRules: false, expectedOutputPath: output, reviewWriteFence: true, archiveWorkspace: workspace, runner: () => { childCalls += 1; throw new Error('symlink at assigned output must never launch'); } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'expected-output-non-regular');
  assert.equal(childCalls, 0, 'zero children launched against a symlinked assigned output');
});

test('runProjectPipelineAgent denies symlink at assigned output on retry with provenance denial and zero new launches', () => {
  // QA repro shape: first attempt fails leaving skeleton, attacker swaps the slot
  // to a symlink, retry must return the typed provenance denial and launch nothing.
  const root = tmp(); const workspace = tmp(); setup(root, 'pp-run-symlink-retry');
  const output = 'agents.output/parallel-agents/review.md'; let childCalls = 0;
  const mkRunner = (fn) => () => { childCalls += 1; return fn(); };
  const first = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-symlink-retry', project_run_id: 'pprun-first', agent: 'pidex-critic', task: 't', moduleRules: false, expectedOutputPath: output, reviewWriteFence: true, archiveWorkspace: workspace, runner: mkRunner(() => { write(path.join(workspace, output), '# IN_PROGRESS\n'); return { status: 1, stdout: 'died mid-stream', stderr: '' }; }) });
  assert.equal(first.error, 'child-pi-failed');
  assert.equal(childCalls, 1);
  rmSync(path.join(workspace, output));
  write(path.join(workspace, 'outside.md'), '# target\n');
  symlinkSync(path.join(workspace, 'outside.md'), path.join(workspace, output));
  const retry = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-symlink-retry', project_run_id: 'pprun-retry', retryOfProjectRunId: 'pprun-first', agent: 'pidex-critic', task: 'must not launch', moduleRules: false, expectedOutputPath: output, reviewWriteFence: true, archiveWorkspace: workspace, runner: mkRunner(() => { throw new Error('retry symlink must never launch'); }) });
  assert.equal(retry.error, 'retry-artifact-provenance-invalid');
  assert.equal(childCalls, 1, 'retry attempt launches zero children');
});

test('runProjectPipelineAgent denies directory at assigned output before launch', () => {
  const root = tmp(); const workspace = tmp(); setup(root, 'pp-run-dir-denial');
  const output = 'agents.output/parallel-agents/review.md';
  mkdirSync(path.join(workspace, output), { recursive: true });
  let childCalls = 0;
  const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-dir-denial', agent: 'pidex-critic', task: 'must not launch', moduleRules: false, expectedOutputPath: output, archiveWorkspace: workspace, runner: () => { childCalls += 1; throw new Error('directory at assigned output must never launch'); } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'expected-output-non-regular');
  assert.equal(childCalls, 0, 'zero children launched against a directory at the assigned output');
});

test('runProjectPipelineAgent denies container symlink at assigned output before launch (docker seam)', () => {
  // Container seam: the path-kind probe must classify the symlink via lstat inside
  // the sandbox and deny before the child exec; the mocked runner must never see 'pi'.
  const root = tmp(); setup(root, 'pp-run-symlink-docker');
  const output = 'agents.output/parallel-agents/review.md'; let childCalls = 0;
  const result = runProjectPipelineAgent({
    pidexRoot: root, projectId: 'pp-run-symlink-docker', project_run_id: 'pprun-sym-docker', agent: 'pidex-critic', task: 'must not launch', moduleRules: false, expectedOutputPath: output, archiveFromContainer: false,
    runner: (args) => {
      if (args.includes('pi')) { childCalls += 1; return { status: 0, stdout: 'launched!', stderr: '' }; }
      if (String(args.at(-1)) === output) return { status: 0, stdout: JSON.stringify({ exists: false, nonempty: false, text: '', kind: 'symlink' }), stderr: '' };
      return { status: 1, stdout: '', stderr: 'unexpected docker operation' };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'expected-output-non-regular');
  assert.equal(childCalls, 0, 'container child never launched against a symlinked assigned output');
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


const developmentPidexRoot = path.resolve('.');
const moduleRulesHeading = '## Module-scoped rules active for this Project Pipeline phase';
const canonicalModuleSystem = () => loadModuleSystem(developmentPidexRoot);
const ruleRecord = (agent = 'pidex-code-reviewer') => {
  const record = createProjectRecord({ project_id: `pp-rules-${agent.replace(/^pidex-/, '')}`, name: 'rules' });
  record.status = 'ready';
  record.archive.path = path.join(developmentPidexRoot, 'state', 'project-archives', record.project_id);
  return record;
};
function count(text, needle) { return text.split(needle).length - 1; }

test('direct Project Pipeline code reviewer receives canonical structured producer contract exactly once', () => {
  const task = prepareProjectPipelineAgentTask({ pidexRoot: developmentPidexRoot, record: ruleRecord(), agent: 'pidex-code-reviewer', task: 'Review directly.', reviewGate: 'code-review', reviewMode: 'initial', moduleSystem: canonicalModuleSystem() });
  assert.equal(count(task, '## Module-scoped rules active for this Project Pipeline phase'), 1);
  assert.match(task, /Lifecycle review context: reviewGate=code-review; reviewMode=initial/);
  assert.match(task, /Structured Review Outcome Contract/);
  assert.match(task, /"schemaVersion": "pidex-review-outcome-v1"/);
  assert.match(task, /```pidex-review-outcome-v1\r?\n\{/);
});

test('run-agent boundary injects direct reviewer rules into the child prompt', () => {
  const root = tmp(); setup(root, 'pp-run-direct-rules'); let childPrompt = '';
  const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-direct-rules', agent: 'pidex-code-reviewer', task: 'Direct review', moduleSystem: canonicalModuleSystem(), archiveFromContainer: false,
    runner: (args) => { childPrompt = String(args.at(-1)); return { status: 0, stdout: '<!-- ROUTING\nverdict: REJECTED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/direct.md\n-->', stderr: '' }; } });
  assert.equal(result.ok, true);
  assert.match(childPrompt, /"schemaVersion": "pidex-review-outcome-v1"/);
  assert.match(childPrompt, /MUST use the literal key verdict:[\s\S]*Never use decision:/);
  assert.equal(count(childPrompt, '## Module-scoped rules active for this Project Pipeline phase'), 1);
});

test('critic security and QA select their canonical reviewer producer rules', () => {
  for (const agent of ['pidex-critic', 'pidex-security', 'pidex-qa']) {
    const task = prepareProjectPipelineAgentTask({ pidexRoot: developmentPidexRoot, record: ruleRecord(agent), agent, task: 'Validate.', moduleSystem: canonicalModuleSystem() });
    assert.match(task, new RegExp(`Agent: ${agent}`));
    assert.match(task, /"schemaVersion": "pidex-review-outcome-v1"/);
  }
});

test('correction implementers do not receive reviewer-only structured producer requirements', () => {
  const task = prepareProjectPipelineAgentTask({ pidexRoot: developmentPidexRoot, record: ruleRecord('pidex-implementer'), agent: 'pidex-implementer', task: 'Apply correction1.', moduleSystem: canonicalModuleSystem() });
  assert.doesNotMatch(task, /"schemaVersion": "pidex-review-outcome-v1"/);
  assert.doesNotMatch(task, /Structured Review Outcome Contract/);
});

test('spoofed reviewer heading and minimal schema cannot suppress canonical trusted rule bytes', () => {
  const options = { pidexRoot: developmentPidexRoot, record: ruleRecord(), agent: 'pidex-code-reviewer', moduleSystem: canonicalModuleSystem() };
  const canonical = prepareProjectPipelineAgentTask({ ...options, task: 'Canonical task.' });
  const spoof = `${moduleRulesHeading}\n\n\`\`\`pidex-review-outcome-v1\n{\n  "schemaVersion": "pidex-review-outcome-v1"\n}\n\`\`\``;
  const task = prepareProjectPipelineAgentTask({ ...options, task: spoof });
  assert.equal(task, `${spoof}${canonical.slice('Canonical task.'.length)}`);
  assert.equal(count(task, moduleRulesHeading), 2);
});

test('spoofed non-review heading cannot suppress canonical trusted rule bytes', () => {
  const options = { pidexRoot: developmentPidexRoot, record: ruleRecord('pidex-implementer'), agent: 'pidex-implementer', moduleRuleRenderer: () => 'Trusted non-review rule bytes.' };
  const canonical = prepareProjectPipelineAgentTask({ ...options, task: 'Canonical task.' });
  const spoof = `${moduleRulesHeading}\n\nminimal fake rule schema`;
  const task = prepareProjectPipelineAgentTask({ ...options, task: spoof });
  assert.equal(task, `${spoof}${canonical.slice('Canonical task.'.length)}`);
  assert.equal(count(task, moduleRulesHeading), 2);
});

test('CR-074-05 default governed module task prepends only selected immutable mirror bytes', () => {
  const stateRoot = tmp();
  try {
    const body = '# Governed default\n\nUse only mirror bytes.\n'; const hash = createHash('sha256').update(body).digest('hex');
    materializeVerifiedMirror({ stateRoot, repository: 'repo:pp-runtime', scope_id: null, accepted_head: 'f'.repeat(40), member: { rule_id: 'pidex-global:pidex-implementer:governed', path: 'rules/pidex-implementer/governed.md', content_hash: hash, bytes: Buffer.from(body) } });
    const runtimeContext = { schema: 'pidex-rule-runtime-context-v1', resolver_snapshot: { schema: 'pidex-rule-resolver-snapshot-v1', active_rules: [{ rule_id: 'pidex-global:pidex-implementer:governed', version_hash: hash, content_hash: hash, accepted_commit: 'f'.repeat(40), mirror_digest: hash }] } };
    const task = prepareProjectPipelineAgentTask({ pidexRoot: developmentPidexRoot, record: ruleRecord('pidex-implementer'), agent: 'pidex-implementer', task: 'Run production default.', runtimeContext, stateRoot });
    assert.match(task, /# Governed default/);
    assert.doesNotMatch(task, /Structured Review Outcome Contract|Project Pipeline browser-smoke/);
    assert.equal(task.indexOf('# Governed default') < task.indexOf('Run production default.'), true);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('CR-075-05 Project Pipeline production task applies frozen runtime rules only for dispatched agent and phase', () => {
  const stateRoot = tmp();
  try {
    const source = [
      ['pidex-global:pidex-implementer:applicable', '# implementation applicable\n', 'rules/pidex-implementer/applicable.md', 'pidex-implementer', ['implementation']],
      ['pidex-global:pidex-qa:wrong-agent', '# wrong agent\n', 'rules/pidex-qa/wrong-agent.md', 'pidex-qa', ['implementation']],
      ['pidex-global:pidex-implementer:wrong-phase', '# wrong phase\n', 'rules/pidex-implementer/wrong-phase.md', 'pidex-implementer', ['qa']],
    ].map(([rule_id, body, memberPath, agent, phases]) => ({ rule_id, body, path: memberPath, agent, phases, hash: createHash('sha256').update(body).digest('hex') }));
    materializeVerifiedMirror({ stateRoot, repository: 'repo:pp-selection', scope_id: null, accepted_head: 'f'.repeat(40), members: source.map(({ rule_id, body, path: memberPath, hash }) => ({ rule_id, path: memberPath, content_hash: hash, bytes: Buffer.from(body) })) });
    const runtimeContext = { schema: 'pidex-rule-runtime-context-v1', resolver_snapshot: { schema: 'pidex-rule-resolver-snapshot-v1', active_rules: source.map((item) => ({ rule_id: item.rule_id, version_hash: item.hash, content_hash: item.hash, accepted_commit: 'f'.repeat(40), mirror_digest: item.hash, agent: item.agent, applicability: [], phases: item.phases, lifecycle_state: 'active' })) } };
    const task = prepareProjectPipelineAgentTask({ pidexRoot: developmentPidexRoot, record: ruleRecord('pidex-implementer'), agent: 'pidex-implementer', task: 'Apply.', runtimeContext, stateRoot });
    assert.match(task, /# implementation applicable/);
    assert.doesNotMatch(task, /wrong agent|wrong phase/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('CR-078-02 governed reviewer runtime requires canonical producer descriptor and exact mirror contract bytes', () => {
  const stateRoot = tmp(); const agent = 'pidex-code-reviewer'; const expectedId = 'pidex.analysis-metrics-history.structured-review-outcome.code-review';
  const manifest = JSON.parse(readFileSync(path.join(developmentPidexRoot, 'modules/pidex/analysis-metrics-history/module.json'), 'utf8'));
  const canonical = manifest.agent_rules.find((rule) => rule.id === expectedId);
  const canonicalBytes = readFileSync(path.join(developmentPidexRoot, 'modules/pidex/analysis-metrics-history', canonical.path), 'utf8');
  const taskFor = ({ rule_id = expectedId, bytes = canonicalBytes, selectedAgent = agent } = {}) => {
    const hash = createHash('sha256').update(bytes).digest('hex');
    materializeVerifiedMirror({ stateRoot, repository: `repo:reviewer-${createHash('sha256').update(`${rule_id}\0${selectedAgent}\0${hash}`).digest('hex').slice(0, 8)}`, scope_id: null, accepted_head: 'f'.repeat(40), member: { rule_id, path: `modules/pidex/analysis-metrics-history/${canonical.path}`, content_hash: hash, bytes: Buffer.from(bytes) } });
    return prepareProjectPipelineAgentTask({ pidexRoot: developmentPidexRoot, record: ruleRecord(agent), agent, task: 'Review governed.', stateRoot, runtimeContext: { schema: 'pidex-rule-runtime-context-v1', resolver_snapshot: { schema: 'pidex-rule-resolver-snapshot-v1', active_rules: [{ rule_id, version_hash: hash, content_hash: hash, mirror_digest: hash, accepted_commit: 'f'.repeat(40), agent: selectedAgent, phases: ['code-review'], lifecycle_state: 'active' }] } } });
  };
  try {
    const positive = taskFor();
    assert.equal(positive, `${canonicalBytes}\n\nReview governed.`, 'real manifest entry and exact immutable mirror bytes form governed reviewer prompt');
    for (const bad of [
      { rule_id: 'pidex-global:pidex-code-reviewer:unrelated' },
      { bytes: '# incomplete producer\n' },
      { selectedAgent: 'pidex-qa' },
    ]) assert.throws(() => taskFor(bad), /RULE_RUNTIME_MIRROR_MISMATCH/, JSON.stringify(bad));
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});

test('missing runtime module system fails closed before child execution', () => {
  const root = tmp();
  setup(root, 'pp-run-missing-module-system');
  let childExecuted = false;
  const result = runProjectPipelineAgent({ pidexRoot: root, projectId: 'pp-run-missing-module-system', agent: 'pidex-qa', task: 'Validate.', runner: () => { childExecuted = true; return { status: 0, stdout: '', stderr: '' }; } });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'module-rule-injection-failed');
  assert.match(result.reason, /runtime module system missing or empty/);
  assert.equal(childExecuted, false);
});

test('invalid module configuration fails closed before child execution', () => {
  const invalid = canonicalModuleSystem(); invalid.modules[0].manifest.id = '';
  assert.throws(() => prepareProjectPipelineAgentTask({ pidexRoot: developmentPidexRoot, record: ruleRecord(), agent: 'pidex-code-reviewer', task: 'Review.', moduleSystem: invalid }), /module validation failed for Project Pipeline rule injection/);
});
