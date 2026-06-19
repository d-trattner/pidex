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
