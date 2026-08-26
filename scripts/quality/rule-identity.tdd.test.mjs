import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuleDescriptor } from './rule-identity.mjs';

const hash = (value) => value.repeat(64);

function managedGlobal(overrides = {}) {
  return {
    rule_id: 'pidex-global:pidex-implementer:quality', tier: 'global', scope_id: null,
    agent: 'pidex-implementer', slug: 'quality', owner: 'pidex', applicability: ['implementation'],
    protection_class: 'none', action_policy: 'automatic', lifecycle_state: 'active',
    content_hash: hash('a'), provenance_digest: hash('b'), admission_policy_version: 'v1',
    admission_digest: hash('c'), transaction_digest: hash('d'), predecessor_commit: hash('e').slice(0, 40),
    accepted_commit: hash('f').slice(0, 40), source_kind: 'managed_global', rule_version: hash('a'),
    project_override_policy: 'forbidden', overrides_rule_id: null, legacy_aliases: ['rule:root:rules:pidex-implementer:quality'],
    ...overrides,
  };
}

test('BD45-01/06 creates closed managed descriptor with stable namespace and rejects schema drift', () => {
  const descriptor = createRuleDescriptor(managedGlobal());
  assert.equal(descriptor.schema, 'pidex-rule-descriptor-v1');
  assert.equal(descriptor.rule_id, 'pidex-global:pidex-implementer:quality');
  assert.equal(Object.isFrozen(descriptor), true);
  assert.throws(() => createRuleDescriptor(managedGlobal({ unexpected: true })), /RULE_DESCRIPTOR_INVALID/);
  assert.throws(() => createRuleDescriptor(managedGlobal({ rule_version: hash('b') })), /RULE_DESCRIPTOR_INVALID/);
});

test('BD45-02/03 keeps managed project namespace distinct from legacy aggregate alias', () => {
  const scope = hash('1').slice(0, 24);
  const managed = createRuleDescriptor(managedGlobal({ rule_id: `project:${scope}:pidex-implementer:quality`, tier: 'project', scope_id: scope, source_kind: 'managed_project', project_override_policy: 'exact_project', overrides_rule_id: 'pidex-global:pidex-implementer:quality' }));
  const legacy = createRuleDescriptor(managedGlobal({ rule_id: `project:${scope}:pidex-implementer:legacy-aggregate`, tier: 'project', scope_id: scope, slug: 'legacy-aggregate', source_kind: 'legacy_project', protection_class: 'legacy_baseline', action_policy: 'pinned', project_override_policy: 'forbidden', overrides_rule_id: null }));
  assert.notEqual(managed.rule_id, legacy.rule_id);
  assert.equal(legacy.protection_class, 'legacy_baseline');
});
