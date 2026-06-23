import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mod = await import('./index.ts');

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

test('chooseProjectPipelineMode saves selected project-pipeline mode and preserves credential boundary', async () => {
  const calls = [];
  const notifications = [];
  const ctx = {
    ui: {
      select: async () => 'project-pipeline',
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
  const result = await mod.chooseProjectPipelineMode({ ui: { select: async () => 'Cancel', notify: async () => { throw new Error('notify should not run'); } } }, process.cwd(), {
    saveMode: () => { saveCalled = true; return { ok: true, mode: 'project-pipeline' }; },
  });
  assert.equal(result, undefined);
  assert.equal(saveCalled, false);
});

test('listRecentPidexProjects returns newest unique existing project directories', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-history-'));
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
  ].join('\n'));
  try {
    const recent = mod.listRecentPidexProjects(5, state);
    assert.deepEqual(recent.map((item) => item.cwd), [olderProject, newerProject]);
    assert.equal(recent[0].last_event, 'complete');
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
    select: async (message) => message.includes('Choose PIDEX mode') ? 'project-pipeline' : 'Current directory: ' + process.env.PIDEX_TEST_PROJECT_ROOT,
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
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /Project Pipeline run-flow complete for pp-seam/);
    const argv = parsed.recorded.argv;
    assert.match(argv[argv.indexOf('--task') + 1], /Initial user task: ship same task/);
    assert.equal(argv.includes('--pi-auth'), false);
    assert.equal(argv.includes('--acknowledge-trusted-persistent-container'), false);
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
    assert.match(parsed.notifications.map((item) => item.message).join('\n'), /project selection required/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('/pd chooses recent project before resolving mode and project-pipeline source', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pidex-pd-recent-'));
  const startRoot = path.join(dir, 'start-here');
  const selectedRoot = path.join(dir, 'selected-project');
  const state = path.join(dir, 'state');
  mkdirSync(startRoot);
  mkdirSync(selectedRoot);
  mkdirSync(state);
  writeFileSync(path.join(state, 'history.jsonl'), `${JSON.stringify({ cwd: selectedRoot, ts: '2026-06-01T00:00:00Z', event: 'complete', mode: 'project-pipeline' })}\n`);
  const modeHelper = path.join(dir, 'mode.mjs');
  const orchestratorHelper = path.join(dir, 'orchestrator.mjs');
  const recorder = path.join(dir, 'record.json');
  writeFileSync(modeHelper, `
import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
appendFileSync(process.env.PIDEX_TEST_RECORDER, JSON.stringify({ kind: 'mode', projectRoot: argv[argv.indexOf('--project-root') + 1], mode: argv.includes('--mode') ? argv[argv.indexOf('--mode') + 1] : null }) + '\\n');
if (!argv.includes('--mode')) console.log(JSON.stringify({ ok: false, decision_required: true, reason: 'missing saved mode', no_fallback: true }));
else console.log(JSON.stringify({ ok: true, mode: argv[argv.indexOf('--mode') + 1], no_fallback: true }));
`);
  writeFileSync(orchestratorHelper, `
import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
appendFileSync(process.env.PIDEX_TEST_RECORDER, JSON.stringify({ kind: 'orchestrator', source: argv[argv.indexOf('--source') + 1], task: argv[argv.indexOf('--task') + 1] }) + '\\n');
console.log(JSON.stringify({ ok: true, no_fallback: true, lifecycle: { record: { project_id: 'pp-recent' } }, final_context_file: 'agents.output/qa/recent.md', runs: [{ agent: 'pidex-qa', ok: true, context_file: 'agents.output/qa/recent.md', archive_sync_status: 'complete' }] }));
`);
  try {
    const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
const mod = await import('./extensions/pidex/index.ts');
const commands = new Map();
mod.default({ on: () => {}, registerTool: () => {}, registerCommand: (name, spec) => commands.set(name, spec), sendUserMessage: () => { throw new Error('host kickoff should not run'); } });
await commands.get('pd').handler('do selected project work', {
  cwd: process.env.PIDEX_TEST_START_ROOT,
  hasUI: true,
  ui: {
    select: async (message, options) => message.includes('Choose PIDEX project') ? options[0] : 'project-pipeline',
    notify: async () => {},
  },
});
`], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PIDEX_CHILD: '0',
        PIDEX_PROJECT_PIPELINE_MODE_SCRIPT: modeHelper,
        PIDEX_PROJECT_PIPELINE_ORCHESTRATOR_SCRIPT: orchestratorHelper,
        PIDEX_STATE_DIR: state,
        PIDEX_TEST_RECORDER: recorder,
        PIDEX_TEST_START_ROOT: startRoot,
        PIDEX_PROJECT_PIPELINE_COPY_PI_CREDENTIALS: '0',
      },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const rows = readFileSync(recorder, 'utf8').trim().split(/\n/).map((line) => JSON.parse(line));
    assert.deepEqual(rows.filter((row) => row.kind === 'mode').map((row) => row.projectRoot), [selectedRoot, selectedRoot]);
    const orchestration = rows.find((row) => row.kind === 'orchestrator');
    assert.equal(orchestration.source, selectedRoot);
    assert.match(orchestration.task, /Initial user task: do selected project work/);
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
      runs: [{ archive_sync_status: 'complete' }],
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
