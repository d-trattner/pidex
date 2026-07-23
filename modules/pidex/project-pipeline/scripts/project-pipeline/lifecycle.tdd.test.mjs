import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { containerCreateArgs, createProjectSandbox, dockerLabels, ensurePreviewContainerPublished, openProjectSandbox, repairProjectSandbox, removeArgs, removeProjectSandbox, setProjectTestClassification, volumeCreateArgs } from './lifecycle.mjs';
import { createProjectRecord, loadProjectRecord, saveProjectRecord } from './registry.mjs';
import { resolveProjectPipelineAuthority } from './project-authority.mjs';

function tmpRoot() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-pipeline-life-')); }
function callsRunner(calls, failOn = () => false) {
  return (args) => {
    calls.push(args);
    if (failOn(args)) throw new Error(`planned failure: ${args.join(' ')}`);
    return 'ok\n';
  };
}

test('Project Pipeline authority resolves registered host and archive roots, never caller cwd', () => {
  const root = tmpRoot();
  const host = path.join(root, 'host-source');
  const archive = path.join(root, 'state', 'project-archives', 'pp-authority-archive');
  mkdirSync(host, { recursive: true });
  mkdirSync(archive, { recursive: true });
  const hostRecord = createProjectRecord({ project_id: 'pp-authority-host', name: 'host', source_kind: 'host-path', source_ref: host });
  hostRecord.status = 'ready'; saveProjectRecord(root, hostRecord);
  const archiveRecord = createProjectRecord({ project_id: 'pp-authority-archive', name: 'archive' });
  archiveRecord.status = 'ready'; archiveRecord.archive.path = archive; saveProjectRecord(root, archiveRecord);
  assert.deepEqual(resolveProjectPipelineAuthority({ pidexRoot: root, projectId: 'pp-authority-host' }).projectRoot, host);
  assert.deepEqual(resolveProjectPipelineAuthority({ pidexRoot: root, projectId: 'pp-authority-archive' }).projectRoot, archive);

  const currentHost = path.join(root, 'current-host-source');
  mkdirSync(currentHost);
  const updated = loadProjectRecord(root, 'pp-authority-host');
  updated.source.ref = currentHost;
  saveProjectRecord(root, updated);
  assert.equal(resolveProjectPipelineAuthority({ pidexRoot: root, projectId: 'pp-authority-host', record: hostRecord }).projectRoot, currentHost, 'cached caller record cannot override current registry authority');

  updated.source.ref = 'relative-host-source';
  saveProjectRecord(root, updated);
  assert.throws(() => resolveProjectPipelineAuthority({ pidexRoot: root, projectId: 'pp-authority-host' }), /AUTHORITY_INVALID/);
  updated.source.ref = host;
  saveProjectRecord(root, updated);
  rmSync(host, { recursive: true, force: true });
  assert.throws(() => resolveProjectPipelineAuthority({ pidexRoot: root, projectId: 'pp-authority-host' }), /AUTHORITY_UNAVAILABLE/);
});

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

test('containerCreateArgs publishes assigned preview port range without raw command summaries', () => {
  const record = createProjectRecord({ project_id: 'pp-demo-ports1', name: 'demo' });
  record.preview = { ports: { base: 42000, size: 3, container_base: 42000, host_bind: '127.0.0.1', assigned_at: '2026-06-25T00:00:00.000Z', assigned_by: 'create', generation: 1 } };
  const args = containerCreateArgs(record);
  assert.deepEqual(args.filter((arg, index) => arg === '--publish' ? args[index + 1] : false).map((_, index) => args[args.indexOf('--publish') + 1 + (index * 2)]), ['127.0.0.1:42000:42000', '127.0.0.1:42001:42001', '127.0.0.1:42002:42002']);
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

test('setProjectTestClassification reclassifies an existing project without Docker mutation', () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-classify1', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(root, record);

  const classified = setProjectTestClassification({ pidexRoot: root, projectId: 'pp-demo-classify1', isTestProject: true });
  assert.equal(classified.ok, true);
  assert.equal(classified.previous, false);
  assert.equal(classified.is_test_project, true);
  assert.equal(classified.changed, true);
  assert.equal(loadProjectRecord(root, 'pp-demo-classify1').is_test_project, true);
  assert.equal(loadProjectRecord(root, 'pp-demo-classify1').status, 'ready');

  const restored = setProjectTestClassification({ pidexRoot: root, projectId: 'pp-demo-classify1', isTestProject: false });
  assert.equal(restored.previous, true);
  assert.equal(restored.is_test_project, false);
  assert.throws(() => setProjectTestClassification({ pidexRoot: root, projectId: 'pp-demo-classify1' }), /requires true or false/);
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

test('repairProjectSandbox restarts existing container after exact confirmation', () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-repair1', name: 'demo' });
  record.status = 'container-missing';
  saveProjectRecord(root, record);
  const calls = [];
  const result = repairProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-repair1', confirm: 'pp-demo-repair1', runner: callsRunner(calls) });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'started-container');
  assert.deepEqual(calls.slice(0, 3).map((args) => args.slice(0, 2)), [['volume', 'inspect'], ['volume', 'inspect'], ['volume', 'inspect']]);
  assert.deepEqual(calls[3], ['inspect', 'pidex-project-pp-demo-repair1']);
  assert.deepEqual(calls[4], ['start', 'pidex-project-pp-demo-repair1']);
  assert.equal(loadProjectRecord(root, 'pp-demo-repair1').status, 'ready');
});

test('repairProjectSandbox recreates missing container only when all volumes exist', () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-repair2', name: 'demo' });
  record.status = 'needs-repair';
  saveProjectRecord(root, record);
  const calls = [];
  const result = repairProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-repair2', confirm: 'pp-demo-repair2', runner: callsRunner(calls, (args) => args[0] === 'inspect') });
  assert.equal(result.ok, true);
  assert.equal(result.action, 'recreated-container');
  assert.equal(calls.some((args) => args[0] === 'create'), true);
  assert.equal(calls.at(-1)[0], 'start');
  assert.equal(loadProjectRecord(root, 'pp-demo-repair2').status, 'ready');
});

test('repairProjectSandbox blocks missing volumes and requires exact confirmation', () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-repair3', name: 'demo' });
  saveProjectRecord(root, record);
  assert.throws(() => repairProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-repair3', confirm: 'wrong', runner: callsRunner([]) }), /refusing to repair/);
  const result = repairProjectSandbox({ pidexRoot: root, projectId: 'pp-demo-repair3', confirm: 'pp-demo-repair3', runner: callsRunner([], (args) => args[0] === 'volume' && args[1] === 'inspect' && String(args[2]).endsWith('-workspace')) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-volumes');
  assert.deepEqual(result.missing_volumes, ['workspace']);
  assert.equal(loadProjectRecord(root, 'pp-demo-repair3').status, 'repair-blocked');
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

test('ensurePreviewContainerPublished recreates container with preview publishes without deleting volumes', async () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-prevsafe1', name: 'demo' });
  record.preview = { ports: { base: 42000, size: 2, container_base: 42000, host_bind: '127.0.0.1', assigned_at: '2026-06-25T00:00:00.000Z', assigned_by: 'preview-enable', generation: 1 } };
  saveProjectRecord(root, record);
  const calls = [];
  const result = await ensurePreviewContainerPublished({ pidexRoot: root, projectId: 'pp-demo-prevsafe1', record, runner: callsRunner(calls), verifyPublishedPorts: async () => false });
  assert.equal(result.ok, true);
  assert.equal(calls.filter((args) => args[0] === 'volume' && args[1] === 'inspect').length, 3);
  assert.deepEqual(calls.find((args) => args[0] === 'rm'), ['rm', '-f', 'pidex-project-pp-demo-prevsafe1']);
  assert.equal(calls.some((args) => args[0] === 'volume' && args[1] === 'rm'), false);
  const create = calls.find((args) => args[0] === 'create');
  assert.equal(create.includes('127.0.0.1:42000:42000'), true);
  assert.equal(create.includes('127.0.0.1:42001:42001'), true);
});

test('ensurePreviewContainerPublished reassigns safely on Docker bind conflict', async () => {
  const root = tmpRoot();
  const record = createProjectRecord({ project_id: 'pp-demo-prevsafe2', name: 'demo' });
  record.preview = { ports: { base: 42000, size: 1, container_base: 42000, host_bind: '127.0.0.1', assigned_at: '2026-06-25T00:00:00.000Z', assigned_by: 'preview-enable', generation: 1 } };
  saveProjectRecord(root, record);
  const reassigned = structuredClone(record);
  reassigned.preview.ports = { ...record.preview.ports, base: 42020, container_base: 42020, assigned_by: 'reassign', generation: 2 };
  let createAttempts = 0;
  const calls = [];
  const result = await ensurePreviewContainerPublished({
    pidexRoot: root,
    projectId: 'pp-demo-prevsafe2',
    record,
    verifyPublishedPorts: async () => false,
    reassignPorts: async () => ({ ok: true, record: reassigned, ports: reassigned.preview.ports }),
    runner: (args) => {
      calls.push(args);
      if (args[0] === 'create') {
        createAttempts += 1;
        if (createAttempts === 1) throw new Error('Bind for 127.0.0.1:42000 failed: port is already allocated');
      }
      return 'ok\n';
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.preview.ports.base, 42020);
  assert.equal(calls.filter((args) => args[0] === 'create').length, 2);
  assert.equal(calls.filter((args) => args[0] === 'volume' && args[1] === 'rm').length, 0);
  assert.equal(calls.findLast((args) => args[0] === 'create').includes('127.0.0.1:42020:42020'), true);
});
