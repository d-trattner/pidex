import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { traceProjectPipelineExposure } from './rule-exposure-tracer.mjs';

function write(root, relativePath, content) {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

test('Project Pipeline tracer persists matching complete reconciliation before publishing snapshot', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-reconciliation-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const result = traceProjectPipelineExposure({ pidexRoot: root, stateRoot: path.join(root, 'state'), gitTrackedPaths: ['agents/pidex-alpha.md'], run: { run_id: 'pipeline-reconciliation', plan_id: 'plan-045', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'corr-reconciliation' }, terminal_outcome_ref: 'pipeline-reconciliation:complete' });

    assert.equal(result.snapshot.complete, true);
    assert.equal(result.reconciliation.reconciliation_revision, result.snapshot.reconciliation_revision);
    assert.equal(result.reconciliation.inventory_count, result.snapshot.inventory_count);
    assert.equal(result.reconciliation.inventory_digest, result.snapshot.inventory_revision);
    assert.match(result.reconciliation.artifact_id, /^reconciliation:/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Project Pipeline tracer replays an identical run, separates lossy-safe run IDs, and publishes no storage paths', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-idempotent-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const base = { pidexRoot: root, stateRoot: path.join(root, 'state'), gitTrackedPaths: ['agents/pidex-alpha.md'], terminal_outcome_ref: 'complete' };
    const run = { run_id: 'a/b', plan_id: 'plan-045', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi@1', config_fingerprint: 'config-sha256:1', correlation_id: 'corr-1' };
    const first = traceProjectPipelineExposure({ ...base, run });
    const replay = traceProjectPipelineExposure({ ...base, run });
    const distinct = traceProjectPipelineExposure({ ...base, run: { ...run, run_id: 'a?b', correlation_id: 'corr-2' } });

    assert.equal(replay.snapshot.snapshot_id, first.snapshot.snapshot_id);
    assert.equal(replay.exposure.exposure_id, first.exposure.exposure_id);
    assert.notEqual(distinct.artifacts.snapshot_id, first.artifacts.snapshot_id);
    assert.equal('paths' in first, false);
    assert.doesNotMatch(JSON.stringify(first), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Project Pipeline tracer rejects partial replay after reconciliation changes and any changed run or terminal identity', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-publication-recovery-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const base = { pidexRoot: root, stateRoot: path.join(root, 'state'), gitTrackedPaths: ['agents/pidex-alpha.md'] };
    const run = { run_id: 'recoverable', plan_id: 'plan-045', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi@1', config_fingerprint: 'config:1', correlation_id: 'corr-1' };
    const first = traceProjectPipelineExposure({ ...base, run, terminal_outcome_ref: 'complete-1' });
    assert.throws(() => traceProjectPipelineExposure({ ...base, run: { ...run, pipeline_version: 'project-pipeline-v2' }, terminal_outcome_ref: 'complete-1' }), /CONFLICT_IDENTITY/);
    assert.throws(() => traceProjectPipelineExposure({ ...base, run, terminal_outcome_ref: 'complete-2' }), /CONFLICT_IDENTITY/);
    write(root, 'agents/pidex-alpha.md', '# Alpha changed\n');
    assert.throws(() => traceProjectPipelineExposure({ ...base, run, terminal_outcome_ref: 'complete-1' }), /CONFLICT_IDENTITY/);
    assert.match(first.artifacts.snapshot_id, /^snapshot:/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('C49-3-AUTH-tracer binds complete replay and conflicts to accepted five-member manifest authority', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-authority-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const base = { pidexRoot: root, stateRoot: path.join(root, 'untrusted-state'), gitTrackedPaths: ['agents/pidex-alpha.md'] };
    const run = { run_id: 'authority-run', plan_id: 'plan-049', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi@1', config_fingerprint: 'config:1', correlation_id: 'corr-1' };
    const first = traceProjectPipelineExposure({ ...base, run, terminal_outcome_ref: 'complete-1' });
    const replay = traceProjectPipelineExposure({ ...base, run, terminal_outcome_ref: 'complete-1' });
    const bundleRoot = path.join(root, 'state', 'quality', 'rule-exposure');
    const manifest = JSON.parse(readFileSync(path.join(bundleRoot, readdirSync(bundleRoot)[0], 'commit-manifest.json'), 'utf8'));

    assert.deepEqual(replay.artifacts, first.artifacts);
    assert.deepEqual(manifest.public_ids, first.artifacts);
    assert.deepEqual(Object.keys(manifest.members).sort(), ['catalog_contribution', 'epoch', 'exposure', 'reconciliation', 'snapshot']);
    assert.throws(() => traceProjectPipelineExposure({ ...base, run: { ...run, correlation_id: 'changed' }, terminal_outcome_ref: 'complete-1' }), /CONFLICT_IDENTITY/);
    assert.equal(existsSync(path.join(root, 'untrusted-state', 'quality')), false);
    assert.equal(existsSync(path.join(root, 'state', 'quality', 'publications')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('C49-3-IDENTITY-tracer preserves ordered run identity and logical-OR falsy normalization', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-run-identity-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const run = { run_id: 'run-id-pass-through', plan_id: '', project_scope: 0, pipeline_version: false, model_identity: null, config_fingerprint: undefined, correlation_id: '' };
    const terminal_outcome_ref = '';
    const identity = {
      run_id: 'run-id-pass-through',
      plan_id: null,
      project_scope: null,
      pipeline_version: null,
      model_identity: null,
      config_fingerprint: null,
      correlation_id: null,
      terminal_outcome_ref: null,
    };
    const milliseconds = Number.parseInt(createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 12), 16) % 253402300799999;
    const result = traceProjectPipelineExposure({ pidexRoot: root, gitTrackedPaths: ['agents/pidex-alpha.md'], run, terminal_outcome_ref });

    assert.equal(result.exposure.timestamp, new Date(milliseconds).toISOString());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('C49-5 tracer carries Windows unconfirmed durability result and exact public IDs', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-tracer-windows-unconfirmed-'));
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const fsync = fs.fsyncSync;
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    fs.fsyncSync = (descriptor) => {
      if (fs.fstatSync(descriptor).isDirectory()) throw Object.assign(new Error('unsupported parent sync'), { code: 'EPERM' });
      return fsync(descriptor);
    };
    syncBuiltinESMExports();

    const result = traceProjectPipelineExposure({ pidexRoot: root, gitTrackedPaths: ['agents/pidex-alpha.md'], run: { run_id: 'windows-unconfirmed', plan_id: '049', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'corr-windows-unconfirmed' }, terminal_outcome_ref: 'complete' });

    const artifacts = {
      reconciliation_id: result.reconciliation.reconciliation_id,
      snapshot_id: result.snapshot.snapshot_id,
      exposure_id: result.exposure.exposure_id,
    };
    assert.deepEqual(result.publication, {
      state: 'COMMITTED_UNCONFIRMED', reason: 'RECOVERY_DURABILITY_UNCONFIRMED', usable: false, parent_sync: 'unsupported', artifacts,
    });
    assert.deepEqual(result.artifacts, artifacts);
  } finally {
    fs.fsyncSync = fsync;
    syncBuiltinESMExports();
    Object.defineProperty(process, 'platform', platform);
    rmSync(root, { recursive: true, force: true });
  }
});

test('Project Pipeline tracer resolves one canonical-inclusive snapshot and records passive unusable S1 terminal exposure', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-exposure-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const result = traceProjectPipelineExposure({ pidexRoot: root, stateRoot: path.join(root, 'state'), gitTrackedPaths: ['agents/pidex-alpha.md'], run: { run_id: 'pipeline-1', plan_id: 'plan-045', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'corr-pipeline-1' }, terminal_outcome_ref: 'pipeline-1:complete' });
    assert.equal(result.snapshot.active_rules[0].rule_id, 'rule:agent:pidex-alpha');
    assert.equal(result.exposure.attestation, 'project-pipeline-tracer');
    assert.equal(result.exposure.usable_for_evidence, false);
    assert.equal(result.exposure.quality, 'complete');
    assert.match(result.artifacts.snapshot_id, /^snapshot:/);
    assert.match(result.artifacts.exposure_id, /^exposure:/);
    assert.equal('paths' in result, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
