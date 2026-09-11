import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import test, { after } from 'node:test';
import { recordPipelineEvent } from '../../modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
// Immutable-inventory tests need a real committed authority for the candidate
// module manifests, not whichever commit happens to underlie a dirty worktree.
// Commit only an isolated fixture copy; never stage/change the working repository.
const authorityRoot = mkdtempSync(join(tmpdir(), 'pidex-rule-consumer-authority-'));
const sourceFiles = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(file =>
  /^(agents|rules|config)\//.test(file) || /^modules\/pidex\/[^/]+\/(module\.json$|rules\/|agents\/)/.test(file));
for (const file of sourceFiles) {
  const destination = path.join(authorityRoot, file);
  mkdirSync(path.dirname(destination), { recursive: true }); copyFileSync(path.join(root, file), destination);
}
for (const args of [['init', '-q'], ['add', '.'], ['-c', 'user.name=PIDEX fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'isolated candidate rule authority']]) execFileSync('git', ['-C', authorityRoot, ...args]);
const previousRoot = process.env.PIDEX_ROOT;
let executeHostAgentBoundary;
try {
  process.env.PIDEX_ROOT = authorityRoot;
  ({ executeHostAgentBoundary } = await import('./index.ts?committed-rule-consumer-fixture'));
} finally { if (previousRoot === undefined) delete process.env.PIDEX_ROOT; else process.env.PIDEX_ROOT = previousRoot; }
after(() => rmSync(authorityRoot, { recursive: true, force: true }));
const consumers = [
  'extensions/pidex/index.ts',
  'modules/pidex/project-pipeline/scripts/project-pipeline/orchestrator.mjs',
  'modules/pidex/project-pipeline/scripts/project-pipeline/run-agent.mjs',
  'scripts/modules/render-rules.mjs',
  'scripts/modules/context.mjs',
];
const config = { defaults: { provider: 'pi', model: 'openai-codex/gpt-5.6-terra', effort: 'medium', timeout_seconds: 300 }, agents: { 'pidex-planner': { model: 'openai-codex/gpt-5.6-sol', effort: 'high', timeout_seconds: 420 } } };
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// BD45-23: source/mirror reads belong only in inventory/mirror adapters, never consumers.
test('CR-073-05 authorized consumers contain no direct managed or legacy rule-source read', () => {
  for (const relative of consumers) {
    const source = readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /readFileSync\([^\n]*(?:pidex\/rules|rules\/managed|rules\/)/, relative);
    assert.doesNotMatch(source, /readdirSync\([^\n]*(?:pidex\/rules|rules\/managed|rules\/)/, relative);
  }
});

function createVerifiedProjectAuthority(project, bytes = '# governed host rule\n') {
  const relativeRule = 'pidex/rules/pidex-planner.md';
  mkdirSync(path.join(project, 'pidex', 'rules'), { recursive: true });
  writeFileSync(path.join(project, relativeRule), bytes);
  for (const args of [['init'], ['config', 'user.email', 'test@example.invalid'], ['config', 'user.name', 'PIDEX test'], ['add', relativeRule], ['commit', '-m', 'verified project rule']]) execFileSync('git', ['-C', project, ...args]);
  return bytes;
}

function hostOptions(project, stateDir, pipelineId, seen) {
  return {
    agentCwd: project, reviewLifecycle: { stateDir, pipelineId: 'caller-must-not-win' }, loadConfig: () => config,
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => { seen.push(params); return { agent: params.agent, exitCode: 0, stderr: '', finalText: '<!-- ROUTING\ncontext_file: agents.output/planning/045.md\n-->' }; },
  };
}

test('CR-075-05 fresh host authority renders manifest global plus exact Git project rule', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'pidex-host-runtime-selection-'));
  const project = mkdtempSync(join(tmpdir(), 'pidex-host-runtime-project-'));
  const pipelineId = 'pipeline-host-runtime-selection'; const seen = [];
  try {
    const projectBytes = createVerifiedProjectAuthority(project);
    const globalBytes = readFileSync(path.join(root, 'agents/pidex-planner.md'), 'utf8').trim();
    recordPipelineEvent({ stateDir, project, plan: '045', event: 'pipeline_started', pipelineId });
    await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 045 host runtime selection' }, hostOptions(project, stateDir, pipelineId, seen));
    assert.equal(seen.length, 1);
    assert.match(seen[0].task, new RegExp(escapeRegExp(globalBytes)));
    assert.match(seen[0].task, new RegExp(escapeRegExp(projectBytes.trim())));
    assert.match(seen[0].task, /Rule runtime context: attested lifecycle authority\./);
  } finally { rmSync(stateDir, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('CR-073-08 host retries reuse one fresh verified context snapshot', async () => {
  const stateDir = mkdtempSync(join(tmpdir(), 'pidex-host-runtime-state-'));
  const project = mkdtempSync(join(tmpdir(), 'pidex-host-runtime-project-'));
  const pipelineId = 'pipeline-host-runtime-45'; const seen = [];
  try {
    createVerifiedProjectAuthority(project);
    recordPipelineEvent({ stateDir, project, plan: '045', event: 'pipeline_started', pipelineId });
    const options = hostOptions(project, stateDir, pipelineId, seen);
    await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 045 host authority' }, options);
    await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 045 host authority' }, options);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].runtimeContext.pipeline_id, pipelineId);
    assert.match(seen[0].runtimeContext.resolver_snapshot.snapshot_id, /^snapshot:/);
    assert.match(seen[0].runtimeContext.passive_exposure_input.rule_snapshot.snapshot_id, /^snapshot:/);
    assert.deepEqual(seen[1].runtimeContext, seen[0].runtimeContext);
    assert.equal(seen[1].task, seen[0].task);
  } finally { rmSync(stateDir, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});
