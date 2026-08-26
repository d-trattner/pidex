import { createHash } from 'node:crypto';

const FINDING_FIELDS = Object.freeze(['schema_version', 'finding_id', 'producer', 'completed_run_id', 'plan_id', 'project_scope_id', 'repository_identity', 'taxonomy', 'affected_agent', 'affected_phase', 'recurrence_key', 'lesson_summary', 'evidence_digests', 'occurred_at', 'redaction_classes']);
const ELIGIBILITY_FIELDS = Object.freeze(['schema_version', 'finding_digest', 'retry_family_id', 'evaluator_host_id', 'enrollment_digest']);
const SUPPORT_FIELDS = Object.freeze(['schema_version', 'tier', 'taxonomy', 'affected_agent', 'affected_phase', 'lesson_code', 'occurrence_count', 'scope_count', 'finding_digests']);
const SUPPORT_INPUT_FIELDS = Object.freeze([...SUPPORT_FIELDS.slice(0, 5), 'recurrence_key', ...SUPPORT_FIELDS.slice(5)]);
const HEX64 = /^[a-f0-9]{64}$/;
const SCOPE = /^[a-f0-9]{24,64}$/;
const SAFE_ID = /^[a-z][a-z0-9._:-]{1,127}$/;
const CANDIDATE_SAFE_ID = /^[a-z][a-z0-9-]{2,63}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TAXONOMIES = new Set(['delivery_failure', 'quality_failure', 'review_failure', 'process_failure']);
const AGENTS = new Set(['pidex-planner', 'pidex-critic', 'pidex-implementer', 'pidex-code-reviewer', 'pidex-security', 'pidex-qa', 'pidex-uat', 'pidex-devops', 'pidex-retrospective']);
const PHASES = new Set(['planning', 'critic-review', 'implementation', 'code-review', 'security', 'qa', 'uat', 'devops', 'retrospective']);
const REDACTION_CLASSES = new Set(['none', 'sensitive_removed', 'protected_authority']);
const CANDIDATE_FIELDS = Object.freeze(['schema_version', 'rule_id', 'tier', 'agent', 'slug', 'applicability', 'body', 'predecessor_commit', 'support_digest', 'admission_policy_id', 'admission_policy_version', 'admission_policy_digest', 'generator_principal', 'generator_attempt_id', 'scope_digest', 'descriptor_digests', 'authority_digest', 'content_hash', 'candidate_digest']);
const CANDIDATE_IDENTITY_FIELDS = Object.freeze(CANDIDATE_FIELDS.filter((field) => field !== 'candidate_digest'));
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const PATH_SEPARATOR = /[\\/]/u;
const MANUAL_TEXT_FIELDS = Object.freeze(['instruction', 'trigger', 'expected_evidence', 'failure_behavior', 'rationale']);
const MANUAL_BODY_HEADINGS = Object.freeze(['Instruction', 'Trigger', 'Expected evidence', 'Failure behavior', 'Rationale']);
const UNSAFE_CANDIDATE_TEXT = /(?:https?:\/\/|\[[^\]]*\]\(|`|\$\(|\|\||&&|;|\brm\b|\bsh\b|\bbash\b|\btool\b|\bgrant\b|[\\/])/iu;
const SENSITIVE_CANDIDATE_TEXT = /\b(?:credential|secret|password|token|private|prompt|source)\b/iu;
const EMAIL = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/iu;
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/u;
const UUID = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/iu;

function invalidFinding() { throw new Error('RULE_LEARNING_FINDING_INVALID'); }
function invalidEligibility() { throw new Error('RULE_LEARNING_ELIGIBILITY_INVALID'); }
function invalidSupport() { throw new Error('RULE_LEARNING_SUPPORT_INVALID'); }
function exactKeys(value, keys) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function deeplyFreeze(value) { if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || value instanceof Uint8Array || Object.isFrozen(value)) return value; for (const child of Object.values(value)) deeplyFreeze(child); return Object.freeze(value); }
function safeText(value, max = 512) { return typeof value === 'string' && value.length > 0 && value.length <= max && value.normalize('NFC') === value && !CONTROL.test(value) && !PATH_SEPARATOR.test(value) && !EMAIL.test(value) && !IPV4.test(value) && !UUID.test(value); }
function manualCandidateTextValid(value) { return typeof value === 'string' && value.length > 0 && value.length <= 320 && value.normalize('NFC') === value && !CONTROL.test(value) && !UNSAFE_CANDIDATE_TEXT.test(value) && !SENSITIVE_CANDIDATE_TEXT.test(value); }
function recurrenceFieldsValid(value) {
  return value !== null && typeof value === 'object'
    && TAXONOMIES.has(value.taxonomy) && AGENTS.has(value.affected_agent) && PHASES.has(value.affected_phase)
    && typeof value.recurrence_key === 'string' && /^[a-z][a-z0-9:_-]{2,127}$/.test(value.recurrence_key);
}

/** Derives opaque external lesson identity from validated recurrence dimensions. */
export function lessonCode(value) {
  if (!exactKeys(value, ['taxonomy', 'affected_agent', 'affected_phase', 'recurrence_key']) || !recurrenceFieldsValid(value)) invalidSupport();
  const hash = createHash('sha256');
  for (const field of ['pidex-rule-learning-lesson-v1', value.taxonomy, value.affected_agent, value.affected_phase, value.recurrence_key]) {
    hash.update(`${Buffer.byteLength(field, 'utf8')}:`, 'ascii');
    hash.update(field, 'utf8');
  }
  return `lesson:${hash.digest('hex')}`;
}
function sortedUnique(values) { return Array.isArray(values) && values.length > 0 && values.length <= 16 && values.every((value) => typeof value === 'string') && new Set(values).size === values.length && values.every((value, index) => index === 0 || values[index - 1] < value); }
function validTimestamp(value) { return typeof value === 'string' && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function findingValid(value) {
  return exactKeys(value, FINDING_FIELDS)
    && value.schema_version === 'pidex-rule-learning-finding-v1'
    && /^finding:[a-f0-9]{16,64}$/.test(value.finding_id)
    && value.producer === 'pidex-retrospective'
    && SAFE_ID.test(value.completed_run_id) && value.completed_run_id.startsWith('run:')
    && SAFE_ID.test(value.plan_id) && value.plan_id.startsWith('plan:')
    && typeof value.project_scope_id === 'string' && SCOPE.test(value.project_scope_id)
    && typeof value.repository_identity === 'string' && /^repo:[a-f0-9]{64}$/.test(value.repository_identity)
    && TAXONOMIES.has(value.taxonomy) && AGENTS.has(value.affected_agent) && PHASES.has(value.affected_phase)
    && typeof value.recurrence_key === 'string' && /^[a-z][a-z0-9:_-]{2,127}$/.test(value.recurrence_key)
    && safeText(value.lesson_summary)
    && sortedUnique(value.evidence_digests) && value.evidence_digests.every((digest) => HEX64.test(digest))
    && sortedUnique(value.redaction_classes) && value.redaction_classes.length <= 4 && value.redaction_classes.every((item) => REDACTION_CLASSES.has(item))
    && validTimestamp(value.occurred_at);
}
function eligibilityValid(value) {
  return exactKeys(value, ELIGIBILITY_FIELDS)
    && value.schema_version === 'pidex-rule-learning-eligibility-v1'
    && HEX64.test(value.finding_digest)
    && /^retry:[a-z0-9][a-z0-9._-]{1,127}$/.test(value.retry_family_id)
    && /^host:[a-f0-9]{64}$/.test(value.evaluator_host_id)
    && HEX64.test(value.enrollment_digest);
}
function supportValid(value) {
  const global = value?.tier === 'global';
  return exactKeys(value, SUPPORT_INPUT_FIELDS)
    && value.schema_version === 'pidex-rule-learning-support-v1'
    && (value.tier === 'project' || global)
    && recurrenceFieldsValid(value)
    && value.lesson_code === lessonCode({ taxonomy: value.taxonomy, affected_agent: value.affected_agent, affected_phase: value.affected_phase, recurrence_key: value.recurrence_key })
    && Number.isSafeInteger(value.occurrence_count) && value.occurrence_count >= 1 && value.occurrence_count <= 1024
    && Number.isSafeInteger(value.scope_count) && value.scope_count >= 1 && value.scope_count <= 1024 && (global ? value.scope_count >= 2 : value.scope_count === 1)
    && sortedUnique(value.finding_digests) && value.finding_digests.length <= 1024 && value.finding_digests.every((digest) => HEX64.test(digest));
}
function ordered(value, fields) { return Object.fromEntries(fields.map((field) => [field, Array.isArray(value[field]) ? [...value[field]] : value[field]])); }

/** Validates an external scope; only this boundary maps global to internal store key. */
export function mapExternalScopeToStore(scopeId) {
  if (scopeId === 'pidex-global') return '';
  if (typeof scopeId === 'string' && SCOPE.test(scopeId)) return scopeId;
  throw new Error('RULE_LEARNING_SCOPE_INVALID');
}

/** Converts an internal store scope to the sole external global token. */
export function mapStoreScopeToExternal(scopeId) {
  if (scopeId === '') return 'pidex-global';
  if (typeof scopeId === 'string' && SCOPE.test(scopeId)) return scopeId;
  throw new Error('RULE_LEARNING_SCOPE_INVALID');
}

export function validateRuleLearningFinding(value) { return findingValid(value) ? deeplyFreeze({ ok: true, value: deeplyFreeze(ordered(value, FINDING_FIELDS)) }) : deeplyFreeze({ ok: false, code: 'RULE_LEARNING_FINDING_INVALID' }); }

/** Validates only closed eligibility envelope structure; binding is checked against its finding by aggregation. */
export function validateRuleLearningEligibilityEnvelope(value) { return eligibilityValid(value) ? deeplyFreeze({ ok: true, value: deeplyFreeze(ordered(value, ELIGIBILITY_FIELDS)) }) : deeplyFreeze({ ok: false, code: 'RULE_LEARNING_ELIGIBILITY_INVALID' }); }

/** Creates closed retrospective-only finding. Input changes are never normalized into authority. */
export function createRuleLearningFinding(value) {
  if (!findingValid(value)) invalidFinding();
  return deeplyFreeze(ordered(value, FINDING_FIELDS));
}

export function canonicalFindingBytes(value) {
  if (!findingValid(value)) invalidFinding();
  return Buffer.from(JSON.stringify(ordered(value, FINDING_FIELDS)), 'utf8');
}

/** Parses external retrospective bytes only when exact canonical UTF-8 finding serialization matches. */
export function parseCanonicalRuleLearningFindingBytes(bytes) {
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) return deeplyFreeze({ ok: false, code: 'RULE_LEARNING_FINDING_BYTES_INVALID' });
  const exact = Buffer.from(bytes);
  let parsed;
  try { parsed = JSON.parse(exact.toString('utf8')); } catch { return deeplyFreeze({ ok: false, code: 'RULE_LEARNING_FINDING_BYTES_INVALID' }); }
  const checked = validateRuleLearningFinding(parsed);
  if (!checked.ok || !canonicalFindingBytes(checked.value).equals(exact)) return deeplyFreeze({ ok: false, code: 'RULE_LEARNING_FINDING_BYTES_INVALID' });
  return deeplyFreeze({ ok: true, value: checked.value, bytes: exact });
}

export function findingDigest(value) { return createHash('sha256').update(canonicalFindingBytes(value)).digest('hex'); }

/** Domain-separated candidate identity. This is distinct from canonical candidate-byte SHA-256. */
export function candidateIdentityDigest(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !CANDIDATE_IDENTITY_FIELDS.every((field) => Object.hasOwn(candidate, field))) return null;
  const hash = createHash('sha256');
  for (const field of ['pidex-living-rule-candidate-v1', ...CANDIDATE_IDENTITY_FIELDS.flatMap((field) => [field, JSON.stringify(candidate[field])])]) {
    const bytes = Buffer.from(field, 'utf8'); hash.update(`${bytes.length}:`, 'ascii'); hash.update(bytes);
  }
  return hash.digest('hex');
}

/** Shared generated/manual field grammar. Candidate builder and private sink use this exact validator. */
export function validManualCompatibleCandidateFields(value) {
  return exactKeys(value, ['slug', 'applicability', ...MANUAL_TEXT_FIELDS]) && CANDIDATE_SAFE_ID.test(value.slug) && Array.isArray(value.applicability) && value.applicability.length === 1 && value.applicability.every((item) => CANDIDATE_SAFE_ID.test(item)) && MANUAL_TEXT_FIELDS.every((field) => manualCandidateTextValid(value[field]));
}

/** Parses only exact rendered candidate Markdown and returns its five governed text fields. */
export function validateManualCompatibleCandidateBody({ body, slug, applicability } = {}) {
  if (typeof body !== 'string' || !CANDIDATE_SAFE_ID.test(slug) || !Array.isArray(applicability) || applicability.length !== 1 || !applicability.every((item) => CANDIDATE_SAFE_ID.test(item))) return null;
  const match = /^# ([a-z][a-z0-9-]{2,63})\n\n## Instruction\n([^\n]+)\n\n## Trigger\n([^\n]+)\n\n## Expected evidence\n([^\n]+)\n\n## Failure behavior\n([^\n]+)\n\n## Rationale\n([^\n]+)\n$/u.exec(body);
  if (!match || match[1] !== slug) return null;
  const fields = { slug, applicability: [...applicability], instruction: match[2], trigger: match[3], expected_evidence: match[4], failure_behavior: match[5], rationale: match[6] };
  return validManualCompatibleCandidateFields(fields) ? deeplyFreeze(fields) : null;
}

/** Validates complete closed candidate shape and all embedded identity/content claims. */
export function validRuleLearningCandidate(candidate) {
  if (!exactKeys(candidate, CANDIDATE_FIELDS) || candidate.schema_version !== 'pidex-managed-rule-v1' || !['project', 'global'].includes(candidate.tier) || !CANDIDATE_SAFE_ID.test(candidate.agent) || !validateManualCompatibleCandidateBody({ body: candidate.body, slug: candidate.slug, applicability: candidate.applicability }) || !/^commit:[a-f0-9]{40}$/.test(candidate.predecessor_commit) || ![candidate.support_digest, candidate.admission_policy_digest, candidate.scope_digest, candidate.authority_digest, candidate.content_hash, candidate.candidate_digest].every((item) => HEX64.test(item)) || !Array.isArray(candidate.descriptor_digests) || !candidate.descriptor_digests.length || !candidate.descriptor_digests.every((item) => HEX64.test(item)) || candidate.content_hash !== createHash('sha256').update(candidate.body, 'utf8').digest('hex') || candidate.candidate_digest !== candidateIdentityDigest(candidate)) return false;
  return candidate.tier === 'global' ? candidate.rule_id === `pidex-global:${candidate.agent}:${candidate.slug}` : candidate.rule_id === `project:${candidate.scope_digest.slice(0, 24)}:${candidate.agent}:${candidate.slug}`;
}

/** Produces exact canonical serialized candidate bytes; identity digest stays embedded and separate. */
export function canonicalRuleLearningCandidateBytes(candidate) {
  return validRuleLearningCandidate(candidate) ? JSON.stringify(ordered(candidate, CANDIDATE_FIELDS)) : null;
}

/** SHA-256 over canonical candidate bytes; never compare this domain with candidate identity digest. */
export function candidateBytesDigest(candidateOrBytes) {
  const bytes = typeof candidateOrBytes === 'string' ? Buffer.from(candidateOrBytes, 'utf8') : Buffer.isBuffer(candidateOrBytes) || candidateOrBytes instanceof Uint8Array ? Buffer.from(candidateOrBytes) : null;
  return bytes ? createHash('sha256').update(bytes).digest('hex') : null;
}

/** SHA-256 over UTF-8 length-prefixed domain, project scope, repository identity, then host digest identity. */
export function enrollmentDigest({ project_scope_id, repository_identity, evaluator_host_id } = {}) {
  if (!(typeof project_scope_id === 'string' && SCOPE.test(project_scope_id) && typeof repository_identity === 'string' && /^repo:[a-f0-9]{64}$/.test(repository_identity) && /^host:[a-f0-9]{64}$/.test(evaluator_host_id))) invalidEligibility();
  const hash = createHash('sha256');
  for (const field of ['pidex-rule-learning-enrollment-v1', project_scope_id, repository_identity, evaluator_host_id]) {
    hash.update(`${Buffer.byteLength(field, 'utf8')}:`, 'ascii');
    hash.update(field, 'utf8');
  }
  return hash.digest('hex');
}

/** Creates immutable eligibility envelope keyed by finding digest; raw hostname never enters contract. */
export function createRuleLearningEligibilityEnvelope(input = {}) {
  if (!exactKeys(input, ['finding', 'retry_family_id', 'evaluator_host_id'])) invalidEligibility();
  const { finding, retry_family_id, evaluator_host_id } = input;
  if (!findingValid(finding) || !/^retry:[a-z0-9][a-z0-9._-]{1,127}$/.test(retry_family_id) || !/^host:[a-f0-9]{64}$/.test(evaluator_host_id)) invalidEligibility();
  return deeplyFreeze({
    schema_version: 'pidex-rule-learning-eligibility-v1',
    finding_digest: findingDigest(finding),
    retry_family_id,
    evaluator_host_id,
    enrollment_digest: enrollmentDigest({ project_scope_id: finding.project_scope_id, repository_identity: finding.repository_identity, evaluator_host_id }),
  });
}

/** Creates bounded recurrence support only; no eligibility, admission, or candidate authority. */
export function createRuleLearningSupport(value) {
  if (!supportValid(value)) invalidSupport();
  return deeplyFreeze(ordered(value, SUPPORT_FIELDS));
}

/** Validates closed aggregate support carried into candidate/admission boundaries. */
export function validRuleLearningSupport(value) {
  return exactKeys(value, SUPPORT_FIELDS) && value.schema_version === 'pidex-rule-learning-support-v1' && ['project', 'global'].includes(value.tier) && TAXONOMIES.has(value.taxonomy) && AGENTS.has(value.affected_agent) && PHASES.has(value.affected_phase) && typeof value.lesson_code === 'string' && /^lesson:[a-f0-9]{64}$/.test(value.lesson_code) && Number.isSafeInteger(value.occurrence_count) && value.occurrence_count > 0 && value.occurrence_count <= 1024 && Number.isSafeInteger(value.scope_count) && value.scope_count > 0 && value.scope_count <= 1024 && (value.tier === 'global' ? value.scope_count >= 2 : value.scope_count === 1) && sortedUnique(value.finding_digests) && value.finding_digests.length === value.occurrence_count && value.finding_digests.every((digest) => HEX64.test(digest));
}

/** Domain-separated support digest shared by builder and manual sink attestation. */
export function ruleLearningSupportDigest(value) {
  if (!validRuleLearningSupport(value)) return null;
  const hash = createHash('sha256');
  for (const field of ['pidex-rule-learning-support-v1', JSON.stringify(ordered(value, SUPPORT_FIELDS))]) {
    const bytes = Buffer.from(field, 'utf8'); hash.update(`${bytes.length}:`, 'ascii'); hash.update(bytes);
  }
  return hash.digest('hex');
}
