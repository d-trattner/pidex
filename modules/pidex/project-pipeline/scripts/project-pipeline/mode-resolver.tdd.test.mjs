import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectMode, modeRecordPath, resolveProjectPipelineMode, saveProjectMode } from './mode-resolver.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-mode-')); }

test('resolveProjectPipelineMode asks once when no project mode is saved', () => {
  const root = tmp();
  const project = tmp();
  const result = resolveProjectPipelineMode({ pidexRoot: root, projectRoot: project });
  assert.equal(result.ok, false);
  assert.equal(result.decision_required, true);
  assert.deepEqual(result.choices.sort(), ['hardened-pipeline', 'host-direct', 'project-pipeline'].sort());
});

test('saveProjectMode persists explicit per-project mode without source mirror', () => {
  const root = tmp();
  const project = tmp();
  const saved = saveProjectMode({ pidexRoot: root, projectRoot: project, mode: 'project-pipeline' });
  assert.equal(saved.ok, true);
  assert.equal(saved.file, modeRecordPath(root, project));
  assert.equal(saved.record.project_root, path.resolve(project));
  const loaded = loadProjectMode({ pidexRoot: root, projectRoot: project });
  assert.equal(loaded.record.mode, 'project-pipeline');
});

test('resolveProjectPipelineMode returns saved mode and marks project-pipeline no-fallback', () => {
  const root = tmp();
  const project = tmp();
  saveProjectMode({ pidexRoot: root, projectRoot: project, mode: 'project-pipeline' });
  const result = resolveProjectPipelineMode({ pidexRoot: root, projectRoot: project });
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'project-pipeline');
  assert.equal(result.source, 'saved');
  assert.equal(result.no_fallback, true);
});

test('explicit mode overrides and saves valid choices only', () => {
  const root = tmp();
  const project = tmp();
  const result = resolveProjectPipelineMode({ pidexRoot: root, projectRoot: project, mode: 'hardened-pipeline' });
  assert.equal(result.ok, true);
  assert.equal(loadProjectMode({ pidexRoot: root, projectRoot: project }).record.mode, 'hardened-pipeline');
  assert.throws(() => resolveProjectPipelineMode({ pidexRoot: root, projectRoot: project, mode: 'fallback-to-host' }), /unsupported/);
});
