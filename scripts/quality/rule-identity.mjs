import { createHash } from 'node:crypto';

const SCHEMA = 'pidex-rule-descriptor-v1';
const FIELDS = Object.freeze(['rule_id', 'legacy_aliases', 'tier', 'scope_id', 'agent', 'slug', 'owner', 'applicability', 'protection_class', 'action_policy', 'lifecycle_state', 'content_hash', 'provenance_digest', 'admission_policy_version', 'admission_digest', 'transaction_digest', 'predecessor_commit', 'accepted_commit', 'source_kind', 'rule_version', 'project_override_policy', 'overrides_rule_id']);
const HEX64 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const RULE_ID = /^(pidex-global:[a-z0-9-]+:[a-z0-9-]+|project:[a-f0-9]{24,64}:[a-z0-9-]+:[a-z0-9-]+)$/;

function invalid() { throw new Error('RULE_DESCRIPTOR_INVALID'); }
function freeze(value) { return Object.freeze(value); }
function exactKeys(value) { return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === FIELDS.length && FIELDS.every((key) => Object.hasOwn(value, key)); }
function validScope(value, tier) { return tier === 'global' ? value === null : typeof value === 'string' && /^[a-f0-9]{24,64}$/.test(value); }
function validIdentity(value) { return typeof value.rule_id === 'string' && RULE_ID.test(value.rule_id) && typeof value.agent === 'string' && /^[a-z0-9-]+$/.test(value.agent) && typeof value.slug === 'string' && /^[a-z0-9-]+$/.test(value.slug); }
function validHashes(value) { return ['content_hash', 'provenance_digest', 'admission_digest', 'transaction_digest', 'rule_version'].every((key) => HEX64.test(value[key])) && value.content_hash === value.rule_version && COMMIT.test(value.predecessor_commit) && COMMIT.test(value.accepted_commit); }
function validPolicy(value) { return ['global', 'project'].includes(value.tier) && validScope(value.scope_id, value.tier) && ['active', 'deactivated'].includes(value.lifecycle_state) && ['automatic', 'pinned'].includes(value.action_policy) && ['none', 'legacy_baseline', 'unknown'].includes(value.protection_class) && ['forbidden', 'exact_project'].includes(value.project_override_policy) && (value.project_override_policy === 'exact_project' ? typeof value.overrides_rule_id === 'string' && RULE_ID.test(value.overrides_rule_id) : value.overrides_rule_id === null); }

/** Creates immutable closed descriptor; aliases remain compatibility-only. */
export function createRuleDescriptor(input) {
  if (!exactKeys(input) || !validIdentity(input) || !validHashes(input) || !validPolicy(input)) invalid();
  if (!Array.isArray(input.legacy_aliases) || input.legacy_aliases.some((item) => typeof item !== 'string') || !Array.isArray(input.applicability) || input.applicability.some((item) => typeof item !== 'string') || typeof input.owner !== 'string' || typeof input.admission_policy_version !== 'string' || !input.admission_policy_version || !input.source_kind.startsWith('managed_') && !input.source_kind.startsWith('legacy_')) invalid();
  const descriptor = { schema: SCHEMA, ...input, legacy_aliases: freeze([...new Set(input.legacy_aliases)].sort()), applicability: freeze([...new Set(input.applicability)].sort()) };
  return freeze(descriptor);
}

export function descriptorScopeId(repositoryIdentity) {
  if (typeof repositoryIdentity !== 'string' || !repositoryIdentity) throw new Error('RULE_SCOPE_INVALID');
  return createHash('sha256').update(repositoryIdentity).digest('hex').slice(0, 24);
}
