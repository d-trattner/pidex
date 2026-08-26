import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  canonicalFindingBytes,
  createRuleLearningEligibilityEnvelope,
  createRuleLearningSupport,
  createRuleLearningFinding,
  enrollmentDigest,
  findingDigest,
  lessonCode,
  mapExternalScopeToStore,
  mapStoreScopeToExternal,
  parseCanonicalRuleLearningFindingBytes,
  validateRuleLearningFinding,
} from './rule-learning-contracts.mjs';

const hex = (char) => char.repeat(64);
const finding = (overrides = {}) => ({
  schema_version: 'pidex-rule-learning-finding-v1',
  finding_id: `finding:${'a'.repeat(32)}`,
  producer: 'pidex-retrospective',
  completed_run_id: 'run:completed-001',
  plan_id: 'plan:047',
  project_scope_id: 'a'.repeat(24),
  repository_identity: `repo:${hex('b')}`,
  taxonomy: 'delivery_failure',
  affected_agent: 'pidex-implementer',
  affected_phase: 'implementation',
  recurrence_key: 'quality:validation-missing',
  lesson_summary: 'Validate contract before handoff.',
  evidence_digests: [hex('c')],
  occurred_at: '2026-08-13T00:00:00.000Z',
  redaction_classes: ['none'],
  ...overrides,
});

test('BD-01 creates exact closed retrospective finding bytes, digest, frozen tree, and canonical external scope mapping', () => {
  const input = finding();
  const created = createRuleLearningFinding(input);
  const bytes = canonicalFindingBytes(created);
  assert.equal(created.schema_version, 'pidex-rule-learning-finding-v1');
  assert.equal(bytes.toString('utf8'), JSON.stringify(input));
  assert.equal(findingDigest(created), createHash('sha256').update(bytes).digest('hex'));
  assert.equal(Object.isFrozen(created), true);
  assert.equal(Object.isFrozen(created.evidence_digests), true);
  assert.equal(mapExternalScopeToStore('pidex-global'), '');
  assert.equal(mapStoreScopeToExternal(''), 'pidex-global');
  assert.equal(mapExternalScopeToStore(input.project_scope_id), input.project_scope_id);
  assert.throws(() => { created.evidence_digests.push(hex('d')); }, TypeError);
});

test('BD-01 parses only exact canonical retrospective bytes before persistence authority', () => {
  const bytes = canonicalFindingBytes(createRuleLearningFinding(finding()));
  assert.deepEqual(parseCanonicalRuleLearningFindingBytes(bytes), { ok: true, value: finding(), bytes });
  for (const malformed of [
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]),
    Buffer.from(`${bytes.toString('utf8')}\n`, 'utf8'),
    Buffer.from(JSON.stringify({ ...finding(), producer: 'pidex-retrospective', unknown: true }), 'utf8'),
    Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(finding()).reverse())), 'utf8'),
  ]) assert.deepEqual(parseCanonicalRuleLearningFindingBytes(malformed), { ok: false, code: 'RULE_LEARNING_FINDING_BYTES_INVALID' });
});

test('BD-01 rejects every missing/extra/control/Unicode-invalid finding member before canonical bytes and returns no partial authority', () => {
  const input = finding();
  for (const key of Object.keys(input)) {
    const { [key]: _removed, ...missing } = input;
    assert.deepEqual(validateRuleLearningFinding(missing), { ok: false, code: 'RULE_LEARNING_FINDING_INVALID' }, `missing ${key}`);
  }
  for (const value of [
    { ...input, unknown: true },
    { ...input, lesson_summary: '/private/project/path' },
    { ...input, lesson_summary: 'bad\u0000control' },
    { ...input, lesson_summary: 'Contact alice@example.com for handoff.' },
    { ...input, lesson_summary: 'Host 192.0.2.7 did not complete.' },
    { ...input, lesson_summary: 'Record 550e8400-e29b-41d4-a716-446655440000 did not complete.' },
    { ...input, lesson_summary: 'Read C:\\private\\source now.' },
    { ...input, lesson_summary: 'Cafe\u0301' },
    { ...input, affected_agent: 'PIDEX-IMPLEMENTER' },
    { ...input, evidence_digests: [hex('c'), hex('c')] },
    { ...input, redaction_classes: ['none', 'none'] },
  ]) assert.deepEqual(validateRuleLearningFinding(value), { ok: false, code: 'RULE_LEARNING_FINDING_INVALID' });
  for (const scope of ['', null, 'PIDEX-GLOBAL', 'global']) assert.throws(() => mapExternalScopeToStore(scope), /RULE_LEARNING_SCOPE_INVALID/);
  assert.throws(() => mapStoreScopeToExternal('pidex-global'), /RULE_LEARNING_SCOPE_INVALID/);
});

test('BD-01 remains exact while closed eligibility envelope binds finding, scope, repository, host, and retry identity', () => {
  const created = createRuleLearningFinding(finding());
  const envelope = createRuleLearningEligibilityEnvelope({
    finding: created,
    retry_family_id: 'retry:completed-001',
    evaluator_host_id: `host:${hex('e')}`,
  });
  assert.deepEqual(Object.keys(envelope), ['schema_version', 'finding_digest', 'retry_family_id', 'evaluator_host_id', 'enrollment_digest']);
  assert.equal(envelope.schema_version, 'pidex-rule-learning-eligibility-v1');
  assert.equal(envelope.finding_digest, findingDigest(created));
  assert.equal(envelope.enrollment_digest, enrollmentDigest({
    project_scope_id: created.project_scope_id,
    repository_identity: created.repository_identity,
    evaluator_host_id: envelope.evaluator_host_id,
  }));
  assert.throws(() => createRuleLearningEligibilityEnvelope({ ...envelope, finding: created }), /RULE_LEARNING_ELIGIBILITY_INVALID/);
});

test('support emits opaque domain-separated lesson code without raw recurrence identity', () => {
  const recurrence_key = 'tenant:orion-550e8400-e29b-41d4-a716-446655440000';
  const lesson_code = lessonCode({ taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key });
  const expected = createHash('sha256');
  for (const field of ['pidex-rule-learning-lesson-v1', 'delivery_failure', 'pidex-implementer', 'implementation', recurrence_key]) {
    expected.update(`${Buffer.byteLength(field, 'utf8')}:`, 'ascii');
    expected.update(field, 'utf8');
  }
  assert.equal(lesson_code, `lesson:${expected.digest('hex')}`);
  const support = createRuleLearningSupport({
    schema_version: 'pidex-rule-learning-support-v1', tier: 'project',
    taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation',
    recurrence_key, lesson_code,
    occurrence_count: 2, scope_count: 1, finding_digests: [findingDigest(createRuleLearningFinding(finding()))],
  });
  assert.equal(Object.isFrozen(support), true);
  assert.deepEqual(Object.keys(support), ['schema_version', 'tier', 'taxonomy', 'affected_agent', 'affected_phase', 'lesson_code', 'occurrence_count', 'scope_count', 'finding_digests']);
  assert.equal(JSON.stringify(support).includes(recurrence_key), false);
  assert.equal(Object.hasOwn(support, 'lesson_summary'), false);
  assert.throws(() => lessonCode({ taxonomy: 'unknown', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key }), /RULE_LEARNING_SUPPORT_INVALID/);
  assert.throws(() => lessonCode({ taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'bad/key' }), /RULE_LEARNING_SUPPORT_INVALID/);
  assert.throws(() => createRuleLearningSupport({ ...support, lesson_summary: 'Employee Alice Smith reviewed Orion release.' }), /RULE_LEARNING_SUPPORT_INVALID/);
  assert.throws(() => createRuleLearningSupport({ ...support, lesson_code: 'lesson:unbound' }), /RULE_LEARNING_SUPPORT_INVALID/);
});
