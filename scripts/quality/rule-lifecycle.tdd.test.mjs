import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { AUTOMATIC_LEARNING_ADAPTER_EVENT_MATRIX, acquireApprovedReceiptSync, createAutomaticLearningAdapterEvent, createHostAutomaticLearningRunner, enrollAutomaticLearningProfileFromFile, normalizeAutomaticLearningLsRemoteOutput, normalizeAutomaticLearningRunnerResult, openAutomaticLearningRuntimeSource, parseAutomaticLearningChildResult, parseAutomaticLearningFreshBase, recordAutomaticLearningAdapterOutcome, reconcileApprovedBaselineSync, resolveAutomaticLearningRoutes, runAutomaticRuleLearningCoordinator, runAutomaticRuleLearningCoordinatorAsync, verifyBundledBaseline, verifyCanonicalBundledManifest } from './rule-lifecycle.mjs';
import { openRuleLifecycleStore } from './rule-lifecycle-store.mjs';
import { canonicalFindingBytes, createRuleLearningEligibilityEnvelope, createRuleLearningFinding } from './rule-learning-contracts.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const INITIAL_PARENT = 'a4501c23c3dc8b007995825682b22207cf8f3082';

function seed(root, baseline_parent_commit = INITIAL_PARENT) {
  const bytes = Buffer.from('# Baseline\n');
  const rule = { rule_id: 'pidex-global:pidex-implementer:baseline', path: 'rules/pidex-implementer/baseline.md', byte_hash: hash(bytes), protection_class: 'legacy_baseline' };
  const body = { schema: 'pidex-bundled-rule-seed-v1', source_kind: 'packaged_baseline', baseline_parent_commit, agent_count: 0, rule_count: 1, agents: [], rules: [rule] };
  const manifest = { ...body, aggregate_digest: hash(canonical(body)) };
  const file = path.join(root, rule.path); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, bytes);
  mkdirSync(path.join(root, 'config'), { recursive: true }); writeFileSync(path.join(root, 'config/rule-baseline-manifest.json'), `${JSON.stringify(manifest)}\n`);
  return { file, manifest };
}

test('Plan238 adapter facts accept one shell-free enrolled base and deterministically encode a closed event', async () => {
  const oid = 'A'.repeat(40);
  assert.equal(await parseAutomaticLearningFreshBase({ processAdapter: (input) => { assert.deepEqual(input, { enrolledRepository: '/enrolled/repository', enrolledRemote: 'https://example.invalid/rules.git', branch: 'main' }); return { status: 0, stdout: `${oid}\n` }; }, enrolledRepository: '/enrolled/repository', remote: 'https://example.invalid/rules.git', branch: 'main' }), oid.toLowerCase());
  for (const output of ['', `${oid}\n${oid}\n`, `${oid} ref\n`, 'a'.repeat(39)]) assert.equal(await parseAutomaticLearningFreshBase({ processAdapter: () => ({ status: 0, stdout: output }), enrolledRepository: '/enrolled/repository', remote: 'https://example.invalid/rules.git', branch: 'main' }), null);
  const facts = { tier: 'project', scope_digest: '1'.repeat(64), stage: 'state', role: null, work_digest: null, run_retry_digest: '2'.repeat(64), principal_digest: null, route_digest: null, profile_generation: null, configuration_generation: null, disposition: 'blocked_state_authority', reason_code: 'state_authority_invalid' };
  const first = createAutomaticLearningAdapterEvent({ ...facts, occurred_at: '2026-08-20T00:00:00.000Z' });
  const replay = createAutomaticLearningAdapterEvent({ ...facts, occurred_at: '2026-08-21T00:00:00.000Z' });
  assert.deepEqual(Object.keys(first), ['schema', 'event_id', 'event_type', 'tier', 'scope_digest', 'stage', 'role', 'work_digest', 'run_retry_digest', 'principal_digest', 'route_digest', 'profile_generation', 'configuration_generation', 'disposition', 'reason_code', 'occurred_at']);
  assert.equal(first.schema, 'pidex-rule-learning-adapter-event-v1'); assert.equal(first.event_type, 'authority_blocked'); assert.equal(first.event_id, 'ca8d543250427d3ef3806e7bc04986fc60f3b67355e07da8434cf441864f0cb3', 'independent TEL-PA-ID vector includes schema after domain'); assert.equal(first.event_id, replay.event_id);
  assert.equal(createAutomaticLearningAdapterEvent({ ...facts, reason_code: 'unknown' }), null);
});
test('Plan238 outcome seam atomically records known adapter block and leaves prepared event-free', () => {
  const calls = []; const facts = { tier: 'project', scope_digest: '1'.repeat(64), run_retry_digest: '2'.repeat(64), profile_generation: '3'.repeat(64), configuration_generation: '4'.repeat(64), occurred_at: '2026-08-20T00:00:00.000Z' };
  const store = { appendAutomaticLearningAdapterEvent({ event }) { calls.push(event); return { status: 'recorded' }; } };
  const blocked = recordAutomaticLearningAdapterOutcome({ store, outcome: { status: 'blocked_target_authority', reason_code: 'target_invalid', stage: 'target', role: null }, facts });
  assert.equal(blocked.status, 'blocked_target_authority'); assert.deepEqual(calls.map(({ reason_code, stage, role, disposition }) => ({ reason_code, stage, role, disposition })), [{ reason_code: 'target_invalid', stage: 'target', role: null, disposition: 'blocked_target_authority' }]);
  assert.equal(recordAutomaticLearningAdapterOutcome({ store, outcome: { status: 'prepared' }, facts }).status, 'prepared'); assert.equal(calls.length, 1);
  assert.equal(recordAutomaticLearningAdapterOutcome({ store, outcome: { status: 'blocked_unknown' }, facts }).status, 'blocked_unmappable');
});
test('Plan238 TEL-PA-1..55 matrix is total, role-bound, and private-field free', () => {
  assert.deepEqual(AUTOMATIC_LEARNING_ADAPTER_EVENT_MATRIX.map((row) => row.id), Array.from({ length: 55 }, (_, index) => `TEL-PA-${index + 1}`));
  assert.equal(new Set(AUTOMATIC_LEARNING_ADAPTER_EVENT_MATRIX.map((row) => `${row.reason_code}:${row.stage}`)).size, 55);
  assert.deepEqual(AUTOMATIC_LEARNING_ADAPTER_EVENT_MATRIX.filter((row) => row.stage === 'generator').map((row) => row.role), Array(6).fill('pidex-pi'));
  assert.equal(JSON.stringify(AUTOMATIC_LEARNING_ADAPTER_EVENT_MATRIX).match(/RAW-FINDING-SENTINEL|PRIVATE-PROMPT-SENTINEL/i), null);
  const base = { tier: 'project', scope_digest: '1'.repeat(64), stage: 'generator', role: 'pidex-pi', work_digest: '2'.repeat(64), run_retry_digest: '3'.repeat(64), principal_digest: '4'.repeat(64), route_digest: '5'.repeat(64), profile_generation: '6'.repeat(64), configuration_generation: '7'.repeat(64), disposition: 'blocked_route_authority', reason_code: 'route_missing', occurred_at: '2026-08-20T00:00:00.000Z' };
  assert.equal(createAutomaticLearningAdapterEvent({ ...base, role: 'pidex-critic' }), null);
  assert.equal(createAutomaticLearningAdapterEvent({ ...base, stage: 'reviewer', role: 'pidex-security', reason_code: 'runner_failure', disposition: 'blocked_recovery_pending' }), null, 'project-only scope event cannot use global-only reviewer');
});
test('F-254-02 enrolls exact canonical automatic profile bytes once and rejects changed or unsafe operator files', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-profile-producer-state-')); const profileRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-profile-producer-file-')); const profileFile = path.join(profileRoot, 'automatic-profile.json');
  const generation = 'a'.repeat(64); const profile = { schema_version: 'pidex-automatic-learning-profile-v1', route_generation: generation, enrollment: { targets: {} }, reviewers: { configuration_generation: generation } };
  try {
    const bytes = Buffer.from(canonical(profile), 'utf8'); writeFileSync(profileFile, bytes);
    assert.deepEqual(enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }), { status: 'enrolled', route_generation: generation });
    assert.deepEqual(enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }), { status: 'existing', route_generation: generation });
    writeFileSync(profileFile, canonical({ ...profile, route_generation: 'b'.repeat(64), reviewers: { configuration_generation: 'b'.repeat(64) } }));
    assert.throws(() => enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }), /RULE_AUTOMATIC_LEARNING_PROFILE_CONFLICT/);
    writeFileSync(profileFile, `${canonical(profile)}\n`);
    assert.throws(() => enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }), /RULE_AUTOMATIC_LEARNING_PROFILE_FILE_INVALID/);
    writeFileSync(profileFile, bytes); const linked = path.join(profileRoot, 'profile-link.json');
    symlinkSync(profileFile, linked);
    assert.throws(() => enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile: linked }), /RULE_AUTOMATIC_LEARNING_PROFILE_FILE_INVALID/);
    writeFileSync(profileFile, canonical({ ...profile, unexpected: true }));
    assert.throws(() => enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }), /RULE_AUTOMATIC_LEARNING_PROFILE_INVALID/);
    writeFileSync(profileFile, Buffer.alloc(65_537, 0x20));
    assert.throws(() => enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }), /RULE_AUTOMATIC_LEARNING_PROFILE_FILE_INVALID/);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(profileRoot, { recursive: true, force: true }); }
});
test('F-254-02 CLI enroll-automatic-profile delegates only explicit state and profile inputs', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-profile-cli-state-')); const profileRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-profile-cli-file-')); const profileFile = path.join(profileRoot, 'automatic-profile.json'); const generation = 'c'.repeat(64); const profile = { schema_version: 'pidex-automatic-learning-profile-v1', route_generation: generation, enrollment: { targets: {} }, reviewers: { configuration_generation: generation } };
  try {
    writeFileSync(profileFile, canonical(profile));
    const command = [process.execPath, 'scripts/quality/rule-lifecycle.mjs', 'enroll-automatic-profile', '--state-root', stateRoot, '--profile-file', profileFile]; const first = spawnSync(command[0], command.slice(1), { encoding: 'utf8' }); const retry = spawnSync(command[0], command.slice(1), { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr); assert.deepEqual(JSON.parse(first.stdout), { status: 'enrolled', route_generation: generation }); assert.equal(retry.status, 0, retry.stderr); assert.deepEqual(JSON.parse(retry.stdout), { status: 'existing', route_generation: generation });
  } finally { rmSync(stateRoot, { recursive: true, force: true }); rmSync(profileRoot, { recursive: true, force: true }); }
});
test('F-254-01 normalizes only one exact lowercase enrolled ls-remote head record', () => {
  const oid = 'a'.repeat(40);
  assert.equal(normalizeAutomaticLearningLsRemoteOutput({ stdout: `${oid}\trefs/heads/main\n`, branch: 'main' }), oid);
  for (const stdout of ['', `${oid}\trefs/heads/main`, `${oid}\trefs/heads/main\n${oid}\trefs/heads/main\n`, `${oid}\trefs/heads/other\n`, `${oid.toUpperCase()}\trefs/heads/main\n`, `${oid.slice(0, 39)}\trefs/heads/main\n`, `${oid}\trefs/tags/main\n`, `${oid}\trefs/heads/main^{}\n`]) assert.equal(normalizeAutomaticLearningLsRemoteOutput({ stdout, branch: 'main' }), null);
});
test('Plan238 fresh-base parser awaits only exact enrolled process adapter facts', async () => {
  const oid = 'B'.repeat(40);
  const calls = [];
  assert.equal(await parseAutomaticLearningFreshBase({ processAdapter: async (input) => { calls.push(input); return { status: 0, stdout: `${oid}\n` }; }, enrolledRepository: '/enrolled/repository', remote: 'https://example.invalid/rules.git', branch: 'main' }), oid.toLowerCase());
  assert.deepEqual(calls, [{ enrolledRepository: '/enrolled/repository', enrolledRemote: 'https://example.invalid/rules.git', branch: 'main' }]);
});
test('Plan238 P1 source opens only canonical existing profiled store and mints enrolled eligibility', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan238-source-root-')); const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-plan238-source-state-')); const scope = '1'.repeat(24); const foreignScope = '2'.repeat(24); const repository = `repo:${'3'.repeat(64)}`; const host = `host:${'4'.repeat(64)}`; const now = '2026-08-20T00:00:00.000Z';
  const routes = Object.fromEntries(['pidex-pi', 'pidex-critic', 'pidex-code-reviewer'].map((principal) => [principal, { principal, provider: 'fake', model: `fake/${principal}`, effort: 'high' }]));
  const finding = (project_scope_id = scope) => createRuleLearningFinding({ schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${project_scope_id === scope ? '5'.repeat(16) : '6'.repeat(16)}`, producer: 'pidex-retrospective', completed_run_id: `run:${project_scope_id === scope ? 'plan238-source' : 'foreign-source'}`, plan_id: 'plan:238', project_scope_id, repository_identity: repository, taxonomy: 'quality_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:plan238-source', lesson_summary: 'Keep runtime source enrolled.', evidence_digests: ['7'.repeat(64)], occurred_at: now, redaction_classes: ['none'] });
  const writer_authority = { normalized_remote_digest: '8'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: '9'.repeat(64), identity_platform: 'posix', root_identity_digest: 'a'.repeat(64), parent_identity_digest: 'b'.repeat(64), files_identity_digest: 'c'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: now };
  try {
    mkdirSync(path.join(root, 'config'), { recursive: true }); writeFileSync(path.join(root, 'config', 'agents.json'), JSON.stringify({ agents: routes }));
    const configuration = resolveAutomaticLearningRoutes({ root, tier: 'project' }); const target = { repository, tier: 'project', scope_id: scope, scope_digest: 'd'.repeat(64), rule_id: `project:${scope}:pidex-implementer:plan238-source`, predecessor: `commit:${'e'.repeat(40)}`, authority_digest: 'f'.repeat(64), enabled: true, protected: false, applicable_descriptors: [{ descriptor_digest: '0'.repeat(64) }], existing: [] };
    const profile = { schema_version: 'pidex-automatic-learning-profile-v1', route_generation: configuration.configuration_generation, enrollment: { evaluator_host_id: host, authority_digest: target.authority_digest, sources: [finding()].map((item) => ({ finding_id: item.finding_id, snapshot: { finding_id: item.finding_id, scope_id: item.project_scope_id, repository_identity: item.repository_identity, repository: item.repository_identity, enabled: true, protected: false } })), targets: { project: target }, policy: { id: 'policy:plan238-source', version: 'v1', digest: '1'.repeat(64) }, generator_identity: { principal: 'pidex-pi', attempt_id: 'attempt:plan238-source' } }, reviewers: { configuration_generation: configuration.configuration_generation, generator_principal: 'pidex-pi', now, principals: [] } };
    const profileFile = path.join(root, 'automatic-profile.json'); writeFileSync(profileFile, canonical(profile)); assert.equal(enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile }).status, 'enrolled');
    const bootstrap = openRuleLifecycleStore({ stateRoot }); bootstrap.enroll({ repository, scope_id: scope, remote: 'https://example.invalid/plan238-source.git', branch: 'refs/heads/main' }); bootstrap.enrollPublicationTarget({ repository, tier: 'project', scope_id: scope, scope_digest: target.scope_digest, rule_id: target.rule_id, predecessor: target.predecessor, enrollment_digest: '2'.repeat(64), allowed_paths: ['pidex/rules/managed/pidex-implementer/index.md', 'pidex/rules/managed/pidex-implementer/plan238-source.md'], writer_authority }); bootstrap.close();
    const source = openAutomaticLearningRuntimeSource({ root, env: { PIDEX_STATE_DIR: stateRoot }, tier: 'project', scope_id: scope });
    assert.deepEqual(Object.keys(source).sort(), ['close', 'configuration_generation', 'readHistory', 'recordFinding', 'run', 'scope_id', 'tier']);
    const processCalls = [];
    const run = await source.run({
      finding_bytes: canonicalFindingBytes(finding()), retry_family_id: 'retry:plan238-source', now,
      processAdapter: (input) => { processCalls.push(input); return { status: 0, stdout: `${'e'.repeat(40)}\n` }; },
      runner: async ({ role }) => ({ ok: true, bytes: role === 'pidex-pi'
        ? Buffer.from('{"applicability":["implementation"],"expected_evidence":"Configured review quorum.","failure_behavior":"Block publication.","instruction":"Keep repeated review findings durable.","rationale":"Bounded enrolled authority.","slug":"automatic-coordinator","trigger":"Before publication."}')
        : Buffer.from('{"decision":"accept","schema_version":"pidex-rule-learning-review-v1"}') }),
    });
    assert.equal(run.status, 'not_admitted');
    const telemetryDb = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); assert.equal(telemetryDb.prepare('SELECT count(*) AS count FROM rule_learning_adapter_event').get().count, 0, 'valid negative admission never becomes TEL8'); telemetryDb.close();
    assert.deepEqual(processCalls, [{ enrolledRepository: repository, enrolledRemote: 'https://example.invalid/plan238-source.git', branch: 'main' }]);
    assert.equal(source.recordFinding({ finding_bytes: canonicalFindingBytes(finding()), retry_family_id: 'retry:plan238-source' }).status, 'existing');
    assert.equal(source.recordFinding({ finding_bytes: canonicalFindingBytes(finding()), retry_family_id: 'retry:plan238-source' }).status, 'existing');
    assert.deepEqual(source.readHistory().findings.map((item) => item.digest), [hash(canonicalFindingBytes(finding()))]);
    assert.equal(source.recordFinding({ finding_bytes: canonicalFindingBytes(finding(foreignScope)), retry_family_id: 'retry:plan238-foreign' }), null, 'foreign project source never crosses source capability');
    const contender = openAutomaticLearningRuntimeSource({ root, env: { PIDEX_STATE_DIR: stateRoot }, tier: 'project', scope_id: scope }); assert.equal(contender.recordFinding({ finding_bytes: canonicalFindingBytes(finding()), retry_family_id: 'retry:plan238-source' }).status, 'existing'); contender.close(); source.close();
    const tamper = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); tamper.prepare('UPDATE publication_enrollment SET predecessor = ? WHERE repository = ?').run(`commit:${'0'.repeat(40)}`, repository); tamper.close();
    assert.throws(() => openAutomaticLearningRuntimeSource({ root, env: { PIDEX_STATE_DIR: stateRoot }, tier: 'project', scope_id: scope }), /RULE_AUTOMATIC_LEARNING_RUNTIME_UNAVAILABLE/, 'tampered current publication enrollment blocks source remint');
    const restore = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); restore.prepare('UPDATE publication_enrollment SET predecessor = ? WHERE repository = ?').run(target.predecessor, repository); restore.close();
    writeFileSync(path.join(root, 'config', 'agents.json'), JSON.stringify({ agents: { ...routes, 'pidex-pi': { ...routes['pidex-pi'], model: 'fake/drifted' } } }));
    assert.throws(() => openAutomaticLearningRuntimeSource({ root, env: { PIDEX_STATE_DIR: stateRoot }, tier: 'project', scope_id: scope }), /RULE_AUTOMATIC_LEARNING_PROFILE_UNAVAILABLE/);
    const missing = path.join(root, 'missing-state'); assert.throws(() => openAutomaticLearningRuntimeSource({ root, env: { PIDEX_STATE_DIR: missing }, tier: 'project', scope_id: scope }), /RULE_LIFECYCLE_EXISTING_STORE_UNAVAILABLE/); assert.equal(existsSync(missing), false, 'existing-only source opening never creates state root');
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('Plan238 host runner consumes only bounded successful finalText bytes', async () => {
  const route = { principal: 'pidex-pi', provider: 'pi', model: 'fake/pidex-pi', effort: 'high' };
  const runner = createHostAutomaticLearningRunner({ cwd: '/enrolled/repository', runConfigured: async ({ agent }) => ({ exitCode: 0, finalText: agent === 'pidex-pi' ? '{"ok":true}' : '' }) });
  assert.deepEqual(await runner({ role: 'pidex-pi', input: { route } }), { ok: true, bytes: Buffer.from('{"ok":true}') });
  for (const result of [{ exitCode: 1, finalText: '{"ok":true}' }, { exitCode: 0, finalText: '' }, { exitCode: 0, finalText: 'x'.repeat(16_385) }, { exitCode: 0, finalText: '{"ok":true}', fallback: true }]) assert.equal((await createHostAutomaticLearningRunner({ cwd: '/enrolled/repository', runConfigured: async () => result })({ role: 'pidex-pi', input: { route } })).ok, false);
});
test('Plan238 host runner binds exact resolved route, no tools, review dispatch, and rejects all fallback outcomes', async () => {
  const calls = [];
  const route = { principal: 'pidex-pi', provider: 'pi', model: 'fake/pidex-pi', effort: 'high', backend_identity: 'a'.repeat(64) };
  const runner = createHostAutomaticLearningRunner({ cwd: '/enrolled/repository', runConfigured: async (params) => { calls.push(params); return { exitCode: 0, finalText: '{"ok":true}' }; } });
  assert.deepEqual(await runner({ role: 'pidex-pi', input: { route, support: { safe: 'only' } } }), { ok: true, bytes: Buffer.from('{"ok":true}') });
  assert.deepEqual(calls, [{ agent: 'pidex-pi', cwd: '/enrolled/repository', route: { provider: 'pi', model: 'fake/pidex-pi', effort: 'high', routeSource: 'automatic-learning:pidex-pi' }, providerOverride: 'pi', modelOverride: 'fake/pidex-pi', effortOverride: 'high', reviewDispatch: true, tools: [], task: '{"input":{"support":{"safe":"only"}},"role":"pidex-pi","schema":"pidex-automatic-learning-runner-v1"}' }]);
  for (const result of [{ exitCode: 1, finalText: '{"ok":true}' }, { exitCode: 0, finalText: '{"ok":true}', fallbackFrom: 'codex' }, { exitCode: 0, finalText: '{"ok":true}', timedOut: true }, { exitCode: 0, finalText: '{"ok":true}', aborted: true }, { exitCode: 0 }]) assert.equal((await createHostAutomaticLearningRunner({ cwd: '/enrolled/repository', runConfigured: async () => result })({ role: 'pidex-pi', input: { route } })).ok, false);
});
test('automatic route resolution uses explicit named config routes with separated digests and rejects defaults or aliases', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-automatic-routes-'));
  const agents = Object.fromEntries(['pidex-pi', 'pidex-critic', 'pidex-code-reviewer', 'pidex-security'].map((principal) => [principal, { principal, provider: 'pi', model: `fake/${principal}`, effort: 'high' }]));
  try {
    mkdirSync(path.join(root, 'config'), { recursive: true });
    writeFileSync(path.join(root, 'config/agents.json'), JSON.stringify({ defaults: { provider: 'pi', model: 'default/model', effort: 'low' }, agents }));
    const global = resolveAutomaticLearningRoutes({ root, tier: 'global' });
    const project = resolveAutomaticLearningRoutes({ root, tier: 'project' });
    assert.deepEqual(Object.keys(global.routes), ['pidex-pi', 'pidex-critic', 'pidex-code-reviewer', 'pidex-security']);
    assert.deepEqual(Object.keys(project.routes), ['pidex-pi', 'pidex-critic', 'pidex-code-reviewer']);
    assert.match(global.configuration_generation, /^[a-f0-9]{64}$/);
    assert.match(global.routes['pidex-pi'].backend_identity, /^[a-f0-9]{64}$/);
    assert.notEqual(global.configuration_generation, global.routes['pidex-pi'].backend_identity);
    agents['pidex-critic'] = { principal: 'alias', provider: 'pi', model: 'fake/critic', effort: 'high' };
    writeFileSync(path.join(root, 'config/agents.json'), JSON.stringify({ defaults: { provider: 'pi', model: 'default/model', effort: 'low' }, agents }));
    assert.equal(resolveAutomaticLearningRoutes({ root, tier: 'project' }), null);
    agents['pidex-critic'] = { principal: 'pidex-critic', model: 'fake/critic', effort: 'high' };
    writeFileSync(path.join(root, 'config/agents.json'), JSON.stringify({ defaults: { provider: 'pi', model: 'default/model', effort: 'low' }, agents }));
    assert.equal(resolveAutomaticLearningRoutes({ root, tier: 'project' }), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('automatic runner child parser accepts only bounded canonical closed generator/reviewer bytes', () => {
  const generator = Buffer.from('{"applicability":["implementation"],"expected_evidence":"Configured review quorum.","failure_behavior":"Block publication.","instruction":"Keep repeated review findings durable.","rationale":"Bounded enrolled authority.","slug":"automatic-coordinator","trigger":"Before publication."}', 'utf8');
  assert.deepEqual(parseAutomaticLearningChildResult({ role: 'pidex-pi', bytes: generator }), JSON.parse(generator));
  assert.deepEqual(parseAutomaticLearningChildResult({ role: 'pidex-critic', bytes: Buffer.from('{"decision":"accept","schema_version":"pidex-rule-learning-review-v1"}') }), { schema_version: 'pidex-rule-learning-review-v1', decision: 'accept' });
  for (const bytes of [Buffer.from('```json\n{}\n```'), Buffer.from('{"slug":"x"}'), Buffer.from('{"decision":"accept","schema_version":"pidex-rule-learning-review-v1","extra":true}'), Buffer.from('{"decision":"maybe","schema_version":"pidex-rule-learning-review-v1"}')]) assert.equal(parseAutomaticLearningChildResult({ role: 'pidex-pi', bytes }), null);
});
test('automatic coordinator blocks missing exact configured roles before durable/model/TX effects', () => {
  let modelCalls = 0;
  const result = runAutomaticRuleLearningCoordinator({
    store: { persistAutomaticLearningFinding() { throw new Error('must not persist'); } },
    finding_bytes: Buffer.from('{}'),
    eligibility: {},
    tier: 'project',
    scope_id: 'a'.repeat(24),
    source_generation: 'source:1',
    now: '2026-08-14T00:00:00.000Z',
    runner_configuration: { configuration_generation: 'generation:1', routes: { 'pidex-pi': { principal: 'pidex-pi', provider: 'provider', model: 'model', backend_identity: 'backend:pi' } } },
    runner() { modelCalls += 1; },
  });
  assert.deepEqual(result, { status: 'blocked_runner_configuration' });
  assert.equal(modelCalls, 0);
});
test('automatic coordinator persists ingress only after exact routes and returns blocked eligibility without model work', () => {
  let persisted = 0;
  const configuration = { configuration_generation: 'generation:1', routes: {
    'pidex-pi': { principal: 'pidex-pi', provider: 'provider', model: 'model', backend_identity: 'backend:pi' },
    'pidex-critic': { principal: 'pidex-critic', provider: 'provider', model: 'model', backend_identity: 'backend:critic' },
    'pidex-code-reviewer': { principal: 'pidex-code-reviewer', provider: 'provider', model: 'model', backend_identity: 'backend:reviewer' },
  } };
  const result = runAutomaticRuleLearningCoordinator({
    store: { persistAutomaticLearningFinding({ finding_bytes, eligibility }) { persisted += 1; assert.equal(finding_bytes.toString(), '{"canonical":true}'); assert.deepEqual(eligibility, { eligible: true }); return { status: 'persisted' }; } },
    finding_bytes: Buffer.from('{"canonical":true}'), eligibility: { eligible: true }, tier: 'project', scope_id: 'a'.repeat(24),
    runner_configuration: configuration,
  });
  assert.deepEqual(result, { status: 'blocked_finding_eligibility' });
  assert.equal(persisted, 1);
});
test('automatic async coordinator persists isolated project/global history, bounded child output, durable dispatches, admits, remints target, and prepares TX-01', async () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-automatic-coordinator-'));
  const now = '2026-08-14T00:00:00.000Z'; const host = `host:${'a'.repeat(64)}`; const base = 'b'.repeat(40);
  const finding = (scope, repository, id, run) => createRuleLearningFinding({ schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${id.repeat(16)}`, producer: 'pidex-retrospective', completed_run_id: `run:${run}`, plan_id: 'plan:047', project_scope_id: scope, repository_identity: repository, taxonomy: 'quality_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: 'quality:automatic-coordinator', lesson_summary: 'Persist reviewed recurrence safely.', evidence_digests: ['c'.repeat(64)], occurred_at: now, redaction_classes: ['none'] });
  const scopeA = '1'.repeat(24); const scopeB = '2'.repeat(24); const repoA = `repo:${'3'.repeat(64)}`; const repoB = `repo:${'4'.repeat(64)}`; const first = finding(scopeA, repoA, '5', 'first'); const second = finding(scopeB, repoB, '6', 'second');
  const writer_authority = { normalized_remote_digest: '7'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: '8'.repeat(64), identity_platform: 'posix', root_identity_digest: '9'.repeat(64), parent_identity_digest: 'a'.repeat(64), files_identity_digest: 'b'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: now };
  const target = { repository: 'repo:global-coordinator', tier: 'global', scope_id: null, scope_digest: 'c'.repeat(64), rule_id: 'pidex-global:pidex-implementer:automatic-coordinator', predecessor: `commit:${base}`, authority_digest: 'd'.repeat(64), enabled: true, protected: false, applicable_descriptors: [{ descriptor_digest: 'e'.repeat(64) }], existing: [] };
  const routes = Object.fromEntries(['pidex-pi', 'pidex-critic', 'pidex-code-reviewer', 'pidex-security'].map((principal) => [principal, { principal, provider: 'fake-provider', model: 'fake-model', backend_identity: `backend:${principal}` }]));
  const authority = { enrollment: { authority_digest: target.authority_digest, sources: [first, second].map((item) => ({ finding_id: item.finding_id, snapshot: { finding_id: item.finding_id, scope_id: item.project_scope_id, repository_identity: item.repository_identity, repository: item.repository_identity, enabled: true, protected: false } })), targets: { global: target }, policy: { id: 'policy:automatic', version: 'v1', digest: 'f'.repeat(64) }, generator_identity: { principal: 'pidex-pi', attempt_id: 'attempt:generator' } }, reviewers: { configuration_generation: 'generation:1', generator_principal: 'pidex-pi', now, principals: ['pidex-critic', 'pidex-code-reviewer', 'pidex-security'].map((principal) => ({ principal, backend: routes[principal].backend_identity, provider: routes[principal].provider, model: routes[principal].model })) } };
  const store = openRuleLifecycleStore({ stateRoot, learningAuthority: authority }); const calls = [];
  try {
    for (const [repository, scope] of [[repoA, scopeA], [repoB, scopeB], [target.repository, null]]) store.enroll({ repository, scope_id: scope, remote: `https://example.invalid/${repository}`, branch: 'refs/heads/main' });
    store.enrollPublicationTarget({ repository: target.repository, tier: 'global', scope_id: 'pidex-global', scope_digest: target.scope_digest, rule_id: target.rule_id, predecessor: target.predecessor, enrollment_digest: '0'.repeat(64), allowed_paths: ['config/rule-baseline-manifest.json', 'rules/pidex-implementer/automatic-coordinator.md', 'rules/pidex-implementer/index.md'], writer_authority });
    const eligibility = (item, retry) => createRuleLearningEligibilityEnvelope({ finding: item, retry_family_id: retry, evaluator_host_id: host });
    assert.equal(store.persistAutomaticLearningFinding({ finding_bytes: canonicalFindingBytes(first), eligibility: eligibility(first, 'retry:first') }).status, 'persisted');
    const runner = async ({ role }) => { calls.push(role); return { ok: true, bytes: role === 'pidex-pi'
      ? Buffer.from('{"applicability":["implementation"],"expected_evidence":"Configured review quorum.","failure_behavior":"Block publication.","instruction":"Keep repeated review findings durable.","rationale":"Bounded enrolled authority.","slug":"automatic-coordinator","trigger":"Before publication."}')
      : Buffer.from('{"decision":"accept","schema_version":"pidex-rule-learning-review-v1"}') }; };
    const input = { store, finding_bytes: canonicalFindingBytes(second), eligibility: eligibility(second, 'retry:second'), tier: 'global', scope_id: 'pidex-global', source_generation: 'source:1', runner_configuration: { configuration_generation: 'generation:1', routes }, runner, fresh_base: base, now };
    const result = await runAutomaticRuleLearningCoordinatorAsync(input);
    assert.equal(result.status, 'prepared'); assert.deepEqual(result.writer_handoff, { kind: 'TX-01', transaction: result.transaction }); assert.deepEqual(calls, ['pidex-pi', 'pidex-critic', 'pidex-code-reviewer', 'pidex-security']);
    assert.equal(store.readAutomaticLearningHistory({ capability: store.mintAutomaticLearningHistoryCapability({ tier: 'project', scope_id: scopeA }) }).findings.length, 1);
    assert.equal(store.readAutomaticLearningHistory({ capability: store.mintAutomaticLearningHistoryCapability({ tier: 'global', scope_id: 'pidex-global' }) }).findings.length, 2);
    assert.equal(store.readPublicationTransaction({ idempotency_key: result.transaction }).state, 'prepared');
    assert.equal((await runAutomaticRuleLearningCoordinatorAsync({ ...input, runner: async () => { throw new Error('must reuse durable results'); } })).status, 'existing'); assert.equal(calls.length, 4);
    assert.equal((await runAutomaticRuleLearningCoordinatorAsync({ ...input, source_generation: 'source:pending', runner: async () => { calls.push('pending'); throw new Error('crash after dispatch'); } })).status, 'blocked_recovery_pending'); const pendingCalls = calls.length;
    assert.equal((await runAutomaticRuleLearningCoordinatorAsync({ ...input, source_generation: 'source:pending', runner: async () => { throw new Error('must not reissue dispatched work'); } })).status, 'blocked_recovery_pending'); assert.equal(calls.length, pendingCalls);
    assert.equal((await runAutomaticRuleLearningCoordinatorAsync({ ...input, runner_configuration: { configuration_generation: 'generation:drift', routes }, runner: async () => { throw new Error('must not dispatch drift'); } })).status, 'blocked_source_fact_drift');
    for (const configuration of [{ configuration_generation: 'generation:1', routes: { ...routes, 'pidex-security': { ...routes['pidex-security'], backend_identity: routes['pidex-code-reviewer'].backend_identity } } }, { configuration_generation: 'generation:1', routes: { 'pidex-pi': routes['pidex-pi'] } }]) assert.equal((await runAutomaticRuleLearningCoordinatorAsync({ ...input, runner_configuration: configuration, runner: async () => { throw new Error('must not dispatch'); } })).status, 'blocked_runner_configuration');
  } finally { store.close(); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('F-254-03 runner result contract preserves every observed failure and route facts', () => {
  const route = { principal: 'pidex-code-reviewer', provider: 'pi', model: 'fake/reviewer', effort: 'high' };
  const expected = { rejected: { rejected: true }, failure: { exitCode: 1 }, timeout: { timedOut: true }, crash: { aborted: true }, unknown_dispatch: undefined, malformed: { exitCode: 0 } };
  for (const [kind, result] of Object.entries(expected)) assert.deepEqual(normalizeAutomaticLearningRunnerResult({ role: route.principal, route, result }), { ok: false, kind, role: route.principal, route });
  assert.deepEqual(normalizeAutomaticLearningRunnerResult({ role: route.principal, route, result: { exitCode: 0, finalText: '{"decision":"accept"}' } }), { ok: true, bytes: Buffer.from('{"decision":"accept"}') });
});
async function withF25403Runtime(testCase, assertRun) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-f25403-root-')); const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-f25403-state-')); const scope = '1'.repeat(24); const repository = `repo:${'2'.repeat(64)}`; const now = '2026-08-20T00:00:00.000Z';
  const routes = Object.fromEntries(['pidex-pi', 'pidex-critic', 'pidex-code-reviewer'].map((principal) => [principal, { principal, provider: 'fake', model: `fake/${principal}`, effort: 'high' }]));
  const finding = createRuleLearningFinding({ schema_version: 'pidex-rule-learning-finding-v1', finding_id: `finding:${hash(testCase.id).slice(0, 16)}`, producer: 'pidex-retrospective', completed_run_id: `run:${testCase.id}`, plan_id: 'plan:238', project_scope_id: scope, repository_identity: repository, taxonomy: 'quality_failure', affected_agent: 'pidex-implementer', affected_phase: 'implementation', recurrence_key: `quality:${testCase.id}`, lesson_summary: 'Persist runtime causal telemetry.', evidence_digests: ['3'.repeat(64)], occurred_at: now, redaction_classes: ['none'] });
  const target = { repository, tier: 'project', scope_id: scope, scope_digest: '4'.repeat(64), rule_id: `project:${scope}:pidex-implementer:f25403`, predecessor: `commit:${'5'.repeat(40)}`, authority_digest: '6'.repeat(64), enabled: true, protected: false, applicable_descriptors: [{ descriptor_digest: '7'.repeat(64) }], existing: [] };
  const writer_authority = { normalized_remote_digest: '8'.repeat(64), branch: 'refs/heads/main', author: 'PIDEX <pidex@example.invalid>', writer_enabled: true, trailer_policy: 'publication-v1', repository_identity_digest: '9'.repeat(64), identity_platform: 'posix', root_identity_digest: 'a'.repeat(64), parent_identity_digest: 'b'.repeat(64), files_identity_digest: 'c'.repeat(64), identity_proof: 'supported-v1', publication_timestamp: now };
  try {
    mkdirSync(path.join(root, 'config'), { recursive: true }); writeFileSync(path.join(root, 'config', 'agents.json'), JSON.stringify({ agents: routes }));
    const configuration = resolveAutomaticLearningRoutes({ root, tier: 'project' }); const profile = { schema_version: 'pidex-automatic-learning-profile-v1', route_generation: configuration.configuration_generation, enrollment: { evaluator_host_id: `host:${'d'.repeat(64)}`, authority_digest: target.authority_digest, sources: [{ finding_id: finding.finding_id, snapshot: { finding_id: finding.finding_id, scope_id: scope, repository_identity: repository, repository, enabled: true, protected: false } }], targets: { project: target }, policy: { id: 'policy:f25403', version: 'v1', digest: 'e'.repeat(64) }, generator_identity: { principal: 'pidex-pi', attempt_id: 'attempt:f25403' } }, reviewers: { configuration_generation: configuration.configuration_generation, generator_principal: 'pidex-pi', now, principals: [] } };
    const profileFile = path.join(root, 'automatic-profile.json'); writeFileSync(profileFile, canonical(profile)); enrollAutomaticLearningProfileFromFile({ stateRoot, profileFile });
    const bootstrap = openRuleLifecycleStore({ stateRoot }); bootstrap.enroll({ repository, scope_id: scope, remote: 'https://example.invalid/f25403.git', branch: 'refs/heads/main' }); bootstrap.enrollPublicationTarget({ repository, tier: 'project', scope_id: scope, scope_digest: target.scope_digest, rule_id: target.rule_id, predecessor: target.predecessor, enrollment_digest: 'f'.repeat(64), allowed_paths: ['pidex/rules/managed/pidex-implementer/f25403.md', 'pidex/rules/managed/pidex-implementer/index.md'], writer_authority }); bootstrap.close();
    const source = openAutomaticLearningRuntimeSource({ root, env: { PIDEX_STATE_DIR: stateRoot }, tier: 'project', scope_id: scope }); let runnerCalls = 0;
    const validGenerator = Buffer.from('{"applicability":["implementation"],"expected_evidence":"Exact event.","failure_behavior":"Block publication.","instruction":"Persist causal facts.","rationale":"Bounded telemetry.","slug":"f25403-runtime","trigger":"Before publication."}');
    const validReview = Buffer.from('{"decision":"accept","schema_version":"pidex-rule-learning-review-v1"}');
    const runner = async ({ role, input }) => { runnerCalls += 1; return role === testCase.role ? testCase.result({ role, route: input.route }) : { ok: true, bytes: role === 'pidex-pi' ? validGenerator : validReview }; };
    await assertRun({ source, root, scope, finding, now, runner, stateRoot, route: configuration.routes[testCase.role], calls: () => runnerCalls }); source.close();
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(stateRoot, { recursive: true, force: true }); }
}

test('F-254-03 production source persists first runner cause identity and reopens without reissue', async () => {
  const cases = [
    ['22', 'pidex-pi', 'runner_rejected', ({ role, route }) => ({ ok: false, kind: 'rejected', role, route })], ['23', 'pidex-pi', 'runner_malformed', ({ role, route }) => ({ ok: false, kind: 'malformed', role, route })], ['24', 'pidex-pi', 'runner_failure', ({ role, route }) => ({ ok: false, kind: 'failure', role, route })], ['25', 'pidex-pi', 'runner_timeout', ({ role, route }) => ({ ok: false, kind: 'timeout', role, route })], ['26', 'pidex-pi', 'runner_crash', ({ role, route }) => ({ ok: false, kind: 'crash', role, route })], ['27', 'pidex-pi', 'dispatch_unknown', ({ role, route }) => ({ ok: false, kind: 'unknown_dispatch', role, route })], ['51-generator', 'pidex-pi', 'result_authority_mismatch', () => ({ ok: true, bytes: Buffer.from('{}') })],
    ['28', 'pidex-critic', 'runner_rejected', ({ role, route }) => ({ ok: false, kind: 'rejected', role, route })], ['29', 'pidex-critic', 'runner_malformed', ({ role, route }) => ({ ok: false, kind: 'malformed', role, route })], ['30', 'pidex-critic', 'runner_failure', ({ role, route }) => ({ ok: false, kind: 'failure', role, route })], ['31', 'pidex-critic', 'runner_timeout', ({ role, route }) => ({ ok: false, kind: 'timeout', role, route })], ['32', 'pidex-critic', 'runner_crash', ({ role, route }) => ({ ok: false, kind: 'crash', role, route })], ['33', 'pidex-critic', 'dispatch_unknown', ({ role, route }) => ({ ok: false, kind: 'unknown_dispatch', role, route })], ['51-reviewer', 'pidex-critic', 'result_authority_mismatch', () => ({ ok: true, bytes: Buffer.from('{}') })],
  ].map(([id, role, reason_code, result]) => ({ id, role, reason_code, result }));
  for (const testCase of cases) await withF25403Runtime(testCase, async ({ source, finding, now, runner, stateRoot, route, calls }) => {
    const input = { finding_bytes: canonicalFindingBytes(finding), retry_family_id: `retry:${testCase.id.toLowerCase()}`, now, processAdapter: () => ({ status: 0, stdout: `${'5'.repeat(40)}\n` }), runner };
    assert.equal((await source.run(input)).status, 'blocked_recovery_pending');
    const db = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); const rows = db.prepare('SELECT event_bytes FROM rule_learning_adapter_event').all(); assert.equal(rows.length, 1);
    const event = JSON.parse(Buffer.from(rows[0].event_bytes).toString('utf8')); assert.deepEqual({ reason_code: event.reason_code, stage: event.stage, role: event.role, principal_digest: event.principal_digest, route_digest: event.route_digest }, { reason_code: testCase.reason_code, stage: testCase.role === 'pidex-pi' ? 'generator' : 'reviewer', role: testCase.role, principal_digest: hash(testCase.role), route_digest: hash(canonical(route)) }); assert.match(event.work_digest, /^[a-f0-9]{64}$/); assert.equal(db.prepare('SELECT count(*) AS count FROM rule_learning_work_result WHERE work_id = ?').get(`work:${event.work_digest}`).count, 0); db.close();
    if (testCase.id === '26') { const beforeReplay = calls(); assert.equal((await source.run(input)).status, 'blocked_recovery_pending'); const replay = new DatabaseSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite')); const replayRows = replay.prepare('SELECT event_bytes FROM rule_learning_adapter_event').all().map((row) => JSON.parse(Buffer.from(row.event_bytes).toString('utf8'))); replay.close(); assert.equal(calls(), beforeReplay, 'reopen never reissues dispatched runner'); assert.equal(replayRows.filter((event) => event.reason_code === 'recovery_pending' && event.stage === 'recovery' && event.role === null).length, 1, 'reopen emits TEL-PA-44 once'); }
  });
});
test('PB-03 package allowlist and root check wire packaged baseline proof', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('agents/'));
  assert.ok(pkg.files.includes('rules/'));
  assert.ok(pkg.files.includes('config/rule-baseline-manifest.json'));
  assert.match(pkg.scripts.check, /scripts\/quality\/rule-lifecycle\.tdd\.test\.mjs/);
  assert.match(pkg.scripts.check, /scripts\/release\/package-import-smoke\.tdd\.test\.mjs/);
});
test('CR-073-07 accepts exact initial parent only for package seed, then exact accepted-head first-parent mode', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-baseline-'));
  try {
    seed(root);
    assert.equal(verifyBundledBaseline({ root }).baseline_parent_commit, INITIAL_PARENT);
    assert.throws(() => verifyBundledBaseline({ root, acceptedHead: { accepted_commit: 'b'.repeat(40), first_parent_commit: 'c'.repeat(40) } }), /RULE_BASELINE_ANCESTRY_INVALID/);
    const wrongRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-baseline-wrong-'));
    try {
      seed(wrongRoot, 'd'.repeat(40));
      assert.throws(() => verifyBundledBaseline({ root: wrongRoot }), /RULE_BASELINE_ANCESTRY_INVALID/);
    } finally { rmSync(wrongRoot, { recursive: true, force: true }); }
    const accepted = 'b'.repeat(40);
    const firstParent = 'c'.repeat(40);
    seed(root, firstParent);
    assert.equal(verifyBundledBaseline({ root, acceptedHead: { accepted_commit: accepted, first_parent_commit: firstParent } }).accepted_head, accepted);
    assert.throws(() => verifyBundledBaseline({ root, acceptedHead: { accepted_commit: accepted, first_parent_commit: firstParent, baseline_parent_commit: firstParent } }), /RULE_BASELINE_ANCESTRY_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('CR-073-07 read-only sync reconciles enrolled remote, exact first parent, and package manifest without package Git', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-baseline-'));
  try {
    const head = 'b'.repeat(40);
    seed(root, INITIAL_PARENT);
    const git = (args) => {
      const command = args.slice(2).join(' ');
      if (command === 'fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main') return '';
      if (command === 'remote get-url origin') return 'https://example.invalid/pidex.git\n';
      if (command === 'rev-parse refs/remotes/origin/main') return `${head}\n`;
      if (command === `rev-parse ${head}^`) return `${INITIAL_PARENT}\n`;
      if (command === `merge-base --is-ancestor ${INITIAL_PARENT} ${head}`) return '';
      if (command === `rev-list --first-parent ${INITIAL_PARENT}..${head}`) return `${head}\n`;
      if (command === `diff-tree --no-commit-id --name-only -r ${INITIAL_PARENT} ${head}`) return 'rules/pidex-implementer/quality.md\n';
      if (command === `cat-file -p ${head}^{tree}`) return Buffer.from('tree');
      if (command === `show ${head}:config/rule-baseline-manifest.json`) return Buffer.from('{}');
      throw new Error(`unexpected ${command}`);
    };
    const synced = reconcileApprovedBaselineSync({ root, repositoryRoot: '/read-only/repo', enrollment: { repository_identity: 'repo:global', scope_id: 'scope:global', remote_name: 'origin', remote: 'https://example.invalid/pidex.git', branch: 'main' }, git });
    assert.equal(synced.accepted_head, head);
    assert.throws(() => reconcileApprovedBaselineSync({ root, repositoryRoot: '/no-git', enrollment: { repository_identity: 'repo:global', scope_id: 'scope:global', remote_name: 'origin', remote: 'https://example.invalid/pidex.git', branch: 'main' }, git: () => { throw new Error('no Git checkout'); } }), /RULE_APPROVED_SYNC_UNAVAILABLE/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('F-087-SEC-02 production acquire entry verifies once, retries from ledger, and rejects conflicts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-receipt-root-')); const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-receipt-state-'));
  const parent = 'a'.repeat(40); const accepted = 'b'.repeat(40); const ruleId = 'pidex-global:pidex-implementer:quality'; const rulePath = 'rules/pidex-implementer/quality.md'; const indexPath = 'rules/pidex-implementer/index.md'; const manifestPath = 'config/rule-baseline-manifest.json'; const transaction = 'd'.repeat(64); const admission = 'e'.repeat(64);
  const member = Buffer.from(`<!-- pidex-rule-receipt-v1 {"rule_id":"${ruleId}","admission_digest":"${admission}","transaction_digest":"${transaction}","lifecycle_state":"active"} -->\n# quality\n`); const memberHash = hash(member);
  const receipt = { schema: 'pidex-accepted-remote-receipt-v1', status: 'accepted_remote', repository_identity: 'repo:global', scope_id: 'scope:global', rule_id: ruleId, predecessor_commit: parent, accepted_commit: accepted, tree_digest: hash(Buffer.from('tree')), content_hash: memberHash, admission_digest: admission, transaction_digest: transaction, lifecycle_state: 'active' };
  mkdirSync(path.join(root, 'config'), { recursive: true }); writeFileSync(path.join(root, manifestPath), JSON.stringify({ baseline_parent_commit: parent }));
  let fetches = 0;
  const git = (args) => {
    const command = args.slice(2).join(' ');
    if (command.startsWith('fetch ')) { fetches += 1; return ''; }
    if (command === 'remote get-url origin') return 'https://example.invalid/rules.git';
    if (command === 'rev-parse refs/remotes/origin/main') return accepted;
    if (command === `merge-base --is-ancestor ${parent} ${accepted}`) return '';
    if (command === `rev-parse ${accepted}^`) return parent;
    if (command === `rev-list --first-parent ${parent}..${accepted}`) return accepted;
    if (command === `diff-tree --no-commit-id --name-only -r ${parent} ${accepted}`) return `${rulePath}\n${indexPath}\n${manifestPath}\n`;
    if (command === `cat-file -p ${accepted}^{tree}`) return Buffer.from('tree');
    if (command === `show ${accepted}:${rulePath}`) return member;
    if (command === `show ${accepted}:${indexPath}`) return `- [${ruleId}](quality.md)\n`;
    if (command === `show ${accepted}:${manifestPath}`) return JSON.stringify({ schema: 'pidex-bundled-rule-seed-v1', rules: [{ rule_id: ruleId, path: rulePath, byte_hash: memberHash }] });
    throw new Error(`unexpected ${command}`);
  };
  const input = { root, stateRoot, repositoryRoot: '/fixture', receipt, enrollment: { repository_identity: receipt.repository_identity, scope_id: receipt.scope_id, remote_name: 'origin', remote: 'https://example.invalid/rules.git', branch: 'main', allowed_paths: [rulePath, indexPath, manifestPath] }, git };
  try {
    assert.equal(acquireApprovedReceiptSync(input).accepted_remote_head, accepted);
    assert.equal(acquireApprovedReceiptSync(input).accepted_remote_head, accepted);
    assert.equal(fetches, 1, 'exact retry returns ledger result without remote refetch');
    assert.throws(() => acquireApprovedReceiptSync({ ...input, receipt: { ...receipt, admission_digest: 'f'.repeat(64) } }), /RULE_RECEIPT_CONFLICT/);
    rmSync(path.join(stateRoot, 'quality', 'rule-lifecycle', 'lifecycle.sqlite'), { force: true });
    assert.equal(acquireApprovedReceiptSync(input).accepted_remote_head, accepted);
    assert.equal(fetches, 2, 'missing ledger requires fresh remote proof');
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(stateRoot, { recursive: true, force: true }); }
});
test('B1 shared canonical manifest verifier reads every declared member and rejects malformed aggregate or undeclared/mutated members', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-baseline-shared-'));
  try {
    const { manifest } = seed(root);
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const members = new Map([['rules/pidex-implementer/baseline.md', Buffer.from('# Baseline\n')]]);
    assert.equal(verifyCanonicalBundledManifest({ manifestBytes, readMember: (memberPath) => members.get(memberPath) }).members.length, 1);
    assert.throws(() => verifyCanonicalBundledManifest({ manifestBytes: Buffer.from(JSON.stringify({ ...manifest, source_kind: 'wrong' })), readMember: (memberPath) => members.get(memberPath) }), /RULE_BASELINE_MANIFEST_INVALID/);
    assert.throws(() => verifyCanonicalBundledManifest({ manifestBytes, readMember: () => undefined }), /RULE_BASELINE_MEMBER_MISSING/);
    members.set('rules/pidex-implementer/baseline.md', Buffer.from('# Mutated\n'));
    assert.throws(() => verifyCanonicalBundledManifest({ manifestBytes, readMember: (memberPath) => members.get(memberPath) }), /RULE_BASELINE_MEMBER_DIGEST_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('PB-01/02 verifies exact packaged baseline without Git and rejects one-byte mutation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-baseline-'));
  try {
    const { file, manifest } = seed(root);
    const verified = verifyBundledBaseline({ root });
    assert.equal(verified.baseline_parent_commit, manifest.baseline_parent_commit);
    assert.deepEqual(verified.members.map((member) => member.path), ['rules/pidex-implementer/baseline.md']);
    writeFileSync(file, '# Mutated\n');
    assert.throws(() => verifyBundledBaseline({ root }), /RULE_BASELINE_MEMBER_DIGEST_INVALID/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
// ---- Slice3A CLI control seam: existing authenticated lifecycle-command boundary enforces the auth gate and bounded controls ----
test('Slice3A CLI control command enforces the authenticated command boundary, applies stop-local/refinement-handoff, and rejects unauthorized input without leak', () => {
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-control-cli-')); const scope = '3'.repeat(24); const ruleId = `project:${scope}:pidex-implementer:quality`; const repo = 'repo:control-cli'; const headCommit = 'd'.repeat(40);
  try {
    const bootstrap = openRuleLifecycleStore({ stateRoot });
    bootstrap.enroll({ repository: repo, scope_id: scope, remote: 'https://example.invalid/pidex', branch: 'refs/heads/main' });
    const head = { head_kind: 'current_project', repository_identity: repo, accepted_remote_head: headCommit, baseline_parent_commit: headCommit, manifest_digest: null, tree_digest: '9'.repeat(64), seeded_at: null, verified_at: '2026-08-22T12:00:00.000Z', remote_checked_at: '2026-08-22T12:00:00.000Z', freshness: 'exact_head' };
    const entry = { rule_id: ruleId, rule_version: '6'.repeat(64), content_hash: '6'.repeat(64), accepted_commit: headCommit, bytes: '# quality\n', tier: 'project', scope_id: scope, protection_class: 'none', source: 'managed_project', lifecycle_state: 'deactivated', created_at: '2026-08-22T12:00:00.000Z', source_head: headCommit, mirror_head: headCommit, mirror_digest: '6'.repeat(64), agent: 'pidex-implementer', applicability: null };
    bootstrap.replaceProjection({ repository: repo, scope_id: scope, accepted_head: headCommit, head, entries: [entry], event_kind: 'baseline_imported' });
    bootstrap.close();
    const run = (control, auth, request) => { const args = [process.execPath, 'scripts/quality/rule-lifecycle.mjs', 'control', '--state-root', stateRoot, '--control', control, '--auth', JSON.stringify(auth), '--request', JSON.stringify(request)]; const spawned = spawnSync(args[0], args.slice(1), { encoding: 'utf8' }); return { status: spawned.status, stdout: JSON.parse(spawned.stdout), stderr: spawned.stderr }; };
    const request = { repository: repo, scope_id: scope, rule_id: ruleId, actor: 'a'.repeat(64), nonce: 'b'.repeat(64) };
    const stopped = run('stop-local', { authenticated: true, authorized: true, csrf_valid: true }, request);
    assert.equal(stopped.status, 0, stopped.stderr); assert.equal(stopped.stdout.status, 'stopped_local');
    const store = openRuleLifecycleStore({ stateRoot }); assert.equal(store.readLocalRuleStop({ repository: repo, scope_id: scope, rule_id: ruleId }).reason_code, 'operator_stop'); store.close();
    const rejected = run('stop-local', { authenticated: true, authorized: false, csrf_valid: true }, request);
    assert.equal(rejected.status, 0); assert.deepEqual(rejected.stdout, { status: 'rejected', reason: 'operator_access_required' });
    const unknown = run('purge-forever', { authenticated: true, authorized: true, csrf_valid: true }, request);
    assert.equal(unknown.status, 0); assert.deepEqual(unknown.stdout, { status: 'rejected', reason: 'control_invalid' });
    const handoff = run('refinement-handoff', { authenticated: true, authorized: true, csrf_valid: true }, request);
    assert.equal(handoff.status, 0); assert.deepEqual(handoff.stdout.status, 'handoff'); assert.equal(handoff.stdout.handoff, 'refinement-requested');
    const incomplete = run('reactivate-monitor', { authenticated: true, authorized: true, csrf_valid: true }, request);
    assert.equal(incomplete.status, 0); assert.deepEqual(incomplete.stdout, { status: 'rejected', reason: 'input_incomplete' });    assert.doesNotMatch(JSON.stringify([stopped, rejected, unknown, handoff, incomplete]), /credential|secret|token|password|\/home\/|C:\\/i);
  } finally { rmSync(stateRoot, { recursive: true, force: true }); }
});
