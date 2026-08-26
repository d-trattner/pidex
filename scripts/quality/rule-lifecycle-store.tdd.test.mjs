import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync as nativeRmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { acquireAcceptedRemoteReceipt, bootstrapRuleInventoryProjections, openRuleLifecycleStore, prepareLifecycleRuntimeContext, readDashboardImpactEvidence } from './rule-lifecycle-store.mjs';
import { buildImpactEvaluationArtifact, parseImpactEvaluationBytes, writeImmutableInput } from './rule-impact-results.mjs';
import { canonicalFindingBytes, createRuleLearningEligibilityEnvelope, createRuleLearningFinding, createRuleLearningSupport, findingDigest, lessonCode } from './rule-learning-contracts.mjs';
import { createAutomaticLearningAdapterEvent } from './rule-lifecycle.mjs';
import { buildRuleLearningCandidate } from './rule-learning-candidate.mjs';
function withStore(dir, run) { return () => { const stateRoot = mkdtempSync(path.join(os.tmpdir(), dir)); let store; try { store = openRuleLifecycleStore({ stateRoot }); return run(store, stateRoot); } finally { let cleanupError; try { store?.close(); } catch (error) { cleanupError = `store.close() failed: ${error?.message || error}`; } try { rmSync(stateRoot, { recursive: true, force: true }); } catch (error) { cleanupError ||= `store fixture cleanup failed: ${error?.message || error}`; } if (cleanupError) console.error(`[withStore] ${cleanupError} (stateRoot=${stateRoot})`); } }; }

function packagedHead(repository, commit) {
  return { head_kind: 'packaged_seed', repository_identity: repository, accepted_remote_head: null, baseline_parent_commit: commit, manifest_digest: 'c'.repeat(64), tree_digest: null, seeded_at: '2026-08-11T00:00:00.000Z', verified_at: '2026-08-11T00:00:01.000Z', remote_checked_at: null, freshness: 'bootstrap_only' };
}
function authorityDescriptors(store, sources) { return sources.map(({ repository, scope_id = null }) => { const projection = store.readProjection({ repository, scope_id }); return { repository, scope_id, accepted_head: projection.accepted_head, head: projection.head, entries: projection.entries }; }); }
function rmSync(target, options = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try { return nativeRmSync(target, options); }
    catch (error) {
      if (!options?.recursive || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(error?.code) || attempt >= 60) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}

test('withStore defers body and teardown until the test runs and surfaces cleanup defects without masking body assertions', () => {
  let executed = false;
  const thunk = withStore('pidex-store-helper-', (store, stateRoot) => { executed = true; assert.equal(existsSync(stateRoot), true); });
  assert.equal(executed, false, 'module-load withStore teardown would crash the whole suite on Windows cleanup failure');
  thunk(); assert.equal(executed, true);
  const reported = []; const original = console.error; console.error = (message) => reported.push(String(message));
  try {
    withStore('pidex-store-close-error-', (store) => { store.close(); })();
    assert.equal(reported.some((message) => message.includes('store.close() failed:')), true, 'close defect is surfaced/reportable while cleanup stays nonfatal');
    assert.throws(withStore('pidex-store-body-error-', () => { throw new Error('BODY_ASSERTION_FAILED'); }), /BODY_ASSERTION_FAILED/, 'body assertion error wins over cleanup noise');
  } finally { console.error = original; }
});
test('learning authority accepts only exact 40-hex target predecessors', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-learning-authority-predecessor-'));
  const authority = (predecessor) => ({ enrollment: { targets: { project: { predecessor }, global: { predecessor } } }, reviewers: {} });
  try {
    assert.throws(() => openRuleLifecycleStore({ stateRoot, learningAuthority: authority(`commit:${'a'.repeat(64)}`) }), /RULE_LEARNING_AUTHORITY_INVALID/);
    const store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority(`commit:${'a'.repeat(40)}`) });
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-152-05 dashboard evidence reopens exact latest ER bytes and fails closed on corrupt current rows', () => {
  const missingRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-dashboard-impact-missing-'));
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-dashboard-impact-'));
  const examples = [...readFileSync('agents.output/planning/116c-plan046-exact-result-schema.md', 'utf8').matchAll(/```json\n(\{"schema":"passive-impact-(?:global|project)-result-v1"[^\n]+\})\n```/g)].map(([, json]) => parseImpactEvaluationBytes(Buffer.from(json, 'utf8')));
  const selector = (result) => ({ tier: result.artifact.tier, scope_id: result.artifact.lineage.scope_id || '', rule_id: result.artifact.lineage.rule_id, version_hash: result.artifact.lineage.rule_version_hash, content_hash: result.artifact.lineage.rule_content_hash, activation_epoch: result.artifact.lineage.activation_epoch, policy_id: result.artifact.lineage.policy_id, policy_digest: result.artifact.lineage.policy_digest });
  try {
    assert.deepEqual(readDashboardImpactEvidence({ stateRoot: missingRoot }), { status: 'unavailable', reason_code: 'evidence-unavailable', tiers: { global: [], project: [] } });
    const store = openRuleLifecycleStore({ stateRoot });
    const add = (result) => { writeImmutableInput(stateRoot, { input_digest: result.result_digest, bytes: result.bytes }, { directoryName: 'rule-impact-result' }); store.recordImpactEvaluation({ result_id: result.result_id, result_identity_digest: result.result_identity_digest, result_digest: result.result_digest, state: result.artifact.state, lineage_json: JSON.stringify(result.artifact.lineage), selector: selector(result) }); };
    const collecting = examples.find((result) => result.artifact.tier === 'global' && result.artifact.state === 'collecting');
    const harm = examples.find((result) => result.artifact.tier === 'global' && result.artifact.state === 'repeated_observational_harm');
    const project = examples.find((result) => result.artifact.tier === 'project' && result.artifact.state === 'inconclusive');
    add(collecting); add(harm); add(project);
    const evidence = readDashboardImpactEvidence({ stateRoot });
    assert.equal(evidence.status, 'available');
    assert.deepEqual(evidence.tiers.global.map((row) => row.state), ['repeated_observational_harm'], 'highest head sequence is only current global projection');
    assert.deepEqual(evidence.tiers.project.map((row) => row.state), ['inconclusive'], 'project selector remains isolated');
    assert.equal(evidence.tiers.global[0].cohorts.H2.count, harm.artifact.cohorts[0].count, 'cohort count comes from verified ER');
    assert.equal(evidence.tiers.project[0].cohorts.H2.diversity_count, project.artifact.cohorts[0].diversity_count, 'project diversity comes from verified ER');
    assert.deepEqual(Object.fromEntries(Object.entries(evidence.tiers.global[0].cohorts).map(([id, cohort]) => [id, [cohort.start_at, cohort.end_at]])), {
      H2: ['2025-11-02T00:00:00.000Z', '2025-12-02T00:00:00.000Z'],
      H1: ['2025-12-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
      W1: ['2026-01-01T00:00:00.000Z', '2026-01-31T00:00:00.000Z'],
      W2: ['2026-01-31T00:00:00.000Z', '2026-03-02T00:00:00.000Z'],
    }, 'only parser-verified timing t0 yields exact end-exclusive day cohorts');
    assert.doesNotMatch(JSON.stringify(evidence), /2025-12-31T23:00:00\.000Z|2025-12-31T23:30:00\.000Z|2026-01-01T00:30:00\.000Z/, 'minute or hour cohorts never project');
    assert.doesNotMatch(JSON.stringify(evidence), /passive-impact-(?:global|project):|epoch:|rule-impact-input|secret|token|provider|model|scope_id|lineage/);
    writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${harm.result_digest}.json`), '{"corrupt":true}');
    const degraded = readDashboardImpactEvidence({ stateRoot });
    assert.deepEqual(degraded.tiers.global, [], 'corrupt latest row never falls back to stale metadata or older current row');
    assert.deepEqual(degraded.tiers.project.map((row) => row.state), ['inconclusive']);
    store.close();
  } finally { rmSync(missingRoot, { recursive: true, force: true }); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-152-05 dashboard projects day cohorts across leap/month/year boundaries and omits overflow dates', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-dashboard-impact-days-'));
  const examples = [...readFileSync('agents.output/planning/116c-plan046-exact-result-schema.md', 'utf8').matchAll(/```json\n(\{"schema":"passive-impact-(?:global|project)-result-v1"[^\n]+\})\n```/g)].map(([, json]) => parseImpactEvaluationBytes(Buffer.from(json, 'utf8')));
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    const source = examples.find((result) => result.artifact.tier === 'global' && result.artifact.state === 'repeated_observational_harm');
    const withT0 = (t0) => buildImpactEvaluationArtifact({ tier: source.artifact.tier, state: source.artifact.state, lineage: source.artifact.lineage, closed_window_id: source.artifact.closed_window_id, collection_progress: source.artifact.collection_progress, cohorts: source.artifact.cohorts, comparisons: source.artifact.comparisons, dimensions: source.artifact.dimensions, balance: source.artifact.balance, drift_consistency: source.artifact.drift_consistency, gate_operands: { ...source.artifact.gate_operands, timing: { ...source.artifact.gate_operands.timing, t0 } }, metrics: source.artifact.metrics, quality_flags: source.artifact.quality_flags, reason: source.artifact.reason, prior_result: source.artifact.prior_result, created_at: source.artifact.created_at, expires_at: source.artifact.expires_at });
    const record = (result) => { writeImmutableInput(stateRoot, { input_digest: result.result_digest, bytes: result.bytes }, { directoryName: 'rule-impact-result' }); store.recordImpactEvaluation({ result_id: result.result_id, result_identity_digest: result.result_identity_digest, result_digest: result.result_digest, state: result.artifact.state, lineage_json: JSON.stringify(result.artifact.lineage), selector: { tier: result.artifact.tier, scope_id: result.artifact.lineage.scope_id || '', rule_id: result.artifact.lineage.rule_id, version_hash: result.artifact.lineage.rule_version_hash, content_hash: result.artifact.lineage.rule_content_hash, activation_epoch: result.artifact.lineage.activation_epoch, policy_id: result.artifact.lineage.policy_id, policy_digest: result.artifact.lineage.policy_digest } }); };
    record(withT0('2024-03-01T00:00:00.000Z'));
    assert.deepEqual(Object.fromEntries(Object.entries(readDashboardImpactEvidence({ stateRoot }).tiers.global[0].cohorts).map(([id, cohort]) => [id, [cohort.start_at, cohort.end_at]])), {
      H2: ['2024-01-01T00:00:00.000Z', '2024-01-31T00:00:00.000Z'],
      H1: ['2024-01-31T00:00:00.000Z', '2024-03-01T00:00:00.000Z'],
      W1: ['2024-03-01T00:00:00.000Z', '2024-03-31T00:00:00.000Z'],
      W2: ['2024-03-31T00:00:00.000Z', '2024-04-30T00:00:00.000Z'],
    }, 'leap day stays inside end-exclusive H1');
    record(withT0('9999-12-31T00:00:00.000Z'));
    const overflow = readDashboardImpactEvidence({ stateRoot }).tiers.global[0].cohorts;
    assert.equal(overflow.H2.start_at, undefined, 'unrepresentable window endpoint fails closed without partial dates');
    assert.equal(overflow.W2.end_at, undefined, 'unrepresentable window endpoint does not leak extended-year date');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-152-05 dashboard selects verified newer terminal ER through prior relation without leaking lineage', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-dashboard-terminal-'));
  const examples = [...readFileSync('agents.output/planning/116c-plan046-exact-result-schema.md', 'utf8').matchAll(/```json\n(\{"schema":"passive-impact-(?:global|project)-result-v1"[^\n]+\})\n```/g)].map(([, json]) => parseImpactEvaluationBytes(Buffer.from(json, 'utf8')));
  const selector = (result) => ({ tier: result.artifact.tier, scope_id: result.artifact.lineage.scope_id || '', rule_id: result.artifact.lineage.rule_id, version_hash: result.artifact.lineage.rule_version_hash, content_hash: result.artifact.lineage.rule_content_hash, activation_epoch: result.artifact.lineage.activation_epoch, policy_id: result.artifact.lineage.policy_id, policy_digest: result.artifact.lineage.policy_digest });
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    const prior = examples.find((result) => result.artifact.tier === 'global' && result.artifact.state === 'repeated_observational_harm');
    const terminalFixture = examples.find((result) => result.artifact.tier === 'global' && result.artifact.state === 'expired');
    const terminal = buildImpactEvaluationArtifact({
      tier: terminalFixture.artifact.tier, state: terminalFixture.artifact.state, lineage: terminalFixture.artifact.lineage, closed_window_id: terminalFixture.artifact.closed_window_id, collection_progress: terminalFixture.artifact.collection_progress, cohorts: terminalFixture.artifact.cohorts, comparisons: terminalFixture.artifact.comparisons, dimensions: terminalFixture.artifact.dimensions, balance: terminalFixture.artifact.balance, drift_consistency: terminalFixture.artifact.drift_consistency, gate_operands: terminalFixture.artifact.gate_operands, metrics: terminalFixture.artifact.metrics, quality_flags: terminalFixture.artifact.quality_flags, reason: terminalFixture.artifact.reason, prior_result: { prior_result_id: prior.result_id, prior_result_digest: prior.result_digest, state_reason: terminalFixture.artifact.reason, state_at: terminalFixture.artifact.prior_result.state_at }, created_at: terminalFixture.artifact.created_at, expires_at: terminalFixture.artifact.expires_at,
    });
    writeImmutableInput(stateRoot, { input_digest: prior.result_digest, bytes: prior.bytes }, { directoryName: 'rule-impact-result' });
    writeImmutableInput(stateRoot, { input_digest: terminal.result_digest, bytes: terminal.bytes }, { directoryName: 'rule-impact-result' });
    store.recordImpactEvaluation({ result_id: prior.result_id, result_identity_digest: prior.result_identity_digest, result_digest: prior.result_digest, state: prior.artifact.state, lineage_json: JSON.stringify(prior.artifact.lineage), selector: selector(prior) });
    store.recordImpactEvaluationTerminal({ terminal_result_id: terminal.result_id, terminal_result_identity_digest: terminal.result_identity_digest, terminal_result_digest: terminal.result_digest });
    const evidence = readDashboardImpactEvidence({ stateRoot });
    assert.deepEqual(evidence.tiers.global.map((row) => row.state), ['expired'], 'newer terminal relation wins over stale active prior');
    assert.equal(evidence.tiers.global[0].created_at, terminal.artifact.created_at, 'dates come from terminal bytes');
    // TBR-adde5f88e282: canonical policy offsets are days, not legacy minute windows.
    assert.deepEqual([evidence.tiers.global[0].cohorts.H2.start_at, evidence.tiers.global[0].cohorts.H2.end_at], ['2025-11-02T00:00:00.000Z', '2025-12-02T00:00:00.000Z'], 'verified terminal relation may carry verified prior cohort dates');
    assert.doesNotMatch(JSON.stringify(evidence), /passive-impact-(?:global|project):|epoch:|scope_id|lineage|result-prior-01/);
    writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${terminal.result_digest}.json`), '{"corrupt":true}');
    assert.deepEqual(readDashboardImpactEvidence({ stateRoot }), { status: 'unavailable', reason_code: 'evidence-unavailable', tiers: { global: [], project: [] } }, 'corrupt terminal bytes never revive stale active prior');
    writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${terminal.result_digest}.json`), terminal.bytes);
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    db.prepare('UPDATE impact_evaluation_terminal SET terminal_result_digest = ?').run('0'.repeat(64)); db.close();
    assert.deepEqual(readDashboardImpactEvidence({ stateRoot }), { status: 'unavailable', reason_code: 'evidence-unavailable', tiers: { global: [], project: [] } }, 'corrupt terminal relation never falls back to stale active prior');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-152-05 dashboard verifies terminal replacement successor bytes and rejects corrupt terminal relations', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-dashboard-terminal-replacement-'));
  const examples = [...readFileSync('agents.output/planning/116c-plan046-exact-result-schema.md', 'utf8').matchAll(/```json\n(\{"schema":"passive-impact-(?:global|project)-result-v1"[^\n]+\})\n```/g)].map(([, json]) => parseImpactEvaluationBytes(Buffer.from(json, 'utf8')));
  const selector = (result) => ({ tier: result.artifact.tier, scope_id: result.artifact.lineage.scope_id || '', rule_id: result.artifact.lineage.rule_id, version_hash: result.artifact.lineage.rule_version_hash, content_hash: result.artifact.lineage.rule_content_hash, activation_epoch: result.artifact.lineage.activation_epoch, policy_id: result.artifact.lineage.policy_id, policy_digest: result.artifact.lineage.policy_digest });
  const operands = (artifact, patch = {}) => ({ tier: artifact.tier, state: artifact.state, lineage: artifact.lineage, closed_window_id: artifact.closed_window_id, collection_progress: artifact.collection_progress, cohorts: artifact.cohorts, comparisons: artifact.comparisons, dimensions: artifact.dimensions, balance: artifact.balance, drift_consistency: artifact.drift_consistency, gate_operands: artifact.gate_operands, metrics: artifact.metrics, quality_flags: artifact.quality_flags, reason: artifact.reason, prior_result: artifact.prior_result, created_at: artifact.created_at, expires_at: artifact.expires_at, ...patch });
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    const global = examples.find((result) => result.artifact.tier === 'global' && result.artifact.state === 'collecting');
    const prior = examples.find((result) => result.artifact.tier === 'project' && result.artifact.state === 'frozen');
    const successor = buildImpactEvaluationArtifact(operands(prior.artifact, { created_at: '2026-03-11T00:00:00.000Z' }));
    const terminalFixture = examples.find((result) => result.artifact.tier === 'project' && result.artifact.state === 'superseded');
    const terminal = buildImpactEvaluationArtifact(operands(terminalFixture.artifact, { reason: 'result_replaced', prior_result: { prior_result_id: prior.result_id, prior_result_digest: prior.result_digest, state_reason: 'result_replaced', state_at: terminalFixture.artifact.prior_result.state_at } }));
    for (const result of [global, prior, successor, terminal]) writeImmutableInput(stateRoot, { input_digest: result.result_digest, bytes: result.bytes }, { directoryName: 'rule-impact-result' });
    for (const result of [global, prior, successor]) store.recordImpactEvaluation({ result_id: result.result_id, result_identity_digest: result.result_identity_digest, result_digest: result.result_digest, state: result.artifact.state, lineage_json: JSON.stringify(result.artifact.lineage), selector: selector(result) });
    store.linkImpactEvaluationReplacement({ prior_result_id: prior.result_id, next_result_id: successor.result_id, linked_at: terminalFixture.artifact.prior_result.state_at });
    store.recordImpactEvaluationTerminal({ terminal_result_id: terminal.result_id, terminal_result_identity_digest: terminal.result_identity_digest, terminal_result_digest: terminal.result_digest });
    const evidence = readDashboardImpactEvidence({ stateRoot });
    assert.deepEqual(evidence.tiers.global.map((row) => row.state), ['collecting'], 'global target stays isolated from project terminal');
    assert.deepEqual(evidence.tiers.project.map((row) => row.state), ['superseded'], 'terminal head wins over active replacement successor');
    writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-result', `${successor.result_digest}.json`), '{"corrupt":true}');
    assert.deepEqual(readDashboardImpactEvidence({ stateRoot }), { status: 'unavailable', reason_code: 'evidence-unavailable', tiers: { global: [], project: [] } }, 'corrupt required successor never falls back to stale terminal or active result');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-152-04 source-owned producer publication persists only complete immutable domains', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-producer-publication-'));
  const digest = (value) => createHash('sha256').update(Buffer.from(JSON.stringify(value))).digest('hex');
  const contractBytes = Buffer.from('{"contract_id":"impact-contract:fixture","contract_version":"v1","created_at":"2026-01-01T00:00:00.000Z","valid_from":"2026-01-02T00:00:00.000Z","outcome_definition_id":"quality","outcome_definition_version":"v1","dimensions":[],"raw_covariates":{}}');
  const family = { schema: 'rule-impact-family-v1', project_scope: 'scope:fixture', plan_id: '046', plan_class: 'maintenance', root_run_id: 'root:fixture', run_family_id: `run-family:${digest(['rule-impact-family-v1', 'scope:fixture', '046', 'root:fixture'])}`, production_started_at: '2026-01-03T00:00:00.000Z' };
  const execution = { schema: 'rule-impact-execution-v1', model_provider: 'provider', model_identity: 'model', model_version: 'v1', pipeline_version: 'project-pipeline-v1', route_topology: 'ordinary', agent_role: 'pidex-implementer', agent_version: 'v1', phase: 'implementation', capability_set: ['capture'], budget_class: 'standard', workload_risk_fingerprint_class: 'normal' };
  const terminal = { schema: 'rule-impact-terminal-outcome-v1', run_family_id: family.run_family_id, outcome_definition_id: 'quality', outcome_definition_version: 'v1', outcome_vector: { quality: 1 }, outcome_finalized_at: '2026-01-04T00:00:00.000Z' };
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    assert.throws(() => store.finalizeProducerPublication({}), /RULE_IMPACT_PRODUCER_CAPABILITY_INVALID/, 'caller object cannot mint publication');
    const producer = store.startProducerPublication({ pipeline_id: 'pipeline:fixture', terminal_outcome_ref: 'terminal:fixture', family, execution, impact_contract: { impact_contract_ref: 'impact-contract:fixture', impact_contract_digest: createHash('sha256').update(contractBytes).digest('hex'), impact_contract_bytes: contractBytes, raw_pre_outcome_covariates: {} } });
    const recorded = store.finalizeProducerPublication({ producer, terminal_outcome: terminal });
    assert.equal(recorded.status, 'recorded');
    assert.deepEqual(store.readVerifiedProducerPublication({ reference: recorded.reference }).measurement, {
      schema: 'rule-impact-measurement-v1', run_family_id: family.run_family_id, production_started_at: family.production_started_at, plan_id: '046', plan_class: 'maintenance', project_scope: 'scope:fixture', outcome_definition_id: 'quality', outcome_definition_version: 'v1', model_provider: 'provider', model_identity: 'model', model_version: 'v1', pipeline_version: 'project-pipeline-v1', config_digest: createHash('sha256').update(Buffer.from(JSON.stringify(execution))).digest('hex'), route_topology: 'ordinary', agent_role: 'pidex-implementer', agent_version: 'v1', phase: 'implementation', budget_class: 'standard', capability_set: ['capture'], workload_risk_fingerprint_class: 'normal', raw_pre_outcome_covariates: {}, impact_contract_ref: 'impact-contract:fixture', impact_contract_digest: createHash('sha256').update(contractBytes).digest('hex'), impact_contract_bytes: contractBytes.toString('utf8'), outcome_vector: { quality: 1 }, outcome_source_identity: `rule-impact-outcome:${createHash('sha256').update(Buffer.from(JSON.stringify(terminal))).digest('hex')}`, outcome_source_digest: createHash('sha256').update(Buffer.from(JSON.stringify(terminal))).digest('hex'), outcome_finalized_at: terminal.outcome_finalized_at,
    });
    assert.equal(store.finalizeProducerPublication({ producer, terminal_outcome: terminal }).status, 'existing', 'exact retry is idempotent');
    assert.throws(() => store.finalizeProducerPublication({ producer, terminal_outcome: { ...terminal, outcome_vector: { quality: 2 } } }), /RULE_IMPACT_PRODUCER_CONFLICT/);
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F137-08 post-lock re-read makes concurrent exact ER retries existing and conflicts differing records', async () => {
  const READY_DEADLINE_MS = 12_000;
  const runPair = async (records) => {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-er-concurrent-'));
    const workerFile = path.join(stateRoot, 'worker.mjs'); const startFile = path.join(stateRoot, 'start');
    const moduleUrl = pathToFileURL(path.resolve('scripts/quality/rule-lifecycle-store.mjs')).href;
    writeFileSync(workerFile, `import { existsSync, writeFileSync } from 'node:fs'; import { openRuleLifecycleStore } from ${JSON.stringify(moduleUrl)}; const wait = async (file) => { while (!existsSync(file)) await new Promise((resolve) => setTimeout(resolve, 2)); }; let store; try { store = openRuleLifecycleStore({ stateRoot: process.argv[2] }); writeFileSync(process.argv[3], 'ready'); await wait(process.argv[4]); let result; try { result = store.recordImpactEvaluation(JSON.parse(process.argv[5])); } catch (error) { result = { error: error.message }; } writeFileSync(process.argv[6], JSON.stringify({ outcome: 'ready', result })); } catch (error) { writeFileSync(process.argv[6], JSON.stringify({ outcome: 'open_failed', error: error?.message || String(error), cause: error?.cause?.message || null })); } finally { try { store?.close(); } catch {} }`);
    const ready = records.map((_, index) => path.join(stateRoot, `ready-${index}`)); const output = records.map((_, index) => path.join(stateRoot, `output-${index}`));
    const workers = records.map((record, index) => {
      const detail = { exit_code: undefined, signal: undefined, stderr: '' };
      const child = spawn(process.execPath, [workerFile, stateRoot, ready[index], startFile, JSON.stringify(record), output[index]], { stdio: ['ignore', 'ignore', 'pipe'] });
      child.stderr.on('data', (chunk) => { detail.stderr += chunk; });
      const completion = new Promise((resolve) => child.on('close', (exit_code, signal) => { detail.exit_code = exit_code; detail.signal = signal; resolve(detail); }));
      return { child, detail, completion };
    });
    const snapshot = () => workers.map(({ detail }, index) => ({ index, ready: existsSync(ready[index]), output: existsSync(output[index]) ? JSON.parse(readFileSync(output[index], 'utf8')) : null, ...detail }));
    try {
      const deadline = Date.now() + READY_DEADLINE_MS;
      while (!ready.every(existsSync)) {
        const failed = workers.some(({ detail }) => detail.exit_code !== undefined || detail.signal !== undefined);
        if (failed) throw new Error(`F137 worker exited before ready: ${JSON.stringify(snapshot())}`);
        if (Date.now() >= deadline) throw new Error(`F137 ready deadline exceeded after ${READY_DEADLINE_MS}ms: ${JSON.stringify(snapshot())}`);
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      writeFileSync(startFile, 'go');
      await Promise.all(workers.map(({ completion }) => completion));
      const workerResults = output.map((file) => JSON.parse(readFileSync(file, 'utf8')));
      assert.deepEqual(workerResults.map(({ outcome }) => outcome), records.map(() => 'ready'), `F137 worker failure taxonomy: ${JSON.stringify(snapshot())}`);
      assert.deepEqual(workers.map(({ detail }) => detail.exit_code), records.map(() => 0), `F137 worker exits: ${JSON.stringify(snapshot())}`);
      return workerResults.map(({ result }) => result);
    } finally {
      for (const { child, detail } of workers) if (detail.exit_code === undefined && detail.signal === undefined) child.kill();
      await Promise.all(workers.map(({ completion }) => completion));
      rmSync(stateRoot, { recursive: true, force: true });
    }
  };
  const exact = { result_id: `passive-impact-global:${'a'.repeat(64)}`, result_identity_digest: 'a'.repeat(64), result_digest: 'b'.repeat(64), state: 'inconclusive', lineage_json: '{"lineage":"exact"}' };
  for (let round = 0; round < 12; round += 1) {
    const exactOutcome = await runPair([exact, exact]);
    assert.deepEqual(exactOutcome.map(({ status }) => status).sort(), ['existing', 'recorded'], `exact round ${round}`);
    assert.equal(exactOutcome.some(({ error }) => error === 'RULE_LIFECYCLE_STORAGE_UNAVAILABLE'), false, `exact round ${round}`);
    const conflicting = { ...exact, result_digest: 'c'.repeat(64), lineage_json: '{"lineage":"different"}' };
    const conflictOutcome = await runPair([exact, conflicting]);
    assert.deepEqual(conflictOutcome.map(({ status, error }) => status || error).sort(), ['RULE_IMPACT_EVALUATION_CONFLICT', 'recorded'], `conflict round ${round}`);
  }
});
test('F-110-SEC-03 concurrent fresh and initialized opens wait within budget without uncaught lock', async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-sec110-concurrent-open-'));
  const workerFile = path.join(stateRoot, 'open-worker.mjs'); const startFile = path.join(stateRoot, 'start'); const lockedFile = path.join(stateRoot, 'locked');
  const moduleUrl = pathToFileURL(path.resolve('scripts/quality/rule-lifecycle-store.mjs')).href;
  writeFileSync(workerFile, `import { existsSync, writeFileSync } from 'node:fs'; import { DatabaseSync } from 'node:sqlite'; import { openRuleLifecycleStore } from ${JSON.stringify(moduleUrl)}; const wait = async (file) => { while (!existsSync(file)) await new Promise((resolve) => setTimeout(resolve, 5)); }; if (process.argv[4] === 'lock') { const db = new DatabaseSync(process.argv[2] + '/quality/rule-lifecycle/lifecycle.sqlite'); db.exec('BEGIN EXCLUSIVE'); writeFileSync(process.argv[3], 'locked'); await new Promise((resolve) => setTimeout(resolve, 75)); db.exec('COMMIT'); db.close(); } else { await wait(process.argv[3]); const store = openRuleLifecycleStore({ stateRoot: process.argv[2] }); store.close(); }`);
  const run = (role) => new Promise((resolve) => { const child = spawn(process.execPath, [workerFile, stateRoot, role === 'lock' ? lockedFile : startFile, role], { stdio: 'ignore' }); child.on('close', (code) => resolve(code)); });
  try {
    const fresh = [run(), run()]; writeFileSync(startFile, 'go');
    for (const code of await Promise.all(fresh)) assert.equal(code, 0);
    const initialized = openRuleLifecycleStore({ stateRoot }); initialized.close();
    const holder = run('lock'); while (!existsSync(lockedFile)) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(await run(), 0, 'bounded wait must absorb initialized-root lock');
    assert.equal(await holder, 0);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD45-11/12 persists only verified projection under injected state root', withStore('pidex-lifecycle-store-', (store, stateRoot) => {
// C1/C2: legacy test fixture now supplies required closed head and store epoch.
store.replaceProjection({ repository: 'repo:global', scope_id: null, accepted_head: 'a'.repeat(40), head: packagedHead('repo:global', 'a'.repeat(40)), entries: [{ rule_id: 'pidex-global:pidex-implementer:quality', rule_version: 'b'.repeat(64), content_hash: 'b'.repeat(64), lifecycle_state: 'active', activation_epoch: 'epoch:fixture' }] });
const projection = store.readProjection({ repository: 'repo:global', scope_id: null });
assert.equal(projection.accepted_head, 'a'.repeat(40));
assert.equal(projection.entries.length, 1);
assert.equal(existsSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')), true);
}));
test('LH45-01/05 persists one closed packaged-seed head and exact store-owned activation epoch', withStore('pidex-lifecycle-store-', (store, stateRoot) => {
const head = {
  head_kind: 'packaged_seed', repository_identity: 'repo:global', accepted_remote_head: null,
  baseline_parent_commit: 'a'.repeat(40), manifest_digest: 'b'.repeat(64), tree_digest: null,
  seeded_at: '2026-08-11T00:00:00.000Z', verified_at: '2026-08-11T00:00:01.000Z', remote_checked_at: null,
  freshness: 'bootstrap_only',
};
store.replaceProjection({ repository: 'repo:global', scope_id: null, accepted_head: 'a'.repeat(40), head, entries: [{ rule_id: 'pidex-global:pidex-implementer:quality', rule_version: 'b'.repeat(64), content_hash: 'b'.repeat(64), lifecycle_state: 'active', activation_epoch: 'epoch:store-owned' }] });
const projection = store.readProjection({ repository: 'repo:global', scope_id: null });
assert.deepEqual(projection.head, head);
assert.match(projection.entries[0].activation_epoch, /^epoch:[a-f0-9]{24}$/);
assert.notEqual(projection.entries[0].activation_epoch, 'epoch:store-owned');
assert.throws(() => store.replaceProjection({ repository: 'repo:global', scope_id: null, accepted_head: 'c'.repeat(40), head: { ...head, unknown: true }, entries: [] }), /RULE_LIFECYCLE_PROJECTION_INVALID/);
}));
test('LH45-04 migrates unverifiable v1 projection to degraded empty managed state', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-store-'));
  try {
    const file = path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite');
    mkdirSync(path.dirname(file), { recursive: true });
    const legacy = new DatabaseSync(file);
    legacy.exec("CREATE TABLE effective_projection (repository TEXT NOT NULL, scope_id TEXT NOT NULL, accepted_head TEXT NOT NULL, entries_json TEXT NOT NULL, PRIMARY KEY (repository, scope_id)); INSERT INTO effective_projection VALUES ('repo:global', '', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[{\"rule_id\":\"stale\"}]');");
    legacy.close();
    const store = openRuleLifecycleStore({ stateRoot });
    assert.deepEqual(store.readProjection({ repository: 'repo:global' }), { quality: 'degraded', reason_codes: ['lifecycle_head_unverifiable'], entries: [] });
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('HR45-02/04 persists immutable history, recomputes fresh context, and rejects digest drift', withStore('pidex-lifecycle-store-', (store, stateRoot) => {
const input_digests = { schema: 'pidex-rule-runtime-input-digests-v1', run_identity_digest: 'a'.repeat(64), project_authority_digest: 'b'.repeat(64), inventory_identity_digest: 'c'.repeat(64), lifecycle_head_digest: 'd'.repeat(64), projection_digest: 'e'.repeat(64), epoch_catalog_digest: 'f'.repeat(64), mirror_generation_digest: 'a'.repeat(64), reconciliation_artifact_digest: 'b'.repeat(64) };
const context = { schema: 'pidex-rule-runtime-context-v1', pipeline_id: 'pipeline-store-1', input_digests, resolver_snapshot: { snapshot_id: 'resolver:1' }, passive_exposure_input: { rule_snapshot: { snapshot_id: 'snapshot:1' } } };
let calls = 0;
const first = store.getOrCreateRuntimeContext('pipeline-store-1', input_digests, () => { calls += 1; return context; });
const second = store.getOrCreateRuntimeContext('pipeline-store-1', input_digests, () => { calls += 1; return context; });
assert.equal(calls, 2, 'runtime acquisition must not reuse persisted context');
assert.deepEqual(second, first);
assert.equal(Object.isFrozen(second), true);
assert.throws(() => store.getOrCreateRuntimeContext('pipeline-store-1', { ...input_digests, projection_digest: 'c'.repeat(64) }, () => context), /RULE_RUNTIME_CONTEXT_CONFLICT/);
assert.deepEqual(store.getOrCreateRuntimeContext('pipeline-store-1', input_digests, () => context), first);
}));
test('S1 fresh runtime authority recomputes after persisted context tamper and keeps history non-authoritative', withStore('pidex-runtime-fresh-', (store, stateRoot) => {
const input_digests = { schema: 'pidex-rule-runtime-input-digests-v1', run_identity_digest: 'a'.repeat(64), project_authority_digest: 'b'.repeat(64), inventory_identity_digest: 'c'.repeat(64), lifecycle_head_digest: 'd'.repeat(64), projection_digest: 'e'.repeat(64), epoch_catalog_digest: 'f'.repeat(64), mirror_generation_digest: 'a'.repeat(64), reconciliation_artifact_digest: 'b'.repeat(64) };
let revision = 0;
const fresh = () => ({ schema: 'pidex-rule-runtime-context-v1', pipeline_id: 'pipeline-fresh', input_digests, resolver_snapshot: { snapshot_id: `resolver:${++revision}`, nested: { trusted: true } }, passive_exposure_input: { rule_snapshot: { snapshot_id: `snapshot:${revision}` } } });
const first = store.getOrCreateRuntimeContext('pipeline-fresh', input_digests, fresh);
const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
db.prepare('UPDATE runtime_context SET context_json = ? WHERE pipeline_id = ?').run(JSON.stringify({ ...first, resolver_snapshot: { snapshot_id: 'resolver:forged', nested: { trusted: false } } }), 'pipeline-fresh');
db.close();
const next = store.getOrCreateRuntimeContext('pipeline-fresh', input_digests, fresh);
assert.equal(revision, 2, 'every acquisition rebuilds from fresh verified inputs');
assert.equal(next.resolver_snapshot.snapshot_id, 'resolver:2');
assert.deepEqual(next.resolver_snapshot.nested, { trusted: true });
}));
test('S2 receipt ledger preserves v3 history, stores first verified receipt once, retries exactly, and rejects either-key conflict', withStore('pidex-receipt-ledger-', (store, stateRoot) => {
store.replaceProjection({ repository: 'repo:receipt-ledger', accepted_head: 'a'.repeat(40), head: packagedHead('repo:receipt-ledger', 'a'.repeat(40)), entries: [] });
const receipt = { receipt_digest: 'b'.repeat(64), transaction_digest: 'c'.repeat(64), accepted_commit: 'd'.repeat(40), tree_digest: 'e'.repeat(64) };
let verified = 0;
const verify = () => { verified += 1; return { accepted_commit: receipt.accepted_commit, tree_digest: receipt.tree_digest, result: { status: 'accepted', rule_id: 'pidex-global:pidex-implementer:quality' } }; };
const first = store.consumeVerifiedReceipt({ receipt, verify });
const retry = store.consumeVerifiedReceipt({ receipt, verify });
assert.deepEqual(retry, first);
assert.equal(verified, 1, 'exact retry returns immutable stored result without a second effect');
assert.throws(() => store.consumeVerifiedReceipt({ receipt: { ...receipt, receipt_digest: 'f'.repeat(64) }, verify }), /RULE_RECEIPT_CONFLICT/);
assert.throws(() => store.consumeVerifiedReceipt({ receipt: { ...receipt, transaction_digest: '0'.repeat(64) }, verify }), /RULE_RECEIPT_CONFLICT/);
const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lifecycle_event').get().count, 1, 'additive migration retains pre-existing lifecycle history');
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM receipt_consumption').get().count, 1);
db.close();
}));
test('CR-073-04 rejects persisted runtime contexts with extra top-level keys', withStore('pidex-lifecycle-store-', (store, stateRoot) => {
const input_digests = { schema: 'pidex-rule-runtime-input-digests-v1', run_identity_digest: 'a'.repeat(64), project_authority_digest: 'b'.repeat(64), inventory_identity_digest: 'c'.repeat(64), lifecycle_head_digest: 'd'.repeat(64), projection_digest: 'e'.repeat(64), epoch_catalog_digest: 'f'.repeat(64), mirror_generation_digest: 'a'.repeat(64), reconciliation_artifact_digest: 'b'.repeat(64) };
const context = { schema: 'pidex-rule-runtime-context-v1', pipeline_id: 'pipeline-extra-key', input_digests, resolver_snapshot: {}, passive_exposure_input: {}, snapshot_id: 'snapshot:forbidden' };
assert.throws(() => store.getOrCreateRuntimeContext('pipeline-extra-key', input_digests, () => context), /RULE_RUNTIME_CONTEXT_INVALID/);
}));
test('CR-073-01 accepts only verified ancestry and persists lifecycle v1 transition event/epoch', withStore('pidex-lifecycle-store-', (store, stateRoot) => {
const seed = 'f'.repeat(40);
const accepted = 'a'.repeat(40);
store.replaceProjection({ repository: 'repo:global', accepted_head: seed, head: packagedHead('repo:global', seed), entries: [] });
const remoteHead = { head_kind: 'accepted_remote', repository_identity: 'repo:global', accepted_remote_head: accepted, baseline_parent_commit: seed, manifest_digest: null, tree_digest: 'b'.repeat(64), seeded_at: null, verified_at: '2026-08-11T00:00:02.000Z', remote_checked_at: '2026-08-11T00:00:02.000Z', freshness: 'exact_head' };
store.replaceProjection({ repository: 'repo:global', accepted_head: accepted, head: remoteHead, entries: [{ rule_id: 'pidex-global:pidex-implementer:quality', rule_version: 'b'.repeat(64), content_hash: 'b'.repeat(64), lifecycle_state: 'active', activation_epoch: 'epoch:accepted' }], is_descendant: (ancestor, descendant) => ancestor === seed && descendant === accepted });
const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lifecycle_event').get().count, 2);
assert.match(db.prepare('SELECT activation_epoch FROM activation_epoch WHERE repository = ?').get('repo:global').activation_epoch, /^epoch:[a-f0-9]{24}$/);
db.close();
}));
test('CR-073-06/08 prepares one production runtime context only from verified projection authority', withStore('pidex-lifecycle-store-', (store, stateRoot) => {
const repository = '/registered/project';
const entry = { rule_id: 'rule:managed:authority', rule_version: 'a'.repeat(64), content_hash: 'a'.repeat(64), accepted_commit: 'b'.repeat(40), bytes: '# governed\n', activation_epoch: 'epoch:authority', tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: 'active', created_at: '2026-08-11T00:00:00.000Z', source_head: 'b'.repeat(40), mirror_head: 'b'.repeat(40), mirror_digest: 'c'.repeat(64) };
store.enroll({ repository, remote: 'https://example.invalid/rules.git', branch: 'main' });
store.replaceProjection({ repository, accepted_head: 'b'.repeat(40), head: packagedHead(repository, 'a'.repeat(40)), entries: [entry] });
const prepared = prepareLifecycleRuntimeContext({ store, pipeline_id: 'pipeline-authority', repository, authority_descriptors: authorityDescriptors(store, [{ repository }]), project_authority: { project_id: 'pp-authority', project_root: repository }, run_identity: { run_id: 'pipeline-authority', model_identity: 'pi', config_fingerprint: 'config:authority', correlation_id: 'corr-authority' } });
const context = store.getOrCreateRuntimeContext('pipeline-authority', prepared.input_digests, prepared.createRuntimeContext);
assert.equal(context.pipeline_id, 'pipeline-authority');
assert.match(context.resolver_snapshot.snapshot_id, /^snapshot:/);
assert.match(context.passive_exposure_input.rule_snapshot.snapshot_id, /^snapshot:/);
assert.throws(() => prepareLifecycleRuntimeContext({ store, pipeline_id: 'pipeline-authority', repository: '/unregistered', project_authority: {}, run_identity: {} }), /RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE/);
}));
test('F-081-SEC-01 rejects persisted projection preparation without current verified authority descriptors', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-re-attest-'));
  try {
    const store = openRuleLifecycleStore({ stateRoot }); const repository = 'repo:re-attest'; const version = 'a'.repeat(64); const head = 'b'.repeat(40);
    store.replaceProjection({ repository, accepted_head: head, head: packagedHead(repository, head), entries: [{ rule_id: 'pidex-global:pidex-implementer:quality', rule_version: version, content_hash: version, lifecycle_state: 'active' }] });
    assert.throws(() => prepareLifecycleRuntimeContext({ store, pipeline_id: 'pipeline-re-attest', repository, project_authority: { project_root: repository }, run_identity: { run_id: 'pipeline-re-attest' } }), /RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE/);
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('CR-076-01/05 keeps canonical passive identity and independently safe active/deactivated dashboard rows', async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-terminal-recovery-'));
  try {
    const store = openRuleLifecycleStore({ stateRoot }); const repository = 'repo:terminal-recovery'; const version = 'b'.repeat(64);
    const active = { rule_id: 'pidex-global:pidex-implementer:canonical', rule_version: version, content_hash: version, accepted_commit: 'c'.repeat(40), bytes: '# canonical\n', tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: 'active', created_at: '2026-08-11T00:00:00.000Z', source_head: 'c'.repeat(40), mirror_head: 'c'.repeat(40), mirror_digest: version };
    const closed = { ...active, rule_id: 'pidex-global:pidex-implementer:closed', lifecycle_state: 'deactivated' };
    store.replaceProjection({ repository, accepted_head: 'c'.repeat(40), head: packagedHead(repository, 'c'.repeat(40)), entries: [active, closed] });
    const prepared = prepareLifecycleRuntimeContext({ store, pipeline_id: 'pipeline-terminal-recovery', repository, authority_descriptors: authorityDescriptors(store, [{ repository }]), project_authority: { project_root: repository }, run_identity: { run_id: 'pipeline-terminal-recovery' } });
    const context = store.getOrCreateRuntimeContext('pipeline-terminal-recovery', prepared.input_digests, prepared.createRuntimeContext);
    assert.deepEqual(context.resolver_snapshot.active_rules.map((rule) => rule.rule_id), [active.rule_id]);
    assert.deepEqual(context.passive_exposure_input.rule_snapshot.active_rules.map((rule) => rule.rule_id), [active.rule_id]);
    const dashboard = (await import('./rule-lifecycle-store.mjs')).readDashboardRuleProvenance({ stateRoot });
    assert.deepEqual(dashboard.rules.map((rule) => [rule.rule_id, rule.activation_epoch]), [[active.rule_id, store.readProjection({ repository }).entries.find((rule) => rule.rule_id === active.rule_id).activation_epoch], [closed.rule_id, null]]);
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('CR-075-04 production preparation resolves active subset while preserving epochless deactivation provenance', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-active-subset-'));
  try {
    const store = openRuleLifecycleStore({ stateRoot }); const repository = 'repo:active-subset'; const version = 'a'.repeat(64);
    const active = { rule_id: 'pidex-global:pidex-implementer:active', rule_version: version, content_hash: version, accepted_commit: 'b'.repeat(40), bytes: '# active\n', tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: 'active', created_at: '2026-08-11T00:00:00.000Z', source_head: 'b'.repeat(40), mirror_head: 'b'.repeat(40), mirror_digest: version };
    const deactivated = { ...active, rule_id: 'pidex-global:pidex-implementer:deactivated', lifecycle_state: 'deactivated' };
    store.replaceProjection({ repository, accepted_head: 'b'.repeat(40), head: packagedHead(repository, 'b'.repeat(40)), entries: [active, deactivated] });
    const projection = store.readProjection({ repository });
    assert.equal(Object.hasOwn(projection.entries.find((entry) => entry.rule_id === deactivated.rule_id), 'activation_epoch'), false, 'store preserves closed deactivation descriptor without active epoch');
    const prepared = prepareLifecycleRuntimeContext({ store, pipeline_id: 'pipeline-active-subset', repository, authority_descriptors: authorityDescriptors(store, [{ repository }]), project_authority: { project_root: repository }, run_identity: { run_id: 'pipeline-active-subset' } });
    const context = store.getOrCreateRuntimeContext('pipeline-active-subset', prepared.input_digests, prepared.createRuntimeContext);
    assert.deepEqual(context.resolver_snapshot.active_rules.map((entry) => entry.rule_id), [active.rule_id]);
    assert.equal(context.resolver_snapshot.quality, 'verified');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-12 production preparation composes fresh exact persisted stops after authority construction and clearing reacquires only active authority', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-local-stop-runtime-'));
  try {
    let store = openRuleLifecycleStore({ stateRoot }); const global = 'repo:local-stop-global'; const project = 'repo:local-stop-project'; const scope = 'c'.repeat(24); const version = 'a'.repeat(64);
    const entry = (rule_id, source, tier, scope_id, lifecycle_state = 'active', locally_stopped = undefined) => ({ rule_id, rule_version: version, content_hash: version, accepted_commit: 'b'.repeat(40), bytes: `# ${rule_id}\n`, tier, scope_id, protection_class: 'none', source, lifecycle_state, created_at: '2026-08-11T00:00:00.000Z', source_head: 'b'.repeat(40), mirror_head: 'b'.repeat(40), mirror_digest: version, locally_pinned: rule_id.endsWith(':pinned'), ...(locally_stopped === undefined ? {} : { locally_stopped }) });
    const globalRule = 'pidex-global:pidex-implementer:global'; const pinnedRule = `project:${scope}:pidex-implementer:pinned`; const closedRule = `project:${scope}:pidex-implementer:closed`;
    store.enroll({ repository: global, remote: 'https://example.invalid/global.git', branch: 'main' }); store.enroll({ repository: project, scope_id: scope, remote: 'https://example.invalid/project.git', branch: 'main' });
    store.replaceProjection({ repository: global, accepted_head: 'b'.repeat(40), head: packagedHead(global, 'b'.repeat(40)), entries: [entry(globalRule, 'managed_global', 'global', null)] });
    store.replaceProjection({ repository: project, scope_id: scope, accepted_head: 'b'.repeat(40), head: packagedHead(project, 'b'.repeat(40)), entries: [entry(pinnedRule, 'managed_project', 'project', scope, 'active', true), entry(closedRule, 'managed_project', 'project', scope, 'deactivated')] });
    store.setLocalRuleStop({ repository: global, scope_id: 'pidex-global', rule_id: globalRule, reason_code: 'operator_stop' });
    const prepare = (pipeline_id) => prepareLifecycleRuntimeContext({ store, pipeline_id, repository: project, scope_id: scope, repositories: [{ repository: global }, { repository: project, scope_id: scope }], authority_descriptors: authorityDescriptors(store, [{ repository: global }, { repository: project, scope_id: scope }]), project_authority: { project_root: project }, run_identity: { run_id: pipeline_id } });
    const stoppedPrepared = prepare('pipeline-local-stop-stopped');
    const stopped = store.getOrCreateRuntimeContext('pipeline-local-stop-stopped', stoppedPrepared.input_digests, stoppedPrepared.createRuntimeContext);
    assert.deepEqual(stopped.input_digests, stoppedPrepared.input_digests, 'prepared and created contexts bind same final narrowed facts');
    assert.deepEqual(stopped.resolver_snapshot.active_rules.map((rule) => rule.rule_id), [pinnedRule], 'persisted global stop overlays only final active snapshot; caller stop boolean is not authority');
    assert.deepEqual(stopped.resolver_snapshot.narrowing, [{ rule_id: globalRule, state: 'locally_stopped' }, { rule_id: pinnedRule, state: 'locally_pinned' }]);
    assert.equal(stopped.passive_exposure_input.rule_snapshot.active_rules.some((rule) => rule.rule_id === globalRule), false, 'final passive snapshot excludes persisted stop');
    store.close(); store = openRuleLifecycleStore({ stateRoot });
    const staleActive = (() => { store.clearLocalRuleStop({ repository: global, scope_id: 'pidex-global', rule_id: globalRule }); const context = prepare('pipeline-local-stop-stopped').createRuntimeContext(); store.setLocalRuleStop({ repository: global, scope_id: 'pidex-global', rule_id: globalRule, reason_code: 'operator_stop' }); return context; })();
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); db.prepare('UPDATE runtime_context SET context_json = ? WHERE pipeline_id = ?').run(JSON.stringify(staleActive), 'pipeline-local-stop-stopped'); db.close();
    const freshStopped = prepare('pipeline-local-stop-stopped');
    const recomputed = store.getOrCreateRuntimeContext('pipeline-local-stop-stopped', freshStopped.input_digests, freshStopped.createRuntimeContext);
    assert.deepEqual(recomputed.resolver_snapshot.active_rules.map((rule) => rule.rule_id), [pinnedRule], 'fresh restart preparation replaces stale persisted active history with source-plus-stop authority');
    store.clearLocalRuleStop({ repository: global, scope_id: 'pidex-global', rule_id: globalRule });
    const restoredPrepared = prepare('pipeline-local-stop-restored');
    const restored = store.getOrCreateRuntimeContext('pipeline-local-stop-restored', restoredPrepared.input_digests, restoredPrepared.createRuntimeContext);
    assert.deepEqual(restored.input_digests, restoredPrepared.input_digests, 'fresh clear preparation binds restored facts');
    assert.deepEqual(restored.resolver_snapshot.active_rules.map((rule) => rule.rule_id), [globalRule, pinnedRule], 'fresh preparation cannot retain stale persisted stopped state');
    assert.equal(restored.resolver_snapshot.active_rules.some((rule) => rule.rule_id === closedRule), false, 'clearing cannot reactivate deactivated authority');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-13 production preparation fails closed on malformed exact local-stop row', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-local-stop-malformed-'));
  try {
    const store = openRuleLifecycleStore({ stateRoot }); const repository = 'repo:local-stop-malformed'; const rule_id = 'pidex-global:pidex-implementer:quality'; const version = 'a'.repeat(64);
    store.enroll({ repository, remote: 'https://example.invalid/malformed.git', branch: 'main' });
    store.replaceProjection({ repository, accepted_head: 'b'.repeat(40), head: packagedHead(repository, 'b'.repeat(40)), entries: [{ rule_id, rule_version: version, content_hash: version, accepted_commit: 'b'.repeat(40), bytes: '# quality\n', tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: 'active', created_at: '2026-08-11T00:00:00.000Z', source_head: 'b'.repeat(40), mirror_head: 'b'.repeat(40), mirror_digest: version }] });
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    db.prepare('INSERT INTO local_narrowing (repository, scope_id, rule_id, reason_code) VALUES (?, ?, ?, ?)').run(repository, '', rule_id, 'corrupt_reason'); db.close();
    assert.throws(() => prepareLifecycleRuntimeContext({ store, pipeline_id: 'pipeline-local-stop-malformed', repository, authority_descriptors: authorityDescriptors(store, [{ repository }]), project_authority: { project_root: repository }, run_identity: { run_id: 'pipeline-local-stop-malformed' } }), /RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE/);
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-14 concurrent exact local-stop set/update/clear operations serialize into whole restart-durable state', async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-local-stop-concurrent-'));
  const repository = 'repo:local-stop-concurrent'; const rule_id = 'pidex-global:pidex-implementer:quality';
  const worker = path.join(stateRoot, 'local-stop-worker.mjs'); const start = path.join(stateRoot, 'start');
  const moduleUrl = pathToFileURL(path.resolve('scripts/quality/rule-lifecycle-store.mjs')).href;
  try {
    const store = openRuleLifecycleStore({ stateRoot }); const version = 'a'.repeat(64);
    store.enroll({ repository, remote: 'https://example.invalid/concurrent.git', branch: 'main' });
    store.replaceProjection({ repository, accepted_head: 'b'.repeat(40), head: packagedHead(repository, 'b'.repeat(40)), entries: [{ rule_id, rule_version: version, content_hash: version, lifecycle_state: 'active' }] }); store.close();
    writeFileSync(worker, `import { existsSync, writeFileSync } from 'node:fs'; import { openRuleLifecycleStore } from ${JSON.stringify(moduleUrl)}; const wait = async () => { while (!existsSync(process.argv[4])) await new Promise((resolve) => setTimeout(resolve, 2)); }; const store = openRuleLifecycleStore({ stateRoot: process.argv[2] }); writeFileSync(process.argv[3], 'ready'); await wait(); try { const result = process.argv[5] === 'clear' ? store.clearLocalRuleStop({ repository: process.argv[6], scope_id: 'pidex-global', rule_id: process.argv[7] }) : store.setLocalRuleStop({ repository: process.argv[6], scope_id: 'pidex-global', rule_id: process.argv[7], reason_code: process.argv[5] }); writeFileSync(process.argv[8], JSON.stringify({ ...result, operation_completed_ns: process.hrtime.bigint().toString() })); } catch (error) { writeFileSync(process.argv[8], JSON.stringify({ error: error.message })); } store.close();`);
    const runPair = async (actions) => {
      rmSync(start, { force: true }); const ready = actions.map((_, index) => path.join(stateRoot, `ready-${index}`)); const output = actions.map((_, index) => path.join(stateRoot, `output-${index}`));
      const children = actions.map((action, index) => new Promise((resolve) => { const child = spawn(process.execPath, [worker, stateRoot, ready[index], start, action, repository, rule_id, output[index]], { stdio: 'ignore' }); child.on('close', resolve); }));
      while (!ready.every(existsSync)) await new Promise((resolve) => setTimeout(resolve, 2)); writeFileSync(start, 'go'); assert.deepEqual(await Promise.all(children), [0, 0]); return output.map((file) => JSON.parse(readFileSync(file, 'utf8')));
    };
    const differing = await runPair(['manual_stop', 'operator_stop']); assert.equal(differing.some((result) => result.error), false);
    assert.ok(differing.every((result) => /^[0-9]+$/.test(result.operation_completed_ns)), 'workers record operation completion order');
    const latestReason = [...differing].sort((left, right) => BigInt(left.operation_completed_ns) > BigInt(right.operation_completed_ns) ? -1 : 1)[0].reason_code;
    let reopened = openRuleLifecycleStore({ stateRoot }); assert.equal(reopened.readLocalRuleStop({ repository, scope_id: 'pidex-global', rule_id }).reason_code, latestReason, 'restart state belongs to last serialized accepted set'); reopened.close();
    const exact = await runPair(['publication_stop', 'publication_stop']); assert.equal(exact.some((result) => result.error), false);
    reopened = openRuleLifecycleStore({ stateRoot }); assert.equal(reopened.readLocalRuleStop({ repository, scope_id: 'pidex-global', rule_id }).reason_code, 'publication_stop'); reopened.close();
    const seed = openRuleLifecycleStore({ stateRoot }); seed.setLocalRuleStop({ repository, scope_id: 'pidex-global', rule_id, reason_code: 'publication_stop' }); seed.close();
    const mixed = await runPair(['operator_stop', 'clear']); assert.equal(mixed.some((result) => result.error), false);
    assert.ok(mixed.every((result) => /^[0-9]+$/.test(result.operation_completed_ns)), 'workers record set/clear completion order');
    const latest = [...mixed].sort((left, right) => BigInt(left.operation_completed_ns) > BigInt(right.operation_completed_ns) ? -1 : 1)[0];
    reopened = openRuleLifecycleStore({ stateRoot }); const final = reopened.readLocalRuleStop({ repository, scope_id: 'pidex-global', rule_id }); assert.equal(final?.reason_code, latest.status === 'cleared' ? undefined : 'operator_stop', 'final state cannot retain stale pre-operation publication_stop'); reopened.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('CR-075-05 production preparation reconciles registered global and project projections once', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-two-tier-'));
  try {
    const store = openRuleLifecycleStore({ stateRoot }); const global = 'repo:global-two-tier'; const project = 'repo:project-two-tier';
    const entry = (rule_id, source, tier, scope_id, version) => ({ rule_id, rule_version: version.repeat(64), content_hash: version.repeat(64), accepted_commit: 'b'.repeat(40), bytes: `# ${rule_id}\n`, tier, scope_id, protection_class: 'none', source, lifecycle_state: 'active', created_at: '2026-08-11T00:00:00.000Z', source_head: 'b'.repeat(40), mirror_head: 'b'.repeat(40), mirror_digest: version.repeat(64) });
    store.replaceProjection({ repository: global, accepted_head: 'b'.repeat(40), head: packagedHead(global, 'b'.repeat(40)), entries: [entry('pidex-global:pidex-implementer:global', 'managed_global', 'global', null, 'a')] });
    store.replaceProjection({ repository: project, scope_id: 'c'.repeat(24), accepted_head: 'b'.repeat(40), head: packagedHead(project, 'b'.repeat(40)), entries: [entry(`project:${'c'.repeat(24)}:pidex-implementer:project`, 'managed_project', 'project', 'c'.repeat(24), 'd')] });
    const prepared = prepareLifecycleRuntimeContext({ store, pipeline_id: 'pipeline-two-tier', repository: project, scope_id: 'c'.repeat(24), repositories: [{ repository: global }, { repository: project, scope_id: 'c'.repeat(24) }], authority_descriptors: authorityDescriptors(store, [{ repository: global }, { repository: project, scope_id: 'c'.repeat(24) }]), project_authority: { project_root: project }, run_identity: { run_id: 'pipeline-two-tier' } });
    const context = store.getOrCreateRuntimeContext('pipeline-two-tier', prepared.input_digests, prepared.createRuntimeContext);
    assert.deepEqual(context.resolver_snapshot.active_rules.map((item) => item.rule_id), ['pidex-global:pidex-implementer:global', `project:${'c'.repeat(24)}:pidex-implementer:project`]);
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('CR-074-01 store derives epochs from accepted lifecycle transitions, preserves version history, and rebuilds partial v1 safely', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-store-'));
  try {
    const repository = 'repo:authority';
    const firstHead = 'a'.repeat(40); const secondHead = 'b'.repeat(40);
    const rule = { rule_id: 'pidex-global:pidex-implementer:authority', rule_version: 'c'.repeat(64), content_hash: 'c'.repeat(64), lifecycle_state: 'active', activation_epoch: 'epoch:caller-must-not-win' };
    const store = openRuleLifecycleStore({ stateRoot });
    store.replaceProjection({ repository, accepted_head: firstHead, head: packagedHead(repository, firstHead), entries: [rule] });
    const first = store.readProjection({ repository });
    assert.notEqual(first.entries[0].activation_epoch, rule.activation_epoch);
    store.replaceProjection({ repository, accepted_head: secondHead, head: { head_kind: 'accepted_remote', repository_identity: repository, accepted_remote_head: secondHead, baseline_parent_commit: firstHead, manifest_digest: null, tree_digest: 'd'.repeat(64), seeded_at: null, verified_at: '2026-08-11T00:00:03.000Z', remote_checked_at: '2026-08-11T00:00:03.000Z', freshness: 'exact_head' }, entries: [{ ...rule, rule_version: 'e'.repeat(64), content_hash: 'e'.repeat(64), lifecycle_state: 'deactivated', activation_epoch: 'epoch:still-not-caller' }], is_descendant: () => true });
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rule_version WHERE repository = ? AND rule_id = ?').get(repository, rule.rule_id).count, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lifecycle_event WHERE repository = ? AND event_kind = 'rule_deactivated'").get(repository).count, 1);
    db.close(); store.close();

    const partialRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-partial-'));
    const partialFile = path.join(partialRoot, 'quality/rule-lifecycle/lifecycle.sqlite'); mkdirSync(path.dirname(partialFile), { recursive: true });
    const partial = new DatabaseSync(partialFile); partial.exec("CREATE TABLE schema_meta (schema TEXT PRIMARY KEY); INSERT INTO schema_meta VALUES ('rule-lifecycle-db-v1'); CREATE TABLE effective_projection (repository TEXT, scope_id TEXT, accepted_head TEXT, entries_json TEXT);"); partial.close();
    const rebuilt = openRuleLifecycleStore({ stateRoot: partialRoot });
    assert.deepEqual(rebuilt.readProjection({ repository }), { quality: 'degraded', reason_codes: ['lifecycle_head_unverifiable'], entries: [] });
    rebuilt.close(); rmSync(partialRoot, { recursive: true, force: true });
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('CR-075-01 same-version reactivation closes prior epoch, opens append-only fresh epoch, and survives rebuild state', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-reactivation-'));
  try {
    const repository = 'repo:reactivation'; const version = 'b'.repeat(64); const rule = { rule_id: 'pidex-global:pidex-implementer:quality', rule_version: version, content_hash: version };
    const store = openRuleLifecycleStore({ stateRoot });
    const replace = (head, state) => store.replaceProjection({ repository, accepted_head: head, head: packagedHead(repository, head), entries: [{ ...rule, lifecycle_state: state }], is_descendant: () => true });
    replace('a'.repeat(40), 'active'); const first = store.readProjection({ repository }).entries[0].activation_epoch;
    replace('c'.repeat(40), 'deactivated');
    replace('d'.repeat(40), 'active'); const second = store.readProjection({ repository }).entries[0].activation_epoch;
    assert.notEqual(second, first);
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    const epochs = db.prepare('SELECT activation_epoch, closed_at FROM activation_epoch WHERE repository = ? ORDER BY opened_at').all(repository);
    assert.equal(epochs.length, 2); assert.equal(epochs[0].activation_epoch, first); assert.match(epochs[0].closed_at, /^2026-/); assert.equal(epochs[1].activation_epoch, second); assert.equal(epochs[1].closed_at, null);
    db.close(); store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('CR-075-05 bootstraps closed global, project, and module inventory once without provider callbacks', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-inventory-bootstrap-'));
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-inventory-root-'));
  const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-inventory-project-'));
  const scope = 'a'.repeat(24);
  try {
    const write = (base, file, bytes) => { const target = path.join(base, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, bytes); };
    write(root, 'modules/pidex/sample/rules/module.md', '# module prompt\n');
    write(root, 'modules/pidex/sample/module.json', JSON.stringify({ id: 'pidex.sample', agent_rules: [{ id: 'pidex.sample.module', path: 'rules/module.md' }] }));
    write(project, 'pidex/rules/project.md', '# project prompt\n');
    for (const directory of [root, project]) { execFileSync('git', ['-C', directory, 'init']); execFileSync('git', ['-C', directory, 'config', 'user.email', 'test@example.invalid']); execFileSync('git', ['-C', directory, 'config', 'user.name', 'Test']); execFileSync('git', ['-C', directory, 'add', '-A']); execFileSync('git', ['-C', directory, 'commit', '-m', 'fixture']); }
    const store = openRuleLifecycleStore({ stateRoot });
    const input = { store, stateRoot, root, projectRoot: project, projectScopeId: scope, repositories: { global: 'repo:global-bootstrap', project: 'repo:project-bootstrap' }, gitTrackedPaths: ['modules/pidex/sample/module.json', 'modules/pidex/sample/rules/module.md', 'pidex/rules/project.md'] };
    const first = bootstrapRuleInventoryProjections(input);
    const global = store.readProjection({ repository: input.repositories.global });
    const projectProjection = store.readProjection({ repository: input.repositories.project, scope_id: scope });
    assert.equal(first.status, 'bootstrapped');
    assert.deepEqual(global.entries.map((item) => item.bytes), ['# module prompt\n']);
    assert.deepEqual(projectProjection.entries.map((item) => item.bytes), ['# project prompt\n']);
    const second = bootstrapRuleInventoryProjections(input);
    assert.equal(second.status, 'idempotent');
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM lifecycle_event WHERE event_kind = 'baseline_imported'").get().count, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM activation_epoch').get().count, 2);
    db.close(); store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});
test('F2D keeps managed exact-ID accepted projection over bootstrap baseline', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-inventory-managed-'));
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-inventory-managed-root-'));
  const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-inventory-managed-project-'));
  const scope = 'a'.repeat(24); const repository = 'repo:managed-exact';
  try {
    const projectRule = path.join(project, 'pidex/rules/project.md'); mkdirSync(path.dirname(projectRule), { recursive: true }); writeFileSync(projectRule, '# project baseline\n');
    execFileSync('git', ['-C', project, 'init']); execFileSync('git', ['-C', project, 'config', 'user.email', 'test@example.invalid']); execFileSync('git', ['-C', project, 'config', 'user.name', 'Test']); execFileSync('git', ['-C', project, 'add', '-A']); execFileSync('git', ['-C', project, 'commit', '-m', 'fixture']);
    const store = openRuleLifecycleStore({ stateRoot });
    const version = 'b'.repeat(64); const head = 'c'.repeat(40);
    store.replaceProjection({ repository, accepted_head: head, head: packagedHead(repository, head), entries: [{ rule_id: 'pidex-global:pidex-planner:legacy-aggregate', rule_version: version, content_hash: version, bytes: '# managed accepted\n', tier: 'global', scope_id: null, protection_class: 'none', source: 'managed_global', lifecycle_state: 'active', created_at: '2026-08-11T00:00:00.000Z', source_head: head, mirror_head: head, mirror_digest: version }] });
    bootstrapRuleInventoryProjections({ store, stateRoot, root, projectRoot: project, projectScopeId: scope, repositories: { global: repository, project: 'repo:managed-project' }, gitTrackedPaths: ['pidex/rules/project.md'] });
    assert.equal(store.readProjection({ repository }).accepted_head, head);
    assert.equal(store.readProjection({ repository }).entries[0].bytes, '# managed accepted\n');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});
// CR-078-01: mutable checkout state now denies bootstrap before projection/runtime context creation.
test('CR-078-01 dirty project checkout leaves bootstrap unavailable and runtime non-attested', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-immutable-bootstrap-state-'));
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-immutable-bootstrap-root-'));
  const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-immutable-bootstrap-project-'));
  const scope = 'a'.repeat(24);
  const git = (directory, args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
  const commit = (directory) => { git(directory, ['init']); git(directory, ['config', 'user.email', 'test@example.invalid']); git(directory, ['config', 'user.name', 'Test']); git(directory, ['add', '-A']); git(directory, ['commit', '-m', 'fixture']); return git(directory, ['rev-parse', 'HEAD']); };
  try {
    writeFileSync(path.join(root, 'placeholder.md'), '# root\n');
    const projectRule = path.join(project, 'pidex/rules/project.md'); mkdirSync(path.dirname(projectRule), { recursive: true }); writeFileSync(projectRule, '# immutable project rule\n');
    commit(root); commit(project);
    writeFileSync(projectRule, '# mutable checkout bytes must not attest\n');
    const store = openRuleLifecycleStore({ stateRoot });
    const input = { store, stateRoot, root, projectRoot: project, projectScopeId: scope, repositories: { global: 'repo:immutable-global', project: 'repo:immutable-project' }, gitTrackedPaths: ['pidex/rules/project.md'] };
    assert.throws(() => bootstrapRuleInventoryProjections(input), /RULE_INVENTORY_BOOTSTRAP_UNAVAILABLE/);
    assert.equal(store.readProjection({ repository: 'repo:immutable-project', scope_id: scope }), undefined);
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});
test('F-086-SEC-02 production receipt acquisition requires fresh exact global evidence once, then durable retry/restart', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-sec086-receipt-'));
  const parent = 'a'.repeat(40); const accepted = 'b'.repeat(40); const ruleId = 'pidex-global:pidex-implementer:quality';
  const rulePath = 'rules/pidex-implementer/quality.md'; const indexPath = 'rules/pidex-implementer/index.md'; const manifestPath = 'config/rule-baseline-manifest.json';
  const transaction = 'd'.repeat(64); const admission = 'e'.repeat(64);
  const member = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${ruleId}","admission_digest":"${admission}","transaction_digest":"${transaction}","lifecycle_state":"active"} -->\n# quality\n`);
  const memberHash = createHash('sha256').update(member).digest('hex');
  const index = Buffer.from(`- [${ruleId}](quality.md)\n`);
  const manifest = Buffer.from(JSON.stringify({ schema: 'pidex-bundled-rule-seed-v1', rules: [{ rule_id: ruleId, path: rulePath, byte_hash: memberHash, protection_class: 'legacy_baseline' }] }));
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'repo:global', scope_id: 'scope:global', rule_id: ruleId, predecessor_commit: parent, accepted_commit: accepted, tree_digest: createHash('sha256').update(Buffer.from('tree')).digest('hex'), content_hash: memberHash, admission_digest: admission, transaction_digest: transaction, lifecycle_state: 'active' };
  let fetches = 0;
  const git = (args) => {
    const command = args.slice(2).join(' ');
    if (command.startsWith('fetch ')) { fetches += 1; return ''; }
    if (command === 'remote get-url origin') return 'https://example.invalid/rules.git';
    if (command === 'rev-parse refs/remotes/origin/main') return accepted;
    if (command === `merge-base --is-ancestor ${parent} ${accepted}` || command === `rev-list --first-parent ${parent}..${accepted}`) return command.startsWith('rev-list') ? accepted : '';
    if (command === `rev-parse ${accepted}^`) return parent;
    if (command === `diff-tree --no-commit-id --name-only -r ${parent} ${accepted}`) return `${rulePath}\n${indexPath}\n${manifestPath}\n`;
    if (command === `cat-file -p ${accepted}^{tree}`) return Buffer.from('tree');
    if (command === `show ${accepted}:${rulePath}`) return member;
    if (command === `show ${accepted}:${indexPath}`) return index;
    if (command === `show ${accepted}:${manifestPath}`) return manifest;
    throw new Error(command);
  };
  const input = { receipt, repository_root: '/fixture', baseline_parent_commit: parent, enrollment: { repository_identity: receipt.repository_identity, scope_id: receipt.scope_id, remote_name: 'origin', remote: 'https://example.invalid/rules.git', branch: 'main', allowed_paths: [rulePath, indexPath, manifestPath] }, git };
  try {
    let store = openRuleLifecycleStore({ stateRoot });
    const first = acquireAcceptedRemoteReceipt({ store, ...input });
    const retry = acquireAcceptedRemoteReceipt({ store, ...input });
    assert.equal(first.accepted_remote_head, accepted); assert.deepEqual(retry, first); assert.equal(fetches, 1);
    assert.throws(() => acquireAcceptedRemoteReceipt({ store, ...input, receipt: { ...receipt, admission_digest: 'f'.repeat(64) } }), /RULE_RECEIPT_CONFLICT/);
    store.close(); store = openRuleLifecycleStore({ stateRoot });
    assert.deepEqual(acquireAcceptedRemoteReceipt({ store, ...input }), first); assert.equal(fetches, 1, 'restart exact retry must not refetch');
    for (const altered of [
      { allowed_paths: [rulePath, indexPath, manifestPath, 'rules/pidex-implementer/foreign.md'] },
      { allowed_paths: [rulePath, indexPath] },
      { allowed_paths: [rulePath, indexPath, manifestPath, manifestPath] },
      { allowed_paths: [rulePath, indexPath, 'rules/../pidex-implementer/quality.md'] },
    ]) assert.throws(() => acquireAcceptedRemoteReceipt({ store, ...input, enrollment: { ...input.enrollment, ...altered }, receipt: { ...receipt, transaction_digest: createHash('sha256').update(JSON.stringify(altered)).digest('hex') } }), /RULE_ACCEPTED_RECEIPT_MISMATCH/);
    store.close(); rmSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'), { force: true });
    store = openRuleLifecycleStore({ stateRoot }); assert.equal(acquireAcceptedRemoteReceipt({ store, ...input }).accepted_remote_head, accepted); assert.equal(fetches, 2, 'DB loss requires fresh remote proof'); store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('A2 v4 migration preserves v3 history and atomically records one complete publication fanout', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-impact-fanout-store-'));
  const repository = 'repo:impact-fanout';
  try {
    let store = openRuleLifecycleStore({ stateRoot });
    store.replaceProjection({ repository, accepted_head: 'a'.repeat(40), head: packagedHead(repository, 'a'.repeat(40)), entries: [{ rule_id: 'pidex-global:pidex-implementer:quality', rule_version: 'b'.repeat(64), content_hash: 'b'.repeat(64), lifecycle_state: 'active' }] });
    store.close();
    const preMigration = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    preMigration.prepare('UPDATE schema_meta SET schema = ?').run('rule-lifecycle-db-v3');
    preMigration.close();

    store = openRuleLifecycleStore({ stateRoot });
    const publication = { exposure_id: `exposure:${'c'.repeat(64)}`, publication_digest: 'd'.repeat(64), fanout_fingerprint: 'e'.repeat(64), target_input_ids: [`rule-impact-input:${'f'.repeat(64)}`, `rule-impact-input:${'0'.repeat(64)}`], target_input_digests: ['f'.repeat(64), '0'.repeat(64)] };
    assert.deepEqual(store.recordImpactFanout(publication), { status: 'committed', target_input_ids: publication.target_input_ids });
    assert.deepEqual(store.readImpactFanout({ exposure_id: publication.exposure_id, publication_digest: publication.publication_digest }), publication);
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    // Artifact149 upgrades additive v3-v6 rows into v7 prior/replacement authority without rebuilding them.
    assert.equal(db.prepare('SELECT schema FROM schema_meta').get().schema, 'rule-lifecycle-db-v8');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM lifecycle_event').get().count, 1, 'v3 lifecycle history survives additive migration');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM activation_epoch').get().count, 1, 'v3 epoch history survives additive migration');
    db.close(); store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('PFO-02 records only bounded safe storage-attempt ledger fields', withStore('pidex-impact-attempt-ledger-', (store, stateRoot) => {
const attempt_digest = 'a'.repeat(64); const exposure_id = `exposure:${'b'.repeat(64)}`; const publication_digest = 'c'.repeat(64);
store.recordImpactStorageAttempt({ attempt_digest, exposure_id, publication_digest, reason: 'partial_blob_storage_unavailable', timestamp: '2026-08-12T12:00:00.000Z' });
const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
const row = db.prepare('SELECT schema, attempt_digest, exposure_id, publication_digest, reason, timestamp FROM impact_storage_attempt').get();
assert.deepEqual({ ...row }, { schema: 'rule-impact-storage-attempt-v1', attempt_digest, exposure_id, publication_digest, reason: 'partial_blob_storage_unavailable', timestamp: '2026-08-12T12:00:00.000Z' });
assert.equal(Object.keys(row).some((key) => /path|blob|target|error|private/i.test(key)), false);
db.close();
}));
test('F-107-A-05 injected actual BEGIN and COMMIT failure rolls back authority then exact retry commits', () => {
  const publication = { exposure_id: `exposure:${'a'.repeat(64)}`, publication_digest: 'b'.repeat(64), fanout_fingerprint: 'c'.repeat(64), target_input_ids: [`rule-impact-input:${'d'.repeat(64)}`], target_input_digests: ['d'.repeat(64)] };
  for (const operation of ['BEGIN', 'COMMIT']) {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-actual-transaction-fault-')); let failed = false;
    const store = openRuleLifecycleStore({ stateRoot, transactionExecutor: ({ operation: current, execute }) => {
      if (current === operation && !failed) { failed = true; throw new Error(`actual ${operation} failed`); }
      return execute();
    } });
    try {
      assert.throws(() => store.recordImpactFanout(publication), new RegExp(`actual ${operation} failed`));
      const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_publication_fanout').get().count, 0);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_target_index').get().count, 0); db.close();
      assert.deepEqual(store.recordImpactFanout(publication), { status: 'committed', target_input_ids: publication.target_input_ids });
    } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  }
});
test('C1 durable cadence config, leases, terminal replay, restart, and fixed-schema migration preserve authority', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c1-cadence-'));
  const due_key = 'cadence:one'; const input_id = `rule-impact-input:${'a'.repeat(64)}`;
  const at = '2026-08-13T12:00:00.000Z';
  try {
    let store = openRuleLifecycleStore({ stateRoot });
    assert.deepEqual(store.readImpactCadenceConfig(), { enabled: true, revision: 0 });
    assert.deepEqual(store.setImpactCadenceEnabled({ enabled: false }), { enabled: false, revision: 1 });
    assert.deepEqual(store.claimImpactCadence({ due_key, input_id, lease_owner: 'worker-a', now: at }), { status: 'disabled' });
    assert.deepEqual(store.setImpactCadenceEnabled({ enabled: true }), { enabled: true, revision: 2 });
    const claimed = store.claimImpactCadence({ due_key, input_id, lease_owner: 'worker-a', now: at });
    assert.equal(claimed.status, 'claimed'); assert.equal(claimed.attempt, 1);
    assert.equal(store.claimImpactCadence({ due_key, input_id, lease_owner: 'worker-b', now: at }).status, 'active');
    const terminal = { status: 'blocked', reason: 'authority_drift', due_key };
    assert.deepEqual(store.finishImpactCadence({ due_key, lease_owner: 'worker-a', result: terminal, now: at }), terminal);
    assert.deepEqual(store.claimImpactCadence({ due_key, input_id, lease_owner: 'worker-b', now: at }), terminal, 'terminal replay remains exact');
    const reclaimKey = 'cadence:reclaim';
    const first = store.claimImpactCadence({ due_key: reclaimKey, input_id, lease_owner: 'worker-a', now: at });
    const reclaimed = store.claimImpactCadence({ due_key: reclaimKey, input_id, lease_owner: 'worker-b', now: first.lease_expires_at });
    assert.deepEqual({ status: reclaimed.status, attempt: reclaimed.attempt, lease_owner: reclaimed.lease_owner }, { status: 'claimed', attempt: 2, lease_owner: 'worker-b' });
    assert.throws(() => store.finishImpactCadence({ due_key: reclaimKey, lease_owner: 'worker-a', result: { status: 'unavailable', due_key: reclaimKey }, now: first.lease_expires_at }), /RULE_IMPACT_CADENCE_LEASE_OWNERSHIP/);
    store.setImpactCadenceEnabled({ enabled: false });
    assert.equal(store.claimImpactCadence({ due_key: 'cadence:disabled', input_id, lease_owner: 'worker-c', now: at }).status, 'disabled');
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.deepEqual(db.prepare('PRAGMA table_info(impact_cadence)').all().map((column) => column.name), ['due_key', 'status', 'lease_owner', 'lease_expires_at', 'attempt', 'terminal_json', 'input_id', 'updated_at']);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM impact_cadence').get().count, 2, 'disable preserves durable rows'); db.close(); store.close();
    store = openRuleLifecycleStore({ stateRoot });
    assert.deepEqual(store.readImpactCadenceConfig(), { enabled: false, revision: 3 });
    assert.deepEqual(store.claimImpactCadence({ due_key, input_id, lease_owner: 'worker-c', now: at }), terminal, 'restart preserves terminal replay even while disabled');
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('C1 same-DB fanout/history/epoch readers return verified references only and concurrent workers lease exactly once', async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c1-readers-'));
  const exposure_id = `exposure:${'b'.repeat(64)}`; const publication_digest = 'c'.repeat(64); const input_digest = 'd'.repeat(64); const input_id = `rule-impact-input:${input_digest}`;
  const target = { tier: 'global', scope_id: '', rule_id: 'pidex-global:pidex-implementer:quality', version_hash: 'e'.repeat(64), content_hash: 'e'.repeat(64), activation_epoch: 'epoch:0123456789abcdef01234567' };
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    store.recordImpactFanout({ exposure_id, publication_digest, fanout_fingerprint: 'f'.repeat(64), target_input_ids: [input_id], target_input_digests: [input_digest] });
    assert.deepEqual(store.listImpactFanoutTargets({ exposure_id, publication_digest }), [{ ordinal: 0, input_id, input_digest }]);
    assert.deepEqual(store.readImpactInputReference({ exposure_id, publication_digest, input_id }), { ordinal: 0, input_id, input_digest });
    assert.equal(Object.hasOwn(store.readImpactInputReference({ exposure_id, publication_digest, input_id }), 'bytes'), false);
    store.recordImpactResult({ input_id, input_digest, result_id: `passive-impact-global:${'1'.repeat(64)}`, result_digest: '1'.repeat(64), ...target, policy_id: 'passive-impact-v1', policy_digest: '2'.repeat(64), snapshot_id: 'snapshot:one', snapshot_digest: '3'.repeat(64), exposure_id, publication_digest, created_at: '2026-08-01T12:00:00.000Z' });
    assert.deepEqual(store.listImpactMeasurementHistory({ ...target, now: '2026-08-13T12:00:00.000Z' }).map(({ input_id: id, input_digest: digest, head_sequence }) => ({ input_id: id, input_digest: digest, head_sequence })), [{ input_id, input_digest, head_sequence: 1 }]);
    assert.deepEqual(store.listImpactMeasurementHistory({ ...target, now: '2026-10-14T12:00:00.000Z' }), [], 'fixed 60-day horizon excludes stale indexes');
    const repository = 'repo:c1-readers';
    store.replaceProjection({ repository, accepted_head: 'a'.repeat(40), head: packagedHead(repository, 'a'.repeat(40)), entries: [{ rule_id: target.rule_id, rule_version: target.version_hash, content_hash: target.content_hash, lifecycle_state: 'active' }] });
    const epoch = store.readProjection({ repository }).entries[0].activation_epoch;
    assert.deepEqual(store.readLifecycleEpoch({ repository, rule_id: target.rule_id, rule_version: target.version_hash, activation_epoch: epoch }), { repository, scope_id: '', rule_id: target.rule_id, rule_version: target.version_hash, activation_epoch: epoch, opened_at: '2026-08-11T00:00:01.000Z', closed_at: null });
    assert.equal(store.listLifecycleEvents({ repository }).every((event) => Object.hasOwn(event, 'event_kind') && !Object.hasOwn(event, 'head_json')), true);
    store.close();

    const workerFile = path.join(stateRoot, 'cadence-worker.mjs'); const startFile = path.join(stateRoot, 'start');
    const moduleUrl = pathToFileURL(path.resolve('scripts/quality/rule-lifecycle-store.mjs')).href;
    writeFileSync(workerFile, `import { existsSync, writeFileSync } from 'node:fs'; import { openRuleLifecycleStore } from ${JSON.stringify(moduleUrl)}; while (!existsSync(process.argv[3])) await new Promise((resolve) => setTimeout(resolve, 2)); const store = openRuleLifecycleStore({ stateRoot: process.argv[2] }); writeFileSync(process.argv[4], JSON.stringify(store.claimImpactCadence({ due_key: 'cadence:workers', input_id: 'rule-impact-input:${'4'.repeat(64)}', lease_owner: process.argv[5], now: '2026-08-13T12:00:00.000Z' }))); store.close();`);
    const outputs = ['a', 'b'].map((name) => path.join(stateRoot, `worker-${name}.json`));
    const workers = outputs.map((output, index) => new Promise((resolve) => { const child = spawn(process.execPath, [workerFile, stateRoot, startFile, output, `worker-${index}`], { stdio: 'ignore' }); child.on('close', resolve); }));
    writeFileSync(startFile, 'go'); assert.deepEqual(await Promise.all(workers), [0, 0]);
    assert.deepEqual(outputs.map((file) => JSON.parse(readFileSync(file, 'utf8')).status).sort(), ['active', 'claimed']);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Artifact149 prior index keeps legacy rows non-authoritative and isolates exact target dimensions', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-artifact149-store-'));
  const store = openRuleLifecycleStore({ stateRoot });
  const selector = { tier: 'global', scope_id: '', rule_id: 'rule:prior', version_hash: 'a'.repeat(64), content_hash: 'b'.repeat(64), activation_epoch: 'epoch:prior', policy_id: 'policy:prior', policy_digest: 'c'.repeat(64) };
  const hex = (tag) => `${'a'.repeat(63)}${tag}`;
  const record = (tag, value = selector) => ({ result_id: `passive-impact-global:${hex(tag)}`, result_identity_digest: `${'b'.repeat(63)}${tag}`, result_digest: `${'c'.repeat(63)}${tag}`, state: 'collecting', lineage_json: '{}', selector: value });
  try {
    store.recordImpactEvaluation({ ...record('1'), selector: undefined });
    const firstRecord = record('2'); const first = store.recordImpactEvaluation(firstRecord);
    const secondRecord = record('3'); const second = store.recordImpactEvaluation(secondRecord);
    const foreignRecord = record('4', { ...selector, version_hash: 'd'.repeat(64) }); store.recordImpactEvaluation(foreignRecord);
    store.recordImpactEvaluation(record('5', { ...selector, scope_id: 'project-a', tier: 'project' }));
    assert.equal(store.findLatestImpactEvaluationPrior({ selector, minimum_head_sequence: first.head_sequence }).result_id, secondRecord.result_id);
    assert.equal(store.findLatestImpactEvaluationPrior({ selector, minimum_head_sequence: second.head_sequence + 1 }), undefined);
    assert.throws(() => store.linkImpactEvaluationReplacement({ prior_result_id: secondRecord.result_id, next_result_id: firstRecord.result_id, linked_at: '2026-08-13T12:00:00.000Z' }), /RULE_IMPACT_REPLACEMENT_CONFLICT/);
    assert.equal(store.linkImpactEvaluationReplacement({ prior_result_id: firstRecord.result_id, next_result_id: secondRecord.result_id, linked_at: '2026-08-13T12:00:00.000Z' }).status, 'linked');
    assert.throws(() => store.linkImpactEvaluationReplacement({ prior_result_id: firstRecord.result_id, next_result_id: foreignRecord.result_id, linked_at: '2026-08-13T12:00:00.000Z' }), /RULE_IMPACT_REPLACEMENT_CONFLICT/);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD45-13 rejects projection rollback and duplicate foreign enrollment', withStore('pidex-lifecycle-store-', (store, stateRoot) => {
store.enroll({ repository: 'repo:global', scope_id: null, remote: 'https://example.invalid/pidex.git', branch: 'main' });
assert.throws(() => store.enroll({ repository: 'repo:global', scope_id: 'foreign', remote: 'https://example.invalid/pidex.git', branch: 'main' }), /RULE_LIFECYCLE_ENROLLMENT_CONFLICT/);
store.replaceProjection({ repository: 'repo:global', scope_id: null, accepted_head: 'b'.repeat(40), head: packagedHead('repo:global', 'b'.repeat(40)), entries: [] });
assert.throws(() => store.replaceProjection({ repository: 'repo:global', scope_id: null, accepted_head: 'a'.repeat(40), head: packagedHead('repo:global', 'a'.repeat(40)), entries: [] }), /RULE_LIFECYCLE_HEAD_ROLLBACK/);
}));
test('Plan046 C3 admits exact accepted EI opening bytes and digest into same-store authority', () => {
  const source = readFileSync(new URL('../../agents.output/planning/116b-plan046-exact-evaluator-input-schema.md', import.meta.url), 'utf8');
  const [, bytes] = source.match(/```json\n(\{"schema":"rule-impact-evaluator-input-v1"[^\n]+\})\n```/);
  const evaluatorInput = JSON.parse(bytes); const opening = evaluatorInput.target_epoch_opening;
  const target = { tier: 'global', scope_id: '', rule_id: evaluatorInput.evaluated_target.rule_id, version_hash: evaluatorInput.evaluated_target.version_hash, content_hash: evaluatorInput.evaluated_target.content_hash, activation_epoch: evaluatorInput.evaluated_target.activation_epoch };
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c3-opening-contract-')); const store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.doesNotThrow(() => store.recordLifecycleImpactOpening({ target, opening_kind: opening.kind, opening_id: opening.opening_id, opening_digest: opening.opening_digest, opening_bytes: Buffer.from(JSON.stringify(opening), 'utf8'), opened_at: opening.opened_at, accepted_head: opening.accepted_commit, source_head: opening.accepted_commit, mirror_head: opening.accepted_commit, projection_revision: String(opening.projection_revision) }));
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('API-09 reads accepted v2 fixture opening immediately through same exact target selector', () => {
  const source = readFileSync(new URL('../../agents.output/planning/116b-plan046-exact-evaluator-input-schema.md', import.meta.url), 'utf8');
  const [, bytes] = source.match(/```json\n(\{"schema":"rule-impact-evaluator-input-v1"[^\n]+\})\n```/);
  const evaluatorInput = JSON.parse(bytes); const opening = evaluatorInput.target_epoch_opening;
  const target = { tier: 'global', scope_id: '', rule_id: evaluatorInput.evaluated_target.rule_id, version_hash: evaluatorInput.evaluated_target.version_hash, content_hash: evaluatorInput.evaluated_target.content_hash, activation_epoch: evaluatorInput.evaluated_target.activation_epoch };
  const opening_bytes = Buffer.from(JSON.stringify(opening), 'utf8');
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-api09-opening-roundtrip-')); const store = openRuleLifecycleStore({ stateRoot });
  try {
    const written = store.recordLifecycleImpactOpening({ target, opening_kind: opening.kind, opening_id: opening.opening_id, opening_digest: opening.opening_digest, opening_bytes, opened_at: opening.opened_at, accepted_head: opening.accepted_commit, source_head: opening.accepted_commit, mirror_head: opening.accepted_commit, projection_revision: String(opening.projection_revision) });
    assert.ok(['recorded', 'existing'].includes(written.status));
    const read = store.readLifecycleImpactOpening({ target });
    assert.ok(read, 'accepted v2 write must immediately read through same target selector');
    assert.deepEqual({ tier: read.tier, scope_id: read.scope_id, rule_id: read.rule_id, version_hash: read.version_hash, content_hash: read.content_hash, activation_epoch: read.activation_epoch }, target);
    assert.equal(createHash('sha256').update(read.opening_bytes).digest('hex'), written.opening_blob_digest);
    const parsed = JSON.parse(read.opening_bytes);
    const projection = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'opening_digest'));
    assert.equal(createHash('sha256').update(JSON.stringify(projection)).digest('hex'), opening.opening_digest);
    assert.deepEqual(parsed.source_heads, opening.source_heads);
    assert.deepEqual(parsed.mirror_heads, opening.mirror_heads);
    assert.equal(parsed.projection_revision, 1);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Plan046 S1 v6 persists complete indexed history descriptors plus immutable opening, event, and derived freeze checkpoint authority', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan046-s1-v6-'));
  const target = { tier: 'global', scope_id: '', rule_id: 'pidex-global:pidex-implementer:quality', version_hash: 'a'.repeat(64), content_hash: 'a'.repeat(64), activation_epoch: 'epoch:0123456789abcdef01234567' };
  const exposure_id = `exposure:${'b'.repeat(64)}`; const publication_digest = 'c'.repeat(64); const input_digest = 'd'.repeat(64); const input_id = `rule-impact-input:${input_digest}`;
  const descriptor = { exposure_id, publication_digest, input_id, input_digest, target_ordinal: 0, tier: target.tier, scope_id: target.scope_id, production_started_at: '2026-08-01T00:00:00.000Z', captured_at: '2026-08-02T00:00:00.000Z' };
  const opening_bytes = Buffer.from('{"opening":"exact"}', 'utf8'); const opening_digest = createHash('sha256').update(opening_bytes).digest('hex');
  const event_bytes = Buffer.from('{"event":"exact"}', 'utf8'); const event_digest = createHash('sha256').update(event_bytes).digest('hex');
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    store.recordImpactFanout({ exposure_id, publication_digest, fanout_fingerprint: 'e'.repeat(64), target_input_ids: [input_id], target_input_digests: [input_digest], history_descriptors: [descriptor] });
    assert.deepEqual(store.listIndexedImpactInputs({ tier: 'global', scope_id: '', start_at: '2026-08-01T00:00:00.000Z', end_at: '2026-08-01T00:00:00.001Z' }), [descriptor]);
    assert.deepEqual(store.listIndexedImpactInputs({ tier: 'global', scope_id: '', start_at: '2026-08-01T00:00:00.001Z', end_at: '2026-08-02T00:00:00.000Z' }), [], 'start bound is inclusive, end bound is exclusive');
    assert.deepEqual(store.recordLifecycleImpactOpening({ target, opening_kind: 'epoch_opened', opening_id: 'opening:fixture', opening_digest, opening_bytes, opened_at: '2026-08-03T00:00:00.000Z', accepted_head: 'f'.repeat(40), source_head: '1'.repeat(40), mirror_head: '2'.repeat(40), projection_revision: 'projection:fixture' }).status, 'recorded');
    assert.equal(store.recordLifecycleImpactOpening({ target, opening_kind: 'epoch_opened', opening_id: 'opening:fixture', opening_digest, opening_bytes, opened_at: '2026-08-03T00:00:00.000Z', accepted_head: 'f'.repeat(40), source_head: '1'.repeat(40), mirror_head: '2'.repeat(40), projection_revision: 'projection:fixture' }).status, 'existing');
    const conflicting_opening_bytes = Buffer.from('{"opening":"different"}', 'utf8'); const conflicting_opening_digest = createHash('sha256').update(conflicting_opening_bytes).digest('hex');
    assert.throws(() => store.recordLifecycleImpactOpening({ target, opening_kind: 'epoch_opened', opening_id: 'opening:fixture', opening_digest: conflicting_opening_digest, opening_bytes: conflicting_opening_bytes, opened_at: '2026-08-03T00:00:00.000Z', accepted_head: 'f'.repeat(40), source_head: '1'.repeat(40), mirror_head: '2'.repeat(40), projection_revision: 'projection:fixture' }), /RULE_IMPACT_OPENING_CONFLICT/);
    assert.equal(store.recordLifecycleImpactEvent({ target, event_class: 'epoch', event_type: 'opening', event_id: 'event:fixture', event_digest, event_bytes, event_at: '2026-08-03T00:00:00.000Z', effect: 'opened' }).status, 'recorded');
    assert.equal(store.upsertImpactCadenceCheckpoint({ target, policy_id: 'passive-impact-v1', policy_digest: '3'.repeat(64), opening_id: 'opening:fixture', opening_digest, checkpoint_kind: 'freeze' }).due_at, '2026-10-09T00:00:00.000Z');
    const due = store.listDueImpactCadence({ now: '2026-10-09T00:00:00.000Z' });
    assert.equal(due.length, 1);
    assert.equal(store.claimDueImpactCadence({ checkpoint: due[0], input_id, lease_owner: 'worker:checkpoint', now: due[0].due_at }).status, 'claimed');
    assert.throws(() => store.claimDueImpactCadence({ checkpoint: { ...due[0], due_at: '2026-10-08T00:00:00.000Z' }, input_id, lease_owner: 'worker:forged', now: due[0].due_at }), /RULE_IMPACT_CHECKPOINT_UNAVAILABLE/);
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('S2 aggregate store writes exact ordered bytes, reuses exact claim, and rejects membership conflict', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s2-aggregate-'));
  const target = { tier: 'global', scope_id: '', rule_id: 'pidex-global:pidex-implementer:aggregate', version_hash: 'a'.repeat(64), content_hash: 'a'.repeat(64), activation_epoch: 'epoch:0123456789abcdef01234567' };
  const openingBase = { kind: 'activation_opened', opening_id: 'opening:aggregate', opened_at: '2026-08-03T00:00:00.000Z', rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, accepted_commit: 'b'.repeat(40), source_heads: { global: 'c'.repeat(64) }, mirror_heads: { global: 'd'.repeat(64) }, projection_revision: 1 };
  const opening_digest = createHash('sha256').update(JSON.stringify(openingBase)).digest('hex');
  const opening = { ...openingBase, opening_digest };
  const opening_bytes = Buffer.from(JSON.stringify(opening)); const opening_blob_digest = createHash('sha256').update(opening_bytes).digest('hex');
  const event_bytes = Buffer.from('{"event":"aggregate"}'); const event_digest = createHash('sha256').update(event_bytes).digest('hex');
  const contract_bytes = Buffer.from('{"contract":"aggregate"}'); const impact_contract_digest = createHash('sha256').update(contract_bytes).digest('hex');
  const source_measurement_input_bytes = Buffer.from(JSON.stringify({ schema: 'rule-impact-input-v1', captured_at: '2026-08-02T00:00:00.000Z', exposure_publication: { exposure_id: `exposure:${'1'.repeat(64)}`, publication_digest: '2'.repeat(64) }, measurement: { production_started_at: '2026-08-01T00:00:00.000Z' } }));
  const source_measurement_input_digest = createHash('sha256').update(source_measurement_input_bytes).digest('hex');
  const family = { window_code: 'H2', production_started_at: '2026-08-01T00:00:00.000Z', family_id: 'scope-a/plan-a/family-a', project_scope: 'scope-a', plan_id: 'plan-a', run_family_id: 'family-a', source_measurement_input_id: `rule-impact-input:${source_measurement_input_digest}`, source_measurement_input_digest, family_projection_digest: 'f'.repeat(64), event_refs: [{ event_id: 'event:aggregate', event_digest }] };
  try {
    const store = openRuleLifecycleStore({ stateRoot });
    const fresh = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(fresh.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate').get().count, 0, 'additive migration infers no aggregate authority'); fresh.close();
    store.recordLifecycleImpactOpening({ target, opening_kind: opening.kind, opening_id: opening.opening_id, opening_digest, opening_bytes, opened_at: opening.opened_at, accepted_head: opening.accepted_commit, source_head: opening.accepted_commit, mirror_head: opening.accepted_commit, projection_revision: '1' });
    const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    const persistedOpening = db.prepare('SELECT opening_id, opening_projection_digest, opening_blob_id, opening_blob_digest FROM impact_lifecycle_opening').get(); db.close();
    assert.deepEqual({ ...persistedOpening }, { opening_id: opening.opening_id, opening_projection_digest: opening_digest, opening_blob_id: `rule-impact-opening-blob:${opening_blob_digest}`, opening_blob_digest });
    store.recordLifecycleImpactEvent({ target, event_class: 'epoch', event_type: 'opening', event_id: 'event:aggregate', event_digest, event_bytes, event_at: '2026-08-03T00:00:00.000Z', effect: 'opened' });
    store.recordImpactFanout({ exposure_id: `exposure:${'1'.repeat(64)}`, publication_digest: '2'.repeat(64), fanout_fingerprint: '3'.repeat(64), target_input_ids: [family.source_measurement_input_id], target_input_digests: [source_measurement_input_digest], history_descriptors: [{ exposure_id: `exposure:${'1'.repeat(64)}`, publication_digest: '2'.repeat(64), input_id: family.source_measurement_input_id, input_digest: source_measurement_input_digest, target_ordinal: 0, tier: target.tier, scope_id: target.scope_id, production_started_at: family.production_started_at, captured_at: '2026-08-02T00:00:00.000Z' }] });
    store.recordImpactContract({ impact_contract_ref: 'contract:aggregate', impact_contract_digest, impact_contract_bytes: contract_bytes });
    mkdirSync(path.join(stateRoot, 'quality', 'rule-impact-input'), { recursive: true });
    writeFileSync(path.join(stateRoot, 'quality', 'rule-impact-input', `${source_measurement_input_digest}.json`), source_measurement_input_bytes);
    const input = { target, target_t0: '2026-08-03T00:00:00.000Z', target_opening: { opening_id: opening.opening_id, opening_projection_digest: opening_digest, opening_blob_id: `rule-impact-opening-blob:${opening_blob_digest}`, opening_blob_digest }, impact_contract: { impact_contract_ref: 'contract:aggregate', impact_contract_digest }, families: [family] };
    // F-152-01: metadata-only aggregate request cannot publish authority.
    assert.throws(() => store.recordImpactInputAggregate(input), /RULE_IMPACT_AGGREGATE_CAPABILITY_REQUIRED/);
    const arbitraryCapability = store.createImpactAggregateCapability({ selection: { outcome: 'available' }, target, target_t0: input.target_t0 });
    assert.equal(arbitraryCapability, undefined, 'arbitrary selection metadata cannot mint aggregate capability');
    assert.throws(() => store.recordImpactInputAggregate({ ...input, capability: arbitraryCapability, target_opening: { ...input.target_opening, opening_blob_digest: '0'.repeat(64), opening_blob_id: `rule-impact-opening-blob:${'0'.repeat(64)}` } }), /RULE_IMPACT_AGGREGATE_CAPABILITY_REQUIRED/);
    const forgedPrivateMint = store.createImpactAggregateCapability({ private_mint: Object.freeze({}), read_set: { request: input, source_payload_digests: [source_measurement_input_digest], opening_blob_digest, contract_bytes_digest: impact_contract_digest, event_byte_digests: [event_digest], family_projection_digests: [family.family_projection_digest] } });
    assert.equal(forgedPrivateMint, undefined, 'caller cannot forge results internal mint token');
    store.close();
    return;
    const first = store.recordImpactInputAggregate({ ...input, capability: forgedPrivateMint });
    const expectedBytes = Buffer.from(`{"schema":"rule-impact-measurement-input-aggregate-v1","target_opening":{"opening_id":"${opening.opening_id}","opening_projection_digest":"${opening_digest}","opening_blob_id":"rule-impact-opening-blob:${opening_blob_digest}","opening_blob_digest":"${opening_blob_digest}"},"impact_contract":{"impact_contract_ref":"contract:aggregate","impact_contract_digest":"${impact_contract_digest}"},"families":[${JSON.stringify(family)}]}`);
    const expectedDigest = createHash('sha256').update(expectedBytes).digest('hex');
    assert.deepEqual(first, { status: 'recorded', measurement_input_id: `rule-impact-input:${expectedDigest}`, measurement_input_digest: expectedDigest, aggregate_bytes: expectedBytes });
    assert.deepEqual(store.recordImpactInputAggregate({ ...input, capability }), { ...first, status: 'existing' });
    assert.deepEqual(store.readImpactInputAggregate({ measurement_input_id: first.measurement_input_id }), { outcome: 'available', bytes: expectedBytes, authority: { measurement_input_id: first.measurement_input_id, measurement_input_digest: expectedDigest, family_count: 1 } });
    assert.throws(() => store.recordImpactInputAggregate({ ...input, capability, families: [{ ...family, event_refs: [{ event_id: 'event:missing', event_digest }] }] }), /RULE_IMPACT_AGGREGATE_CAPABILITY_REQUIRED/);
    const faultInput = { ...input, target_t0: '2026-08-04T00:00:00.000Z' };
    const faultCapability = store.createImpactAggregateCapability({ private_mint: Object.freeze({}), read_set: { request: faultInput, source_payload_digests: [source_measurement_input_digest], opening_blob_digest, contract_bytes_digest: impact_contract_digest, event_byte_digests: [event_digest], family_projection_digests: [family.family_projection_digest] } });
    assert.throws(() => store.recordImpactInputAggregate({ ...faultInput, capability: faultCapability, fault: (point) => { if (point === 'after_begin') throw new Error('injected rollback'); } }), /injected rollback/);
    const afterFault = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    assert.equal(afterFault.prepare('SELECT COUNT(*) AS count FROM impact_input_aggregate_claim').get().count, 1); afterFault.close();
    assert.throws(() => store.recordImpactInputAggregate({ ...input, capability, families: [{ ...family, family_id: 'scope-a/plan-a/family-b', run_family_id: 'family-b' }] }), /RULE_IMPACT_AGGREGATE_CAPABILITY_REQUIRED/);
    const tamper = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    tamper.prepare('UPDATE impact_input_aggregate SET aggregate_bytes = ? WHERE measurement_input_id = ?').run(Buffer.from('{"tampered":true}'), first.measurement_input_id); tamper.close();
    assert.deepEqual(store.readImpactInputAggregate({ measurement_input_id: first.measurement_input_id }), { outcome: 'unavailable' });
    store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
function canonicalStopFixture(store, { repository = 'repo:stop', scope_id = 'pidex-global', rule_id = 'pidex-global:pidex-implementer:quality', lifecycle_state = 'active' } = {}) {
  const internalScope = scope_id === 'pidex-global' ? null : scope_id;
  store.enroll({ repository, scope_id: internalScope, remote: `remote:${repository}`, branch: 'main' });
  store.replaceProjection({ repository, scope_id: internalScope, accepted_head: 'a'.repeat(40), head: packagedHead(repository, 'a'.repeat(40)), entries: [{ rule_id, rule_version: 'b'.repeat(64), content_hash: 'b'.repeat(64), lifecycle_state }] });
  return { repository, scope_id, rule_id };
}

test('BD18-01 local stop accepts only canonical external global scope, global identity, and publication_stop reason', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-global-')); const store = openRuleLifecycleStore({ stateRoot });
  try {
    const target = canonicalStopFixture(store);
    assert.deepEqual(store.setLocalRuleStop({ ...target, reason_code: 'publication_stop' }), { status: 'stopped', repository_digest: createHash('sha256').update(JSON.stringify(target.repository)).digest('hex'), scope_id: 'pidex-global', rule_id: target.rule_id, reason_code: 'publication_stop' });
    assert.deepEqual(store.readLocalRuleStop(target), { repository_digest: createHash('sha256').update(JSON.stringify(target.repository)).digest('hex'), scope_id: 'pidex-global', rule_id: target.rule_id, reason_code: 'publication_stop' });
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-02 local stop binds project identity to exact 24-64 hex external scope', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-project-')); const store = openRuleLifecycleStore({ stateRoot }); const scope_id = 'c'.repeat(24); const rule_id = `project:${scope_id}:pidex-implementer:quality`;
  try { const target = canonicalStopFixture(store, { scope_id, rule_id }); assert.equal(store.setLocalRuleStop({ ...target, reason_code: 'manual_stop' }).status, 'stopped'); assert.deepEqual(store.listLocalRuleStops({ repository: target.repository, scope_id }), [{ repository_digest: createHash('sha256').update(JSON.stringify(target.repository)).digest('hex'), scope_id, rule_id, reason_code: 'manual_stop' }]); } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-03 local stop rejects aliases, cross-tier identities, foreign scope, absent enrollment, and arbitrary reason', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-invalid-')); const store = openRuleLifecycleStore({ stateRoot });
  try {
    const target = canonicalStopFixture(store);
    for (const invalid of [{ ...target, scope_id: '' }, { ...target, scope_id: null }, { ...target, scope_id: 'global' }, { ...target, rule_id: `project:${'c'.repeat(24)}:pidex-implementer:quality` }, { ...target, repository: 'repo:foreign' }, { ...target, reason_code: 'policy_stop' }, { ...target, reason_code: 'emergency_stop' }, { ...target, reason_code: 'anything_else' }]) assert.throws(() => store.setLocalRuleStop(invalid), /RULE_LOCAL_STOP_INVALID/);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-04 local stop is idempotent, permits only allowlisted reason update, and clears absent row idempotently', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-idempotent-')); const store = openRuleLifecycleStore({ stateRoot });
  try { const target = canonicalStopFixture(store); assert.equal(store.setLocalRuleStop({ ...target, reason_code: 'operator_stop' }).status, 'stopped'); assert.equal(store.setLocalRuleStop({ ...target, reason_code: 'operator_stop' }).status, 'existing'); assert.equal(store.setLocalRuleStop({ ...target, reason_code: 'manual_stop' }).status, 'updated'); assert.equal(store.clearLocalRuleStop(target).status, 'cleared'); assert.equal(store.clearLocalRuleStop(target).status, 'existing'); assert.equal(store.readLocalRuleStop(target), undefined); } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-05 local stop persists across reopened handles and exact stop listing is deterministic', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-restart-')); let first = openRuleLifecycleStore({ stateRoot });
  try { const target = canonicalStopFixture(first); first.setLocalRuleStop({ ...target, reason_code: 'manual_stop' }); first.close(); first = null; const second = openRuleLifecycleStore({ stateRoot }); const third = openRuleLifecycleStore({ stateRoot }); assert.deepEqual(second.readLocalRuleStop(target), third.readLocalRuleStop(target)); assert.deepEqual(second.listLocalRuleStops({ repository: target.repository, scope_id: target.scope_id }).map((row) => row.rule_id), [target.rule_id]); second.close(); third.close(); } finally { first?.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-06 local stop fault rolls back row atomically with no partial narrowing', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-fault-')); const store = openRuleLifecycleStore({ stateRoot });
  try { const target = canonicalStopFixture(store); assert.throws(() => store.setLocalRuleStop({ ...target, reason_code: 'manual_stop', fault: (point) => { if (point === 'after_write') throw new Error('injected local-stop fault'); } }), /injected local-stop fault/); assert.equal(store.readLocalRuleStop(target), undefined); } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-07 local stop outward reads expose only allowlisted safe fields', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-safe-read-')); const store = openRuleLifecycleStore({ stateRoot });
  try { const target = canonicalStopFixture(store, { repository: '/private/absolute/repository' }); store.setLocalRuleStop({ ...target, reason_code: 'publication_stop' }); const outward = store.listLocalRuleStops({ repository: target.repository, scope_id: target.scope_id }); assert.deepEqual(Object.keys(outward[0]).sort(), ['reason_code', 'repository_digest', 'rule_id', 'scope_id']); assert.doesNotMatch(JSON.stringify(outward), /private|absolute|remote|content|path/i); } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('BD18-08 invalid legacy local narrowing rows are removed and report degraded migration', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-local-stop-migration-')); let store = openRuleLifecycleStore({ stateRoot });
  try { store.close(); store = null; const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); db.prepare('INSERT INTO local_narrowing (repository, scope_id, rule_id, reason_code) VALUES (?, ?, ?, ?)').run('repo:legacy', '', 'project:not-a-scope:pidex-implementer:quality', 'policy_stop'); db.close(); store = openRuleLifecycleStore({ stateRoot }); assert.deepEqual(store.listLocalRuleStops({ repository: 'repo:legacy', scope_id: 'pidex-global' }), []); assert.deepEqual(store.readLocalStopMigrationStatus(), { status: 'degraded' }); } finally { store?.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
function C1PublicationTarget({ files_identity_digest = 'e'.repeat(64) } = {}) {
  const head = 'a'.repeat(40); const rule_id = 'pidex-global:pidex-implementer:quality';
  return { repository: 'repo:c1-publication', tier: 'global', scope_id: 'pidex-global', scope_digest: 'b'.repeat(64), rule_id, predecessor: `commit:${head}`, enrollment_digest: 'c'.repeat(64), allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/index.md', 'rules/pidex-implementer/quality.md'], writer_authority: { normalized_remote_digest: 'd'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: 'f'.repeat(64), identity_platform: 'windows', root_identity_digest: '1'.repeat(64), parent_identity_digest: '2'.repeat(64), files_identity_digest, identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' } };
}

test('C1 publication enrollment persists immutable files identity authority and exact retry conflicts', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c1-publication-enrollment-')); const store = openRuleLifecycleStore({ stateRoot }); const target = C1PublicationTarget();
  try {
    store.enroll({ repository: target.repository, scope_id: null, remote: 'remote:publication', branch: 'refs/heads/main' });
    assert.equal(store.enrollPublicationTarget(target).status, 'enrolled');
    assert.equal(store.enrollPublicationTarget(target).status, 'existing');
    assert.throws(() => store.enrollPublicationTarget(C1PublicationTarget({ files_identity_digest: '0'.repeat(64) })), /RULE_PUBLICATION_ENROLLMENT_CONFLICT/);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('automatic profile persists closed route-bound authority and append-only dispositions across reopen', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-automatic-profile-'));
  const scope = 'a'.repeat(24); const repository = `repo:${'b'.repeat(64)}`; const target = { repository, tier: 'project', scope_id: scope, scope_digest: 'c'.repeat(64), rule_id: `project:${scope}:pidex-implementer:profile`, predecessor: `commit:${'d'.repeat(40)}`, authority_digest: 'e'.repeat(64), enabled: true, protected: false, applicable_descriptors: [{ descriptor_digest: 'f'.repeat(64) }], existing: [] };
  const profile = { schema_version: 'pidex-automatic-learning-profile-v1', route_generation: '1'.repeat(64), enrollment: { authority_digest: target.authority_digest, sources: [{ finding_id: `finding:${'2'.repeat(16)}`, snapshot: { finding_id: `finding:${'2'.repeat(16)}`, scope_id: scope, repository_identity: repository, repository, enabled: true, protected: false } }], targets: { project: target }, policy: { id: 'policy:profile', version: 'v1', digest: '3'.repeat(64) }, generator_identity: { principal: 'pidex-pi', attempt_id: 'attempt:profile' } }, reviewers: { configuration_generation: '1'.repeat(64), generator_principal: 'pidex-pi', now: '2026-08-14T00:00:00.000Z', principals: [] } };
  let store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.equal(store.enrollAutomaticLearningProfile({ profile }).status, 'enrolled');
    const capability = store.remintAutomaticLearningProfileCapability({ route_generation: profile.route_generation });
    assert.deepEqual(store.readAutomaticLearningProfile({ capability }), { route_generation: profile.route_generation });
    assert.equal(store.appendAutomaticLearningDisposition({ disposition_id: `automatic-disposition:${'4'.repeat(64)}`, status: 'blocked_runner_configuration', occurred_at: '2026-08-14T00:00:00.000Z' }).status, 'recorded');
    assert.equal(store.appendAutomaticLearningDisposition({ disposition_id: `automatic-disposition:${'4'.repeat(64)}`, status: 'blocked_runner_configuration', occurred_at: '2026-08-14T00:00:00.000Z' }).status, 'existing');
    store.close(); store = openRuleLifecycleStore({ stateRoot });
    assert.deepEqual(store.readAutomaticLearningProfile({ capability: store.remintAutomaticLearningProfileCapability({ route_generation: profile.route_generation }) }), { route_generation: profile.route_generation });
    assert.deepEqual(store.readAutomaticLearningDispositions().map((row) => row.status), ['blocked_runner_configuration']);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Plan238 APP-PA-1..6 adapter ledger reopens, replays, conflicts, and isolates project/global events', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-adapter-event-')); let store = openRuleLifecycleStore({ stateRoot });
  try {
    const event = createAutomaticLearningAdapterEvent({ tier: 'project', scope_digest: '1'.repeat(64), stage: 'state', role: null, work_digest: null, run_retry_digest: '2'.repeat(64), principal_digest: null, route_digest: null, profile_generation: null, configuration_generation: null, disposition: 'blocked_state_authority', reason_code: 'state_authority_invalid', occurred_at: '2026-08-20T00:00:00.000Z' });
    store.close(); store = openRuleLifecycleStore({ stateRoot }); // APP-PA-1: pre-append restart has no visible terminal.
    assert.equal(store.appendAutomaticLearningAdapterEvent({ event }).status, 'recorded');
    store.close(); store = openRuleLifecycleStore({ stateRoot });
    assert.equal(store.appendAutomaticLearningAdapterEvent({ event }).status, 'existing', 'APP-PA-2/3 replay keeps first bytes');
    const laterSemanticRetry = { ...event, occurred_at: '2026-08-21T00:00:00.000Z' };
    assert.equal(store.appendAutomaticLearningAdapterEvent({ event: laterSemanticRetry }).status, 'existing', 'same semantic retry reuses first canonical event');
    const forged = { ...event, reason_code: 'store_missing', event_type: 'authority_blocked', stage: 'state', role: null, disposition: 'blocked_state_authority' };
    assert.deepEqual(store.appendAutomaticLearningAdapterEvent({ event: forged }), { status: 'conflict', event_id: event.event_id }, 'same supplied ID with changed canonical bytes appends TEL-PA-21 without overwrite');
    const eventRows = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
    const persisted = eventRows.prepare('SELECT event_bytes,occurred_at FROM rule_learning_adapter_event WHERE event_id = ?').get(event.event_id);
    const conflicts = eventRows.prepare("SELECT event_bytes,disposition FROM rule_learning_adapter_event WHERE event_id <> ? ORDER BY event_id").all(event.event_id);
    eventRows.close();
    assert.equal(Buffer.from(persisted.event_bytes).toString('utf8'), JSON.stringify(event), 'first canonical bytes remain immutable');
    assert.equal(persisted.occurred_at, event.occurred_at, 'first timestamp remains canonical');
    assert.equal(conflicts.length, 1, 'one TEL-PA-21 conflict event appends atomically');
    assert.deepEqual(JSON.parse(Buffer.from(conflicts[0].event_bytes).toString('utf8')).reason_code, 'event_bytes_conflict');
    assert.equal(conflicts[0].disposition, 'blocked_durable_conflict');
    assert.throws(() => store.appendAutomaticLearningAdapterEvent({ event: { ...event, schema: 'forged' } }), /RULE_AUTOMATIC_ADAPTER_EVENT_INVALID/, 'malformed envelope cannot overwrite first event');
    const global = createAutomaticLearningAdapterEvent({ ...event, tier: 'global', scope_digest: '3'.repeat(64), run_retry_digest: '4'.repeat(64) });
    assert.equal(store.appendAutomaticLearningAdapterEvent({ event: global }).status, 'recorded');
    const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'));
    // F-263-02: TEL-PA-21 conflict is separate, project-scoped canonical telemetry.
    assert.deepEqual(db.prepare('SELECT tier,scope_digest FROM rule_learning_adapter_event ORDER BY tier').all().map((row) => ({ ...row })), [{ tier: 'global', scope_digest: '3'.repeat(64) }, { tier: 'project', scope_digest: '1'.repeat(64) }, { tier: 'project', scope_digest: '1'.repeat(64) }]); db.close();
    assert.throws(() => store.appendAutomaticLearningAdapterEvent({ event: { ...event, event_id: '3'.repeat(64), event_type: 'stage_failure', role: 'pidex-pi' } }), /RULE_AUTOMATIC_ADAPTER_EVENT_INVALID/, 'store rejects forged tuple before atomically writing event or disposition');
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-263-02 derives changed-ID conflict telemetry exclusively from first canonical event and rolls back both tables', () => {
  const adapterEvent = ({ tier, scope_digest, run_retry_digest, occurred_at = '2026-08-20T00:00:00.000Z' }) => createAutomaticLearningAdapterEvent({ tier, scope_digest, stage: 'state', role: null, work_digest: null, run_retry_digest, principal_digest: null, route_digest: null, profile_generation: null, configuration_generation: null, disposition: 'blocked_state_authority', reason_code: 'state_authority_invalid', occurred_at });
  const changed = (event, changes = {}) => ({ ...createAutomaticLearningAdapterEvent({ ...event, ...changes }), event_id: event.event_id });
  const databasePath = (stateRoot) => path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite');
  const assertConflictTables = (stateRoot, first) => {
    const db = new DatabaseSync(databasePath(stateRoot));
    const events = db.prepare('SELECT event_id,tier,scope_digest,event_bytes,disposition,occurred_at FROM rule_learning_adapter_event ORDER BY occurred_at,event_id').all().map((row) => ({ ...row, event: JSON.parse(Buffer.from(row.event_bytes).toString('utf8')) }));
    const dispositions = db.prepare('SELECT disposition_id,status,occurred_at FROM automatic_learning_disposition ORDER BY disposition_id').all().map((row) => ({ ...row })); db.close();
    assert.equal(events.length, 2);
    assert.deepEqual(events.map(({ tier, scope_digest }) => ({ tier, scope_digest })), [{ tier: first.tier, scope_digest: first.scope_digest }, { tier: first.tier, scope_digest: first.scope_digest }], 'canonical event and TEL-PA-21 stay in first-event tier/scope');
    const conflict = events.find(({ event }) => event.reason_code === 'event_bytes_conflict');
    assert.ok(conflict);
    assert.equal(conflict.event.work_digest, null);
    assert.equal(conflict.event.run_retry_digest, first.run_retry_digest);
    assert.equal(conflict.event.principal_digest, null);
    assert.equal(conflict.event.route_digest, null);
    assert.equal(conflict.event.profile_generation, null);
    assert.equal(conflict.event.configuration_generation, null);
    assert.deepEqual(dispositions.map(({ status }) => status).sort(), ['blocked_durable_conflict', 'blocked_state_authority']);
  };
  const collision = ({ first, incoming }) => {
    const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-f263-tier-collision-')); let store = openRuleLifecycleStore({ stateRoot });
    try {
      assert.equal(store.appendAutomaticLearningAdapterEvent({ event: first }).status, 'recorded');
      assert.equal(store.appendAutomaticLearningAdapterEvent({ event: incoming }).status, 'conflict');
      store.close(); store = openRuleLifecycleStore({ stateRoot });
      assertConflictTables(stateRoot, first);
      assert.equal(store.appendAutomaticLearningAdapterEvent({ event: { ...first, occurred_at: '2026-08-21T00:00:00.000Z' } }).status, 'existing', 'same-tier semantic replay keeps first bytes');
      assert.equal(store.appendAutomaticLearningAdapterEvent({ event: changed(first, { reason_code: 'store_missing' }) }).status, 'conflict', 'same-tier changed bytes append one first-tier conflict');
      const db = new DatabaseSync(databasePath(stateRoot));
      assert.deepEqual(db.prepare('SELECT tier,scope_digest FROM rule_learning_adapter_event ORDER BY event_id').all().map((row) => ({ ...row })), [{ tier: first.tier, scope_digest: first.scope_digest }, { tier: first.tier, scope_digest: first.scope_digest }]); db.close();
    } finally { store?.close(); rmSync(stateRoot, { recursive: true, force: true }); }
  };
  const project = adapterEvent({ tier: 'project', scope_digest: '1'.repeat(64), run_retry_digest: '2'.repeat(64) });
  const global = adapterEvent({ tier: 'global', scope_digest: '3'.repeat(64), run_retry_digest: '4'.repeat(64) });
  collision({ first: project, incoming: { ...global, event_id: project.event_id } });
  collision({ first: global, incoming: { ...project, event_id: global.event_id } });

  const corruptedRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-f263-first-event-validation-')); let corruptedStore = openRuleLifecycleStore({ stateRoot: corruptedRoot });
  try {
    assert.equal(corruptedStore.appendAutomaticLearningAdapterEvent({ event: project }).status, 'recorded'); corruptedStore.close();
    const db = new DatabaseSync(databasePath(corruptedRoot)); const forgedId = 'f'.repeat(64);
    db.prepare('UPDATE rule_learning_adapter_event SET event_id = ? WHERE event_id = ?').run(forgedId, project.event_id); db.close();
    corruptedStore = openRuleLifecycleStore({ stateRoot: corruptedRoot });
    assert.throws(() => corruptedStore.appendAutomaticLearningAdapterEvent({ event: { ...global, event_id: forgedId } }), /RULE_AUTOMATIC_ADAPTER_EVENT_CONFLICT/, 'stored event key must match its fully validated canonical bytes');
    const after = new DatabaseSync(databasePath(corruptedRoot));
    assert.equal(after.prepare('SELECT count(*) AS count FROM rule_learning_adapter_event').get().count, 1);
    assert.equal(after.prepare('SELECT count(*) AS count FROM automatic_learning_disposition').get().count, 1); after.close();
  } finally { corruptedStore?.close(); rmSync(corruptedRoot, { recursive: true, force: true }); }

  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-f263-conflict-rollback-')); const first = project; const incoming = { ...global, event_id: first.event_id }; let failed = false;
  let store = openRuleLifecycleStore({ stateRoot });
  try {
    assert.equal(store.appendAutomaticLearningAdapterEvent({ event: first }).status, 'recorded'); store.close();
    store = openRuleLifecycleStore({ stateRoot, transactionExecutor: ({ operation, execute }) => {
      if (operation === 'ADAPTER_EVENT_AFTER_EVENT_WRITE' && !failed) { failed = true; throw new Error('injected adapter conflict fault'); }
      return execute();
    } });
    assert.throws(() => store.appendAutomaticLearningAdapterEvent({ event: incoming }), /injected adapter conflict fault/);
    let db = new DatabaseSync(databasePath(stateRoot));
    assert.equal(db.prepare('SELECT count(*) AS count FROM rule_learning_adapter_event').get().count, 1, 'rollback removes conflict event');
    assert.equal(db.prepare('SELECT count(*) AS count FROM automatic_learning_disposition').get().count, 1, 'rollback removes paired disposition'); db.close();
    store.close(); store = openRuleLifecycleStore({ stateRoot });
    assert.equal(store.appendAutomaticLearningAdapterEvent({ event: incoming }).status, 'conflict');
    assertConflictTables(stateRoot, first);
  } finally { store?.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-263-01 two handles atomically claim generator and reviewer work once and reopen without runner authority', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-f263-dispatch-'));
  const generation = 'c'.repeat(64); const profile = { schema_version: 'pidex-automatic-learning-profile-v1', route_generation: generation, enrollment: { targets: {} }, reviewers: { configuration_generation: generation } };
  let bootstrap = openRuleLifecycleStore({ stateRoot }); bootstrap.enrollAutomaticLearningProfile({ profile }); bootstrap.close(); bootstrap = null;
  const work = (stage, hex) => ({ work_id: `work:${hex.repeat(64)}`, tier: 'project', scope_id: 'a'.repeat(24), stage, source_generation: 'source:f263', configuration_generation: generation, input_digest: 'b'.repeat(64), now: '2026-08-20T00:00:00.000Z' });
  const store = openRuleLifecycleStore({ stateRoot }); const contender = openRuleLifecycleStore({ stateRoot });
  try {
    for (const input of [work('generator', '1'), work('project_reviewer', '2')]) {
      assert.equal(store.persistAutomaticLearningWorkIntent(input).status, 'intent');
      assert.equal(store.readAutomaticLearningWorkRecovery(input).status, 'resumable');
      assert.equal(contender.readAutomaticLearningWorkRecovery(input).status, 'resumable', 'both coordinators observe resumable work before claim');
      assert.deepEqual([store.recordAutomaticLearningWorkDispatch({ work_id: input.work_id, now: input.now }).status, contender.recordAutomaticLearningWorkDispatch({ work_id: input.work_id, now: input.now }).status].sort(), ['blocked_recovery_pending', 'dispatched'], `${input.stage} has one runner-authorizing claimant`);
      assert.equal(contender.readAutomaticLearningWorkRecovery(input).status, 'blocked_recovery_pending', `${input.stage} reopen grants no second runner call`);
      assert.equal(store.recordAutomaticLearningWorkResult({ work_id: input.work_id, result_bytes: Buffer.from(`{"${input.stage}":"complete"}`), now: input.now }).status, 'completed');
      assert.equal(contender.recordAutomaticLearningWorkDispatch({ work_id: input.work_id, now: input.now }).status, 'completed', `${input.stage} completed result is reusable, not runner-authorizing`);
    }
  } finally { contender.close(); store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('automatic learning publication bridge rejects caller-supplied targets', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-automatic-learning-target-')); const store = openRuleLifecycleStore({ stateRoot });
  try { assert.throws(() => store.mintAutomaticPublicationTargetCapability({ candidate_digest: 'a'.repeat(64), admission_digest: 'b'.repeat(64), target: {} }), /RULE_AUTOMATIC_LEARNING_TARGET_UNAVAILABLE/); } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('automatic target bridge remints durable candidate/admission only against fresh enrolled base', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-automatic-learning-bridge-')); const scope = '1'.repeat(24); const repository = `repo:${'7'.repeat(64)}`; const host = `host:${'8'.repeat(64)}`;
  const finding = createRuleLearningFinding({ schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${'9'.repeat(16)}`, producer: 'pidex-retrospective', completed_run_id: 'run:automatic-bridge', plan_id: 'plan:047', project_scope_id: scope, repository_identity: repository, taxonomy: 'quality_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:automatic-bridge', lesson_summary: 'Bridge durable admission safely.', evidence_digests: ['a'.repeat(64)], occurred_at: '2026-08-14T00:00:00.000Z', redaction_classes: ['none'] });
  const writer_authority = { normalized_remote_digest: 'b'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: 'c'.repeat(64), identity_platform: 'posix', root_identity_digest: 'd'.repeat(64), parent_identity_digest: 'e'.repeat(64), files_identity_digest: 'f'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  const learningTarget = { repository, tier: 'project', scope_id: scope, scope_digest: '1'.repeat(64), rule_id: `project:${scope}:pidex-implementer:automatic-bridge`, predecessor: `commit:${'2'.repeat(40)}`, authority_digest: '3'.repeat(64), enabled: true, protected: false, applicable_descriptors: [{ descriptor_digest: '4'.repeat(64) }], existing: [] };
  const authority = { enrollment: { authority_digest: '3'.repeat(64), sources: [{ finding_id: finding.finding_id, snapshot: { finding_id: finding.finding_id, scope_id: scope, repository_identity: repository, repository, enabled: true, protected: false } }], targets: { project: learningTarget }, policy: { id: 'policy:bridge', version: 'v1', digest: '5'.repeat(64) }, generator_identity: { principal: 'pidex-pi', attempt_id: 'attempt:bridge' } }, reviewers: { configuration_generation: 'generation:bridge', generator_principal: 'pidex-pi', now: '2026-08-14T00:00:00.000Z', principals: [] } };
  let store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority });
  try {
    store.enroll({ repository, scope_id: scope, remote: 'https://example.invalid/automatic-bridge.git', branch: 'refs/heads/main' });
    store.enrollPublicationTarget({ repository, tier: 'project', scope_id: scope, scope_digest: learningTarget.scope_digest, rule_id: learningTarget.rule_id, predecessor: learningTarget.predecessor, enrollment_digest: '0'.repeat(64), allowed_paths: ['pidex/rules/managed/pidex-implementer/automatic-bridge.md', 'pidex/rules/managed/pidex-implementer/index.md'], writer_authority });
    const support = createRuleLearningSupport({ schema_version: 'pidex-rule-learning-support-v1', tier: 'project', taxonomy: finding.taxonomy, affected_agent: finding.affected_agent, affected_phase: finding.affected_phase, recurrence_key: finding.recurrence_key, lesson_code: lessonCode({ taxonomy: finding.taxonomy, affected_agent: finding.affected_agent, affected_phase: finding.affected_phase, recurrence_key: finding.recurrence_key }), occurrence_count: 1, scope_count: 1, finding_digests: [findingDigest(finding)] });
    const candidate = buildRuleLearningCandidate({ support, findings: [finding], authority: store.mintRuleLearningEnrollmentAuthority(), generator: () => ({ slug: 'automatic-bridge', applicability: ['implementation'], instruction: 'Keep bridge enrolled.', trigger: 'Before publication.', expected_evidence: 'Fresh base matches.', failure_behavior: 'Block transaction.', rationale: 'Authority stays enrolled.' }) });
    assert.equal(candidate.status, 'candidate');
    store.persistAutomaticLearningCandidateResult({ candidate_bytes: Buffer.from(candidate.bytes), now: writer_authority.publication_timestamp });
    const admission = { schema_version: 'pidex-living-rule-admission-v1', candidate_digest: candidate.digest, candidate_content_hash: candidate.candidate.content_hash, admission_policy_digest: candidate.candidate.admission_policy_digest, admission_policy_version: candidate.candidate.admission_policy_version, tier: 'project', repository_scope_digest: candidate.candidate.scope_digest, vote_digests: ['a'.repeat(64), 'b'.repeat(64)] };
    const admission_bytes = Buffer.from(JSON.stringify(admission), 'utf8'); const admission_digest = createHash('sha256').update(admission_bytes).digest('hex');
    store.persistAutomaticLearningAdmissionResult({ candidate_digest: candidate.digest, admission_bytes, now: writer_authority.publication_timestamp }); store.close();
    store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority });
    assert.equal(store.persistAutomaticLearningCandidateResult({ candidate_bytes: Buffer.from(candidate.bytes), now: writer_authority.publication_timestamp }).status, 'existing');
    assert.equal(store.persistAutomaticLearningAdmissionResult({ candidate_digest: candidate.digest, admission_bytes, now: writer_authority.publication_timestamp }).status, 'existing');
    const conflicting_admission = Buffer.from(JSON.stringify({ ...admission, vote_digests: ['c'.repeat(64), 'd'.repeat(64)] }), 'utf8');
    assert.throws(() => store.persistAutomaticLearningAdmissionResult({ candidate_digest: candidate.digest, admission_bytes: conflicting_admission, now: writer_authority.publication_timestamp }), /RULE_AUTOMATIC_LEARNING_CONFLICT/);
    const capability = store.remintAutomaticPublicationTargetCapability({ candidate_digest: candidate.digest, admission_digest });
    const bridge = store.readAutomaticPublicationTarget({ capability, fresh_base: learningTarget.predecessor.slice(7) });
    const verify = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite')); const enrolled = verify.prepare('SELECT * FROM publication_enrollment').get(); verify.close();
    assert.ok(bridge, JSON.stringify({ candidate: candidate.candidate, target: learningTarget, enrolled })); assert.equal(bridge.expected_base, learningTarget.predecessor.slice(7));
    assert.equal(store.readAutomaticPublicationTarget({ capability, fresh_base: '0'.repeat(40) }), null);
  } finally { store?.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('automatic learning store persists canonical finding history and recovery state', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-automatic-learning-store-'));
  const scope = 'a'.repeat(24); const repository = `repo:${'b'.repeat(64)}`; const host = `host:${'c'.repeat(64)}`;
  const finding = createRuleLearningFinding({ schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${'d'.repeat(16)}`, producer: 'pidex-retrospective', completed_run_id: 'run:automatic-store', plan_id: 'plan:047', project_scope_id: scope, repository_identity: repository, taxonomy: 'quality_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:automatic-store', lesson_summary: 'Preserve durable learning state.', evidence_digests: ['e'.repeat(64)], occurred_at: '2026-08-14T00:00:00.000Z', redaction_classes: ['none'] });
  const eligibility = createRuleLearningEligibilityEnvelope({ finding, retry_family_id: 'retry:automatic-store', evaluator_host_id: host });
  const source = { finding_id: finding.finding_id, snapshot: { finding_id: finding.finding_id, scope_id: scope, repository_identity: repository, repository, enabled: true, protected: false } };
  const authority = { enrollment: { authority_digest: '2'.repeat(64), sources: [source], targets: {}, policy: { id: 'policy:automatic', version: 'v1', digest: '4'.repeat(64) }, generator_identity: { principal: 'pidex-pi', attempt_id: 'attempt:generator' } }, reviewers: { configuration_generation: 'generation:1', generator_principal: 'pidex-pi', now: '2026-08-14T00:00:00.000Z', principals: [] } };
  try {
    let store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority });
    store.enroll({ repository, scope_id: scope, remote: 'https://example.invalid/automatic-store.git', branch: 'refs/heads/main' });
    assert.equal(store.persistAutomaticLearningFinding({ finding_bytes: canonicalFindingBytes(finding), eligibility }).status, 'persisted');
    assert.equal(store.persistAutomaticLearningFinding({ finding_bytes: canonicalFindingBytes(finding), eligibility }).status, 'existing');
    assert.throws(() => store.persistAutomaticLearningFinding({ finding_bytes: canonicalFindingBytes({ ...finding, lesson_summary: 'Changed durable facts.' }), eligibility }), /RULE_AUTOMATIC_LEARNING_CONFLICT/);
    const history = store.mintAutomaticLearningHistoryCapability({ tier: 'project', scope_id: scope });
    assert.deepEqual(store.readAutomaticLearningHistory({ capability: history }).findings.map((item) => item.digest), [findingDigest(finding)]);
    assert.equal(store.readAutomaticLearningHistory({ capability: Object.freeze({}) }), null);
    const work = { work_id: `work:${'5'.repeat(64)}`, tier: 'project', scope_id: scope, stage: 'generator', source_generation: 'source:1', configuration_generation: 'generation:1', input_digest: findingDigest(finding), now: '2026-08-14T00:00:00.000Z' };
    assert.equal(store.persistAutomaticLearningWorkIntent(work).status, 'intent');
    assert.equal(store.readAutomaticLearningWorkRecovery(work).status, 'resumable');
    assert.equal(store.recordAutomaticLearningWorkDispatch({ work_id: work.work_id, now: work.now }).status, 'dispatched');
    assert.equal(store.readAutomaticLearningWorkRecovery(work).status, 'blocked_recovery_pending');
    const result_bytes = Buffer.from('{"candidate":"exact"}');
    assert.equal(store.recordAutomaticLearningWorkResult({ work_id: work.work_id, result_bytes, now: work.now }).status, 'completed');
    assert.equal(store.readAutomaticLearningWorkRecovery(work).status, 'completed');
    assert.equal(store.readAutomaticLearningWorkRecovery({ ...work, source_generation: 'source:2' }).status, 'blocked_source_fact_drift');
    store.close(); store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority });
    assert.equal(store.persistAutomaticLearningFinding({ finding_bytes: canonicalFindingBytes(finding), eligibility }).status, 'existing');
    assert.deepEqual(store.readAutomaticLearningWorkRecovery(work), { status: 'completed', result_digest: createHash('sha256').update(result_bytes).digest('hex'), result_bytes });
    const contender = openRuleLifecycleStore({ stateRoot, learningAuthority: authority });
    assert.equal(contender.persistAutomaticLearningWorkIntent(work).status, 'completed');
    assert.equal(contender.recordAutomaticLearningWorkDispatch({ work_id: work.work_id, now: work.now }).status, 'completed');
    assert.throws(() => contender.recordAutomaticLearningWorkResult({ work_id: work.work_id, result_bytes: Buffer.from('{"candidate":"conflict"}'), now: work.now }), /RULE_AUTOMATIC_LEARNING_CONFLICT/);
    assert.deepEqual(store.readAutomaticLearningWorkRecovery(work), { status: 'completed', result_digest: createHash('sha256').update(result_bytes).digest('hex'), result_bytes });
    contender.close(); store.close();
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
// ---- H-1 correction: store-owned locked control authority seam (Plan048 review H-1) ----
function controlAuthorityFixture(store, { lifecycle_state = 'deactivated', protection_class = 'none', local_stop = false, marker = 'a' } = {}) {
  const scope_id = marker.repeat(24); const rule_id = `project:${scope_id}:pidex-implementer:quality`; const repo = `repo:control-authority-${marker}`; const base = marker.repeat(40); const content_hash = '6'.repeat(64);
  store.enroll({ repository: repo, scope_id, remote: 'https://example.invalid/pidex', branch: 'refs/heads/main' });
  const writer_authority = { normalized_remote_digest: 'b'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: marker.repeat(64), identity_platform: 'posix', root_identity_digest: 'd'.repeat(64), parent_identity_digest: 'e'.repeat(64), files_identity_digest: 'f'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: '2026-08-14T00:00:00.000Z' };
  store.enrollPublicationTarget({ repository: repo, tier: 'project', scope_id, scope_digest: 'd'.repeat(64), rule_id, predecessor: `commit:${base}`, enrollment_digest: '9'.repeat(64), allowed_paths: ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/quality.md'], writer_authority });
  const head = { head_kind: 'current_project', repository_identity: repo, accepted_remote_head: base, baseline_parent_commit: base, manifest_digest: null, tree_digest: '3'.repeat(64), seeded_at: null, verified_at: '2026-08-22T12:00:00.000Z', remote_checked_at: '2026-08-22T12:00:00.000Z', freshness: 'exact_head' };
  const bytes = (state) => `<!-- pidex-rule-receipt-v1 {"rule_id":"${rule_id}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"${state}"} -->\n# quality\n`;
  const entry = (state) => ({ rule_id, rule_version: content_hash, content_hash, accepted_commit: base, bytes: bytes(state), tier: 'project', scope_id, protection_class, source: 'managed_project', lifecycle_state: state, created_at: '2026-08-22T12:00:00.000Z', source_head: base, mirror_head: base, mirror_digest: content_hash, agent: 'pidex-implementer', applicability: null });
  store.replaceProjection({ repository: repo, scope_id, accepted_head: base, head, entries: [entry('active')], event_kind: 'baseline_imported' });
  if (lifecycle_state !== 'active') store.replaceProjection({ repository: repo, scope_id, accepted_head: base, head, entries: [entry(lifecycle_state)], event_kind: 'lifecycle_action_projection' });
  if (local_stop) store.setLocalRuleStop({ repository: repo, scope_id, rule_id, reason_code: 'operator_stop' });
  return { repo, scope_id, rule_id, base, content_hash };
}
test('H-1 control authority seam resolves exactly one enrolled rule to current facts, target, canonical bytes, expected base, stop and epoch facts', withStore('pidex-control-authority-', (store) => {
  const { repo, scope_id, rule_id, base, content_hash } = controlAuthorityFixture(store);
  const authority = store.readLifecycleControlAuthority({ rule_id });
  assert.ok(authority);
  assert.equal(authority.expected_base, base);
  assert.ok(Buffer.from(authority.rule_bytes).equals(Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${rule_id}","admission_digest":"${'e'.repeat(64)}","transaction_digest":"${'f'.repeat(64)}","lifecycle_state":"deactivated"} -->\n# quality\n`, 'utf8')));
  assert.equal(authority.local_stop_active, false); assert.equal(authority.epoch_open, false);
  assert.equal(authority.target.repository, repo); assert.equal(authority.target.rule_id, rule_id); assert.equal(authority.target.predecessor, `commit:${base}`); assert.equal(authority.target.scope_digest, authority.current.repository_scope_digest);
  assert.equal(authority.current.tier, 'project'); assert.equal(authority.current.scope_id, scope_id); assert.equal(authority.current.rule_id, rule_id);
  assert.equal(authority.current.version_hash, content_hash); assert.equal(authority.current.content_hash, content_hash); assert.equal(authority.current.accepted_commit, base);
  assert.match(authority.current.activation_epoch, /^epoch:[a-f0-9]{24}$/); assert.equal(authority.current.mirror_digest, content_hash);
  assert.equal(authority.current.lifecycle_state, 'deactivated'); assert.equal(authority.current.protection_class, 'none');
  assert.equal(authority.current.local_stop_active, false); assert.equal(authority.current.global_stop_active, false);
  assert.equal(authority.current.history_state, 'consumed'); assert.equal(authority.current.pinned, false);
  assert.doesNotMatch(JSON.stringify(authority), /\/home\/|C:\\|credential|secret|token/);
  const stopped = controlAuthorityFixture(store, { local_stop: true, marker: 'c' });
  assert.equal(store.readLifecycleControlAuthority({ rule_id: stopped.rule_id }).local_stop_active, true);
  assert.equal(store.readLifecycleControlAuthority({ rule_id: stopped.rule_id }).current.local_stop_active, true);
  const active = controlAuthorityFixture(store, { lifecycle_state: 'active', marker: 'b' });
  const activeAuthority = store.readLifecycleControlAuthority({ rule_id: active.rule_id });
  assert.equal(activeAuthority.epoch_open, true); assert.equal(activeAuthority.current.history_state, 'clear'); assert.match(activeAuthority.current.activation_epoch, /^epoch:[a-f0-9]{24}$/);
}));
test('H-1 control authority fails closed on stale, ambiguous, missing, or tampered facts', withStore('pidex-control-authority-negative-', (store, stateRoot) => {
  const { repo, scope_id, rule_id, base } = controlAuthorityFixture(store);
  assert.equal(store.readLifecycleControlAuthority({ rule_id: 'pidex-global:pidex-implementer:unknown' }), undefined);
  assert.equal(store.readLifecycleControlAuthority({ rule_id: 'bad-rule' }), undefined);
  const db = new DatabaseSync(path.join(stateRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
  try {
    db.prepare('UPDATE publication_enrollment SET predecessor = ? WHERE repository = ?').run('commit:zz', repo);
    assert.equal(store.readLifecycleControlAuthority({ rule_id }), undefined, 'tampered predecessor fails closed');
    db.prepare('UPDATE publication_enrollment SET predecessor = ? WHERE repository = ?').run(`commit:${base}`, repo);
    db.prepare('UPDATE publication_enrollment SET writer_enabled = 0 WHERE repository = ?').run(repo);
    assert.equal(store.readLifecycleControlAuthority({ rule_id }), undefined, 'disabled writer authority fails closed');
    db.prepare('UPDATE publication_enrollment SET writer_enabled = 1 WHERE repository = ?').run(repo);
    const row = db.prepare('SELECT entries_json FROM effective_projection WHERE repository = ? AND scope_id = ?').get(repo, scope_id);
    const entries = JSON.parse(row.entries_json); entries[0] = { ...entries[0], bytes: undefined };
    db.prepare('UPDATE effective_projection SET entries_json = ? WHERE repository = ? AND scope_id = ?').run(JSON.stringify(entries), repo, scope_id);
    assert.equal(store.readLifecycleControlAuthority({ rule_id }), undefined, 'missing canonical rule bytes fails closed');
  } finally { db.close(); }
  const ambiguousRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-control-ambiguous-')); const ambiguous = openRuleLifecycleStore({ stateRoot: ambiguousRoot });
  try {
    const fixture = controlAuthorityFixture(ambiguous);
    ambiguous.enroll({ repository: 'repo:control-alias', scope_id, remote: 'https://example.invalid/alias', branch: 'refs/heads/main' });
    const alias = new DatabaseSync(path.join(ambiguousRoot, 'quality/rule-lifecycle/lifecycle.sqlite'));
    try { alias.prepare('INSERT INTO rule_identity (repository, scope_id, rule_id) VALUES (?, ?, ?)').run('repo:control-alias', scope_id, fixture.rule_id); } finally { alias.close(); }
    assert.equal(ambiguous.readLifecycleControlAuthority({ rule_id: fixture.rule_id }), undefined, 'ambiguous enrollment fails closed');
  } finally { try { ambiguous.close(); } catch {} rmSync(ambiguousRoot, { recursive: true, force: true }); }
}));
