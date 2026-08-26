import { createHash } from 'node:crypto';
import {
  createRuleLearningSupport,
  enrollmentDigest,
  findingDigest,
  lessonCode,
  validateRuleLearningEligibilityEnvelope,
  validateRuleLearningFinding,
} from './rule-learning-contracts.mjs';

const OUTPUT_FIELDS = Object.freeze(['schema_version', 'project_support', 'global_support']);

function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) freeze(child); return Object.freeze(value); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function exactKeys(value, keys) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function canonicalPayload(projectSupport, globalSupport) { return { schema_version: 'pidex-rule-learning-support-v1', project_support: projectSupport, global_support: globalSupport }; }
function aggregateKey(finding) { return [finding.taxonomy, finding.affected_agent, finding.affected_phase, finding.recurrence_key].join('\0'); }
function findingOrder(left, right) { return compare(findingDigest(left), findingDigest(right)); }
function supportFor(tier, findings, scopeCount) {
  const first = findings[0];
  return createRuleLearningSupport({
    schema_version: 'pidex-rule-learning-support-v1', tier,
    taxonomy: first.taxonomy, affected_agent: first.affected_agent, affected_phase: first.affected_phase,
    recurrence_key: first.recurrence_key,
    lesson_code: lessonCode({ taxonomy: first.taxonomy, affected_agent: first.affected_agent, affected_phase: first.affected_phase, recurrence_key: first.recurrence_key }),
    occurrence_count: findings.length, scope_count: scopeCount,
    finding_digests: findings.map(findingDigest).sort(compare),
  });
}
function rejected(code) { return freeze({ status: 'rejected', code }); }

function verifiedEnvelopes(findings, envelopes) {
  if (!Array.isArray(envelopes) || envelopes.length !== findings.length) return null;
  const byDigest = new Map();
  for (const envelope of envelopes) {
    const checked = validateRuleLearningEligibilityEnvelope(envelope);
    if (!checked.ok) return null;
    const prior = byDigest.get(checked.value.finding_digest);
    if (prior && JSON.stringify(prior) !== JSON.stringify(checked.value)) return 'conflict';
    byDigest.set(checked.value.finding_digest, checked.value);
  }
  for (const finding of findings) {
    const digest = findingDigest(finding);
    const envelope = byDigest.get(digest);
    if (!envelope || envelope.enrollment_digest !== enrollmentDigest({
      project_scope_id: finding.project_scope_id,
      repository_identity: finding.repository_identity,
      evaluator_host_id: envelope.evaluator_host_id,
    })) return null;
  }
  return byDigest;
}

function noDuplicateRepositoryOrSummary(groups) {
  for (const group of groups.values()) {
    const repositories = new Map();
    const summaries = new Set();
    for (const finding of group) {
      const prior = repositories.get(finding.repository_identity);
      if (prior && prior !== findingDigest(finding)) return false;
      repositories.set(finding.repository_identity, findingDigest(finding));
      summaries.add(finding.lesson_summary);
    }
    if (summaries.size !== 1) return false;
  }
  return true;
}

/** Builds tier-isolated, enrollment-bound recurrence support only; no candidate or admission authority. */
export function aggregateRuleLearningFindings(input = {}) {
  if (!exactKeys(input, ['findings', 'eligibility_envelopes']) || !Array.isArray(input.findings) || input.findings.length > 1024) return rejected('RULE_LEARNING_AGGREGATE_INVALID');
  const accepted = [];
  for (const finding of input.findings) {
    const checked = validateRuleLearningFinding(finding);
    if (!checked.ok) return rejected('RULE_LEARNING_AGGREGATE_INVALID');
    accepted.push(checked.value);
  }
  const envelopes = verifiedEnvelopes(accepted, input.eligibility_envelopes);
  if (envelopes === 'conflict') return rejected('RULE_LEARNING_ELIGIBILITY_CONFLICT');
  if (!envelopes) return rejected('RULE_LEARNING_ELIGIBILITY_INVALID');

  const byRun = new Map();
  const byFinding = new Map();
  const byRetry = new Map();
  const scopeRepositories = new Map();
  const unique = new Map();
  for (const finding of accepted) {
    const digest = findingDigest(finding);
    for (const [index, key] of [[byRun, finding.completed_run_id], [byFinding, finding.finding_id], [byRetry, envelopes.get(digest).retry_family_id]]) {
      const prior = index.get(key);
      if (prior && prior !== digest) return rejected('RULE_LEARNING_AGGREGATE_CONFLICT');
      index.set(key, digest);
    }
    const boundScope = scopeRepositories.get(finding.project_scope_id);
    if (boundScope && boundScope !== finding.repository_identity) return rejected('RULE_LEARNING_AGGREGATE_CONFLICT');
    scopeRepositories.set(finding.project_scope_id, finding.repository_identity);
    unique.set(digest, finding);
  }

  const projectGroups = new Map();
  const globalGroups = new Map();
  for (const finding of [...unique.values()].sort(findingOrder)) {
    const key = aggregateKey(finding);
    const projectKey = `${finding.project_scope_id}\0${key}`;
    if (!projectGroups.has(projectKey)) projectGroups.set(projectKey, []);
    projectGroups.get(projectKey).push(finding);
    if (!globalGroups.has(key)) globalGroups.set(key, []);
    globalGroups.get(key).push(finding);
  }
  if (!noDuplicateRepositoryOrSummary(projectGroups) || !noDuplicateRepositoryOrSummary(globalGroups)) return rejected('RULE_LEARNING_AGGREGATE_CONFLICT');

  const projectSupport = [...projectGroups.entries()]
    .map(([key, group]) => ({ key, value: supportFor('project', group, 1) }))
    .sort((left, right) => compare(left.key, right.key))
    .map((item) => item.value);
  const globalSupport = [];
  for (const [key, group] of globalGroups.entries()) {
    const scopes = new Set(group.map((finding) => finding.project_scope_id));
    const repositories = new Set(group.map((finding) => finding.repository_identity));
    const hosts = new Set(group.map((finding) => envelopes.get(findingDigest(finding)).evaluator_host_id));
    if (hosts.size !== 1) return rejected('RULE_LEARNING_ELIGIBILITY_CONFLICT');
    if (scopes.size >= 2 && repositories.size >= 2) globalSupport.push({ key, value: supportFor('global', group, scopes.size) });
  }
  globalSupport.sort((left, right) => compare(left.key, right.key));
  const payload = canonicalPayload(projectSupport, globalSupport.map((item) => item.value));
  const bytes = JSON.stringify(Object.fromEntries(OUTPUT_FIELDS.map((field) => [field, payload[field]])));
  return freeze({ status: 'support_only', project_support: projectSupport, global_support: globalSupport.map((item) => item.value), bytes, digest: createHash('sha256').update(bytes, 'utf8').digest('hex') });
}
