import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createRuleLearningEligibilityEnvelope, createRuleLearningFinding, findingDigest } from './rule-learning-contracts.mjs';
import { aggregateRuleLearningFindings } from './rule-learning-aggregate.mjs';

const hex = (char) => char.repeat(64);
const scopeA = 'a'.repeat(24);
const scopeB = 'b'.repeat(24);
const makeFinding = ({ scope = scopeA, repository = 'b', run = '001', finding = 'c', evidence = 'd', lesson = 'Validate contract before handoff.', recurrence = 'quality:validation-missing' } = {}) => createRuleLearningFinding({
  schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${finding.repeat(32)}`,
  producer: 'pidex-retrospective', completed_run_id: `run:completed-${run}`, plan_id: 'plan:047', project_scope_id: scope,
  repository_identity: `repo:${hex(repository)}`, taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer',
  affected_phase: 'implementation', recurrence_key: recurrence, lesson_summary: lesson,
  evidence_digests: [hex(evidence)], occurred_at: '2026-08-13T00:00:00.000Z', redaction_classes: ['none'],
});

const eligibilityFor = (value, { retry = value.completed_run_id, host = 'e' } = {}) => createRuleLearningEligibilityEnvelope({
  finding: value,
  retry_family_id: `retry:${retry.replace('run:completed-', '')}`,
  evaluator_host_id: `host:${hex(host)}`,
});
const aggregate = (findings, options = {}) => aggregateRuleLearningFindings({
  findings,
  eligibility_envelopes: findings.map((value) => eligibilityFor(value, options[value.finding_id] ?? {})),
});

test('BD-02/03 aggregates retry-safe project support without cross-tier pooling and returns canonical immutable bytes', () => {
  const first = makeFinding();
  const retry = makeFinding();
  const result = aggregate([retry, first]);
  assert.equal(result.status, 'support_only');
  assert.equal(result.project_support.length, 1);
  assert.equal(result.global_support.length, 0);
  assert.equal(result.project_support[0].schema_version, 'pidex-rule-learning-support-v1');
  assert.equal(result.project_support[0].occurrence_count, 1);
  assert.equal(result.project_support[0].finding_digests[0], findingDigest(first));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.project_support), true);
  assert.match(result.bytes, /^\{/);
  assert.equal(createHash('sha256').update(result.bytes).digest('hex'), result.digest);
});

test('BD-03 requires same-host, distinct enrolled scope and repository evidence for global support and exact bytes under shuffle', () => {
  const one = aggregate([makeFinding()]);
  const twoInputs = [makeFinding(), makeFinding({ scope: scopeB, repository: 'e', run: '002', finding: 'f', evidence: 'e' })];
  const two = aggregate(twoInputs);
  const shuffled = aggregate([...twoInputs].reverse());
  assert.equal(one.global_support.length, 0);
  assert.equal(two.project_support.length, 2);
  assert.equal(two.global_support.length, 1);
  assert.equal(two.global_support[0].scope_count, 2);
  // PLAN047 privacy correction: finding prose and recurrence identity never enter support output.
  assert.match(two.global_support[0].lesson_code, /^lesson:[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(two.global_support[0], 'lesson_summary'), false);
  assert.equal(Object.hasOwn(two.global_support[0], 'recurrence_key'), false);
  assert.equal(two.bytes, shuffled.bytes);
  assert.equal(two.digest, shuffled.digest);
  assert.deepEqual(aggregateRuleLearningFindings({ findings: [makeFinding()], eligibility_envelopes: [] }), { status: 'rejected', code: 'RULE_LEARNING_ELIGIBILITY_INVALID' });
  const crossHost = aggregateRuleLearningFindings({
    findings: twoInputs,
    eligibility_envelopes: [eligibilityFor(twoInputs[0]), eligibilityFor(twoInputs[1], { host: 'f' })],
  });
  assert.deepEqual(crossHost, { status: 'rejected', code: 'RULE_LEARNING_ELIGIBILITY_CONFLICT' });
});

test('BD-02 rejects retry-family, finding/run, and repository duplicate conflicts atomically without partial bytes', () => {
  const first = makeFinding();
  const retryConflict = makeFinding({ run: '002', finding: 'f', evidence: 'e' });
  const retryResult = aggregateRuleLearningFindings({
    findings: [first, retryConflict],
    eligibility_envelopes: [eligibilityFor(first, { retry: 'family-a' }), eligibilityFor(retryConflict, { retry: 'family-a' })],
  });
  assert.deepEqual(retryResult, { status: 'rejected', code: 'RULE_LEARNING_AGGREGATE_CONFLICT' });
  const repositoryConflict = aggregate([first, retryConflict]);
  assert.deepEqual(repositoryConflict, { status: 'rejected', code: 'RULE_LEARNING_AGGREGATE_CONFLICT' });
  const sameRun = makeFinding({ finding: 'd', evidence: 'f' });
  assert.deepEqual(aggregate([first, sameRun]), { status: 'rejected', code: 'RULE_LEARNING_AGGREGATE_CONFLICT' });
  const sameFinding = makeFinding({ run: '003', evidence: 'f' });
  assert.deepEqual(aggregate([first, sameFinding]), { status: 'rejected', code: 'RULE_LEARNING_AGGREGATE_CONFLICT' });
  const crossScopeSameRepository = makeFinding({ scope: scopeB, run: '004', finding: 'e', evidence: 'f' });
  assert.deepEqual(aggregate([first, crossScopeSameRepository]), { status: 'rejected', code: 'RULE_LEARNING_AGGREGATE_CONFLICT' });
  const wrongBinding = { ...eligibilityFor(first), finding_digest: findingDigest(retryConflict) };
  assert.deepEqual(aggregateRuleLearningFindings({ findings: [first], eligibility_envelopes: [wrongBinding] }), { status: 'rejected', code: 'RULE_LEARNING_ELIGIBILITY_INVALID' });
  const wrongEnrollment = { ...eligibilityFor(first), enrollment_digest: hex('f') };
  assert.deepEqual(aggregateRuleLearningFindings({ findings: [first], eligibility_envelopes: [wrongEnrollment] }), { status: 'rejected', code: 'RULE_LEARNING_ELIGIBILITY_INVALID' });
});

test('support canonical bytes expose opaque lesson codes only for adversarial recurrence identities', () => {
  const privateEvidence = 'Employee Alice Smith reviewed Orion release.';
  const recurrence = 'tenant:orion-550e8400-e29b-41d4-a716-446655440000';
  const personal = makeFinding({ lesson: privateEvidence, recurrence });
  const project = makeFinding({ scope: scopeB, repository: 'e', run: '002', finding: 'f', evidence: 'e', lesson: privateEvidence, recurrence });
  const result = aggregate([personal, project]);
  const shuffled = aggregate([project, personal]);
  const other = aggregate([
    makeFinding({ recurrence: 'codename:zephyr-tenant-42' }),
    makeFinding({ scope: scopeB, repository: 'e', run: '002', finding: 'f', evidence: 'e', recurrence: 'codename:zephyr-tenant-42' }),
  ]);
  assert.equal(result.status, 'support_only');
  assert.equal(result.bytes, shuffled.bytes);
  assert.equal(result.digest, shuffled.digest);
  assert.notEqual(result.global_support[0].lesson_code, other.global_support[0].lesson_code);
  const payload = JSON.parse(result.bytes);
  for (const support of [...payload.project_support, ...payload.global_support]) {
    assert.deepEqual(Object.keys(support), ['schema_version', 'tier', 'taxonomy', 'affected_agent', 'affected_phase', 'lesson_code', 'occurrence_count', 'scope_count', 'finding_digests']);
    assert.match(support.lesson_code, /^lesson:[a-f0-9]{64}$/);
  }
  for (const privateText of [personal.lesson_summary, project.lesson_summary, recurrence, 'tenant', 'orion', '550e8400-e29b-41d4-a716-446655440000', 'codename', 'zephyr']) {
    assert.equal(result.bytes.includes(privateText), false, `support bytes leaked ${privateText}`);
  }
  assert.match(result.bytes, /^\{"schema_version":"pidex-rule-learning-support-v1","project_support":\[/);
});
