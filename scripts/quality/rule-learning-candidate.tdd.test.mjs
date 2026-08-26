import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRuleLearningFinding, createRuleLearningSupport, findingDigest, lessonCode, validateManualCompatibleCandidateBody } from './rule-learning-contracts.mjs';
import * as candidateApi from './rule-learning-candidate.mjs';
import { buildRuleLearningCandidate, canonicalCandidateBytes } from './rule-learning-candidate.mjs';
import { openRuleLifecycleStore } from './rule-lifecycle-store.mjs';

const hex = (char, length = 64) => char.repeat(length);
const scopeA = 'a'.repeat(24);
const scopeB = 'b'.repeat(24);
const finding = ({ scope = scopeA, id = 'a', repo = 'b' } = {}) => createRuleLearningFinding({ schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${id.repeat(32)}`, producer: 'pidex-retrospective', completed_run_id: `run:completed-${id}`, plan_id: 'plan:047', project_scope_id: scope, repository_identity: `repo:${hex(repo)}`, taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:validation-missing', lesson_summary: 'Safe recurrence.', evidence_digests: [hex(id)], occurred_at: '2026-08-13T00:00:00.000Z', redaction_classes: ['none'] });
const support = (tier, findings) => createRuleLearningSupport({ schema_version: 'pidex-rule-learning-support-v1', tier, taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:validation-missing', lesson_code: lessonCode({ taxonomy: 'delivery_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:validation-missing' }), occurrence_count: findings.length, scope_count: tier === 'global' ? findings.length : 1, finding_digests: findings.map(findingDigest).sort() });
const generated = (patch = {}) => () => ({ slug: 'validate-contract', applicability: ['implementation'], instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.', ...patch });
function authorityConfig(findings) { const authority_digest = hex('9'); const source = (item) => ({ finding_id: item.finding_id, snapshot: { repository: item.repository_identity, scope_id: item.project_scope_id, tier: 'project', enabled: true, protected: false, repository_identity: item.repository_identity } }); const target = (tier, scope_id, repository, scope_digest) => ({ repository, scope_id, tier, enabled: true, protected: false, scope_digest, predecessor: `commit:${hex(tier === 'global' ? '7' : '6', 40)}`, authority_digest, applicable_descriptors: [{ descriptor_digest: hex('5') }] }); return { enrollment: { authority_digest, sources: findings.map(source), targets: { project: target('project', scopeA, 'repo:target-project', `${scopeA}${'d'.repeat(40)}`), global: target('global', null, 'repo:target-global', hex('d')) }, policy: { id: 'pidex-living-rule-admission-v1', version: '1', digest: hex('3') }, generator_identity: { principal: 'generator:configured', attempt_id: 'attempt:generator-001' } }, reviewers: { configuration_generation: 'config:1', generator_principal: 'generator:configured', now: '2026-08-13T01:00:00.000Z', principals: [] } }; }
function storeFor(findings, mutate = (value) => value) { const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-learning-candidate-')); const authority = mutate(authorityConfig(findings)); const store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority }); for (const item of findings) store.enroll({ repository: item.repository_identity, scope_id: item.project_scope_id, remote: `https://example.invalid/${item.finding_id}`, branch: 'main' }); for (const target of Object.values(authority.enrollment.targets)) store.enroll({ repository: target.repository, scope_id: target.scope_id, remote: `https://example.invalid/${target.repository}`, branch: 'main' }); return { stateRoot, store }; }
function build(store, tier, findings, generator = generated()) { return buildRuleLearningCandidate({ support: support(tier, findings), findings, authority: store.mintRuleLearningEnrollmentAuthority(), generator }); }
function close({ store, stateRoot }) { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }

test('candidate preserves store-only enrollment authority', () => { assert.equal(candidateApi.createEnrollmentAuthorityAdapter, undefined); });
test('candidate defers forged enrollment authority', () => { const item = finding(); assert.equal(buildRuleLearningCandidate({ support: support('project', [item]), findings: [item], authority: {}, generator: generated() }).status, 'deferred'); });
test('candidate defers missing enrollment authority', () => { const item = finding(); assert.equal(buildRuleLearningCandidate({ support: support('project', [item]), findings: [item], generator: generated() }).status, 'deferred'); });
test('candidate defers stale enrollment authority', () => { const item = finding(); const fixture = storeFor([item]); try { const stale = fixture.store.mintRuleLearningEnrollmentAuthority(); fixture.store.close(); assert.equal(buildRuleLearningCandidate({ support: support('project', [item]), findings: [item], authority: stale, generator: generated() }).status, 'deferred'); } finally { rmSync(fixture.stateRoot, { recursive: true, force: true }); } });
test('candidate defers foreign source enrollment', () => { const item = finding(); const fixture = storeFor([item], (value) => { value.enrollment.sources[0].snapshot.repository = 'repo:foreign'; return value; }); try { assert.equal(build(fixture.store, 'project', [item]).status, 'deferred'); } finally { close(fixture); } });
test('candidate defers cross-store enrollment authority', () => { const item = finding(); const fixture = storeFor([item], (value) => { value.enrollment.sources[0].snapshot.scope_id = scopeB; return value; }); try { assert.equal(build(fixture.store, 'project', [item]).status, 'deferred'); } finally { close(fixture); } });
test('candidate defers disabled target', () => { const item = finding(); const fixture = storeFor([item], (value) => { value.enrollment.targets.project.enabled = false; return value; }); try { assert.equal(build(fixture.store, 'project', [item]).status, 'deferred'); } finally { close(fixture); } });
test('candidate defers protected target', () => { const item = finding(); const fixture = storeFor([item], (value) => { value.enrollment.targets.project.protected = true; return value; }); try { assert.equal(build(fixture.store, 'project', [item]).status, 'deferred'); } finally { close(fixture); } });
test('candidate defers descriptor-drifted target', () => { const item = finding(); const fixture = storeFor([item], (value) => { value.enrollment.targets.project.applicable_descriptors = [{ descriptor_digest: 'drifted' }]; return value; }); try { assert.equal(build(fixture.store, 'project', [item]).status, 'deferred'); } finally { close(fixture); } });
test('candidate keeps global publication target separate from recurrence sources and predecessor', () => { const one = finding(); const two = finding({ scope: scopeB, id: 'b', repo: 'c' }); const fixture = storeFor([one, two]); try { const project = build(fixture.store, 'project', [one]); const global = build(fixture.store, 'global', [one, two]); assert.equal(project.candidate.predecessor_commit, `commit:${hex('6', 40)}`); assert.equal(global.candidate.predecessor_commit, `commit:${hex('7', 40)}`); assert.match(global.candidate.rule_id, /^pidex-global:/); assert.equal(global.candidate.scope_digest, hex('d')); } finally { close(fixture); } });
test('candidate global bytes exclude source scope, repository, and finding prose', () => { const one = finding(); const two = finding({ scope: scopeB, id: 'b', repo: 'c' }); const fixture = storeFor([one, two]); try { const result = build(fixture.store, 'global', [one, two]); assert.equal(result.status, 'candidate'); for (const secret of [one.repository_identity, two.repository_identity, one.project_scope_id, two.project_scope_id, one.lesson_summary]) assert.equal(result.bytes.includes(secret), false); } finally { close(fixture); } });
test('candidate rejects unsafe generated grammar', () => { const item = finding(); const fixture = storeFor([item]); try { for (const instruction of ['https://example.invalid', 'run `sh`', 'credential token', 'path /tmp/rule', 'bad\u202etext']) assert.equal(build(fixture.store, 'project', [item], generated({ instruction })).status, 'deferred'); } finally { close(fixture); } });
test('candidate bytes include embedded digest and preserve exact final canonical object', () => { const item = finding(); const fixture = storeFor([item]); try { const first = build(fixture.store, 'project', [item]); const second = build(fixture.store, 'project', [item]); assert.equal(first.status, 'candidate'); assert.equal(second.status, 'candidate'); assert.equal(first.bytes, second.bytes); assert.equal(first.digest, second.digest); assert.equal(JSON.parse(first.bytes).candidate_digest, first.digest); assert.equal(first.bytes, canonicalCandidateBytes(first.candidate)); } finally { close(fixture); } });
test('candidate full digest mutation matrix changes every candidate identity field', () => { const item = finding(); const fixture = storeFor([item]); try { const { candidate } = build(fixture.store, 'project', [item]); const replacements = { schema_version: 'pidex-managed-rule-v2', rule_id: `${candidate.rule_id}x`, tier: 'global', agent: 'other-agent', slug: 'other-slug', applicability: ['other-phase'], body: `${candidate.body}Changed\n`, predecessor_commit: `commit:${hex('0', 40)}`, support_digest: hex('0'), admission_policy_id: 'other-policy', admission_policy_version: '2', admission_policy_digest: hex('1'), generator_principal: 'generator:other', generator_attempt_id: 'attempt:other', scope_digest: hex('2'), descriptor_digests: [hex('3')], authority_digest: hex('4'), content_hash: hex('5') }; for (const [field, value] of Object.entries(replacements)) assert.notEqual(candidateApi.candidateDigest({ ...candidate, [field]: value }), candidate.candidate_digest, field); } finally { close(fixture); } });

test('candidate requires supplied findings to exactly equal sorted support finding digests', () => {
  const first = finding(); const second = finding({ id: 'c', repo: 'd' }); const fixture = storeFor([first, second]);
  try {
    assert.equal(buildRuleLearningCandidate({ support: support('project', [first]), findings: [second], authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: generated() }).status, 'deferred');
    assert.equal(buildRuleLearningCandidate({ support: support('project', [first, second]), findings: [second, first], authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: generated() }).status, 'candidate');
  } finally { close(fixture); }
});

test('candidate denies uncanonical or forged support before invoking generator', () => {
  const item = finding(); const fixture = storeFor([item]);
  try {
    const canonical = support('project', [item]);
    const cases = [
      { ...canonical, lesson_code: 'Private /srv/operator/credential' },
      { ...canonical, lesson_code: `lesson:${hex('f')}` },
      { ...canonical, taxonomy: 'forged_taxonomy' },
      { ...canonical, finding_digests: [hex('0')] },
    ];
    for (const unsafeSupport of cases) {
      let calls = 0;
      const result = buildRuleLearningCandidate({ support: unsafeSupport, findings: [item], authority: fixture.store.mintRuleLearningEnrollmentAuthority(), generator: () => { calls += 1; return generated()(); } });
      assert.equal(result.status, 'deferred');
      assert.equal(calls, 0);
    }
  } finally { close(fixture); }
});

test('shared manual candidate body validator parses exact rendered Markdown and is builder grammar source', () => {
  const item = finding(); const fixture = storeFor([item]);
  try {
    const built = build(fixture.store, 'project', [item]);
    assert.deepEqual(validateManualCompatibleCandidateBody({ body: built.candidate.body, slug: built.candidate.slug, applicability: built.candidate.applicability }), {
      slug: built.candidate.slug, applicability: built.candidate.applicability, instruction: 'Validate contract.', trigger: 'Before handoff.', expected_evidence: 'Focused checks pass.', failure_behavior: 'Defer publication.', rationale: 'Repeated safe support.',
    });
    for (const body of [built.candidate.body.replace('## Trigger', '## Unsafe'), built.candidate.body.replace('Validate contract.', 'Private /tmp/source'), built.candidate.body.replace('Validate contract.', 'Bad\u202etext')]) assert.equal(validateManualCompatibleCandidateBody({ body, slug: built.candidate.slug, applicability: built.candidate.applicability }), null);
  } finally { close(fixture); }
});
