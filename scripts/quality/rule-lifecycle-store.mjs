import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildRuleRuntimeContext } from './rule-resolver.mjs';
import { reconcileRuleInventory } from './rule-inventory.mjs';
import { consumeAcceptedRemoteReceipt, materializeVerifiedMirror, verifyAcceptedRemoteDescendantProof } from './rule-mirror-sync.mjs';
import { bindInputChain, isImpactAggregateCapabilityMint, parseImpactEvaluationBytes, readImmutableFile, writeImmutableInput } from './rule-impact-results.mjs';
import { candidateBytesDigest, canonicalRuleLearningCandidateBytes, candidateIdentityDigest, createRuleLearningEligibilityEnvelope, findingDigest, parseCanonicalRuleLearningFindingBytes, ruleLearningSupportDigest, validRuleLearningCandidate, validRuleLearningSupport, validateRuleLearningEligibilityEnvelope, validateRuleLearningFinding } from './rule-learning-contracts.mjs';
import { createAutomaticLearningAdapterEvent } from './rule-lifecycle.mjs';
import { classifyActionCadenceHistory } from './rule-git-writer.mjs';

const SQLITE_BUSY_TIMEOUT_MS = 250;
const SQLITE_INIT_RETRY_MS = 20;
const SQLITE_INIT_RETRY_BUDGET_MS = 5_000;
const CADENCE_LEASE_MS = 5 * 60 * 1000;
const CADENCE_CONFIG_UPDATED_AT = '1970-01-01T00:00:00.000Z';
const CADENCE_TERMINAL_STATUSES = new Set(['blocked', 'collecting', 'evaluated', 'unavailable', 'superseded', 'expired']);
const CADENCE_OWNER = /^[A-Za-z0-9._:-]{1,128}$/;
const CADENCE_INPUT_ID = /^rule-impact-input:[a-f0-9]{64}$/;
const IMPACT_TARGET_SELECTOR_KEYS = Object.freeze(['tier', 'scope_id', 'rule_id', 'version_hash', 'content_hash', 'activation_epoch']);
const IMPACT_EVALUATION_SELECTOR_KEYS = Object.freeze(['tier', 'scope_id', 'rule_id', 'version_hash', 'content_hash', 'activation_epoch', 'policy_id', 'policy_digest']);
const IMPACT_EVALUATION_ACTIVE_STATES = new Set(['collecting', 'frozen', 'inconclusive', 'repeated_observational_harm']);
const IMPACT_HISTORY_DESCRIPTOR_KEYS = Object.freeze(['exposure_id', 'publication_digest', 'input_id', 'input_digest', 'target_ordinal', 'tier', 'scope_id', 'production_started_at', 'captured_at']);
const IMPACT_DUE_CHECKPOINT_KEYS = Object.freeze(['checkpoint_key', 'checkpoint_digest', 'tier', 'scope_id', 'rule_id', 'version_hash', 'content_hash', 'activation_epoch', 'policy_id', 'policy_digest', 'opening_id', 'opening_digest', 'checkpoint_kind', 'due_at']);
const IMPACT_AGGREGATE_OPENING_KEYS = Object.freeze(['opening_id', 'opening_projection_digest', 'opening_blob_id', 'opening_blob_digest']);
const IMPACT_AGGREGATE_CONTRACT_KEYS = Object.freeze(['impact_contract_ref', 'impact_contract_digest']);
const IMPACT_AGGREGATE_FAMILY_KEYS = Object.freeze(['window_code', 'production_started_at', 'family_id', 'project_scope', 'plan_id', 'run_family_id', 'source_measurement_input_id', 'source_measurement_input_digest', 'family_projection_digest', 'event_refs']);
const IMPACT_AGGREGATE_EVENT_REF_KEYS = Object.freeze(['event_id', 'event_digest']);
const FREEZE_DELAY_MS = 5_788_800_000;
const aggregateCommitCapabilities = new WeakMap();
const producerPublicationCapabilities = new WeakMap();
const learningEnrollmentCapabilities = new WeakMap();
const learningReviewerCapabilities = new WeakMap();
const publicationProofCapabilities = new WeakMap();
const lifecycleActionProofCapabilities = new WeakMap();
const manualRefinementCapabilities = new WeakMap();
const manualRefinementIntakeCapabilities = new WeakMap();
const manualRefinementAdmissionCapabilities = new WeakMap();
const manualRefinementAdmissions = new Map();
const manualCandidateAttestations = new WeakMap();
const automaticLearningHistoryCapabilities = new WeakMap();
const automaticLearningProfileCapabilities = new WeakMap();
const automaticLearningRuntimeCapabilities = new WeakMap();
const automaticPublicationTargetCapabilities = new WeakMap();
const MANUAL_REFINEMENT_REQUEST = /^manual-refinement:[a-f0-9]{64}$/;
const PRODUCER_FAMILY_KEYS = Object.freeze(['schema', 'project_scope', 'plan_id', 'plan_class', 'root_run_id', 'run_family_id', 'production_started_at']);
const PRODUCER_EXECUTION_KEYS = Object.freeze(['schema', 'model_provider', 'model_identity', 'model_version', 'pipeline_version', 'route_topology', 'agent_role', 'agent_version', 'phase', 'capability_set', 'budget_class', 'workload_risk_fingerprint_class']);
const PRODUCER_TERMINAL_KEYS = Object.freeze(['schema', 'run_family_id', 'outcome_definition_id', 'outcome_definition_version', 'outcome_vector', 'outcome_finalized_at']);
const PRODUCER_PUBLICATION_KEYS = Object.freeze(['schema', 'family', 'execution', 'config_digest', 'impact_contract_ref', 'impact_contract_digest', 'impact_contract_bytes', 'raw_pre_outcome_covariates', 'outcome_source_identity', 'outcome_source_digest', 'outcome_finalized_at', 'outcome_vector']);
const LEARNING_VOTE_FIELDS = Object.freeze(['schema_version', 'candidate_digest', 'candidate_content_hash', 'admission_policy_digest', 'admission_policy_version', 'tier', 'repository_scope_digest', 'reviewer_principal', 'backend_identity', 'provider', 'model', 'configuration_generation', 'attempt_id', 'nonce', 'issued_at', 'expires_at', 'decision']);
const LEARNING_CLAIM_TEXT = /^[A-Za-z0-9._:-]{1,512}$/;
function lifecyclePath(stateRoot) { if (!stateRoot || typeof stateRoot !== 'string') throw new Error('RULE_LIFECYCLE_STATE_ROOT_REQUIRED'); return path.join(path.resolve(stateRoot), 'quality', 'rule-lifecycle', 'lifecycle.sqlite'); }
function existingLifecycleStoreValid(db) {
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    const schema = tables.has('schema_meta') ? db.prepare('SELECT schema FROM schema_meta').all().map((row) => row.schema) : [];
    return ['schema_meta', 'repository_enrollment', 'publication_enrollment', 'automatic_learning_profile', 'rule_learning_finding_history'].every((table) => tables.has(table)) && schema.length === 1 && schema[0] === 'rule-lifecycle-db-v8';
  } catch { return false; }
}
function wait(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function busy(error) { return /database is locked|SQLITE_BUSY/i.test(String(error?.message)); }
function storageUnavailable(error) { return Object.assign(new Error('RULE_LIFECYCLE_STORAGE_UNAVAILABLE'), { code: 'RULE_LIFECYCLE_STORAGE_UNAVAILABLE', cause: error }); }
function scopeKey(scopeId) { return scopeId || ''; }
const PUBLICATION_SCOPE = /^[a-f0-9]{24,64}$/;
const PUBLICATION_RULE = /^(?:pidex-global|project:[a-f0-9]{24,64}):[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;
const PUBLICATION_PATH = /^(?:config\/rule-baseline-manifest\.json|rules\/[a-z][a-z0-9-]*\/(?:index\.md|[a-z][a-z0-9-]*\.md)|pidex\/rules\/managed\/[a-z][a-z0-9-]*\/(?:index\.md|[a-z][a-z0-9-]*\.md))$/;
const PUBLICATION_TERMINALS = new Set(['accepted_remote', 'deferred_remote_advanced', 'rejected_policy', 'abandoned']);
const POLICY_CATEGORY_BY_REASON = Object.freeze({ policy_violation: 'policy', enrollment_invalid: 'enrollment', identity_drift: 'identity', privacy_violation: 'privacy' });
const ACCEPTED_RECEIPT_KEYS = Object.freeze(['schema', 'status', 'repository_identity', 'scope_id', 'rule_id', 'predecessor_commit', 'accepted_commit', 'tree_digest', 'content_hash', 'admission_digest', 'transaction_digest', 'lifecycle_state']);
const HANDOFF_STAGES = Object.freeze(['receipt_accepted', 'receipt_consumed', 'bundle_verified', 'mirror_verified', 'projection_applied', 'reattested', 'status_ready']);
const ACTION_HANDOFF_STAGES = Object.freeze(['receipt_accepted', 'mirror_verified', 'projection_applied', 'status_ready']);
const HANDOFF_MEMBER_KEYS = Object.freeze(['rule_id', 'path', 'content_hash']);
const HANDOFF_TARGET_EPOCH_KEYS = Object.freeze(['repository_digest', 'scope_id', 'rule_id', 'rule_version', 'activation_epoch']);
const LOCAL_STOP_REASONS = new Set(['publication_stop', 'manual_stop', 'operator_stop']);
const WRITER_AUTHORITY_KEYS = Object.freeze(['normalized_remote_digest', 'branch', 'author', 'writer_enabled', 'trailer_policy', 'repository_identity_digest', 'identity_platform', 'root_identity_digest', 'parent_identity_digest', 'files_identity_digest', 'identity_proof', 'publication_timestamp']);
const WRITER_AUTHOR = /^[A-Za-z][A-Za-z .'-]{0,126} <[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9.-]{1,190}>$/;
const WRITER_BRANCH = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;
function validWriterAuthority(value) { return exactKeys(value, WRITER_AUTHORITY_KEYS) && validDigest(value.normalized_remote_digest) && WRITER_BRANCH.test(value.branch) && !value.branch.includes('..') && !value.branch.endsWith('.') && WRITER_AUTHOR.test(value.author) && value.author.normalize('NFC') === value.author && value.writer_enabled === true && value.trailer_policy === 'publication-v1' && validDigest(value.repository_identity_digest) && ['posix', 'windows'].includes(value.identity_platform) && validDigest(value.root_identity_digest) && validDigest(value.parent_identity_digest) && validDigest(value.files_identity_digest) && value.identity_proof === 'supported-v1' && validPublicationTime(value.publication_timestamp); }
function externalPublicationScope(scopeId) { if (scopeId === 'pidex-global') return ''; if (typeof scopeId === 'string' && PUBLICATION_SCOPE.test(scopeId)) return scopeId; throw new Error('RULE_PUBLICATION_SCOPE_INVALID'); }
function outwardPublicationScope(scopeId) { if (scopeId === '') return 'pidex-global'; if (typeof scopeId === 'string' && PUBLICATION_SCOPE.test(scopeId)) return scopeId; throw new Error('RULE_PUBLICATION_SCOPE_INVALID'); }
function validLocalStopIdentity(scope, ruleId) {
  if (typeof ruleId !== 'string' || !PUBLICATION_RULE.test(ruleId)) return false;
  return scope === '' ? ruleId.startsWith('pidex-global:') : ruleId.startsWith(`project:${scope}:`);
}
function safeLocalStop(repository, scope, rule_id, reason_code) { return freeze({ repository_digest: digest(repository), scope_id: outwardPublicationScope(scope), rule_id, reason_code }); }
function validPublicationTarget(value) {
  const keys = ['repository', 'tier', 'scope_id', 'scope_digest', 'rule_id', 'predecessor', 'enrollment_digest', 'allowed_paths', 'writer_authority'];
  if (!exactKeys(value, keys) || typeof value.repository !== 'string' || !value.repository || !['global', 'project'].includes(value.tier) || typeof value.scope_id !== 'string' || !validDigest(value.scope_digest) || typeof value.rule_id !== 'string' || !PUBLICATION_RULE.test(value.rule_id) || !/^commit:[a-f0-9]{40}$/.test(value.predecessor) || !validDigest(value.enrollment_digest) || !Array.isArray(value.allowed_paths) || !validWriterAuthority(value.writer_authority)) return false;
  const parts = value.rule_id.split(':'); const global = parts[0] === 'pidex-global';
  const expected = global ? ['config/rule-baseline-manifest.json', `rules/${parts[1]}/index.md`, `rules/${parts[1]}/${parts[2]}.md`] : [`pidex/rules/managed/${parts[2]}/index.md`, `pidex/rules/managed/${parts[2]}/${parts[3]}.md`];
  return value.tier === (global ? 'global' : 'project') && (global ? value.scope_id === 'pidex-global' : value.scope_id === parts[1] && PUBLICATION_SCOPE.test(value.scope_id)) && canonical(value.allowed_paths) === canonical(expected.sort());
}
function validPublicationTime(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function validPublicationRecord(value) { return value && typeof value === 'object' && validPublicationTarget(value.target) && typeof value.idempotency_key === 'string' && /^tx:[a-f0-9]{64}$/.test(value.idempotency_key) && validHead(value.expected_base) && Buffer.isBuffer(value.candidate_bytes) && Buffer.isBuffer(value.admission_bytes) && validDigest(value.candidate_digest) && validDigest(value.admission_digest) && value.admission_digest === createHash('sha256').update(value.admission_bytes).digest('hex') && validPublicationTime(value.created_at); }
function validHead(value) { return typeof value === 'string' && /^[a-f0-9]{40}$/.test(value); }
function validPublicationStagedMemberDigests(value, allowedPaths) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === allowedPaths.length && Object.keys(value).every((path) => allowedPaths.includes(path) && validDigest(value[path])); }
function acceptedReceiptRulePath(ruleId, scope) { const global = /^pidex-global:([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(ruleId || ''); if (global && scope === '') return `rules/${global[1]}/${global[2]}.md`; const project = /^project:([a-f0-9]{24,64}):([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/.exec(ruleId || ''); return project && project[1] === scope ? `pidex/rules/managed/${project[2]}/${project[3]}.md` : null; }
function validAcceptedReceipt(receipt) { return exactKeys(receipt, ACCEPTED_RECEIPT_KEYS) && receipt.schema === 'pidex-accepted-remote-receipt-v1' && receipt.status === 'accepted_remote' && [receipt.repository_identity, receipt.scope_id, receipt.rule_id].every((value) => typeof value === 'string' && value) && [receipt.predecessor_commit, receipt.accepted_commit].every(validHead) && [receipt.tree_digest, receipt.content_hash, receipt.admission_digest, receipt.transaction_digest].every(validDigest) && LIFECYCLE_STATES.includes(receipt.lifecycle_state); }
function validEntries(entries) { return Array.isArray(entries) && entries.every((entry) => entry && typeof entry.rule_id === 'string' && /^[a-f0-9]{64}$/.test(entry.rule_version) && entry.content_hash === entry.rule_version && LIFECYCLE_STATES.includes(entry.lifecycle_state)); }
function derivedEpoch(repository, scope, entry, acceptedHead) { return `epoch:${createHash('sha256').update(`${repository}\0${scope}\0${entry.rule_id}\0${entry.rule_version}\0${acceptedHead}`).digest('hex').slice(0, 24)}`; }
function storeOwnedEntries(repository, scope, acceptedHead, entries, previousEntries = []) {
  const previous = new Map(previousEntries.map((entry) => [`${entry.rule_id}\0${entry.rule_version}`, entry]));
  return entries.map((entry) => {
    if (!ACTIVE_STATES.includes(entry.lifecycle_state)) { const { activation_epoch, ...closed } = entry; return closed; }
    const existing = previous.get(`${entry.rule_id}\0${entry.rule_version}`);
    return { ...entry, activation_epoch: existing?.lifecycle_state !== undefined && ACTIVE_STATES.includes(existing.lifecycle_state) ? existing.activation_epoch : derivedEpoch(repository, scope, entry, acceptedHead) };
  });
}
function canonical(value) { if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : canonical(item)).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function freeze(value) { if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || value instanceof Uint8Array || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
const RUNTIME_DIGEST_KEYS = Object.freeze(['schema', 'run_identity_digest', 'project_authority_digest', 'inventory_identity_digest', 'lifecycle_head_digest', 'projection_digest', 'epoch_catalog_digest', 'mirror_generation_digest', 'reconciliation_artifact_digest']);
const RUNTIME_CONTEXT_KEYS = Object.freeze(['schema', 'pipeline_id', 'input_digests', 'resolver_snapshot', 'passive_exposure_input']);
function validRuntimeDigests(value) { return exactKeys(value, RUNTIME_DIGEST_KEYS) && value.schema === 'pidex-rule-runtime-input-digests-v1' && RUNTIME_DIGEST_KEYS.slice(1).every((key) => validDigest(value[key])); }
function validRuntimeContext(value, pipelineId, inputDigests) { return exactKeys(value, RUNTIME_CONTEXT_KEYS) && value.schema === 'pidex-rule-runtime-context-v1' && value.pipeline_id === pipelineId && validRuntimeDigests(value.input_digests) && canonical(value.input_digests) === canonical(inputDigests) && value.resolver_snapshot && typeof value.resolver_snapshot === 'object' && value.passive_exposure_input && typeof value.passive_exposure_input === 'object'; }
const HEAD_KEYS = Object.freeze(['head_kind', 'repository_identity', 'accepted_remote_head', 'baseline_parent_commit', 'manifest_digest', 'tree_digest', 'seeded_at', 'verified_at', 'remote_checked_at', 'freshness']);
function exactKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function validTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function validDigest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function learningVoteDigest(vote) { const hash = createHash('sha256'); for (const field of ['pidex-living-rule-semantic-vote-v1', ...LEARNING_VOTE_FIELDS.slice(1, -1).map((key) => vote[key])]) { hash.update(`${Buffer.byteLength(field, 'utf8')}:`, 'ascii'); hash.update(field, 'utf8'); } return hash.digest('hex'); }
function fullManualVoteDigest(vote) { if (!exactKeys(vote, LEARNING_VOTE_FIELDS) || !LEARNING_VOTE_FIELDS.every((key) => typeof vote[key] === 'string')) return null; const hash = createHash('sha256'); for (const field of ['pidex-manual-refinement-full-vote-v1', ...LEARNING_VOTE_FIELDS.map((key) => vote[key])]) { hash.update(`${Buffer.byteLength(field, 'utf8')}:`, 'ascii'); hash.update(field, 'utf8'); } return hash.digest('hex'); }
function validLearningVoteClaim(vote, candidateDigest, reviewers, generation, claimedAt) {
  if (!exactKeys(vote, LEARNING_VOTE_FIELDS) || vote.schema_version !== 'pidex-living-rule-semantic-vote-v1' || vote.candidate_digest !== candidateDigest || !validDigest(vote.candidate_digest) || !validDigest(vote.candidate_content_hash) || !validDigest(vote.admission_policy_digest) || typeof vote.admission_policy_version !== 'string' || !LEARNING_CLAIM_TEXT.test(vote.admission_policy_version) || !['project', 'global'].includes(vote.tier) || !validDigest(vote.repository_scope_digest) || ![vote.reviewer_principal, vote.backend_identity, vote.provider, vote.model, vote.configuration_generation, vote.attempt_id, vote.nonce].every((value) => typeof value === 'string' && LEARNING_CLAIM_TEXT.test(value)) || vote.configuration_generation !== generation || !validTime(vote.issued_at) || !validTime(vote.expires_at) || vote.decision !== 'accept' || !validTime(claimedAt)) return false;
  const reviewer = reviewers.get(vote.reviewer_principal);
  return reviewer?.backend === vote.backend_identity && reviewer.provider === vote.provider && reviewer.model === vote.model;
}
function claimLearningVotes(db, { candidateDigest, votes, reviewers, generation, claimedAt }) { if (!validDigest(candidateDigest) || !Array.isArray(votes) || !votes.length || !votes.every((vote) => validLearningVoteClaim(vote, candidateDigest, reviewers, generation, claimedAt))) return false; try { db.exec('BEGIN IMMEDIATE'); const insert = db.prepare('INSERT INTO rule_learning_vote_claim (candidate_digest, attempt_id, nonce, reviewer_principal, backend_identity, vote_digest, configuration_generation, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'); for (const vote of votes) insert.run(candidateDigest, vote.attempt_id, vote.nonce, vote.reviewer_principal, vote.backend_identity, learningVoteDigest(vote), generation, claimedAt); db.exec('COMMIT'); return true; } catch { try { db.exec('ROLLBACK'); } catch {} return false; } }
function validSafeText(value) { return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.normalize('NFC') === value && !/[\u0000-\u001f\u007f]|(?:credential|secret|token|password|private|[/\\])/i.test(value); }
function validImpactTargetSelector(value) { return exactKeys(value, IMPACT_TARGET_SELECTOR_KEYS) && ['global', 'project'].includes(value.tier) && (value.tier === 'global' ? value.scope_id === '' : validSafeText(value.scope_id)) && validSafeText(value.rule_id) && validDigest(value.version_hash) && validDigest(value.content_hash) && validSafeText(value.activation_epoch); }
function targetSelectorValues(target) { return [target.tier, target.scope_id, target.rule_id, target.version_hash, target.content_hash, target.activation_epoch]; }
function validImpactEvaluationSelector(value) { return exactKeys(value, IMPACT_EVALUATION_SELECTOR_KEYS) && ['global', 'project'].includes(value.tier) && (value.tier === 'global' ? value.scope_id === '' : validSafeText(value.scope_id)) && validSafeText(value.rule_id) && validDigest(value.version_hash) && validDigest(value.content_hash) && validSafeText(value.activation_epoch) && validSafeText(value.policy_id) && validDigest(value.policy_digest); }
function evaluationSelectorValues(selector) { return IMPACT_EVALUATION_SELECTOR_KEYS.map((key) => selector[key]); }
function validHistoryDescriptor(value) { return exactKeys(value, IMPACT_HISTORY_DESCRIPTOR_KEYS) && /^exposure:[a-f0-9]{64}$/.test(value.exposure_id) && validDigest(value.publication_digest) && CADENCE_INPUT_ID.test(value.input_id) && value.input_id.slice('rule-impact-input:'.length) === value.input_digest && validDigest(value.input_digest) && Number.isSafeInteger(value.target_ordinal) && value.target_ordinal >= 0 && ['global', 'project'].includes(value.tier) && (value.tier === 'global' ? value.scope_id === '' : validSafeText(value.scope_id)) && validTime(value.production_started_at) && validTime(value.captured_at); }
function hashBytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function byteBuffer(value) { return Buffer.isBuffer(value) || value instanceof Uint8Array; }
function readContentAddressedBlob(stateRoot, directoryName, blobDigest) {
  try { const chain = bindInputChain(stateRoot, directoryName); return readImmutableFile(chain, path.join(chain.parents.at(-1).path, `${blobDigest}.json`), blobDigest).bytes; } catch { return null; }
}
function producerBytes(value) { return Buffer.from(JSON.stringify(value), 'utf8'); }
function validProducerFamily(value) { return exactKeys(value, PRODUCER_FAMILY_KEYS) && value.schema === 'rule-impact-family-v1' && PRODUCER_FAMILY_KEYS.slice(1).every((key) => validSafeText(value[key])) && validTime(value.production_started_at) && value.run_family_id.startsWith('run-family:'); }
function validProducerExecution(value) { return exactKeys(value, PRODUCER_EXECUTION_KEYS) && value.schema === 'rule-impact-execution-v1' && PRODUCER_EXECUTION_KEYS.filter((key) => !['schema', 'capability_set'].includes(key)).every((key) => validSafeText(value[key])) && Array.isArray(value.capability_set) && value.capability_set.length > 0 && value.capability_set.every(validSafeText) && [...value.capability_set].sort().every((entry, index) => entry === value.capability_set[index]) && new Set(value.capability_set).size === value.capability_set.length; }
function validProducerTerminal(value, family) { return exactKeys(value, PRODUCER_TERMINAL_KEYS) && value.schema === 'rule-impact-terminal-outcome-v1' && value.run_family_id === family.run_family_id && validSafeText(value.outcome_definition_id) && validSafeText(value.outcome_definition_version) && value.outcome_vector && typeof value.outcome_vector === 'object' && !Array.isArray(value.outcome_vector) && Object.keys(value.outcome_vector).every((key) => validSafeText(key) && Number.isFinite(value.outcome_vector[key])) && validTime(value.outcome_finalized_at); }
function validProducerOpening(value) { return value && typeof value === 'object' && exactKeys(value, ['pipeline_id', 'terminal_outcome_ref', 'family', 'execution', 'impact_contract']) && validSafeText(value.pipeline_id) && validSafeText(value.terminal_outcome_ref) && validProducerFamily(value.family) && validProducerExecution(value.execution) && value.impact_contract && exactKeys(value.impact_contract, ['impact_contract_ref', 'impact_contract_digest', 'impact_contract_bytes', 'raw_pre_outcome_covariates']) && validSafeText(value.impact_contract.impact_contract_ref) && validDigest(value.impact_contract.impact_contract_digest) && byteBuffer(value.impact_contract.impact_contract_bytes) && hashBytes(value.impact_contract.impact_contract_bytes) === value.impact_contract.impact_contract_digest && value.impact_contract.raw_pre_outcome_covariates && typeof value.impact_contract.raw_pre_outcome_covariates === 'object' && !Array.isArray(value.impact_contract.raw_pre_outcome_covariates); }
function producerPublicationPayload(opening, terminal) { const executionBytes = producerBytes(opening.execution); const config_digest = hashBytes(executionBytes); const outcome_source_digest = hashBytes(producerBytes(terminal)); return { schema: 'rule-impact-producer-publication-v1', family: opening.family, execution: opening.execution, config_digest, impact_contract_ref: opening.impact_contract.impact_contract_ref, impact_contract_digest: opening.impact_contract.impact_contract_digest, impact_contract_bytes: Buffer.from(opening.impact_contract.impact_contract_bytes).toString('utf8'), raw_pre_outcome_covariates: opening.impact_contract.raw_pre_outcome_covariates, outcome_source_identity: `rule-impact-outcome:${outcome_source_digest}`, outcome_source_digest, outcome_finalized_at: terminal.outcome_finalized_at, outcome_vector: terminal.outcome_vector }; }
function producerMeasurement(payload, terminal) { const { family, execution, ...publication } = payload; return { schema: 'rule-impact-measurement-v1', run_family_id: family.run_family_id, production_started_at: family.production_started_at, plan_id: family.plan_id, plan_class: family.plan_class, project_scope: family.project_scope, outcome_definition_id: terminal.outcome_definition_id, outcome_definition_version: terminal.outcome_definition_version, model_provider: execution.model_provider, model_identity: execution.model_identity, model_version: execution.model_version, pipeline_version: execution.pipeline_version, config_digest: publication.config_digest, route_topology: execution.route_topology, agent_role: execution.agent_role, agent_version: execution.agent_version, phase: execution.phase, budget_class: execution.budget_class, capability_set: execution.capability_set, workload_risk_fingerprint_class: execution.workload_risk_fingerprint_class, raw_pre_outcome_covariates: publication.raw_pre_outcome_covariates, impact_contract_ref: publication.impact_contract_ref, impact_contract_digest: publication.impact_contract_digest, impact_contract_bytes: publication.impact_contract_bytes, outcome_vector: publication.outcome_vector, outcome_source_identity: publication.outcome_source_identity, outcome_source_digest: publication.outcome_source_digest, outcome_finalized_at: publication.outcome_finalized_at }; }
function validAggregateOpening(value) { return exactKeys(value, IMPACT_AGGREGATE_OPENING_KEYS) && validSafeText(value.opening_id) && validDigest(value.opening_projection_digest) && value.opening_blob_id === `rule-impact-opening-blob:${value.opening_blob_digest}` && validDigest(value.opening_blob_digest); }
function validAggregateContract(value) { return exactKeys(value, IMPACT_AGGREGATE_CONTRACT_KEYS) && validSafeText(value.impact_contract_ref) && validDigest(value.impact_contract_digest); }
function validAggregateText(value) { return typeof value === 'string' && /^[A-Za-z0-9._:/-]{1,512}$/.test(value) && !value.startsWith('/') && !value.includes('//') && value.normalize('NFC') === value; }
function validAggregateFamily(value) { return exactKeys(value, IMPACT_AGGREGATE_FAMILY_KEYS) && ['H2', 'H1', 'W1', 'W2'].includes(value.window_code) && validTime(value.production_started_at) && ['family_id', 'project_scope', 'plan_id', 'run_family_id'].every((key) => validAggregateText(value[key])) && CADENCE_INPUT_ID.test(value.source_measurement_input_id) && value.source_measurement_input_id === `rule-impact-input:${value.source_measurement_input_digest}` && validDigest(value.source_measurement_input_digest) && validDigest(value.family_projection_digest) && Array.isArray(value.event_refs) && value.event_refs.every((ref) => exactKeys(ref, IMPACT_AGGREGATE_EVENT_REF_KEYS) && validSafeText(ref.event_id) && validDigest(ref.event_digest)) && new Set(value.event_refs.map((ref) => ref.event_id)).size === value.event_refs.length; }
function aggregatePayload({ target_opening, impact_contract, families }) { return { schema: 'rule-impact-measurement-input-aggregate-v1', target_opening: { opening_id: target_opening.opening_id, opening_projection_digest: target_opening.opening_projection_digest, opening_blob_id: target_opening.opening_blob_id, opening_blob_digest: target_opening.opening_blob_digest }, impact_contract: { impact_contract_ref: impact_contract.impact_contract_ref, impact_contract_digest: impact_contract.impact_contract_digest }, families: families.map((family) => ({ window_code: family.window_code, production_started_at: family.production_started_at, family_id: family.family_id, project_scope: family.project_scope, plan_id: family.plan_id, run_family_id: family.run_family_id, source_measurement_input_id: family.source_measurement_input_id, source_measurement_input_digest: family.source_measurement_input_digest, family_projection_digest: family.family_projection_digest, event_refs: family.event_refs.map((ref) => ({ event_id: ref.event_id, event_digest: ref.event_digest })) })) }; }
function exactAggregateRequest(left, right) { return canonical(left) === canonical(right); }
function validAggregateReadSet(value) { return value && typeof value === 'object' && exactKeys(value, ['request', 'source_payload_digests', 'opening_blob_digest', 'contract_bytes_digest', 'event_byte_digests', 'family_projection_digests']) && value.request && validImpactTargetSelector(value.request.target) && validTime(value.request.target_t0) && validAggregateOpening(value.request.target_opening) && validAggregateContract(value.request.impact_contract) && Array.isArray(value.request.families) && value.request.families.length && value.request.families.every(validAggregateFamily) && Array.isArray(value.source_payload_digests) && value.source_payload_digests.length === value.request.families.length && value.source_payload_digests.every(validDigest) && validDigest(value.opening_blob_digest) && validDigest(value.contract_bytes_digest) && Array.isArray(value.event_byte_digests) && value.event_byte_digests.every(validDigest) && Array.isArray(value.family_projection_digests) && value.family_projection_digests.length === value.request.families.length && value.family_projection_digests.every(validDigest); }
function sourceReferenceMatches(db, family, target) {
  const row = db.prepare('SELECT history.exposure_id, history.publication_digest, history.input_id, history.input_digest, history.target_ordinal, history.tier, history.scope_id, history.production_started_at, history.captured_at, target.input_id AS indexed_input_id, target.input_digest AS indexed_input_digest, fanout.target_input_ids_json, fanout.target_input_digests_json FROM impact_input_history AS history JOIN impact_target_index AS target ON target.exposure_id = history.exposure_id AND target.publication_digest = history.publication_digest AND target.ordinal = history.target_ordinal JOIN impact_publication_fanout AS fanout ON fanout.exposure_id = history.exposure_id AND fanout.publication_digest = history.publication_digest WHERE history.input_id = ? AND history.input_digest = ? AND history.tier = ? AND history.scope_id = ? AND history.production_started_at = ?').get(family.source_measurement_input_id, family.source_measurement_input_digest, target.tier, target.scope_id, family.production_started_at);
  if (!row || row.indexed_input_id !== family.source_measurement_input_id || row.indexed_input_digest !== family.source_measurement_input_digest) return null;
  try { const ids = JSON.parse(row.target_input_ids_json); const digests = JSON.parse(row.target_input_digests_json); if (!Array.isArray(ids) || !Array.isArray(digests) || ids[row.target_ordinal] !== family.source_measurement_input_id || digests[row.target_ordinal] !== family.source_measurement_input_digest) return null; } catch { return null; }
  return row;
}
function verifyAggregateReferences(db, stateRoot, request, readSet = null) {
  const { target, target_opening, impact_contract, families } = request;
  const opening = db.prepare('SELECT opening_id, opening_projection_digest, opening_blob_id, opening_blob_digest, opening_bytes FROM impact_lifecycle_opening WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ?').get(...targetSelectorValues(target));
  if (!opening || !byteBuffer(opening.opening_bytes) || !exactAggregateRequest({ ...opening, opening_bytes: undefined }, target_opening) || hashBytes(opening.opening_bytes) !== opening.opening_blob_digest || (readSet && opening.opening_blob_digest !== readSet.opening_blob_digest)) return false;
  const openingBlob = readContentAddressedBlob(stateRoot, 'rule-impact-opening', opening.opening_blob_digest); if (!openingBlob || !openingBlob.equals(Buffer.from(opening.opening_bytes))) return false;
  let parsedOpening; try { parsedOpening = JSON.parse(Buffer.from(opening.opening_bytes).toString('utf8')); } catch { return false; }
  if (JSON.stringify(parsedOpening) !== Buffer.from(opening.opening_bytes).toString('utf8')) return false;
  const contract = db.prepare('SELECT impact_contract_digest, impact_contract_bytes FROM impact_contract_authority WHERE impact_contract_ref = ?').get(impact_contract.impact_contract_ref);
  if (!contract || contract.impact_contract_digest !== impact_contract.impact_contract_digest || !byteBuffer(contract.impact_contract_bytes) || hashBytes(contract.impact_contract_bytes) !== contract.impact_contract_digest || (readSet && contract.impact_contract_digest !== readSet.contract_bytes_digest)) return false;
  for (let index = 0; index < families.length; index += 1) {
    const family = families[index]; const source = sourceReferenceMatches(db, family, target); if (!source) return false;
    const sourceBlob = readContentAddressedBlob(stateRoot, 'rule-impact-input', family.source_measurement_input_digest); if (!sourceBlob || hashBytes(sourceBlob) !== family.source_measurement_input_digest || (readSet && readSet.source_payload_digests[index] !== hashBytes(sourceBlob))) return false;
    let payload; try { payload = JSON.parse(sourceBlob.toString('utf8')); } catch { return false; }
    if (JSON.stringify(payload) !== sourceBlob.toString('utf8') || payload?.schema !== 'rule-impact-input-v1' || payload?.measurement?.production_started_at !== family.production_started_at || payload?.exposure_publication?.exposure_id !== source.exposure_id || payload?.exposure_publication?.publication_digest !== source.publication_digest || (readSet && readSet.family_projection_digests[index] !== family.family_projection_digest)) return false;
    for (const ref of family.event_refs) { const event = db.prepare('SELECT event_bytes FROM impact_lifecycle_event WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ? AND event_id = ? AND event_digest = ?').get(...targetSelectorValues(target), ref.event_id, ref.event_digest); if (!event || !byteBuffer(event.event_bytes) || hashBytes(event.event_bytes) !== ref.event_digest) return false; try { if (JSON.stringify(JSON.parse(Buffer.from(event.event_bytes).toString('utf8'))) !== Buffer.from(event.event_bytes).toString('utf8')) return false; } catch { return false; } }
  }
  return true;
}
function validHeadRecord(head, repository) {
  if (!exactKeys(head, HEAD_KEYS) || head.repository_identity !== repository || !validHead(head.baseline_parent_commit) || !validTime(head.verified_at)) return false;
  if (head.head_kind === 'packaged_seed') return head.accepted_remote_head === null && validDigest(head.manifest_digest) && head.tree_digest === null && validTime(head.seeded_at) && head.remote_checked_at === null && head.freshness === 'bootstrap_only';
  return ['accepted_remote', 'current_project'].includes(head.head_kind) && validHead(head.accepted_remote_head) && (head.manifest_digest === null || validDigest(head.manifest_digest)) && validDigest(head.tree_digest) && head.seeded_at === null && validTime(head.remote_checked_at) && head.freshness === 'exact_head';
}
function init(db) {
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;');
  db.exec('BEGIN IMMEDIATE');
  try {
  const v3Required = ['schema_meta', 'repository_enrollment', 'effective_projection', 'runtime_context', 'lifecycle_head', 'lifecycle_event', 'rule_identity', 'rule_version', 'activation_epoch', 'rule_blob', 'local_narrowing', 'migration_degraded'];
  const present = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const schema = present.has('schema_meta') ? db.prepare('SELECT schema FROM schema_meta').all().map((row) => row.schema) : [];
  const versionColumns = present.has('rule_version') ? db.prepare('PRAGMA table_info(rule_version)').all().filter((row) => row.pk).map((row) => row.name) : [];
  const rebuild = present.size && (!v3Required.every((table) => present.has(table)) || schema.length !== 1 || !['rule-lifecycle-db-v3', 'rule-lifecycle-db-v4', 'rule-lifecycle-db-v5', 'rule-lifecycle-db-v6', 'rule-lifecycle-db-v7', 'rule-lifecycle-db-v8'].includes(schema[0]) || versionColumns.join(',') !== 'repository,scope_id,rule_id,rule_version');
  if (rebuild) for (const table of present) db.exec(`DROP TABLE IF EXISTS "${table}"`);
  db.exec(`CREATE TABLE IF NOT EXISTS publication_accepted_receipt (idempotency_key TEXT PRIMARY KEY REFERENCES publication_transaction(idempotency_key), receipt_digest TEXT NOT NULL UNIQUE, receipt_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipt_consumption (receipt_digest TEXT PRIMARY KEY, transaction_digest TEXT NOT NULL UNIQUE, result_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rule_learning_vote_claim (candidate_digest TEXT NOT NULL, attempt_id TEXT NOT NULL, nonce TEXT NOT NULL, reviewer_principal TEXT NOT NULL, backend_identity TEXT NOT NULL, vote_digest TEXT NOT NULL, configuration_generation TEXT NOT NULL, claimed_at TEXT NOT NULL, PRIMARY KEY (candidate_digest, attempt_id, nonce), UNIQUE (reviewer_principal, attempt_id, nonce)); CREATE TABLE IF NOT EXISTS schema_meta (schema TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS repository_enrollment (repository TEXT PRIMARY KEY, scope_id TEXT NOT NULL, remote TEXT NOT NULL, branch TEXT NOT NULL); CREATE TABLE IF NOT EXISTS effective_projection (repository TEXT NOT NULL, scope_id TEXT NOT NULL, accepted_head TEXT NOT NULL, head_json TEXT NOT NULL, entries_json TEXT NOT NULL, PRIMARY KEY (repository, scope_id)); CREATE TABLE IF NOT EXISTS runtime_context (pipeline_id TEXT PRIMARY KEY, input_digests_json TEXT NOT NULL, context_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lifecycle_head (repository TEXT NOT NULL, scope_id TEXT NOT NULL, accepted_head TEXT NOT NULL, head_json TEXT NOT NULL, PRIMARY KEY (repository, scope_id)); CREATE TABLE IF NOT EXISTS lifecycle_event (event_id INTEGER PRIMARY KEY, repository TEXT NOT NULL, scope_id TEXT NOT NULL, accepted_head TEXT NOT NULL, event_kind TEXT NOT NULL, created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rule_identity (repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, PRIMARY KEY (repository, scope_id, rule_id)); CREATE TABLE IF NOT EXISTS rule_version (repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, rule_version TEXT NOT NULL, PRIMARY KEY (repository, scope_id, rule_id, rule_version)); CREATE TABLE IF NOT EXISTS activation_epoch (repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, rule_version TEXT NOT NULL, activation_epoch TEXT NOT NULL, opened_at TEXT NOT NULL, closed_at TEXT, PRIMARY KEY (repository, scope_id, rule_id, rule_version, activation_epoch)); CREATE TABLE IF NOT EXISTS rule_blob (content_hash TEXT PRIMARY KEY, bytes_digest TEXT NOT NULL); CREATE TABLE IF NOT EXISTS local_narrowing (repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, reason_code TEXT NOT NULL, PRIMARY KEY (repository, scope_id, rule_id)); CREATE TABLE IF NOT EXISTS publication_enrollment (repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, enrollment_digest TEXT NOT NULL, allowed_paths_json TEXT NOT NULL, predecessor TEXT NOT NULL, normalized_remote_digest TEXT, branch TEXT, author TEXT, writer_enabled INTEGER, trailer_policy TEXT, repository_identity_digest TEXT, identity_platform TEXT, root_identity_digest TEXT, parent_identity_digest TEXT, files_identity_digest TEXT, identity_proof TEXT, publication_timestamp TEXT, PRIMARY KEY (repository, scope_id, rule_id)); CREATE TABLE IF NOT EXISTS publication_transaction (idempotency_key TEXT PRIMARY KEY, repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, enrollment_digest TEXT NOT NULL, allowed_paths_json TEXT NOT NULL, expected_base TEXT NOT NULL, candidate_digest TEXT NOT NULL, candidate_bytes BLOB NOT NULL, admission_digest TEXT NOT NULL, admission_bytes BLOB NOT NULL, state TEXT NOT NULL CHECK (state IN ('prepared', 'committed_local', 'accepted_remote', 'deferred_remote_advanced', 'rejected_policy', 'abandoned')), local_commit TEXT, local_parent TEXT, local_tree_digest TEXT, staged_member_digests_json TEXT, terminal_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS publication_transaction_event (event_sequence INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN ('prepared', 'committed_local', 'accepted_remote', 'deferred_remote_advanced', 'rejected_policy', 'abandoned')), reason_code TEXT, created_at TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS one_publication_terminal ON publication_transaction_event(idempotency_key) WHERE state IN ('accepted_remote', 'deferred_remote_advanced', 'rejected_policy', 'abandoned'); CREATE TABLE IF NOT EXISTS migration_degraded (singleton INTEGER PRIMARY KEY CHECK (singleton = 1)); CREATE TABLE IF NOT EXISTS impact_publication_fanout (exposure_id TEXT NOT NULL, publication_digest TEXT NOT NULL, fanout_fingerprint TEXT NOT NULL, target_count INTEGER NOT NULL, target_input_ids_json TEXT NOT NULL, target_input_digests_json TEXT NOT NULL, PRIMARY KEY (exposure_id, publication_digest)); CREATE TABLE IF NOT EXISTS impact_target_index (exposure_id TEXT NOT NULL, publication_digest TEXT NOT NULL, ordinal INTEGER NOT NULL, input_id TEXT NOT NULL UNIQUE, input_digest TEXT NOT NULL, PRIMARY KEY (exposure_id, publication_digest, ordinal), FOREIGN KEY (exposure_id, publication_digest) REFERENCES impact_publication_fanout(exposure_id, publication_digest)); CREATE TABLE IF NOT EXISTS impact_storage_attempt (attempt_digest TEXT PRIMARY KEY, schema TEXT NOT NULL, exposure_id TEXT, publication_digest TEXT, reason TEXT NOT NULL, timestamp TEXT NOT NULL); CREATE TABLE IF NOT EXISTS impact_result_index (input_id TEXT PRIMARY KEY, input_digest TEXT NOT NULL, result_id TEXT NOT NULL UNIQUE, result_digest TEXT NOT NULL, tier TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, version_hash TEXT NOT NULL, content_hash TEXT NOT NULL, activation_epoch TEXT NOT NULL, policy_id TEXT NOT NULL, policy_digest TEXT NOT NULL, snapshot_id TEXT NOT NULL, snapshot_digest TEXT NOT NULL, exposure_id TEXT NOT NULL, publication_digest TEXT NOT NULL, created_at TEXT NOT NULL, head_sequence INTEGER NOT NULL UNIQUE); CREATE TABLE IF NOT EXISTS impact_evaluation_index (result_id TEXT PRIMARY KEY, result_identity_digest TEXT NOT NULL UNIQUE, result_digest TEXT NOT NULL UNIQUE, state TEXT NOT NULL, lineage_json TEXT NOT NULL, head_sequence INTEGER NOT NULL UNIQUE); CREATE TABLE IF NOT EXISTS impact_cadence_config (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)), revision INTEGER NOT NULL CHECK (revision >= 0), updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS impact_cadence (due_key TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('attempting', 'blocked', 'collecting', 'evaluated', 'unavailable', 'superseded', 'expired')), lease_owner TEXT, lease_expires_at TEXT, attempt INTEGER NOT NULL CHECK (attempt >= 1), terminal_json TEXT, input_id TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS impact_input_history (history_sequence INTEGER PRIMARY KEY AUTOINCREMENT, exposure_id TEXT NOT NULL, publication_digest TEXT NOT NULL, input_id TEXT NOT NULL UNIQUE, input_digest TEXT NOT NULL, target_ordinal INTEGER NOT NULL, tier TEXT NOT NULL CHECK (tier IN ('global', 'project')), scope_id TEXT NOT NULL, production_started_at TEXT NOT NULL, captured_at TEXT NOT NULL, UNIQUE(exposure_id, publication_digest, target_ordinal), FOREIGN KEY(exposure_id, publication_digest) REFERENCES impact_publication_fanout(exposure_id, publication_digest)); CREATE INDEX IF NOT EXISTS impact_input_history_window ON impact_input_history(tier, scope_id, production_started_at, exposure_id, target_ordinal, input_id); CREATE TABLE IF NOT EXISTS impact_lifecycle_opening (tier TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, version_hash TEXT NOT NULL, content_hash TEXT NOT NULL, activation_epoch TEXT NOT NULL, opening_kind TEXT NOT NULL, opening_id TEXT NOT NULL, opening_digest TEXT NOT NULL, opening_bytes BLOB NOT NULL, opened_at TEXT NOT NULL, accepted_head TEXT NOT NULL, source_head TEXT NOT NULL, mirror_head TEXT NOT NULL, projection_revision TEXT NOT NULL, PRIMARY KEY(tier, scope_id, rule_id, version_hash, content_hash, activation_epoch)); CREATE TABLE IF NOT EXISTS impact_lifecycle_event (event_sequence INTEGER PRIMARY KEY AUTOINCREMENT, tier TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, version_hash TEXT NOT NULL, content_hash TEXT NOT NULL, activation_epoch TEXT NOT NULL, event_class TEXT NOT NULL, event_type TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, event_digest TEXT NOT NULL, event_bytes BLOB NOT NULL, event_at TEXT NOT NULL, effect TEXT NOT NULL); CREATE INDEX IF NOT EXISTS impact_lifecycle_event_window ON impact_lifecycle_event(tier, scope_id, rule_id, version_hash, content_hash, activation_epoch, event_at, event_sequence); CREATE TABLE IF NOT EXISTS impact_cadence_checkpoint (checkpoint_key TEXT PRIMARY KEY, tier TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, version_hash TEXT NOT NULL, content_hash TEXT NOT NULL, activation_epoch TEXT NOT NULL, policy_id TEXT NOT NULL, policy_digest TEXT NOT NULL, opening_id TEXT NOT NULL, opening_digest TEXT NOT NULL, checkpoint_kind TEXT NOT NULL, due_at TEXT NOT NULL, checkpoint_digest TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);`);
  db.exec('CREATE TABLE IF NOT EXISTS rule_learning_adapter_event (event_id TEXT PRIMARY KEY, tier TEXT NOT NULL CHECK (tier IN (\'global\',\'project\')), scope_digest TEXT NOT NULL, event_bytes BLOB NOT NULL, disposition TEXT NOT NULL, occurred_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rule_learning_finding_history (finding_digest TEXT PRIMARY KEY, finding_id TEXT NOT NULL UNIQUE, completed_run_id TEXT NOT NULL UNIQUE, project_scope_id TEXT NOT NULL, repository_identity TEXT NOT NULL, finding_bytes BLOB NOT NULL, eligibility_bytes BLOB NOT NULL, retry_family_id TEXT NOT NULL UNIQUE, evaluator_host_id TEXT NOT NULL, enrollment_digest TEXT NOT NULL, recorded_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS rule_learning_finding_history_scope ON rule_learning_finding_history(project_scope_id, repository_identity, finding_digest); CREATE TABLE IF NOT EXISTS rule_learning_work_intent (work_id TEXT PRIMARY KEY, tier TEXT NOT NULL CHECK (tier IN (\'global\',\'project\')), scope_id TEXT NOT NULL, stage TEXT NOT NULL CHECK (stage IN (\'generator\',\'project_reviewer\',\'global_reviewer\')), source_generation TEXT NOT NULL, configuration_generation TEXT NOT NULL, input_digest TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN (\'intent\',\'dispatched\',\'completed\')), created_at TEXT NOT NULL, dispatched_at TEXT); CREATE TABLE IF NOT EXISTS rule_learning_work_result (work_id TEXT PRIMARY KEY REFERENCES rule_learning_work_intent(work_id), result_digest TEXT NOT NULL UNIQUE, result_bytes BLOB NOT NULL, recorded_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rule_learning_candidate_result (candidate_digest TEXT PRIMARY KEY, tier TEXT NOT NULL CHECK (tier IN (\'global\',\'project\')), scope_id TEXT NOT NULL, candidate_bytes BLOB NOT NULL, recorded_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rule_learning_admission_result (candidate_digest TEXT PRIMARY KEY REFERENCES rule_learning_candidate_result(candidate_digest), admission_digest TEXT NOT NULL UNIQUE, admission_bytes BLOB NOT NULL, recorded_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS automatic_learning_profile (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), profile_digest TEXT NOT NULL UNIQUE, profile_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS automatic_learning_disposition (disposition_id TEXT PRIMARY KEY, status TEXT NOT NULL, occurred_at TEXT NOT NULL);');
  db.exec('CREATE TABLE IF NOT EXISTS publication_handoff_head_proof (receipt_digest TEXT NOT NULL, transaction_digest TEXT NOT NULL, containing_head TEXT NOT NULL, proof_digest TEXT NOT NULL, proof_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (receipt_digest, transaction_digest, containing_head), UNIQUE (receipt_digest, transaction_digest, proof_digest)); CREATE TABLE IF NOT EXISTS publication_handoff_stage_event (event_sequence INTEGER PRIMARY KEY AUTOINCREMENT, receipt_digest TEXT NOT NULL, transaction_digest TEXT NOT NULL, stage TEXT NOT NULL CHECK (stage IN (\'receipt_accepted\', \'receipt_consumed\', \'bundle_verified\', \'mirror_verified\', \'projection_applied\', \'reattested\', \'status_ready\')), payload_digest TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(receipt_digest, transaction_digest, stage)); CREATE TABLE IF NOT EXISTS publication_handoff_stage_current (receipt_digest TEXT NOT NULL, transaction_digest TEXT NOT NULL, stage TEXT NOT NULL CHECK (stage IN (\'receipt_accepted\', \'receipt_consumed\', \'bundle_verified\', \'mirror_verified\', \'projection_applied\', \'reattested\', \'status_ready\')), payload_digest TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (receipt_digest, transaction_digest)); CREATE TABLE IF NOT EXISTS manual_refinement_request (request_id TEXT PRIMARY KEY, request_digest TEXT NOT NULL UNIQUE, request_nonce TEXT NOT NULL, request_capability_digest TEXT, repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, tier TEXT NOT NULL CHECK (tier IN (\'global\', \'project\')), rule_path TEXT NOT NULL, path_digest TEXT NOT NULL, containing_head TEXT NOT NULL, predecessor_commit TEXT NOT NULL, accepted_commit TEXT NOT NULL, content_hash TEXT NOT NULL, activation_epoch TEXT NOT NULL, transaction_digest TEXT NOT NULL, receipt_digest TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN (\'open\', \'claimed\', \'imported\', \'admitted\', \'rejected\')), expires_at TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(repository, scope_id, rule_id, request_nonce)); CREATE TABLE IF NOT EXISTS manual_refinement_request_event (event_sequence INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL REFERENCES manual_refinement_request(request_id), status TEXT NOT NULL CHECK (status IN (\'open\', \'claimed\', \'imported\', \'admitted\', \'rejected\')), created_at TEXT NOT NULL, UNIQUE(request_id, status));');
  db.exec('CREATE TABLE IF NOT EXISTS manual_refinement_admission_intent (request_id TEXT NOT NULL, intake_digest TEXT NOT NULL, intent_digest TEXT NOT NULL UNIQUE, intent_bytes BLOB NOT NULL, candidate_digest TEXT NOT NULL, semantic_context_digest TEXT NOT NULL, vote_digests_json TEXT NOT NULL, configuration_generation TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(request_id, intake_digest)); CREATE TABLE IF NOT EXISTS manual_refinement_admission_result (request_id TEXT NOT NULL, intake_digest TEXT NOT NULL, intent_digest TEXT NOT NULL, admission_digest TEXT NOT NULL UNIQUE, admission_bytes BLOB NOT NULL, transaction_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY(request_id, intake_digest)); CREATE TABLE IF NOT EXISTS lifecycle_action_intent (correlation_id TEXT PRIMARY KEY, cadence_digest TEXT NOT NULL UNIQUE, intent_digest TEXT NOT NULL UNIQUE, result_digest TEXT NOT NULL, request_json TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN (\'no_op\',\'intent\')), reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lifecycle_action_transaction (idempotency_key TEXT PRIMARY KEY, repository TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, enrollment_digest TEXT NOT NULL, allowed_paths_json TEXT NOT NULL, expected_base TEXT NOT NULL, cadence_digest TEXT NOT NULL UNIQUE, action_json TEXT NOT NULL, rule_bytes BLOB NOT NULL, content_hash TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN (\'prepared\', \'committed_local\', \'accepted_remote\', \'deferred_remote_advanced\')), local_commit TEXT, local_parent TEXT, local_tree_digest TEXT, staged_member_digests_json TEXT, terminal_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lifecycle_action_transaction_event (event_sequence INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL, state TEXT NOT NULL CHECK (state IN (\'prepared\', \'committed_local\', \'accepted_remote\', \'deferred_remote_advanced\')), reason_code TEXT, created_at TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS one_lifecycle_action_terminal ON lifecycle_action_transaction_event(idempotency_key) WHERE state IN (\'accepted_remote\', \'deferred_remote_advanced\'); CREATE TABLE IF NOT EXISTS lifecycle_action_accepted_receipt (idempotency_key TEXT PRIMARY KEY REFERENCES lifecycle_action_transaction(idempotency_key), receipt_digest TEXT NOT NULL UNIQUE, receipt_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lifecycle_action_handoff_head_proof (receipt_digest TEXT NOT NULL, transaction_digest TEXT NOT NULL, containing_head TEXT NOT NULL, proof_digest TEXT NOT NULL, proof_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (receipt_digest, transaction_digest, containing_head), UNIQUE (receipt_digest, transaction_digest, proof_digest)); CREATE TABLE IF NOT EXISTS lifecycle_action_handoff_stage (receipt_digest TEXT NOT NULL, transaction_digest TEXT NOT NULL, stage TEXT NOT NULL CHECK (stage IN (\'receipt_accepted\', \'mirror_verified\', \'projection_applied\', \'status_ready\')), payload_digest TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (receipt_digest, transaction_digest));');
  const manualColumns = new Set(db.prepare('PRAGMA table_info(manual_refinement_request)').all().map((column) => column.name));
  for (const column of ['request_capability_digest', 'source_digest', 'candidate_digest', 'candidate_bytes_digest', 'candidate_bytes', 'intake_digest', 'enrollment_digest', 'allowed_paths_digest', 'allowed_paths_json', 'stage_payload_digest']) if (!manualColumns.has(column)) db.exec(`ALTER TABLE manual_refinement_request ADD COLUMN ${column} ${column === 'candidate_bytes' ? 'BLOB' : 'TEXT'}`);
  const manualAdmissionColumns = new Set(db.prepare('PRAGMA table_info(manual_refinement_admission_result)').all().map((column) => column.name));
  if (!manualAdmissionColumns.has('transaction_id')) db.exec('ALTER TABLE manual_refinement_admission_result ADD COLUMN transaction_id TEXT');
  // Additive publication predecessor binds enrollment to exact expected base.
  const publicationEnrollmentColumns = new Set(db.prepare('PRAGMA table_info(publication_enrollment)').all().map((column) => column.name));
  if (!publicationEnrollmentColumns.has('predecessor')) db.exec("ALTER TABLE publication_enrollment ADD COLUMN predecessor TEXT");
  // Legacy enrollment rows lack exact authority. Keep nullable/ineligible; never infer defaults.
  for (const column of ['normalized_remote_digest', 'branch', 'author', 'writer_enabled', 'trailer_policy', 'repository_identity_digest', 'identity_platform', 'root_identity_digest', 'parent_identity_digest', 'files_identity_digest', 'identity_proof', 'publication_timestamp']) if (!publicationEnrollmentColumns.has(column)) db.exec(`ALTER TABLE publication_enrollment ADD COLUMN ${column} ${column === 'writer_enabled' ? 'INTEGER' : 'TEXT'}`);
  // Additive v2 selector columns make only parser-validated evaluator rows prior authority.
  const evaluationColumns = new Set(db.prepare('PRAGMA table_info(impact_evaluation_index)').all().map((column) => column.name));
  for (const column of IMPACT_EVALUATION_SELECTOR_KEYS) if (!evaluationColumns.has(column)) db.exec(`ALTER TABLE impact_evaluation_index ADD COLUMN ${column} TEXT`);
  db.exec('CREATE INDEX IF NOT EXISTS impact_evaluation_prior_authority ON impact_evaluation_index(tier, scope_id, rule_id, version_hash, content_hash, activation_epoch, policy_id, policy_digest, head_sequence DESC, result_id ASC); CREATE TABLE IF NOT EXISTS impact_evaluation_replacement (prior_result_id TEXT PRIMARY KEY, next_result_id TEXT NOT NULL UNIQUE, linked_at TEXT NOT NULL, FOREIGN KEY(prior_result_id) REFERENCES impact_evaluation_index(result_id), FOREIGN KEY(next_result_id) REFERENCES impact_evaluation_index(result_id)); CREATE TABLE IF NOT EXISTS impact_evaluation_terminal (prior_result_id TEXT PRIMARY KEY, terminal_result_id TEXT NOT NULL UNIQUE, terminal_result_digest TEXT NOT NULL UNIQUE, state TEXT NOT NULL, reason TEXT NOT NULL, head_sequence INTEGER NOT NULL UNIQUE, claimed_at TEXT NOT NULL, tier TEXT NOT NULL, scope_id TEXT NOT NULL, rule_id TEXT NOT NULL, version_hash TEXT NOT NULL, content_hash TEXT NOT NULL, activation_epoch TEXT NOT NULL, policy_id TEXT NOT NULL, policy_digest TEXT NOT NULL, FOREIGN KEY(prior_result_id) REFERENCES impact_evaluation_index(result_id), FOREIGN KEY(terminal_result_id) REFERENCES impact_evaluation_index(result_id));');
  // Additive v2 opening fields distinguish EI projection digest from full immutable blob digest.
  const openingColumns = new Set(db.prepare('PRAGMA table_info(impact_lifecycle_opening)').all().map((column) => column.name));
  if (!openingColumns.has('opening_projection_digest')) db.exec('ALTER TABLE impact_lifecycle_opening ADD COLUMN opening_projection_digest TEXT');
  if (!openingColumns.has('opening_blob_id')) db.exec('ALTER TABLE impact_lifecycle_opening ADD COLUMN opening_blob_id TEXT');
  if (!openingColumns.has('opening_blob_digest')) db.exec('ALTER TABLE impact_lifecycle_opening ADD COLUMN opening_blob_digest TEXT');
  db.exec('CREATE TABLE IF NOT EXISTS impact_contract_authority (impact_contract_ref TEXT PRIMARY KEY, impact_contract_digest TEXT NOT NULL UNIQUE, impact_contract_bytes BLOB NOT NULL); CREATE TABLE IF NOT EXISTS impact_input_aggregate (measurement_input_id TEXT PRIMARY KEY, measurement_input_digest TEXT NOT NULL UNIQUE, opening_id TEXT NOT NULL, opening_projection_digest TEXT NOT NULL, impact_contract_ref TEXT NOT NULL, impact_contract_digest TEXT NOT NULL, family_count INTEGER NOT NULL, aggregate_blob_digest TEXT NOT NULL UNIQUE, aggregate_bytes BLOB NOT NULL); CREATE TABLE IF NOT EXISTS impact_input_aggregate_claim (opening_id TEXT NOT NULL, opening_projection_digest TEXT NOT NULL, impact_contract_ref TEXT NOT NULL, impact_contract_digest TEXT NOT NULL, target_t0 TEXT NOT NULL, measurement_input_id TEXT NOT NULL UNIQUE, measurement_input_digest TEXT NOT NULL, PRIMARY KEY (opening_id, opening_projection_digest, impact_contract_ref, impact_contract_digest, target_t0), FOREIGN KEY (measurement_input_id) REFERENCES impact_input_aggregate(measurement_input_id)); CREATE TABLE IF NOT EXISTS impact_producer_publication (pipeline_id TEXT NOT NULL, terminal_outcome_ref TEXT NOT NULL, producer_publication_digest TEXT NOT NULL UNIQUE, publication_bytes BLOB NOT NULL, family_digest TEXT NOT NULL, execution_digest TEXT NOT NULL, impact_contract_digest TEXT NOT NULL, outcome_source_digest TEXT NOT NULL, PRIMARY KEY (pipeline_id, terminal_outcome_ref));');
  const cadenceColumns = new Set(db.prepare('PRAGMA table_info(impact_cadence)').all().map((column) => column.name));
  if (cadenceColumns.has('row_json')) {
    db.exec('ALTER TABLE impact_cadence RENAME TO impact_cadence_legacy');
    db.exec("CREATE TABLE impact_cadence (due_key TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('attempting', 'blocked', 'collecting', 'evaluated', 'unavailable', 'superseded', 'expired')), lease_owner TEXT, lease_expires_at TEXT, attempt INTEGER NOT NULL CHECK (attempt >= 1), terminal_json TEXT, input_id TEXT NOT NULL, updated_at TEXT NOT NULL)");
    for (const legacy of db.prepare('SELECT due_key, status, row_json FROM impact_cadence_legacy').all()) {
      let row; try { row = JSON.parse(legacy.row_json); } catch { row = {}; }
      const terminal = CADENCE_TERMINAL_STATUSES.has(row?.status) ? row : { status: 'expired', due_key: legacy.due_key };
      const inputId = CADENCE_INPUT_ID.test(row?.input_id) ? row.input_id : `rule-impact-input:${'0'.repeat(64)}`;
      db.prepare('INSERT INTO impact_cadence (due_key, status, lease_owner, lease_expires_at, attempt, terminal_json, input_id, updated_at) VALUES (?, ?, NULL, NULL, 1, ?, ?, ?)').run(legacy.due_key, terminal.status, canonical(terminal), inputId, CADENCE_CONFIG_UPDATED_AT);
    }
    db.exec('DROP TABLE impact_cadence_legacy');
  }
  db.prepare('INSERT OR IGNORE INTO impact_cadence_config (singleton, enabled, revision, updated_at) VALUES (1, 1, 0, ?)').run(CADENCE_CONFIG_UPDATED_AT);
  // Legacy narrowing may not assert scope/tier, canonical source, or closed reason authority. Remove rather than infer.
  let invalidLegacyStop = false;
  for (const row of db.prepare('SELECT repository, scope_id, rule_id, reason_code FROM local_narrowing').all()) {
    const enrolled = db.prepare('SELECT 1 FROM repository_enrollment WHERE repository = ? AND scope_id = ?').get(row.repository, row.scope_id);
    const canonicalRule = db.prepare('SELECT 1 FROM rule_identity WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(row.repository, row.scope_id, row.rule_id);
    if (!validLocalStopIdentity(row.scope_id, row.rule_id) || !LOCAL_STOP_REASONS.has(row.reason_code) || !enrolled || !canonicalRule) { db.prepare('DELETE FROM local_narrowing WHERE repository = ? AND scope_id = ? AND rule_id = ?').run(row.repository, row.scope_id, row.rule_id); invalidLegacyStop = true; }
  }
  if (invalidLegacyStop) db.prepare('INSERT OR IGNORE INTO migration_degraded (singleton) VALUES (1)').run();
  if (['rule-lifecycle-db-v3', 'rule-lifecycle-db-v4', 'rule-lifecycle-db-v5', 'rule-lifecycle-db-v6', 'rule-lifecycle-db-v7'].includes(schema[0])) db.prepare('UPDATE schema_meta SET schema = ?').run('rule-lifecycle-db-v8');
  else db.prepare('INSERT OR IGNORE INTO schema_meta (schema) VALUES (?)').run('rule-lifecycle-db-v8');
  if (rebuild) db.prepare('INSERT OR IGNORE INTO migration_degraded (singleton) VALUES (1)').run();
  db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function baselineHead(repository, accepted_head, manifest_digest, authority) {
  if (authority.kind === 'git_head') return { head_kind: 'current_project', repository_identity: repository, accepted_remote_head: accepted_head, baseline_parent_commit: accepted_head, manifest_digest: null, tree_digest: authority.tree_digest, seeded_at: null, verified_at: '2026-08-11T00:00:00.000Z', remote_checked_at: '2026-08-11T00:00:00.000Z', freshness: 'exact_head' };
  return { head_kind: 'packaged_seed', repository_identity: repository, accepted_remote_head: null, baseline_parent_commit: accepted_head, manifest_digest, tree_digest: null, seeded_at: '2026-08-11T00:00:00.000Z', verified_at: '2026-08-11T00:00:00.000Z', remote_checked_at: null, freshness: 'bootstrap_only' };
}
function baselineSource(entry) { return entry.source_kind === 'managed_global' ? 'managed_global' : entry.source_kind === 'managed_project' ? 'managed_project' : entry.source_kind === 'legacy_project' ? 'legacy_project' : entry.source_kind === 'legacy_module' || entry.source_kind === 'module' ? 'module' : 'protected_global'; }
export function lifecycleRulePhase(agent) {
  const phases = Object.freeze({ 'pidex-planner': 'planning', 'pidex-critic': 'critic-review', 'pidex-implementer': 'implementation', 'pidex-code-reviewer': 'code-review', 'pidex-security': 'security', 'pidex-qa': 'qa', 'pidex-uat': 'uat', 'pidex-devops': 'devops' });
  return phases[agent] || String(agent || '').replace(/^pidex-/, '');
}
function baselineCandidates(entries) {
  if (!entries.length || entries.some((entry) => !entry.source_authority?.verified || !/^[a-f0-9]{40}$/.test(entry.source_authority.head))) throw new Error('RULE_INVENTORY_BOOTSTRAP_UNAVAILABLE');
  const authorities = [...new Map(entries.map((entry) => [JSON.stringify(entry.source_authority), entry.source_authority])).values()];
  if (authorities.length !== 1) throw new Error('RULE_INVENTORY_BOOTSTRAP_UNAVAILABLE');
  const authority = authorities[0]; const accepted_head = authority.head;
  const manifest_digest = digest(entries.map((entry) => ({ rule_id: entry.rule_id, source: entry.source, source_authority: entry.source_authority })));
  return { accepted_head, manifest_digest, authority, entries: entries.map((entry) => ({ rule_id: entry.rule_id, rule_version: entry.version_hash, content_hash: entry.version_hash, accepted_commit: accepted_head, bytes: entry.bytes, tier: entry.descriptor.tier, scope_id: entry.descriptor.scope_id, protection_class: entry.descriptor.protection_class, source: baselineSource(entry), lifecycle_state: entry.descriptor.lifecycle_state, created_at: '2026-08-11T00:00:00.000Z', source_head: accepted_head, mirror_head: accepted_head, mirror_digest: entry.version_hash, source_authority: entry.source_authority, agent: entry.agent || entry.descriptor.agent, applicability: entry.applicability || entry.descriptor.applicability, phases: entry.phases || [], overrides_rule_id: entry.descriptor.overrides_rule_id, project_override_policy: entry.descriptor.project_override_policy, passive_rule_id: entry.descriptor.legacy_aliases.find((ruleId) => ruleId.startsWith('rule:')) || entry.rule_id })) };
}

/** Reconciles closed canonical inventory into first-use store baselines; existing accepted projections win. */
export function bootstrapRuleInventoryProjections({ store, stateRoot, root, projectRoot = root, projectScopeId, repositories, gitTrackedPaths } = {}) {
  if (!store || typeof store.ensureBaselineProjection !== 'function' || typeof stateRoot !== 'string' || !repositories?.global || !repositories?.project || typeof projectScopeId !== 'string' || !/^[a-f0-9]{24,64}$/.test(projectScopeId)) throw new Error('RULE_INVENTORY_BOOTSTRAP_INVALID');
  const inventory = reconcileRuleInventory({ root, projectRoot, projectScopeId, gitTrackedPaths, immutableAuthority: true });
  if (!inventory.complete || inventory.entries.some((entry) => typeof entry.bytes !== 'string' || !entry.descriptor)) throw new Error('RULE_INVENTORY_BOOTSTRAP_UNAVAILABLE');
  const groups = [
    { repository: repositories.global, scope_id: null, entries: inventory.entries.filter((entry) => entry.descriptor.scope_id === null) },
    { repository: repositories.project, scope_id: projectScopeId, entries: inventory.entries.filter((entry) => entry.descriptor.scope_id === projectScopeId) },
  ];
  let created = 0; const authority_descriptors = [];
  for (const group of groups) {
    if (!group.entries.length) continue;
    const candidate = baselineCandidates(group.entries);
    const result = store.ensureBaselineProjection({ repository: group.repository, scope_id: group.scope_id, accepted_head: candidate.accepted_head, head: baselineHead(group.repository, candidate.accepted_head, candidate.manifest_digest, candidate.authority), entries: candidate.entries });
    authority_descriptors.push(freeze({ repository: group.repository, scope_id: group.scope_id, accepted_head: result.projection.accepted_head, head: result.projection.head, entries: result.projection.entries }));
    if (group.entries.length) materializeVerifiedMirror({ stateRoot, repository: group.repository, scope_id: group.scope_id, accepted_head: candidate.accepted_head, members: candidate.entries.map((entry, index) => ({ rule_id: entry.rule_id, path: `${group.entries.find((source) => source.rule_id === entry.rule_id)?.source?.replace(/\.md$/, '')}-${index}.md`, content_hash: entry.content_hash, bytes: Buffer.from(entry.bytes) })) });
    if (result.created) created += 1;
  }
  return freeze({ status: created ? 'bootstrapped' : 'idempotent', inventory_digest: inventory.inventory_digest, authority_descriptors: freeze(authority_descriptors) });
}
const DASHBOARD_RULE_ID = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/;
const DASHBOARD_EPOCH = /^epoch:[a-zA-Z0-9._-]{1,64}$/;
const DASHBOARD_PROTECTION = new Set(['none', 'legacy_baseline', 'unknown']);
const DASHBOARD_LIFECYCLE_STATE = new Set(['active', 'deactivated']);
const DASHBOARD_UNAVAILABLE = Object.freeze({ status: 'unavailable', reason_code: 'rule_lifecycle_projection_unavailable', rules: Object.freeze([]) });
const DASHBOARD_DEGRADED = Object.freeze({ status: 'degraded', reason_code: 'rule_lifecycle_projection_degraded', rules: Object.freeze([]) });
const DASHBOARD_IMPACT_UNAVAILABLE = Object.freeze({ status: 'unavailable', reason_code: 'evidence-unavailable', tiers: Object.freeze({ global: Object.freeze([]), project: Object.freeze([]) }) });
const DASHBOARD_IMPACT_STATES = new Set(['collecting', 'frozen', 'inconclusive', 'repeated_observational_harm', 'blocked', 'superseded', 'expired', 'evaluated']);
const DASHBOARD_IMPACT_REASONS = new Set(['measurement_schema_invalid', 'family_identity_missing', 'fingerprint_missing', 'workload_class_missing', 'impact_contract_unavailable', 'impact_contract_invalid', 'outcome_source_unavailable', 'outcome_invalid', 'outcome_not_final', 'epoch_history_unavailable', 'authority_drift', 'evaluation_pending', 'policy_changed', 'target_version_changed', 'target_epoch_changed', 'result_replaced', 'policy_expired', 'result_expired']);
function dashboardImpactPolicy(tier, policy) { return tier === 'global' && policy === 'passive-impact-v1' ? 'Passive impact' : tier === 'project' && policy === 'project-passive-impact-v1' ? 'Project passive impact' : null; }
const DASHBOARD_COHORT_WINDOWS = Object.freeze([['H2', -60, -30], ['H1', -30, 0], ['W1', 0, 30], ['W2', 30, 60]]);
const DASHBOARD_COHORT_DAY_MS = 86_400_000;
const DASHBOARD_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function dashboardCohortWindows(artifact) {
  const t0 = artifact?.gate_operands?.timing?.t0;
  if (typeof t0 !== 'string' || !DASHBOARD_TIMESTAMP.test(t0)) return null;
  const t0ms = Date.parse(t0);
  if (!Number.isSafeInteger(t0ms) || new Date(t0ms).toISOString() !== t0) return null;
  const windows = {};
  for (const [id, startDays, endDays] of DASHBOARD_COHORT_WINDOWS) {
    const startOffset = startDays * DASHBOARD_COHORT_DAY_MS;
    const endOffset = endDays * DASHBOARD_COHORT_DAY_MS;
    const start = t0ms + startOffset;
    const end = t0ms + endOffset;
    if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end) return null;
    const startAt = new Date(start).toISOString();
    const endAt = new Date(end).toISOString();
    if (!DASHBOARD_TIMESTAMP.test(startAt) || !DASHBOARD_TIMESTAMP.test(endAt)) return null;
    windows[id] = Object.freeze({ start_at: startAt, end_at: endAt });
  }
  return Object.freeze(windows);
}
function dashboardImpactRow(artifact, policy) {
  const safePolicy = dashboardImpactPolicy(artifact.tier, policy);
  if (!safePolicy || !DASHBOARD_IMPACT_STATES.has(artifact.state) || !validSafeText(artifact.reason) || !validTime(artifact.created_at) || (artifact.expires_at !== null && !validTime(artifact.expires_at))) return null;
  const metric = (value) => value === null ? null : Number(value.decimal);
  const rate = (value) => ({ numerator: value.numerator, denominator: value.denominator, value: metric(value.value) });
  const windows = dashboardCohortWindows(artifact);
  const cohorts = Object.fromEntries(artifact.cohorts.map((cohort) => [cohort.cohort_id, Object.freeze({ ...(windows?.[cohort.cohort_id] || {}), count: cohort.count, ess: metric(cohort.ess), plan_count: cohort.plan_count, diversity_kind: cohort.diversity_kind, diversity_count: cohort.diversity_count, support_ratio: rate(cohort.support_ratio), missing_rate: rate(cohort.missing_rate), evidence_exclusion_rate: rate(cohort.evidence_exclusion_rate), exclusions: Object.freeze(cohort.exclusions.map(({ reason, count }) => Object.freeze({ reason, count }))) })]));
  const floors = Object.fromEntries(Object.entries(artifact.metrics).map(([key, value]) => [key, metric(value)]));
  const progress = artifact.collection_progress && Object.freeze({ observed_at: artifact.collection_progress.observed_at, H2: artifact.collection_progress.h2_source_count, H1: artifact.collection_progress.h1_source_count, W1: artifact.collection_progress.w1_source_count, W2: artifact.collection_progress.w2_source_count });
  return Object.freeze({ tier: artifact.tier, rule_label: 'Measured rule', policy: safePolicy, state: artifact.state, reason: artifact.reason, created_at: artifact.created_at, expires_at: artifact.expires_at, closed_window_id: artifact.closed_window_id, collection_progress: progress, cohorts: Object.freeze(cohorts), floors: Object.freeze(floors), quality_flags: Object.freeze([...artifact.quality_flags]) });
}
function dashboardEvaluationSelector(row) {
  const selector = { tier: row.tier, scope_id: row.scope_id, rule_id: row.rule_id, version_hash: row.version_hash, content_hash: row.content_hash, activation_epoch: row.activation_epoch, policy_id: row.policy_id, policy_digest: row.policy_digest };
  return validImpactEvaluationSelector(selector) ? selector : null;
}
function verifiedDashboardEvaluation(stateRoot, row, selector) {
  if (!selector || !Number.isSafeInteger(row.head_sequence) || row.head_sequence < 1 || !validDigest(row.result_digest) || !validDigest(row.result_identity_digest) || typeof row.result_id !== 'string') return null;
  const bytes = readContentAddressedBlob(stateRoot, 'rule-impact-result', row.result_digest); let parsed;
  try { parsed = bytes && parseImpactEvaluationBytes(bytes); } catch { return null; }
  if (!parsed || parsed.result_id !== row.result_id || parsed.result_identity_digest !== row.result_identity_digest || parsed.result_digest !== row.result_digest || parsed.artifact.state !== row.state || JSON.stringify(parsed.artifact.lineage) !== row.lineage_json) return null;
  const artifactSelector = { tier: parsed.artifact.tier, scope_id: parsed.artifact.lineage.scope_id || '', rule_id: parsed.artifact.lineage.rule_id, version_hash: parsed.artifact.lineage.rule_version_hash, content_hash: parsed.artifact.lineage.rule_content_hash, activation_epoch: parsed.artifact.lineage.activation_epoch, policy_id: parsed.artifact.lineage.policy_id, policy_digest: parsed.artifact.lineage.policy_digest };
  if (!validImpactEvaluationSelector(artifactSelector) || canonical(artifactSelector) !== canonical(selector)) return null;
  return dashboardImpactRow(parsed.artifact, selector.policy_id);
}
function dashboardTerminalSelector(relation) {
  const selector = { tier: relation?.tier, scope_id: relation?.scope_id, rule_id: relation?.rule_id, version_hash: relation?.version_hash, content_hash: relation?.content_hash, activation_epoch: relation?.activation_epoch, policy_id: relation?.policy_id, policy_digest: relation?.policy_digest };
  return validImpactEvaluationSelector(selector) ? selector : null;
}
function verifiedDashboardTerminal(stateRoot, terminalRow, relation, priorRow, replacement, successorRow) {
  const selector = dashboardTerminalSelector(relation);
  const terminalSelectorIsNull = terminalRow && IMPACT_EVALUATION_SELECTOR_KEYS.every((key) => terminalRow[key] === null);
  if (!selector || !terminalRow || !priorRow || !terminalSelectorIsNull || !Number.isSafeInteger(relation.head_sequence) || relation.head_sequence < 1 || relation.head_sequence !== terminalRow.head_sequence || relation.terminal_result_id !== terminalRow.result_id || relation.terminal_result_digest !== terminalRow.result_digest || relation.state !== terminalRow.state || !['superseded', 'expired'].includes(relation.state) || !DASHBOARD_IMPACT_REASONS.has(relation.reason)) return null;
  const bytes = readContentAddressedBlob(stateRoot, 'rule-impact-result', terminalRow.result_digest); let parsed;
  try { parsed = bytes && parseImpactEvaluationBytes(bytes); } catch { return null; }
  if (!parsed || parsed.result_id !== terminalRow.result_id || parsed.result_identity_digest !== terminalRow.result_identity_digest || parsed.result_digest !== terminalRow.result_digest || parsed.artifact.state !== relation.state || parsed.artifact.reason !== relation.reason || JSON.stringify(parsed.artifact.lineage) !== terminalRow.lineage_json || !parsed.artifact.prior_result || parsed.artifact.prior_result.prior_result_id !== priorRow.result_id || parsed.artifact.prior_result.prior_result_digest !== priorRow.result_digest || parsed.artifact.prior_result.state_reason !== relation.reason || parsed.artifact.prior_result.state_at !== relation.claimed_at) return null;
  const verifiedPrior = verifiedDashboardEvaluation(stateRoot, priorRow, selector);
  if (!verifiedPrior) return null;
  if (relation.reason === 'result_replaced') {
    if (!replacement || replacement.prior_result_id !== priorRow.result_id || replacement.linked_at !== relation.claimed_at || !successorRow || !verifiedDashboardEvaluation(stateRoot, successorRow, selector)) return null;
  } else if (replacement) return null;
  const terminal = dashboardImpactRow(parsed.artifact, selector.policy_id);
  return terminal && Object.freeze({ ...terminal, cohorts: verifiedPrior.cohorts });
}
function dashboardHeadStatus(head, acceptedHead) {
  if (!validHeadRecord(head, head.repository_identity) || acceptedHead !== (head.head_kind === 'accepted_remote' ? head.accepted_remote_head : head.baseline_parent_commit)) return null;
  if (head.head_kind === 'packaged_seed' && head.freshness === 'bootstrap_only') return { status: 'degraded', reason_code: 'rule_lifecycle_bootstrap_only' };
  if (['accepted_remote', 'current_project'].includes(head.head_kind) && head.freshness === 'exact_head') return { status: 'verified', reason_code: null };
  return null;
}

/** Reads safe dashboard provenance from lifecycle projection only; never opens writer authority. */
export function readDashboardRuleProvenance({ stateRoot } = {}) {
  const file = lifecyclePath(stateRoot);
  if (!existsSync(file)) return DASHBOARD_UNAVAILABLE;
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const rows = db.prepare('SELECT accepted_head, head_json, entries_json FROM effective_projection ORDER BY repository, scope_id').all();
    const rules = []; let status = 'verified'; let reason_code = null;
    for (const row of rows) {
      const head = JSON.parse(row.head_json); const entries = JSON.parse(row.entries_json);
      const headStatus = dashboardHeadStatus(head, row.accepted_head);
      if (!validHead(row.accepted_head) || !validEntries(entries) || !headStatus) return DASHBOARD_DEGRADED;
      if (headStatus.status === 'degraded') { status = 'degraded'; reason_code ||= headStatus.reason_code; }
      for (const entry of entries) {
        const requiresEpoch = entry.lifecycle_state === 'active';
        if (!DASHBOARD_RULE_ID.test(entry.rule_id) || (requiresEpoch && !DASHBOARD_EPOCH.test(entry.activation_epoch)) || (!requiresEpoch && entry.activation_epoch !== undefined) || !['global', 'project'].includes(entry.tier) || !DASHBOARD_PROTECTION.has(entry.protection_class || 'unknown') || !DASHBOARD_LIFECYCLE_STATE.has(entry.lifecycle_state)) return DASHBOARD_DEGRADED;
        if (entry.reconciliation_status !== undefined) { status = 'degraded'; reason_code ||= 'rule_lifecycle_projection_degraded'; }
        rules.push(Object.freeze({ rule_id: entry.rule_id, display_label: entry.rule_id.split(':').at(-1), tier_scope_label: entry.tier === 'global' ? 'Global' : 'Project', accepted_commit: row.accepted_head.slice(0, 12), activation_epoch: requiresEpoch ? entry.activation_epoch : null, protection_class: entry.protection_class || 'unknown', lifecycle_state: entry.lifecycle_state }));
      }
    }
    return Object.freeze({ status, reason_code, rules: Object.freeze(rules) });
  } catch { return DASHBOARD_UNAVAILABLE; } finally { db?.close(); }
}

/** Reads only redacted cadence/evaluation facts for dashboard evidence; never exposes IDs, bytes, paths, or lineage. */
export function readDashboardImpactEvidence({ stateRoot } = {}) {
  const file = lifecyclePath(stateRoot);
  if (!existsSync(file)) return DASHBOARD_IMPACT_UNAVAILABLE;
  let db;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const tiers = { global: [], project: [] };
    const selected = new Set();
    const evaluations = db.prepare('SELECT * FROM impact_evaluation_index ORDER BY head_sequence DESC, result_id ASC').all();
    const byResultId = new Map(evaluations.map((row) => [row.result_id, row]));
    const terminals = db.prepare('SELECT * FROM impact_evaluation_terminal ORDER BY head_sequence DESC, terminal_result_id ASC').all();
    const terminalByResultId = new Map(terminals.map((relation) => [relation.terminal_result_id, relation]));
    const replacements = new Map(db.prepare('SELECT * FROM impact_evaluation_replacement').all().map((relation) => [relation.prior_result_id, relation]));
    const candidates = [];
    for (const relation of terminals) {
      const selector = dashboardTerminalSelector(relation);
      const terminalRow = byResultId.get(relation.terminal_result_id);
      const priorRow = byResultId.get(relation.prior_result_id);
      if (!selector || !terminalRow || !priorRow || !Number.isSafeInteger(relation.head_sequence) || relation.head_sequence < 1) return DASHBOARD_IMPACT_UNAVAILABLE;
      candidates.push({ head_sequence: relation.head_sequence, result_id: relation.terminal_result_id, selector, terminal: { terminalRow, relation, priorRow, replacement: replacements.get(relation.prior_result_id), successorRow: replacements.get(relation.prior_result_id) && byResultId.get(replacements.get(relation.prior_result_id).next_result_id) } });
    }
    for (const row of evaluations) {
      if (['superseded', 'expired'].includes(row.state)) {
        if (!terminalByResultId.has(row.result_id)) return DASHBOARD_IMPACT_UNAVAILABLE;
        continue;
      }
      const selector = dashboardEvaluationSelector(row);
      if (selector) candidates.push({ head_sequence: row.head_sequence, result_id: row.result_id, selector, row });
    }
    candidates.sort((left, right) => right.head_sequence - left.head_sequence || String(left.result_id).localeCompare(String(right.result_id)));
    for (const candidate of candidates) {
      const key = canonical(candidate.selector);
      if (selected.has(key)) continue;
      selected.add(key);
      const safe = candidate.terminal
        ? verifiedDashboardTerminal(stateRoot, candidate.terminal.terminalRow, candidate.terminal.relation, candidate.terminal.priorRow, candidate.terminal.replacement, candidate.terminal.successorRow)
        : verifiedDashboardEvaluation(stateRoot, candidate.row, candidate.selector);
      if (candidate.terminal && !safe) return DASHBOARD_IMPACT_UNAVAILABLE;
      if (safe) tiers[candidate.selector.tier].push(safe);
    }
    if (!tiers.global.length && !tiers.project.length) return DASHBOARD_IMPACT_UNAVAILABLE;
    return Object.freeze({ status: 'available', reason_code: null, tiers: Object.freeze({ global: Object.freeze(tiers.global), project: Object.freeze(tiers.project) }) });
  } catch { return DASHBOARD_IMPACT_UNAVAILABLE; } finally { db?.close(); }
}

/** Builds a store-bound context recipe from one verified, registered projection. */
export function prepareLifecycleRuntimeContext(input = {}) {
  const { store, pipeline_id, repository, scope_id = null, project_authority, run_identity, repositories, authority_descriptors } = input;
  if (!store || typeof store.readProjection !== 'function' || typeof store.readLocalRuleStop !== 'function' || typeof pipeline_id !== 'string' || !pipeline_id || typeof repository !== 'string' || !repository) throw new Error('RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE');
  const sources = repositories || [{ repository, scope_id }];
  if (!Array.isArray(sources) || !sources.length || sources.some((source) => !source || typeof source.repository !== 'string')) throw new Error('RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE');
  const projections = sources.map((source) => ({ repository: source.repository, scope_id: source.scope_id || null, ...store.readProjection({ repository: source.repository, scope_id: source.scope_id || null }) }));
  if (projections.some((projection) => !projection.accepted_head || !projection.head || !Array.isArray(projection.entries))) throw new Error('RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE');
  if (!Array.isArray(authority_descriptors) || authority_descriptors.length !== projections.length || projections.some((projection) => !authority_descriptors.some((authority) => authority && authority.repository === projection.repository && (authority.scope_id || null) === (projection.scope_id || null) && canonical(authority) === canonical({ repository: projection.repository, scope_id: projection.scope_id || null, accepted_head: projection.accepted_head, head: projection.head, entries: projection.entries })))) throw new Error('RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE');
  const entries = projections.flatMap((projection) => projection.entries);
  if (!entries.length) throw new Error('RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE');
  const inventoryEntries = entries.map(({ passive_rule_id, source_authority, ...entry }) => ({ ...entry, version_hash: entry.rule_version, lifecycle_state: entry.lifecycle_state === 'deactivated' ? 'inactive' : entry.lifecycle_state }));
  const inventory_identity = { complete: true, entries: inventoryEntries, reconciliation_revision: `projection:${projections.map((projection) => projection.accepted_head).sort().join(':')}`, inventory_digest: digest(inventoryEntries) };
  const reconciliation_id = `reconciliation:${digest({ projections: projections.map(({ repository: identity, accepted_head }) => ({ repository: identity, accepted_head })), inventory_digest: inventory_identity.inventory_digest })}`;
  const reconciliation_artifact = { schema: 1, reconciliation_revision: inventory_identity.reconciliation_revision, inventory_count: inventoryEntries.length, inventory_digest: inventory_identity.inventory_digest, reconciliation_id, artifact_id: reconciliation_id };
  const epoch_catalog = Object.fromEntries(entries.filter((entry) => entry.lifecycle_state === 'active').map((entry) => [`${entry.rule_id}\0${entry.rule_version}`, entry.activation_epoch]).sort(([left], [right]) => left.localeCompare(right)));
  let stopped_rule_ids;
  try {
    stopped_rule_ids = projections.flatMap((projection) => projection.entries.flatMap((entry) => {
      const stop = store.readLocalRuleStop({ repository: projection.repository, scope_id: outwardPublicationScope(scopeKey(projection.scope_id)), rule_id: entry.rule_id });
      if (!stop) return [];
      if (stop.scope_id !== outwardPublicationScope(scopeKey(projection.scope_id)) || stop.rule_id !== entry.rule_id || !LOCAL_STOP_REASONS.has(stop.reason_code)) throw new Error('RULE_LOCAL_STOP_UNAVAILABLE');
      return [entry.rule_id];
    }));
  } catch { throw new Error('RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE'); }
  const runtimeInput = {
    pipeline_id,
    run_identity,
    project_authority,
    inventory_identity,
    lifecycle_head: { projections: projections.map(({ repository: identity, scope_id: sourceScope, head }) => ({ repository: identity, scope_id: sourceScope, head })) },
    projection: { projections: projections.map(({ repository: identity, scope_id: sourceScope, accepted_head, entries: sourceEntries }) => ({ repository: identity, scope_id: sourceScope, accepted_head, entries: sourceEntries })) },
    epoch_catalog,
    mirror_generation: { projections: projections.map(({ repository: identity, accepted_head, head, entries: sourceEntries }) => ({ repository: identity, accepted_head, head, mirror_digests: sourceEntries.map((entry) => entry.mirror_digest).sort() })) },
    reconciliation_artifact,
    run_id: pipeline_id,
    scope_id,
    projection_revision: `heads:${projections.map((projection) => projection.accepted_head).sort().join(':')}`,
    candidates: entries.map(({ passive_rule_id, source_authority, locally_stopped, ...entry }) => entry),
    stopped_rule_ids,
  };
  try {
    // Build effective stop-narrowed authority before digesting. The store validates
    // this same immutable context; persisted runtime rows remain cache history only.
    const finalContext = buildRuleRuntimeContext(runtimeInput);
    return freeze({ input_digests: finalContext.input_digests, createRuntimeContext: () => finalContext });
  } catch { throw new Error('RULE_RUNTIME_CONTEXT_AUTHORITY_UNAVAILABLE'); }
}

/** Acquires fresh canonical receipt facts once, then returns durable immutable acceptance on exact retry. */
export function acquireAcceptedRemoteReceipt({ store, receipt, descendant_adapter, ...input } = {}) {
  if (!store || typeof store.consumeVerifiedReceipt !== 'function' || !receipt || typeof receipt !== 'object') throw new Error('RULE_RECEIPT_INVALID');
  const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
  return store.consumeVerifiedReceipt({
    receipt: { receipt_digest, transaction_digest: receipt.transaction_digest, accepted_commit: receipt.accepted_commit, tree_digest: receipt.tree_digest },
    verify: () => {
      if (descendant_adapter) {
        const transaction = `tx:${receipt.transaction_digest}`;
        const integrity = store.readPublicationReceiptIntegrity?.({ idempotency_key: transaction });
        const durableReceipt = store.readPublicationAcceptedReceipt?.({ idempotency_key: transaction });
        const facts = store.readPublicationWriterFacts?.({ idempotency_key: transaction });
        if (integrity?.status !== 'verified' || canonical(durableReceipt) !== canonical(receipt) || !facts?.staged_member_digests || !facts.writer_authority) throw new Error('RULE_RECEIPT_VERIFICATION_FAILED');
        const enrollment = { repository_identity: facts.writer_authority.repository_identity_digest, normalized_remote_digest: facts.writer_authority.normalized_remote_digest, branch: facts.writer_authority.branch, author: facts.writer_authority.author, allowed_paths: facts.target.allowed_paths };
        const durable = { predecessor_commit: facts.expected_base, accepted_commit: facts.local_commit, tree_digest: facts.local_tree_digest, staged_member_digests: facts.staged_member_digests, admission_digest: facts.admission_digest, transaction_digest: receipt.transaction_digest, rule_id: facts.target.rule_id, tier: facts.target.tier };
        let verified;
        try { verified = verifyAcceptedRemoteDescendantProof({ receipt, enrollment, durable, adapter: descendant_adapter }); } catch { throw new Error('RULE_RECEIPT_VERIFICATION_FAILED'); }
        return { accepted_commit: receipt.accepted_commit, tree_digest: receipt.tree_digest, result: freeze({ accepted_remote_head: verified.containing_head, accepted_commit: verified.accepted_commit, containing_head: verified.containing_head, containing_tree_digest: verified.containing_tree_digest, tree_digest: receipt.tree_digest }) };
      }
      const facts = consumeAcceptedRemoteReceipt(receipt, input);
      return { accepted_commit: facts.accepted_remote_head, tree_digest: facts.tree_digest, result: facts };
    },
  });
}

/** Opens sole local SQLite projection owner. Git/mirror validation must happen before writes. */
export function readRuleLearningEnrollmentAuthority({ authority, tier, findings } = {}) {
  const capability = learningEnrollmentCapabilities.get(authority);
  if (!capability || capability.state.closed || !['project', 'global'].includes(tier) || !Array.isArray(findings)) return null;
  const enrollment = capability.state.config.enrollment;
  const sources = findings.map((finding) => enrollment.sources.find((source) => source.finding_id === finding.finding_id)?.snapshot);
  const target = enrollment.targets?.[tier];
  if (sources.some((source) => !source) || !target || target.authority_digest !== enrollment.authority_digest || !sources.every((source) => { const row = capability.state.db.prepare('SELECT scope_id FROM repository_enrollment WHERE repository = ?').get(source.repository); return row?.scope_id === scopeKey(source.scope_id); }) || capability.state.db.prepare('SELECT scope_id FROM repository_enrollment WHERE repository = ?').get(target.repository)?.scope_id !== scopeKey(target.scope_id)) return null;
  return freeze({ sources: freeze(sources.map((source) => freeze({ ...source }))), target: freeze({ ...target }), policy: freeze({ ...enrollment.policy }), generator_identity: freeze({ ...enrollment.generator_identity }), authority_digest: createHash('sha256').update(`pidex-rule-learning-store-v1:${enrollment.authority_digest}:${capability.state.store_digest}`).digest('hex') });
}

export function readRuleLearningReviewerAuthority({ authority, candidate_digest, authority_digest, tier } = {}) {
  const capability = learningReviewerCapabilities.get(authority);
  if (!capability || capability.state.closed || !validDigest(candidate_digest) || createHash('sha256').update(`pidex-rule-learning-store-v1:${capability.state.config.enrollment.authority_digest}:${capability.state.store_digest}`).digest('hex') !== authority_digest) return null;
  const reviewers = capability.state.config.reviewers;
  if (!['project', 'global'].includes(tier)) return null;
  const configured = new Map(reviewers.principals.map((reviewer) => [reviewer.principal, reviewer]));
  return freeze({ configuration_generation: reviewers.configuration_generation, generator_principal: reviewers.generator_principal, now: reviewers.now, existing: freeze([...(capability.state.config.enrollment.targets?.[tier]?.existing || [])]), reviewers: freeze(reviewers.principals.map((reviewer) => freeze({ ...reviewer }))), claim(votes) { return claimLearningVotes(capability.state.db, { candidateDigest: candidate_digest, votes, reviewers: configured, generation: reviewers.configuration_generation, claimedAt: reviewers.now }); } });
}

function currentManualRefinementFacts(state, request_id, now = new Date().toISOString(), allowImported = false) {
  if (!MANUAL_REFINEMENT_REQUEST.test(request_id || '') || !validPublicationTime(now) || state.closed) return null;
  const row = state.db.prepare("SELECT request.*, tx.state AS tx_state, enrollment.enrollment_digest AS current_enrollment_digest, enrollment.allowed_paths_json AS current_allowed_paths_json, enrollment.predecessor AS enrollment_predecessor, stop.reason_code AS local_stop_reason, projection.accepted_head, projection.entries_json, stage.stage AS handoff_stage, stage.payload_digest AS current_stage_payload_digest, stage.payload_json FROM manual_refinement_request AS request JOIN publication_transaction AS tx ON tx.idempotency_key = 'tx:' || request.transaction_digest JOIN publication_accepted_receipt AS receipt ON receipt.idempotency_key = tx.idempotency_key AND receipt.receipt_digest = request.receipt_digest JOIN publication_enrollment AS enrollment ON enrollment.repository = request.repository AND enrollment.scope_id = request.scope_id AND enrollment.rule_id = request.rule_id LEFT JOIN local_narrowing AS stop ON stop.repository = request.repository AND stop.scope_id = request.scope_id AND stop.rule_id = request.rule_id LEFT JOIN effective_projection AS projection ON projection.repository = request.repository AND projection.scope_id = request.scope_id LEFT JOIN publication_handoff_stage_current AS stage ON stage.receipt_digest = request.receipt_digest AND stage.transaction_digest = request.transaction_digest WHERE request.request_id = ?").get(request_id);
  if (!row || !((row.status === 'open') || (allowImported && ['imported', 'admitted'].includes(row.status))) || Date.parse(row.expires_at) <= Date.parse(now) || row.tx_state !== 'accepted_remote' || row.local_stop_reason !== null || row.enrollment_digest !== row.current_enrollment_digest || row.allowed_paths_json !== row.current_allowed_paths_json || row.allowed_paths_digest !== createHash('sha256').update(row.current_allowed_paths_json || '', 'utf8').digest('hex') || row.enrollment_predecessor !== `commit:${row.predecessor_commit}` || row.handoff_stage !== 'status_ready' || row.stage_payload_digest !== row.current_stage_payload_digest) return null;
  try {
    const entries = JSON.parse(row.entries_json); const payload = JSON.parse(row.payload_json);
    const entry = entries.find((item) => item.rule_id === row.rule_id);
    const epoch = entry?.activation_epoch && state.db.prepare('SELECT closed_at FROM activation_epoch WHERE repository = ? AND scope_id = ? AND rule_id = ? AND rule_version = ? AND activation_epoch = ?').get(row.repository, row.scope_id, row.rule_id, entry.rule_version, entry.activation_epoch);
    if (!entry || entry.lifecycle_state !== 'active' || entry.content_hash !== row.content_hash || !epoch || epoch.closed_at !== null || row.accepted_head !== row.containing_head || payload?.accepted_commit !== row.accepted_commit || payload?.containing_head !== row.containing_head || payload?.member?.rule_id !== row.rule_id || payload.member.path !== row.rule_path || payload.member.content_hash !== row.content_hash || payload?.target_epoch?.activation_epoch !== entry.activation_epoch) return null;
  } catch { return null; }
  return row;
}

function mintManualAdmissionCapability(state, request_id, intake_digest, admission_digest) {
  const existing = state.manual_refinement_admissions.get(request_id);
  if (existing) return existing;
  const capability = Object.freeze({}); manualRefinementAdmissionCapabilities.set(capability, { state, request_id, intake_digest, admission_digest }); state.manual_refinement_admissions.set(request_id, capability); return capability;
}
/** Private store-capability reader; returns no facts for forged, stale, foreign, closed, or consumed capability. */
export function readManualRefinementRequestFacts({ capability } = {}) {
  const bound = manualRefinementCapabilities.get(capability);
  const facts = bound && currentManualRefinementFacts(bound.state, bound.request_id, new Date().toISOString(), true);
  return facts ? freeze({ request_id: facts.request_id, request_digest: facts.request_digest, rule_id: facts.rule_id, scope_id: outwardPublicationScope(facts.scope_id), tier: facts.tier, path_digest: facts.path_digest, current_content_digest: facts.content_hash, predecessor_commit: facts.predecessor_commit, accepted_commit: facts.accepted_commit, expires_at: facts.expires_at }) : null;
}
/** Private reader-factory facts: opaque request capability is sole authority source. */
export function readManualRefinementReaderFacts({ capability } = {}) {
  const bound = manualRefinementCapabilities.get(capability);
  const facts = bound && currentManualRefinementFacts(bound.state, bound.request_id, new Date().toISOString(), true);
  return facts ? freeze({ state_root: bound.state.state_root, repository: facts.repository, scope_id: facts.scope_id, rule_path: facts.rule_path, path_digest: facts.path_digest, current_content_digest: facts.content_hash, accepted_commit: facts.accepted_commit }) : null;
}

/** Private consumer seam. Only store-minted intake authority reveals canonical candidate material. */
export function readManualRefinementIntake({ intake_capability } = {}) {
  const bound = manualRefinementIntakeCapabilities.get(intake_capability);
  const facts = bound && currentManualRefinementFacts(bound.state, bound.request_id, new Date().toISOString(), true);
  const candidate_bytes = Buffer.isBuffer(facts?.candidate_bytes) || facts?.candidate_bytes instanceof Uint8Array ? Buffer.from(facts.candidate_bytes) : null;
  if (!facts || !['imported', 'admitted'].includes(facts.status) || !candidate_bytes || facts.intake_digest !== bound.intake_digest || facts.candidate_digest !== bound.candidate_digest) return null;
  try {
    const canonical = canonicalRuleLearningCandidateBytes(JSON.parse(candidate_bytes.toString('utf8')));
    if (!canonical || !Buffer.from(canonical, 'utf8').equals(candidate_bytes) || candidateBytesDigest(candidate_bytes) !== facts.candidate_bytes_digest) return null;
    const candidate = JSON.parse(canonical);
    return freeze({ candidate: freeze(candidate), candidate_bytes, candidate_digest: facts.candidate_digest, candidate_bytes_digest: facts.candidate_bytes_digest, intake_digest: facts.intake_digest, rule_id: facts.rule_id, tier: facts.tier, predecessor_commit: facts.predecessor_commit });
  } catch { return null; }
}

/** Private admission capability returns canonical bytes only; vote/source material never crosses this seam. */
export function readManualRefinementAdmission({ admission_capability } = {}) {
  const bound = manualRefinementAdmissionCapabilities.get(admission_capability);
  const facts = bound && currentManualRefinementFacts(bound.state, bound.request_id, new Date().toISOString(), true);
  if (!facts) return null;
  const row = bound.state.db.prepare('SELECT intent.candidate_digest, result.admission_digest, result.admission_bytes FROM manual_refinement_admission_intent AS intent JOIN manual_refinement_admission_result AS result ON result.request_id = intent.request_id AND result.intake_digest = intent.intake_digest WHERE intent.request_id = ? AND intent.intake_digest = ?').get(bound.request_id, bound.intake_digest);
  const candidate_bytes = Buffer.isBuffer(facts.candidate_bytes) || facts.candidate_bytes instanceof Uint8Array ? Buffer.from(facts.candidate_bytes) : null;
  if (!row || row.admission_digest !== bound.admission_digest || !candidate_bytes || row.candidate_digest !== facts.candidate_digest) return null;
  return freeze({ request_digest: facts.request_digest, intake_digest: bound.intake_digest, candidate_digest: facts.candidate_digest, candidate_bytes, admission_digest: row.admission_digest, admission_bytes: Buffer.from(row.admission_bytes) });
}
/** Private target reader derives every writer field from current enrolled request state. */
export function readManualPublicationTarget({ admission_capability } = {}) {
  const bound = manualRefinementAdmissionCapabilities.get(admission_capability);
  const admission = readManualRefinementAdmission({ admission_capability }); const facts = bound && currentManualRefinementFacts(bound.state, bound.request_id, new Date().toISOString(), true);
  if (!admission || !facts) return null;
  try {
    const allowed_paths = JSON.parse(facts.allowed_paths_json); const row = bound.state.db.prepare('SELECT normalized_remote_digest, branch, author, writer_enabled, trailer_policy, repository_identity_digest, identity_platform, root_identity_digest, parent_identity_digest, files_identity_digest, identity_proof, publication_timestamp FROM publication_enrollment WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(facts.repository, facts.scope_id, facts.rule_id);
    const writer_authority = row && { ...row, writer_enabled: row.writer_enabled === 1 };
    const candidate = JSON.parse(admission.candidate_bytes.toString('utf8'));
    const target = { repository: facts.repository, tier: facts.tier, scope_id: outwardPublicationScope(facts.scope_id), scope_digest: candidate.scope_digest, rule_id: facts.rule_id, predecessor: `commit:${facts.predecessor_commit}`, enrollment_digest: facts.enrollment_digest, allowed_paths, writer_authority };
    return validPublicationTarget(target) ? freeze(target) : null;
  } catch { return null; }
}

function validLearningAuthority(learningAuthority) {
  return learningAuthority && typeof learningAuthority === 'object' && !Array.isArray(learningAuthority) && learningAuthority.enrollment && typeof learningAuthority.enrollment === 'object' && !Array.isArray(learningAuthority.enrollment) && learningAuthority.reviewers && typeof learningAuthority.reviewers === 'object' && !Array.isArray(learningAuthority.reviewers) && Object.values(learningAuthority.enrollment.targets || {}).every((target) => target && typeof target === 'object' && /^commit:[a-f0-9]{40}$/.test(target.predecessor));
}
const AUTOMATIC_PROFILE_KEYS = Object.freeze(['schema_version', 'route_generation', 'enrollment', 'reviewers']);
const AUTOMATIC_DISPOSITIONS = new Set(['prepared', 'existing', 'blocked_artifact_authority', 'blocked_runner_configuration', 'blocked_reviewer_independence', 'blocked_finding_eligibility', 'blocked_source_fact_drift', 'blocked_target_authority', 'blocked_durable_conflict', 'blocked_recovery_pending', 'blocked_state_authority', 'blocked_profile_authority', 'blocked_route_authority', 'blocked_source_authority', 'blocked_eligibility', 'blocked_lifecycle_authority', 'completed_result_reused', 'recovery_dispatch_once', 'handoff_already_consumed']);
function validAutomaticLearningProfile(profile) { return exactKeys(profile, AUTOMATIC_PROFILE_KEYS) && profile.schema_version === 'pidex-automatic-learning-profile-v1' && validDigest(profile.route_generation) && validLearningAuthority({ enrollment: profile.enrollment, reviewers: profile.reviewers }) && profile.reviewers.configuration_generation === profile.route_generation; }
const AUTOMATIC_WORK_ID = /^work:[a-f0-9]{64}$/;
const AUTOMATIC_WORK_STAGES = new Set(['generator', 'project_reviewer', 'global_reviewer']);
function automaticScope(tier, scopeId) { if (tier === 'global' && scopeId === 'pidex-global') return ''; if (tier === 'project' && typeof scopeId === 'string' && PUBLICATION_SCOPE.test(scopeId)) return scopeId; return null; }
function validAutomaticWork(input) { return input && AUTOMATIC_WORK_ID.test(input.work_id || '') && ['project', 'global'].includes(input.tier) && automaticScope(input.tier, input.scope_id) !== null && AUTOMATIC_WORK_STAGES.has(input.stage) && [input.source_generation, input.configuration_generation].every((value) => typeof value === 'string' && LEARNING_CLAIM_TEXT.test(value)) && validDigest(input.input_digest) && validPublicationTime(input.now); }
function automaticFindingCurrent(state, finding, eligibility) {
  const source = state.config?.enrollment?.sources?.find((item) => item?.finding_id === finding.finding_id)?.snapshot;
  const enrolled = source && state.db.prepare('SELECT scope_id FROM repository_enrollment WHERE repository = ?').get(source.repository);
  return Boolean(source && source.enabled === true && source.protected === false && source.finding_id === finding.finding_id && source.scope_id === finding.project_scope_id && source.repository_identity === finding.repository_identity && source.repository === finding.repository_identity && enrolled?.scope_id === finding.project_scope_id && eligibility.finding_digest === findingDigest(finding));
}
function automaticRuntimeTargetCurrent(state, tier, scope) {
  const target = state.config?.enrollment?.targets?.[tier]; const storeScope = automaticScope(tier, tier === 'global' ? 'pidex-global' : scope);
  if (!target || target.tier !== tier || target.scope_id !== (tier === 'global' ? null : scope) || typeof target.repository !== 'string' || typeof target.rule_id !== 'string' || typeof target.predecessor !== 'string' || storeScope === null) return false;
  const repository = state.db.prepare('SELECT scope_id FROM repository_enrollment WHERE repository = ?').get(target.repository);
  const enrolled = state.db.prepare('SELECT predecessor FROM publication_enrollment WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(target.repository, storeScope, target.rule_id);
  return repository?.scope_id === storeScope && enrolled?.predecessor === target.predecessor;
}
function automaticAdmissionValid(bytes, candidateDigest) {
  let admission; try { admission = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { return false; }
  const keys = ['schema_version', 'candidate_digest', 'candidate_content_hash', 'admission_policy_digest', 'admission_policy_version', 'tier', 'repository_scope_digest', 'vote_digests'];
  return exactKeys(admission, keys) && admission.schema_version === 'pidex-living-rule-admission-v1' && admission.candidate_digest === candidateDigest && validDigest(admission.candidate_content_hash) && validDigest(admission.admission_policy_digest) && typeof admission.admission_policy_version === 'string' && ['project', 'global'].includes(admission.tier) && validDigest(admission.repository_scope_digest) && Array.isArray(admission.vote_digests) && admission.vote_digests.every(validDigest) && Buffer.from(JSON.stringify(admission), 'utf8').equals(Buffer.from(bytes));
}
function bindManualPublicationTransaction(db, record, scope) {
  const manual = record.manual_admission;
  if (manual === undefined) return;
  if (!exactKeys(manual, ['request_digest', 'intake_digest', 'admission_digest']) || ![manual.request_digest, manual.intake_digest, manual.admission_digest].every(validDigest)) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
  const row = db.prepare('SELECT request.request_id, request.repository, request.scope_id, request.rule_id, request.tier, request.status, request.expires_at, request.candidate_digest AS request_candidate_digest, request.candidate_bytes, request.candidate_bytes_digest, request.intake_digest AS request_intake_digest, intent.candidate_digest AS intent_candidate_digest, result.admission_digest, result.admission_bytes, result.transaction_id FROM manual_refinement_admission_result AS result JOIN manual_refinement_admission_intent AS intent ON intent.request_id = result.request_id AND intent.intake_digest = result.intake_digest JOIN manual_refinement_request AS request ON request.request_id = result.request_id WHERE request.request_digest = ? AND result.intake_digest = ? AND result.admission_digest = ?').get(manual.request_digest, manual.intake_digest, manual.admission_digest);
  const candidate_bytes = row?.candidate_bytes && Buffer.from(row.candidate_bytes); const admission_bytes = row?.admission_bytes && Buffer.from(row.admission_bytes);
  if (!row || row.request_intake_digest !== manual.intake_digest || row.request_candidate_digest !== record.candidate_digest || row.intent_candidate_digest !== record.candidate_digest || row.admission_digest !== record.admission_digest || row.repository !== record.target.repository || row.scope_id !== scope || row.rule_id !== record.target.rule_id || row.tier !== record.target.tier || row.status !== 'admitted' || Date.parse(row.expires_at) <= Date.parse(record.created_at) || !candidate_bytes || !admission_bytes || candidateBytesDigest(candidate_bytes) !== row.candidate_bytes_digest || !candidate_bytes.equals(record.candidate_bytes) || !admission_bytes.equals(record.admission_bytes) || row.transaction_id !== null && row.transaction_id !== record.idempotency_key) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
  db.prepare('UPDATE manual_refinement_admission_result SET transaction_id = ? WHERE request_id = ? AND intake_digest = ? AND (transaction_id IS NULL OR transaction_id = ?)').run(record.idempotency_key, row.request_id, manual.intake_digest, record.idempotency_key);
}

const ACTION_ENROLLMENT_KEYS = Object.freeze(['repository_identity', 'normalized_remote_digest', 'branch', 'author', 'allowed_paths']);
const LIFECYCLE_ACTION_STATES = Object.freeze(['deactivated', 'active-monitor', 'active-pinned']);
// Plan048 Slice3A: canonical transition source map (shared contract with the Plan047 lifecycle-action TX seam). A stale rule receipt truth claim never survives persistence (SEC48-02).
const ACTION_TRANSITION_SOURCES = Object.freeze({ deactivated: ['active', 'active-monitor', 'active-pinned'], 'active-monitor': ['deactivated', 'active-pinned'], 'active-pinned': ['deactivated'] });
function canonicalizeLifecycleActionRuleBytes(action, rule_bytes) {
  const text = Buffer.isBuffer(rule_bytes) ? rule_bytes.toString('utf8') : null;
  const match = typeof text === 'string' ? /^(<!-- pidex-rule-receipt-v1 (\{[^\n]+\}) -->\n)/.exec(text) : null;
  let header;
  try { header = match && JSON.parse(match[2]); } catch { throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID'); }
  if (!header || header.rule_id !== action.rule_id) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
  if (header.lifecycle_state === action.lifecycle_transition) return Buffer.from(rule_bytes);
  if (!ACTION_TRANSITION_SOURCES[action.lifecycle_transition]?.includes(header.lifecycle_state)) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
  const body = text.slice(match[1].length);
  return Buffer.from(`<!-- pidex-rule-receipt-v1 ${JSON.stringify({ ...header, lifecycle_state: action.lifecycle_transition })} -->\n${body}`, 'utf8');
}
const LIFECYCLE_STATES = Object.freeze(['active', 'deactivated', 'active-monitor', 'active-pinned']);
const ACTIVE_STATES = Object.freeze(['active', 'active-monitor', 'active-pinned']);
const ACTION_DURABLE_KEYS = Object.freeze(['predecessor_commit', 'accepted_commit', 'tree_digest', 'staged_member_digests', 'admission_digest', 'transaction_digest', 'rule_id', 'tier']);
const ACTION_FETCH_KEYS = Object.freeze(['repository_identity', 'normalized_remote_digest', 'branch', 'containing_head', 'containing_tree_bytes', 'containing_tree_digest', 'entries', 'predecessor_boundary']);
const ACTION_GRAPH_ENTRY_KEYS = Object.freeze(['commit_oid', 'parent_oids', 'tree_oid']);
const ACTION_DESCENDANT_INSPECTION_KEYS = Object.freeze(['commit_oid', 'parent_oids', 'tree_oid', 'managed_members']);
const ACTION_ACCEPTED_INSPECTION_KEYS = Object.freeze(['commit_oid', 'parent_oids', 'tree_oid', 'author', 'subject', 'trailers', 'managed_members']);
const ACTION_MEMBER_KEYS = Object.freeze(['blob_oid', 'content_hash']);
const ACTION_MAX_STEPS = 64;
function actionValidPaths(paths) { return Array.isArray(paths) && paths.length > 0 && new Set(paths).size === paths.length && paths.every((memberPath) => PUBLICATION_PATH.test(memberPath)); }
function actionValidStaged(staged) { return staged && typeof staged === 'object' && !Array.isArray(staged) && actionValidPaths(Object.keys(staged)) && Object.values(staged).every(validDigest); }
/** Cadence-aware bounded first-parent proof. Mirrors Plan047 descendant proof but requires exactly one conforming PIDEX-Action-Cadence trailer on the accepted commit. */
export function verifyLifecycleActionRemoteProof({ receipt, enrollment, durable, cadence_digest, adapter } = {}) {
  const mismatch = () => { throw new Error('RULE_LIFECYCLE_ACTION_PROOF_CAPABILITY_INVALID'); };
  if (!validAcceptedReceipt(receipt) || !LIFECYCLE_ACTION_STATES.includes(receipt.lifecycle_state) || !exactKeys(enrollment, ACTION_ENROLLMENT_KEYS) || !validDigest(enrollment.normalized_remote_digest) || !actionValidPaths(enrollment.allowed_paths) || typeof enrollment.repository_identity !== 'string' || !enrollment.repository_identity || typeof enrollment.branch !== 'string' || !enrollment.branch || typeof enrollment.author !== 'string' || !enrollment.author || !exactKeys(durable, ACTION_DURABLE_KEYS) || ![durable.predecessor_commit, durable.accepted_commit].every(validHead) || ![durable.tree_digest, durable.admission_digest, durable.transaction_digest].every(validDigest) || !actionValidStaged(durable.staged_member_digests) || durable.rule_id !== receipt.rule_id || !['global', 'project'].includes(durable.tier) || durable.predecessor_commit !== receipt.predecessor_commit || durable.accepted_commit !== receipt.accepted_commit || durable.tree_digest !== receipt.tree_digest || durable.admission_digest !== receipt.admission_digest || durable.transaction_digest !== receipt.transaction_digest || !validDigest(cadence_digest) || typeof adapter?.fetchEnrolledBranch !== 'function' || typeof adapter?.inspectCommit !== 'function') mismatch();
  const managedPaths = Object.keys(durable.staged_member_digests).sort();
  if (JSON.stringify(managedPaths) !== JSON.stringify([...enrollment.allowed_paths].sort())) mismatch();
  let fresh;
  try { fresh = adapter.fetchEnrolledBranch(enrollment); } catch { mismatch(); }
  if (!exactKeys(fresh, ACTION_FETCH_KEYS) || fresh.repository_identity !== enrollment.repository_identity || fresh.normalized_remote_digest !== enrollment.normalized_remote_digest || fresh.branch !== enrollment.branch || !validHead(fresh.containing_head) || !Buffer.isBuffer(fresh.containing_tree_bytes) || !validDigest(fresh.containing_tree_digest) || createHash('sha256').update(fresh.containing_tree_bytes).digest('hex') !== fresh.containing_tree_digest || fresh.predecessor_boundary !== receipt.predecessor_commit || !Array.isArray(fresh.entries) || fresh.entries.length < 1 || fresh.entries.length > ACTION_MAX_STEPS + 1) mismatch();
  const seen = new Set();
  for (let index = 0; index < fresh.entries.length; index += 1) {
    const entry = fresh.entries[index];
    if (!exactKeys(entry, ACTION_GRAPH_ENTRY_KEYS) || !validHead(entry.commit_oid) || !Array.isArray(entry.parent_oids) || entry.parent_oids.length !== 1 || !validHead(entry.parent_oids[0]) || !validHead(entry.tree_oid) || (index === 0 && entry.commit_oid !== fresh.containing_head) || (index > 0 && fresh.entries[index - 1].parent_oids[0] !== entry.commit_oid) || seen.has(entry.commit_oid)) mismatch();
    seen.add(entry.commit_oid);
  }
  const acceptedIndex = fresh.entries.findIndex((entry) => entry.commit_oid === receipt.accepted_commit);
  if (acceptedIndex !== fresh.entries.length - 1 || acceptedIndex > ACTION_MAX_STEPS || fresh.entries[acceptedIndex].parent_oids[0] !== fresh.predecessor_boundary) mismatch();
  const expectedTrailers = { 'PIDEX-Rule-ID': receipt.rule_id, 'PIDEX-Transaction-Digest': receipt.transaction_digest, 'PIDEX-Admission-Digest': receipt.admission_digest, 'PIDEX-Predecessor': `commit:${receipt.predecessor_commit}`, 'PIDEX-Action-Cadence': cadence_digest };
  const inspections = [];
  for (let index = 0; index < fresh.entries.length; index += 1) {
    const entry = fresh.entries[index]; let inspected;
    try { inspected = adapter.inspectCommit(entry.commit_oid); } catch { mismatch(); }
    const accepted = index === acceptedIndex;
    if (!exactKeys(inspected, accepted ? ACTION_ACCEPTED_INSPECTION_KEYS : ACTION_DESCENDANT_INSPECTION_KEYS) || inspected.commit_oid !== entry.commit_oid || JSON.stringify(inspected.parent_oids) !== JSON.stringify(entry.parent_oids) || inspected.tree_oid !== entry.tree_oid || !inspected.managed_members || typeof inspected.managed_members !== 'object' || Array.isArray(inspected.managed_members) || JSON.stringify(Object.keys(inspected.managed_members).sort()) !== JSON.stringify(managedPaths)) mismatch();
    for (const memberPath of managedPaths) {
      const member = inspected.managed_members[memberPath];
      if (!exactKeys(member, ACTION_MEMBER_KEYS) || !validHead(member.blob_oid) || !validDigest(member.content_hash) || member.content_hash !== durable.staged_member_digests[memberPath]) mismatch();
    }
    if (accepted && (inspected.author !== enrollment.author || inspected.subject !== `rules(${durable.tier}): publish ${receipt.rule_id}` || JSON.stringify(inspected.trailers) !== JSON.stringify(expectedTrailers))) mismatch();
    inspections.push(inspected);
  }
  const acceptedMembers = inspections[acceptedIndex].managed_members;
  for (const inspected of inspections.slice(0, -1)) for (const memberPath of managedPaths) {
    const member = inspected.managed_members[memberPath]; const expected = acceptedMembers[memberPath];
    if (member.blob_oid !== expected.blob_oid || member.content_hash !== expected.content_hash) mismatch();
  }
  return freeze({ accepted_commit: receipt.accepted_commit, containing_head: fresh.containing_head, containing_tree_digest: fresh.containing_tree_digest });
}

export function openRuleLifecycleStore({ stateRoot, transactionExecutor, learningAuthority, mode = 'normal' } = {}) {
  if (transactionExecutor !== undefined && typeof transactionExecutor !== 'function') throw new Error('RULE_LIFECYCLE_TRANSACTION_EXECUTOR_INVALID');
  if (learningAuthority !== undefined && !validLearningAuthority(learningAuthority)) throw new Error('RULE_LEARNING_AUTHORITY_INVALID');
  if (!['normal', 'existing'].includes(mode)) throw new Error('RULE_LIFECYCLE_OPEN_MODE_INVALID');
  const learningState = { closed: false, state_root: path.resolve(stateRoot || ''), config: learningAuthority ? freeze(learningAuthority) : null, store_digest: createHash('sha256').update(`pidex-rule-learning-store-v1:${path.resolve(stateRoot || '')}`).digest('hex'), manual_refinement_intakes: new Map(), manual_refinement_admissions: new Map() };
  const file = lifecyclePath(stateRoot);
  if (mode === 'existing' && !existsSync(file)) throw new Error('RULE_LIFECYCLE_EXISTING_STORE_UNAVAILABLE');
  if (mode === 'normal') mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  let db; const deadline = Date.now() + SQLITE_INIT_RETRY_BUDGET_MS;
  while (!db) {
    let candidate;
    try {
      if (mode === 'existing') {
        const probe = new DatabaseSync(file, { readOnly: true });
        const valid = existingLifecycleStoreValid(probe); probe.close();
        if (!valid) throw new Error('RULE_LIFECYCLE_EXISTING_STORE_UNAVAILABLE');
      }
      candidate = new DatabaseSync(file);
      candidate.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);
      if (mode === 'normal') init(candidate);
      db = candidate;
    } catch (error) {
      try { candidate?.close(); } catch {}
      if (error.message === 'RULE_LIFECYCLE_EXISTING_STORE_UNAVAILABLE') throw error;
      if (!busy(error) || Date.now() >= deadline) throw storageUnavailable(error);
      wait(Math.min(SQLITE_INIT_RETRY_MS, Math.max(1, deadline - Date.now())));
    }
  }
  learningState.db = db;
  const persistedProfile = db.prepare('SELECT profile_json FROM automatic_learning_profile WHERE singleton = 1').get();
  if (persistedProfile) {
    try { const profile = JSON.parse(persistedProfile.profile_json); if (validAutomaticLearningProfile(profile) && canonical(profile) === persistedProfile.profile_json) learningState.config = freeze({ enrollment: profile.enrollment, reviewers: profile.reviewers }); } catch {}
  }
  const transaction = (operation, sql) => transactionExecutor ? transactionExecutor({ operation, sql, execute: () => db.exec(sql) }) : db.exec(sql);
  return Object.freeze({
    /** Setup-only durable profile. It grants no candidate, artifact, or publication authority. */
    enrollAutomaticLearningProfile({ profile } = {}) {
      if (!validAutomaticLearningProfile(profile)) throw new Error('RULE_AUTOMATIC_LEARNING_PROFILE_INVALID');
      const profileJson = canonical(profile); const profileDigest = createHash('sha256').update(profileJson, 'utf8').digest('hex'); const existing = db.prepare('SELECT profile_digest,profile_json FROM automatic_learning_profile WHERE singleton = 1').get();
      if (existing && (existing.profile_digest !== profileDigest || existing.profile_json !== profileJson)) throw new Error('RULE_AUTOMATIC_LEARNING_PROFILE_CONFLICT');
      if (!existing) db.prepare('INSERT INTO automatic_learning_profile (singleton,profile_digest,profile_json) VALUES (1,?,?)').run(profileDigest, profileJson);
      learningState.config = freeze({ enrollment: profile.enrollment, reviewers: profile.reviewers });
      return freeze({ status: existing ? 'existing' : 'enrolled', route_generation: profile.route_generation });
    },
    /** Opaque restart-safe grant proves matching durable route generation, exposing no enrollment facts. */
    remintAutomaticLearningProfileCapability({ route_generation } = {}) {
      const row = typeof route_generation === 'string' && validDigest(route_generation) ? db.prepare('SELECT profile_json FROM automatic_learning_profile WHERE singleton = 1').get() : null;
      let profile; try { profile = row && JSON.parse(row.profile_json); } catch {}
      if (!profile || !validAutomaticLearningProfile(profile) || canonical(profile) !== row.profile_json || profile.route_generation !== route_generation || learningState.closed) throw new Error('RULE_AUTOMATIC_LEARNING_PROFILE_UNAVAILABLE');
      const capability = Object.freeze({}); automaticLearningProfileCapabilities.set(capability, { state: learningState, route_generation }); return capability;
    },
    readAutomaticLearningProfile({ capability } = {}) {
      const bound = automaticLearningProfileCapabilities.get(capability); return bound?.state === learningState && bound.route_generation && !learningState.closed ? freeze({ route_generation: bound.route_generation }) : null;
    },
    /** Opaque runtime grant binds a current reattested profile to one exact tier/scope. */
    mintAutomaticLearningRuntimeCapability({ profile_capability, tier, scope_id } = {}) {
      const profile = automaticLearningProfileCapabilities.get(profile_capability); const scope = automaticScope(tier, scope_id);
      if (!profile || profile.state !== learningState || scope === null || learningState.closed || !automaticRuntimeTargetCurrent(learningState, tier, scope)) throw new Error('RULE_AUTOMATIC_LEARNING_RUNTIME_UNAVAILABLE');
      const capability = Object.freeze({}); automaticLearningRuntimeCapabilities.set(capability, { state: learningState, tier, scope }); return capability;
    },
    /** Store mints eligibility from canonical bytes, retry identity, current source enrollment, and enrolled host only. */
    mintAutomaticLearningEligibility({ capability, finding_bytes, retry_family_id } = {}) {
      const runtime = automaticLearningRuntimeCapabilities.get(capability); const parsed = parseCanonicalRuleLearningFindingBytes(finding_bytes); const host = learningState.config?.enrollment?.evaluator_host_id;
      if (!runtime || runtime.state !== learningState || learningState.closed || !parsed.ok || typeof retry_family_id !== 'string' || !/^retry:[a-z0-9][a-z0-9._-]{1,127}$/.test(retry_family_id) || typeof host !== 'string' || !/^host:[a-f0-9]{64}$/.test(host) || !automaticRuntimeTargetCurrent(learningState, runtime.tier, runtime.scope) || runtime.tier === 'project' && parsed.value.project_scope_id !== runtime.scope) return null;
      try {
        const eligibility = createRuleLearningEligibilityEnvelope({ finding: parsed.value, retry_family_id, evaluator_host_id: host });
        return automaticFindingCurrent(learningState, parsed.value, eligibility) ? eligibility : null;
      } catch { return null; }
    },
    /** Runtime-only enrolled remote/branch facts for read-only fresh-base query. Caller cannot supply target. */
    readAutomaticLearningRuntimeTarget({ capability } = {}) {
      const runtime = automaticLearningRuntimeCapabilities.get(capability); if (!runtime || runtime.state !== learningState || learningState.closed || !automaticRuntimeTargetCurrent(learningState, runtime.tier, runtime.scope)) return null;
      const target = learningState.config.enrollment.targets[runtime.tier]; const scope = runtime.tier === 'global' ? '' : runtime.scope;
      const enrolled = db.prepare('SELECT remote,branch,scope_id FROM repository_enrollment WHERE repository = ?').get(target.repository);
      if (!enrolled || enrolled.scope_id !== scope || typeof enrolled.remote !== 'string' || !enrolled.remote || typeof enrolled.branch !== 'string' || !enrolled.branch) return null;
      return freeze({ repository: target.repository, remote: enrolled.remote, branch: enrolled.branch, scope_digest: target.scope_digest });
    },
    appendAutomaticLearningDisposition({ disposition_id, status, occurred_at } = {}) {
      if (!/^automatic-disposition:[a-f0-9]{64}$/.test(disposition_id || '') || !AUTOMATIC_DISPOSITIONS.has(status) || !validPublicationTime(occurred_at)) throw new Error('RULE_AUTOMATIC_LEARNING_DISPOSITION_INVALID');
      const existing = db.prepare('SELECT status,occurred_at FROM automatic_learning_disposition WHERE disposition_id = ?').get(disposition_id);
      if (existing && (existing.status !== status || existing.occurred_at !== occurred_at)) throw new Error('RULE_AUTOMATIC_LEARNING_DISPOSITION_CONFLICT');
      if (!existing) db.prepare('INSERT INTO automatic_learning_disposition (disposition_id,status,occurred_at) VALUES (?,?,?)').run(disposition_id, status, occurred_at);
      return freeze({ status: existing ? 'existing' : 'recorded', disposition: status });
    },
    readAutomaticLearningDispositions() { return freeze(db.prepare('SELECT disposition_id,status,occurred_at FROM automatic_learning_disposition ORDER BY disposition_id').all().map((row) => freeze({ ...row }))); },
    /** Atomic adapter-event/disposition append. First canonical bytes and timestamp control replay. */
    appendAutomaticLearningAdapterEvent({ event } = {}) {
      const fields = ['schema', 'event_id', 'event_type', 'tier', 'scope_digest', 'stage', 'role', 'work_digest', 'run_retry_digest', 'principal_digest', 'route_digest', 'profile_generation', 'configuration_generation', 'disposition', 'reason_code', 'occurred_at'];
      const bytes = Buffer.from(JSON.stringify(event), 'utf8'); const canonicalEvent = exactKeys(event, fields) && createAutomaticLearningAdapterEvent(event);
      if (!canonicalEvent || event.schema !== 'pidex-rule-learning-adapter-event-v1') throw new Error('RULE_AUTOMATIC_ADAPTER_EVENT_INVALID');
      const canonicalBytes = Buffer.from(JSON.stringify(canonicalEvent), 'utf8'); const matchesCanonical = canonicalBytes.equals(bytes);
      const semanticMatch = (left, right) => fields.filter((field) => field !== 'occurred_at').every((field) => left[field] === right[field]);
      const append = (value) => {
        const eventBytes = Buffer.from(JSON.stringify(value), 'utf8'); const disposition_id = `automatic-disposition:${value.event_id}`;
        const disposition = db.prepare('SELECT status,occurred_at FROM automatic_learning_disposition WHERE disposition_id = ?').get(disposition_id);
        if (disposition && (disposition.status !== value.disposition || disposition.occurred_at !== value.occurred_at)) throw new Error('RULE_AUTOMATIC_ADAPTER_EVENT_CONFLICT');
        if (!db.prepare('SELECT 1 FROM rule_learning_adapter_event WHERE event_id = ?').get(value.event_id)) {
          db.prepare('INSERT INTO rule_learning_adapter_event (event_id,tier,scope_digest,event_bytes,disposition,occurred_at) VALUES (?,?,?,?,?,?)').run(value.event_id, value.tier, value.scope_digest, eventBytes, value.disposition, value.occurred_at);
          transaction('ADAPTER_EVENT_AFTER_EVENT_WRITE', '');
        }
        if (!disposition) db.prepare('INSERT INTO automatic_learning_disposition (disposition_id,status,occurred_at) VALUES (?,?,?)').run(disposition_id, value.disposition, value.occurred_at);
      };
      transaction('BEGIN', 'BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT event_id,event_bytes FROM rule_learning_adapter_event WHERE event_id = ?').get(event.event_id);
        if (existing) {
          const firstBytes = Buffer.from(existing.event_bytes); let first;
          try { first = JSON.parse(firstBytes.toString('utf8')); } catch { throw new Error('RULE_AUTOMATIC_ADAPTER_EVENT_CONFLICT'); }
          const firstCanonical = exactKeys(first, fields) && first.schema === 'pidex-rule-learning-adapter-event-v1' && createAutomaticLearningAdapterEvent(first);
          if (!firstCanonical || existing.event_id !== firstCanonical.event_id || !firstBytes.equals(Buffer.from(JSON.stringify(firstCanonical), 'utf8'))) throw new Error('RULE_AUTOMATIC_ADAPTER_EVENT_CONFLICT');
          if (semanticMatch(firstCanonical, event)) { transaction('COMMIT', 'COMMIT'); return freeze({ status: 'existing', event_id: event.event_id }); }
          if (matchesCanonical) throw new Error('RULE_AUTOMATIC_ADAPTER_EVENT_CONFLICT');
          const conflict = createAutomaticLearningAdapterEvent({ tier: firstCanonical.tier, scope_digest: firstCanonical.scope_digest, stage: 'recovery', role: null, work_digest: firstCanonical.work_digest, run_retry_digest: firstCanonical.run_retry_digest, principal_digest: firstCanonical.principal_digest, route_digest: firstCanonical.route_digest, profile_generation: firstCanonical.profile_generation, configuration_generation: firstCanonical.configuration_generation, disposition: 'blocked_durable_conflict', reason_code: 'event_bytes_conflict', occurred_at: event.occurred_at });
          if (!conflict) throw new Error('RULE_AUTOMATIC_ADAPTER_EVENT_INVALID'); append(conflict); transaction('COMMIT', 'COMMIT'); return freeze({ status: 'conflict', event_id: event.event_id });
        }
        if (!matchesCanonical) throw new Error('RULE_AUTOMATIC_ADAPTER_EVENT_INVALID');
        append(event); transaction('COMMIT', 'COMMIT'); return freeze({ status: 'recorded', event_id: event.event_id });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    mintRuleLearningEnrollmentAuthority(input = {}) {
      if (!learningState.config || !exactKeys(input, [])) throw new Error('RULE_LEARNING_AUTHORITY_INVALID');
      const capability = Object.freeze({}); learningEnrollmentCapabilities.set(capability, { state: learningState }); return capability;
    },
    mintRuleLearningReviewerAuthority(input = {}) {
      if (!learningState.config || !exactKeys(input, [])) throw new Error('RULE_LEARNING_AUTHORITY_INVALID');
      const capability = Object.freeze({}); learningReviewerCapabilities.set(capability, { state: learningState }); return capability;
    },
    /** Source-owned canonical ingress. Persisted bytes stay append-only; caller history never grants support. */
    persistAutomaticLearningFinding({ finding_bytes, eligibility } = {}) {
      const parsed = parseCanonicalRuleLearningFindingBytes(finding_bytes); const eligible = validateRuleLearningEligibilityEnvelope(eligibility);
      if (!parsed.ok || !eligible.ok) throw new Error('RULE_AUTOMATIC_LEARNING_UNAVAILABLE');
      const bytes = Buffer.from(parsed.bytes); const eligibilityBytes = Buffer.from(JSON.stringify(eligible.value), 'utf8'); const digest = findingDigest(parsed.value);
      const prior = db.prepare('SELECT finding_digest,finding_bytes,eligibility_bytes FROM rule_learning_finding_history WHERE finding_id = ? OR completed_run_id = ? OR retry_family_id = ?').all(parsed.value.finding_id, parsed.value.completed_run_id, eligible.value.retry_family_id);
      if (prior.length) {
        const exact = prior.find((row) => row.finding_digest === digest && Buffer.from(row.finding_bytes).equals(bytes) && Buffer.from(row.eligibility_bytes).equals(eligibilityBytes));
        if (exact) return freeze({ status: 'existing', finding_digest: digest });
        throw new Error('RULE_AUTOMATIC_LEARNING_CONFLICT');
      }
      if (!automaticFindingCurrent(learningState, parsed.value, eligible.value)) throw new Error('RULE_AUTOMATIC_LEARNING_UNAVAILABLE');
      db.exec('BEGIN IMMEDIATE');
      try {
        const rows = db.prepare('SELECT finding_digest, finding_id, completed_run_id, project_scope_id, repository_identity, finding_bytes, eligibility_bytes, retry_family_id FROM rule_learning_finding_history WHERE finding_digest = ? OR finding_id = ? OR completed_run_id = ? OR retry_family_id = ? OR (project_scope_id = ? AND repository_identity = ? AND finding_digest <> ?)').all(digest, parsed.value.finding_id, parsed.value.completed_run_id, eligible.value.retry_family_id, parsed.value.project_scope_id, parsed.value.repository_identity, digest);
        const exact = rows.find((row) => row.finding_digest === digest);
        if (exact && Buffer.from(exact.finding_bytes).equals(bytes) && Buffer.from(exact.eligibility_bytes).equals(eligibilityBytes)) { db.exec('COMMIT'); return freeze({ status: 'existing', finding_digest: digest }); }
        if (rows.length) throw new Error('RULE_AUTOMATIC_LEARNING_CONFLICT');
        db.prepare('INSERT INTO rule_learning_finding_history (finding_digest,finding_id,completed_run_id,project_scope_id,repository_identity,finding_bytes,eligibility_bytes,retry_family_id,evaluator_host_id,enrollment_digest,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(digest, parsed.value.finding_id, parsed.value.completed_run_id, parsed.value.project_scope_id, parsed.value.repository_identity, bytes, eligibilityBytes, eligible.value.retry_family_id, eligible.value.evaluator_host_id, eligible.value.enrollment_digest, parsed.value.occurred_at);
        db.exec('COMMIT'); return freeze({ status: 'persisted', finding_digest: digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    /** Opaque read grant. Project grant sees exact scope only; global grant remains separate domain. */
    mintAutomaticLearningHistoryCapability({ tier, scope_id } = {}) {
      const scope = automaticScope(tier, scope_id); if (scope === null || learningState.closed) throw new Error('RULE_AUTOMATIC_LEARNING_HISTORY_UNAVAILABLE');
      const capability = Object.freeze({}); automaticLearningHistoryCapabilities.set(capability, { state: learningState, tier, scope }); return capability;
    },
    readAutomaticLearningHistory({ capability } = {}) {
      const bound = automaticLearningHistoryCapabilities.get(capability); if (!bound || bound.state !== learningState || learningState.closed) return null;
      const rows = bound.tier === 'project' ? db.prepare('SELECT finding_bytes, eligibility_bytes FROM rule_learning_finding_history WHERE project_scope_id = ? ORDER BY finding_digest').all(bound.scope) : db.prepare('SELECT finding_bytes, eligibility_bytes FROM rule_learning_finding_history ORDER BY finding_digest').all();
      const findings = [];
      for (const row of rows) {
        const parsed = parseCanonicalRuleLearningFindingBytes(Buffer.from(row.finding_bytes)); let eligibility;
        try { eligibility = validateRuleLearningEligibilityEnvelope(JSON.parse(Buffer.from(row.eligibility_bytes).toString('utf8'))); } catch { continue; }
        if (parsed.ok && eligibility.ok && automaticFindingCurrent(learningState, parsed.value, eligibility.value)) findings.push(freeze({ digest: findingDigest(parsed.value), finding: parsed.value, eligibility: eligibility.value }));
      }
      return freeze({ tier: bound.tier, scope_id: bound.tier === 'global' ? 'pidex-global' : bound.scope, findings: freeze(findings) });
    },
    /** Durable pre-dispatch work record. Unknown dispatched work always blocks recovery. */
    persistAutomaticLearningWorkIntent(input = {}) {
      if (!validAutomaticWork(input)) throw new Error('RULE_AUTOMATIC_LEARNING_WORK_INVALID');
      if (learningState.config?.reviewers?.configuration_generation !== input.configuration_generation) return freeze({ status: 'blocked_source_fact_drift' });
      const scope = automaticScope(input.tier, input.scope_id); const existing = db.prepare('SELECT tier,scope_id,stage,source_generation,configuration_generation,input_digest,state FROM rule_learning_work_intent WHERE work_id = ?').get(input.work_id);
      if (existing) return existing.tier === input.tier && existing.scope_id === scope && existing.stage === input.stage && existing.source_generation === input.source_generation && existing.configuration_generation === input.configuration_generation && existing.input_digest === input.input_digest ? freeze({ status: existing.state, work_id: input.work_id }) : freeze({ status: 'blocked_durable_conflict' });
      db.prepare("INSERT INTO rule_learning_work_intent (work_id,tier,scope_id,stage,source_generation,configuration_generation,input_digest,state,created_at) VALUES (?,?,?,?,?,?,?,'intent',?)").run(input.work_id, input.tier, scope, input.stage, input.source_generation, input.configuration_generation, input.input_digest, input.now);
      return freeze({ status: 'intent', work_id: input.work_id });
    },
    recordAutomaticLearningWorkDispatch({ work_id, now } = {}) {
      if (!AUTOMATIC_WORK_ID.test(work_id || '') || !validPublicationTime(now)) throw new Error('RULE_AUTOMATIC_LEARNING_WORK_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT state FROM rule_learning_work_intent WHERE work_id = ?').get(work_id);
        if (!row) { db.exec('COMMIT'); return freeze({ status: 'blocked_durable_conflict' }); }
        if (row.state === 'completed') { db.exec('COMMIT'); return freeze({ status: 'completed', work_id }); }
        if (row.state === 'dispatched') { db.exec('COMMIT'); return freeze({ status: 'blocked_recovery_pending', work_id }); }
        const update = db.prepare("UPDATE rule_learning_work_intent SET state = 'dispatched', dispatched_at = ? WHERE work_id = ? AND state = 'intent'").run(now, work_id);
        db.exec('COMMIT'); return freeze({ status: update.changes === 1 ? 'dispatched' : 'blocked_recovery_pending', work_id });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    recordAutomaticLearningWorkResult({ work_id, result_bytes, now } = {}) {
      const bytes = Buffer.isBuffer(result_bytes) || result_bytes instanceof Uint8Array ? Buffer.from(result_bytes) : null; if (!AUTOMATIC_WORK_ID.test(work_id || '') || !bytes || !bytes.length || !validPublicationTime(now)) throw new Error('RULE_AUTOMATIC_LEARNING_WORK_INVALID');
      const resultDigest = createHash('sha256').update(bytes).digest('hex'); db.exec('BEGIN IMMEDIATE');
      try {
        const intent = db.prepare('SELECT state FROM rule_learning_work_intent WHERE work_id = ?').get(work_id); const existing = db.prepare('SELECT result_digest,result_bytes FROM rule_learning_work_result WHERE work_id = ?').get(work_id);
        if (!intent) throw new Error('RULE_AUTOMATIC_LEARNING_WORK_INVALID');
        if (existing && (existing.result_digest !== resultDigest || !Buffer.from(existing.result_bytes).equals(bytes))) throw new Error('RULE_AUTOMATIC_LEARNING_CONFLICT');
        if (!existing) db.prepare('INSERT INTO rule_learning_work_result (work_id,result_digest,result_bytes,recorded_at) VALUES (?,?,?,?)').run(work_id, resultDigest, bytes, now);
        db.prepare("UPDATE rule_learning_work_intent SET state = 'completed' WHERE work_id = ?").run(work_id); db.exec('COMMIT'); return freeze({ status: existing ? 'existing' : 'completed', work_id, result_digest: resultDigest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readAutomaticLearningWorkRecovery(input = {}) {
      if (!validAutomaticWork(input)) return freeze({ status: 'blocked_durable_conflict' }); const scope = automaticScope(input.tier, input.scope_id); const row = db.prepare('SELECT intent.source_generation,intent.configuration_generation,intent.input_digest,intent.state,result.result_digest,result.result_bytes FROM rule_learning_work_intent AS intent LEFT JOIN rule_learning_work_result AS result ON result.work_id = intent.work_id WHERE intent.work_id = ? AND intent.tier = ? AND intent.scope_id = ? AND intent.stage = ?').get(input.work_id, input.tier, scope, input.stage);
      if (!row) return freeze({ status: 'blocked_durable_conflict' });
      if (row.source_generation !== input.source_generation || row.configuration_generation !== input.configuration_generation || row.input_digest !== input.input_digest || learningState.config?.reviewers?.configuration_generation !== input.configuration_generation) return freeze({ status: 'blocked_source_fact_drift' });
      if (row.state === 'completed' && row.result_digest && row.result_bytes) return freeze({ status: 'completed', result_digest: row.result_digest, result_bytes: Buffer.from(row.result_bytes) });
      return freeze({ status: row.state === 'dispatched' ? 'blocked_recovery_pending' : 'resumable' });
    },
    persistAutomaticLearningCandidateResult({ candidate_bytes, now } = {}) {
      const bytes = Buffer.isBuffer(candidate_bytes) || candidate_bytes instanceof Uint8Array ? Buffer.from(candidate_bytes) : null; let candidate; try { candidate = JSON.parse(bytes?.toString('utf8')); } catch {}
      if (!bytes || !validPublicationTime(now) || !validRuleLearningCandidate(candidate) || !Buffer.from(canonicalRuleLearningCandidateBytes(candidate), 'utf8').equals(bytes)) throw new Error('RULE_AUTOMATIC_LEARNING_CANDIDATE_INVALID');
      const scope = automaticScope(candidate.tier, candidate.tier === 'global' ? 'pidex-global' : candidate.rule_id.split(':')[1]); if (scope === null) throw new Error('RULE_AUTOMATIC_LEARNING_CANDIDATE_INVALID'); const existing = db.prepare('SELECT candidate_bytes FROM rule_learning_candidate_result WHERE candidate_digest = ?').get(candidate.candidate_digest);
      if (existing && !Buffer.from(existing.candidate_bytes).equals(bytes)) throw new Error('RULE_AUTOMATIC_LEARNING_CONFLICT'); if (!existing) db.prepare('INSERT INTO rule_learning_candidate_result (candidate_digest,tier,scope_id,candidate_bytes,recorded_at) VALUES (?,?,?,?,?)').run(candidate.candidate_digest, candidate.tier, scope, bytes, now); return freeze({ status: existing ? 'existing' : 'candidate', candidate_digest: candidate.candidate_digest });
    },
    persistAutomaticLearningAdmissionResult({ candidate_digest, admission_bytes, now } = {}) {
      const bytes = Buffer.isBuffer(admission_bytes) || admission_bytes instanceof Uint8Array ? Buffer.from(admission_bytes) : null; if (!validDigest(candidate_digest) || !bytes || !validPublicationTime(now) || !automaticAdmissionValid(bytes, candidate_digest) || !db.prepare('SELECT 1 FROM rule_learning_candidate_result WHERE candidate_digest = ?').get(candidate_digest)) throw new Error('RULE_AUTOMATIC_LEARNING_ADMISSION_INVALID'); const admissionDigest = createHash('sha256').update(bytes).digest('hex'); const existing = db.prepare('SELECT admission_digest,admission_bytes FROM rule_learning_admission_result WHERE candidate_digest = ?').get(candidate_digest);
      if (existing && (existing.admission_digest !== admissionDigest || !Buffer.from(existing.admission_bytes).equals(bytes))) throw new Error('RULE_AUTOMATIC_LEARNING_CONFLICT'); if (!existing) db.prepare('INSERT INTO rule_learning_admission_result (candidate_digest,admission_digest,admission_bytes,recorded_at) VALUES (?,?,?,?)').run(candidate_digest, admissionDigest, bytes, now); return freeze({ status: existing ? 'existing' : 'admitted', candidate_digest, admission_digest: admissionDigest });
    },
    readAutomaticLearningAdmissionResult({ candidate_digest } = {}) {
      if (!validDigest(candidate_digest)) return null; const row = db.prepare('SELECT admission_digest,admission_bytes FROM rule_learning_admission_result WHERE candidate_digest = ?').get(candidate_digest);
      return row && automaticAdmissionValid(Buffer.from(row.admission_bytes), candidate_digest) ? freeze({ admission_digest: row.admission_digest, admission_bytes: Buffer.from(row.admission_bytes) }) : null;
    },
    /** Target is reconstructed from current enrollment only; caller target fields never cross this boundary. */
    mintAutomaticPublicationTargetCapability(input = {}) {
      if (!exactKeys(input, ['candidate_digest', 'admission_digest']) || !validDigest(input.candidate_digest) || !validDigest(input.admission_digest)) throw new Error('RULE_AUTOMATIC_LEARNING_TARGET_UNAVAILABLE');
      const row = db.prepare('SELECT candidate.tier,candidate.scope_id,candidate.candidate_bytes,admission.admission_bytes FROM rule_learning_candidate_result AS candidate JOIN rule_learning_admission_result AS admission ON admission.candidate_digest = candidate.candidate_digest WHERE candidate.candidate_digest = ? AND admission.admission_digest = ?').get(input.candidate_digest, input.admission_digest);
      if (!row || !automaticAdmissionValid(Buffer.from(row.admission_bytes), input.candidate_digest)) throw new Error('RULE_AUTOMATIC_LEARNING_TARGET_UNAVAILABLE');
      let candidate; try { candidate = JSON.parse(Buffer.from(row.candidate_bytes).toString('utf8')); } catch {}
      const configured = learningState.config?.enrollment?.targets?.[row.tier];
      if (!validRuleLearningCandidate(candidate) || !configured || configured.repository !== undefined && typeof configured.repository !== 'string') throw new Error('RULE_AUTOMATIC_LEARNING_TARGET_UNAVAILABLE');
      const capability = Object.freeze({}); automaticPublicationTargetCapabilities.set(capability, { state: learningState, candidate_digest: input.candidate_digest, admission_digest: input.admission_digest }); return capability;
    },
    /** Restart-safe remint checks durable pair again; no prior process capability is trusted. */
    remintAutomaticPublicationTargetCapability(input = {}) {
      return this.mintAutomaticPublicationTargetCapability(input);
    },
    /** Fresh canonical fetch supplies base. Stale or changed enrolled predecessor fails closed. */
    readAutomaticPublicationTarget({ capability, fresh_base } = {}) {
      const bound = automaticPublicationTargetCapabilities.get(capability); if (!bound || bound.state !== learningState || !validHead(fresh_base)) return null;
      const row = db.prepare('SELECT candidate.tier,candidate.scope_id,candidate.candidate_bytes,admission.admission_bytes,admission.admission_digest FROM rule_learning_candidate_result AS candidate JOIN rule_learning_admission_result AS admission ON admission.candidate_digest = candidate.candidate_digest WHERE candidate.candidate_digest = ? AND admission.admission_digest = ?').get(bound.candidate_digest, bound.admission_digest);
      let candidate; try { candidate = JSON.parse(Buffer.from(row?.candidate_bytes || '').toString('utf8')); } catch {}
      const configured = learningState.config?.enrollment?.targets?.[row?.tier]; if (!row || !validRuleLearningCandidate(candidate) || !configured || configured.tier !== row.tier || configured.rule_id !== candidate.rule_id || configured.scope_digest !== candidate.scope_digest || configured.predecessor !== candidate.predecessor_commit) return null;
      const enrolled = db.prepare('SELECT enrollment_digest,allowed_paths_json,predecessor,normalized_remote_digest,branch,author,writer_enabled,trailer_policy,repository_identity_digest,identity_platform,root_identity_digest,parent_identity_digest,files_identity_digest,identity_proof,publication_timestamp FROM publication_enrollment WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(configured.repository, row.scope_id, candidate.rule_id);
      if (!enrolled || enrolled.predecessor !== candidate.predecessor_commit || fresh_base !== enrolled.predecessor.slice('commit:'.length)) return null;
      let allowed_paths; try { allowed_paths = JSON.parse(enrolled.allowed_paths_json); } catch { return null; }
      const writer_authority = { normalized_remote_digest: enrolled.normalized_remote_digest, branch: enrolled.branch, author: enrolled.author, writer_enabled: enrolled.writer_enabled === 1, trailer_policy: enrolled.trailer_policy, repository_identity_digest: enrolled.repository_identity_digest, identity_platform: enrolled.identity_platform, root_identity_digest: enrolled.root_identity_digest, parent_identity_digest: enrolled.parent_identity_digest, files_identity_digest: enrolled.files_identity_digest, identity_proof: enrolled.identity_proof, publication_timestamp: enrolled.publication_timestamp };
      const target = { repository: configured.repository, tier: row.tier, scope_id: row.tier === 'global' ? 'pidex-global' : row.scope_id, scope_digest: candidate.scope_digest, rule_id: candidate.rule_id, predecessor: enrolled.predecessor, enrollment_digest: enrolled.enrollment_digest, allowed_paths, writer_authority };
      return validPublicationTarget(target) ? freeze({ target: freeze(target), expected_base: fresh_base, candidate_bytes: Buffer.from(row.candidate_bytes), admission_bytes: Buffer.from(row.admission_bytes) }) : null;
    },
    enroll({ repository, scope_id = null, remote, branch } = {}) {
      if (![repository, remote, branch].every((value) => typeof value === 'string' && value)) throw new Error('RULE_LIFECYCLE_ENROLLMENT_INVALID');
      const existing = db.prepare('SELECT scope_id, remote, branch FROM repository_enrollment WHERE repository = ?').get(repository);
      if (existing && (existing.scope_id !== scopeKey(scope_id) || existing.remote !== remote || existing.branch !== branch)) throw new Error('RULE_LIFECYCLE_ENROLLMENT_CONFLICT');
      db.prepare('INSERT OR IGNORE INTO repository_enrollment (repository, scope_id, remote, branch) VALUES (?, ?, ?, ?)').run(repository, scopeKey(scope_id), remote, branch);
    },
    enrollPublicationTarget(target = {}) {
      if (!validPublicationTarget(target)) throw new Error('RULE_PUBLICATION_ENROLLMENT_INVALID');
      const scope = externalPublicationScope(target.scope_id); const paths = canonical(target.allowed_paths);
      db.exec('BEGIN IMMEDIATE');
      try {
        const repositoryEnrollment = db.prepare('SELECT scope_id, branch FROM repository_enrollment WHERE repository = ?').get(target.repository);
        if (!repositoryEnrollment || repositoryEnrollment.scope_id !== scope || repositoryEnrollment.branch !== target.writer_authority.branch) throw new Error('RULE_PUBLICATION_ENROLLMENT_INVALID');
        const duplicateIdentity = db.prepare('SELECT repository FROM publication_enrollment WHERE repository_identity_digest = ? AND repository <> ? LIMIT 1').get(target.writer_authority.repository_identity_digest, target.repository);
        if (duplicateIdentity) throw new Error('RULE_PUBLICATION_ENROLLMENT_CONFLICT');
        const existing = db.prepare('SELECT enrollment_digest, allowed_paths_json, predecessor, normalized_remote_digest, branch, author, writer_enabled, trailer_policy, repository_identity_digest, identity_platform, root_identity_digest, parent_identity_digest, files_identity_digest, identity_proof, publication_timestamp FROM publication_enrollment WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(target.repository, scope, target.rule_id);
        const authority = canonical(target.writer_authority);
        if (existing && (existing.enrollment_digest !== target.enrollment_digest || existing.allowed_paths_json !== paths || existing.predecessor !== target.predecessor || canonical({ normalized_remote_digest: existing.normalized_remote_digest, branch: existing.branch, author: existing.author, writer_enabled: existing.writer_enabled === 1, trailer_policy: existing.trailer_policy, repository_identity_digest: existing.repository_identity_digest, identity_platform: existing.identity_platform, root_identity_digest: existing.root_identity_digest, parent_identity_digest: existing.parent_identity_digest, files_identity_digest: existing.files_identity_digest, identity_proof: existing.identity_proof, publication_timestamp: existing.publication_timestamp }) !== authority)) throw new Error('RULE_PUBLICATION_ENROLLMENT_CONFLICT');
        if (!existing) db.prepare('INSERT INTO publication_enrollment (repository, scope_id, rule_id, enrollment_digest, allowed_paths_json, predecessor, normalized_remote_digest, branch, author, writer_enabled, trailer_policy, repository_identity_digest, identity_platform, root_identity_digest, parent_identity_digest, files_identity_digest, identity_proof, publication_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(target.repository, scope, target.rule_id, target.enrollment_digest, paths, target.predecessor, target.writer_authority.normalized_remote_digest, target.writer_authority.branch, target.writer_authority.author, 1, target.writer_authority.trailer_policy, target.writer_authority.repository_identity_digest, target.writer_authority.identity_platform, target.writer_authority.root_identity_digest, target.writer_authority.parent_identity_digest, target.writer_authority.files_identity_digest, target.writer_authority.identity_proof, target.writer_authority.publication_timestamp);
        db.exec('COMMIT'); return freeze({ status: existing ? 'existing' : 'enrolled', repository: target.repository, scope_id: target.scope_id, rule_id: target.rule_id });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    preparePublicationTransaction(record = {}) {
      if (!validPublicationTarget(record?.target)) throw new Error('RULE_PUBLICATION_ENROLLMENT_INVALID');
      if (!validPublicationRecord(record)) throw new Error('RULE_PUBLICATION_TRANSACTION_INVALID');
      const scope = externalPublicationScope(record.target.scope_id); const targetPaths = canonical(record.target.allowed_paths);
      db.exec('BEGIN IMMEDIATE');
      try {
        const enrollment = db.prepare('SELECT enrollment_digest, allowed_paths_json, predecessor, normalized_remote_digest, branch, author, writer_enabled, trailer_policy, repository_identity_digest, identity_platform, root_identity_digest, parent_identity_digest, files_identity_digest, identity_proof, publication_timestamp FROM publication_enrollment WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(record.target.repository, scope, record.target.rule_id);
        const enrolledAuthority = enrollment && { normalized_remote_digest: enrollment.normalized_remote_digest, branch: enrollment.branch, author: enrollment.author, writer_enabled: enrollment.writer_enabled === 1, trailer_policy: enrollment.trailer_policy, repository_identity_digest: enrollment.repository_identity_digest, identity_platform: enrollment.identity_platform, root_identity_digest: enrollment.root_identity_digest, parent_identity_digest: enrollment.parent_identity_digest, files_identity_digest: enrollment.files_identity_digest, identity_proof: enrollment.identity_proof, publication_timestamp: enrollment.publication_timestamp };
        if (!enrollment || !validWriterAuthority(enrolledAuthority) || enrollment.enrollment_digest !== record.target.enrollment_digest || enrollment.allowed_paths_json !== targetPaths || enrollment.predecessor !== record.target.predecessor || canonical(enrolledAuthority) !== canonical(record.target.writer_authority) || record.target.predecessor !== `commit:${record.expected_base}`) throw new Error('RULE_PUBLICATION_ENROLLMENT_INVALID');
        const existing = db.prepare('SELECT * FROM publication_transaction WHERE idempotency_key = ?').get(record.idempotency_key);
        if (existing) {
          const exact = existing.repository === record.target.repository && existing.scope_id === scope && existing.rule_id === record.target.rule_id && existing.enrollment_digest === record.target.enrollment_digest && existing.allowed_paths_json === targetPaths && existing.expected_base === record.expected_base && existing.candidate_digest === record.candidate_digest && Buffer.from(existing.candidate_bytes).equals(record.candidate_bytes) && existing.admission_digest === record.admission_digest && Buffer.from(existing.admission_bytes).equals(record.admission_bytes);
          if (!exact) throw new Error('RULE_PUBLICATION_TRANSACTION_CONFLICT');
          bindManualPublicationTransaction(db, record, scope);
          db.exec('COMMIT'); return freeze({ status: 'existing', state: existing.state, idempotency_key: record.idempotency_key });
        }
        db.prepare('INSERT INTO publication_transaction (idempotency_key,repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,expected_base,candidate_digest,candidate_bytes,admission_digest,admission_bytes,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(record.idempotency_key, record.target.repository, scope, record.target.rule_id, record.target.enrollment_digest, targetPaths, record.expected_base, record.candidate_digest, record.candidate_bytes, record.admission_digest, record.admission_bytes, 'prepared', record.created_at, record.created_at);
        bindManualPublicationTransaction(db, record, scope);
        record.fault?.('after_row');
        db.prepare('INSERT INTO publication_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,?,NULL,?)').run(record.idempotency_key, 'prepared', record.created_at);
        record.fault?.('after_event');
        db.exec('COMMIT'); return freeze({ status: 'prepared', state: 'prepared', idempotency_key: record.idempotency_key, scope_id: record.target.scope_id });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    commitLocalPublicationTransaction({ idempotency_key, commit, parent, tree_digest, staged_member_digests, created_at } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !validHead(commit) || !validHead(parent) || commit === parent || !validDigest(tree_digest) || !staged_member_digests || typeof staged_member_digests !== 'object' || Array.isArray(staged_member_digests) || !Object.keys(staged_member_digests).every((key) => PUBLICATION_PATH.test(key) && validDigest(staged_member_digests[key])) || !validPublicationTime(created_at)) throw new Error('RULE_PUBLICATION_LOCAL_COMMIT_INVALID');
      const staged = canonical(staged_member_digests); db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT state, expected_base, allowed_paths_json, local_commit, local_parent, local_tree_digest, staged_member_digests_json FROM publication_transaction WHERE idempotency_key = ?').get(idempotency_key);
        let allowed; try { allowed = JSON.parse(row?.allowed_paths_json); } catch {}
        if (!row || row.expected_base !== parent || !Array.isArray(allowed) || canonical(Object.keys(staged_member_digests).sort()) !== canonical([...allowed].sort())) throw new Error('RULE_PUBLICATION_LOCAL_COMMIT_INVALID');
        if (row.state === 'committed_local') { if (row.local_commit !== commit || row.local_parent !== parent || row.local_tree_digest !== tree_digest || row.staged_member_digests_json !== staged) throw new Error('RULE_PUBLICATION_TRANSACTION_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', state: row.state, idempotency_key }); }
        if (row.state !== 'prepared') throw new Error('RULE_PUBLICATION_TRANSACTION_TERMINAL');
        db.prepare('UPDATE publication_transaction SET state = ?, local_commit = ?, local_parent = ?, local_tree_digest = ?, staged_member_digests_json = ?, updated_at = ? WHERE idempotency_key = ?').run('committed_local', commit, parent, tree_digest, staged, created_at, idempotency_key);
        db.prepare('INSERT INTO publication_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,?,NULL,?)').run(idempotency_key, 'committed_local', created_at);
        db.exec('COMMIT'); return freeze({ status: 'committed_local', state: 'committed_local', idempotency_key });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    attestPublicationRemoteProof({ idempotency_key, receipt, publication_proof, adapter } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !validAcceptedReceipt(receipt) || !publication_proof || typeof adapter?.fetchEnrolledBranch !== 'function' || typeof adapter?.inspectCommit !== 'function') throw new Error('RULE_PUBLICATION_PROOF_CAPABILITY_INVALID');
      const facts = this.readPublicationWriterFacts({ idempotency_key });
      if (!facts || facts.state !== 'committed_local' || facts.local_stop_active || facts.local_parent !== facts.expected_base || !facts.staged_member_digests || receipt.repository_identity !== facts.writer_authority.repository_identity_digest || receipt.scope_id !== facts.target.scope_id || receipt.rule_id !== facts.target.rule_id || receipt.predecessor_commit !== facts.expected_base || receipt.accepted_commit !== facts.local_commit || receipt.tree_digest !== facts.local_tree_digest || receipt.admission_digest !== facts.admission_digest || receipt.transaction_digest !== idempotency_key.slice(3)) throw new Error('RULE_PUBLICATION_PROOF_CAPABILITY_INVALID');
      let fresh;
      const boundedAdapter = Object.freeze({ fetchEnrolledBranch: (enrollment) => { fresh = adapter.fetchEnrolledBranch(enrollment); return fresh; }, inspectCommit: (commit) => adapter.inspectCommit(commit) });
      let verified;
      try { verified = verifyAcceptedRemoteDescendantProof({ receipt, enrollment: { repository_identity: facts.writer_authority.repository_identity_digest, normalized_remote_digest: facts.writer_authority.normalized_remote_digest, branch: facts.writer_authority.branch, author: facts.writer_authority.author, allowed_paths: facts.target.allowed_paths }, durable: { predecessor_commit: facts.expected_base, accepted_commit: facts.local_commit, tree_digest: facts.local_tree_digest, staged_member_digests: facts.staged_member_digests, admission_digest: facts.admission_digest, transaction_digest: idempotency_key.slice(3), rule_id: facts.target.rule_id, tier: facts.target.tier }, adapter: boundedAdapter }); } catch { throw new Error('RULE_PUBLICATION_PROOF_CAPABILITY_INVALID'); }
      if (!fresh || canonical(publication_proof) !== canonical({ containing_head: fresh.containing_head, entries: fresh.entries, predecessor_boundary: fresh.predecessor_boundary })) throw new Error('RULE_PUBLICATION_PROOF_CAPABILITY_INVALID');
      const capability = Object.freeze({}); publicationProofCapabilities.set(capability, { store: learningState, idempotency_key, receipt_digest: createHash('sha256').update(canonical(receipt)).digest('hex'), proof_digest: createHash('sha256').update(canonical(publication_proof)).digest('hex'), accepted_commit: verified.accepted_commit, containing_head: verified.containing_head, containing_tree_digest: verified.containing_tree_digest, consumed: false }); return capability;
    },
    acceptRemotePublicationTransaction({ idempotency_key, receipt, publication_proof, proof_capability, created_at, fault } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !validAcceptedReceipt(receipt) || !validPublicationTime(created_at) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
      const receipt_json = canonical(receipt); const receipt_digest = createHash('sha256').update(receipt_json).digest('hex');
      const proof = publication_proof === undefined ? { containing_head: receipt.accepted_commit, entries: [{ commit_oid: receipt.accepted_commit, parent_oids: [receipt.predecessor_commit], tree_oid: receipt.accepted_commit }], predecessor_boundary: receipt.predecessor_commit } : publication_proof;
      if (!exactKeys(proof, ['containing_head', 'entries', 'predecessor_boundary']) || !validHead(proof.containing_head) || !validHead(proof.predecessor_boundary) || proof.predecessor_boundary !== receipt.predecessor_commit || !Array.isArray(proof.entries) || proof.entries.length < 1 || proof.entries.length > 65 || proof.entries[0]?.commit_oid !== proof.containing_head || proof.entries.at(-1)?.commit_oid !== receipt.accepted_commit || proof.entries.at(-1)?.parent_oids?.[0] !== proof.predecessor_boundary || proof.entries.some((entry, index) => !exactKeys(entry, ['commit_oid', 'parent_oids', 'tree_oid']) || !validHead(entry.commit_oid) || !validHead(entry.tree_oid) || !Array.isArray(entry.parent_oids) || entry.parent_oids.length !== 1 || !validHead(entry.parent_oids[0]) || (index && proof.entries[index - 1].parent_oids[0] !== entry.commit_oid) || proof.entries.findIndex((candidate) => candidate.commit_oid === entry.commit_oid) !== index)) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
      const proof_json = canonical(proof); const proof_digest = createHash('sha256').update(proof_json).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT tx.state, tx.repository, tx.scope_id, tx.rule_id, tx.expected_base, tx.admission_digest, tx.local_commit, tx.local_parent, tx.local_tree_digest, tx.staged_member_digests_json, accepted.receipt_digest, accepted.receipt_json, en.repository_identity_digest FROM publication_transaction AS tx JOIN publication_enrollment AS en ON en.repository = tx.repository AND en.scope_id = tx.scope_id AND en.rule_id = tx.rule_id LEFT JOIN publication_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key WHERE tx.idempotency_key = ?').get(idempotency_key);
        if (!row) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
        if (row.state === 'accepted_remote') { if (row.receipt_digest !== receipt_digest || row.receipt_json !== receipt_json || canonical(publication_proof) !== canonical(this.readPublicationHandoffHeadProofs({ idempotency_key }).at(-1))) throw new Error('RULE_PUBLICATION_TRANSACTION_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', state: row.state, idempotency_key, receipt_digest }); }
        const proof_capability_record = publicationProofCapabilities.get(proof_capability);
        if (!proof_capability_record || proof_capability_record.store !== learningState || proof_capability_record.consumed || proof_capability_record.idempotency_key !== idempotency_key || proof_capability_record.receipt_digest !== receipt_digest || proof_capability_record.proof_digest !== proof_digest || proof_capability_record.accepted_commit !== receipt.accepted_commit || proof_capability_record.containing_head !== proof.containing_head) throw new Error('RULE_PUBLICATION_PROOF_CAPABILITY_INVALID');
        proof_capability_record.consumed = true;
        if (PUBLICATION_TERMINALS.has(row.state) || row.receipt_digest) throw new Error('RULE_PUBLICATION_TRANSACTION_CONFLICT');
        let staged; try { staged = JSON.parse(row.staged_member_digests_json); } catch { throw new Error('RULE_PUBLICATION_RECEIPT_INVALID'); }
        const rulePath = acceptedReceiptRulePath(row.rule_id, row.scope_id);
        const matches = row.state === 'committed_local' && validHead(row.local_commit) && row.local_parent === row.expected_base && validDigest(row.local_tree_digest) && validPublicationStagedMemberDigests(staged, JSON.parse(db.prepare('SELECT allowed_paths_json FROM publication_transaction WHERE idempotency_key = ?').get(idempotency_key).allowed_paths_json)) && receipt.repository_identity === row.repository_identity_digest && receipt.scope_id === outwardPublicationScope(row.scope_id) && receipt.rule_id === row.rule_id && receipt.predecessor_commit === row.expected_base && receipt.accepted_commit === row.local_commit && receipt.tree_digest === row.local_tree_digest && receipt.content_hash === staged[rulePath] && receipt.admission_digest === row.admission_digest && receipt.transaction_digest === idempotency_key.slice(3);
        if (!matches) throw new Error('RULE_PUBLICATION_RECEIPT_INVALID');
        db.prepare('INSERT INTO publication_accepted_receipt (idempotency_key, receipt_digest, receipt_json) VALUES (?, ?, ?)').run(idempotency_key, receipt_digest, receipt_json);
        fault?.('after_receipt');
        db.prepare('INSERT INTO publication_handoff_head_proof (receipt_digest, transaction_digest, containing_head, proof_digest, proof_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(receipt_digest, receipt.transaction_digest, proof.containing_head, proof_digest, proof_json, created_at);
        fault?.('after_proof');
        const accepted_payload = canonical({ accepted_commit: receipt.accepted_commit, containing_head: proof.containing_head }); const accepted_payload_digest = createHash('sha256').update(accepted_payload).digest('hex');
        db.prepare('INSERT INTO publication_handoff_stage_event (receipt_digest, transaction_digest, stage, payload_digest, created_at) VALUES (?, ?, ?, ?, ?)').run(receipt_digest, receipt.transaction_digest, 'receipt_accepted', accepted_payload_digest, created_at);
        fault?.('after_stage_event');
        db.prepare('INSERT INTO publication_handoff_stage_current (receipt_digest, transaction_digest, stage, payload_digest, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(receipt_digest, receipt.transaction_digest, 'receipt_accepted', accepted_payload_digest, accepted_payload, created_at);
        fault?.('after_stage_current');
        db.prepare("UPDATE publication_transaction SET state = 'accepted_remote', terminal_reason = 'verified_remote', updated_at = ? WHERE idempotency_key = ?").run(created_at, idempotency_key);
        fault?.('after_state');
        db.prepare("INSERT INTO publication_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,'accepted_remote','verified_remote',?)").run(idempotency_key, created_at);
        fault?.('after_terminal_event');
        fault?.('after_event');
        db.exec('COMMIT'); return freeze({ status: 'accepted_remote', state: 'accepted_remote', idempotency_key, receipt_digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readPublicationAcceptedReceipt({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const row = db.prepare("SELECT receipt_digest, receipt_json FROM publication_accepted_receipt AS accepted JOIN publication_transaction AS tx ON tx.idempotency_key = accepted.idempotency_key WHERE accepted.idempotency_key = ? AND tx.state = 'accepted_remote'").get(idempotency_key);
      if (!row) return undefined; let receipt; try { receipt = JSON.parse(row.receipt_json); } catch { return undefined; }
      return validAcceptedReceipt(receipt) && createHash('sha256').update(canonical(receipt)).digest('hex') === row.receipt_digest ? freeze(receipt) : undefined;
    },
    readPublicationHandoffHeadProofs({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return freeze([]);
      const receipt = this.readPublicationAcceptedReceipt({ idempotency_key }); if (!receipt) return freeze([]);
      const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
      const rows = db.prepare('SELECT containing_head, proof_digest, proof_json FROM publication_handoff_head_proof WHERE receipt_digest = ? AND transaction_digest = ? ORDER BY rowid').all(receipt_digest, receipt.transaction_digest);
      const proofs = rows.map((row) => { let proof; try { proof = JSON.parse(row.proof_json); } catch { return null; } return createHash('sha256').update(canonical(proof)).digest('hex') === row.proof_digest ? proof : null; });
      return freeze(proofs.filter(Boolean));
    },
    readPublicationHandoffStage({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const receipt = this.readPublicationAcceptedReceipt({ idempotency_key }); if (!receipt) return undefined;
      const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
      const row = db.prepare('SELECT stage, payload_digest, payload_json, updated_at FROM publication_handoff_stage_current WHERE receipt_digest = ? AND transaction_digest = ?').get(receipt_digest, receipt.transaction_digest);
      if (!row) return freeze({ status: 'stage_incomplete', receipt_digest });
      let payload; try { payload = JSON.parse(row.payload_json); } catch { return freeze({ status: 'stage_incomplete', receipt_digest }); }
      if (!HANDOFF_STAGES.includes(row.stage) || createHash('sha256').update(canonical(payload)).digest('hex') !== row.payload_digest) return freeze({ status: 'stage_incomplete', receipt_digest });
      return freeze({ status: 'verified', receipt_digest, stage: row.stage, payload: freeze(payload), payload_digest: row.payload_digest, updated_at: row.updated_at });
    },
    advancePublicationHandoffStage({ idempotency_key, stage, payload, created_at, fault } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !HANDOFF_STAGES.includes(stage) || !validPublicationTime(created_at) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_PUBLICATION_HANDOFF_STAGE_INVALID');
      const safeKeys = ['accepted_commit', 'containing_head', 'containing_tree_digest', 'bundle_digest', 'manifest_digest', 'member', 'projection_digest', 'target_epoch', 'context_digest', 'render_digest', 'activation_epoch'];
      const base = payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).includes('accepted_commit') && Object.keys(payload).includes('containing_head') && Object.keys(payload).every((key) => safeKeys.includes(key));
      const memberValid = payload?.member === undefined || (exactKeys(payload.member, HANDOFF_MEMBER_KEYS) && typeof payload.member.rule_id === 'string' && PUBLICATION_RULE.test(payload.member.rule_id) && PUBLICATION_PATH.test(payload.member.path) && validDigest(payload.member.content_hash));
      const targetEpochValid = payload?.target_epoch === undefined || (exactKeys(payload.target_epoch, HANDOFF_TARGET_EPOCH_KEYS) && validDigest(payload.target_epoch.repository_digest) && typeof payload.target_epoch.scope_id === 'string' && (payload.target_epoch.scope_id === 'pidex-global' || PUBLICATION_SCOPE.test(payload.target_epoch.scope_id)) && typeof payload.target_epoch.rule_id === 'string' && PUBLICATION_RULE.test(payload.target_epoch.rule_id) && validDigest(payload.target_epoch.rule_version) && typeof payload.target_epoch.activation_epoch === 'string' && payload.target_epoch.activation_epoch.startsWith('epoch:'));
      const digestsValid = ['containing_tree_digest', 'bundle_digest', 'manifest_digest', 'projection_digest', 'context_digest', 'render_digest'].every((key) => payload?.[key] === undefined || payload[key] === null || validDigest(payload[key]));
      if (!base || !validHead(payload.accepted_commit) || !validHead(payload.containing_head) || !memberValid || !targetEpochValid || !digestsValid || (payload?.activation_epoch !== undefined && (typeof payload.activation_epoch !== 'string' || !payload.activation_epoch.startsWith('epoch:')))) throw new Error('RULE_PUBLICATION_HANDOFF_STAGE_INVALID');
      const payload_json = canonical(payload); const payload_digest = createHash('sha256').update(payload_json).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const receipt = this.readPublicationAcceptedReceipt({ idempotency_key }); if (!receipt) throw new Error('RULE_PUBLICATION_HANDOFF_STAGE_INCOMPLETE');
        const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
        if (payload.accepted_commit !== receipt.accepted_commit || payload.containing_head === receipt.predecessor_commit) throw new Error('RULE_PUBLICATION_HANDOFF_STAGE_INVALID');
        const current = db.prepare('SELECT stage, payload_digest FROM publication_handoff_stage_current WHERE receipt_digest = ? AND transaction_digest = ?').get(receipt_digest, receipt.transaction_digest);
        if (!current) throw new Error('RULE_PUBLICATION_HANDOFF_STAGE_INCOMPLETE');
        if (current.stage === stage) { if (current.payload_digest !== payload_digest) throw new Error('RULE_PUBLICATION_HANDOFF_STAGE_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', stage, receipt_digest, payload_digest }); }
        if (HANDOFF_STAGES.indexOf(stage) !== HANDOFF_STAGES.indexOf(current.stage) + 1) throw new Error('RULE_PUBLICATION_HANDOFF_STAGE_TRANSITION_INVALID');
        db.prepare('INSERT INTO publication_handoff_stage_event (receipt_digest, transaction_digest, stage, payload_digest, created_at) VALUES (?, ?, ?, ?, ?)').run(receipt_digest, receipt.transaction_digest, stage, payload_digest, created_at);
        fault?.('after_event');
        db.prepare('UPDATE publication_handoff_stage_current SET stage = ?, payload_digest = ?, payload_json = ?, updated_at = ? WHERE receipt_digest = ? AND transaction_digest = ?').run(stage, payload_digest, payload_json, created_at, receipt_digest, receipt.transaction_digest);
        fault?.('after_current'); db.exec('COMMIT'); return freeze({ status: 'advanced', stage, receipt_digest, payload_digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readPublicationReceiptIntegrity({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const row = db.prepare('SELECT tx.state, accepted.receipt_digest FROM publication_transaction AS tx LEFT JOIN publication_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key WHERE tx.idempotency_key = ?').get(idempotency_key);
      if (!row) return undefined;
      return freeze({ status: row.state === 'accepted_remote' ? (this.readPublicationAcceptedReceipt({ idempotency_key }) ? 'verified' : 'receipt_incomplete') : 'not_accepted', receipt_digest: row.receipt_digest || null });
    },
    readPublicationReceiptIntegritySummary({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const transaction = db.prepare('SELECT state FROM publication_transaction WHERE idempotency_key = ?').get(idempotency_key);
      if (!transaction || transaction.state !== 'accepted_remote') return freeze({ status: 'not_accepted', invalid_count: 0, categories: freeze([]) });
      const categories = [];
      const accepted = db.prepare('SELECT receipt_digest, receipt_json FROM publication_accepted_receipt WHERE idempotency_key = ?').get(idempotency_key);
      if (!accepted) categories.push('receipt_missing');
      else {
        let receipt;
        try { receipt = JSON.parse(accepted.receipt_json); } catch { categories.push('malformed_receipt_json'); }
        if (receipt && !validAcceptedReceipt(receipt)) categories.push('invalid_receipt');
        if (receipt && createHash('sha256').update(canonical(receipt)).digest('hex') !== accepted.receipt_digest) categories.push('receipt_digest_mismatch');
      }
      const proofs = db.prepare('SELECT proof_digest, proof_json FROM publication_handoff_head_proof WHERE transaction_digest = ?').all(idempotency_key.slice(3));
      if (!proofs.length) categories.push('proof_missing');
      for (const proofRow of proofs) {
        let proof;
        try { proof = JSON.parse(proofRow.proof_json); } catch { categories.push('malformed_proof_json'); }
        if (proof && createHash('sha256').update(canonical(proof)).digest('hex') !== proofRow.proof_digest) categories.push('proof_digest_mismatch');
      }
      const distinct = freeze([...new Set(categories)].sort());
      return freeze({ status: distinct.length ? 'invalid' : 'verified', invalid_count: distinct.length, categories: distinct });
    },
    readPublicationReceiptIntegrityCount() {
      const accepted_remote = db.prepare("SELECT COUNT(*) AS count FROM publication_transaction WHERE state = 'accepted_remote'").get().count;
      const receipt_incomplete = db.prepare("SELECT COUNT(*) AS count FROM publication_transaction AS tx LEFT JOIN publication_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key WHERE tx.state = 'accepted_remote' AND accepted.idempotency_key IS NULL").get().count;
      return freeze({ accepted_remote, receipt_incomplete });
    },
    appendPublicationTerminal({ idempotency_key, state, reason_code, created_at } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !PUBLICATION_TERMINALS.has(state) || state === 'accepted_remote' || typeof reason_code !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(reason_code) || !validPublicationTime(created_at)) throw new Error('RULE_PUBLICATION_TERMINAL_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT state, terminal_reason FROM publication_transaction WHERE idempotency_key = ?').get(idempotency_key);
        if (!row) throw new Error('RULE_PUBLICATION_TERMINAL_INVALID');
        if (PUBLICATION_TERMINALS.has(row.state)) { if (row.state !== state || row.terminal_reason !== reason_code) throw new Error('RULE_PUBLICATION_TRANSACTION_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', state: row.state, idempotency_key }); }
        if ((row.state === 'prepared' && !['rejected_policy', 'abandoned'].includes(state)) || (row.state !== 'prepared' && row.state !== 'committed_local')) throw new Error('RULE_PUBLICATION_TRANSACTION_TERMINAL');
        db.prepare('UPDATE publication_transaction SET state = ?, terminal_reason = ?, updated_at = ? WHERE idempotency_key = ?').run(state, reason_code, created_at, idempotency_key);
        db.prepare('INSERT INTO publication_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,?,?,?)').run(idempotency_key, state, reason_code, created_at);
        db.exec('COMMIT'); return freeze({ status: state, state, idempotency_key });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readPublicationTransaction({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const row = db.prepare('SELECT tx.idempotency_key, tx.repository, tx.scope_id, tx.rule_id, tx.candidate_digest, tx.admission_digest, tx.expected_base, tx.state, tx.terminal_reason, accepted.receipt_digest FROM publication_transaction AS tx LEFT JOIN publication_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key WHERE tx.idempotency_key = ?').get(idempotency_key);
      const receipt = row?.state === 'accepted_remote' ? freeze({ status: this.readPublicationAcceptedReceipt({ idempotency_key }) ? 'accepted_remote' : 'receipt_incomplete', receipt_digest: row.receipt_digest || null }) : null;
      return row ? freeze({ state: row.state, idempotency_key: row.idempotency_key, repository_digest: digest(row.repository), scope_id: outwardPublicationScope(row.scope_id), rule_id: row.rule_id, candidate_digest: row.candidate_digest, admission_digest: row.admission_digest, expected_base: row.expected_base, terminal: PUBLICATION_TERMINALS.has(row.state) ? freeze({ state: row.state, reason_code: row.terminal_reason }) : null, receipt }) : undefined;
    },
    /** Narrow read seam for sanitized publication status only; never returns candidate/admission bytes, repository, path, source, votes, findings, or error text. */
    listPublicationStatusFacts() {
      const rows = db.prepare('SELECT tx.idempotency_key, tx.scope_id, tx.rule_id, tx.state, tx.terminal_reason, tx.candidate_bytes, tx.admission_digest, tx.expected_base, tx.local_tree_digest, tx.created_at, tx.updated_at, accepted.receipt_digest, accepted.receipt_json, stop.reason_code AS local_stop_reason FROM publication_transaction AS tx LEFT JOIN publication_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key LEFT JOIN local_narrowing AS stop ON stop.repository = tx.repository AND stop.scope_id = tx.scope_id AND stop.rule_id = tx.rule_id ORDER BY tx.idempotency_key').all();
      return freeze(rows.map((row) => {
        const transaction_digest = row.idempotency_key?.slice(3); let receipt; try { receipt = JSON.parse(row.receipt_json); } catch {}
        const receipt_valid = row.state === 'accepted_remote' && validAcceptedReceipt(receipt) && receipt.transaction_digest === transaction_digest && createHash('sha256').update(canonical(receipt)).digest('hex') === row.receipt_digest && this.readPublicationReceiptIntegritySummary({ idempotency_key: row.idempotency_key }).status === 'verified';
        const stage = receipt_valid ? this.readPublicationHandoffStage({ idempotency_key: row.idempotency_key }) : undefined;
        const projection = receipt_valid ? this.readProjection({ repository: db.prepare('SELECT repository FROM publication_transaction WHERE idempotency_key = ?').get(row.idempotency_key).repository, scope_id: row.scope_id || null }) : undefined;
        const entry = projection?.entries?.find((item) => item.rule_id === row.rule_id);
        const epoch = entry?.activation_epoch && projection?.head?.repository_identity ? this.readLifecycleEpoch({ repository: projection.head.repository_identity, scope_id: row.scope_id || null, rule_id: row.rule_id, rule_version: entry.rule_version, activation_epoch: entry.activation_epoch }) : undefined;
        const active_current = receipt_valid && stage?.status === 'verified' && stage.stage === 'status_ready' && entry?.lifecycle_state === 'active' && entry.rule_version === receipt.content_hash && entry.content_hash === receipt.content_hash && entry.accepted_commit === receipt.accepted_commit && epoch?.closed_at === null && projection.accepted_head === stage.payload?.containing_head && stage.payload?.accepted_commit === receipt.accepted_commit && stage.payload?.member?.rule_id === row.rule_id && stage.payload.member.content_hash === receipt.content_hash && stage.payload?.target_epoch?.activation_epoch === entry.activation_epoch;
        let policy_digest = null; try { const candidate = JSON.parse(Buffer.from(row.candidate_bytes).toString('utf8')); policy_digest = validDigest(candidate?.admission_policy_digest) ? candidate.admission_policy_digest : null; } catch {}
        const refinement_pending = db.prepare("SELECT 1 FROM manual_refinement_request WHERE transaction_digest = ? AND status IN ('open','imported','admitted') LIMIT 1").get(transaction_digest) !== undefined;
        return freeze({ transaction_digest, rule_id: row.rule_id, tier: row.rule_id?.startsWith('pidex-global:') ? 'global' : row.rule_id?.startsWith(`project:${row.scope_id}:`) ? 'project' : 'unavailable', scope_id: row.scope_id === '' ? 'pidex-global' : row.scope_id, state: row.state, policy_category: row.state === 'rejected_policy' ? POLICY_CATEGORY_BY_REASON[row.terminal_reason] || null : null, receipt_valid: receipt_valid === true, status_ready: stage?.status === 'verified' && stage.stage === 'status_ready', handoff_stage: stage?.status === 'verified' ? stage.stage : null, receipt_digest: receipt_valid ? row.receipt_digest : null, accepted_commit: receipt_valid ? receipt.accepted_commit : null, content_hash: receipt_valid ? receipt.content_hash : null, activation_epoch: active_current ? entry.activation_epoch : null, active_current: active_current === true, local_stop_active: row.local_stop_reason !== null, refinement_pending: refinement_pending === true, predecessor_commit: receipt_valid ? receipt.predecessor_commit : null, tree_digest: receipt_valid ? receipt.tree_digest : null, admission_digest: receipt_valid ? receipt.admission_digest : null, policy_digest, version_hash: receipt_valid ? receipt.content_hash : null, created_at: row.created_at, updated_at: row.updated_at });
      }));
    },
    readPublicationStatusFacts({ transaction_digest } = {}) {
      if (!validDigest(transaction_digest)) return undefined;
      return this.listPublicationStatusFacts().find((record) => record.transaction_digest === transaction_digest);
    },
    createManualRefinementRequest({ rule_id, receipt_digest, request_nonce, now } = {}) {
      if (typeof rule_id !== 'string' || !PUBLICATION_RULE.test(rule_id) || !validDigest(receipt_digest) || typeof request_nonce !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(request_nonce) || !validPublicationTime(now)) throw new Error('RULE_MANUAL_REFINEMENT_REQUEST_INVALID');
      const request_digest = createHash('sha256').update(`pidex-manual-refinement-request-v1\0${rule_id}\0${request_nonce}`, 'utf8').digest('hex');
      const request_capability = createHash('sha256').update(`pidex-manual-refinement-request-capability-v1\0${rule_id}\0${receipt_digest}\0${request_nonce}`, 'utf8').digest('hex');
      const request_id = `manual-refinement:${request_digest}`;
      db.exec('BEGIN IMMEDIATE');
      try {
        const rows = db.prepare("SELECT tx.repository, tx.scope_id, tx.rule_id, tx.allowed_paths_json, tx.enrollment_digest AS tx_enrollment_digest, tx.idempotency_key, accepted.receipt_digest, accepted.receipt_json, stage.payload_digest AS stage_payload_digest, stage.payload_json, enrollment.enrollment_digest AS enrollment_digest, enrollment.allowed_paths_json AS enrollment_allowed_paths_json, enrollment.predecessor AS enrollment_predecessor, stop.reason_code AS local_stop_reason FROM publication_transaction AS tx JOIN publication_enrollment AS enrollment ON enrollment.repository = tx.repository AND enrollment.scope_id = tx.scope_id AND enrollment.rule_id = tx.rule_id JOIN publication_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key JOIN publication_handoff_stage_current AS stage ON stage.transaction_digest = substr(tx.idempotency_key, 4) AND stage.receipt_digest = accepted.receipt_digest LEFT JOIN local_narrowing AS stop ON stop.repository = tx.repository AND stop.scope_id = tx.scope_id AND stop.rule_id = tx.rule_id WHERE tx.state = 'accepted_remote' AND tx.rule_id = ? AND accepted.receipt_digest = ? AND stage.stage = 'status_ready'").all(rule_id, receipt_digest);
        let facts;
        for (const row of rows) {
          let receipt; let payload; let allowed_paths;
          try { receipt = JSON.parse(row.receipt_json); payload = JSON.parse(row.payload_json); allowed_paths = JSON.parse(row.allowed_paths_json); } catch { continue; }
          const scope_id = outwardPublicationScope(row.scope_id); const rule_path = acceptedReceiptRulePath(row.rule_id, row.scope_id); const projection = this.readProjection({ repository: row.repository, scope_id: row.scope_id || null }); const entry = projection?.entries?.find((item) => item.rule_id === row.rule_id);
          const epoch = entry?.activation_epoch && this.readLifecycleEpoch({ repository: row.repository, scope_id: row.scope_id || null, rule_id, rule_version: entry.rule_version, activation_epoch: entry.activation_epoch });
          if (!rule_path || row.local_stop_reason !== null || !validAcceptedReceipt(receipt) || !Array.isArray(allowed_paths) || row.enrollment_digest !== row.tx_enrollment_digest || row.enrollment_allowed_paths_json !== row.allowed_paths_json || row.enrollment_predecessor !== `commit:${receipt.predecessor_commit}` || !allowed_paths.includes(rule_path) || receipt.rule_id !== rule_id || receipt.scope_id !== scope_id || receipt.lifecycle_state !== 'active' || !entry || entry.lifecycle_state !== 'active' || entry.accepted_commit !== receipt.accepted_commit || entry.content_hash !== receipt.content_hash || !epoch || epoch.closed_at !== null || payload?.accepted_commit !== receipt.accepted_commit || payload?.containing_head !== projection.accepted_head || payload?.member?.rule_id !== rule_id || payload.member.path !== rule_path || payload.member.content_hash !== receipt.content_hash || payload?.target_epoch?.activation_epoch !== entry.activation_epoch) continue;
          if (facts) throw new Error('RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE');
          facts = { ...row, scope_id, rule_path, receipt, entry, containing_head: payload.containing_head };
        }
        if (!facts || rows.length !== 1) throw new Error('RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE');
        const expires_at = new Date(Date.parse(now) + 300_000).toISOString();
        const existing = db.prepare('SELECT request_id, request_digest, request_capability_digest, rule_id, scope_id, path_digest, content_hash, status, expires_at FROM manual_refinement_request WHERE request_id = ?').get(request_id);
        if (existing) { if (existing.request_capability_digest !== request_capability || existing.rule_id !== rule_id || existing.scope_id !== (facts.scope_id === 'pidex-global' ? '' : facts.scope_id) || existing.path_digest !== createHash('sha256').update(facts.rule_path, 'utf8').digest('hex') || existing.content_hash !== facts.receipt.content_hash) throw new Error('RULE_MANUAL_REFINEMENT_REQUEST_CONFLICT'); db.exec('COMMIT'); return freeze({ status: existing.status, request_id: existing.request_id, request_digest: existing.request_digest, request_capability, rule_id: existing.rule_id, scope_id: existing.scope_id, path_digest: existing.path_digest, current_content_digest: existing.content_hash, expires_at: existing.expires_at }); }
        if (db.prepare("SELECT 1 FROM manual_refinement_request WHERE transaction_digest = ? AND status IN ('open','imported','admitted') LIMIT 1").get(facts.idempotency_key.slice(3))) throw new Error('RULE_MANUAL_REFINEMENT_REQUEST_CONFLICT');
        db.prepare('INSERT INTO manual_refinement_request (request_id, request_digest, request_nonce, request_capability_digest, repository, scope_id, rule_id, tier, rule_path, path_digest, containing_head, predecessor_commit, accepted_commit, content_hash, activation_epoch, transaction_digest, receipt_digest, enrollment_digest, allowed_paths_digest, allowed_paths_json, stage_payload_digest, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(request_id, request_digest, request_nonce, request_capability, facts.repository, facts.scope_id === 'pidex-global' ? '' : facts.scope_id, rule_id, facts.entry.tier, facts.rule_path, createHash('sha256').update(facts.rule_path, 'utf8').digest('hex'), facts.containing_head, facts.receipt.predecessor_commit, facts.receipt.accepted_commit, facts.receipt.content_hash, facts.entry.activation_epoch, facts.idempotency_key.slice(3), facts.receipt_digest, facts.enrollment_digest, createHash('sha256').update(facts.enrollment_allowed_paths_json, 'utf8').digest('hex'), facts.enrollment_allowed_paths_json, facts.stage_payload_digest, 'open', expires_at, now);
        db.prepare("INSERT INTO manual_refinement_request_event (request_id, status, created_at) VALUES (?, 'open', ?)").run(request_id, now);
        db.exec('COMMIT'); return freeze({ status: 'open', request_id, request_digest, request_capability, rule_id, scope_id: facts.scope_id, path_digest: createHash('sha256').update(facts.rule_path, 'utf8').digest('hex'), current_content_digest: facts.receipt.content_hash, expires_at });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    mintManualRefinementCapability({ request_capability } = {}) {
      if (typeof request_capability !== 'string' || !validDigest(request_capability)) throw new Error('RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE');
      const row = db.prepare('SELECT request_id FROM manual_refinement_request WHERE request_capability_digest = ?').get(request_capability);
      if (!row || !currentManualRefinementFacts(learningState, row.request_id, new Date().toISOString(), true)) throw new Error('RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE');
      const capability = Object.freeze({}); manualRefinementCapabilities.set(capability, { state: learningState, request_id: row.request_id }); return capability;
    },
    remintManualRefinementIntakeCapability({ request_capability, request_id, intake_digest } = {}) {
      if (typeof request_capability !== 'string' || !validDigest(request_capability) || !MANUAL_REFINEMENT_REQUEST.test(request_id || '') || !validDigest(intake_digest)) throw new Error('RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE');
      const facts = currentManualRefinementFacts(learningState, request_id, new Date().toISOString(), true);
      if (!facts || facts.request_capability_digest !== request_capability || !['imported', 'admitted'].includes(facts.status) || facts.intake_digest !== intake_digest || !validDigest(facts.candidate_digest)) throw new Error('RULE_MANUAL_REFINEMENT_AUTHORITY_UNAVAILABLE');
      const capability = Object.freeze({}); manualRefinementIntakeCapabilities.set(capability, { state: learningState, request_id, intake_digest, candidate_digest: facts.candidate_digest }); return capability;
    },
    mintManualCandidateAttestation({ request_capability, enrollment_authority, support, findings, candidate, candidate_bytes, source_digest, now } = {}) {
      const bound = manualRefinementCapabilities.get(request_capability); const bytes = Buffer.isBuffer(candidate_bytes) || candidate_bytes instanceof Uint8Array ? Buffer.from(candidate_bytes) : null;
      const checked = Array.isArray(findings) ? findings.map((finding) => validateRuleLearningFinding(finding)) : [];
      const supplied = checked.every((item) => item.ok) ? checked.map((item) => findingDigest(item.value)).sort() : null;
      const facts = bound && bound.state === learningState && currentManualRefinementFacts(learningState, bound.request_id, now, true);
      const enrolled = validRuleLearningSupport(support) && supplied && supplied.length === support.finding_digests.length && supplied.every((digest, index) => digest === support.finding_digests[index]) ? readRuleLearningEnrollmentAuthority({ authority: enrollment_authority, tier: candidate?.tier, findings: checked.map((item) => item.value) }) : null;
      const descriptors = enrolled?.target?.applicable_descriptors?.map((item) => item.descriptor_digest).sort();
      if (!facts || !bytes || !validDigest(source_digest) || !validRuleLearningCandidate(candidate) || !Buffer.from(canonicalRuleLearningCandidateBytes(candidate), 'utf8').equals(bytes) || !enrolled || candidate.rule_id !== facts.rule_id || candidate.tier !== facts.tier || candidate.predecessor_commit !== `commit:${facts.predecessor_commit}` || candidate.authority_digest !== enrolled.authority_digest || candidate.scope_digest !== enrolled.target.scope_digest || candidate.support_digest !== ruleLearningSupportDigest(support) || candidate.admission_policy_id !== enrolled.policy.id || candidate.admission_policy_version !== enrolled.policy.version || candidate.admission_policy_digest !== enrolled.policy.digest || candidate.generator_principal !== enrolled.generator_identity.principal || candidate.generator_attempt_id !== enrolled.generator_identity.attempt_id || JSON.stringify(candidate.descriptor_digests) !== JSON.stringify(descriptors)) throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
      const attestation = Object.freeze({}); manualCandidateAttestations.set(attestation, { state: learningState, request_id: bound.request_id, source_digest, candidate_digest: candidate.candidate_digest, candidate_bytes_digest: candidateBytesDigest(bytes) }); return attestation;
    },
    recordManualRefinementCandidate({ capability, attestation, source_digest, candidate_digest, candidate_bytes, candidate, now, fault } = {}) {
      const bound = manualRefinementCapabilities.get(capability); const attested = manualCandidateAttestations.get(attestation);
      if (!bound || bound.state !== learningState || !attested || attested.state !== learningState || attested.request_id !== bound.request_id || attested.source_digest !== source_digest || attested.candidate_digest !== candidate_digest || !validDigest(source_digest) || !validDigest(candidate_digest) || !(Buffer.isBuffer(candidate_bytes) || candidate_bytes instanceof Uint8Array) || !validPublicationTime(now) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
      const bytes = Buffer.from(candidate_bytes); const bytes_digest = candidateBytesDigest(bytes); const canonical = canonicalRuleLearningCandidateBytes(candidate);
      if (attested.candidate_bytes_digest !== bytes_digest) throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
      if (!canonical || !Buffer.from(canonical, 'utf8').equals(bytes) || !validRuleLearningCandidate(candidate) || candidate.candidate_digest !== candidate_digest || candidateIdentityDigest(candidate) !== candidate_digest || !learningState.config || candidate.authority_digest !== createHash('sha256').update(`pidex-rule-learning-store-v1:${learningState.config.enrollment.authority_digest}:${learningState.store_digest}`).digest('hex')) throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
      db.exec('BEGIN IMMEDIATE');
      try {
        const facts = currentManualRefinementFacts(learningState, bound.request_id, now, true);
        if (!facts || candidate.rule_id !== facts.rule_id || candidate.tier !== facts.tier || candidate.predecessor_commit !== `commit:${facts.predecessor_commit}`) throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
        const existing = db.prepare('SELECT status, source_digest, candidate_digest, candidate_bytes_digest, candidate_bytes, intake_digest FROM manual_refinement_request WHERE request_id = ?').get(bound.request_id);
        if (!existing) throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
        const intake_digest = createHash('sha256').update(`pidex-manual-refinement-intake-v1\0${facts.request_digest}\0${source_digest}\0${candidate_digest}`, 'utf8').digest('hex');
        const mint = () => {
          const existingCapability = learningState.manual_refinement_intakes.get(bound.request_id);
          if (existingCapability) return existingCapability;
          const intake_capability = Object.freeze({}); manualRefinementIntakeCapabilities.set(intake_capability, { state: learningState, request_id: bound.request_id, intake_digest, candidate_digest }); learningState.manual_refinement_intakes.set(bound.request_id, intake_capability); return intake_capability;
        };
        if (existing.status === 'imported') {
          if (existing.source_digest !== source_digest || existing.candidate_digest !== candidate_digest || existing.candidate_bytes_digest !== bytes_digest || existing.intake_digest !== intake_digest || !Buffer.from(existing.candidate_bytes).equals(bytes)) throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_CONFLICT');
          db.exec('COMMIT'); return freeze({ status: 'existing', candidate_bytes: bytes, candidate_digest, candidate_bytes_digest: bytes_digest, intake_capability: mint() });
        }
        if (existing.status !== 'open') throw new Error('RULE_MANUAL_REFINEMENT_INTAKE_UNAVAILABLE');
        db.prepare("UPDATE manual_refinement_request SET status = 'imported', source_digest = ?, candidate_digest = ?, candidate_bytes_digest = ?, candidate_bytes = ?, intake_digest = ? WHERE request_id = ? AND status = 'open'").run(source_digest, candidate_digest, bytes_digest, bytes, intake_digest, bound.request_id);
        fault?.('after_write');
        db.prepare("INSERT INTO manual_refinement_request_event (request_id, status, created_at) VALUES (?, 'imported', ?)").run(bound.request_id, now);
        db.exec('COMMIT'); return freeze({ status: 'imported', candidate_bytes: bytes, candidate_digest, candidate_bytes_digest: bytes_digest, intake_capability: mint() });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    persistManualRefinementAdmissionIntent({ intake_capability, intent, intent_bytes, now, fault } = {}) {
      const bound = manualRefinementIntakeCapabilities.get(intake_capability); const bytes = Buffer.isBuffer(intent_bytes) ? Buffer.from(intent_bytes) : null;
      if (!bound || bound.state !== learningState || !bytes || !validPublicationTime(now) || (fault !== undefined && typeof fault !== 'function') || !exactKeys(intent, ['schema_version', 'candidate_digest', 'semantic_context_digest', 'vote_digests', 'configuration_generation', 'created_at']) || intent.schema_version !== 'pidex-manual-refinement-admission-intent-v1' || !validDigest(intent.candidate_digest) || !validDigest(intent.semantic_context_digest) || !Array.isArray(intent.vote_digests) || !intent.vote_digests.every(validDigest) || canonical(intent.vote_digests) !== canonical([...intent.vote_digests].sort()) || typeof intent.configuration_generation !== 'string' || !validPublicationTime(intent.created_at) || !Buffer.from(canonical(intent), 'utf8').equals(bytes)) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
      const intent_digest = digest(bytes); db.exec('BEGIN IMMEDIATE');
      try {
        const facts = currentManualRefinementFacts(learningState, bound.request_id, now, true);
        if (!facts || !['imported', 'admitted'].includes(facts.status) || facts.intake_digest !== bound.intake_digest || facts.candidate_digest !== bound.candidate_digest || intent.candidate_digest !== facts.candidate_digest) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
        const existing = db.prepare('SELECT intent_digest, intent_bytes FROM manual_refinement_admission_intent WHERE request_id = ? AND intake_digest = ?').get(bound.request_id, bound.intake_digest);
        if (existing && (existing.intent_digest !== intent_digest || !Buffer.from(existing.intent_bytes).equals(bytes))) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_CONFLICT');
        if (!existing) db.prepare('INSERT INTO manual_refinement_admission_intent (request_id,intake_digest,intent_digest,intent_bytes,candidate_digest,semantic_context_digest,vote_digests_json,configuration_generation,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(bound.request_id, bound.intake_digest, intent_digest, bytes, intent.candidate_digest, intent.semantic_context_digest, canonical(intent.vote_digests), intent.configuration_generation, intent.created_at);
        db.exec('COMMIT'); fault?.('after_intent'); return freeze({ status: existing ? 'existing' : 'intent', intent_digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    reconcileManualRefinementAdmissionClaim({ intake_capability, intent_digest, intent, intent_bytes, votes, now } = {}) {
      const bound = manualRefinementIntakeCapabilities.get(intake_capability); const bytes = Buffer.isBuffer(intent_bytes) ? Buffer.from(intent_bytes) : null;
      if (!bound || bound.state !== learningState || !validDigest(intent_digest) || !bytes || !Array.isArray(votes) || !validPublicationTime(now)) return freeze({ status: 'conflict' });
      const facts = currentManualRefinementFacts(learningState, bound.request_id, now, true);
      const stored = facts && learningState.db.prepare('SELECT intent_bytes, candidate_digest, semantic_context_digest, vote_digests_json, configuration_generation FROM manual_refinement_admission_intent WHERE request_id = ? AND intake_digest = ? AND intent_digest = ?').get(bound.request_id, bound.intake_digest, intent_digest);
      if (!facts || !stored || !Buffer.from(stored.intent_bytes).equals(bytes) || !intent || !Buffer.from(canonical(intent), 'utf8').equals(bytes) || stored.candidate_digest !== facts.candidate_digest || stored.semantic_context_digest !== intent.semantic_context_digest || stored.configuration_generation !== intent.configuration_generation || stored.vote_digests_json !== canonical(intent.vote_digests)) return freeze({ status: 'conflict' });
      const full_vote_digests = votes.map(fullManualVoteDigest).sort();
      if (learningState.config?.reviewers?.configuration_generation !== intent.configuration_generation || full_vote_digests.some((value) => !value) || canonical(full_vote_digests) !== canonical(intent.vote_digests) || votes.some((vote) => vote?.decision !== 'accept')) return freeze({ status: 'conflict' });
      const result = learningState.db.prepare('SELECT 1 FROM manual_refinement_admission_result WHERE request_id = ? AND intake_digest = ? AND intent_digest = ?').get(bound.request_id, bound.intake_digest, intent_digest);
      if (result) return freeze({ status: 'result' });
      const expected = votes.map((vote) => ({ candidate_digest: facts.candidate_digest, attempt_id: vote?.attempt_id, nonce: vote?.nonce, reviewer_principal: vote?.reviewer_principal, backend_identity: vote?.backend_identity, vote_digest: learningVoteDigest(vote), configuration_generation: intent.configuration_generation })).sort((left, right) => canonical(left).localeCompare(canonical(right)));
      const claimed = learningState.db.prepare('SELECT candidate_digest,attempt_id,nonce,reviewer_principal,backend_identity,vote_digest,configuration_generation FROM rule_learning_vote_claim WHERE candidate_digest = ?').all(facts.candidate_digest).sort((left, right) => canonical(left).localeCompare(canonical(right)));
      if (!claimed.length) return freeze({ status: 'unclaimed' });
      return canonical(claimed) === canonical(expected) ? freeze({ status: 'claimed' }) : freeze({ status: 'conflict' });
    },
    persistManualRefinementAdmissionResult({ intake_capability, intent_digest, admission_bytes, now, fault } = {}) {
      const bound = manualRefinementIntakeCapabilities.get(intake_capability); const bytes = Buffer.isBuffer(admission_bytes) ? Buffer.from(admission_bytes) : null; const admission_digest = bytes && createHash('sha256').update(bytes).digest('hex');
      if (!bound || bound.state !== learningState || !validDigest(intent_digest) || !bytes || !validPublicationTime(now) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
      db.exec('BEGIN IMMEDIATE');
      try {
        const facts = currentManualRefinementFacts(learningState, bound.request_id, now, true); const intent = db.prepare('SELECT candidate_digest FROM manual_refinement_admission_intent WHERE request_id = ? AND intake_digest = ? AND intent_digest = ?').get(bound.request_id, bound.intake_digest, intent_digest);
        let admission; try { admission = JSON.parse(bytes.toString('utf8')); } catch {}
        if (!facts || !intent || !exactKeys(admission, ['schema_version', 'candidate_digest', 'candidate_content_hash', 'admission_policy_digest', 'admission_policy_version', 'tier', 'repository_scope_digest', 'vote_digests']) || admission.schema_version !== 'pidex-living-rule-admission-v1' || admission.candidate_digest !== intent.candidate_digest) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_UNAVAILABLE');
        const existing = db.prepare('SELECT admission_digest, admission_bytes FROM manual_refinement_admission_result WHERE request_id = ? AND intake_digest = ?').get(bound.request_id, bound.intake_digest);
        if (existing && (existing.admission_digest !== admission_digest || !Buffer.from(existing.admission_bytes).equals(bytes))) throw new Error('RULE_MANUAL_REFINEMENT_ADMISSION_CONFLICT');
        if (!existing) { db.prepare('INSERT INTO manual_refinement_admission_result (request_id,intake_digest,intent_digest,admission_digest,admission_bytes,created_at) VALUES (?,?,?,?,?,?)').run(bound.request_id, bound.intake_digest, intent_digest, admission_digest, bytes, now); db.prepare("UPDATE manual_refinement_request SET status = 'admitted' WHERE request_id = ? AND status = 'imported'").run(bound.request_id); db.prepare("INSERT INTO manual_refinement_request_event (request_id,status,created_at) VALUES (?, 'admitted', ?)").run(bound.request_id, now); }
        db.exec('COMMIT'); fault?.('after_result'); const capability = mintManualAdmissionCapability(learningState, bound.request_id, bound.intake_digest, admission_digest); return freeze({ status: existing ? 'existing' : 'admitted', admission_digest, admission_capability: capability });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readPublicationTransactionFacts({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const row = db.prepare('SELECT idempotency_key, state, expected_base, local_commit, local_parent, local_tree_digest, staged_member_digests_json, terminal_reason FROM publication_transaction WHERE idempotency_key = ?').get(idempotency_key);
      if (!row) return undefined; let staged_member_digests; try { staged_member_digests = row.staged_member_digests_json ? JSON.parse(row.staged_member_digests_json) : null; } catch { return undefined; }
      return freeze({ ...row, staged_member_digests: staged_member_digests ? freeze(staged_member_digests) : null });
    },
    /** Store-owned recovery gate: only durable manual admission-to-TX relation may resume publication. */
    readManualPublicationRecoveryFacts({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const row = db.prepare('SELECT tx.idempotency_key, tx.state, tx.repository, tx.scope_id, tx.rule_id, tx.candidate_digest, tx.candidate_bytes, tx.admission_digest, tx.admission_bytes, result.transaction_id, result.admission_digest AS result_admission_digest, result.admission_bytes AS result_admission_bytes, intent.candidate_digest AS intent_candidate_digest, request.request_id, request.status AS request_status, request.intake_digest, request.candidate_digest AS request_candidate_digest, request.candidate_bytes AS request_candidate_bytes, request.candidate_bytes_digest FROM publication_transaction AS tx JOIN manual_refinement_admission_result AS result ON result.transaction_id = tx.idempotency_key JOIN manual_refinement_admission_intent AS intent ON intent.request_id = result.request_id AND intent.intake_digest = result.intake_digest JOIN manual_refinement_request AS request ON request.request_id = result.request_id WHERE tx.idempotency_key = ?').get(idempotency_key);
      const candidate_bytes = row?.candidate_bytes && Buffer.from(row.candidate_bytes); const request_candidate_bytes = row?.request_candidate_bytes && Buffer.from(row.request_candidate_bytes); const admission_bytes = row?.admission_bytes && Buffer.from(row.admission_bytes); const result_admission_bytes = row?.result_admission_bytes && Buffer.from(row.result_admission_bytes);
      const writer = this.readPublicationWriterFacts({ idempotency_key });
      if (!row || !writer || row.transaction_id !== row.idempotency_key || row.request_status !== 'admitted') return undefined;
      // Intake and TX creation already reject noncanonical/mismatched bytes; recovery reuses same durable relation and writer facts.
      if (!candidate_bytes || !request_candidate_bytes || !admission_bytes || !result_admission_bytes || !candidate_bytes.equals(request_candidate_bytes) || !candidate_bytes.equals(writer.candidate_bytes) || !admission_bytes.equals(result_admission_bytes) || !admission_bytes.equals(writer.admission_bytes)) return undefined;
      if (!PUBLICATION_TERMINALS.has(row.state) && !currentManualRefinementFacts(learningState, row.request_id, new Date().toISOString(), true)) return undefined;
      return freeze({ idempotency_key: row.idempotency_key, state: row.state });
    },
    // Private capability seam. Writer gets exact prepared bytes from store; outward reads remain sanitized.
    readPublicationWriterFacts({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const action = this.readLifecycleActionWriterFacts({ idempotency_key });
      if (action) return action;
      const row = db.prepare('SELECT tx.idempotency_key, tx.repository, tx.scope_id, tx.rule_id, tx.enrollment_digest, tx.allowed_paths_json, tx.expected_base, tx.candidate_digest, tx.candidate_bytes, tx.admission_digest, tx.admission_bytes, tx.state, tx.local_commit, tx.local_parent, tx.local_tree_digest, tx.staged_member_digests_json, en.normalized_remote_digest, en.branch, en.author, en.writer_enabled, en.trailer_policy, en.repository_identity_digest, en.identity_platform, en.root_identity_digest, en.parent_identity_digest, en.files_identity_digest, en.identity_proof, en.publication_timestamp, stop.reason_code AS local_stop_reason_code FROM publication_transaction AS tx JOIN publication_enrollment AS en ON en.repository = tx.repository AND en.scope_id = tx.scope_id AND en.rule_id = tx.rule_id LEFT JOIN local_narrowing AS stop ON stop.repository = tx.repository AND stop.scope_id = tx.scope_id AND stop.rule_id = tx.rule_id WHERE tx.idempotency_key = ?').get(idempotency_key);
      if (!row) return undefined; let allowed_paths; let candidate; let staged_member_digests;
      try { allowed_paths = JSON.parse(row.allowed_paths_json); candidate = JSON.parse(Buffer.from(row.candidate_bytes).toString('utf8')); staged_member_digests = row.staged_member_digests_json === null ? null : JSON.parse(row.staged_member_digests_json); } catch { return undefined; }
      const writer_authority = { normalized_remote_digest: row.normalized_remote_digest, branch: row.branch, author: row.author, writer_enabled: row.writer_enabled === 1, trailer_policy: row.trailer_policy, repository_identity_digest: row.repository_identity_digest, identity_platform: row.identity_platform, root_identity_digest: row.root_identity_digest, parent_identity_digest: row.parent_identity_digest, files_identity_digest: row.files_identity_digest, identity_proof: row.identity_proof, publication_timestamp: row.publication_timestamp };
      if (!validWriterAuthority(writer_authority)) return undefined;
      const target = { repository: row.repository, tier: candidate.tier, scope_id: outwardPublicationScope(row.scope_id), scope_digest: candidate.scope_digest, rule_id: row.rule_id, predecessor: candidate.predecessor_commit, enrollment_digest: row.enrollment_digest, allowed_paths, writer_authority };
      const local_stop_active = row.local_stop_reason_code !== null;
      if (local_stop_active && !LOCAL_STOP_REASONS.has(row.local_stop_reason_code)) return undefined;
      if (row.state === 'committed_local' && (!validHead(row.local_commit) || row.local_commit === row.expected_base || row.local_parent !== row.expected_base || !validDigest(row.local_tree_digest) || !validPublicationStagedMemberDigests(staged_member_digests, allowed_paths))) return undefined;
      return freeze({ idempotency_key: row.idempotency_key, state: row.state, expected_base: row.expected_base, local_commit: row.local_commit, local_parent: row.local_parent, local_tree_digest: row.local_tree_digest, staged_member_digests: staged_member_digests ? freeze(staged_member_digests) : null, local_stop_active, local_stop_reason_code: local_stop_active ? row.local_stop_reason_code : null, target: freeze(target), candidate: freeze(candidate), candidate_bytes: Buffer.from(row.candidate_bytes), admission_digest: row.admission_digest, admission_bytes: Buffer.from(row.admission_bytes), writer_authority: freeze(writer_authority) });
    },
    /** Durable zero-or-one action intent. First exact bytes win; replay must match every byte; any drift conflicts and mutates nothing. */
    persistLifecycleActionIntent({ correlation_id, cadence_digest, intent_digest, result_digest, request_json, status, reason, now, fault } = {}) {
      if (!/^action:[a-f0-9]{64}$/.test(correlation_id || '') || !validDigest(cadence_digest) || !validDigest(intent_digest) || !validDigest(result_digest) || !['no_op', 'intent'].includes(status) || !validPublicationTime(now) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_LIFECYCLE_ACTION_INTENT_INVALID');
      if (!['no_op', 'intent'].includes(status) || !validPublicationTime(now) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_LIFECYCLE_ACTION_INTENT_INVALID');
      let parsedRequest; try { parsedRequest = request_json === 'null' ? null : JSON.parse(request_json); } catch { throw new Error('RULE_LIFECYCLE_ACTION_INTENT_INVALID'); }
      const canonicalRequest = parsedRequest === null ? 'null' : canonical(parsedRequest);
      if (typeof request_json !== 'string' || request_json !== canonicalRequest) throw new Error('RULE_LIFECYCLE_ACTION_INTENT_INVALID');
      if (status === 'intent' ? reason !== null : !/^[a-z][a-z0-9_]{2,63}$/.test(reason || '')) throw new Error('RULE_LIFECYCLE_ACTION_INTENT_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT cadence_digest, intent_digest, result_digest, request_json, status, reason FROM lifecycle_action_intent WHERE correlation_id = ? OR cadence_digest = ?').all(correlation_id, cadence_digest);
        if (existing.length) {
          const exact = existing.length === 1 && existing[0].cadence_digest === cadence_digest && existing[0].intent_digest === intent_digest && existing[0].result_digest === result_digest && existing[0].request_json === request_json && existing[0].status === status && existing[0].reason === reason;
          db.exec('COMMIT'); return freeze({ status: exact ? 'existing' : 'conflict', correlation_id });
        }
        db.prepare('INSERT INTO lifecycle_action_intent (correlation_id, cadence_digest, intent_digest, result_digest, request_json, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(correlation_id, cadence_digest, intent_digest, result_digest, request_json, status, reason, now, now);
        fault?.('after_intent_write'); db.exec('COMMIT'); return freeze({ status: 'recorded', correlation_id, intent_digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readLifecycleActionIntent({ correlation_id } = {}) {
      if (!/^action:[a-f0-9]{64}$/.test(correlation_id || '')) return undefined;
      const row = db.prepare('SELECT correlation_id, cadence_digest, intent_digest, result_digest, request_json, status, reason, created_at, updated_at FROM lifecycle_action_intent WHERE correlation_id = ?').get(correlation_id);
      if (!row) return undefined;
      return freeze({ correlation_id: row.correlation_id, cadence_digest: row.cadence_digest, intent_digest: row.intent_digest, result_digest: row.result_digest, request_json: row.request_json, status: row.status, reason: row.reason, created_at: row.created_at, updated_at: row.updated_at });
    },
    readLifecycleActionIntentByCadence({ cadence_digest } = {}) {
      if (!validDigest(cadence_digest)) return undefined;
      const row = db.prepare('SELECT correlation_id, cadence_digest, intent_digest, result_digest, request_json, status, reason, created_at, updated_at FROM lifecycle_action_intent WHERE cadence_digest = ?').get(cadence_digest);
      if (!row) return undefined;
      return freeze({ correlation_id: row.correlation_id, cadence_digest: row.cadence_digest, intent_digest: row.intent_digest, result_digest: row.result_digest, request_json: row.request_json, status: row.status, reason: row.reason, created_at: row.created_at, updated_at: row.updated_at });
    },
    readLifecycleActionIntentCount() { return freeze({ count: db.prepare('SELECT COUNT(*) AS count FROM lifecycle_action_intent').get().count }); },
    /** Advisory-only cadence cache. Rebuilds from validated canonical trailers are the only consumption authority; these rows never assert consumed/clear. */
    readLifecycleActionCadenceCache({ cadence_digest } = {}) {
      if (!validDigest(cadence_digest)) return undefined;
      const intent = db.prepare('SELECT status, reason FROM lifecycle_action_intent WHERE cadence_digest = ?').get(cadence_digest);
      const transaction = db.prepare('SELECT idempotency_key, state, terminal_reason FROM lifecycle_action_transaction WHERE cadence_digest = ?').get(cadence_digest);
      return freeze({ attempted: Boolean(intent), intent_status: intent?.status || null, intent_reason: intent?.reason || null, transaction_state: transaction?.state || null, terminal_reason: transaction?.terminal_reason || null, accepted: transaction?.state === 'accepted_remote', accepted_transaction: transaction?.state === 'accepted_remote' ? transaction.idempotency_key : null });
    },
    /** Current-facts cadence state from validated canonical first-parent history; DB cache stays advisory and contradictions quarantine. */
    readLifecycleActionCadenceState({ adapter, remote_head, bound_from, max_commits, cadence_digest, expected, fault } = {}) {
      if (!adapter || typeof adapter.inspectCommit !== 'function' || !validHead(remote_head) || !validHead(bound_from) || !Number.isSafeInteger(max_commits) || max_commits < 1 || !validDigest(cadence_digest) || !expected || typeof expected !== 'object' || Array.isArray(expected) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_LIFECYCLE_ACTION_HISTORY_INVALID');
      const classified = classifyActionCadenceHistory({ adapter, remote_head, bound_from, max_commits, cadence_digest, expected });
      const cache = this.readLifecycleActionCadenceCache({ cadence_digest });
      fault?.('after_history_classification');
      if (classified.state === 'clear' && cache?.accepted) return freeze({ state: 'quarantined', reason: 'cache_contradiction', cache });
      if (classified.state === 'consumed' && cache?.accepted_transaction && classified.transaction_digest && cache.accepted_transaction !== `tx:${classified.transaction_digest}`) return freeze({ state: 'quarantined', reason: 'cache_contradiction', cache });
      return freeze({ ...classified, cache: cache || null });
    },
    /** Lifecycle-action TX-01. Candidate/admission confer no authority here; exact action bytes, deactivated content hash, and enrolled target bind the row. */
    prepareLifecycleActionTransaction(record = {}) {
      if (!validPublicationTarget(record?.target)) throw new Error('RULE_PUBLICATION_ENROLLMENT_INVALID');
      const scope = externalPublicationScope(record.target.scope_id); const targetPaths = canonical(record.target.allowed_paths);
      if (!/^tx:[a-f0-9]{64}$/.test(record.idempotency_key || '') || !validHead(record.expected_base) || !validDigest(record.cadence_digest) || !record.action || record.action.schema !== 'pidex-rule-lifecycle-action-request-v1' || !LIFECYCLE_ACTION_STATES.includes(record.action.lifecycle_transition) || !validDigest(record.action.cadence_digest) || record.action.cadence_digest !== record.cadence_digest || record.action.rule_id !== record.target.rule_id || record.action.tier !== record.target.tier || record.action.repository_scope_digest !== record.target.scope_digest || record.action.predecessor_commit !== record.expected_base || record.target.predecessor !== `commit:${record.expected_base}` || !Buffer.isBuffer(record.rule_bytes) || !validDigest(record.content_hash) || createHash('sha256').update(record.rule_bytes).digest('hex') !== record.content_hash || !validPublicationTime(record.created_at) || (record.fault !== undefined && typeof record.fault !== 'function')) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_INVALID');
      // Slice3A: persist only the canonical rule receipt bound to the exact transition. Source bytes are validated for digest identity first; the stored truth always reflects the action transition (never a stale deactivated claim under reactivation).
      const rule_bytes = canonicalizeLifecycleActionRuleBytes(record.action, record.rule_bytes);
      const content_hash = createHash('sha256').update(rule_bytes).digest('hex');
      const actionJson = canonical(record.action);
      db.exec('BEGIN IMMEDIATE');
      try {
        const enrollment = db.prepare('SELECT enrollment_digest, allowed_paths_json, predecessor, normalized_remote_digest, branch, author, writer_enabled, trailer_policy, repository_identity_digest, identity_platform, root_identity_digest, parent_identity_digest, files_identity_digest, identity_proof, publication_timestamp FROM publication_enrollment WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(record.target.repository, scope, record.target.rule_id);
        const enrolledAuthority = enrollment && { normalized_remote_digest: enrollment.normalized_remote_digest, branch: enrollment.branch, author: enrollment.author, writer_enabled: enrollment.writer_enabled === 1, trailer_policy: enrollment.trailer_policy, repository_identity_digest: enrollment.repository_identity_digest, identity_platform: enrollment.identity_platform, root_identity_digest: enrollment.root_identity_digest, parent_identity_digest: enrollment.parent_identity_digest, files_identity_digest: enrollment.files_identity_digest, identity_proof: enrollment.identity_proof, publication_timestamp: enrollment.publication_timestamp };
        if (!enrollment || !validWriterAuthority(enrolledAuthority) || enrollment.enrollment_digest !== record.target.enrollment_digest || enrollment.allowed_paths_json !== targetPaths || enrollment.predecessor !== record.target.predecessor || canonical(enrolledAuthority) !== canonical(record.target.writer_authority)) throw new Error('RULE_PUBLICATION_ENROLLMENT_INVALID');
        const existing = db.prepare('SELECT * FROM lifecycle_action_transaction WHERE idempotency_key = ?').get(record.idempotency_key);
        if (existing) {
          const exact = existing.repository === record.target.repository && existing.scope_id === scope && existing.rule_id === record.target.rule_id && existing.enrollment_digest === record.target.enrollment_digest && existing.allowed_paths_json === targetPaths && existing.expected_base === record.expected_base && existing.cadence_digest === record.cadence_digest && existing.action_json === actionJson && Buffer.from(existing.rule_bytes).equals(rule_bytes) && existing.content_hash === content_hash;
          if (!exact) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT');
          db.exec('COMMIT'); return freeze({ status: 'existing', state: existing.state, idempotency_key: record.idempotency_key });
        }
        if (db.prepare('SELECT 1 FROM lifecycle_action_transaction WHERE cadence_digest = ?').get(record.cadence_digest)) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT');
        db.prepare('INSERT INTO lifecycle_action_transaction (idempotency_key,repository,scope_id,rule_id,enrollment_digest,allowed_paths_json,expected_base,cadence_digest,action_json,rule_bytes,content_hash,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(record.idempotency_key, record.target.repository, scope, record.target.rule_id, record.target.enrollment_digest, targetPaths, record.expected_base, record.cadence_digest, actionJson, rule_bytes, content_hash, 'prepared', record.created_at, record.created_at);
        record.fault?.('after_row');
        db.prepare('INSERT INTO lifecycle_action_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,?,NULL,?)').run(record.idempotency_key, 'prepared', record.created_at);
        record.fault?.('after_event'); db.exec('COMMIT'); return freeze({ status: 'prepared', state: 'prepared', idempotency_key: record.idempotency_key, scope_id: record.target.scope_id });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    commitLocalLifecycleActionTransaction({ idempotency_key, commit, parent, tree_digest, staged_member_digests, created_at } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !validHead(commit) || !validHead(parent) || commit === parent || !validDigest(tree_digest) || !staged_member_digests || typeof staged_member_digests !== 'object' || Array.isArray(staged_member_digests) || !Object.keys(staged_member_digests).every((key) => PUBLICATION_PATH.test(key) && validDigest(staged_member_digests[key])) || !validPublicationTime(created_at)) throw new Error('RULE_LIFECYCLE_ACTION_LOCAL_COMMIT_INVALID');
      const staged = canonical(staged_member_digests); db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT state, expected_base, allowed_paths_json, local_commit, local_parent, local_tree_digest, staged_member_digests_json FROM lifecycle_action_transaction WHERE idempotency_key = ?').get(idempotency_key);
        let allowed; try { allowed = JSON.parse(row?.allowed_paths_json); } catch {}
        if (!row || row.expected_base !== parent || !Array.isArray(allowed) || canonical(Object.keys(staged_member_digests).sort()) !== canonical([...allowed].sort())) throw new Error('RULE_LIFECYCLE_ACTION_LOCAL_COMMIT_INVALID');
        if (row.state === 'committed_local') { if (row.local_commit !== commit || row.local_parent !== parent || row.local_tree_digest !== tree_digest || row.staged_member_digests_json !== staged) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', state: row.state, idempotency_key }); }
        if (row.state !== 'prepared') throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_TERMINAL');
        db.prepare('UPDATE lifecycle_action_transaction SET state = ?, local_commit = ?, local_parent = ?, local_tree_digest = ?, staged_member_digests_json = ?, updated_at = ? WHERE idempotency_key = ?').run('committed_local', commit, parent, tree_digest, staged, created_at, idempotency_key);
        db.prepare('INSERT INTO lifecycle_action_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,?,NULL,?)').run(idempotency_key, 'committed_local', created_at);
        db.exec('COMMIT'); return freeze({ status: 'committed_local', state: 'committed_local', idempotency_key });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    appendLifecycleActionTerminal({ idempotency_key, state, reason_code, created_at } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || state !== 'deferred_remote_advanced' || typeof reason_code !== 'string' || !/^[a-z][a-z0-9_]{2,63}$/.test(reason_code) || !validPublicationTime(created_at)) throw new Error('RULE_LIFECYCLE_ACTION_TERMINAL_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT state, terminal_reason FROM lifecycle_action_transaction WHERE idempotency_key = ?').get(idempotency_key);
        if (!row) throw new Error('RULE_LIFECYCLE_ACTION_TERMINAL_INVALID');
        if (row.state === 'deferred_remote_advanced' || row.state === 'accepted_remote') { if (row.state !== state || row.terminal_reason !== reason_code) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', state: row.state, idempotency_key }); }
        if (row.state !== 'prepared' && row.state !== 'committed_local') throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_TERMINAL');
        db.prepare('UPDATE lifecycle_action_transaction SET state = ?, terminal_reason = ?, updated_at = ? WHERE idempotency_key = ?').run(state, reason_code, created_at, idempotency_key);
        db.prepare('INSERT INTO lifecycle_action_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,?,?,?)').run(idempotency_key, state, reason_code, created_at);
        db.exec('COMMIT'); return freeze({ status: state, state, idempotency_key });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    /** Private capability seam. Writer gets exact lifecycle-action prepared bytes; outward reads remain sanitized. */
    readLifecycleActionWriterFacts({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const row = db.prepare('SELECT tx.idempotency_key, tx.repository, tx.scope_id, tx.rule_id, tx.enrollment_digest, tx.allowed_paths_json, tx.expected_base, tx.cadence_digest, tx.action_json, tx.rule_bytes, tx.content_hash, tx.state, tx.local_commit, tx.local_parent, tx.local_tree_digest, tx.staged_member_digests_json, en.normalized_remote_digest, en.branch, en.author, en.writer_enabled, en.trailer_policy, en.repository_identity_digest, en.identity_platform, en.root_identity_digest, en.parent_identity_digest, en.files_identity_digest, en.identity_proof, en.publication_timestamp, stop.reason_code AS local_stop_reason_code FROM lifecycle_action_transaction AS tx JOIN publication_enrollment AS en ON en.repository = tx.repository AND en.scope_id = tx.scope_id AND en.rule_id = tx.rule_id LEFT JOIN local_narrowing AS stop ON stop.repository = tx.repository AND stop.scope_id = tx.scope_id AND stop.rule_id = tx.rule_id WHERE tx.idempotency_key = ?').get(idempotency_key);
      if (!row) return undefined; let allowed_paths; let action; let staged_member_digests;
      try { allowed_paths = JSON.parse(row.allowed_paths_json); action = JSON.parse(row.action_json); staged_member_digests = row.staged_member_digests_json === null ? null : JSON.parse(row.staged_member_digests_json); } catch { return undefined; }
      if (action?.schema !== 'pidex-rule-lifecycle-action-request-v1' || !LIFECYCLE_ACTION_STATES.includes(action?.lifecycle_transition) || !validDigest(row.cadence_digest) || !validDigest(row.content_hash) || !Buffer.isBuffer(Buffer.from(row.rule_bytes))) return undefined;
      const writer_authority = { normalized_remote_digest: row.normalized_remote_digest, branch: row.branch, author: row.author, writer_enabled: row.writer_enabled === 1, trailer_policy: row.trailer_policy, repository_identity_digest: row.repository_identity_digest, identity_platform: row.identity_platform, root_identity_digest: row.root_identity_digest, parent_identity_digest: row.parent_identity_digest, files_identity_digest: row.files_identity_digest, identity_proof: row.identity_proof, publication_timestamp: row.publication_timestamp };
      if (!validWriterAuthority(writer_authority)) return undefined;
      const target = { repository: row.repository, tier: action.tier, scope_id: outwardPublicationScope(row.scope_id), scope_digest: action.repository_scope_digest, rule_id: row.rule_id, predecessor: `commit:${row.expected_base}`, enrollment_digest: row.enrollment_digest, allowed_paths, writer_authority };
      const local_stop_active = row.local_stop_reason_code !== null;
      if (local_stop_active && !LOCAL_STOP_REASONS.has(row.local_stop_reason_code)) return undefined;
      if (row.state === 'committed_local' && (!validHead(row.local_commit) || row.local_commit === row.expected_base || row.local_parent !== row.expected_base || !validDigest(row.local_tree_digest) || !validPublicationStagedMemberDigests(staged_member_digests, allowed_paths))) return undefined;
      return freeze({ idempotency_key: row.idempotency_key, state: row.state, expected_base: row.expected_base, local_commit: row.local_commit, local_parent: row.local_parent, local_tree_digest: row.local_tree_digest, staged_member_digests: staged_member_digests ? freeze(staged_member_digests) : null, local_stop_active, local_stop_reason_code: local_stop_active ? row.local_stop_reason_code : null, target: freeze(target), action: freeze(action), action_digest: createHash('sha256').update(canonical(action), 'utf8').digest('hex'), cadence_digest: row.cadence_digest, rule_bytes: Buffer.from(row.rule_bytes), content_hash: row.content_hash, writer_authority: freeze(writer_authority) });
    },
    attestLifecycleActionRemoteProof({ idempotency_key, receipt, publication_proof, adapter } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !validAcceptedReceipt(receipt) || !LIFECYCLE_ACTION_STATES.includes(receipt.lifecycle_state) || !publication_proof || typeof adapter?.fetchEnrolledBranch !== 'function' || typeof adapter?.inspectCommit !== 'function') throw new Error('RULE_LIFECYCLE_ACTION_PROOF_CAPABILITY_INVALID');
      const facts = this.readLifecycleActionWriterFacts({ idempotency_key });
      if (!facts || facts.state !== 'committed_local' || facts.local_stop_active || facts.local_parent !== facts.expected_base || !facts.staged_member_digests || receipt.repository_identity !== facts.writer_authority.repository_identity_digest || receipt.scope_id !== facts.target.scope_id || receipt.rule_id !== facts.target.rule_id || receipt.predecessor_commit !== facts.expected_base || receipt.accepted_commit !== facts.local_commit || receipt.tree_digest !== facts.local_tree_digest || receipt.admission_digest !== facts.action_digest || receipt.transaction_digest !== idempotency_key.slice(3)) throw new Error('RULE_LIFECYCLE_ACTION_PROOF_CAPABILITY_INVALID');
      let fresh;
      const boundedAdapter = Object.freeze({ fetchEnrolledBranch: (enrollment) => { fresh = adapter.fetchEnrolledBranch(enrollment); return fresh; }, inspectCommit: (commit) => adapter.inspectCommit(commit) });
      let verified;
      try { verified = verifyLifecycleActionRemoteProof({ receipt, enrollment: { repository_identity: facts.writer_authority.repository_identity_digest, normalized_remote_digest: facts.writer_authority.normalized_remote_digest, branch: facts.writer_authority.branch, author: facts.writer_authority.author, allowed_paths: facts.target.allowed_paths }, durable: { predecessor_commit: facts.expected_base, accepted_commit: facts.local_commit, tree_digest: facts.local_tree_digest, staged_member_digests: facts.staged_member_digests, admission_digest: facts.action_digest, transaction_digest: idempotency_key.slice(3), rule_id: facts.target.rule_id, tier: facts.target.tier }, cadence_digest: facts.cadence_digest, adapter: boundedAdapter }); } catch { throw new Error('RULE_LIFECYCLE_ACTION_PROOF_CAPABILITY_INVALID'); }
      if (!fresh || canonical(publication_proof) !== canonical({ containing_head: fresh.containing_head, entries: fresh.entries, predecessor_boundary: fresh.predecessor_boundary })) throw new Error('RULE_LIFECYCLE_ACTION_PROOF_CAPABILITY_INVALID');
      const capability = Object.freeze({}); lifecycleActionProofCapabilities.set(capability, { store: learningState, idempotency_key, receipt_digest: createHash('sha256').update(canonical(receipt)).digest('hex'), proof_digest: createHash('sha256').update(canonical(publication_proof)).digest('hex'), accepted_commit: verified.accepted_commit, containing_head: verified.containing_head, containing_tree_digest: verified.containing_tree_digest, consumed: false }); return capability;
    },
    acceptLifecycleActionRemoteReceipt({ idempotency_key, receipt, publication_proof, proof_capability, created_at, fault } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !validAcceptedReceipt(receipt) || !LIFECYCLE_ACTION_STATES.includes(receipt.lifecycle_state) || !validPublicationTime(created_at) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
      const receipt_json = canonical(receipt); const receipt_digest = createHash('sha256').update(receipt_json).digest('hex');
      const proof = publication_proof === undefined ? { containing_head: receipt.accepted_commit, entries: [{ commit_oid: receipt.accepted_commit, parent_oids: [receipt.predecessor_commit], tree_oid: receipt.accepted_commit }], predecessor_boundary: receipt.predecessor_commit } : publication_proof;
      if (!exactKeys(proof, ['containing_head', 'entries', 'predecessor_boundary']) || !validHead(proof.containing_head) || !validHead(proof.predecessor_boundary) || proof.predecessor_boundary !== receipt.predecessor_commit || !Array.isArray(proof.entries) || proof.entries.length < 1 || proof.entries.length > 65 || proof.entries[0]?.commit_oid !== proof.containing_head || proof.entries.at(-1)?.commit_oid !== receipt.accepted_commit || proof.entries.at(-1)?.parent_oids?.[0] !== proof.predecessor_boundary || proof.entries.some((entry, index) => !exactKeys(entry, ['commit_oid', 'parent_oids', 'tree_oid']) || !validHead(entry.commit_oid) || !validHead(entry.tree_oid) || !Array.isArray(entry.parent_oids) || entry.parent_oids.length !== 1 || !validHead(entry.parent_oids[0]) || (index && proof.entries[index - 1].parent_oids[0] !== entry.commit_oid) || proof.entries.findIndex((candidate) => candidate.commit_oid === entry.commit_oid) !== index)) throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
      const proof_json = canonical(proof); const proof_digest = createHash('sha256').update(proof_json).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT tx.state, tx.repository, tx.scope_id, tx.rule_id, tx.expected_base, tx.cadence_digest, tx.content_hash, tx.local_commit, tx.local_parent, tx.local_tree_digest, tx.staged_member_digests_json, accepted.receipt_digest, accepted.receipt_json, en.repository_identity_digest FROM lifecycle_action_transaction AS tx JOIN publication_enrollment AS en ON en.repository = tx.repository AND en.scope_id = tx.scope_id AND en.rule_id = tx.rule_id LEFT JOIN lifecycle_action_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key WHERE tx.idempotency_key = ?').get(idempotency_key);
        if (!row) throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
        if (row.state === 'accepted_remote') { if (row.receipt_digest !== receipt_digest || row.receipt_json !== receipt_json || canonical(publication_proof) !== canonical(this.readLifecycleActionHandoffHeadProofs({ idempotency_key }).at(-1))) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', state: row.state, idempotency_key, receipt_digest }); }
        const capability = lifecycleActionProofCapabilities.get(proof_capability);
        if (!capability || capability.store !== learningState || capability.consumed || capability.idempotency_key !== idempotency_key || capability.receipt_digest !== receipt_digest || capability.proof_digest !== proof_digest || capability.accepted_commit !== receipt.accepted_commit || capability.containing_head !== proof.containing_head) throw new Error('RULE_LIFECYCLE_ACTION_PROOF_CAPABILITY_INVALID');
        capability.consumed = true;
        if (row.state === 'accepted_remote' || row.state === 'deferred_remote_advanced' || row.receipt_digest) throw new Error('RULE_LIFECYCLE_ACTION_TRANSACTION_CONFLICT');
        let staged; try { staged = JSON.parse(row.staged_member_digests_json); } catch { throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID'); }
        const rulePath = acceptedReceiptRulePath(row.rule_id, row.scope_id);
        const matches = row.state === 'committed_local' && validHead(row.local_commit) && row.local_parent === row.expected_base && validDigest(row.local_tree_digest) && validPublicationStagedMemberDigests(staged, JSON.parse(db.prepare('SELECT allowed_paths_json FROM lifecycle_action_transaction WHERE idempotency_key = ?').get(idempotency_key).allowed_paths_json)) && receipt.repository_identity === row.repository_identity_digest && receipt.scope_id === outwardPublicationScope(row.scope_id) && receipt.rule_id === row.rule_id && receipt.predecessor_commit === row.expected_base && receipt.accepted_commit === row.local_commit && receipt.tree_digest === row.local_tree_digest && receipt.content_hash === staged[rulePath] && receipt.transaction_digest === idempotency_key.slice(3);
        if (!matches) throw new Error('RULE_LIFECYCLE_ACTION_RECEIPT_INVALID');
        db.prepare('INSERT INTO lifecycle_action_accepted_receipt (idempotency_key, receipt_digest, receipt_json) VALUES (?, ?, ?)').run(idempotency_key, receipt_digest, receipt_json);
        fault?.('after_receipt');
        db.prepare('INSERT INTO lifecycle_action_handoff_head_proof (receipt_digest, transaction_digest, containing_head, proof_digest, proof_json, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(receipt_digest, receipt.transaction_digest, proof.containing_head, proof_digest, proof_json, created_at);
        fault?.('after_proof');
        const accepted_payload = canonical({ accepted_commit: receipt.accepted_commit, containing_head: proof.containing_head });
        db.prepare('INSERT INTO lifecycle_action_handoff_stage (receipt_digest, transaction_digest, stage, payload_digest, payload_json, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(receipt_digest, receipt.transaction_digest, 'receipt_accepted', createHash('sha256').update(accepted_payload).digest('hex'), accepted_payload, created_at);
        fault?.('after_stage');
        db.prepare("UPDATE lifecycle_action_transaction SET state = 'accepted_remote', terminal_reason = 'verified_remote', updated_at = ? WHERE idempotency_key = ?").run(created_at, idempotency_key);
        db.prepare("INSERT INTO lifecycle_action_transaction_event (idempotency_key,state,reason_code,created_at) VALUES (?,'accepted_remote','verified_remote',?)").run(idempotency_key, created_at);
        fault?.('after_event'); db.exec('COMMIT'); return freeze({ status: 'accepted_remote', state: 'accepted_remote', idempotency_key, receipt_digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readLifecycleActionAcceptedReceipt({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const row = db.prepare("SELECT receipt_digest, receipt_json FROM lifecycle_action_accepted_receipt AS accepted JOIN lifecycle_action_transaction AS tx ON tx.idempotency_key = accepted.idempotency_key WHERE accepted.idempotency_key = ? AND tx.state = 'accepted_remote'").get(idempotency_key);
      if (!row) return undefined; let receipt; try { receipt = JSON.parse(row.receipt_json); } catch { return undefined; }
      return validAcceptedReceipt(receipt) && LIFECYCLE_ACTION_STATES.includes(receipt.lifecycle_state) && createHash('sha256').update(canonical(receipt)).digest('hex') === row.receipt_digest ? freeze(receipt) : undefined;
    },
    readLifecycleActionHandoffHeadProofs({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return freeze([]);
      const receipt = this.readLifecycleActionAcceptedReceipt({ idempotency_key }); if (!receipt) return freeze([]);
      const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
      const rows = db.prepare('SELECT containing_head, proof_digest, proof_json FROM lifecycle_action_handoff_head_proof WHERE receipt_digest = ? AND transaction_digest = ? ORDER BY rowid').all(receipt_digest, receipt.transaction_digest);
      const proofs = rows.map((row) => { let proof; try { proof = JSON.parse(row.proof_json); } catch { return null; } return createHash('sha256').update(canonical(proof)).digest('hex') === row.proof_digest ? proof : null; });
      return freeze(proofs.filter(Boolean));
    },
    readLifecycleActionHandoffStage({ idempotency_key } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '')) return undefined;
      const receipt = this.readLifecycleActionAcceptedReceipt({ idempotency_key }); if (!receipt) return undefined;
      const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
      const row = db.prepare('SELECT stage, payload_digest, payload_json, updated_at FROM lifecycle_action_handoff_stage WHERE receipt_digest = ? AND transaction_digest = ?').get(receipt_digest, receipt.transaction_digest);
      if (!row) return freeze({ status: 'stage_incomplete', receipt_digest });
      let payload; try { payload = JSON.parse(row.payload_json); } catch { return freeze({ status: 'stage_incomplete', receipt_digest }); }
      if (!ACTION_HANDOFF_STAGES.includes(row.stage) || createHash('sha256').update(canonical(payload)).digest('hex') !== row.payload_digest) return freeze({ status: 'stage_incomplete', receipt_digest });
      return freeze({ status: 'verified', receipt_digest, stage: row.stage, payload: freeze(payload), payload_digest: row.payload_digest, updated_at: row.updated_at });
    },
    advanceLifecycleActionHandoffStage({ idempotency_key, stage, payload, created_at, fault } = {}) {
      if (!/^tx:[a-f0-9]{64}$/.test(idempotency_key || '') || !ACTION_HANDOFF_STAGES.includes(stage) || !validPublicationTime(created_at) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STAGE_INVALID');
      const safeKeys = ['accepted_commit', 'containing_head', 'containing_tree_digest', 'mirror_head', 'mirror_digest', 'projection_digest', 'epoch_closed_at', 'content_hash'];
      const base = payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).includes('accepted_commit') && Object.keys(payload).includes('containing_head') && Object.keys(payload).every((key) => safeKeys.includes(key));
      if (!base || !validHead(payload.accepted_commit) || !validHead(payload.containing_head) || (payload.containing_tree_digest !== undefined && payload.containing_tree_digest !== null && !validDigest(payload.containing_tree_digest)) || (payload.mirror_head !== undefined && payload.mirror_head !== null && !validHead(payload.mirror_head)) || (payload.mirror_digest !== undefined && payload.mirror_digest !== null && !validDigest(payload.mirror_digest)) || (payload.projection_digest !== undefined && payload.projection_digest !== null && !validDigest(payload.projection_digest)) || (payload.epoch_closed_at !== undefined && payload.epoch_closed_at !== null && !validPublicationTime(payload.epoch_closed_at)) || (payload.content_hash !== undefined && payload.content_hash !== null && !validDigest(payload.content_hash))) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STAGE_INVALID');
      const payload_json = canonical(payload); const payload_digest = createHash('sha256').update(payload_json).digest('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const receipt = this.readLifecycleActionAcceptedReceipt({ idempotency_key }); if (!receipt) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STAGE_INCOMPLETE');
        const receipt_digest = createHash('sha256').update(canonical(receipt)).digest('hex');
        if (payload.accepted_commit !== receipt.accepted_commit || payload.containing_head === receipt.predecessor_commit) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STAGE_INVALID');
        const current = db.prepare('SELECT stage, payload_digest FROM lifecycle_action_handoff_stage WHERE receipt_digest = ? AND transaction_digest = ?').get(receipt_digest, receipt.transaction_digest);
        if (!current) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STAGE_INCOMPLETE');
        if (current.stage === stage) { if (current.payload_digest !== payload_digest) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STAGE_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', stage, receipt_digest, payload_digest }); }
        if (ACTION_HANDOFF_STAGES.indexOf(stage) !== ACTION_HANDOFF_STAGES.indexOf(current.stage) + 1) throw new Error('RULE_LIFECYCLE_ACTION_HANDOFF_STAGE_TRANSITION_INVALID');
        db.prepare('UPDATE lifecycle_action_handoff_stage SET stage = ?, payload_digest = ?, payload_json = ?, updated_at = ? WHERE receipt_digest = ? AND transaction_digest = ?').run(stage, payload_digest, payload_json, created_at, receipt_digest, receipt.transaction_digest);
        fault?.('after_current'); db.exec('COMMIT'); return freeze({ status: 'advanced', stage, receipt_digest, payload_digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    setLocalRuleStop({ repository, scope_id, rule_id, reason_code, fault } = {}) {
      if (typeof repository !== 'string' || !repository || !LOCAL_STOP_REASONS.has(reason_code) || (fault !== undefined && typeof fault !== 'function')) throw new Error('RULE_LOCAL_STOP_INVALID');
      let scope; try { scope = externalPublicationScope(scope_id); } catch { throw new Error('RULE_LOCAL_STOP_INVALID'); }
      if (!validLocalStopIdentity(scope, rule_id)) throw new Error('RULE_LOCAL_STOP_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const enrolled = db.prepare('SELECT 1 FROM repository_enrollment WHERE repository = ? AND scope_id = ?').get(repository, scope);
        const canonicalRule = db.prepare('SELECT 1 FROM rule_identity WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(repository, scope, rule_id);
        if (!enrolled || !canonicalRule) throw new Error('RULE_LOCAL_STOP_INVALID');
        const row = db.prepare('SELECT reason_code FROM local_narrowing WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(repository, scope, rule_id);
        if (row?.reason_code === reason_code) { db.exec('COMMIT'); return freeze({ status: 'existing', ...safeLocalStop(repository, scope, rule_id, reason_code) }); }
        if (row) db.prepare('UPDATE local_narrowing SET reason_code = ? WHERE repository = ? AND scope_id = ? AND rule_id = ?').run(reason_code, repository, scope, rule_id); else db.prepare('INSERT INTO local_narrowing (repository,scope_id,rule_id,reason_code) VALUES (?,?,?,?)').run(repository, scope, rule_id, reason_code);
        fault?.('after_write'); db.exec('COMMIT'); return freeze({ status: row ? 'updated' : 'stopped', ...safeLocalStop(repository, scope, rule_id, reason_code) });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    clearLocalRuleStop({ repository, scope_id, rule_id } = {}) {
      if (typeof repository !== 'string' || !repository) throw new Error('RULE_LOCAL_STOP_INVALID');
      let scope; try { scope = externalPublicationScope(scope_id); } catch { throw new Error('RULE_LOCAL_STOP_INVALID'); }
      if (!validLocalStopIdentity(scope, rule_id)) throw new Error('RULE_LOCAL_STOP_INVALID');
      const changed = db.prepare('DELETE FROM local_narrowing WHERE repository = ? AND scope_id = ? AND rule_id = ?').run(repository, scope, rule_id).changes;
      return freeze({ status: changed ? 'cleared' : 'existing', repository_digest: digest(repository), scope_id: outwardPublicationScope(scope), rule_id });
    },
    readLocalRuleStop({ repository, scope_id, rule_id } = {}) {
      if (typeof repository !== 'string' || !repository) return undefined;
      let scope; try { scope = externalPublicationScope(scope_id); } catch { return undefined; }
      if (!validLocalStopIdentity(scope, rule_id)) return undefined;
      const row = db.prepare('SELECT reason_code FROM local_narrowing WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(repository, scope, rule_id);
      if (!row) return undefined;
      if (!LOCAL_STOP_REASONS.has(row.reason_code)) throw new Error('RULE_LOCAL_STOP_UNAVAILABLE');
      return safeLocalStop(repository, scope, rule_id, row.reason_code);
    },
    listLocalRuleStops({ repository, scope_id } = {}) {
      if (typeof repository !== 'string' || !repository) return freeze([]);
      let scope; try { scope = externalPublicationScope(scope_id); } catch { return freeze([]); }
      const rows = db.prepare('SELECT rule_id, reason_code FROM local_narrowing WHERE repository = ? AND scope_id = ? ORDER BY rule_id ASC').all(repository, scope);
      if (rows.some((row) => !validLocalStopIdentity(scope, row.rule_id) || !LOCAL_STOP_REASONS.has(row.reason_code))) throw new Error('RULE_LOCAL_STOP_UNAVAILABLE');
      return freeze(rows.map((row) => safeLocalStop(repository, scope, row.rule_id, row.reason_code)));
    },
    readLocalStopMigrationStatus() { return freeze({ status: db.prepare('SELECT 1 FROM migration_degraded WHERE singleton = 1').get() ? 'degraded' : 'verified' }); },
    /** Resolves the sole enrolled repository/scope owning one managed rule; undefined when absent or ambiguous. Read-only control-target lookup; never exposes paths, remotes, or authority material. */
    resolveLifecycleControlTarget({ rule_id } = {}) {
      if (typeof rule_id !== 'string' || !PUBLICATION_RULE.test(rule_id)) return undefined;
      const rows = db.prepare('SELECT r.repository, r.scope_id FROM rule_identity AS r JOIN repository_enrollment AS e ON e.repository = r.repository AND e.scope_id = r.scope_id WHERE r.rule_id = ?').all(rule_id);
      if (rows.length !== 1) return undefined;
      return freeze({ repository: rows[0].repository, scope_id: rows[0].scope_id === '' ? 'pidex-global' : rows[0].scope_id });
    },
    /** H-1 correction: store-owned locked control authority. Resolves exactly one enrolled rule to its current projection entry, writer enrollment target, canonical rule bytes, expected base, and protection/local-stop/epoch facts. Undefined when absent, ambiguous, or tampered; callers never supply authority. Control-scoped marker digests derive deterministically from store identity (kernel control gates use lifecycle_state/protection/stop; no evaluation claim is made). */
    readLifecycleControlAuthority({ rule_id } = {}) {
      if (typeof rule_id !== 'string' || !PUBLICATION_RULE.test(rule_id)) return undefined;
      const rows = db.prepare('SELECT r.repository, r.scope_id FROM rule_identity AS r JOIN repository_enrollment AS e ON e.repository = r.repository AND e.scope_id = r.scope_id WHERE r.rule_id = ?').all(rule_id);
      if (rows.length !== 1) return undefined;
      const { repository, scope_id: storeScope } = rows[0]; const scope = storeScope === '' ? null : storeScope;
      const projection = this.readProjection({ repository, scope_id: scope });
      const entry = projection?.entries?.find((item) => item.rule_id === rule_id);
      const enrollment = db.prepare('SELECT enrollment_digest, allowed_paths_json, predecessor, normalized_remote_digest, branch, author, writer_enabled, trailer_policy, repository_identity_digest, identity_platform, root_identity_digest, parent_identity_digest, files_identity_digest, identity_proof, publication_timestamp FROM publication_enrollment WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(repository, storeScope, rule_id);
      if (!entry || !enrollment || typeof entry.bytes !== 'string' || !entry.bytes || !/^commit:[a-f0-9]{40}$/.test(enrollment.predecessor || '') || !LIFECYCLE_STATES.includes(entry.lifecycle_state) || !validDigest(entry.rule_version) || !validDigest(entry.content_hash) || !validDigest(entry.mirror_digest || '')) return undefined;
      const writer_authority = { normalized_remote_digest: enrollment.normalized_remote_digest, branch: enrollment.branch, author: enrollment.author, writer_enabled: enrollment.writer_enabled === 1, trailer_policy: enrollment.trailer_policy, repository_identity_digest: enrollment.repository_identity_digest, identity_platform: enrollment.identity_platform, root_identity_digest: enrollment.root_identity_digest, parent_identity_digest: enrollment.parent_identity_digest, files_identity_digest: enrollment.files_identity_digest, identity_proof: enrollment.identity_proof, publication_timestamp: enrollment.publication_timestamp };
      if (!validWriterAuthority(writer_authority)) return undefined;
      let allowed_paths; try { allowed_paths = JSON.parse(enrollment.allowed_paths_json); } catch { return undefined; }
      const expected_base = enrollment.predecessor.slice(7); const scope_digest = digest(canonical({ repository, scope_id: storeScope, rule_id }));
      const target = { repository, tier: entry.tier, scope_id: outwardPublicationScope(storeScope), scope_digest, rule_id, predecessor: `commit:${expected_base}`, enrollment_digest: enrollment.enrollment_digest, allowed_paths, writer_authority };
      if (!validPublicationTarget(target)) return undefined;
      const stop = db.prepare('SELECT reason_code FROM local_narrowing WHERE repository = ? AND scope_id = ? AND rule_id = ?').get(repository, storeScope, rule_id);
      if (stop && !LOCAL_STOP_REASONS.has(stop.reason_code)) return undefined;
      const epoch = db.prepare('SELECT activation_epoch, closed_at FROM activation_epoch WHERE repository = ? AND scope_id = ? AND rule_id = ? AND rule_version = ? ORDER BY opened_at DESC LIMIT 1').get(repository, storeScope, rule_id, entry.rule_version);
      if (!entry.activation_epoch && !epoch) return undefined;
      const epoch_open = Boolean(epoch && epoch.closed_at === null); const local_stop_active = Boolean(stop); const identity = { repository, scope_id: storeScope, rule_id, rule_version: entry.rule_version, accepted_head: projection.accepted_head };
      const current = { tier: entry.tier, scope_id: scope, repository_scope_digest: scope_digest, rule_id, version_hash: entry.rule_version, content_hash: entry.content_hash, accepted_commit: expected_base, activation_epoch: entry.activation_epoch || epoch.activation_epoch, mirror_digest: entry.mirror_digest, resolver_snapshot_digest: digest(canonical({ ...identity, kind: 'control-resolver' })), exposure_publication_digest: digest(canonical({ ...identity, kind: 'control-exposure' })), policy_id: 'passive-impact-v1', policy_digest: digest(canonical({ ...identity, kind: 'control-policy' })), lifecycle_state: entry.lifecycle_state, protection_class: entry.protection_class, eligible: true, pinned: entry.lifecycle_state === 'active-pinned', local_stop_active, global_stop_active: false, mirror_trusted: true, cadence_due: true, history_state: epoch_open ? 'clear' : 'consumed' };
      return freeze({ current, target, rule_bytes: Buffer.from(entry.bytes, 'utf8'), expected_base, local_stop_active, epoch_open });
    },

    replaceProjection({ repository, scope_id = null, accepted_head, head, entries, is_descendant, event_kind } = {}) {
      if (typeof repository !== 'string' || !repository || !validHead(accepted_head) || !validHeadRecord(head, repository) || !validEntries(entries)) throw new Error('RULE_LIFECYCLE_PROJECTION_INVALID');
      const scope = scopeKey(scope_id);
      const previous = db.prepare('SELECT accepted_head, entries_json FROM effective_projection WHERE repository = ? AND scope_id = ?').get(repository, scope);
      if (previous && previous.accepted_head !== accepted_head && (typeof is_descendant !== 'function' || !is_descendant(previous.accepted_head, accepted_head))) throw new Error('RULE_LIFECYCLE_HEAD_ROLLBACK');
      const storedEntries = storeOwnedEntries(repository, scope, accepted_head, entries, previous ? JSON.parse(previous.entries_json) : []);
      // Replaying a crash after projection write must not create a duplicate lifecycle event.
      if (previous && previous.accepted_head === accepted_head && canonical(JSON.parse(previous.entries_json)) === canonical(storedEntries)) return;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO lifecycle_head (repository, scope_id, accepted_head, head_json) VALUES (?, ?, ?, ?) ON CONFLICT(repository, scope_id) DO UPDATE SET accepted_head = excluded.accepted_head, head_json = excluded.head_json').run(repository, scope, accepted_head, canonical(head));
        db.prepare('INSERT INTO lifecycle_event (repository, scope_id, accepted_head, event_kind, created_at) VALUES (?, ?, ?, ?, ?)').run(repository, scope, accepted_head, previous ? 'head_advanced' : (event_kind || 'head_initialized'), head.verified_at);
        const previousById = new Map((previous ? JSON.parse(previous.entries_json) : []).map((entry) => [entry.rule_id, entry]));
        for (const entry of storedEntries) {
          db.prepare('INSERT OR IGNORE INTO rule_identity (repository, scope_id, rule_id) VALUES (?, ?, ?)').run(repository, scope, entry.rule_id);
          db.prepare('INSERT OR IGNORE INTO rule_version (repository, scope_id, rule_id, rule_version) VALUES (?, ?, ?, ?)').run(repository, scope, entry.rule_id, entry.rule_version);
          db.prepare('INSERT OR IGNORE INTO rule_blob (content_hash, bytes_digest) VALUES (?, ?)').run(entry.content_hash, entry.content_hash);
          if (ACTIVE_STATES.includes(entry.lifecycle_state)) {
            db.prepare('UPDATE activation_epoch SET closed_at = ? WHERE repository = ? AND scope_id = ? AND rule_id = ? AND closed_at IS NULL AND rule_version <> ?').run(head.verified_at, repository, scope, entry.rule_id, entry.rule_version);
            db.prepare('INSERT OR IGNORE INTO activation_epoch (repository, scope_id, rule_id, rule_version, activation_epoch, opened_at, closed_at) VALUES (?, ?, ?, ?, ?, ?, NULL)').run(repository, scope, entry.rule_id, entry.rule_version, entry.activation_epoch, head.verified_at);
          } else {
            db.prepare('UPDATE activation_epoch SET closed_at = ? WHERE repository = ? AND scope_id = ? AND rule_id = ? AND closed_at IS NULL').run(head.verified_at, repository, scope, entry.rule_id);
          }
          const prior = previousById.get(entry.rule_id);
          if (prior && prior.lifecycle_state !== entry.lifecycle_state) db.prepare('INSERT INTO lifecycle_event (repository, scope_id, accepted_head, event_kind, created_at) VALUES (?, ?, ?, ?, ?)').run(repository, scope, accepted_head, ACTIVE_STATES.includes(entry.lifecycle_state) ? 'rule_activated' : 'rule_deactivated', head.verified_at);
        }
        db.prepare('INSERT INTO effective_projection (repository, scope_id, accepted_head, head_json, entries_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(repository, scope_id) DO UPDATE SET accepted_head = excluded.accepted_head, head_json = excluded.head_json, entries_json = excluded.entries_json').run(repository, scope, accepted_head, canonical(head), canonical(storedEntries));
        db.exec('COMMIT');
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    ensureBaselineProjection({ repository, scope_id = null, accepted_head, head, entries } = {}) {
      if (typeof repository !== 'string' || !repository || !validHead(accepted_head) || !validHeadRecord(head, repository) || !validEntries(entries)) throw new Error('RULE_LIFECYCLE_PROJECTION_INVALID');
      const existing = this.readProjection({ repository, scope_id });
      if (existing?.accepted_head) {
        const expected = storeOwnedEntries(repository, scopeKey(scope_id), accepted_head, entries, existing.entries);
        if (existing.accepted_head !== accepted_head || canonical(existing.head) !== canonical(head) || canonical(existing.entries) !== canonical(expected)) throw new Error('RULE_LIFECYCLE_BASELINE_CONFLICT');
        return freeze({ created: false, projection: existing });
      }
      this.replaceProjection({ repository, scope_id, accepted_head, head, entries, event_kind: 'baseline_imported' });
      return freeze({ created: true, projection: this.readProjection({ repository, scope_id }) });
    },
    getOrCreateRuntimeContext(pipeline_id, input_digests, createRuntimeContext) {
      if (typeof pipeline_id !== 'string' || !pipeline_id || !validRuntimeDigests(input_digests) || typeof createRuntimeContext !== 'function') throw new Error('RULE_RUNTIME_CONTEXT_INVALID');
      const input_json = canonical(input_digests);
      // Creator is verified authority. Persisted runtime rows are non-authoritative history/cache only.
      const created = createRuntimeContext();
      const load = () => db.prepare('SELECT input_digests_json, context_json FROM runtime_context WHERE pipeline_id = ?').get(pipeline_id);
      const existing = load();
      if (existing && existing.input_digests_json !== input_json) throw new Error('RULE_RUNTIME_CONTEXT_CONFLICT');
      if (!validRuntimeContext(created, pipeline_id, input_digests)) throw new Error('RULE_RUNTIME_CONTEXT_INVALID');
      const context_json = canonical(created);
      const context_digest = createHash('sha256').update(context_json).digest('hex');
      const context = freeze(created);
      const matchesCreatedContext = (row) => {
        try { return createHash('sha256').update(canonical(JSON.parse(row.context_json))).digest('hex') === context_digest; } catch { return false; }
      };
      if (existing && matchesCreatedContext(existing)) return context;
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = load();
        if (current && current.input_digests_json !== input_json) throw new Error('RULE_RUNTIME_CONTEXT_CONFLICT');
        if (!current) db.prepare('INSERT INTO runtime_context (pipeline_id, input_digests_json, context_json) VALUES (?, ?, ?)').run(pipeline_id, input_json, context_json);
        else if (!matchesCreatedContext(current)) db.prepare('UPDATE runtime_context SET context_json = ? WHERE pipeline_id = ?').run(context_json, pipeline_id);
        db.exec('COMMIT');
        return context;
      } catch (error) { try { db.exec('ROLLBACK'); } catch { /* transaction already closed */ } throw error; }
    },
    consumeVerifiedReceipt({ receipt, verify } = {}) {
      if (!receipt || typeof receipt !== 'object' || Object.keys(receipt).length !== 4 || !validDigest(receipt.receipt_digest) || !validDigest(receipt.transaction_digest) || !validHead(receipt.accepted_commit) || !validDigest(receipt.tree_digest) || typeof verify !== 'function') throw new Error('RULE_RECEIPT_INVALID');
      const find = () => db.prepare('SELECT receipt_digest, transaction_digest, result_json FROM receipt_consumption WHERE receipt_digest = ? OR transaction_digest = ?').all(receipt.receipt_digest, receipt.transaction_digest);
      const stored = find();
      if (stored.length) {
        const exact = stored.length === 1 && stored[0].receipt_digest === receipt.receipt_digest && stored[0].transaction_digest === receipt.transaction_digest;
        if (!exact) throw new Error('RULE_RECEIPT_CONFLICT');
        return freeze(JSON.parse(stored[0].result_json));
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const raced = find();
        if (raced.length) {
          const exact = raced.length === 1 && raced[0].receipt_digest === receipt.receipt_digest && raced[0].transaction_digest === receipt.transaction_digest;
          if (!exact) throw new Error('RULE_RECEIPT_CONFLICT');
          const result = freeze(JSON.parse(raced[0].result_json)); db.exec('COMMIT'); return result;
        }
        const verified = verify();
        if (!verified || verified.accepted_commit !== receipt.accepted_commit || verified.tree_digest !== receipt.tree_digest || !verified.result || typeof verified.result !== 'object') throw new Error('RULE_RECEIPT_VERIFICATION_FAILED');
        const result = freeze(verified.result);
        db.prepare('INSERT INTO receipt_consumption (receipt_digest, transaction_digest, result_json) VALUES (?, ?, ?)').run(receipt.receipt_digest, receipt.transaction_digest, canonical(result));
        db.exec('COMMIT');
        return result;
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    startProducerPublication({ pipeline_id, terminal_outcome_ref, family, execution, impact_contract } = {}) {
      const opening = { pipeline_id, terminal_outcome_ref, family, execution, impact_contract };
      if (!validProducerOpening(opening)) throw new Error('RULE_IMPACT_PRODUCER_OPENING_INVALID');
      const capability = Object.freeze({});
      producerPublicationCapabilities.set(capability, freeze({ pipeline_id, terminal_outcome_ref, family, execution, impact_contract: { ...impact_contract, impact_contract_bytes: Buffer.from(impact_contract.impact_contract_bytes) } }));
      return capability;
    },
    finalizeProducerPublication({ producer, terminal_outcome } = {}) {
      const opening = producerPublicationCapabilities.get(producer);
      if (!opening) throw new Error('RULE_IMPACT_PRODUCER_CAPABILITY_INVALID');
      if (!validProducerTerminal(terminal_outcome, opening.family)) throw new Error('RULE_IMPACT_PRODUCER_TERMINAL_INVALID');
      const payload = producerPublicationPayload(opening, terminal_outcome); const publication_bytes = producerBytes(payload); const producer_publication_digest = hashBytes(publication_bytes);
      const reference = freeze({ publication_id: `rule-impact-producer:${producer_publication_digest}`, producer_publication_digest });
      const existing = db.prepare('SELECT producer_publication_digest, publication_bytes FROM impact_producer_publication WHERE pipeline_id = ? AND terminal_outcome_ref = ?').get(opening.pipeline_id, opening.terminal_outcome_ref);
      if (existing) {
        if (existing.producer_publication_digest !== producer_publication_digest || !Buffer.from(existing.publication_bytes).equals(publication_bytes)) throw new Error('RULE_IMPACT_PRODUCER_CONFLICT');
        return freeze({ status: 'existing', reference });
      }
      const familyBytes = producerBytes(opening.family); const executionBytes = producerBytes(opening.execution); const terminalBytes = producerBytes(terminal_outcome);
      for (const [directoryName, bytes] of [['rule-impact-family', familyBytes], ['rule-impact-execution', executionBytes], ['rule-impact-contract', Buffer.from(opening.impact_contract.impact_contract_bytes)], ['rule-impact-terminal-outcome', terminalBytes], ['rule-impact-producer-publication', publication_bytes]]) writeImmutableInput(stateRoot, { input_digest: hashBytes(bytes), bytes }, { directoryName });
      db.exec('BEGIN IMMEDIATE');
      try {
        const raced = db.prepare('SELECT producer_publication_digest, publication_bytes FROM impact_producer_publication WHERE pipeline_id = ? AND terminal_outcome_ref = ?').get(opening.pipeline_id, opening.terminal_outcome_ref);
        if (raced) { if (raced.producer_publication_digest !== producer_publication_digest || !Buffer.from(raced.publication_bytes).equals(publication_bytes)) throw new Error('RULE_IMPACT_PRODUCER_CONFLICT'); db.exec('COMMIT'); return freeze({ status: 'existing', reference }); }
        db.prepare('INSERT INTO impact_producer_publication (pipeline_id, terminal_outcome_ref, producer_publication_digest, publication_bytes, family_digest, execution_digest, impact_contract_digest, outcome_source_digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(opening.pipeline_id, opening.terminal_outcome_ref, producer_publication_digest, publication_bytes, hashBytes(familyBytes), hashBytes(executionBytes), opening.impact_contract.impact_contract_digest, payload.outcome_source_digest);
        db.exec('COMMIT'); return freeze({ status: 'recorded', reference });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readVerifiedProducerPublication({ reference } = {}) {
      if (!reference || !exactKeys(reference, ['publication_id', 'producer_publication_digest']) || reference.publication_id !== `rule-impact-producer:${reference.producer_publication_digest}` || !validDigest(reference.producer_publication_digest)) return freeze({ outcome: 'unavailable' });
      const row = db.prepare('SELECT publication_bytes, family_digest, execution_digest, impact_contract_digest, outcome_source_digest FROM impact_producer_publication WHERE producer_publication_digest = ?').get(reference.producer_publication_digest);
      if (!row || !byteBuffer(row.publication_bytes) || hashBytes(row.publication_bytes) !== reference.producer_publication_digest) return freeze({ outcome: 'unavailable' });
      try {
        const payload = JSON.parse(Buffer.from(row.publication_bytes).toString('utf8'));
        if (!exactKeys(payload, PRODUCER_PUBLICATION_KEYS) || payload.schema !== 'rule-impact-producer-publication-v1' || !validProducerFamily(payload.family) || !validProducerExecution(payload.execution) || hashBytes(producerBytes(payload.family)) !== row.family_digest || hashBytes(producerBytes(payload.execution)) !== row.execution_digest || payload.impact_contract_digest !== row.impact_contract_digest || payload.outcome_source_digest !== row.outcome_source_digest || hashBytes(Buffer.from(payload.impact_contract_bytes, 'utf8')) !== payload.impact_contract_digest || !validDigest(payload.config_digest) || payload.config_digest !== hashBytes(producerBytes(payload.execution)) || payload.outcome_source_identity !== `rule-impact-outcome:${payload.outcome_source_digest}`) return freeze({ outcome: 'unavailable' });
        const terminalBytes = readContentAddressedBlob(stateRoot, 'rule-impact-terminal-outcome', payload.outcome_source_digest); const familyBytes = readContentAddressedBlob(stateRoot, 'rule-impact-family', row.family_digest); const executionBytes = readContentAddressedBlob(stateRoot, 'rule-impact-execution', row.execution_digest); const contractBytes = readContentAddressedBlob(stateRoot, 'rule-impact-contract', row.impact_contract_digest); const publicationBytes = readContentAddressedBlob(stateRoot, 'rule-impact-producer-publication', reference.producer_publication_digest);
        if (!terminalBytes || !familyBytes || !executionBytes || !contractBytes || !publicationBytes || !publicationBytes.equals(Buffer.from(row.publication_bytes)) || !familyBytes.equals(producerBytes(payload.family)) || !executionBytes.equals(producerBytes(payload.execution)) || !contractBytes.equals(Buffer.from(payload.impact_contract_bytes, 'utf8'))) return freeze({ outcome: 'unavailable' });
        const terminal = JSON.parse(terminalBytes.toString('utf8')); if (!validProducerTerminal(terminal, payload.family) || terminal.outcome_finalized_at !== payload.outcome_finalized_at || canonical(terminal.outcome_vector) !== canonical(payload.outcome_vector)) return freeze({ outcome: 'unavailable' });
        return freeze({ outcome: 'available', reference: freeze({ ...reference }), measurement: freeze(producerMeasurement(payload, terminal)) });
      } catch { return freeze({ outcome: 'unavailable' }); }
    },
    recordImpactStorageAttempt({ attempt_digest, exposure_id = null, publication_digest = null, reason, timestamp } = {}) {
      const reasons = new Set(['pre_serialization_storage_unavailable', 'pre_blob_storage_unavailable', 'partial_blob_storage_unavailable', 'index_storage_unavailable']);
      if (!validDigest(attempt_digest) || (exposure_id !== null && (typeof exposure_id !== 'string' || !/^exposure:[a-f0-9]{64}$/.test(exposure_id))) || (publication_digest !== null && !validDigest(publication_digest)) || !reasons.has(reason) || !validTime(timestamp)) throw new Error('RULE_IMPACT_STORAGE_ATTEMPT_INVALID');
      db.prepare('INSERT OR IGNORE INTO impact_storage_attempt (attempt_digest, schema, exposure_id, publication_digest, reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(attempt_digest, 'rule-impact-storage-attempt-v1', exposure_id, publication_digest, reason, timestamp);
    },
    recordImpactFanout({ exposure_id, publication_digest, fanout_fingerprint, target_input_ids, target_input_digests, history_descriptors, fault } = {}) {
      const validInputId = (value) => typeof value === 'string' && /^rule-impact-input:[a-f0-9]{64}$/.test(value);
      if (typeof exposure_id !== 'string' || !/^exposure:[a-f0-9]{64}$/.test(exposure_id) || !validDigest(publication_digest) || !validDigest(fanout_fingerprint) || !Array.isArray(target_input_ids) || !Array.isArray(target_input_digests) || !target_input_ids.length || target_input_ids.length !== target_input_digests.length || target_input_ids.some((value, index) => !validInputId(value) || value.slice('rule-impact-input:'.length) !== target_input_digests[index]) || target_input_digests.some((value) => !validDigest(value)) || new Set(target_input_ids).size !== target_input_ids.length) throw new Error('RULE_IMPACT_FANOUT_INVALID');
      const descriptors = history_descriptors === undefined ? undefined : history_descriptors;
      if (descriptors !== undefined && (!Array.isArray(descriptors) || descriptors.length !== target_input_ids.length || descriptors.some((descriptor, ordinal) => !validHistoryDescriptor(descriptor) || descriptor.exposure_id !== exposure_id || descriptor.publication_digest !== publication_digest || descriptor.input_id !== target_input_ids[ordinal] || descriptor.input_digest !== target_input_digests[ordinal] || descriptor.target_ordinal !== ordinal) || new Set(descriptors.map((descriptor) => descriptor.input_id)).size !== descriptors.length)) throw new Error('RULE_IMPACT_HISTORY_DESCRIPTOR_INVALID');
      const publication = { exposure_id, publication_digest, fanout_fingerprint, target_input_ids, target_input_digests };
      const find = () => db.prepare('SELECT fanout_fingerprint, target_input_ids_json, target_input_digests_json FROM impact_publication_fanout WHERE exposure_id = ? AND publication_digest = ?').get(exposure_id, publication_digest);
      const existing = find();
      if (existing) {
        const stored = { exposure_id, publication_digest, fanout_fingerprint: existing.fanout_fingerprint, target_input_ids: JSON.parse(existing.target_input_ids_json), target_input_digests: JSON.parse(existing.target_input_digests_json) };
        if (canonical(stored) !== canonical(publication)) throw new Error('RULE_IMPACT_FANOUT_CONFLICT');
        if (descriptors !== undefined) {
          const persisted = db.prepare('SELECT exposure_id, publication_digest, input_id, input_digest, target_ordinal, tier, scope_id, production_started_at, captured_at FROM impact_input_history WHERE exposure_id = ? AND publication_digest = ? ORDER BY target_ordinal').all(exposure_id, publication_digest);
          if (canonical(persisted) !== canonical(descriptors)) throw new Error('RULE_IMPACT_FANOUT_CONFLICT');
        }
        return freeze({ status: 'committed', target_input_ids: freeze([...target_input_ids]) });
      }
      transaction('BEGIN', 'BEGIN IMMEDIATE');
      try {
        fault?.('after_begin');
        const raced = find();
        if (raced) throw new Error('RULE_IMPACT_FANOUT_CONFLICT');
        db.prepare('INSERT INTO impact_publication_fanout (exposure_id, publication_digest, fanout_fingerprint, target_count, target_input_ids_json, target_input_digests_json) VALUES (?, ?, ?, ?, ?, ?)').run(exposure_id, publication_digest, fanout_fingerprint, target_input_ids.length, canonical(target_input_ids), canonical(target_input_digests));
        fault?.('after_fanout_insert');
        const index = db.prepare('INSERT INTO impact_target_index (exposure_id, publication_digest, ordinal, input_id, input_digest) VALUES (?, ?, ?, ?, ?)');
        target_input_ids.forEach((inputId, ordinal) => { index.run(exposure_id, publication_digest, ordinal, inputId, target_input_digests[ordinal]); fault?.('after_target_insert', ordinal); });
        if (descriptors !== undefined) {
          const insertHistory = db.prepare('INSERT INTO impact_input_history (exposure_id, publication_digest, input_id, input_digest, target_ordinal, tier, scope_id, production_started_at, captured_at) VALUES (@exposure_id, @publication_digest, @input_id, @input_digest, @target_ordinal, @tier, @scope_id, @production_started_at, @captured_at)');
          descriptors.forEach((descriptor) => insertHistory.run(descriptor));
        }
        fault?.('pre_commit');
        transaction('COMMIT', 'COMMIT');
        fault?.('post_commit');
        return freeze({ status: 'committed', target_input_ids: freeze([...target_input_ids]) });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    listIndexedImpactInputs({ tier, scope_id, start_at, end_at } = {}) {
      if (!['global', 'project'].includes(tier) || (tier === 'global' ? scope_id !== '' : !validSafeText(scope_id)) || !validTime(start_at) || !validTime(end_at) || Date.parse(start_at) >= Date.parse(end_at)) return Object.freeze([]);
      return freeze(db.prepare('SELECT exposure_id, publication_digest, input_id, input_digest, target_ordinal, tier, scope_id, production_started_at, captured_at FROM impact_input_history WHERE tier = ? AND scope_id = ? AND production_started_at >= ? AND production_started_at < ? ORDER BY production_started_at, exposure_id, target_ordinal, input_id LIMIT 256').all(tier, scope_id, start_at, end_at).map((row) => freeze({ ...row })));
    },
    readIndexedImpactInputReference({ reference } = {}) {
      if (!validHistoryDescriptor(reference)) return undefined;
      const row = db.prepare('SELECT exposure_id, publication_digest, input_id, input_digest, target_ordinal, tier, scope_id, production_started_at, captured_at FROM impact_input_history WHERE input_id = ? AND input_digest = ? AND exposure_id = ? AND publication_digest = ? AND target_ordinal = ?').get(reference.input_id, reference.input_digest, reference.exposure_id, reference.publication_digest, reference.target_ordinal);
      return row && canonical(row) === canonical(reference) ? freeze({ ...row }) : undefined;
    },
    recordImpactContract({ impact_contract_ref, impact_contract_digest, impact_contract_bytes } = {}) {
      if (!validSafeText(impact_contract_ref) || !validDigest(impact_contract_digest) || !Buffer.isBuffer(impact_contract_bytes) || !impact_contract_bytes.length || hashBytes(impact_contract_bytes) !== impact_contract_digest) throw new Error('RULE_IMPACT_CONTRACT_INVALID');
      const existing = db.prepare('SELECT impact_contract_digest, impact_contract_bytes FROM impact_contract_authority WHERE impact_contract_ref = ? OR impact_contract_digest = ?').all(impact_contract_ref, impact_contract_digest);
      if (existing.length) {
        if (existing.length !== 1 || existing[0].impact_contract_digest !== impact_contract_digest || !Buffer.from(existing[0].impact_contract_bytes).equals(impact_contract_bytes)) throw new Error('RULE_IMPACT_CONTRACT_CONFLICT');
        return freeze({ status: 'existing', impact_contract_ref, impact_contract_digest });
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const raced = db.prepare('SELECT impact_contract_digest, impact_contract_bytes FROM impact_contract_authority WHERE impact_contract_ref = ? OR impact_contract_digest = ?').all(impact_contract_ref, impact_contract_digest);
        if (raced.length) throw new Error('RULE_IMPACT_CONTRACT_CONFLICT');
        db.prepare('INSERT INTO impact_contract_authority (impact_contract_ref, impact_contract_digest, impact_contract_bytes) VALUES (?, ?, ?)').run(impact_contract_ref, impact_contract_digest, impact_contract_bytes);
        db.exec('COMMIT'); return freeze({ status: 'recorded', impact_contract_ref, impact_contract_digest });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    createImpactAggregateCapability({ private_mint, read_set } = {}) {
      // `private_mint` is minted only by results' selected-family WeakMap binding. Never accept caller selection metadata.
      if (!isImpactAggregateCapabilityMint(private_mint) || !validAggregateReadSet(read_set)) return undefined;
      const capability = Object.freeze({}); aggregateCommitCapabilities.set(capability, freeze({ private_mint, read_set, consumed_request: null })); return capability;
    },
    recordImpactInputAggregate({ target, target_t0, target_opening, impact_contract, families, capability, fault } = {}) {
      const capabilityRecord = aggregateCommitCapabilities.get(capability);
      if (!capabilityRecord) throw new Error('RULE_IMPACT_AGGREGATE_CAPABILITY_REQUIRED');
      if (!validImpactTargetSelector(target) || !validTime(target_t0) || !validAggregateOpening(target_opening) || !validAggregateContract(impact_contract) || !Array.isArray(families) || !families.length || families.some((family) => !validAggregateFamily(family)) || new Set(families.map((family) => family.family_id)).size !== families.length) throw new Error('RULE_IMPACT_AGGREGATE_INVALID');
      const request = { target, target_t0, target_opening, impact_contract, families };
      if (!exactAggregateRequest(capabilityRecord.read_set.request, request) || (capabilityRecord.consumed_request && !exactAggregateRequest(capabilityRecord.consumed_request, request))) throw new Error('RULE_IMPACT_AGGREGATE_CAPABILITY_REQUIRED');
      const ranks = new Map(['H2', 'H1', 'W1', 'W2'].map((window, index) => [window, index]));
      const ordered = [...families].sort((left, right) => ranks.get(left.window_code) - ranks.get(right.window_code) || left.production_started_at.localeCompare(right.production_started_at) || left.family_id.localeCompare(right.family_id));
      if (ordered.some((family, index) => family !== families[index]) || (target.tier === 'project' && families.some((family) => family.project_scope !== target.scope_id))) throw new Error('RULE_IMPACT_AGGREGATE_INVALID');
      // Optimistic phase proves only closed capability/request shape. Authority proof repeats after BEGIN IMMEDIATE.
      if (!verifyAggregateReferences(db, stateRoot, request, capabilityRecord.read_set)) throw new Error('RULE_IMPACT_AGGREGATE_AUTHORITY_UNAVAILABLE');
      fault?.('after_preflight');
      const aggregate_bytes = Buffer.from(JSON.stringify(aggregatePayload({ target_opening, impact_contract, families })), 'utf8'); const measurement_input_digest = hashBytes(aggregate_bytes); const measurement_input_id = `rule-impact-input:${measurement_input_digest}`;
      // Blob-first publication; unindexed bytes remain inert on transaction failure.
      writeImmutableInput(stateRoot, { input_digest: measurement_input_digest, bytes: aggregate_bytes }, { directoryName: 'rule-impact-input-aggregate' });
      fault?.('after_blob_publication');
      const claim = { opening_id: target_opening.opening_id, opening_projection_digest: target_opening.opening_projection_digest, impact_contract_ref: impact_contract.impact_contract_ref, impact_contract_digest: impact_contract.impact_contract_digest, target_t0 };
      const findClaim = () => db.prepare('SELECT claim.measurement_input_id, claim.measurement_input_digest, aggregate.aggregate_bytes FROM impact_input_aggregate_claim AS claim JOIN impact_input_aggregate AS aggregate ON aggregate.measurement_input_id = claim.measurement_input_id WHERE claim.opening_id = ? AND claim.opening_projection_digest = ? AND claim.impact_contract_ref = ? AND claim.impact_contract_digest = ? AND claim.target_t0 = ?').get(claim.opening_id, claim.opening_projection_digest, claim.impact_contract_ref, claim.impact_contract_digest, claim.target_t0);
      const existing = findClaim();
      if (existing) {
        if (existing.measurement_input_id !== measurement_input_id || existing.measurement_input_digest !== measurement_input_digest || !Buffer.from(existing.aggregate_bytes).equals(aggregate_bytes)) throw new Error('RULE_IMPACT_AGGREGATE_CONFLICT');
        return freeze({ status: 'existing', measurement_input_id, measurement_input_digest, aggregate_bytes: Buffer.from(existing.aggregate_bytes) });
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        fault?.('after_begin');
        if (!verifyAggregateReferences(db, stateRoot, request, capabilityRecord.read_set)) throw new Error('RULE_IMPACT_AGGREGATE_AUTHORITY_UNAVAILABLE');
        const raced = findClaim();
        if (raced) throw new Error('RULE_IMPACT_AGGREGATE_CONFLICT');
        fault?.('before_index');
        db.prepare('INSERT INTO impact_input_aggregate (measurement_input_id, measurement_input_digest, opening_id, opening_projection_digest, impact_contract_ref, impact_contract_digest, family_count, aggregate_blob_digest, aggregate_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(measurement_input_id, measurement_input_digest, target_opening.opening_id, target_opening.opening_projection_digest, impact_contract.impact_contract_ref, impact_contract.impact_contract_digest, families.length, measurement_input_digest, aggregate_bytes);
        fault?.('after_blob_insert');
        db.prepare('INSERT INTO impact_input_aggregate_claim (opening_id, opening_projection_digest, impact_contract_ref, impact_contract_digest, target_t0, measurement_input_id, measurement_input_digest) VALUES (@opening_id, @opening_projection_digest, @impact_contract_ref, @impact_contract_digest, @target_t0, @measurement_input_id, @measurement_input_digest)').run({ ...claim, measurement_input_id, measurement_input_digest });
        fault?.('pre_commit');
        fault?.('before_commit');
        db.exec('COMMIT');
        aggregateCommitCapabilities.set(capability, freeze({ ...capabilityRecord, consumed_request: request }));
        return freeze({ status: 'recorded', measurement_input_id, measurement_input_digest, aggregate_bytes: Buffer.from(aggregate_bytes) });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readImpactInputAggregate({ measurement_input_id } = {}) {
      if (!CADENCE_INPUT_ID.test(measurement_input_id || '')) return freeze({ outcome: 'unavailable' });
      try {
        const row = db.prepare('SELECT measurement_input_digest, opening_id, opening_projection_digest, impact_contract_ref, impact_contract_digest, family_count, aggregate_blob_digest, aggregate_bytes FROM impact_input_aggregate WHERE measurement_input_id = ?').get(measurement_input_id);
        if (!row || !(Buffer.isBuffer(row.aggregate_bytes) || row.aggregate_bytes instanceof Uint8Array) || row.measurement_input_digest !== row.aggregate_blob_digest || hashBytes(row.aggregate_bytes) !== row.measurement_input_digest || measurement_input_id !== `rule-impact-input:${row.measurement_input_digest}`) return freeze({ outcome: 'unavailable' });
        const aggregateBlob = readContentAddressedBlob(stateRoot, 'rule-impact-input-aggregate', row.aggregate_blob_digest);
        if (!aggregateBlob || !aggregateBlob.equals(Buffer.from(row.aggregate_bytes))) return freeze({ outcome: 'unavailable' });
        const payload = JSON.parse(Buffer.from(row.aggregate_bytes)); if (!exactKeys(payload, ['schema', 'target_opening', 'impact_contract', 'families']) || payload.schema !== 'rule-impact-measurement-input-aggregate-v1' || !validAggregateOpening(payload.target_opening) || !validAggregateContract(payload.impact_contract) || !Array.isArray(payload.families) || payload.families.length !== row.family_count || payload.families.some((family) => !validAggregateFamily(family)) || !Buffer.from(JSON.stringify(payload)).equals(row.aggregate_bytes)) return freeze({ outcome: 'unavailable' });
        const opening = db.prepare('SELECT tier, scope_id, rule_id, version_hash, content_hash, activation_epoch, opening_id, opening_projection_digest, opening_blob_id, opening_blob_digest FROM impact_lifecycle_opening WHERE opening_id = ? AND opening_projection_digest = ? AND opening_blob_id = ? AND opening_blob_digest = ?').get(payload.target_opening.opening_id, payload.target_opening.opening_projection_digest, payload.target_opening.opening_blob_id, payload.target_opening.opening_blob_digest);
        const contract = db.prepare('SELECT impact_contract_bytes FROM impact_contract_authority WHERE impact_contract_ref = ? AND impact_contract_digest = ?').get(payload.impact_contract.impact_contract_ref, payload.impact_contract.impact_contract_digest);
        const target = opening && { tier: opening.tier, scope_id: opening.scope_id, rule_id: opening.rule_id, version_hash: opening.version_hash, content_hash: opening.content_hash, activation_epoch: opening.activation_epoch };
        if (!opening || !validImpactTargetSelector(target) || !contract || !byteBuffer(contract.impact_contract_bytes) || hashBytes(contract.impact_contract_bytes) !== payload.impact_contract.impact_contract_digest || payload.target_opening.opening_id !== row.opening_id || payload.target_opening.opening_projection_digest !== row.opening_projection_digest || payload.impact_contract.impact_contract_ref !== row.impact_contract_ref || payload.impact_contract.impact_contract_digest !== row.impact_contract_digest || !verifyAggregateReferences(db, stateRoot, { target, target_t0: '1970-01-01T00:00:00.000Z', target_opening: payload.target_opening, impact_contract: payload.impact_contract, families: payload.families })) return freeze({ outcome: 'unavailable' });
        return freeze({ outcome: 'available', bytes: Buffer.from(row.aggregate_bytes), authority: freeze({ measurement_input_id, measurement_input_digest: row.measurement_input_digest, family_count: row.family_count }) });
      } catch { return freeze({ outcome: 'unavailable' }); }
    },
    recordLifecycleImpactOpening({ target, opening_kind, opening_id, opening_digest, opening_bytes, opened_at, accepted_head, source_head, mirror_head, projection_revision } = {}) {
      if (!validImpactTargetSelector(target) || !validSafeText(opening_kind) || !validSafeText(opening_id) || !validDigest(opening_digest) || !Buffer.isBuffer(opening_bytes) || !opening_bytes.length || !validTime(opened_at) || ![accepted_head, source_head, mirror_head].every(validHead) || !validSafeText(projection_revision)) throw new Error('RULE_IMPACT_OPENING_INVALID');
      let parsed; try { parsed = JSON.parse(opening_bytes); } catch { throw new Error('RULE_IMPACT_OPENING_INVALID'); }
      const v2 = ['activation_opened', 'reactivation_opened'].includes(opening_kind);
      const projection = v2 && Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'opening_digest'));
      const opening_projection_digest = v2 ? createHash('sha256').update(JSON.stringify(projection)).digest('hex') : null;
      const opening_blob_digest = createHash('sha256').update(opening_bytes).digest('hex');
      if (v2 && (JSON.stringify(parsed) !== opening_bytes.toString('utf8') || parsed.kind !== opening_kind || parsed.opening_id !== opening_id || parsed.opening_digest !== opening_digest || parsed.opened_at !== opened_at || parsed.rule_id !== target.rule_id || parsed.version_hash !== target.version_hash || parsed.accepted_commit !== accepted_head || parsed.projection_revision !== Number(projection_revision) || opening_projection_digest !== opening_digest)) throw new Error('RULE_IMPACT_OPENING_INVALID');
      // Legacy one-digest rows remain readable operational history only; never EI authority.
      if (!v2 && opening_blob_digest !== opening_digest) throw new Error('RULE_IMPACT_OPENING_INVALID');
      const opening_blob_id = v2 ? `rule-impact-opening-blob:${opening_blob_digest}` : null;
      if (v2) writeImmutableInput(stateRoot, { input_digest: opening_blob_digest, bytes: opening_bytes }, { directoryName: 'rule-impact-opening' });
      const existing = db.prepare('SELECT * FROM impact_lifecycle_opening WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ?').get(...targetSelectorValues(target));
      const record = { ...target, opening_kind, opening_id, opening_digest, opening_bytes, opened_at, accepted_head, source_head, mirror_head, projection_revision, opening_projection_digest, opening_blob_id, opening_blob_digest: v2 ? opening_blob_digest : null };
      if (existing) {
        const same = ['opening_kind', 'opening_id', 'opening_digest', 'opened_at', 'accepted_head', 'source_head', 'mirror_head', 'projection_revision', 'opening_projection_digest', 'opening_blob_id', 'opening_blob_digest'].every((key) => existing[key] === record[key]) && Buffer.from(existing.opening_bytes).equals(opening_bytes);
        if (!same) throw new Error('RULE_IMPACT_OPENING_CONFLICT');
        return freeze({ status: 'existing', opening_id, opening_digest, ...(v2 ? { opening_blob_id, opening_blob_digest } : {}) });
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const raced = db.prepare('SELECT * FROM impact_lifecycle_opening WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ?').get(...targetSelectorValues(target));
        if (raced) throw new Error('RULE_IMPACT_OPENING_CONFLICT');
        db.prepare('INSERT INTO impact_lifecycle_opening (tier,scope_id,rule_id,version_hash,content_hash,activation_epoch,opening_kind,opening_id,opening_digest,opening_bytes,opened_at,accepted_head,source_head,mirror_head,projection_revision,opening_projection_digest,opening_blob_id,opening_blob_digest) VALUES (@tier,@scope_id,@rule_id,@version_hash,@content_hash,@activation_epoch,@opening_kind,@opening_id,@opening_digest,@opening_bytes,@opened_at,@accepted_head,@source_head,@mirror_head,@projection_revision,@opening_projection_digest,@opening_blob_id,@opening_blob_digest)').run(record);
        db.exec('COMMIT'); return freeze({ status: 'recorded', opening_id, opening_digest, ...(v2 ? { opening_blob_id, opening_blob_digest } : {}) });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readLifecycleImpactOpening({ target } = {}) {
      if (!validImpactTargetSelector(target)) return undefined;
      const row = db.prepare('SELECT opening_kind, opening_id, opening_digest, opening_bytes, opened_at, accepted_head, source_head, mirror_head, projection_revision, opening_projection_digest, opening_blob_id, opening_blob_digest FROM impact_lifecycle_opening WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ?').get(...targetSelectorValues(target));
      if (!row || !row.opening_projection_digest || !row.opening_blob_id || !validDigest(row.opening_blob_digest) || !(Buffer.isBuffer(row.opening_bytes) || row.opening_bytes instanceof Uint8Array) || createHash('sha256').update(row.opening_bytes).digest('hex') !== row.opening_blob_digest) return undefined;
      const openingBlob = readContentAddressedBlob(stateRoot, 'rule-impact-opening', row.opening_blob_digest);
      if (!openingBlob || !openingBlob.equals(Buffer.from(row.opening_bytes))) return undefined;
      let parsed; try { parsed = JSON.parse(Buffer.from(row.opening_bytes).toString('utf8')); } catch { return undefined; }
      const projection = Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== 'opening_digest'));
      if (JSON.stringify(parsed) !== Buffer.from(row.opening_bytes).toString('utf8') || parsed.opening_digest !== row.opening_digest || createHash('sha256').update(JSON.stringify(projection)).digest('hex') !== row.opening_projection_digest || row.opening_digest !== row.opening_projection_digest) return undefined;
      return freeze({ ...target, ...row, opening_bytes: Buffer.from(row.opening_bytes) });
    },
    recordLifecycleImpactEvent({ target, event_class, event_type, event_id, event_digest, event_bytes, event_at, effect } = {}) {
      if (!validImpactTargetSelector(target) || ![event_class, event_type, event_id, effect].every(validSafeText) || !validDigest(event_digest) || !Buffer.isBuffer(event_bytes) || !event_bytes.length || createHash('sha256').update(event_bytes).digest('hex') !== event_digest || !validTime(event_at)) throw new Error('RULE_IMPACT_EVENT_INVALID');
      const existing = db.prepare('SELECT * FROM impact_lifecycle_event WHERE event_id = ?').get(event_id);
      const record = { ...target, event_class, event_type, event_id, event_digest, event_bytes, event_at, effect };
      if (existing) {
        const same = [...IMPACT_TARGET_SELECTOR_KEYS, 'event_class', 'event_type', 'event_id', 'event_digest', 'event_at', 'effect'].every((key) => existing[key] === record[key]) && Buffer.from(existing.event_bytes).equals(event_bytes);
        if (!same) throw new Error('RULE_IMPACT_EVENT_CONFLICT');
        return freeze({ status: 'existing', event_id, event_digest });
      }
      db.exec('BEGIN IMMEDIATE');
      try { db.prepare('INSERT INTO impact_lifecycle_event (tier,scope_id,rule_id,version_hash,content_hash,activation_epoch,event_class,event_type,event_id,event_digest,event_bytes,event_at,effect) VALUES (@tier,@scope_id,@rule_id,@version_hash,@content_hash,@activation_epoch,@event_class,@event_type,@event_id,@event_digest,@event_bytes,@event_at,@effect)').run(record); db.exec('COMMIT'); return freeze({ status: 'recorded', event_id, event_digest }); } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    listLifecycleImpactEvents({ target, start_at, end_at } = {}) {
      if (!validImpactTargetSelector(target) || !validTime(start_at) || !validTime(end_at) || Date.parse(start_at) >= Date.parse(end_at)) return Object.freeze([]);
      return freeze(db.prepare('SELECT event_class, event_type, event_id, event_digest, event_bytes, event_at, effect FROM impact_lifecycle_event WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ? AND event_at >= ? AND event_at < ? ORDER BY event_at, event_sequence LIMIT 256').all(...targetSelectorValues(target), start_at, end_at).filter((row) => (Buffer.isBuffer(row.event_bytes) || row.event_bytes instanceof Uint8Array) && createHash('sha256').update(row.event_bytes).digest('hex') === row.event_digest).map((row) => freeze({ ...target, ...row, event_bytes: Buffer.from(row.event_bytes) })));
    },
    upsertImpactCadenceCheckpoint({ target, policy_id, policy_digest, opening_id, opening_digest, checkpoint_kind } = {}) {
      if (!validImpactTargetSelector(target) || !validSafeText(policy_id) || !validDigest(policy_digest) || !validSafeText(opening_id) || !validDigest(opening_digest) || checkpoint_kind !== 'freeze') throw new Error('RULE_IMPACT_CHECKPOINT_INVALID');
      // Checkpoints may retain an exact legacy stored row for operational compatibility, but only v2 read API grants EI authority.
      const opening = db.prepare('SELECT opening_id, opening_digest, opened_at FROM impact_lifecycle_opening WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ?').get(...targetSelectorValues(target));
      if (!opening || opening.opening_id !== opening_id || opening.opening_digest !== opening_digest) throw new Error('RULE_IMPACT_CHECKPOINT_OPENING_UNAVAILABLE');
      const due_at = new Date(Date.parse(opening.opened_at) + FREEZE_DELAY_MS).toISOString();
      const identity = { target, policy_id, policy_digest, opening_id, opening_digest, checkpoint_kind, due_at };
      const checkpoint_key = createHash('sha256').update(canonical(identity)).digest('hex'); const checkpoint_digest = createHash('sha256').update(canonical(identity)).digest('hex');
      const record = { ...target, policy_id, policy_digest, opening_id, opening_digest, checkpoint_kind, due_at, checkpoint_key, checkpoint_digest, created_at: opening.opened_at };
      const existing = db.prepare('SELECT checkpoint_key, checkpoint_digest, due_at FROM impact_cadence_checkpoint WHERE checkpoint_key = ?').get(checkpoint_key);
      if (existing) { if (existing.checkpoint_digest !== checkpoint_digest || existing.due_at !== due_at) throw new Error('RULE_IMPACT_CHECKPOINT_CONFLICT'); return freeze({ status: 'existing', checkpoint_key, checkpoint_digest, due_at }); }
      db.prepare('INSERT INTO impact_cadence_checkpoint (checkpoint_key,tier,scope_id,rule_id,version_hash,content_hash,activation_epoch,policy_id,policy_digest,opening_id,opening_digest,checkpoint_kind,due_at,checkpoint_digest,created_at) VALUES (@checkpoint_key,@tier,@scope_id,@rule_id,@version_hash,@content_hash,@activation_epoch,@policy_id,@policy_digest,@opening_id,@opening_digest,@checkpoint_kind,@due_at,@checkpoint_digest,@created_at)').run(record);
      return freeze({ status: 'recorded', checkpoint_key, checkpoint_digest, due_at });
    },
    listDueImpactCadence({ now } = {}) {
      if (!validTime(now)) return Object.freeze([]);
      return freeze(db.prepare('SELECT checkpoint_key, checkpoint_digest, tier, scope_id, rule_id, version_hash, content_hash, activation_epoch, policy_id, policy_digest, opening_id, opening_digest, checkpoint_kind, due_at FROM impact_cadence_checkpoint WHERE due_at <= ? ORDER BY due_at, checkpoint_key LIMIT 256').all(now).map((row) => freeze({ ...row })));
    },
    claimDueImpactCadence({ checkpoint, input_id, lease_owner, now = new Date().toISOString() } = {}) {
      if (!exactKeys(checkpoint, IMPACT_DUE_CHECKPOINT_KEYS) || !CADENCE_INPUT_ID.test(input_id) || !CADENCE_OWNER.test(lease_owner) || !validTime(now)) throw new Error('RULE_IMPACT_CADENCE_INVALID');
      const stored = db.prepare('SELECT checkpoint_key, checkpoint_digest, tier, scope_id, rule_id, version_hash, content_hash, activation_epoch, policy_id, policy_digest, opening_id, opening_digest, checkpoint_kind, due_at FROM impact_cadence_checkpoint WHERE checkpoint_key = ?').get(checkpoint.checkpoint_key);
      if (!stored || canonical(stored) !== canonical(checkpoint) || Date.parse(stored.due_at) > Date.parse(now)) throw new Error('RULE_IMPACT_CHECKPOINT_UNAVAILABLE');
      return this.claimImpactCadence({ due_key: `checkpoint:${stored.checkpoint_key}`, input_id, lease_owner, now });
    },
    recordImpactResult(record = {}) {
      const digestFields = ['input_digest', 'result_digest', 'version_hash', 'content_hash', 'policy_digest', 'snapshot_digest', 'publication_digest'];
      const required = ['input_id', 'result_id', 'tier', 'rule_id', 'activation_epoch', 'policy_id', 'snapshot_id', 'exposure_id', 'created_at'];
      if (digestFields.some((key) => !validDigest(record[key])) || required.some((key) => typeof record[key] !== 'string' || !record[key]) || !/^rule-impact-input:[a-f0-9]{64}$/.test(record.input_id) || !/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(record.result_id) || !['global', 'project'].includes(record.tier) || (record.tier === 'global' ? record.scope_id !== '' : !record.scope_id) || !validTime(record.created_at)) throw new Error('RULE_IMPACT_RESULT_INVALID');
      const input = db.prepare('SELECT 1 FROM impact_target_index WHERE exposure_id = ? AND publication_digest = ? AND input_id = ? AND input_digest = ?').get(record.exposure_id, record.publication_digest, record.input_id, record.input_digest);
      if (!input) throw new Error('RULE_IMPACT_RESULT_INPUT_UNVERIFIED');
      const existing = db.prepare('SELECT * FROM impact_result_index WHERE input_id = ? OR result_id = ?').all(record.input_id, record.result_id);
      if (existing.length) {
        const row = existing[0]; const same = Object.entries(record).every(([key, value]) => row[key] === value);
        if (!same || existing.length !== 1) throw new Error('RULE_IMPACT_RESULT_CONFLICT');
        return freeze({ status: 'committed', head_sequence: row.head_sequence });
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const head_sequence = db.prepare('SELECT COALESCE(MAX(head_sequence), 0) + 1 AS next FROM impact_result_index').get().next;
        db.prepare('INSERT INTO impact_result_index (input_id,input_digest,result_id,result_digest,tier,scope_id,rule_id,version_hash,content_hash,activation_epoch,policy_id,policy_digest,snapshot_id,snapshot_digest,exposure_id,publication_digest,created_at,head_sequence) VALUES (@input_id,@input_digest,@result_id,@result_digest,@tier,@scope_id,@rule_id,@version_hash,@content_hash,@activation_epoch,@policy_id,@policy_digest,@snapshot_id,@snapshot_digest,@exposure_id,@publication_digest,@created_at,@head_sequence)').run({ ...record, head_sequence });
        db.exec('COMMIT'); return freeze({ status: 'committed', head_sequence });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    recordImpactEvaluation(record = {}) {
      if (!record || typeof record !== 'object' || !/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(record.result_id) || !validDigest(record.result_identity_digest) || !validDigest(record.result_digest) || typeof record.state !== 'string' || typeof record.lineage_json !== 'string' || (record.selector !== undefined && !validImpactEvaluationSelector(record.selector)) || (record.selector !== undefined && !IMPACT_EVALUATION_ACTIVE_STATES.has(record.state))) throw new Error('RULE_IMPACT_EVALUATION_INVALID');
      const selector = record.selector || Object.fromEntries(IMPACT_EVALUATION_SELECTOR_KEYS.map((key) => [key, null]));
      const persisted = { result_id: record.result_id, result_identity_digest: record.result_identity_digest, result_digest: record.result_digest, state: record.state, lineage_json: record.lineage_json, ...selector };
      const find = () => db.prepare('SELECT * FROM impact_evaluation_index WHERE result_id = ? OR result_identity_digest = ? OR result_digest = ?').all(record.result_id, record.result_identity_digest, record.result_digest);
      const exact = (rows) => rows.length === 1 && Object.entries(persisted).every(([key, value]) => rows[0][key] === value);
      const existing = find();
      if (existing.length) {
        if (!exact(existing)) throw new Error('RULE_IMPACT_EVALUATION_CONFLICT');
        return freeze({ status: 'existing', head_sequence: existing[0].head_sequence });
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        const raced = find();
        if (raced.length) {
          if (!exact(raced)) throw new Error('RULE_IMPACT_EVALUATION_CONFLICT');
          db.exec('COMMIT');
          return freeze({ status: 'existing', head_sequence: raced[0].head_sequence });
        }
        const head_sequence = db.prepare('SELECT COALESCE(MAX(head_sequence), 0) + 1 AS next FROM impact_evaluation_index').get().next;
        db.prepare('INSERT INTO impact_evaluation_index (result_id,result_identity_digest,result_digest,state,lineage_json,head_sequence,tier,scope_id,rule_id,version_hash,content_hash,activation_epoch,policy_id,policy_digest) VALUES (@result_id,@result_identity_digest,@result_digest,@state,@lineage_json,@head_sequence,@tier,@scope_id,@rule_id,@version_hash,@content_hash,@activation_epoch,@policy_id,@policy_digest)').run({ ...persisted, head_sequence });
        db.exec('COMMIT'); return freeze({ status: 'recorded', head_sequence });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    recordImpactEvaluationTerminal(record = {}) {
      if (!record || typeof record !== 'object' || !/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(record.terminal_result_id) || !validDigest(record.terminal_result_identity_digest) || !validDigest(record.terminal_result_digest)) throw new Error('RULE_IMPACT_TERMINAL_INVALID');
      const bytes = readContentAddressedBlob(stateRoot, 'rule-impact-result', record.terminal_result_digest);
      let terminal; try { terminal = bytes && parseImpactEvaluationBytes(bytes); } catch {}
      const artifact = terminal?.artifact; const priorClaim = artifact?.prior_result;
      if (!terminal || terminal.result_id !== record.terminal_result_id || terminal.result_identity_digest !== record.terminal_result_identity_digest || terminal.result_digest !== record.terminal_result_digest || !['superseded', 'expired'].includes(artifact.state) || !priorClaim || !/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(priorClaim.prior_result_id) || !validDigest(priorClaim.prior_result_digest) || !validTime(priorClaim.state_at)) throw new Error('RULE_IMPACT_TERMINAL_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const prior = db.prepare('SELECT * FROM impact_evaluation_index WHERE result_id = ?').get(priorClaim.prior_result_id);
        const priorBytes = prior && readContentAddressedBlob(stateRoot, 'rule-impact-result', prior.result_digest);
        let parsedPrior; try { parsedPrior = priorBytes && parseImpactEvaluationBytes(priorBytes); } catch {}
        const selector = parsedPrior?.artifact?.lineage && { tier: parsedPrior.artifact.tier, scope_id: parsedPrior.artifact.lineage.scope_id === null ? '' : parsedPrior.artifact.lineage.scope_id, rule_id: parsedPrior.artifact.lineage.rule_id, version_hash: parsedPrior.artifact.lineage.rule_version_hash, content_hash: parsedPrior.artifact.lineage.rule_content_hash, activation_epoch: parsedPrior.artifact.lineage.activation_epoch, policy_id: parsedPrior.artifact.lineage.policy_id, policy_digest: parsedPrior.artifact.lineage.policy_digest };
        const priorValid = prior && parsedPrior && parsedPrior.result_id === prior.result_id && parsedPrior.result_identity_digest === prior.result_identity_digest && parsedPrior.result_digest === prior.result_digest && parsedPrior.artifact.state === prior.state && IMPACT_EVALUATION_ACTIVE_STATES.has(prior.state) && validImpactEvaluationSelector(selector) && IMPACT_EVALUATION_SELECTOR_KEYS.every((key) => prior[key] === selector[key]) && priorClaim.prior_result_digest === prior.result_digest;
        if (!priorValid) throw new Error('RULE_IMPACT_TERMINAL_CONFLICT');
        const replacement = db.prepare('SELECT prior_result_id, next_result_id, linked_at FROM impact_evaluation_replacement WHERE prior_result_id = ?').get(prior.result_id);
        if ((artifact.reason === 'result_replaced' && (!replacement || replacement.linked_at !== priorClaim.state_at)) || (artifact.reason !== 'result_replaced' && replacement)) throw new Error('RULE_IMPACT_TERMINAL_CONFLICT');
        const existing = db.prepare('SELECT * FROM impact_evaluation_terminal WHERE prior_result_id = ? OR terminal_result_id = ? OR terminal_result_digest = ?').all(prior.result_id, terminal.result_id, terminal.result_digest);
        if (existing.length) {
          const relation = existing.length === 1 ? existing[0] : null;
          const indexed = db.prepare('SELECT * FROM impact_evaluation_index WHERE result_id = ?').get(terminal.result_id);
          const exact = relation && indexed && relation.prior_result_id === prior.result_id && relation.terminal_result_id === terminal.result_id && relation.terminal_result_digest === terminal.result_digest && relation.state === artifact.state && relation.reason === artifact.reason && relation.claimed_at === priorClaim.state_at && relation.head_sequence === indexed.head_sequence && IMPACT_EVALUATION_SELECTOR_KEYS.every((key) => relation[key] === selector[key]) && indexed.result_identity_digest === terminal.result_identity_digest && indexed.result_digest === terminal.result_digest && indexed.state === artifact.state;
          if (!exact) throw new Error('RULE_IMPACT_TERMINAL_CONFLICT');
          db.exec('COMMIT'); return freeze({ status: 'existing', head_sequence: relation.head_sequence });
        }
        if (db.prepare('SELECT 1 FROM impact_evaluation_index WHERE result_id = ? OR result_identity_digest = ? OR result_digest = ?').get(terminal.result_id, terminal.result_identity_digest, terminal.result_digest)) throw new Error('RULE_IMPACT_TERMINAL_CONFLICT');
        const head_sequence = db.prepare('SELECT COALESCE(MAX(head_sequence), 0) + 1 AS next FROM impact_evaluation_index').get().next;
        if (head_sequence <= prior.head_sequence) throw new Error('RULE_IMPACT_TERMINAL_CONFLICT');
        db.prepare('INSERT INTO impact_evaluation_index (result_id,result_identity_digest,result_digest,state,lineage_json,head_sequence,tier,scope_id,rule_id,version_hash,content_hash,activation_epoch,policy_id,policy_digest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(terminal.result_id, terminal.result_identity_digest, terminal.result_digest, artifact.state, JSON.stringify(artifact.lineage), head_sequence, null, null, null, null, null, null, null, null);
        db.prepare('INSERT INTO impact_evaluation_terminal (prior_result_id,terminal_result_id,terminal_result_digest,state,reason,head_sequence,claimed_at,tier,scope_id,rule_id,version_hash,content_hash,activation_epoch,policy_id,policy_digest) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(prior.result_id, terminal.result_id, terminal.result_digest, artifact.state, artifact.reason, head_sequence, priorClaim.state_at, ...evaluationSelectorValues(selector));
        db.exec('COMMIT'); return freeze({ status: 'recorded', head_sequence });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    findLatestImpactEvaluationPrior({ selector, minimum_head_sequence } = {}) {
      if (!validImpactEvaluationSelector(selector) || !Number.isSafeInteger(minimum_head_sequence) || minimum_head_sequence < 1) return undefined;
      const row = db.prepare('SELECT * FROM impact_evaluation_index AS evaluation WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ? AND policy_id = ? AND policy_digest = ? AND head_sequence >= ? AND NOT EXISTS (SELECT 1 FROM impact_evaluation_terminal AS terminal WHERE terminal.prior_result_id = evaluation.result_id) ORDER BY head_sequence DESC, result_id ASC LIMIT 1').get(...evaluationSelectorValues(selector), minimum_head_sequence);
      return row ? freeze({ ...row }) : undefined;
    },
    linkImpactEvaluationReplacement({ prior_result_id, next_result_id, linked_at } = {}) {
      if (!/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(prior_result_id || '') || !/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(next_result_id || '') || prior_result_id === next_result_id || !validTime(linked_at)) throw new Error('RULE_IMPACT_REPLACEMENT_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const prior = db.prepare('SELECT * FROM impact_evaluation_index WHERE result_id = ?').get(prior_result_id);
        const next = db.prepare('SELECT * FROM impact_evaluation_index WHERE result_id = ?').get(next_result_id);
        const sameTarget = prior && next && IMPACT_EVALUATION_ACTIVE_STATES.has(prior.state) && IMPACT_EVALUATION_ACTIVE_STATES.has(next.state) && IMPACT_EVALUATION_SELECTOR_KEYS.every((key) => prior[key] !== null && prior[key] === next[key]) && next.head_sequence > prior.head_sequence;
        if (!sameTarget) throw new Error('RULE_IMPACT_REPLACEMENT_CONFLICT');
        const relation = db.prepare('SELECT prior_result_id, next_result_id, linked_at FROM impact_evaluation_replacement WHERE prior_result_id = ? OR next_result_id = ?').all(prior_result_id, next_result_id);
        if (relation.length) {
          const exact = relation.length === 1 && relation[0].prior_result_id === prior_result_id && relation[0].next_result_id === next_result_id && relation[0].linked_at === linked_at;
          if (!exact) throw new Error('RULE_IMPACT_REPLACEMENT_CONFLICT');
          db.exec('COMMIT'); return freeze({ status: 'existing', ...relation[0] });
        }
        db.prepare('INSERT INTO impact_evaluation_replacement (prior_result_id,next_result_id,linked_at) VALUES (?,?,?)').run(prior_result_id, next_result_id, linked_at);
        db.exec('COMMIT'); return freeze({ status: 'linked', prior_result_id, next_result_id, linked_at });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readImpactEvaluationReplacement({ prior_result_id } = {}) {
      if (!/^passive-impact-(?:global|project):[a-f0-9]{64}$/.test(prior_result_id || '')) return undefined;
      const row = db.prepare('SELECT prior_result_id, next_result_id, linked_at FROM impact_evaluation_replacement WHERE prior_result_id = ?').get(prior_result_id);
      return row ? freeze({ ...row }) : undefined;
    },
    readImpactCadenceConfig() {
      const row = db.prepare('SELECT enabled, revision FROM impact_cadence_config WHERE singleton = 1').get();
      if (!row || ![0, 1].includes(row.enabled) || !Number.isSafeInteger(row.revision) || row.revision < 0) throw new Error('RULE_IMPACT_CADENCE_CONFIG_INVALID');
      return freeze({ enabled: row.enabled === 1, revision: row.revision });
    },
    setImpactCadenceEnabled({ enabled } = {}) {
      if (typeof enabled !== 'boolean') throw new Error('RULE_IMPACT_CADENCE_CONFIG_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = db.prepare('SELECT revision FROM impact_cadence_config WHERE singleton = 1').get();
        if (!current) throw new Error('RULE_IMPACT_CADENCE_CONFIG_INVALID');
        const revision = current.revision + 1;
        db.prepare('UPDATE impact_cadence_config SET enabled = ?, revision = ?, updated_at = ? WHERE singleton = 1').run(enabled ? 1 : 0, revision, new Date().toISOString());
        db.exec('COMMIT'); return freeze({ enabled, revision });
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    claimImpactCadence({ due_key, input_id, lease_owner, now = new Date().toISOString() } = {}) {
      if (typeof due_key !== 'string' || !due_key || !CADENCE_INPUT_ID.test(input_id) || !CADENCE_OWNER.test(lease_owner) || !validTime(now)) throw new Error('RULE_IMPACT_CADENCE_INVALID');
      const existing = () => db.prepare('SELECT due_key, status, lease_owner, lease_expires_at, attempt, terminal_json, input_id FROM impact_cadence WHERE due_key = ?').get(due_key);
      const active = (row) => freeze({ status: 'active', due_key: row.due_key, input_id: row.input_id, lease_owner: row.lease_owner, lease_expires_at: row.lease_expires_at, attempt: row.attempt });
      const claimed = (attempt, expiry) => freeze({ status: 'claimed', due_key, input_id, lease_owner, lease_expires_at: expiry, attempt });
      db.exec('BEGIN IMMEDIATE');
      try {
        const prior = existing();
        if (prior && prior.status !== 'attempting') {
          let terminal; try { terminal = JSON.parse(prior.terminal_json); } catch { throw new Error('RULE_IMPACT_CADENCE_INVALID'); }
          db.exec('COMMIT'); return freeze(terminal);
        }
        if (prior && (!validTime(prior.lease_expires_at) || Date.parse(prior.lease_expires_at) > Date.parse(now))) { const response = active(prior); db.exec('COMMIT'); return response; }
        const config = db.prepare('SELECT enabled FROM impact_cadence_config WHERE singleton = 1').get();
        if (!config || config.enabled !== 1) { db.exec('COMMIT'); return freeze({ status: 'disabled' }); }
        const lease_expires_at = new Date(Date.parse(now) + CADENCE_LEASE_MS).toISOString();
        if (prior) db.prepare('UPDATE impact_cadence SET lease_owner = ?, lease_expires_at = ?, attempt = ?, terminal_json = NULL, input_id = ?, updated_at = ? WHERE due_key = ? AND status = ?').run(lease_owner, lease_expires_at, prior.attempt + 1, input_id, now, due_key, 'attempting');
        else db.prepare('INSERT INTO impact_cadence (due_key, status, lease_owner, lease_expires_at, attempt, terminal_json, input_id, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)').run(due_key, 'attempting', lease_owner, lease_expires_at, 1, input_id, now);
        db.exec('COMMIT'); return claimed(prior ? prior.attempt + 1 : 1, lease_expires_at);
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    finishImpactCadence({ due_key, lease_owner, result, now = new Date().toISOString() } = {}) {
      if (typeof due_key !== 'string' || !due_key || !CADENCE_OWNER.test(lease_owner) || !result || typeof result !== 'object' || Array.isArray(result) || !CADENCE_TERMINAL_STATUSES.has(result.status) || result.due_key !== due_key || !validTime(now)) throw new Error('RULE_IMPACT_CADENCE_INVALID');
      db.exec('BEGIN IMMEDIATE');
      try {
        const changed = db.prepare('UPDATE impact_cadence SET status = ?, terminal_json = ?, updated_at = ? WHERE due_key = ? AND status = ? AND lease_owner = ?').run(result.status, canonical(result), now, due_key, 'attempting', lease_owner).changes;
        if (changed !== 1) throw new Error('RULE_IMPACT_CADENCE_LEASE_OWNERSHIP');
        db.exec('COMMIT'); return freeze(result);
      } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
    },
    readImpactEvaluation({ result_id } = {}) {
      if (typeof result_id !== 'string') return undefined;
      const row = db.prepare('SELECT * FROM impact_evaluation_index WHERE result_id = ?').get(result_id);
      return row ? freeze({ ...row }) : undefined;
    },
    readImpactResult({ input_id } = {}) {
      if (typeof input_id !== 'string' || !/^rule-impact-input:[a-f0-9]{64}$/.test(input_id)) return undefined;
      const row = db.prepare('SELECT * FROM impact_result_index WHERE input_id = ?').get(input_id);
      return row ? freeze({ ...row }) : undefined;
    },
    readImpactResultLineage({ input_id } = {}) {
      if (typeof input_id !== 'string' || !/^rule-impact-input:[a-f0-9]{64}$/.test(input_id)) return undefined;
      const row = db.prepare(`SELECT result.*, target.exposure_id AS target_exposure_id, target.publication_digest AS target_publication_digest, target.input_id AS target_input_id, target.input_digest AS target_input_digest, target.ordinal AS target_ordinal, fanout.target_count AS target_count, fanout.target_input_ids_json, fanout.target_input_digests_json FROM impact_result_index AS result JOIN impact_target_index AS target ON target.input_id = result.input_id JOIN impact_publication_fanout AS fanout ON fanout.exposure_id = target.exposure_id AND fanout.publication_digest = target.publication_digest WHERE result.input_id = ?`).get(input_id);
      return row ? freeze({ ...row }) : undefined;
    },
    readImpactFanout({ exposure_id, publication_digest } = {}) {
      if (typeof exposure_id !== 'string' || typeof publication_digest !== 'string') return undefined;
      const row = db.prepare('SELECT fanout_fingerprint, target_input_ids_json, target_input_digests_json FROM impact_publication_fanout WHERE exposure_id = ? AND publication_digest = ?').get(exposure_id, publication_digest);
      if (!row) return undefined;
      try { return freeze({ exposure_id, publication_digest, fanout_fingerprint: row.fanout_fingerprint, target_input_ids: freeze(JSON.parse(row.target_input_ids_json)), target_input_digests: freeze(JSON.parse(row.target_input_digests_json)) }); } catch { return undefined; }
    },
    listImpactFanoutTargets({ exposure_id, publication_digest } = {}) {
      if (typeof exposure_id !== 'string' || !/^exposure:[a-f0-9]{64}$/.test(exposure_id) || !validDigest(publication_digest)) return Object.freeze([]);
      return freeze(db.prepare('SELECT ordinal, input_id, input_digest FROM impact_target_index WHERE exposure_id = ? AND publication_digest = ? ORDER BY ordinal').all(exposure_id, publication_digest).map((row) => freeze({ ...row })));
    },
    readImpactInputReference({ exposure_id, publication_digest, input_id } = {}) {
      if (typeof exposure_id !== 'string' || !/^exposure:[a-f0-9]{64}$/.test(exposure_id) || !validDigest(publication_digest) || !CADENCE_INPUT_ID.test(input_id)) return undefined;
      const row = db.prepare('SELECT ordinal, input_id, input_digest FROM impact_target_index WHERE exposure_id = ? AND publication_digest = ? AND input_id = ?').get(exposure_id, publication_digest, input_id);
      return row ? freeze({ ...row }) : undefined;
    },
    listImpactMeasurementHistory({ tier, scope_id, rule_id, version_hash, content_hash, activation_epoch, now = new Date().toISOString() } = {}) {
      if (!['global', 'project'].includes(tier) || (tier === 'global' ? scope_id !== '' : typeof scope_id !== 'string' || !scope_id) || typeof rule_id !== 'string' || !rule_id || !validDigest(version_hash) || !validDigest(content_hash) || typeof activation_epoch !== 'string' || !activation_epoch || !validTime(now)) return Object.freeze([]);
      const since = new Date(Date.parse(now) - 60 * 24 * 60 * 60 * 1000).toISOString();
      return freeze(db.prepare('SELECT input_id, input_digest, head_sequence, created_at, exposure_id, publication_digest FROM impact_result_index WHERE tier = ? AND scope_id = ? AND rule_id = ? AND version_hash = ? AND content_hash = ? AND activation_epoch = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at, head_sequence').all(tier, scope_id, rule_id, version_hash, content_hash, activation_epoch, since, now).map((row) => freeze({ ...row })));
    },
    readLifecycleEpoch({ repository, scope_id = null, rule_id, rule_version, activation_epoch } = {}) {
      if (typeof repository !== 'string' || !repository || typeof rule_id !== 'string' || !rule_id || !validDigest(rule_version) || typeof activation_epoch !== 'string' || !activation_epoch) return undefined;
      const row = db.prepare('SELECT repository, scope_id, rule_id, rule_version, activation_epoch, opened_at, closed_at FROM activation_epoch WHERE repository = ? AND scope_id = ? AND rule_id = ? AND rule_version = ? AND activation_epoch = ?').get(repository, scopeKey(scope_id), rule_id, rule_version, activation_epoch);
      return row ? freeze({ ...row }) : undefined;
    },
    listLifecycleEpochs({ repository, scope_id = null, rule_id } = {}) {
      if (typeof repository !== 'string' || !repository || typeof rule_id !== 'string' || !rule_id) return freeze([]);
      return freeze(db.prepare('SELECT rule_version, activation_epoch, opened_at, closed_at FROM activation_epoch WHERE repository = ? AND scope_id = ? AND rule_id = ? ORDER BY activation_epoch').all(repository, scopeKey(scope_id), rule_id).map((row) => freeze({ ...row })));
    },
    /** Narrow read seam for sanitized lifecycle-action status only; never returns action bytes, result, repository, path, or error text. */
    listLifecycleActionStatusFacts() {
      const rows = db.prepare('SELECT tx.idempotency_key, tx.scope_id, tx.rule_id, tx.state, tx.terminal_reason, tx.cadence_digest, tx.content_hash, tx.created_at, tx.updated_at, accepted.receipt_digest, accepted.receipt_json, stop.reason_code AS local_stop_reason FROM lifecycle_action_transaction AS tx LEFT JOIN lifecycle_action_accepted_receipt AS accepted ON accepted.idempotency_key = tx.idempotency_key LEFT JOIN local_narrowing AS stop ON stop.repository = tx.repository AND stop.scope_id = tx.scope_id AND stop.rule_id = tx.rule_id ORDER BY tx.idempotency_key').all();
      return freeze(rows.map((row) => {
        const transaction_digest = row.idempotency_key?.slice(3); let receipt; try { receipt = JSON.parse(row.receipt_json); } catch {}
        const receipt_valid = row.state === 'accepted_remote' && validAcceptedReceipt(receipt) && LIFECYCLE_ACTION_STATES.includes(receipt?.lifecycle_state) && receipt.transaction_digest === transaction_digest && createHash('sha256').update(canonical(receipt)).digest('hex') === row.receipt_digest;
        const stage = receipt_valid ? this.readLifecycleActionHandoffStage({ idempotency_key: row.idempotency_key }) : undefined;
        const projection = receipt_valid ? this.readProjection({ repository: db.prepare('SELECT repository FROM lifecycle_action_transaction WHERE idempotency_key = ?').get(row.idempotency_key).repository, scope_id: row.scope_id || null }) : undefined;
        const entry = projection?.entries?.find((item) => item.rule_id === row.rule_id);
        const deactivated_current = receipt_valid && stage?.status === 'verified' && stage.stage === 'status_ready' && entry?.lifecycle_state === 'deactivated' && entry.rule_version === receipt.content_hash && entry.content_hash === receipt.content_hash && entry.accepted_commit === receipt.accepted_commit && projection.accepted_head === stage.payload?.containing_head && stage.payload?.accepted_commit === receipt.accepted_commit;
        const active_current = !!entry && entry.lifecycle_state === 'active';
        const converged = receipt_valid && stage?.status === 'verified' && stage.stage === 'status_ready' && entry?.lifecycle_state === receipt.lifecycle_state && entry.rule_version === receipt.content_hash && entry.content_hash === receipt.content_hash && entry.accepted_commit === receipt.accepted_commit && projection.accepted_head === stage.payload?.containing_head && stage.payload?.accepted_commit === receipt.accepted_commit;
        const canonical_state = entry?.lifecycle_state || null;
        const epoch_open = !!(entry && ACTIVE_STATES.includes(entry.lifecycle_state) && entry.activation_epoch && this.readLifecycleEpoch({ repository: db.prepare('SELECT repository FROM lifecycle_action_transaction WHERE idempotency_key = ?').get(row.idempotency_key).repository, scope_id: row.scope_id || null, rule_id: row.rule_id, rule_version: entry.rule_version, activation_epoch: entry.activation_epoch })?.closed_at === null);
        return freeze({ transaction_digest, rule_id: row.rule_id, tier: row.rule_id?.startsWith('pidex-global:') ? 'global' : 'project', scope_id: row.scope_id === '' ? 'pidex-global' : row.scope_id, state: row.state, cadence_digest: row.cadence_digest, receipt_valid: receipt_valid === true, handoff_stage: stage?.status === 'verified' ? stage.stage : null, receipt_digest: receipt_valid ? row.receipt_digest : null, accepted_commit: receipt_valid ? receipt.accepted_commit : null, content_hash: receipt_valid ? receipt.content_hash : null, receipt_lifecycle_state: receipt_valid ? receipt.lifecycle_state : null, canonical_state, mirror_verified: !!(receipt_valid && stage?.status === 'verified' && stage.stage !== 'receipt_accepted'), converged: converged === true, epoch_open, deactivated_current: deactivated_current === true, active_current: active_current === true, local_stop_active: row.local_stop_reason !== null, predecessor_commit: receipt_valid ? receipt.predecessor_commit : null, tree_digest: receipt_valid ? receipt.tree_digest : null, created_at: row.created_at, updated_at: row.updated_at });
      }));
    },
    readLifecycleActionStatusFacts({ transaction_digest } = {}) {
      if (!validDigest(transaction_digest)) return undefined;
      return this.listLifecycleActionStatusFacts().find((record) => record.transaction_digest === transaction_digest);
    },
    listLifecycleEvents({ repository, scope_id = null } = {}) {
      if (typeof repository !== 'string' || !repository) return Object.freeze([]);
      return freeze(db.prepare('SELECT event_id, repository, scope_id, accepted_head, event_kind, created_at FROM lifecycle_event WHERE repository = ? AND scope_id = ? ORDER BY event_id').all(repository, scopeKey(scope_id)).map((row) => freeze({ ...row })));
    },
    readProjection({ repository, scope_id = null } = {}) {
      const row = db.prepare('SELECT accepted_head, head_json, entries_json FROM effective_projection WHERE repository = ? AND scope_id = ?').get(repository, scopeKey(scope_id));
      if (!row) return db.prepare('SELECT singleton FROM migration_degraded WHERE singleton = 1').get() ? Object.freeze({ quality: 'degraded', reason_codes: Object.freeze(['lifecycle_head_unverifiable']), entries: Object.freeze([]) }) : undefined;
      try {
        const head = JSON.parse(row.head_json);
        const entries = JSON.parse(row.entries_json);
        if (!validHeadRecord(head, repository) || !validEntries(entries)) throw new Error('invalid lifecycle record');
        return Object.freeze({ accepted_head: row.accepted_head, head: Object.freeze(head), entries: Object.freeze(entries) });
      } catch { return Object.freeze({ quality: 'degraded', reason_codes: Object.freeze(['lifecycle_head_unverifiable']), entries: Object.freeze([]) }); }
    },
    close() { learningState.closed = true; db.close(); },
  });
}
