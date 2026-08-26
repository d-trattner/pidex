import { createHash } from 'node:crypto';
import { candidateDigest, validRuleLearningCandidate } from './rule-learning-candidate.mjs';
import { readManualRefinementIntake, readRuleLearningReviewerAuthority } from './rule-lifecycle-store.mjs';
const HEX = /^[a-f0-9]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTEXT_FIELDS = Object.freeze(['schema_version', 'candidate_digest', 'candidate_content_hash', 'admission_policy_digest', 'admission_policy_version', 'tier', 'repository_scope_digest']);
const VOTE_FIELDS = Object.freeze(['schema_version', ...CONTEXT_FIELDS.slice(1), 'reviewer_principal', 'backend_identity', 'provider', 'model', 'configuration_generation', 'attempt_id', 'nonce', 'issued_at', 'expires_at', 'decision']);
function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const child of Object.values(value)) freeze(child); return Object.freeze(value); }
function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function deferred(code) { return freeze({ status: 'deferred', code }); }
function digestFields(domain, fields) { const hash = createHash('sha256'); for (const field of [domain, ...fields]) { hash.update(`${Buffer.byteLength(field, 'utf8')}:`, 'ascii'); hash.update(field, 'utf8'); } return hash.digest('hex'); }
function contextFor(candidate) { return freeze({ schema_version: 'pidex-rule-learning-semantic-context-v1', candidate_digest: candidate.candidate_digest, candidate_content_hash: candidate.content_hash, admission_policy_digest: candidate.admission_policy_digest, admission_policy_version: candidate.admission_policy_version, tier: candidate.tier, repository_scope_digest: candidate.scope_digest }); }
function validTime(value) { return typeof value === 'string' && TIME.test(value) && Number.isFinite(Date.parse(value)); }
function fullManualVoteDigest(vote) { if (!exact(vote, VOTE_FIELDS)) throw new Error('RULE_LEARNING_VOTE_INVALID'); return digestFields('pidex-manual-refinement-full-vote-v1', VOTE_FIELDS.map((key) => vote[key])); }
function admittedResult(candidate, votes) { const vote_digests = votes.map(semanticVoteDigest).sort(); const admission = freeze({ schema_version: 'pidex-living-rule-admission-v1', candidate_digest: candidate.candidate_digest, candidate_content_hash: candidate.content_hash, admission_policy_digest: candidate.admission_policy_digest, admission_policy_version: candidate.admission_policy_version, tier: candidate.tier, repository_scope_digest: candidate.scope_digest, vote_digests: freeze(vote_digests) }); const bytes = JSON.stringify(admission); return freeze({ status: 'admitted', admission: freeze({ ...admission, votes: freeze(votes.map((vote) => freeze({ ...vote }))) }), bytes, digest: createHash('sha256').update(bytes, 'utf8').digest('hex') }); }
export function prepareSemanticReviewContext({ candidate } = {}) { if (!validRuleLearningCandidate(candidate)) throw new Error('RULE_LEARNING_REVIEW_CONTEXT_INVALID'); return contextFor(candidate); }
export function semanticVoteDigest(vote) { if (!exact(vote, VOTE_FIELDS)) throw new Error('RULE_LEARNING_VOTE_INVALID'); return digestFields('pidex-living-rule-semantic-vote-v1', VOTE_FIELDS.slice(1, -1).map((key) => vote[key])); }
/** Store-owned reviewer capability validates full candidate identity, current generation, freshness, and replay. */
/** Admits one store-owned canonical manual intake through unchanged semantic authority. */
export function admitManualRefinementIntake({ store, intake_capability, votes, reviewer_authority, now, fault } = {}) {
  const intake = readManualRefinementIntake({ intake_capability });
  if (!intake || !store || typeof store.persistManualRefinementAdmissionIntent !== 'function' || typeof store.persistManualRefinementAdmissionResult !== 'function') return deferred('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
  const context = contextFor(intake.candidate); let vote_digests;
  try { vote_digests = votes.map(fullManualVoteDigest).sort(); } catch { return deferred('RULE_LEARNING_QUORUM_UNAVAILABLE'); }
  const authority = readRuleLearningReviewerAuthority({ authority: reviewer_authority, candidate_digest: intake.candidate_digest, authority_digest: intake.candidate.authority_digest, tier: intake.candidate.tier });
  if (!authority || !validTime(now || authority.now)) return deferred('RULE_LEARNING_REVIEWER_AUTHORITY_UNAVAILABLE');
  if (admitRuleLearningCandidate({ candidate: intake.candidate, context, votes, reviewer_authority, claim: false }).status !== 'validated') return deferred('RULE_LEARNING_QUORUM_UNAVAILABLE');
  const intent = { candidate_digest: intake.candidate_digest, configuration_generation: authority.configuration_generation, created_at: now || authority.now, schema_version: 'pidex-manual-refinement-admission-intent-v1', semantic_context_digest: createHash('sha256').update(JSON.stringify(context), 'utf8').digest('hex'), vote_digests };
  const intent_bytes = Buffer.from(JSON.stringify(intent), 'utf8');
  let intent_result;
  try { fault?.('before_intent'); intent_result = store.persistManualRefinementAdmissionIntent({ intake_capability, intent, intent_bytes, now: now || authority.now, fault }); } catch { return deferred('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE'); }
  let result;
  try {
    const reconciliation = store.reconcileManualRefinementAdmissionClaim({ intake_capability, intent_digest: intent_result.intent_digest, intent, intent_bytes, votes, now: now || authority.now });
    if (reconciliation.status === 'conflict') return deferred('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
    if (admitRuleLearningCandidate({ candidate: intake.candidate, context, votes, reviewer_authority, claim: false }).status !== 'validated') return deferred('RULE_LEARNING_QUORUM_UNAVAILABLE');
    if (reconciliation.status === 'unclaimed') {
      result = admitRuleLearningCandidate({ candidate: intake.candidate, context, votes, reviewer_authority });
      if (result.status !== 'admitted') return result;
      fault?.('after_claim');
    } else result = admittedResult(intake.candidate, votes);
    const stored = store.persistManualRefinementAdmissionResult({ intake_capability, intent_digest: intent_result.intent_digest, admission_bytes: Buffer.from(result.bytes, 'utf8'), now: now || authority.now, fault });
    return freeze({ status: 'admitted', admission: freeze(JSON.parse(result.bytes)), admission_capability: stored.admission_capability });
  } catch { return deferred('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE'); }
}

export function admitRuleLearningCandidate({ candidate, context, votes, reviewer_authority, claim = true } = {}) {
  if (!validRuleLearningCandidate(candidate) || candidate.candidate_digest !== candidateDigest(candidate) || !Array.isArray(votes)) return deferred('RULE_LEARNING_ADMISSION_INVALID');
  const expected = contextFor(candidate); if (!exact(context, CONTEXT_FIELDS) || JSON.stringify(context) !== JSON.stringify(expected)) return deferred('RULE_LEARNING_ADMISSION_CONTEXT_INVALID');
  const config = readRuleLearningReviewerAuthority({ authority: reviewer_authority, candidate_digest: candidate.candidate_digest, authority_digest: candidate.authority_digest, tier: candidate.tier });
  if (!config || !validTime(config.now)) return deferred('RULE_LEARNING_REVIEWER_AUTHORITY_UNAVAILABLE');
  const existing = config.existing || [];
  for (const prior of existing) { if (!prior || typeof prior !== 'object') return deferred('RULE_LEARNING_ADMISSION_CONFLICT'); if (prior.rule_id === candidate.rule_id && prior.candidate_digest !== candidate.candidate_digest) return deferred('RULE_LEARNING_ADMISSION_CONFLICT'); if (prior.rule_id !== candidate.rule_id && prior.content_hash === candidate.content_hash) return deferred('RULE_LEARNING_ADMISSION_CONFLICT'); if (prior.rule_id === candidate.rule_id && prior.candidate_digest === candidate.candidate_digest) return deferred('RULE_LEARNING_ADMISSION_DUPLICATE'); }
  const required = candidate.tier === 'global' ? 3 : 2; if (votes.length !== required) return deferred('RULE_LEARNING_QUORUM_UNAVAILABLE');
  const configured = new Map(config.reviewers.map((item) => [item.principal, item])); const seen = new Set(); const attempts = new Set(); const nonces = new Set(); const backends = new Set();
  for (const vote of votes) { const reviewer = configured.get(vote?.reviewer_principal); if (!exact(vote, VOTE_FIELDS) || vote.schema_version !== 'pidex-living-rule-semantic-vote-v1' || !reviewer || vote.reviewer_principal === candidate.generator_principal || vote.reviewer_principal === config.generator_principal || reviewer.backend !== vote.backend_identity || reviewer.provider !== vote.provider || reviewer.model !== vote.model || vote.configuration_generation !== config.configuration_generation || CONTEXT_FIELDS.slice(1).some((key) => vote[key] !== expected[key]) || !validTime(vote.issued_at) || !validTime(vote.expires_at) || Date.parse(vote.issued_at) > Date.parse(config.now) || Date.parse(config.now) >= Date.parse(vote.expires_at) || Date.parse(vote.expires_at) - Date.parse(vote.issued_at) > 300000 || vote.decision !== 'accept' || seen.has(`${vote.reviewer_principal}:${vote.attempt_id}:${vote.nonce}`) || attempts.has(vote.attempt_id) || nonces.has(vote.nonce) || backends.has(vote.backend_identity)) return deferred('RULE_LEARNING_QUORUM_UNAVAILABLE'); seen.add(`${vote.reviewer_principal}:${vote.attempt_id}:${vote.nonce}`); attempts.add(vote.attempt_id); nonces.add(vote.nonce); backends.add(vote.backend_identity); }
  if (!claim) return freeze({ status: 'validated' });
  if (!config.claim(votes)) return deferred('RULE_LEARNING_QUORUM_UNAVAILABLE'); return admittedResult(candidate, votes);
}
