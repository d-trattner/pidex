import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runRuleImpactCadence, selectImpactLifecycleTransition } from './rule-impact-cadence.mjs';
import { buildExpectedCurrentFromApi09, buildImpactEvaluationArtifact, readTrustedImpactEvaluationPrior, recordImpactEvaluation } from './rule-impact-results.mjs';
import { openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { policyDigest, policyForTier } from './rule-impact-policy.mjs';

test('ordinary cadence refuses absent immutable input authority before any evaluator path', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c2-cadence-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    const input_id = `rule-impact-input:${'d'.repeat(64)}`;
    const request = { ordinary: true, stateRoot, store, publicationIdentity: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, capture: { status: 'captured', target_input_ids: [input_id] }, currentAuthorityProvider: () => ({}) };
    assert.deepEqual(runRuleImpactCadence(request), { status: 'blocked', reason: 'impact_input_unavailable' });
    assert.equal(store.readImpactCadenceConfig().enabled, true);
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('durable rollback disables cadence before target input reads or claims', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-c2-disabled-'));
  const store = openRuleLifecycleStore({ stateRoot });
  try {
    store.setImpactCadenceEnabled({ enabled: false });
    assert.deepEqual(runRuleImpactCadence({ ordinary: true, stateRoot, store, publicationIdentity: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, capture: { status: 'captured', target_input_ids: [`rule-impact-input:${'d'.repeat(64)}`] }, currentAuthorityProvider: () => ({}) }), { status: 'disabled', reason: 'cadence_disabled' });
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('manual work cannot enter automatic cadence', () => {
  assert.deepEqual(runRuleImpactCadence({ ordinary: false }), { status: 'skipped', reason: 'ordinary_required' });
});
function checkpoint() {
  return {
    checkpoint_key: 'c'.repeat(64), checkpoint_digest: 'd'.repeat(64), tier: 'global', scope_id: '',
    rule_id: 'pidex-global:pidex-implementer:quality', version_hash: 'a'.repeat(64), content_hash: 'a'.repeat(64),
    activation_epoch: 'epoch:0123456789abcdef01234567', policy_id: 'passive-impact-v1', policy_digest: policyDigest('global'),
    opening_id: 'opening:fixture', opening_digest: 'e'.repeat(64), checkpoint_kind: 'freeze', due_at: '2026-10-09T00:00:00.000Z',
  };
}

function blockedInput({ target = checkpoint() } = {}) {
  return Buffer.from(JSON.stringify({
    schema: 'rule-impact-input-v1', collection_disposition: 'blocked', collection_reason: 'impact_contract_unavailable',
    exposure_publication: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) },
    resolver_boundary: { target_rule: { rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch, tier: target.tier, scope_id: null } },
  }), 'utf8');
}

test('cadence reads persisted due checkpoints at controlled clock, never constructs caller due keys, and skips not-due rows', () => {
  const calls = [];
  const store = {
    readImpactCadenceConfig: () => ({ enabled: true }),
    listDueImpactCadence: ({ now }) => { calls.push(['list', now]); return []; },
    claimDueImpactCadence: () => { throw new Error('not due must not claim'); },
    finishImpactCadence: () => { throw new Error('not due must not finish'); },
  };
  const result = runRuleImpactCadence({ ordinary: true, stateRoot: '/tmp/cadence', store, publicationIdentity: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, capture: { target_input_ids: [`rule-impact-input:${'0'.repeat(64)}`] }, currentAuthorityProvider: () => ({}), evaluationAt: '2026-10-08T23:59:59.999Z' });
  assert.deepEqual(result, { status: 'blocked', reason: 'impact_input_unavailable' });
  assert.deepEqual(calls, [['list', '2026-10-08T23:59:59.999Z']]);
});
test('cadence claims only exact persisted due checkpoint and redacts durable terminal key', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-cadence-due-'));
  const bytes = blockedInput(); const input_id = `rule-impact-input:${createHash('sha256').update(bytes).digest('hex')}`; const due = checkpoint(); const claims = []; const finishes = [];
  const store = {
    readImpactCadenceConfig: () => ({ enabled: true }), listDueImpactCadence: () => [due],
    readImpactInputReference: () => true,
    claimDueImpactCadence: (request) => { claims.push(request); return { status: 'claimed', due_key: `checkpoint:${due.checkpoint_key}`, lease_owner: request.lease_owner }; },
    finishImpactCadence: (request) => { finishes.push(request); return request.result; },
  };
  try {
    const file = path.join(stateRoot, 'quality', 'rule-impact-input', `${input_id.slice('rule-impact-input:'.length)}.json`);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
    const result = runRuleImpactCadence({ ordinary: true, stateRoot, store, publicationIdentity: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, capture: { target_input_ids: [input_id] }, currentAuthorityProvider: () => ({}), evaluationAt: due.due_at });
    // Slice3: missing immutable ER writer is storage-unavailable; do not terminally finish a retryable lease.
    assert.deepEqual(result, { status: 'unavailable', reason: 'cadence_unavailable' });
    assert.deepEqual(claims.map(({ checkpoint: claimed, input_id: id, now }) => ({ checkpoint: claimed, input_id: id, now })), [{ checkpoint: due, input_id, now: due.due_at }]);
    assert.equal(finishes.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /checkpoint:|rule-impact-input:|pidex-global/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
test('cadence-owned LT selector uses only persisted blocker/prior/current authority in LT precedence order', () => {
  const lineage = { policy_digest: 'a'.repeat(64), rule_version_hash: 'b'.repeat(64), activation_epoch: 'epoch:prior' };
  const prior = { state: 'collecting', result_id: `passive-impact-global:${'c'.repeat(64)}`, result_digest: 'd'.repeat(64), lineage, expires_at: null };
  const current = { policy_digest: 'e'.repeat(64), version_hash: 'f'.repeat(64), activation_epoch: 'epoch:next' };
  const blocked = selectImpactLifecycleTransition({ input: { collection_disposition: 'blocked', collection_reason: 'impact_contract_unavailable' }, prior, current, events: [{ effect: 'policy_changed', event_digest: '1'.repeat(64) }], replacements: [], at: '2026-10-09T00:00:00.000Z' });
  assert.deepEqual(blocked, { outcome: 'transition', transition: { kind: 'authority_blocked', reason: 'impact_contract_unavailable' } }, 'LT-01 precedes all later authority');
  const policy = selectImpactLifecycleTransition({ input: { collection_disposition: 'eligible' }, prior, current, events: [{ effect: 'policy_changed', event_digest: '1'.repeat(64) }], replacements: [], at: '2026-10-09T00:00:00.000Z' });
  assert.deepEqual(policy, { outcome: 'transition', transition: { kind: 'policy_changed', prior_policy_digest: 'a'.repeat(64), next_policy_digest: 'e'.repeat(64), event_digest: '1'.repeat(64) } });
  const expiry = selectImpactLifecycleTransition({ input: { collection_disposition: 'eligible' }, prior: { ...prior, state: 'frozen', expires_at: '2026-10-08T23:59:59.999Z' }, current: { policy_digest: 'a'.repeat(64), version_hash: 'b'.repeat(64), activation_epoch: 'epoch:prior' }, events: [], replacements: [], at: '2026-10-09T00:00:00.000Z' });
  assert.deepEqual(expiry, { outcome: 'transition', transition: { kind: 'result_expired', expires_at: '2026-10-08T23:59:59.999Z' } }, 'LT-06 stays unreachable because policy expiry authority is null');
  assert.deepEqual(selectImpactLifecycleTransition({ input: { collection_disposition: 'eligible' }, prior: { ...prior, state: 'blocked' }, current, events: [], replacements: [], at: '2026-10-09T00:00:00.000Z' }), { outcome: 'unavailable', reason: 'prior_terminal' });
});
test('Slice3 persists LT-01 ER before finishing due checkpoint and keeps safe outward summary', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s3-cadence-'));
  const target = { rule_id: 'pidex-global:pidex-implementer:quality', version_hash: 'a'.repeat(64), content_hash: 'a'.repeat(64), activation_epoch: 'epoch:0123456789abcdef01234567', tier: 'global', scope_id: null, accepted_commit: 'b'.repeat(40), protection_class: 'none', mirror_digest: 'c'.repeat(64), agent: 'pidex-implementer', applicability: [], phases: ['implementation'], lifecycle_state: 'active' };
  const current = { schema: 'pidex-rule-resolver-snapshot-v1', snapshot_id: 'snapshot:one', resolver_revision: '045-S2', projection_revision: 1, scope_id: 'project-1', created_at: '2026-08-01T00:00:00.000Z', source_heads: {}, mirror_heads: {}, quality: 'verified', reason_codes: [], active_rules: [target], narrowing: [] };
  const snapshotBytes = JSON.stringify(current); const inputBytes = Buffer.from(JSON.stringify({ schema: 'rule-impact-input-v1', collection_disposition: 'blocked', collection_reason: 'impact_contract_unavailable', exposure_publication: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, fresh_runtime: { resolver_snapshot_bytes: snapshotBytes }, resolver_boundary: { target_rule: target, source_heads: {}, mirror_heads: {}, projection_revision: 1 } }));
  const input_id = `rule-impact-input:${createHash('sha256').update(inputBytes).digest('hex')}`; const due = checkpoint(); const sqlite = openRuleLifecycleStore({ stateRoot }); let writes = 0; const finishes = [];
  const store = { readImpactCadenceConfig: () => ({ enabled: true }), listDueImpactCadence: () => [due], readImpactInputReference: () => true, claimDueImpactCadence: () => ({ status: 'claimed', due_key: `checkpoint:${due.checkpoint_key}`, lease_owner: 'cadence:test' }), recordImpactEvaluation: (request) => { writes += 1; return sqlite.recordImpactEvaluation(request); }, finishImpactCadence: (request) => { assert.equal(writes, 1, 'terminal checkpoint follows immutable result index'); finishes.push(request); return request.result; } };
  try {
    const file = path.join(stateRoot, 'quality', 'rule-impact-input', `${input_id.slice('rule-impact-input:'.length)}.json`); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, inputBytes);
    assert.deepEqual(runRuleImpactCadence({ ordinary: true, stateRoot, store, publicationIdentity: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, capture: { target_input_ids: [input_id] }, currentAuthorityProvider: () => current, evaluationAt: due.due_at }), { status: 'blocked', reason: 'impact_contract_unavailable' });
    assert.equal(finishes.length, 1); assert.doesNotMatch(JSON.stringify(finishes[0].result), /result_id|input_id|target|path|error/i);
  } finally { sqlite.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('cadence rejects malformed ready API-09 bytes before evaluator or checkpoint settlement', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-cadence-api09-'));
  const sqlite = openRuleLifecycleStore({ stateRoot });
  const target = { rule_id: 'pidex-global:pidex-implementer:quality', version_hash: 'a'.repeat(64), content_hash: 'a'.repeat(64), activation_epoch: 'epoch:0123456789abcdef01234567', tier: 'global', scope_id: null, accepted_commit: 'b'.repeat(40), protection_class: 'none', mirror_digest: 'c'.repeat(64), agent: 'pidex-implementer', applicability: [], phases: ['implementation'], lifecycle_state: 'active' };
  const snapshotDigest = '2'.repeat(64); const exposureDigest = '3'.repeat(64); const exposureId = `exposure:${'e'.repeat(64)}`; const policy = policyForTier('global'); const due = checkpoint(); const finishes = [];
  const inputBytes = Buffer.from(JSON.stringify({ schema: 'rule-impact-input-v1', collection_disposition: 'eligible', exposure_publication: { exposure_id: exposureId, publication_digest: exposureDigest }, resolver_boundary: { target_rule: target } }));
  const inputDigest = createHash('sha256').update(inputBytes).digest('hex'); const inputId = `rule-impact-input:${inputDigest}`;
  const lineage = { resolver_snapshot_id: 'snapshot:api09', resolver_snapshot_digest: snapshotDigest, exposure_id: exposureId, exposure_publication_digest: exposureDigest, measurement_input_id: inputId, measurement_input_digest: inputDigest, evaluation_input_digest: '4'.repeat(64), rule_id: target.rule_id, rule_version_hash: target.version_hash, rule_content_hash: target.content_hash, accepted_commit: target.accepted_commit, scope_id: null, activation_epoch: target.activation_epoch, mirror_digest: target.mirror_digest, policy_id: policy.policy_id, policy_digest: policyDigest('global') };
  try {
    const source = readFileSync('agents.output/planning/116c-plan046-exact-result-schema.md', 'utf8');
    const example = [...source.matchAll(/```json\n(\{"schema":"passive-impact-global-result-v1"[^\n]+\})\n```/g)].map(([, json]) => JSON.parse(json)).find(({ state }) => state === 'collecting');
    const { schema, result_id, estimator_id, ...operands } = example;
    const prior = buildImpactEvaluationArtifact({ ...operands, tier: 'global', lineage, created_at: due.due_at });
    recordImpactEvaluation({ store: sqlite, stateRoot, resultBytes: prior.bytes, resultDigest: prior.result_digest, expectedLineage: { tier: 'global', scope_id: null, rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, accepted_commit: target.accepted_commit, activation_epoch: target.activation_epoch, policy_id: policy.policy_id, policy_digest: policyDigest('global'), resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: snapshotDigest, exposure_id: lineage.exposure_id, exposure_publication_digest: exposureDigest, measurement_input_id: inputId, measurement_input_digest: inputDigest, evaluation_input_digest: lineage.evaluation_input_digest } });
    const file = path.join(stateRoot, 'quality', 'rule-impact-input', `${inputDigest}.json`); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, inputBytes);
    const evaluatedTarget = { rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, tier: target.tier, scope_id: target.scope_id, content_hash: target.content_hash, accepted_commit: target.accepted_commit, protection_class: target.protection_class, mirror_digest: target.mirror_digest, agent: target.agent, applicability: target.applicability, phases: target.phases, lifecycle_state: target.lifecycle_state };
    const evaluatorInput = Buffer.from(JSON.stringify({ schema: 'rule-impact-evaluator-input-v1', input_digest: inputDigest, evaluated_target: evaluatedTarget, target_t0: '2026-08-01T00:00:00.000Z', target_epoch_opening: {}, impact_contract_digest: '5'.repeat(64), impact_contract: {}, families: [] }));
    const evaluationDigest = createHash('sha256').update(evaluatorInput).digest('hex');
    const api09 = { outcome: 'ready', input_bytes: evaluatorInput, evaluation_input_digest: evaluationDigest, measurement_input_id: inputId, measurement_input_digest: inputDigest, lineage: { tier: 'global', scope_id: null, rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, measurement_input_digest: inputDigest, evaluation_input_digest: evaluationDigest } };
    const freshAuthority = { target, policy_id: policy.policy_id, policy_digest: policyDigest('global'), resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: snapshotDigest, exposure_id: lineage.exposure_id, exposure_publication_digest: exposureDigest, measurement_input_id: inputId, measurement_input_digest: inputDigest, evaluation_input_digest: evaluationDigest };
    const store = { ...sqlite, readImpactCadenceConfig: () => ({ enabled: true }), listDueImpactCadence: () => [due], readImpactInputReference: () => true, claimDueImpactCadence: () => ({ status: 'claimed', due_key: `checkpoint:${due.checkpoint_key}`, lease_owner: 'cadence:api09' }), finishImpactCadence: (request) => { finishes.push(request); return request.result; } };
    const selector = { tier: 'global', scope_id: null, rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, accepted_commit: target.accepted_commit, activation_epoch: target.activation_epoch, policy_id: policy.policy_id, policy_digest: policyDigest('global'), resolver_snapshot_id: lineage.resolver_snapshot_id, resolver_snapshot_digest: snapshotDigest, exposure_id: lineage.exposure_id, exposure_publication_digest: exposureDigest, measurement_input_id: inputId, measurement_input_digest: inputDigest, evaluation_input_digest: evaluationDigest, minimum_head_sequence: 1 };
    const verified = readTrustedImpactEvaluationPrior({ store, stateRoot, selector });
    assert.equal(verified.outcome, 'available');
    const expectedCurrent = buildExpectedCurrentFromApi09({ api09, freshAuthority, verifiedPrior: verified, minimumHeadSequence: verified.head_sequence });
    assert.equal(expectedCurrent.tier, 'global', JSON.stringify(expectedCurrent));
    assert.deepEqual(runRuleImpactCadence({ ordinary: true, stateRoot, store, publicationIdentity: { exposure_id: lineage.exposure_id, publication_digest: exposureDigest }, capture: { target_input_ids: [inputId] }, currentAuthorityProvider: () => ({ api09, freshAuthority }), evaluationAt: due.due_at }), { status: 'unavailable', reason: 'cadence_unavailable' });
    assert.equal(finishes.length, 0, 'S4 re-parses API-09 before evaluator; malformed bytes keep lease retryable');
  } finally { sqlite.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Slice4 persists parser-reverified ready API-09 evaluator ER before settling its due claim', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-s4-cadence-evaluator-'));
  const sqlite = openRuleLifecycleStore({ stateRoot });
  const vector = JSON.parse(readFileSync('scripts/quality/fixtures/passive-impact-v1-golden.json', 'utf8')).evaluator_input_vectors[0];
  const evaluatorInput = JSON.parse(vector.bytes); const target = evaluatorInput.evaluated_target;
  for (const family of evaluatorInput.families) family.provenance.policy_digest = policyDigest('global');
  const evaluatorBytes = Buffer.from(JSON.stringify(evaluatorInput)); const evaluationDigest = createHash('sha256').update(evaluatorBytes).digest('hex');
  const inputBytes = Buffer.from(JSON.stringify({ schema: 'rule-impact-input-v1', collection_disposition: 'eligible', exposure_publication: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, resolver_boundary: { target_rule: target } }));
  const inputId = `rule-impact-input:${createHash('sha256').update(inputBytes).digest('hex')}`;
  const due = { checkpoint_key: 'c'.repeat(64), checkpoint_digest: 'd'.repeat(64), tier: 'global', scope_id: '', rule_id: target.rule_id, version_hash: target.version_hash, content_hash: target.content_hash, activation_epoch: target.activation_epoch, policy_id: policyForTier('global').policy_id, policy_digest: policyDigest('global'), opening_id: 'opening:fixture', opening_digest: 'e'.repeat(64), checkpoint_kind: 'freeze', due_at: '2026-06-02T00:00:00.000Z' };
  const source = evaluatorInput.families[0].provenance;
  const api09 = { outcome: 'ready', input_bytes: evaluatorBytes, evaluation_input_digest: evaluationDigest, measurement_input_id: `rule-impact-input:${evaluatorInput.input_digest}`, measurement_input_digest: evaluatorInput.input_digest, lineage: { tier: target.tier, scope_id: target.scope_id, rule_id: target.rule_id, version_hash: target.version_hash, activation_epoch: target.activation_epoch, measurement_input_digest: evaluatorInput.input_digest, evaluation_input_digest: evaluationDigest } };
  const freshAuthority = { target, policy_id: policyForTier('global').policy_id, policy_digest: policyDigest('global'), resolver_snapshot_id: source.resolver_snapshot_id, resolver_snapshot_digest: source.resolver_snapshot_digest, exposure_id: source.exposure_id, exposure_publication_digest: source.exposure_publication_digest, measurement_input_id: api09.measurement_input_id, measurement_input_digest: api09.measurement_input_digest, evaluation_input_digest: api09.evaluation_input_digest };
  const finishes = []; let writes = 0;
  const store = { ...sqlite, readImpactCadenceConfig: () => ({ enabled: true }), listDueImpactCadence: () => [due], readImpactInputReference: () => true, claimDueImpactCadence: () => ({ status: 'claimed', due_key: `checkpoint:${due.checkpoint_key}`, lease_owner: 'cadence:s4' }), recordImpactEvaluation: (request) => { writes += 1; return sqlite.recordImpactEvaluation(request); }, finishImpactCadence: (request) => { assert.equal(writes, 1, 'immutable evaluator index must precede terminal checkpoint'); finishes.push(request); return request.result; } };
  try {
    const file = path.join(stateRoot, 'quality', 'rule-impact-input', `${inputId.slice('rule-impact-input:'.length)}.json`); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, inputBytes);
    assert.deepEqual(runRuleImpactCadence({ ordinary: true, stateRoot, store, publicationIdentity: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, capture: { target_input_ids: [inputId] }, currentAuthorityProvider: () => ({ api09, freshAuthority }), evaluationAt: due.due_at }), { status: 'collecting', reason: 'collecting' });
    assert.equal(finishes.length, 1);
    assert.deepEqual(finishes[0].result, { status: 'collecting', reason: 'collecting', due_key: `checkpoint:${due.checkpoint_key}` });
    assert.doesNotMatch(JSON.stringify(finishes), /rule-impact-input:|target-rule|error|path/i);
  } finally { sqlite.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('cadence ignores forged caller input when no persisted checkpoint target matches', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-cadence-forged-'));
  const bytes = blockedInput({ target: { ...checkpoint(), rule_id: 'pidex-global:pidex-implementer:forged' } }); const input_id = `rule-impact-input:${createHash('sha256').update(bytes).digest('hex')}`; const due = checkpoint(); let claims = 0;
  const store = { readImpactCadenceConfig: () => ({ enabled: true }), listDueImpactCadence: () => [due], readImpactInputReference: () => true, claimDueImpactCadence: () => { claims += 1; }, finishImpactCadence: () => {} };
  try {
    const file = path.join(stateRoot, 'quality', 'rule-impact-input', `${input_id.slice('rule-impact-input:'.length)}.json`);
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
    assert.deepEqual(runRuleImpactCadence({ ordinary: true, stateRoot, store, publicationIdentity: { exposure_id: `exposure:${'e'.repeat(64)}`, publication_digest: 'f'.repeat(64) }, capture: { target_input_ids: [input_id] }, currentAuthorityProvider: () => ({}), evaluationAt: due.due_at }), { status: 'blocked', reason: 'impact_input_unavailable' });
    assert.equal(claims, 0);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
