import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('buildProjectPipelineRunFlowArgs constructs fail-closed orchestrator request', () => {
  const built = mod.buildProjectPipelineRunFlowArgs({ projectRoot: process.cwd(), task: 'ship the thing', copyPiCredentials: true, acknowledgeTrustedPersistentContainer: true });
  assert.match(built.projectId, /^pp-/);
  assert.equal(built.args[0].endsWith(['modules', 'pidex', 'project-pipeline', 'scripts', 'project-pipeline', 'orchestrator.mjs'].join('/')), true);
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
  assert.deepEqual(mod.parsePdProjectArgs('status'), { command: 'status', projectId: undefined });
  assert.deepEqual(mod.parsePdProjectArgs('status pp-demo'), { command: 'status', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('runs pp-demo'), { command: 'runs', projectId: 'pp-demo' });
  assert.deepEqual(mod.parsePdProjectArgs('runs --project-id pp-demo'), { command: 'runs', projectId: 'pp-demo' });
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

test('runPdProjectCommand fails closed when lifecycle helper is missing', () => {
  const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runPdProjectCommand({ command: 'open', projectId: 'pp-demo' })));"], {
    cwd: process.cwd(),
    env: { ...process.env, PIDEX_PROJECT_PIPELINE_LIFECYCLE_SCRIPT: '/tmp/pidex-missing-project-lifecycle.mjs' },
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.summary, /lifecycle helper missing/);
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
