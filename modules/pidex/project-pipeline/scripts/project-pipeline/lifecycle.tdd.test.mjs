import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { containerCreateArgs, createProjectSandbox, dockerLabels, openProjectSandbox, removeArgs, removeProjectSandbox, volumeCreateArgs } from './lifecycle.mjs';
import { createProjectRecord, loadProjectRecord, saveProjectRecord } from './registry.mjs';

function tmpRoot() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-pipeline-life-')); }
function callsRunner(calls, failOn = () => false) {
  return (args) => {
    calls.push(args);
    if (failOn(args)) throw new Error(`planned failure: ${args.join(' ')}`);
    return 'ok\n';
  };
}

test('dockerLabels include project sandbox labels', () => {
  assert.deepEqual(dockerLabels('pp-demo-abc123', 'workspace'), [
    'pidex.sandbox=true',
    'pidex.project_sandbox=true',
    'pidex.project_id=pp-demo-abc123',
    'pidex.kind=workspace',
  ]);
});

test('containerCreateArgs use hardened baseline and named volumes only', () => {
  const record = createProjectRecord({ project_id: 'pp-demo-abc123', name: 'demo' });
  const args = containerCreateArgs(record);
  assert.equal(args.includes('--privileged'), false);
  assert.equal(args.includes('/var/run/docker.sock'), false);
  assert.equal(args.includes('--cap-drop'), true);
  assert.equal(args.includes('ALL'), true);
  assert.equal(args.includes('no-new-privileges'), true);
  assert.equal(args.some((arg) => String(arg).includes('source=pidex-project-pp-demo-abc123-workspace,target=/workspace')), true);
  assert.equal(args.some((arg) => String(arg).includes('/home/')), false);
});

test('createProjectSandbox creates volumes then container and saves ready record', () => {
  const root = tmpRoot();
  const calls = [];
  const result = createProjectSandbox({ pidexRoot: root, name: 'Demo', projectId: 'pp-demo-abc123', runner: callsRunner(calls) });
  assert.equal(result.ok, true);
  assert.equal(result.record.status, 'ready');
  assert.equal(calls[0][0], 'volume');
  assert.equal(calls[0].at(-1), 'pidex-project-pp-demo-abc123-workspace');
  assert.equal(calls[3][0], 'create');
  assert.equal(calls[4][0], 'start');
  const loaded = loadProjectRecord(root, 'pp-demo-abc123');
  assert.equal(loaded.archive.path.endsWith(path.join('state', 'project-archives', 'pp-demo-abc123')), true);
});

test('createProjectSandbox records needs-repair on partial failure', () => {
  const root = tmpRoot();
  const calls = [];
  const result = createProjectSandbox({ pidexRoot: root, name: 'Demo', projectId: 'pp-demo-fail1', runner: callsRunner(calls, (args) => args[0] === 'create') });
  assert.equal(result.ok, false);
  assert.equal(result.record.status, 'needs-repair');
  assert.equal(result.created.length, 3);
  const loaded = loadProjectRecord(root, 'pp-demo-fail1');
  assert.equal(loaded.status, 'needs-repair');
  assert.match(loaded.repair.reason, /planned failure/);
});

test('openProjectSandbox starts existing container and records container-missing on failure', () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-open1', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(root, record);
  const calls = [];
  assert.equal(openProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-open1', runner: callsRunner(calls) }).ok, true);
  assert.deepEqual(calls[0], ['start', 'pidex-project-pp-demo-open1']);
  const failed = openProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-open1', runner: callsRunner([], () => true) });
  assert.equal(failed.ok, false);
  assert.equal(failed.record.status, 'container-missing');
});

test('removeProjectSandbox requires exact confirmation and removes only project resources', () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-rm123', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(root, record);
  assert.throws(() => removeProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-rm123', confirm: 'wrong', runner: callsRunner([]) }), /refusing to remove/);
  const calls = [];
  const result = removeProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-rm123', confirm: 'pp-demo-rm123', runner: callsRunner(calls) });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], ['rm', '-f', 'pidex-project-pp-demo-rm123']);
  assert.equal(calls.filter((args) => args[0] === 'volume' && args[1] === 'rm').length, 3);
});
