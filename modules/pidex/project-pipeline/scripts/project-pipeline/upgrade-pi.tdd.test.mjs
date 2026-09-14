import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createProjectRecord, saveProjectRecord, projectFile } from './registry.mjs';
import { upgradeProjectPi, parseUpgradeArgs, targetPiVersion } from './upgrade-pi.mjs';
import { maintenanceSummary, maintenancePaths, withProjectPiLease, readMaintenanceReceipt, writeMaintenanceReceipt } from './pi-maintenance.mjs';
import { runProjectPipelineAgent } from './run-agent.mjs';
import { runProjectPipelineOrchestration } from './orchestrator.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'pidex-pi-upgrade-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const record = createProjectRecord({ project_id: 'pp-demo', name: 'demo' });
  record.runs = [{ project_run_id: 'old-failure', started_at: '2026-09-14', ended_at: '2026-09-14', exit_code: 1, error: 'child-pi-failed' }];
  saveProjectRecord(root, record);
  mkdirSync(maintenancePaths(root, 'pp-demo').dir, { recursive: true });
  const inspect = { Id: 'a'.repeat(64), Name: `/${record.docker.container_name}`, Path: 'sleep', Args: ['infinity'], State: { Running: true, Paused: false }, Config: { Env: ['PIDEX_PROJECT_PIPELINE_CONTAINER=1'], Labels: { 'pidex.project_id': record.project_id, 'pidex.kind': 'project-container', 'pidex.project_sandbox': 'true' } }, Mounts: Object.entries({ '/workspace': record.docker.workspace_volume, '/pidex-secrets': record.docker.secrets_volume, '/cache': record.docker.cache_volume }).map(([Destination, Name]) => ({ Destination, Name, Type: 'volume', RW: true })) };
  const state = { version: '0.80.3', rows: 'PID COMMAND\n1 sleep\n', result: 'verified' };
  const calls = [];
  const options = { pidexRoot: root, projectId: 'pp-demo', confirm: 'pp-demo', runner(args) {
    calls.push(args);
    if (args[0] === 'inspect') return { status: 0, stdout: JSON.stringify([inspect]) };
    if (args[0] === 'top') return { status: 0, stdout: state.rows };
    assert.equal(args[0], 'exec');
    assert.equal(args[5], inspect.Id, 'exec must target immutable container ID');
    if (args.includes('--input-type=module')) {
      if (state.result === 'malformed') return { status: 1, stdout: 'SECRET-LIKE raw stderr' };
      const before = state.version;
      if (state.result === 'verified') state.version = targetPiVersion();
      return { status: state.result === 'verified' ? 0 : 1, stdout: JSON.stringify({ status: state.result, before, after: state.version }) };
    }
    return { status: 0, stdout: state.version + '\n' };
  } };
  return { root, record, inspect, state, calls, options };
}

const installs = f => f.calls.filter(a => a.includes('--input-type=module'));

test('exact confirmation and immutable build pin, strict CLI parsing', () => {
  assert.equal(targetPiVersion(), '0.85.1');
  assert.equal(upgradeProjectPi({ projectId: 'pp-demo', confirm: 'other' }).error, 'confirmation-required');
  assert.throws(() => parseUpgradeArgs(['--pidex-root', '/tmp', '--project-id', 'pp-demo', '--confirm', 'pp-demo', '--version', 'latest']));
  assert.throws(() => parseUpgradeArgs(['--pidex-root', '/tmp', '--project-id', 'pp-demo', '--confirm', 'pp-demo', '--confirm', 'pp-demo']));
});

test('verified in-place upgrade preserves registry/run bytes; repeat is a no-op', t => {
  const f = fixture(t), before = readFileSync(projectFile(f.root, 'pp-demo'));
  const result = upgradeProjectPi(f.options);
  assert.deepEqual(result, { ok: true, status: 'verified', before: '0.80.3', after: '0.85.1', target: '0.85.1', changed: true });
  assert.deepEqual(readFileSync(projectFile(f.root, 'pp-demo')), before);
  assert.equal(installs(f).length, 1);
  assert.equal(upgradeProjectPi(f.options).changed, false);
  assert.equal(installs(f).length, 1);
  assert.equal(f.calls.some(a => ['rm', 'stop', 'restart', 'build', 'run', 'volume'].includes(a[0])), false);
});

for (const [name, mutate] of [
  ['unsafe runtime environment', f => { f.inspect.Config.Env = ['NODE_OPTIONS=--require=/workspace/evil.js']; }],
  ['wrong label', f => { f.inspect.Config.Labels['pidex.project_id'] = 'pp-other'; }],
  ['wrong mount', f => { f.inspect.Mounts[0].Name = 'other'; }],
  ['runtime overlay', f => { f.inspect.Mounts.push({ Type: 'bind', Destination: '/usr/local' }); }],
  ['paused', f => { f.inspect.State.Paused = true; }],
  ['busy container', f => { f.state.rows += '2 node\n'; }],
  ['unsettled run', f => { delete f.record.runs[0].ended_at; saveProjectRecord(f.root, f.record); }],
]) test(`upgrade denies ${name} before install`, t => {
  const f = fixture(t); mutate(f);
  assert.equal(upgradeProjectPi(f.options).ok, false);
  assert.equal(installs(f).length, 0);
});

for (const outcome of ['failed_unchanged', 'rolled_back', 'held', 'malformed']) test(`upgrade preserves ${outcome} truth and blocks uncertain continuation`, t => {
  const f = fixture(t); f.state.result = outcome;
  const result = upgradeProjectPi(f.options);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  const receipt = readMaintenanceReceipt(maintenancePaths(f.root, 'pp-demo'));
  assert.equal(receipt.status, outcome === 'malformed' ? 'held' : outcome);
  if (['malformed', 'held'].includes(outcome)) {
    const count = f.calls.length;
    assert.equal(upgradeProjectPi(f.options).error, 'pi-maintenance-held');
    assert.equal(f.calls.length, count);
    assert.throws(() => runProjectPipelineAgent(f.options), /pi-maintenance-held/);
  }
});

test('lease covers async orchestration and direct dispatch, allows only owned nesting', async t => {
  const f = fixture(t);
  await withProjectPiLease(f.options, async () => {
    await Promise.resolve();
    assert.equal(withProjectPiLease(f.options, () => 42), 42);
    assert.equal(upgradeProjectPi(f.options).error, 'project-execution-busy');
    const code = `import {withProjectPiLease} from ${JSON.stringify(new URL('./pi-maintenance.mjs', import.meta.url).href)}; try {withProjectPiLease(${JSON.stringify({ pidexRoot: f.root, projectId: 'pp-demo' })},()=>{});} catch(e){console.log(e.message);process.exitCode=3;}`;
    const other = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    assert.equal(other.status, 3);
    assert.match(other.stdout, /project-execution-busy/);
  });
  assert.equal(existsSync(maintenancePaths(f.root, 'pp-demo').lock), false);
  const paths = maintenancePaths(f.root, 'pp-demo');
  writeMaintenanceReceipt(paths, { status: 'in_progress', project_id: 'pp-demo' });
  await assert.rejects(runProjectPipelineOrchestration(f.options), /pi-maintenance-held/);
  assert.equal(f.calls.length, 0);
});

test('failed disposition publication retains the owned lease after a possible runtime mutation', t => {
  const f = fixture(t), paths = maintenancePaths(f.root, 'pp-demo'), runner = f.options.runner;
  f.options.runner = (args, opts) => {
    const result = runner(args, opts);
    if (args.includes('--input-type=module')) {
      renameSync(paths.receipt, `${paths.receipt}.saved`);
      mkdirSync(paths.receipt); // fixture-only publication fault, on both POSIX and Windows
    }
    return result;
  };
  assert.equal(upgradeProjectPi(f.options).status, 'held');
  assert.equal(existsSync(paths.lock), true);
  assert.equal(JSON.parse(readFileSync(`${paths.receipt}.saved`, 'utf8')).status, 'in_progress');
  assert.equal(upgradeProjectPi(f.options).error, 'project-execution-busy');
  assert.equal(installs(f).length, 1);
});

test('maintenance diagnostics are read-only and omit receipt internals', t => {
  const f = fixture(t), paths = maintenancePaths(f.root, 'pp-demo');
  rmSync(paths.dir, { recursive: true });
  assert.deepEqual(maintenanceSummary(f.root, 'pp-demo'), { status: 'none', execution_lock: 'absent' });
  assert.equal(existsSync(paths.dir), false);
  upgradeProjectPi(f.options);
  assert.deepEqual(maintenanceSummary(f.root, 'pp-demo'), { status: 'verified', execution_lock: 'absent', before: '0.80.3', after: '0.85.1', target: '0.85.1' });
});

test('unknown locks and malformed receipts are never silently repaired', t => {
  const f = fixture(t), paths = maintenancePaths(f.root, 'pp-demo');
  writeFileSync(paths.lock, 'prior-owner');
  assert.equal(upgradeProjectPi(f.options).error, 'project-execution-busy');
  assert.equal(readFileSync(paths.lock, 'utf8'), 'prior-owner');
  rmSync(paths.lock); // fixture-owned only
  writeFileSync(paths.receipt, '{broken');
  assert.equal(upgradeProjectPi(f.options).ok, false);
  assert.equal(f.calls.length, 0);
  assert.equal(readFileSync(paths.receipt, 'utf8'), '{broken');
});
