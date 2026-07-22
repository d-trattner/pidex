import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Check } from 'typebox/value';

const mod = await import('./index.ts');

test('pidex_agent public schema exposes review identity atomically', () => {
  const schema = mod.PidexAgentParams;
  const properties = schema.properties;
  const ordinary = { agent: 'pidex-planner', task: 'plan' };
  const identity = { runFamilyId: 'family-040', planId: 'plan-040', reviewGate: 'critic', reviewMode: 'initial', attemptId: 'attempt-040' };
  for (const flat of Object.keys(identity)) assert.equal(flat in properties, false, `public schema must not expose flat ${flat}`);
  assert.deepEqual([...properties.reviewIdentity.required].sort(), Object.keys(identity).sort());
  assert.equal(properties.reviewIdentity.additionalProperties, false);
  assert.equal(schema.additionalProperties, false);
  assert.equal(Check(schema, ordinary), true);
  assert.equal(Check(schema, { ...ordinary, reviewIdentity: identity }), true);
  assert.equal(Check(schema, { ...ordinary, planId: identity.planId }), false);
  assert.equal(Check(schema, { ...ordinary, ...identity }), false);
  assert.equal(Check(schema, { ...ordinary, reviewIdentity: identity, planId: identity.planId }), false);
  assert.equal(Check(schema, { ...ordinary, unexpected: true }), false);
  assert.deepEqual(mod.normalizePublicReviewIdentity({ projectId: 'pp-demo', reviewIdentity: identity }), { projectId: 'pp-demo', ...identity });
});

test('projectPipelineModeEvidenceLine reports project-pipeline no-fallback clearly', () => {
  const line = mod.projectPipelineModeEvidenceLine({ ok: true, mode: 'project-pipeline', source: 'saved', no_fallback: true });
  assert.match(line, /project_pipeline_mode: project-pipeline/);
  assert.match(line, /no_fallback: true/);
});

test('projectPipelineModeEvidenceLine reports decision-required without fallback', () => {
  const line = mod.projectPipelineModeEvidenceLine({ ok: false, decision_required: true, reason: 'missing saved mode' });
  assert.match(line, /decision-required/);
  assert.match(line, /missing saved mode/);
});

test('projectPipelineModeInstructionLine points project-pipeline to orchestrator facade', () => {
  const line = mod.projectPipelineModeInstructionLine({ ok: true, mode: 'project-pipeline', no_fallback: true });
  assert.match(line, /project-pipeline\.orchestrator/);
  assert.match(line, /do not fall back/);
  assert.match(line, /do not mirror source/);
});

test('orchestrator instructions describe per-project modes without direct-only claims', () => {
  const pidexSkill = readFileSync(path.join(process.cwd(), 'skills/pidex/SKILL.md'), 'utf8');
  const pdSkill = readFileSync(path.join(process.cwd(), 'skills/pd/SKILL.md'), 'utf8');
  const sandboxRule = readFileSync(path.join(process.cwd(), 'rules/orchestrator/sandbox-preflight.md'), 'utf8');
  for (const mode of ['host-direct', 'hardened-pipeline', 'project-pipeline']) assert.match(pidexSkill, new RegExp(mode));
  assert.match(pidexSkill, /If no mode is saved/);
  assert.doesNotMatch(pidexSkill, /only parity-supported mode/);
  assert.match(pdSkill, /per-project PIDEX mode/);
  assert.doesNotMatch(pdSkill, /direct-mode pipeline/);
  assert.match(pidexSkill, /^description: "/m);
  assert.match(pdSkill, /^description: "/m);
  assert.match(sandboxRule, /separate from Project Pipeline/);
  assert.match(sandboxRule, /do not reinterpret it as the temporary hardened agent sandbox/);
});

test('Project Pipeline UI preview detection and default command are host-orchestrator owned', () => {
  assert.equal(mod.isProjectPipelineUiPreviewTask('Build a Vite React page'), true);
  assert.equal(mod.isProjectPipelineUiPreviewTask('Refactor backend parser'), false);
  assert.deepEqual([...mod.DEFAULT_PROJECT_PIPELINE_PREVIEW_COMMAND], ['pnpm', 'exec', 'vite', '--host', '0.0.0.0', '--port', '$PORT']);
});

test('buildProjectPipelineRunFlowArgs constructs fail-closed orchestrator request', () => {
  const built = mod.buildProjectPipelineRunFlowArgs({ projectRoot: process.cwd(), task: 'ship the thing', copyPiCredentials: true, acknowledgeTrustedPersistentContainer: true });
  assert.match(built.projectId, /^pp-/);
  assert.equal(built.args[0].replace(/\\/g, '/').endsWith(['modules', 'pidex', 'project-pipeline', 'scripts', 'project-pipeline', 'orchestrator.mjs'].join('/')), true);
  assert.equal(built.args.includes('--source'), true);
  assert.equal(built.args.includes(process.cwd()), true);
  assert.equal(built.args.includes('--agent'), false);
  assert.equal(built.args.includes('pidex-planner'), false);
  assert.equal(built.args.includes('--acknowledge-trusted-persistent-container'), true);
  assert.match(built.args[built.args.indexOf('--task') + 1], /Do not run host-direct or hardened-pipeline fallback/);
});

test('shouldStartProjectPipelineRunFlow selects only explicit project-pipeline mode', () => {
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: true, mode: 'project-pipeline' }), true);
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: true, mode: 'host-direct' }), false);
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: true, mode: 'hardened-pipeline' }), false);
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: false, decision_required: true }), false);
});

test('Project Pipeline credential prompt is skipped when Pi credentials are already configured', async () => {
  let selectCalls = 0;
  const result = await mod.maybeCopyProjectPipelinePiCredentials({
    hasUI: true,
    ui: { select: async () => { selectCalls += 1; return 'Copy Pi credentials'; } },
  }, process.cwd(), { credentialsConfigured: () => true });
  assert.equal(result, false);
  assert.equal(selectCalls, 0);
});

test('projectPipelinePiCredentialsConfigured reads configured status without exposing inventory', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-credential-status-'));
  const helper = path.join(dir, 'credentials.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: true, credentials: { pi: 'configured', inventory: [{ fingerprint: 'secret-metadata' }] } }));\n");
  try {
    assert.equal(mod.projectPipelinePiCredentialsConfigured(process.cwd(), { script: helper }), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('hardened sandbox state is gated by resolved per-project mode', () => {
  assert.equal(mod.resolveSandboxStateForProjectMode(undefined).enabled, false);
  assert.match(mod.resolveSandboxStateForProjectMode(undefined).reason, /per-project-mode-unresolved/);
  assert.equal(mod.resolveSandboxStateForProjectMode({ ok: true, mode: 'host-direct' }).enabled, false);
  assert.match(mod.resolveSandboxStateForProjectMode({ ok: true, mode: 'host-direct' }).reason, /per-project-mode-host-direct/);
  assert.equal(mod.resolveSandboxStateForProjectMode({ ok: true, mode: 'project-pipeline' }).enabled, false);
  assert.match(mod.resolveSandboxStateForProjectMode({ ok: true, mode: 'project-pipeline' }).reason, /per-project-mode-project-pipeline/);
});

test('chooseProjectPipelineMode saves selected project-pipeline mode and preserves credential boundary', async () => {
  const calls = [];
  const notifications = [];
  const ctx = {
    ui: {
      select: async (_message, options) => options.find((option) => option.startsWith('project-pipeline')),
      notify: async (message, level) => notifications.push({ message, level }),
    },
  };
  const result = await mod.chooseProjectPipelineMode(ctx, process.cwd(), {
    saveMode: (projectRoot, mode, source) => {
      calls.push({ projectRoot, mode, source });
      return { ok: true, mode, source, no_fallback: mode === 'project-pipeline' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'project-pipeline');
  assert.equal(result.no_fallback, true);
  assert.deepEqual(calls.map((call) => ({ mode: call.mode, source: call.source })), [{ mode: 'project-pipeline', source: 'pd-first-run' }]);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /persistent Docker Project Sandbox/);
  assert.doesNotMatch(JSON.stringify({ calls, notifications }), /fingerprint|pidex-secrets|auth\.json|copySelectedCredentials/);
});

test('chooseProjectPipelineMode cancel stops without saving or credential prompt', async () => {
  let saveCalled = false;
  const result = await mod.chooseProjectPipelineMode({ ui: { select: async (_message, options) => options.find((option) => option.startsWith('Cancel')), notify: async () => { throw new Error('notify should not run'); } } }, process.cwd(), {
    saveMode: () => { saveCalled = true; return { ok: true, mode: 'project-pipeline' }; },
  });
  assert.equal(result, undefined);
  assert.equal(saveCalled, false);
});

test('listRecentPidexProjects returns newest unique existing non-temporary project directories', () => {
  const dir = mkdtempSync(path.join(process.cwd(), '.pidex-history-test-'));
  const temporaryProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-history-project-'));
  const state = path.join(dir, 'state');
  const olderProject = path.join(dir, 'older');
  const newerProject = path.join(dir, 'newer');
  mkdirSync(state);
  mkdirSync(olderProject);
  mkdirSync(newerProject);
  writeFileSync(path.join(state, 'history.jsonl'), [
    JSON.stringify({ cwd: olderProject, ts: '2026-01-01T00:00:00Z', event: 'start', mode: 'host-direct' }),
    JSON.stringify({ cwd: newerProject, ts: '2026-01-03T00:00:00Z', event: 'complete', mode: 'project-pipeline' }),
    JSON.stringify({ cwd: olderProject, ts: '2026-01-04T00:00:00Z', event: 'complete', mode: 'host-direct' }),
    JSON.stringify({ cwd: path.join(dir, 'missing'), ts: '2026-01-05T00:00:00Z', event: 'complete' }),
    JSON.stringify({ cwd: temporaryProject, ts: '2026-01-06T00:00:00Z', event: 'complete' }),
  ].join('\n'));
  try {
    const recent = mod.listRecentPidexProjects(5, state);
    assert.deepEqual(recent.map((item) => item.cwd), [olderProject, newerProject]);
    assert.equal(recent[0].last_event, 'complete');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(temporaryProject, { recursive: true, force: true });
  }
});

test('listRecentPidexProjects includes saved project-pipeline modes except temporary projects', () => {
  const dir = mkdtempSync(path.join(process.cwd(), '.pidex-history-modes-test-'));
  const temporaryProject = path.join(os.tmpdir(), 'pidex-sandbox-only-project');
  const state = path.join(dir, 'state');
  const modeDir = path.join(state, 'project-pipeline-modes');
  const existingHostProject = path.join(dir, 'host-project');
  const sandboxOnlyProject = path.join(dir, 'sandbox-only-project');
  mkdirSync(modeDir, { recursive: true });
  mkdirSync(existingHostProject);
  writeFileSync(path.join(modeDir, 'host.json'), JSON.stringify({ schema_version: 1, project_root: existingHostProject, mode: 'host-direct', decided_at: '2026-01-01T00:00:00Z' }));
  writeFileSync(path.join(modeDir, 'sandbox.json'), JSON.stringify({ schema_version: 1, project_root: sandboxOnlyProject, mode: 'project-pipeline', decided_at: '2026-01-02T00:00:00Z' }));
  writeFileSync(path.join(modeDir, 'temporary.json'), JSON.stringify({ schema_version: 1, project_root: temporaryProject, mode: 'project-pipeline', decided_at: '2026-01-04T00:00:00Z' }));
  writeFileSync(path.join(modeDir, 'missing-host.json'), JSON.stringify({ schema_version: 1, project_root: path.join(dir, 'missing-host'), mode: 'host-direct', decided_at: '2026-01-03T00:00:00Z' }));
  try {
    const recent = mod.listRecentPidexProjects(5, state);
    assert.deepEqual(recent.map((item) => item.cwd), [sandboxOnlyProject, existingHostProject]);
    assert.equal(recent[0].last_mode, 'project-pipeline');
    assert.equal(recent[0].last_event, 'mode-saved');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('/pd first-run project-pipeline selection continues same task into run-flow seam', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-pd-seam-'));
  const modeHelper = path.join(dir, 'mode.mjs');
  const orchestratorHelper = path.join(dir, 'orchestrator.mjs');
  const recorder = path.join(dir, 'orchestrator-argv.json');
  writeFileSync(path.join(dir, 'package.json'), '{"name":"seam-project"}\n');
  writeFileSync(modeHelper, `
const argv = process.argv.slice(2);
const modeIndex = argv.indexOf('--mode');
if (modeIndex === -1) {
  console.log(JSON.stringify({ ok: false, decision_required: true, reason: 'missing saved mode', no_fallback: true }));
} else {
  const mode = argv[modeIndex + 1];
  console.log(JSON.stringify({ ok: true, mode, source: argv[argv.indexOf('--source') + 1], no_fallback: mode === 'project-pipeline' }));
}
`);
  writeFileSync(orchestratorHelper, `
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.PIDEX_TEST_RECORDER, JSON.stringify({ argv: process.argv.slice(2) }));
console.error('[pidex:project-pipeline] preparing sandbox pp-seam');
console.error('[pidex:project-pipeline] running pidex-planner (1/7) inside Project Sandbox');
console.log(JSON.stringify({ ok: true, no_fallback: true, lifecycle: { record: { project_id: 'pp-seam' } }, final_context_file: 'agents.output/qa/seam.md', runs: [{ agent: 'pidex-qa', ok: true, context_file: 'agents.output/qa/seam.md', archive_sync_status: 'complete' }] }));
`);
  try {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
import { readFileSync } from 'node:fs';
const mod = await import('./extensions/pidex/index.ts');
const commands = new Map();
const notifications = [];
const sent = [];
mod.default({
  on: () => {},
  registerTool: () => {},
  registerCommand: (name, spec) => commands.set(name, spec),
  sendUserMessage: (message) => sent.push(message),
});
await commands.get('pd').handler('ship same task', {
  cwd: process.env.PIDEX_TEST_PROJECT_ROOT,
  hasUI: true,
  ui: {
    select: async (message, options) => message.includes('Choose PIDEX mode') ? options.find((option) => option.startsWith('project-pipeline')) : options.find((option) => option.startsWith('Use current directory')),
    notify: async (message, level) => notifications.push({ message, level }),
  },
});
console.log(JSON.stringify({ notifications, sent, recorded: JSON.parse(readFileSync(process.env.PIDEX_TEST_RECORDER, 'utf8')) }));
`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PIDEX_CHILD: '0',
        PIDEX_PROJECT_PIPELINE_MODE_SCRIPT: modeHelper,
        PIDEX_PROJECT_PIPELINE_ORCHESTRATOR_SCRIPT: orchestratorHelper,
        PIDEX_STATE_DIR: path.join(dir, 'state'),
        PIDEX_TEST_PROJECT_ROOT: dir,
        PIDEX_TEST_RECORDER: recorder,
        PIDEX_PROJECT_PIPELINE_COPY_PI_CREDENTIALS: '0',
      },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const parsed = JSON.parse(child.stdout.trim().split(/\n/).at(-1));
    assert.equal(parsed.sent.length, 0, 'project-pipeline mode should not fall through to host kickoff');
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /persistent Docker Project Sandbox/);
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /Project Pipeline: preparing sandbox pp-seam/);
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /Project Pipeline: running pidex-planner \(1\/7\) inside Project Sandbox/);
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /Project Pipeline run-flow complete for pp-seam/);
    const argv = parsed.recorded.argv;
    assert.match(argv[argv.indexOf('--task') + 1], /Initial user task: ship same task/);
    assert.equal(argv.includes('--pi-auth'), false);
    assert.equal(argv.includes('--acknowledge-trusted-persistent-container'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('isLikelyPidexProjectDirectory does not treat a child pidex checkout as project marker', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-home-with-checkout-'));
  try {
    mkdirSync(path.join(dir, 'pidex'));
    assert.equal(mod.isLikelyPidexProjectDirectory(dir), false);
    mkdirSync(path.join(dir, 'pidex', 'context'), { recursive: true });
    writeFileSync(path.join(dir, 'pidex', 'context', 'CONTEXT.md'), '# Context\n');
    assert.equal(mod.isLikelyPidexProjectDirectory(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('/pd without a task in a selected Project Pipeline project starts the task interview', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-pd-project-interview-'));
  const modeHelper = path.join(dir, 'mode.mjs');
  writeFileSync(path.join(dir, 'package.json'), '{"name":"interview-project"}\n');
  writeFileSync(modeHelper, "console.log(JSON.stringify({ ok: true, mode: 'project-pipeline', source: 'saved', no_fallback: true }));\n");
  try {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
const mod = await import('./extensions/pidex/index.ts');
const commands = new Map();
const notifications = [];
const sent = [];
let selectCalls = 0;
mod.default({
  on: () => {},
  registerTool: () => {},
  registerCommand: (name, spec) => commands.set(name, spec),
  sendUserMessage: (message) => sent.push(message),
});
await commands.get('pd').handler('', {
  cwd: process.env.PIDEX_TEST_PROJECT_ROOT,
  hasUI: true,
  ui: {
    select: async () => { selectCalls += 1; throw new Error('no selection popup expected'); },
    notify: async (message, level) => notifications.push({ message, level }),
  },
});
console.log(JSON.stringify({ notifications, sent, selectCalls }));
`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PIDEX_CHILD: '0',
        PIDEX_PROJECT_PIPELINE_MODE_SCRIPT: modeHelper,
        PIDEX_STATE_DIR: path.join(dir, 'state'),
        PIDEX_TEST_PROJECT_ROOT: dir,
      },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const parsed = JSON.parse(child.stdout.trim().split(/\n/).at(-1));
    assert.equal(parsed.selectCalls, 0);
    assert.equal(parsed.sent.length, 1);
    assert.match(parsed.sent[0], /Selected project root:/);
    assert.match(parsed.sent[0], /project-pipeline/);
    assert.match(parsed.sent[0], /Initial user task: not provided; begin by asking/);
    assert.doesNotMatch(parsed.notifications.map((item) => item.message).join('\n'), /requires an initial task/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('/pd with no recent project in non-project cwd defers to orchestrator new-project interview', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-pd-fresh-home-'));
  const state = path.join(dir, 'state');
  mkdirSync(state);
  try {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
const mod = await import('./extensions/pidex/index.ts');
const commands = new Map();
const notifications = [];
const sent = [];
let selectCalls = 0;
mod.default({
  on: () => {},
  registerTool: () => {},
  registerCommand: (name, spec) => commands.set(name, spec),
  sendUserMessage: (message) => sent.push(message),
});
await commands.get('pd').handler('', {
  cwd: process.env.PIDEX_TEST_PROJECT_ROOT,
  hasUI: true,
  ui: {
    select: async () => { selectCalls += 1; return 'host-direct'; },
    notify: async (message, level) => notifications.push({ message, level }),
  },
});
console.log(JSON.stringify({ notifications, sent, selectCalls }));
`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PIDEX_CHILD: '0',
        PIDEX_STATE_DIR: state,
        PIDEX_TEST_PROJECT_ROOT: dir,
      },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const parsed = JSON.parse(child.stdout.trim().split(/\n/).at(-1));
    assert.equal(parsed.selectCalls, 0, 'fresh non-project /pd should not show mode selector before project interview');
    assert.equal(parsed.sent.length, 1);
    assert.doesNotMatch(parsed.sent[0], /Selected project root:/);
    assert.match(parsed.sent[0], /No project root was preselected/);
    assert.match(parsed.sent[0], /New project flow/);
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /new-project interview/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('/pd with recent history can still choose new project or different path', () => {
  const dir = mkdtempSync(path.join(process.cwd(), '.pidex-pd-recent-new-test-'));
  const state = path.join(dir, 'state');
  const recentRoot = path.join(dir, 'recent-project');
  const homeLike = path.join(dir, 'home');
  mkdirSync(state, { recursive: true });
  mkdirSync(recentRoot);
  mkdirSync(homeLike);
  writeFileSync(path.join(state, 'history.jsonl'), `${JSON.stringify({ cwd: recentRoot, ts: '2026-06-01T00:00:00Z', event: 'complete', mode: 'project-pipeline' })}\n`);
  try {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
const mod = await import('./extensions/pidex/index.ts');
const commands = new Map();
const notifications = [];
const sent = [];
let modeSelectCalls = 0;
mod.default({
  on: () => {},
  registerTool: () => {},
  registerCommand: (name, spec) => commands.set(name, spec),
  sendUserMessage: (message) => sent.push(message),
});
await commands.get('pd').handler('', {
  cwd: process.env.PIDEX_TEST_HOME_ROOT,
  hasUI: true,
  ui: {
    select: async (message, options) => {
      if (message.includes('Choose which project')) return options.find((option) => option.startsWith('New project / different path'));
      if (message.includes('Choose PIDEX mode')) modeSelectCalls += 1;
      return options[0];
    },
    notify: async (message, level) => notifications.push({ message, level }),
  },
});
console.log(JSON.stringify({ notifications, sent, modeSelectCalls }));
`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PIDEX_CHILD: '0',
        PIDEX_STATE_DIR: state,
        PIDEX_TEST_HOME_ROOT: homeLike,
      },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const parsed = JSON.parse(child.stdout.trim().split(/\n/).at(-1));
    assert.equal(parsed.modeSelectCalls, 0, 'new/different choice must defer before mode selection');
    assert.equal(parsed.sent.length, 1);
    assert.match(parsed.sent[0], /No project root was preselected/);
    assert.match(parsed.sent[0], /New project flow/);
    assert.match(parsed.sent[0], /recent-project/);
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /new-project interview/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('choosePidexProjectRoot does not show recent-project selector from current project cwd', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-pd-current-'));
  const currentRoot = path.join(dir, 'current-project');
  mkdirSync(currentRoot);
  writeFileSync(path.join(currentRoot, 'package.json'), '{"name":"current-project"}\n');
  try {
    const selected = await mod.choosePidexProjectRoot({ cwd: currentRoot, hasUI: true, ui: { select: async () => { throw new Error('recent selector should not be shown'); } } });
    assert.equal(selected, currentRoot);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('summarizeProjectPipelineRunFlowResult emits concise non-json UI summary', () => {
  const result = {
    ok: true,
    projectId: 'pp-demo',
    no_fallback: true,
    stdout: JSON.stringify({
      no_fallback: true,
      final_context_file: 'agents.output/plans/demo.md',
      runs: [{ archive_sync_status: 'complete', project_mirror: { status: 'degraded-host-root-missing', degraded: true, copied: 0, updated: 0, deleted: 0, conflicts: 0 } }],
      latest_project_mirror_status: 'degraded-host-root-missing',
      any_mirror_degraded: true,
      run: {
        finalText: 'SECRET-LIKE-LARGE-CHILD-OUTPUT-SHOULD-NOT-BE-IN-UI',
      },
      credentials: { inventory: [{ fingerprint: 'sha256:abc' }] },
    }),
  };
  const summary = mod.summarizeProjectPipelineRunFlowResult(result);
  assert.match(summary, /Project Pipeline run-flow complete/);
  assert.match(summary, /agents\.output\/plans\/demo\.md/);
  assert.match(summary, /archive_sync: complete/);
  assert.match(summary, /project_mirror: degraded-host-root-missing/);
  assert.match(summary, /archive complete; project mirror degraded/);
  assert.match(summary, /no_fallback: true/);
  assert.doesNotMatch(summary, /SECRET-LIKE/);
  assert.doesNotMatch(summary, /sha256:abc/);
  assert.doesNotMatch(summary, /^\{/);
});

test('parsePdProjectArgs supports status and exact-confirm remove', () => {
  assert.deepEqual(mod.parsePdProjectArgs('use project-pipeline'), { command: 'use', mode: 'project-pipeline' });
  assert.deepEqual(mod.parsePdProjectArgs('use hardened-pipeline'), { command: 'use', mode: 'hardened-pipeline' });
  assert.throws(() => mod.parsePdProjectArgs('use magic'), /pdproject use requires/);
  assert.deepEqual(mod.parsePdProjectArgs('status'), { command: 'status', projectId: undefined });
  assert.deepEqual(mod.parsePdProjectArgs('status pp-demo'), { command: 'status', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('diagnose pp-demo'), { command: 'diagnose', projectId: 'pp-demo' });
  assert.throws(() => mod.parsePdProjectArgs('diagnose'), /diagnose requires a project id/);
  assert.deepEqual(mod.parsePdProjectArgs('runs pp-demo'), { command: 'runs', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('runs --project-id pp-demo'), { command: 'runs', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('show-run pp-demo pprun-1'), { command: 'show-run', projectId: 'pp-demo', runId: 'pprun-1' });
  assert.deepEqual(mod.parsePdProjectArgs('show-run --project-id pp-demo --run-id pprun-1'), { command: 'show-run', projectId: 'pp-demo', runId: 'pprun-1' });
  assert.deepEqual(mod.parsePdProjectArgs('artifacts pp-demo'), { command: 'artifacts', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('artifacts --project-id pp-demo'), { command: 'artifacts', projectId: 'pp-demo' });
  assert.throws(() => mod.parsePdProjectArgs('show-run pp-demo pprun-1 --run-id other'), /duplicate run id/);
  assert.throws(() => mod.parsePdProjectArgs('runs pp-demo --run-id pprun-1'), /unknown pdproject runs argument: --run-id/);
  assert.throws(() => mod.parsePdProjectArgs('runs --project-id'), /--project-id requires a value/);
  assert.throws(() => mod.parsePdProjectArgs('runs pp-demo --project-id other'), /duplicate project id/);
  assert.throws(() => mod.parsePdProjectArgs('runs --project-id pp-demo other'), /duplicate project id/);
  assert.deepEqual(mod.parsePdProjectArgs('open pp-demo'), { command: 'open', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('open --project-id pp-demo'), { command: 'open', projectId: 'pp-demo' });
  assert.throws(() => mod.parsePdProjectArgs('open --project-id'), /--project-id requires a value/);
  assert.deepEqual(mod.parsePdProjectArgs('repair pp-demo --confirm pp-demo'), { command: 'repair', projectId: 'pp-demo', confirm: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('repair --project-id pp-demo --confirm pp-demo'), { command: 'repair', projectId: 'pp-demo', confirm: 'pp-demo' });
  assert.throws(() => mod.parsePdProjectArgs('repair pp-demo --confirm wrong'), /repair requires --confirm pp-demo/);
  assert.deepEqual(mod.parsePdProjectArgs('credentials status pp-demo'), { command: 'credentials', action: 'status', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('credentials status --project-id pp-demo'), { command: 'credentials', action: 'status', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('credentials reset pp-demo --confirm pp-demo'), { command: 'credentials', action: 'reset', projectId: 'pp-demo', confirm: 'pp-demo' });
  assert.throws(() => mod.parsePdProjectArgs('credentials copy pp-demo'), /requires status or reset/);
  assert.throws(() => mod.parsePdProjectArgs('credentials reset pp-demo --confirm wrong'), /credentials reset requires --confirm pp-demo/);
  assert.deepEqual(mod.parsePdProjectArgs('remove pp-demo --confirm pp-demo'), { command: 'remove', projectId: 'pp-demo', confirm: 'pp-demo' });
  assert.throws(() => mod.parsePdProjectArgs('status --project-id'), /--project-id requires a value/);
  assert.throws(() => mod.parsePdProjectArgs('remove --project-id --confirm pp-demo'), /--project-id requires a value/);
  assert.throws(() => mod.parsePdProjectArgs('remove pp-demo --confirm'), /--confirm requires a value/);
  assert.throws(() => mod.parsePdProjectArgs('remove pp-demo --confirm wrong'), /requires --confirm pp-demo/);
});

test('runPdProjectCommand lists archive artifacts without file contents or unsafe paths', () => {
  const archive = path.join(process.cwd(), 'state', 'project-archives', 'pp-artifacts-test');
  mkdirSync(path.join(archive, 'agents.output', 'qa'), { recursive: true });
  mkdirSync(path.join(archive, 'wiki'), { recursive: true });
  writeFileSync(path.join(archive, 'agents.output', 'qa', 'report.md'), 'SECRET-LIKE-CONTENT');
  writeFileSync(path.join(archive, 'wiki', 'note.md'), 'wiki content');
  try {
    const result = mod.runPdProjectCommand({ command: 'artifacts', projectId: 'pp-artifacts-test' });
    assert.equal(result.ok, true);
    assert.match(result.summary, /agents\.output\/qa\/report\.md size=19/);
    assert.match(result.summary, /wiki\/note\.md size=12/);
    assert.doesNotMatch(result.summary, /SECRET-LIKE-CONTENT/);
    assert.doesNotMatch(result.summary, /state\/project-archives/);
  } finally {
    rmSync(archive, { recursive: true, force: true });
  }
});

test('runPdProjectCommand artifacts blocks dot project id and archive symlink escapes', () => {
  assert.equal(mod.runPdProjectCommand({ command: 'artifacts', projectId: '.' }).ok, false);
  const archive = path.join(process.cwd(), 'state', 'project-archives', 'pp-artifacts-symlink');
  const outside = mkdtempSync(path.join(os.tmpdir(), 'pidex-artifacts-outside-'));
  mkdirSync(path.join(outside, 'agents.output'), { recursive: true });
  writeFileSync(path.join(outside, 'agents.output', 'secret.md'), 'SECRET-LIKE-CONTENT');
  try {
    rmSync(archive, { recursive: true, force: true });
    symlinkSync(outside, archive, 'dir');
    const result = mod.runPdProjectCommand({ command: 'artifacts', projectId: 'pp-artifacts-symlink' });
    assert.equal(result.ok, true);
    assert.doesNotMatch(result.summary, /secret\.md/);
    assert.doesNotMatch(result.summary, /SECRET-LIKE-CONTENT/);
  } finally {
    rmSync(archive, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('buildPdProjectCommandFromToolParams maps read-only tool commands and rejects unsupported actions', () => {
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'status' }), { command: 'status' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'status', projectId: 'pp-demo' }), { command: 'status', projectId: 'pp-demo' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'diagnose', projectId: 'pp-demo' }), { command: 'diagnose', projectId: 'pp-demo' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'runs', projectId: 'pp-demo' }), { command: 'runs', projectId: 'pp-demo' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'show-run', projectId: 'pp-demo', runId: 'pprun-1' }), { command: 'show-run', projectId: 'pp-demo', runId: 'pprun-1' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'artifacts', projectId: 'pp-demo' }), { command: 'artifacts', projectId: 'pp-demo' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'credentials-status', projectId: 'pp-demo' }), { command: 'credentials', action: 'status', projectId: 'pp-demo' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'preview-status', projectId: 'pp-demo' }), { command: 'preview', action: 'status', projectId: 'pp-demo' });
  assert.deepEqual(mod.buildPdProjectCommandFromToolParams({ command: 'preview-logs', projectId: 'pp-demo' }), { command: 'preview', action: 'logs', projectId: 'pp-demo' });
  assert.throws(() => mod.buildPdProjectCommandFromToolParams({ command: 'diagnose' }), /requires projectId/);
  assert.throws(() => mod.buildPdProjectCommandFromToolParams({ command: 'show-run', projectId: 'pp-demo' }), /requires runId/);
  assert.throws(() => mod.buildPdProjectCommandFromToolParams({ command: 'repair', projectId: 'pp-demo' }), /unsupported pidex_project command/);
});

test('pidex_project tool executes Project Pipeline status through no-Bash helper path', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-project-tool-helper-'));
  const helper = path.join(dir, 'status.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: true, projects: [{ project_id: 'pp-demo', status: 'ready', source: { kind: 'local' }, credentials: { pi: 'present', git: 'missing' }, docker_health: { container: { exists: true, status: 'running' } }, archive: { path: 'C:/Users/Demo/pidex/state/project-archives/pp-demo' }, runs: [] }] }));\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
const mod = await import('./extensions/pidex/index.ts');
const tools = new Map();
mod.default({
  on: () => {},
  registerCommand: () => {},
  registerTool: (tool) => tools.set(tool.name, tool),
  sendUserMessage: () => {},
});
const tool = tools.get('pidex_project');
const result = await tool.execute('call-1', { command: 'status', projectId: 'pp-demo' }, undefined, undefined, { cwd: process.cwd() });
console.log(JSON.stringify({ names: [...tools.keys()], result }));
`], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_CHILD: '0', PIDEX_PROJECT_PIPELINE_STATUS_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout.trim().split(/\n/).at(-1));
    assert.equal(parsed.names.includes('pidex_project'), true);
    assert.equal(parsed.names.includes('pidex_agent'), true);
    assert.equal(parsed.result.details.ok, true);
    assert.match(parsed.result.content[0].text, /pp-demo: status=ready/);
    assert.match(parsed.result.content[0].text, /docker=running/);
    assert.doesNotMatch(parsed.result.content[0].text, /SECRET-LIKE|auth\.json|pidex-secrets/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pidex_agent direct Project Pipeline call uses run-agent helper and never host fallback', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-project-agent-helper-'));
  const helper = path.join(dir, 'run-agent.mjs');
  writeFileSync(helper, `console.log(JSON.stringify({ ok: true, project_run_id: 'pprun-direct', context_file: 'agents.output/parallel-agents/review.md', archive_context_file: '/archive/review.md', routing_recovered: false, write_fence: { status: 'complete' }, routing: { verdict: 'COMPLETE', route_to: 'orchestrator', reason: 'done', context_file: 'agents.output/parallel-agents/review.md' } }));\n`);
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
const mod = await import('./extensions/pidex/index.ts');
const tools = new Map();
mod.default({ on: () => {}, registerCommand: () => {}, registerTool: (tool) => tools.set(tool.name, tool), sendUserMessage: () => {} });
const tool = tools.get('pidex_agent');
const result = await tool.execute('call-1', { agent: 'pidex-planner', task: 'plan', cwd: process.cwd(), projectId: 'pp-demo', expectedOutputPath: 'agents.output/parallel-agents/review.md', provider: 'pi', model: 'deepseek/model' }, undefined, undefined, { cwd: process.cwd() });
console.log(JSON.stringify(result));
`], { cwd: process.cwd(), env: { ...process.env, PIDEX_CHILD: '0', PIDEX_PROJECT_PIPELINE_RUN_AGENT_SCRIPT: helper }, encoding: 'utf8' });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout.trim().split(/\n/).at(-1));
    assert.equal(parsed.details.no_fallback, true);
    assert.equal(parsed.details.project_run_id, 'pprun-direct');
    assert.match(parsed.content[0].text, /complete in \/workspace/);
    assert.match(parsed.content[0].text, /context_file=agents\.output\/parallel-agents\/review\.md/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('runProjectPipelineAgentTool rejects missing Project Pipeline identity fields', () => {
  assert.throws(() => mod.runProjectPipelineAgentTool({ agent: 'pidex-critic', task: 'review' }), /require projectId/);
  assert.throws(() => mod.runProjectPipelineAgentTool({ agent: 'pidex-critic', task: 'review', projectId: 'pp-demo' }), /expectedOutputPath/);
  assert.throws(() => mod.runProjectPipelineAgentTool({ agent: 'pidex-critic', task: 'review', projectId: 'pp-demo', expectedOutputPath: 'agents.output/x.md' }), /expectedInputPath/);
});

test('runPdProjectCommand summarizes project runs without raw metadata', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-runs-helper-'));
  const helper = path.join(dir, 'status.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: true, projects: [{ project_id: 'pp-demo', runs: [{ project_run_id: 'pprun-1', agent: 'pidex-qa', archive_sync_status: 'complete', exit_code: 0, context_file: 'agents.output/qa/report.md', archive_context_file: '/tmp/archive/agents.output/qa/report.md', started_at: '2026-06-19T00:00:00.000Z', ended_at: '2026-06-19T00:00:01.000Z', finalText: 'SECRET-LIKE' }, { project_run_id: 'pprun-2', context_file: '../secret', archive_sync_status: 'failed' }] }] }));\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'runs', projectId: 'pp-demo' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_STATUS_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.match(parsed.summary, /run=pprun-1/);
    assert.match(parsed.summary, /agent=pidex-qa/);
    assert.match(parsed.summary, /context=agents\.output\/qa\/report\.md/);
    assert.match(parsed.summary, /status=complete/);
    assert.doesNotMatch(parsed.summary, /SECRET-LIKE/);
    assert.doesNotMatch(parsed.summary, /\/tmp\/archive/);
    assert.doesNotMatch(parsed.summary, /\.\.\/secret/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPdProjectCommand diagnoses Project Pipeline without Bash or raw helper output', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-diagnose-helper-'));
  const helper = path.join(dir, 'status.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: true, projects: [{ project_id: 'pp-demo', name: 'Demo Project', status: 'running', source: { kind: 'local', ref: 'C:/work/demo' }, archive: { path: 'C:/Users/Daniel/pidex/state/project-archives/pp-demo' }, credentials: { pi: 'present', git: 'missing' }, docker_health: { container: { exists: true, status: 'running' }, volumes: { workspace: { exists: true }, secrets: { exists: true }, cache: { exists: true } } }, runs: [{ project_run_id: 'pprun-1' }] }] }));\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'diagnose', projectId: 'pp-demo' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_STATUS_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.match(parsed.summary, /Project Pipeline diagnosis for pp-demo/);
    assert.match(parsed.summary, /docker: container=running/);
    assert.match(parsed.summary, /No-Bash note/);
    assert.match(parsed.summary, /node dashboard\/start\.mjs/);
    assert.match(parsed.summary, /\/pdproject status pp-demo/);
    assert.doesNotMatch(parsed.summary, /SECRET-LIKE|auth\.json|pidex-secrets/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPdProjectCommand shows one run with allowlisted metadata only', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-show-run-helper-'));
  const helper = path.join(dir, 'status.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: true, projects: [{ project_id: 'pp-demo', runs: [{ project_run_id: 'pprun-1', agent: 'pidex-qa', archive_sync_status: 'complete', exit_code: 0, context_file: 'agents.output/qa/report.md', archive_context_file: '/tmp/archive/agents.output/qa/report.md', started_at: '2026-06-19T00:00:00.000Z', ended_at: '2026-06-19T00:00:01.000Z', finalText: 'SECRET-LIKE', credential_inventory_hash: 'sha256:secret' }] }] }));\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'show-run', projectId: 'pp-demo', runId: 'pprun-1' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_STATUS_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.match(parsed.summary, /run=pprun-1/);
    assert.match(parsed.summary, /agent=pidex-qa/);
    assert.match(parsed.summary, /context=agents\.output\/qa\/report\.md/);
    assert.match(parsed.summary, /archive_context=available/);
    assert.doesNotMatch(parsed.summary, /SECRET-LIKE/);
    assert.doesNotMatch(parsed.summary, /sha256:secret/);
    assert.doesNotMatch(parsed.summary, /\/tmp\/archive/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPdProjectCommand omits raw status helper output on runs parse failure', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-runs-bad-helper-'));
  const helper = path.join(dir, 'status.mjs');
  writeFileSync(helper, "console.log('finalText=SECRET-LIKE sha256:secret /pidex-secrets/pi/agent/auth.json ~/.pi/agent/auth.json /home/user/project'); process.exit(1);\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'runs', projectId: 'pp-demo' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_STATUS_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.summary, /helper output omitted/);
    assert.doesNotMatch(parsed.summary, /SECRET-LIKE/);
    assert.doesNotMatch(parsed.summary, /sha256:secret/);
    assert.doesNotMatch(parsed.summary, /auth\.json/);
    assert.doesNotMatch(parsed.summary, /pidex-secrets/);
    assert.doesNotMatch(parsed.summary, /\/home\/user/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPdProjectCommand fails closed when status helper is missing', () => {
  const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'status' })));"], {
    cwd: process.cwd(),
    env: { ...process.env, PIDEX_PROJECT_PIPELINE_STATUS_SCRIPT: '/tmp/pidex-missing-project-status.mjs' },
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.summary, /status helper missing/);
  assert.doesNotMatch(parsed.summary, /\/tmp\/pidex-missing-project-status/);
});

test('runPdProjectCommand omits raw credential helper output on reset failure', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-creds-helper-'));
  const helper = path.join(dir, 'credentials.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: false, reason: 'failed for ~/.pi/auth.json sha256:secret /pidex-secrets/pi/agent/auth.json', credentials: { inventory: [{ fingerprint: 'sha256:secret', source_label: '~/.pi/auth.json', destination: '/pidex-secrets/pi/agent/auth.json' }] } })); process.exit(1);\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'credentials', action: 'reset', projectId: 'pp-demo', confirm: 'pp-demo' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_CREDENTIALS_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.summary, /credentials reset failed/);
    assert.doesNotMatch(parsed.summary, /sha256:secret/);
    assert.doesNotMatch(parsed.summary, /auth\.json/);
    assert.doesNotMatch(parsed.summary, /pidex-secrets/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPdProjectCommand fails closed when credentials helper is missing', () => {
  const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'credentials', action: 'status', projectId: 'pp-demo' })));"], {
    cwd: process.cwd(),
    env: { ...process.env, PIDEX_PROJECT_PIPELINE_CREDENTIALS_SCRIPT: '/tmp/pidex-missing-project-credentials.mjs' },
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.summary, /credentials helper missing/);
});

test('runPdProjectCommand summarizes repair without raw helper details', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-life-helper-'));
  const helper = path.join(dir, 'lifecycle.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: false, reason: 'missing-volumes', missing_volumes: ['workspace'], record: { project_id: 'pp-demo', repair: { reason: 'SECRET-LIKE /home/user/project /pidex-secrets/pi/auth.json' } } })); process.exit(1);\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'repair', projectId: 'pp-demo', confirm: 'pp-demo' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_LIFECYCLE_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.summary, /repair failed/);
    assert.match(parsed.summary, /missing_volumes=workspace/);
    assert.doesNotMatch(parsed.summary, /SECRET-LIKE/);
    assert.doesNotMatch(parsed.summary, /\/home\/user/);
    assert.doesNotMatch(parsed.summary, /pidex-secrets/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPdProjectCommand omits raw lifecycle helper output on repair parse failure', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-life-bad-helper-'));
  const helper = path.join(dir, 'lifecycle.mjs');
  writeFileSync(helper, "console.log('SECRET-LIKE /home/user/project /pidex-secrets/pi/auth.json sha256:secret'); process.exit(1);\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'repair', projectId: 'pp-demo', confirm: 'pp-demo' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_LIFECYCLE_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.summary, /helper output omitted/);
    assert.doesNotMatch(parsed.summary, /SECRET-LIKE/);
    assert.doesNotMatch(parsed.summary, /\/home\/user/);
    assert.doesNotMatch(parsed.summary, /pidex-secrets/);
    assert.doesNotMatch(parsed.summary, /sha256:secret/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runPdProjectCommand fails closed when lifecycle helper is missing', () => {
  const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'repair', projectId: 'pp-demo', confirm: 'pp-demo' })));"], {
    cwd: process.cwd(),
    env: { ...process.env, PIDEX_PROJECT_PIPELINE_LIFECYCLE_SCRIPT: '/tmp/pidex-missing-project-lifecycle.mjs' },
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.summary, /lifecycle helper missing/);
  assert.doesNotMatch(parsed.summary, /\/tmp\/pidex-missing-project-lifecycle/);
});

test('runProjectPipelineRunFlow fails closed on missing initial task', () => {
  const result = mod.runProjectPipelineRunFlow({ projectRoot: process.cwd(), task: '   ' });
  assert.equal(result.ok, false);
  assert.equal(result.no_fallback, true);
  assert.match(result.error, /requires an initial task/);
});

test('buildProjectPipelineRunFlowArgs requires explicit credential acknowledgement', () => {
  assert.throws(() => mod.buildProjectPipelineRunFlowArgs({ projectRoot: process.cwd(), task: 'x', copyPiCredentials: true }), /acknowledgement/);
});

test('runProjectPipelineRunFlow redacts orchestrator failure output', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-orch-helper-'));
  const helper = path.join(dir, 'orchestrator.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: false, no_fallback: true, error: 'agent-run-failed', failed_agent: 'pidex-qa', credentials: { inventory: [{ fingerprint: 'sha256:secret', source_label: '~/.pi/agent/auth.json', destination: '/pidex-secrets/pi/agent/auth.json' }] }, runs: [{ agent: 'pidex-qa', ok: false, reason: 'SECRET-LIKE-CHILD-OUTPUT', error: 'child-pi-failed' }] })); process.exit(1);\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runProjectPipelineRunFlow({ projectRoot: process.cwd(), task: 'x' })));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_ORCHESTRATOR_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    const serialized = JSON.stringify(parsed);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /agent-run-failed/);
    assert.match(parsed.error, /failed_agent=pidex-qa/);
    assert.doesNotMatch(serialized, /sha256:secret/);
    assert.doesNotMatch(serialized, /auth\.json/);
    assert.doesNotMatch(serialized, /pidex-secrets/);
    assert.doesNotMatch(serialized, /SECRET-LIKE-CHILD-OUTPUT/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runProjectPipelineRunFlow fails closed when orchestrator helper is missing', () => {
  const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runProjectPipelineRunFlow({ projectRoot: process.cwd(), task: 'x' })));"], {
    cwd: process.cwd(),
    env: { ...process.env, PIDEX_PROJECT_PIPELINE_ORCHESTRATOR_SCRIPT: '/tmp/pidex-missing-orchestrator.mjs' },
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.no_fallback, true);
  assert.match(parsed.error, /orchestrator helper missing/);
});

test('runProjectPipelineModeResolver redacts helper parse failures', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-mode-helper-'));
  const helper = path.join(dir, 'mode.mjs');
  writeFileSync(helper, "console.log('not-json C:/Users/Daniel/.pi/agent/auth.json docker create /pidex-secrets SECRET-LIKE-TOKEN'); process.exit(1);\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runProjectPipelineModeResolver(process.cwd())));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_MODE_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.decision_required, true);
    assert.match(parsed.reason, /helper output omitted/);
    assert.doesNotMatch(parsed.reason, /Daniel|auth\.json|pidex-secrets|SECRET-LIKE|docker create/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runProjectPipelineModeResolver fails closed even when nonzero helper prints ok true', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-mode-nonzero-'));
  const helper = path.join(dir, 'mode.mjs');
  writeFileSync(helper, "console.log(JSON.stringify({ ok: true, mode: 'project-pipeline', no_fallback: true })); process.exit(1);\n");
  try {
    const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runProjectPipelineModeResolver(process.cwd())));"], {
      cwd: process.cwd(),
      env: { ...process.env, PIDEX_PROJECT_PIPELINE_MODE_SCRIPT: helper },
      encoding: 'utf8'
    });
    assert.equal(proc.status, 0, proc.stderr);
    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.decision_required, true);
    assert.match(parsed.reason, /mode resolver failed exit=1/);
    assert.notEqual(parsed.mode, 'project-pipeline');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runProjectPipelineModeResolver fails closed when helper is missing', () => {
  const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runProjectPipelineModeResolver(process.cwd())));"], {
    cwd: process.cwd(),
    env: { ...process.env, PIDEX_PROJECT_PIPELINE_MODE_SCRIPT: '/tmp/pidex-missing-mode-resolver.mjs' },
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.decision_required, true);
  assert.match(parsed.reason, /mode resolver missing/);
  assert.notEqual(parsed.mode, 'host-direct');
});
