import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parsePolicyConfig, policyBytes, policyForTier } from './rule-impact-policy.mjs';

test('PI-01 policy bytes remain canonical and tier-local', () => {
  assert.notEqual(policyBytes('global').toString('utf8'), policyBytes('project').toString('utf8'));
  assert.equal(policyBytes('global').toString('utf8').endsWith('\n'), false);
});

test('Plan116A canonical policy bytes and closed parser reject reordering', () => {
  const expected = {
    global: '5e06f0a1ad38c50e1f109afc940202e345b66f2fd427a95cdb8585c2d7d17316',
    project: '4cbc54a9043ff955fcec47e62a3573b827d881a89ede1cc6ffdc6512466ee38c',
  };
  for (const [tier, digest] of Object.entries(expected)) {
    const bytes = policyBytes(tier);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
    assert.deepEqual(parsePolicyConfig(bytes), JSON.parse(bytes));
    const reordered = Buffer.from(`{"policy_id":${bytes.subarray(1).toString('utf8').split('"policy_id":')[1]}`, 'utf8');
    assert.throws(() => parsePolicyConfig(reordered), /RULE_IMPACT_POLICY_INVALID/);
  }
});

test('F137-05 policy parses are recursively frozen and mutation cannot alter later consumers or bytes', () => {
  const before = policyBytes('global');
  const first = policyForTier('global');
  assert.equal(Object.isFrozen(first.bootstrap), true);
  assert.equal(Object.isFrozen(first.bootstrap.frame.tags), true);
  assert.equal(Object.isFrozen(first.lifecycle.transitions), true);
  assert.throws(() => { first.bootstrap.frame.tags.policy_id = 99; }, TypeError);
  assert.equal(policyForTier('global').bootstrap.frame.tags.policy_id, 1);
  assert.equal(policyBytes('global').equals(before), true);
  assert.equal(createHash('sha256').update(policyBytes('global')).digest('hex'), '5e06f0a1ad38c50e1f109afc940202e345b66f2fd427a95cdb8585c2d7d17316');
});

test('PI-01/PI-02 policy identities remain tier-isolated and fixed', () => {
  const global = policyForTier('global');
  const project = policyForTier('project');
  assert.deepEqual(
    { tier: global.tier, policy_id: global.policy_id, result_schema: global.result_schema, result_id_prefix: global.result_id_prefix },
    { tier: 'global', policy_id: 'passive-impact-v1', result_schema: 'passive-impact-global-result-v1', result_id_prefix: 'passive-impact-global:' },
  );
  assert.deepEqual(
    { tier: project.tier, policy_id: project.policy_id, result_schema: project.result_schema, result_id_prefix: project.result_id_prefix },
    { tier: 'project', policy_id: 'project-passive-impact-v1', result_schema: 'passive-impact-project-result-v1', result_id_prefix: 'passive-impact-project:' },
  );
  assert.throws(() => policyForTier('mixed'), /RULE_IMPACT_TIER_INVALID/);
});

test('BD-28 preserves approved tier floors and rejects policy-byte weakening', () => {
  const global = policyForTier('global');
  assert.equal(global.tier_rules.minimum_cohort_count, 30);
  const weakened = Buffer.from(policyBytes('global').toString('utf8').replace('"minimum_cohort_count":30', '"minimum_cohort_count":29'));
  assert.throws(() => parsePolicyConfig(weakened), /RULE_IMPACT_POLICY_INVALID/);
});
