import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { traceProjectPipelineExposure, verifyPublicationWitness } from './rule-exposure-tracer.mjs';
import { createActivationEpochCatalog } from '../../../../../scripts/quality/rule-exposure.mjs';
import { captureRuleImpactFanout } from '../../../../../scripts/quality/rule-impact-results.mjs';

function write(root, relativePath, content) {
  const file = path.join(root, relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function rule(tier, scope_id, rule_id) { return Object.freeze({ rule_id, version_hash: 'a'.repeat(64), activation_epoch: `epoch:${rule_id.slice(-24).padStart(24, '0')}`, tier, scope_id, content_hash: 'a'.repeat(64), accepted_commit: 'b'.repeat(40), protection_class: 'none', mirror_digest: 'c'.repeat(64), agent: 'pidex-implementer', applicability: [], phases: ['implementation'], lifecycle_state: 'active' }); }
function attestedContext(source, run, active_rules = [rule('global', null, 'pidex-global:pidex-implementer:quality')]) {
  const input_digests = { schema: 'pidex-rule-runtime-input-digests-v1', run_identity_digest: '1'.repeat(64), project_authority_digest: '2'.repeat(64), inventory_identity_digest: '3'.repeat(64), lifecycle_head_digest: '4'.repeat(64), projection_digest: '5'.repeat(64), epoch_catalog_digest: '6'.repeat(64), mirror_generation_digest: '7'.repeat(64), reconciliation_artifact_digest: '8'.repeat(64) };
  return Object.freeze({ schema: 'pidex-rule-runtime-context-v1', pipeline_id: run.run_id, input_digests, resolver_snapshot: Object.freeze({ schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: 'snapshot:resolver', resolver_revision: '045-S2', projection_revision: 1, scope_id: 'project-safe', created_at: '2026-08-12T12:00:00.000Z', source_heads: {}, mirror_heads: {}, quality: 'verified', reason_codes: [], active_rules, narrowing: [] }), passive_exposure_input: Object.freeze({ inventory_identity: source.inventory, epoch_catalog: createActivationEpochCatalog(Object.fromEntries(source.snapshot.active_rules.map((rule) => [`${rule.rule_id}\0${rule.version_hash}`, rule.activation_epoch]))), reconciliation_artifact: source.reconciliation, rule_snapshot: source.snapshot }) });
}

function win32DirFsyncEperm(fn) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const fsync = fs.fsyncSync;
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    fs.fsyncSync = (descriptor) => { if (fs.fstatSync(descriptor).isDirectory()) throw Object.assign(new Error('unsupported parent sync'), { code: 'EPERM' }); return fsync(descriptor); };
    syncBuiltinESMExports(); return fn();
  } finally { fs.fsyncSync = fsync; syncBuiltinESMExports(); Object.defineProperty(process, 'platform', platform); }
}
function latestBundle(root) { return path.join(root, 'state', 'quality', 'rule-exposure', readdirSync(path.join(root, 'state', 'quality', 'rule-exposure'))[0]); }

test('Project Pipeline tracer persists matching complete reconciliation and records passive unusable S1 terminal exposure', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-exposure-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const result = traceProjectPipelineExposure({ pidexRoot: root, stateRoot: path.join(root, 'state'), gitTrackedPaths: ['agents/pidex-alpha.md'], run: { run_id: 'pipeline-1', plan_id: 'plan-045', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'corr-pipeline-1' }, terminal_outcome_ref: 'pipeline-1:complete' });
    assert.equal(result.inventory.complete, true);
    assert.equal(result.snapshot.complete, true);
    assert.equal(result.reconciliation.reconciliation_revision, result.snapshot.reconciliation_revision);
    assert.equal(result.reconciliation.inventory_count, result.snapshot.inventory_count);
    assert.equal(result.reconciliation.inventory_digest, result.snapshot.inventory_revision);
    assert.match(result.reconciliation.artifact_id, /^reconciliation:/);
    // F2E: canonical Plan045 ID remains canonical through tracer snapshot/exposure/epoch; no legacy remap.
    assert.equal(result.snapshot.active_rules[0].rule_id, 'pidex-global:pidex-alpha:legacy-aggregate');
    assert.equal(result.exposure.attestation, 'project-pipeline-tracer');
    assert.equal(result.exposure.usable_for_evidence, false);
    assert.equal(result.exposure.quality, 'complete');
    assert.match(result.artifacts.snapshot_id, /^snapshot:/);
    assert.match(result.artifacts.exposure_id, /^exposure:/);
    assert.equal('paths' in result, false);
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
    const manifest = JSON.parse(readFileSync(path.join(latestBundle(root), 'commit-manifest.json'), 'utf8'));

    assert.deepEqual(replay.artifacts, first.artifacts);
    assert.deepEqual(manifest.public_ids, first.artifacts);
    assert.deepEqual(Object.keys(manifest.members).sort(), ['catalog_contribution', 'epoch', 'exposure', 'reconciliation', 'snapshot']);
    assert.throws(() => traceProjectPipelineExposure({ ...base, run: { ...run, correlation_id: 'changed' }, terminal_outcome_ref: 'complete-1' }), /CONFLICT_IDENTITY/);
    for (const absent of ['untrusted-state/quality', 'state/quality/publications']) assert.equal(existsSync(path.join(root, absent)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('C49-3-IDENTITY-tracer preserves ordered full producer identity', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-run-identity-'));
  try {
    write(root, 'agents/pidex-alpha.md', '# Alpha\n');
    const run = { run_id: 'run-id-pass-through', plan_id: 'plan-049', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi@1', config_fingerprint: 'config:1', correlation_id: 'corr-identity' };
    const terminal_outcome_ref = 'complete';
    const identity = { ...run, terminal_outcome_ref };
    const milliseconds = Number.parseInt(createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 12), 16) % 253402300799999;
    const result = traceProjectPipelineExposure({ pidexRoot: root, gitTrackedPaths: ['agents/pidex-alpha.md'], run, terminal_outcome_ref });
    assert.equal(result.exposure.timestamp, new Date(milliseconds).toISOString());
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('C49-5 Windows witness lifecycle: unconfirmed publication is reattested by readback, capture proceeds, and every tamper path fails closed', () => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-windows-witness-'));
  const terminalRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-windows-witness-terminal-'));
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-windows-witness-state-'));
  win32DirFsyncEperm(() => {
    write(sourceRoot, 'agents/pidex-alpha.md', '# Alpha\n');
    const run = { run_id: 'windows-unconfirmed', plan_id: '046', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'corr-windows-unconfirmed' };
    const first = traceProjectPipelineExposure({ pidexRoot: sourceRoot, gitTrackedPaths: ['agents/pidex-alpha.md'], run, terminal_outcome_ref: 'complete' });
    assert.deepEqual(first.publication, { state: 'COMMITTED_UNCONFIRMED', reason: 'RECOVERY_DURABILITY_UNCONFIRMED', usable: false, parent_sync: 'unsupported', artifacts: { reconciliation_id: first.reconciliation.reconciliation_id, snapshot_id: first.snapshot.snapshot_id, exposure_id: first.exposure.exposure_id } });
    assert.deepEqual({ artifacts: first.artifacts, publication_witness: first.publication_witness }, { artifacts: first.publication.artifacts, publication_witness: { kind: 'named_file_readback', verified: true, parent_sync: 'unsupported' } }, 'readback reattestation never trusts the state string');
    const result = traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext: attestedContext(first, run), run, terminal_outcome_ref: 'complete', stateRoot, measurement: {} });
    assert.deepEqual({ publication_state: result.publication.state, capture_status: result.impact_capture.status, has_target_ids: 'target_input_ids' in result.impact_capture }, { publication_state: 'COMMITTED_UNCONFIRMED', capture_status: 'captured', has_target_ids: false }, JSON.stringify(result));
    const identity = { run_id: run.run_id, terminal_outcome_ref: 'complete', reconciliation_revision: first.reconciliation.reconciliation_revision, snapshot_id: first.snapshot.snapshot_id, exposure_id: first.exposure.exposure_id };
    const bundle = latestBundle(sourceRoot); const member = path.join(bundle, 'members', 'exposure.json'); const manifestFile = path.join(bundle, 'commit-manifest.json');
    const witness = () => verifyPublicationWitness({ root: sourceRoot, identity });
    assert.deepEqual({ verified: witness().verified, parent_sync: witness().parent_sync }, { verified: true, parent_sync: 'unsupported' });
    const memberBytes = readFileSync(member); const manifestBytes = readFileSync(manifestFile);
    const expectFail = (mutate, reason) => { mutate(); assert.deepEqual(witness(), { verified: false, reason }); };
    const tamper = () => writeFileSync(member, memberBytes.toString('utf8').replace('project-pipeline-tracer', 'project-pipeline-tampered'));
    expectFail(tamper, 'RECOVERY_MEMBER_INVALID'); writeFileSync(member, memberBytes);
    expectFail(() => writeFileSync(manifestFile, '{"tampered":true}'), 'RECOVERY_MANIFEST_SCHEMA_INVALID'); writeFileSync(manifestFile, manifestBytes);
    expectFail(() => rmSync(member), 'RECOVERY_MEMBER_INVALID'); writeFileSync(member, memberBytes);
    const unsafeTarget = path.join(sourceRoot, 'agents', 'pidex-alpha.md');
    let symlinkCapable = true;
    try { fs.symlinkSync(unsafeTarget, path.join(sourceRoot, '.probe-link')); rmSync(path.join(sourceRoot, '.probe-link')); } catch { symlinkCapable = false; }
    if (symlinkCapable) {
      expectFail(() => { rmSync(manifestFile); fs.symlinkSync(unsafeTarget, manifestFile); }, 'RECOVERY_MANIFEST_UNSAFE_PATH');
      rmSync(manifestFile); writeFileSync(manifestFile, manifestBytes);
      expectFail(() => { rmSync(member); fs.symlinkSync(unsafeTarget, member); }, 'RECOVERY_MEMBER_UNSAFE_PATH');
      rmSync(member); writeFileSync(member, memberBytes);
    }
    expectFail(() => writeFileSync(manifestFile, manifestBytes.toString('utf8').slice(0, 40)), 'RECOVERY_MANIFEST_SCHEMA_INVALID');
    writeFileSync(manifestFile, manifestBytes);
    expectFail(() => writeFileSync(member, memberBytes.subarray(0, 20)), 'RECOVERY_MEMBER_INVALID');
    writeFileSync(member, memberBytes);
    tamper();
    assert.throws(() => traceProjectPipelineExposure({ pidexRoot: sourceRoot, gitTrackedPaths: ['agents/pidex-alpha.md'], run, terminal_outcome_ref: 'complete' }), /RECOVERY_MEMBER_INVALID/);
  });
  rmSync(sourceRoot, { recursive: true, force: true }); rmSync(terminalRoot, { recursive: true, force: true }); rmSync(stateRoot, { recursive: true, force: true });
});

test('RC45-06 tracer consumes supplied runtime context without terminal inventory, epoch, or snapshot reconstruction, and never reaches real Git', () => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-runtime-context-source-'));
  const terminalRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-runtime-context-terminal-'));
  try {
    write(sourceRoot, 'agents/pidex-alpha.md', '# Alpha\n');
    const run = { run_id: 'runtime-context-run', plan_id: 'plan-045', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'context-correlation' };
    const constructed = traceProjectPipelineExposure({ pidexRoot: sourceRoot, gitTrackedPaths: ['agents/pidex-alpha.md'], run, terminal_outcome_ref: 'complete' });
    const epoch_catalog = createActivationEpochCatalog(Object.fromEntries(constructed.snapshot.active_rules.map((rule) => [`${rule.rule_id}\0${rule.version_hash}`, rule.activation_epoch])));
    const runtimeContext = Object.freeze({ schema: 'pidex-rule-runtime-context-v1', pipeline_id: 'pipeline-runtime-context', resolver_snapshot: Object.freeze({ snapshot_id: constructed.snapshot.snapshot_id }), passive_exposure_input: Object.freeze({ inventory_identity: constructed.inventory, epoch_catalog, reconciliation_artifact: constructed.reconciliation, rule_snapshot: constructed.snapshot }) });
    const attested = traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext, run, terminal_outcome_ref: 'complete' });
    const legacy = traceProjectPipelineExposure({ pidexRoot: terminalRoot, gitTrackedPaths: ['agents/pidex-alpha.md'], run: { ...run, run_id: 'legacy-context-run' }, terminal_outcome_ref: 'complete' });

    assert.deepEqual({ attestation: attested.attestation, snapshot_id: attested.snapshot.snapshot_id, exposure_snapshot_id: attested.exposure.snapshot_id, usable: attested.usable_for_evidence }, { attestation: 'attested', snapshot_id: constructed.snapshot.snapshot_id, exposure_snapshot_id: constructed.snapshot.snapshot_id, usable: true }, 'complete supplied lifecycle context preserves Plan061 evidence usability');
    assert.deepEqual({ attestation: legacy.attestation, usable_for_evidence: legacy.usable_for_evidence, git_inventory_unavailable: legacy.inventory.diagnostics.some((entry) => entry.code === 'git_inventory_unavailable') }, { attestation: 'non_attested', usable_for_evidence: false, git_inventory_unavailable: false }, 'legacy fixture must supply fake-only tracked paths and never reach real Git');
  } finally { rmSync(sourceRoot, { recursive: true, force: true }); rmSync(terminalRoot, { recursive: true, force: true }); }
});
test('BD45-17 uses supplied registered project root rather than PIDEX root for project inventory', () => {
  const pidexRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-root-'));
  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-pipeline-project-'));
  try {
    write(pidexRoot, 'agents/pidex-alpha.md', '# Alpha\n');
    write(projectRoot, 'pidex/rules/pidex-implementer.md', '# Project rule\n');
    const result = traceProjectPipelineExposure({ pidexRoot, projectRoot, gitTrackedPaths: ['agents/pidex-alpha.md', 'pidex/rules/pidex-implementer.md'], run: { run_id: 'registered-project-root', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'corr-project-root' }, terminal_outcome_ref: 'complete' });
    assert.equal(result.inventory.entries.some((entry) => entry.source === 'pidex/rules/pidex-implementer.md'), true);
  } finally { rmSync(pidexRoot, { recursive: true, force: true }); rmSync(projectRoot, { recursive: true, force: true }); }
});
test('Plan046 tracer preserves verified exposure bytes then captures global/project blocked fanout from fresh runtime', () => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-bridge-source-'));
  const terminalRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-bridge-terminal-'));
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-bridge-state-'));
  try {
    write(sourceRoot, 'agents/pidex-alpha.md', '# Alpha\n');
    const run = { run_id: 'impact-bridge', plan_id: '046', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'impact-bridge' };
    const source = traceProjectPipelineExposure({ pidexRoot: sourceRoot, gitTrackedPaths: ['agents/pidex-alpha.md'], run, terminal_outcome_ref: 'complete' });
    const global = rule('global', null, 'pidex-global:pidex-implementer:quality');
    const project = rule('project', 'project-safe', 'pidex-project:pidex-implementer:quality');
    const runtimeContext = attestedContext(source, run, [global, project]);
    let exposureHashBeforeCapture; let cadenceInput;
    const result = traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext, run, terminal_outcome_ref: 'complete', stateRoot, measurement: {}, impactCadence: (input) => { cadenceInput = input; return { status: 'blocked', reason: 'impact_contract_unavailable' }; }, impactCapture: (input) => {
      exposureHashBeforeCapture = createHash('sha256').update(readFileSync(path.join(latestBundle(terminalRoot), 'commit-manifest.json'))).digest('hex');
      return captureRuleImpactFanout(input);
    } });
    assert.equal(result.impact_capture.status, 'captured', JSON.stringify(result.impact_capture));
    assert.deepEqual(result.impact_cadence, { status: 'blocked', reason: 'impact_contract_unavailable' });
    assert.equal(cadenceInput.ordinary, true); assert.equal(cadenceInput.capture.status, 'captured');
    assert.equal(result.impact_capture.target_count, 2);
    assert.match(result.impact_capture.fanout_digest, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(cadenceInput.currentAuthorityProvider()), ['resolver_snapshot'], 'production passes closed resolver capability, never caller-built API-09/fresh authority');
    assert.equal(cadenceInput.currentAuthorityProvider().resolver_snapshot, runtimeContext.resolver_snapshot);
    const blobs = readdirSync(path.join(stateRoot, 'quality', 'rule-impact-input')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(stateRoot, 'quality', 'rule-impact-input', name), 'utf8')));
    assert.equal(blobs.length, 2); assert.equal(blobs.every((blob) => blob.collection_disposition === 'blocked' && blob.collection_reason === 'family_identity_missing' && JSON.stringify(blob.measurement) === '{}'), true);
    const manifestBytes = readFileSync(path.join(latestBundle(terminalRoot), 'commit-manifest.json'));
    assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), exposureHashBeforeCapture, 'capture cannot alter Plan061 bytes');
    assert.deepEqual(Object.keys(JSON.parse(manifestBytes).members).sort(), ['catalog_contribution', 'epoch', 'exposure', 'reconciliation', 'snapshot']);
    const failSoft = traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext, run, terminal_outcome_ref: 'complete', stateRoot, measurement: {}, impactCapture: () => { throw new Error('/private/token'); } });
    assert.deepEqual(failSoft.impact_capture, { status: 'unavailable', reason: 'capture_unavailable' });
    assert.doesNotMatch(JSON.stringify(failSoft), /private|token/);
  } finally { rmSync(sourceRoot, { recursive: true, force: true }); rmSync(terminalRoot, { recursive: true, force: true }); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('C2 production tracer retains one same-store authority through capture and cadence without leaking target references', () => {
  const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c2-source-'));
  const terminalRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c2-terminal-'));
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c2-state-'));
  try {
    write(sourceRoot, 'agents/pidex-alpha.md', '# Alpha\n');
    const run = { run_id: 'c2', plan_id: '046', project_scope: 'project-safe', pipeline_version: 'project-pipeline-v1', model_identity: 'pi', config_fingerprint: 'config-v1', correlation_id: 'c2' };
    const source = traceProjectPipelineExposure({ pidexRoot: sourceRoot, gitTrackedPaths: ['agents/pidex-alpha.md'], run, terminal_outcome_ref: 'complete' });
    const runtimeContext = attestedContext(source, run);
    const result = traceProjectPipelineExposure({ pidexRoot: terminalRoot, runtimeContext, run, terminal_outcome_ref: 'complete', stateRoot, measurement: {} });
    assert.equal(result.impact_capture.status, 'captured', JSON.stringify(result.impact_capture));
    assert.deepEqual({ status: result.impact_cadence.status, reason: result.impact_cadence.reason }, { status: 'blocked', reason: 'impact_input_unavailable' }, 'no persisted due checkpoint may not claim caller capture input');
    assert.equal('target_input_ids' in result.impact_capture, false);
    assert.doesNotMatch(JSON.stringify(result), /rule-impact-input:/);
  } finally { rmSync(sourceRoot, { recursive: true, force: true }); rmSync(terminalRoot, { recursive: true, force: true }); rmSync(stateRoot, { recursive: true, force: true }); }
});

// ---- Plan048 Slice3B/4: closed lifecycle action invocation seam (RED) ----
import { closedLifecycleActionHistoryAdapter, invokeLifecycleActionFromOrdinaryResult } from './rule-exposure-tracer.mjs';

const LIFECYCLE_ENABLED = Object.freeze({ PIDEX_LIFECYCLE_ACTION_ENABLED: '1' });
const NOW = '2026-08-22T12:00:00.000Z';
const call = (overrides = {}) => invokeLifecycleActionFromOrdinaryResult({ env: LIFECYCLE_ENABLED, now: NOW, ...overrides });
const bytes = Buffer.from('{"schema":"pidex-impact-evaluation-v1"}');

function storeMock(extra = {}) { return { persistLifecycleActionIntent: () => ({ status: 'recorded' }), ...extra }; }
function baseTrace(trace) { return { store: storeMock(), result_bytes: bytes, result_digest: 'a'.repeat(64), current: { tier: 'global' }, trace }; }

test('Plan048 lifecycle action invocation seam honors the kill switch before any trace call', () => {
  let count = 0;
  const outcome = invokeLifecycleActionFromOrdinaryResult({ ...baseTrace(() => { count += 1; return { status: 'intent', correlation_id: `action:${'b'.repeat(64)}` }; }), env: {} });
  assert.deepEqual(outcome, { status: 'no_op', reason: 'kill_switch' });
  assert.equal(count, 0, 'trace must never run while the kill switch is off');
});
test('Plan048 lifecycle action invocation seam takes no action when authority inputs are unavailable or the trace fails', () => {
  assert.deepEqual(invokeLifecycleActionFromOrdinaryResult({ env: LIFECYCLE_ENABLED, now: NOW }), { status: 'no_op', reason: 'action_unavailable' });
  assert.deepEqual(invokeLifecycleActionFromOrdinaryResult({ store: {}, env: LIFECYCLE_ENABLED, now: NOW }), { status: 'no_op', reason: 'action_unavailable' });
  assert.deepEqual(invokeLifecycleActionFromOrdinaryResult({ store: storeMock(), result_bytes: 'not-buffer', result_digest: 'bad', current: null, env: LIFECYCLE_ENABLED, now: NOW }), { status: 'no_op', reason: 'action_unavailable' });
  assert.deepEqual(call({ ...baseTrace(() => { throw new Error('RULE_LIFECYCLE_ACTION_INVALID'); }) }), { status: 'no_op', reason: 'action_unavailable' });
});
test('Plan048 lifecycle action invocation seam sanitizes outcomes and threads the closed fake history adapter', () => {
  let captured; const outcome = call({ store: storeMock({ readLifecycleActionIntentByCadence: () => undefined }), result_bytes: bytes, result_digest: 'a'.repeat(64), current: { tier: 'project', scope_id: 'c'.repeat(24), rule_id: `project:${'c'.repeat(24)}:pidex-implementer:quality` }, trace: (args) => { captured = args; return { status: 'no_op', reason: 'cadence_quarantined', correlation_id: `action:${'b'.repeat(64)}`, cadence_digest: 'd'.repeat(64) }; } });
  assert.deepEqual(outcome, { status: 'no_op', reason: 'cadence_quarantined', correlation_id: `action:${'b'.repeat(64)}` });
  assert.equal(captured.result_digest, 'a'.repeat(64));
  const adapter = captured.history.adapter;
  for (const method of ['fetchExpected', 'fetchObserved', 'postPushObserve', 'remoteUrl']) assert.equal(adapter[method]({ repository: 'repo', branch: 'main' }), null, 'closed fake history adapter must never reach a real remote');
  assert.equal(Object.keys(adapter).length, 4);
});
