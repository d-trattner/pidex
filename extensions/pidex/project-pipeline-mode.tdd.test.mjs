import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

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

test('projectPipelineModeInstructionLine points project-pipeline to run-flow facade', () => {
  const line = mod.projectPipelineModeInstructionLine({ ok: true, mode: 'project-pipeline', no_fallback: true });
  assert.match(line, /project-pipeline\.run-flow/);
  assert.match(line, /do not fall back/);
  assert.match(line, /do not mirror source/);
});

test('buildProjectPipelineRunFlowArgs constructs fail-closed planner run-flow request', () => {
  const built = mod.buildProjectPipelineRunFlowArgs({ projectRoot: process.cwd(), task: 'ship the thing', copyPiCredentials: true, acknowledgeTrustedPersistentContainer: true });
  assert.match(built.projectId, /^pp-/);
  assert.equal(built.args[0].endsWith(['modules', 'pidex', 'project-pipeline', 'scripts', 'project-pipeline', 'run-flow.mjs'].join('/')), true);
  assert.equal(built.args.includes('--source'), true);
  assert.equal(built.args.includes(process.cwd()), true);
  assert.equal(built.args.includes('--agent'), true);
  assert.equal(built.args.includes('pidex-planner'), true);
  assert.equal(built.args.includes('--acknowledge-trusted-persistent-container'), true);
  assert.match(built.args[built.args.indexOf('--task') + 1], /Do not run host-direct or hardened-pipeline fallback/);
});

test('shouldStartProjectPipelineRunFlow selects only explicit project-pipeline mode', () => {
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: true, mode: 'project-pipeline' }), true);
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: true, mode: 'host-direct' }), false);
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: true, mode: 'hardened-pipeline' }), false);
  assert.equal(mod.shouldStartProjectPipelineRunFlow({ ok: false, decision_required: true }), false);
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

test('runProjectPipelineRunFlow fails closed when helper is missing', () => {
  const proc = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', "const mod = await import('./extensions/pidex/index.ts'); console.log(JSON.stringify(mod.runProjectPipelineRunFlow({ projectRoot: process.cwd(), task: 'x' })));"], {
    cwd: process.cwd(),
    env: { ...process.env, PIDEX_PROJECT_PIPELINE_RUN_FLOW_SCRIPT: '/tmp/pidex-missing-run-flow.mjs' },
    encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.no_fallback, true);
  assert.match(parsed.error, /run-flow helper missing/);
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
