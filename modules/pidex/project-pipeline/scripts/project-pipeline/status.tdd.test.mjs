import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectRecord, saveProjectRecord } from './registry.mjs';
import { inspectDockerResources, projectPipelineStatus } from './status.mjs';

test('inspectDockerResources reports running container and named volumes', () => {
  const record = createProjectRecord({ project_id: 'status-health-demo', name: 'demo' });
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (args[0] === 'inspect') return { status: 0, stdout: JSON.stringify([{ State: { Running: true, Status: 'running' } }]), stderr: '' };
    if (args[0] === 'volume' && args[1] === 'inspect') return { status: 0, stdout: JSON.stringify([{ Name: args[2] }]), stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
  const health = inspectDockerResources(record, runner);
  assert.equal(health.ok, true);
  assert.equal(health.container.exists, true);
  assert.equal(health.container.running, true);
  assert.equal(health.container.status, 'running');
  assert.equal(health.volumes.workspace.exists, true);
  assert.equal(calls.length, 4);
});

test('inspectDockerResources records missing container or volumes without throwing', () => {
  const record = createProjectRecord({ project_id: 'status-missing-demo', name: 'demo' });
  const health = inspectDockerResources(record, () => ({ status: 1, stdout: '', stderr: 'not found' }));
  assert.equal(health.ok, false);
  assert.equal(health.container.exists, false);
  assert.equal(health.container.status, 'missing');
  assert.equal(health.volumes.workspace.exists, false);
  assert.equal(health.warnings.length, 4);
});

test('projectPipelineStatus includes docker health when requested and can disable Docker checks', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pidex-project-status-'));
  try {
    const record = createProjectRecord({ project_id: 'status-registry-demo', name: 'demo' });
    saveProjectRecord(root, record);
    const checked = projectPipelineStatus({ pidexRoot: root, projectId: record.project_id, runner: () => ({ status: 1, stdout: '', stderr: 'not found' }) });
    assert.equal(checked.ok, true);
    assert.equal(checked.projects[0].docker_health.container.exists, false);
    const unchecked = projectPipelineStatus({ pidexRoot: root, projectId: record.project_id, checkDocker: false });
    assert.equal(unchecked.ok, true);
    assert.equal(unchecked.projects[0].docker_health, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
