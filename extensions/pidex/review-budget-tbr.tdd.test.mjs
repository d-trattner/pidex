#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { admitReviewDispatch, executeHostAgentBoundary, executeProjectPipelineReviewBoundary, normalizePublicReviewIdentity, runConfiguredProviderAttempts } from './index.ts';
import { foldReviewHistory, normalizeReviewVerdict, validateReviewIdentity } from './review-budget.ts';
import { closeReviewWithTbr, validateReviewOutcome, writeTbr } from '../../scripts/quality/tbr.mjs';
import { reserveReviewStart, reserveReviewStartAsync, recordReviewCompletion } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';
import { canonicalProjectIdentity } from '../../modules/pidex/analysis-metrics-history/lib/project-key.mjs';
import '../../scripts/quality/tbr.tdd.test.mjs';
import '../../scripts/quality/orchestrator-events.tdd.test.mjs';

const identity = { runFamilyId: 'family-038', planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-1' };
const extendedPlanIdentity = { ...identity, runFamilyId: 'family-16725', planId: 'plan-16725', attemptId: 'attempt-16725' };
assert.equal(validateReviewIdentity(extendedPlanIdentity).ok, true);
assert.equal(validateReviewIdentity({ ...extendedPlanIdentity, planId: `plan-${'1'.repeat(40)}` }).ok, true, '40-digit canonical plan is valid');
for (const planId of ['plan-', 'plan-alpha', 'plan-ABC', 'plan-1a', 'plan-1/2', 'plan-1 2', `plan-${'1'.repeat(41)}`]) assert.equal(validateReviewIdentity({ ...extendedPlanIdentity, planId }).ok, false, `${planId} must remain invalid`);
assert.deepEqual(normalizePublicReviewIdentity({ agent: 'pidex-code-reviewer', reviewIdentity: identity }), { agent: 'pidex-code-reviewer', ...identity });
assert.deepEqual(normalizePublicReviewIdentity({ agent: 'pidex-code-reviewer', reviewIdentity: extendedPlanIdentity }), { agent: 'pidex-code-reviewer', ...extendedPlanIdentity });
assert.deepEqual(normalizePublicReviewIdentity({ agent: 'pidex-planner' }), { agent: 'pidex-planner' });
assert.throws(() => normalizePublicReviewIdentity({ reviewIdentity: { planId: 'plan-038' } }), /REVIEW_IDENTITY_INVALID/);
assert.throws(() => normalizePublicReviewIdentity({ planId: 'plan-038', reviewIdentity: identity }), /REVIEW_IDENTITY_INVALID/);
const invalidCompletion = (overrides = {}) => ({ agent: 'pidex-planner', provider: 'pi', exitCode: 1, finalText: '', stderr: '', ...overrides });
for (const [label, result] of [['aborted', invalidCompletion({ aborted: true })], ['timedOut', invalidCompletion({ timedOut: true })]]) {
  const attempts = [];
  await runConfiguredProviderAttempts({ provider: 'pi', fallbackProvider: 'codex', reviewDispatch: true, retrySameProvider: true, fallbackEnabled: true }, async (provider, fallbackFrom) => { attempts.push([provider, fallbackFrom]); return result; });
  assert.deepEqual(attempts, [['pi', undefined]], `${label} review attempts provider once and never falls back`);
}
const preAborted = new AbortController();
preAborted.abort();
let preAbortedAttempts = 0;
await assert.rejects(() => runConfiguredProviderAttempts({ provider: 'pi', fallbackProvider: 'codex', reviewDispatch: true, signal: preAborted.signal, retrySameProvider: true, fallbackEnabled: true }, async () => { preAbortedAttempts += 1; return invalidCompletion(); }), /REVIEW_DISPATCH_ABORTED/);
assert.equal(preAbortedAttempts, 0, 'pre-aborted review attempts no provider');
const ordinaryAttempts = [];
await runConfiguredProviderAttempts({ provider: 'pi', fallbackProvider: 'codex', retrySameProvider: true, fallbackEnabled: true }, async (provider, fallbackFrom) => { ordinaryAttempts.push([provider, fallbackFrom]); return invalidCompletion({ provider }); });
assert.deepEqual(ordinaryAttempts, [['pi', undefined], ['pi', 'pi'], ['codex', 'pi']], 'ordinary invalid Pi completion retries Pi then configured fallback');
const eventBase = (stateDir, project) => path.join(stateDir, 'pipeline-events', canonicalProjectIdentity(project).projectKey);
const bindCurrent = (stateDir, project, pipelineId, planId = 'plan-038') => { const base = eventBase(stateDir, project); mkdirSync(base, { recursive: true }); writeFileSync(path.join(base, `${planId}.current`), pipelineId); writeFileSync(path.join(base, `${pipelineId}.jsonl`), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(project).canonicalProject, pipeline_id: pipelineId, plan_key: planId })}\n`, { flag: 'a' }); };
const structuredActiveFinding = { findingId: 'F-structured-active', relation: 'assigned', class: 'Product', reproductionState: 'reproduced', causedByCorrection: true, severity: 'High', disposition: 'active' };
const structuredTerminalActiveFinding = { ...structuredActiveFinding, title: 'Terminal assigned finding', shortDescription: 'Assigned finding needs archive proof before terminal close.', originEpic: 'initiative-059', reviewArtifact: 'agents.output/code-review/059.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'Terminal close preserves active finding evidence.', nextAnalysisOrDisconfirmingTest: 'Read terminal archive item.' };
const structuredImmediateFinding = { findingId: 'F-structured-immediate', relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate', title: 'Structured immediate finding', shortDescription: 'Deferred from current gate.', originEpic: 'initiative-059', reviewArtifact: 'agents.output/code-review/059.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.' };
const structuredPayload = (overrides = {}) => ({ schemaVersion: 'pidex-review-outcome-v1', verdict: 'REJECTED', contractDisposition: 'in_contract', findings: [structuredActiveFinding, structuredImmediateFinding], ...overrides });
const structuredFenced = (value) => `# review evidence\n\n\`\`\`pidex-review-outcome-v1\n${JSON.stringify(value)}\n\`\`\`\n`;
assert.equal(admitReviewDispatch('pidex-code-reviewer', identity, { status: 'allowed' }).allowed, true);
assert.deepEqual(admitReviewDispatch('pidex-code-reviewer', identity, { status: 'allowed' }), { allowed: true });
assert.equal(admitReviewDispatch('pidex-implementer', { ...identity, reviewMode: 'initial' }, { status: 'allowed' }).allowed, false);
assert.equal(admitReviewDispatch('pidex-code-reviewer', { ...identity, reviewMode: 'review1' }, { status: 'terminal' }).allowed, false);
assert.equal(admitReviewDispatch('pidex-planner', {}, { status: 'allowed' }).allowed, true);
assert.equal(admitReviewDispatch('pidex-planner', { ...identity, reviewMode: 'correction1' }, { status: 'allowed' }).allowed, false);
assert.equal(admitReviewDispatch('pidex-implementer', { ...identity, reviewMode: 'correction1' }, { status: 'allowed' }).allowed, true);

const hostState = mkdtempSync(path.join(os.tmpdir(), 'pidex-host-review-state-'));
const hostProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-host-review-project-'));
const hostContext = path.join(hostProject, 'agents.output', 'code-review', '038.md');
mkdirSync(path.dirname(hostContext), { recursive: true });
writeFileSync(hostContext, structuredFenced(structuredPayload()));
bindCurrent(hostState, hostProject, 'host-pipeline');
let hostChildren = 0;
const hostOptions = {
  agentCwd: hostProject,
  reviewLifecycle: { stateDir: hostState, pipelineId: 'host-pipeline' },
  loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
  resolveSandboxState: () => ({ enabled: false }),
  runConfigured: async (params) => { hostChildren += 1; params.onProcessStarted?.(); return { agent: params.agent, provider: 'pi', exitCode: 0, finalText: '<!-- ROUTING\nverdict: REJECTED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/038.md\n-->', stderr: '' }; },
};
try {
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'review' }, hostOptions), /REVIEW_IDENTITY_INVALID/);
  assert.equal(hostChildren, 0);
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-security', task: 'unsupported review', ...identity, reviewGate: 'security-review' }, hostOptions), /REVIEW_IDENTITY_INVALID/);
  assert.equal(hostChildren, 0, 'unsupported host gate must create zero children');
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'correction', reviewMode: 'correction1' }, hostOptions), /REVIEW_IDENTITY_INVALID/);
  assert.equal(hostChildren, 0);
  const hosted = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'review', ...identity }, hostOptions);
  assert.equal(hosted.exitCode, 0);
  assert.equal(hostChildren, 1);
  const hostRows = readFileSync(path.join(eventBase(hostState, hostProject), 'host-pipeline.jsonl'), 'utf8');
  assert.match(hostRows, /start_reserved/);
  assert.match(hostRows, /spawn_entered/);
  assert.match(hostRows, /spawn_accepted/);
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'duplicate', ...identity }, hostOptions), /REVIEW_HISTORY_INVALID/);
  assert.equal(hostChildren, 1, 'duplicate host delivery must create zero second child');
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'ordinary planning' }, hostOptions);
  assert.equal(hostChildren, 2, 'bare non-review calls remain compatible');
} finally { rmSync(hostState, { recursive: true, force: true }); rmSync(hostProject, { recursive: true, force: true }); }

const interruptedState = mkdtempSync(path.join(os.tmpdir(), 'pidex-interrupted-review-state-'));
const interruptedProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-interrupted-review-project-'));
try {
  const base = eventBase(interruptedState, interruptedProject);
  const context = path.join(interruptedProject, 'agents.output', 'code-review', '038.md');
  mkdirSync(base, { recursive: true });
  mkdirSync(path.dirname(context), { recursive: true });
  writeFileSync(context, structuredFenced(structuredPayload({ verdict: 'APPROVED', findings: [] })));
  const resetRoot = (pipelineId) => {
    for (const name of readdirSync(base)) if (name.endsWith('.jsonl')) rmSync(path.join(base, name));
    bindCurrent(interruptedState, interruptedProject, pipelineId);
  };
  const reviewResult = (overrides = {}) => ({ agent: 'pidex-code-reviewer', provider: 'pi', exitCode: 0, finalText: '<!-- ROUTING\nverdict: APPROVED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/038.md\n-->', stderr: '', ...overrides });
  for (const [label, result] of [['aborted', reviewResult({ exitCode: 1, finalText: '', aborted: true })], ['timedOut', reviewResult({ exitCode: 1, finalText: '', timedOut: true })]]) {
    resetRoot(`interrupted-${label}`);
    let providers = 0;
    let processStarts = 0;
    let trackedReviewDispatch;
    await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: `Plan 038 ${label}`, ...identity, runFamilyId: `family-${label}`, attemptId: `attempt-${label}` }, {
      agentCwd: interruptedProject,
      reviewLifecycle: { stateDir: interruptedState, pipelineId: `interrupted-${label}` },
      loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
      resolveSandboxState: () => ({ enabled: false }),
      runConfigured: async (params) => {
        providers += 1;
        trackedReviewDispatch = params.reviewDispatch;
        params.onProcessStarted?.();
        processStarts += 1;
        return result;
      },
    }), /REVIEW_CHILD_FAILED/);
    assert.equal(providers, 1, `${label} review starts one provider`);
    assert.equal(processStarts, 1, `${label} review signals one process start`);
    assert.equal(trackedReviewDispatch, true, `${label} review suppresses generic retry/fallback`);
  }

  resetRoot('interrupted-pre-aborted');
  const controller = new AbortController();
  controller.abort();
  let preAbortedProviders = 0;
  let preAbortedStarts = 0;
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 pre-aborted', ...identity, runFamilyId: 'family-pre-aborted', attemptId: 'attempt-pre-aborted' }, {
    agentCwd: interruptedProject,
    signal: controller.signal,
    reviewLifecycle: { stateDir: interruptedState, pipelineId: 'interrupted-pre-aborted' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => { preAbortedProviders += 1; params.onProcessStarted?.(); preAbortedStarts += 1; return reviewResult(); },
  }), /REVIEW_DISPATCH_ABORTED/);
  assert.equal(preAbortedProviders, 0, 'pre-aborted review launches zero providers');
  assert.equal(preAbortedStarts, 0, 'pre-aborted review signals zero process starts');

  resetRoot('interrupted-duplicate-acceptance');
  let duplicateProviders = 0;
  let duplicateStarts = 0;
  await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 duplicate acceptance', ...identity, runFamilyId: 'family-duplicate-acceptance', attemptId: 'attempt-duplicate-acceptance' }, {
    agentCwd: interruptedProject,
    reviewLifecycle: { stateDir: interruptedState, pipelineId: 'interrupted-duplicate-acceptance' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => {
      duplicateProviders += 1;
      params.onProcessStarted?.();
      duplicateStarts += 1;
      assert.throws(() => params.onProcessStarted?.(), /REVIEW_SPAWN_ACCEPTANCE_DUPLICATE/);
      return reviewResult();
    },
  });
  const duplicateRows = readFileSync(path.join(base, 'interrupted-duplicate-acceptance.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(duplicateProviders, 1, 'duplicate acceptance has one provider');
  assert.equal(duplicateStarts, 1, 'duplicate acceptance has one process start callback');
  assert.equal(duplicateRows.filter((row) => row.event_type === 'spawn_accepted').length, 1, 'duplicate acceptance appends one authority');

  let ordinaryProviders = 0;
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'ordinary non-review invalid completion' }, {
    agentCwd: interruptedProject,
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => { ordinaryProviders += 1; assert.equal(params.reviewDispatch, undefined, 'ordinary dispatch remains retry/fallback eligible'); return reviewResult({ agent: params.agent, exitCode: 1, finalText: '' }); },
  });
  assert.equal(ordinaryProviders, 1, 'ordinary non-review still delegates through configured retry/fallback runner');
} finally { rmSync(interruptedState, { recursive: true, force: true }); rmSync(interruptedProject, { recursive: true, force: true }); }

const lifecycleIoRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-io-error-'));
const lifecycleIoProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-io-project-'));
try {
  const invalidStateDir = path.join(lifecycleIoRoot, 'state-file');
  writeFileSync(invalidStateDir, 'not-a-directory');
  let ioFailureChildren = 0;
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 043 initial review' }, {
    agentCwd: lifecycleIoProject,
    reviewLifecycle: { stateDir: invalidStateDir, pipelineId: 'io-failure' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async () => { ioFailureChildren += 1; return reviewResult({ agent: 'pidex-code-reviewer' }); },
  }), /REVIEW_LIFECYCLE_UNAVAILABLE/);
  assert.equal(ioFailureChildren, 0, 'lifecycle I/O failure must fail closed before review child dispatch');
} finally {
  rmSync(lifecycleIoRoot, { recursive: true, force: true });
  rmSync(lifecycleIoProject, { recursive: true, force: true });
}

const extendedPlanState = mkdtempSync(path.join(os.tmpdir(), 'pidex-extended-plan-state-'));
const extendedPlanProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-extended-plan-project-'));
try {
  const pipelineId = 'family-16725';
  const contextFile = path.join(extendedPlanProject, 'agents.output', 'review', '16725.md');
  mkdirSync(path.dirname(contextFile), { recursive: true });
  writeFileSync(contextFile, structuredFenced(structuredPayload({ verdict: 'APPROVED', findings: [] })));
  bindCurrent(extendedPlanState, extendedPlanProject, pipelineId, 'plan-16725');
  let extendedPlanChildren = 0;
  const options = {
    agentCwd: extendedPlanProject,
    reviewLifecycle: { stateDir: extendedPlanState, pipelineId },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => {
      extendedPlanChildren += 1;
      params.onProcessStarted?.();
      return { agent: params.agent, provider: 'pi', exitCode: 0, finalText: '<!-- ROUTING\nverdict: APPROVED\nroute_to: pidex-pi\ncontext_file: agents.output/review/16725.md\n-->', stderr: '' };
    },
  };
  await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 16725 explicit review', ...extendedPlanIdentity }, options);
  await executeHostAgentBoundary({ agent: 'pidex-critic', task: 'Plan 16725 derived review' }, options);
  assert.equal(extendedPlanChildren, 2, 'explicit and derived plan-16725 identities must both reach child dispatch');
} finally {
  rmSync(extendedPlanState, { recursive: true, force: true });
  rmSync(extendedPlanProject, { recursive: true, force: true });
}

const lifecycleState = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-state-'));
const lifecycleProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-lifecycle-project-'));
const lifecycleBase = eventBase(lifecycleState, lifecycleProject);
const lifecyclePipeline = 'family-real-host';
const lifecycleContext = path.join(lifecycleProject, 'agents.output', 'implementation', '038-real-host-review-lifecycle.md');
const lifecycleAttempt = (family, gate, mode) => `attempt-${createHash('sha256').update(`${family}|${gate}|${mode}`).digest('hex').slice(0, 16)}`;
let lifecycleChildren = 0;
try {
  mkdirSync(lifecycleBase, { recursive: true });
  mkdirSync(path.dirname(lifecycleContext), { recursive: true });
  bindCurrent(lifecycleState, lifecycleProject, lifecyclePipeline);
  writeFileSync(lifecycleContext, structuredFenced(structuredPayload()));
  const lifecycleOptions = {
    agentCwd: lifecycleProject,
    reviewLifecycle: { stateDir: lifecycleState, pipelineId: 'ignored-for-derived-identity' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => {
      lifecycleChildren += 1;
      params.onProcessStarted?.();
      const verdict = params.agent === 'pidex-implementer' ? 'COMPLETE' : lifecycleChildren === 1 ? 'REJECTED' : 'APPROVED';
      const route = params.agent === 'pidex-implementer' ? 'pidex-code-reviewer' : 'pidex-implementer';
      return { agent: params.agent, provider: 'pi', exitCode: 0, finalText: `<!-- ROUTING\nverdict: ${verdict}\nroute_to: ${route}\ncontext_file: agents.output/implementation/038-real-host-review-lifecycle.md\n-->`, stderr: '' };
    },
  };
  const initial = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 initial review' }, lifecycleOptions);
  assert.match(initial.finalText, /REJECTED/);
  const correction = await executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'Plan 038 correction' }, lifecycleOptions);
  assert.match(correction.finalText, /COMPLETE/);
  writeFileSync(lifecycleContext, structuredFenced(structuredPayload({ verdict: 'APPROVED', findings: [] })));
  const review1 = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 review1' }, lifecycleOptions);
  assert.match(review1.finalText, /APPROVED/);
  assert.equal(lifecycleChildren, 3, 'omitted tuples must derive one normal rejection/correction/review chain');
  const lifecycleRows = readFileSync(path.join(lifecycleBase, `${lifecyclePipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.planId === 'plan-038');
  // Plan 059 Slice 2 (AD-1): uniform fixed-position completion_prepared receipt for
  // every new lifecycle completion — after spawn_accepted, before spawn_returned.
  const s2Completion = ['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome'];
  assert.deepEqual(lifecycleRows.map((row) => row.event_type), [...s2Completion, ...s2Completion, ...s2Completion]);
  assert.deepEqual(lifecycleRows.filter((row) => row.event_type === 'review_outcome').map((row) => row.metadata.outcome), ['CHANGES_REQUESTED', 'READY_FOR_REVIEW', 'APPROVED']);
  const rowsBeforeRejects = lifecycleRows.length;
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 partial', planId: 'plan-038' }, lifecycleOptions), /REVIEW_IDENTITY_INVALID/);
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 wrong owner' }, lifecycleOptions), /REVIEW_IDENTITY_INVALID/);
  assert.equal(readFileSync(path.join(lifecycleBase, `${lifecyclePipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.planId === 'plan-038').length, rowsBeforeRejects, 'partial and unmatched identity must append nothing');

  rmSync(path.join(lifecycleBase, `${lifecyclePipeline}.jsonl`));
  const resumePipeline = 'family-resume-host';
  bindCurrent(lifecycleState, lifecycleProject, resumePipeline);
  const resumeIdentity = { runFamilyId: resumePipeline, planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: lifecycleAttempt(resumePipeline, 'code-review', 'initial') };
  assert.equal(reserveReviewStart({ stateDir: lifecycleState, project: lifecycleProject, pipelineId: resumePipeline, identity: resumeIdentity, start: () => 'first-child' }).status, 'accepted');
  const childrenBeforeResume = lifecycleChildren;
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 resumed review' }, lifecycleOptions), /REVIEW_DISPATCH_RESUMED/);
  assert.equal(lifecycleChildren, childrenBeforeResume, 'accepted retry must not run a duplicate child');
  rmSync(path.join(lifecycleBase, `${resumePipeline}.jsonl`));
  const returnedIdentity = { ...resumeIdentity, runFamilyId: 'family-returned-host', attemptId: lifecycleAttempt('family-returned-host', 'code-review', 'initial') };
  bindCurrent(lifecycleState, lifecycleProject, returnedIdentity.runFamilyId);
  assert.equal(reserveReviewStart({ stateDir: lifecycleState, project: lifecycleProject, pipelineId: returnedIdentity.runFamilyId, identity: returnedIdentity, start: () => 'returned-child' }).status, 'accepted');
  writeFileSync(path.join(lifecycleBase, `${returnedIdentity.runFamilyId}.jsonl`), `${JSON.stringify({ event_type: 'spawn_returned', metadata: returnedIdentity })}\n`, { flag: 'a' });
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 returned-only review' }, lifecycleOptions), /SPAWN_RETURNED_UNCERTAIN/);
  assert.equal(lifecycleChildren, childrenBeforeResume, 'returned-only retry must not run a child');
} finally { rmSync(lifecycleState, { recursive: true, force: true }); rmSync(lifecycleProject, { recursive: true, force: true }); }

const immediateFinding = { findingId: 'F-2', relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate', title: 'Deferred finding', shortDescription: 'New finding deferred.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot reject.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.' };
const rejected = validateReviewOutcome({ verdict: 'REJECTED', findings: [
  { findingId: 'F-1', relation: 'assigned', class: 'Product', reproductionState: 'reproduced', causedByCorrection: true, severity: 'High', disposition: 'active' },
  immediateFinding,
] }, identity.reviewGate);
assert.equal(rejected.ok, true);
assert.deepEqual(rejected.value.active.map((item) => item.findingId), ['F-1']);
assert.deepEqual(rejected.value.immediateTbr.map((item) => item.findingId), ['F-2']);
assert.equal(validateReviewOutcome({ verdict: 'REJECTED', findings: [{ findingId: 'F-3', relation: 'fix_induced', class: 'SharedContract', reproductionState: 'reproduced', causedByCorrection: true, severity: 'Critical', disposition: 'active' }] }, identity.reviewGate).value.active.length, 1);
assert.equal(validateReviewOutcome({ verdict: 'REJECTED', findings: [{ ...immediateFinding, findingId: 'F-4', relation: 'fix_induced', causedByCorrection: true, severity: 'Critical', reproductionState: 'not_reproduced' }] }, identity.reviewGate).ok, false);

const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-'));
try {
  const first = writeTbr({ root, identity, findings: rejected.value.immediateTbr });
  assert.equal(first.ok, true);
  const duplicate = writeTbr({ root, identity, findings: rejected.value.immediateTbr });
  assert.equal(duplicate.created, false);
  const secondFinding = { ...rejected.value.immediateTbr[0], findingId: 'F-3', title: 'Second finding' };
  assert.equal(writeTbr({ root, identity, findings: [secondFinding] }).ok, true);
  // Plan 059 Slice 2 (AD-4/R1): full canonical byte dedup — same stable ID with
  // different canonical bytes fails closed with TBR_COLLISION instead of silently
  // keeping the first copy (old 5-field identity-subset behavior).
  assert.deepEqual(writeTbr({ root, identity, findings: [{ ...rejected.value.immediateTbr[0], title: 'Renamed finding' }] }), { ok: false, code: 'TBR_COLLISION' });
  const itemFiles = readdirSync(path.join(root, 'wiki/tbr/items')).sort();
  assert.equal(itemFiles.length, 2, 'byte-colliding retry preserves the original item set');
  const index = readFileSync(path.join(root, 'wiki/tbr/index.md'), 'utf8');
  assert.match(index, /Deferred finding/);
  assert.match(index, /Second finding/);
  assert.ok(index.indexOf('Second finding') < index.indexOf('Deferred finding') || index.indexOf('Deferred finding') < index.indexOf('Second finding'));
  assert.match(index, /TBR-/);
  const eventsRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-events-'));
  const project = mkdtempSync(path.join(os.tmpdir(), 'pidex-review-project-'));
  const pipelineId = 'pipeline-038';
  bindCurrent(eventsRoot, project, pipelineId);
  try {
    for (const [reviewMode, outcome] of [['initial', 'CHANGES_REQUESTED'], ['correction1', 'READY_FOR_REVIEW'], ['review1', 'CHANGES_REQUESTED'], ['correction2', 'SUBMITTED']] ) {
      const current = { ...identity, reviewMode, attemptId: `attempt-${reviewMode}` };
      assert.equal(reserveReviewStart({ stateDir: eventsRoot, project, pipelineId, identity: current, start: () => 'started' }).status, 'accepted');
      assert.notEqual(recordReviewCompletion({ stateDir: eventsRoot, project, pipelineId, identity: current, outcome }).status, 'denied');
    }
    const review2 = { ...identity, reviewMode: 'review2', attemptId: 'attempt-review2' };
    assert.equal(reserveReviewStart({ stateDir: eventsRoot, project, pipelineId, identity: review2, start: () => 'started' }).status, 'accepted');
    // CR-038-05: terminal active findings carry canonical archive evidence before close.
    const terminalActive = { ...rejected.value.active[0], title: 'Terminal assigned finding', shortDescription: 'Assigned finding needs archive proof before terminal close.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'Terminal close preserves active finding evidence.', nextAnalysisOrDisconfirmingTest: 'Read terminal archive item.' };
    const closed = closeReviewWithTbr({ root, identity: review2, outcome: { verdict: 'REJECTED', findings: [terminalActive] }, write: writeTbr, complete: (outcome) => recordReviewCompletion({ stateDir: eventsRoot, project, pipelineId, identity: review2, outcome }) });
    assert.equal(closed.status, 'CLOSED_WITH_TBR');
    assert.match(readdirSync(path.join(root, 'wiki/tbr/items')).map((name) => readFileSync(path.join(root, 'wiki/tbr/items', name), 'utf8')).join(''), /^sourceFindingId: F-1$/m);
  } finally { rmSync(eventsRoot, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
  const failed = closeReviewWithTbr({ root, identity, outcome: { verdict: 'REJECTED', findings: rejected.value.active }, write: () => ({ ok: false }) });
  assert.deepEqual(failed, { status: 'TBR_WRITE_BLOCKED' });
  // CR-038-01: approved outcomes must pass exact future schema before acceptance.
  assert.deepEqual(closeReviewWithTbr({ root, identity, outcome: { verdict: 'APPROVED', findings: [{ id: 'F-prose', relation: 'new', class: 'Product', reproduced: true, causal: true, severity: 'Critical' }] }, write: writeTbr }), { status: 'TBR_WRITE_BLOCKED' });
} finally { rmSync(root, { recursive: true, force: true }); }

const gateVerdicts = {
  critic: { accepted: ['APPROVED', 'APPROVED_WITH_COMMENTS'], rejected: ['REJECTED'] },
  'code-review': { accepted: ['APPROVED', 'APPROVED_WITH_COMMENTS'], rejected: ['REJECTED'] },
  security: { accepted: ['APPROVED'], rejected: ['APPROVED_WITH_CONTROLS', 'REJECTED'] },
  qa: { accepted: ['COMPLETE'], rejected: ['FAILED'] },
};
for (const [gate, verdicts] of Object.entries(gateVerdicts)) {
  for (const verdict of verdicts.accepted) {
    assert.equal(normalizeReviewVerdict(gate, verdict), 'APPROVED');
    assert.equal(validateReviewOutcome({ verdict, findings: [] }, gate).ok, true);
  }
  for (const verdict of verdicts.rejected) {
    assert.equal(normalizeReviewVerdict(gate, verdict), 'CHANGES_REQUESTED');
    assert.equal(validateReviewOutcome({ verdict, findings: [{ findingId: 'F-gate', relation: 'assigned', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'active' }] }, gate).value.verdict, 'CHANGES_REQUESTED');
  }
  for (const otherGate of Object.keys(gateVerdicts)) for (const verdict of [...gateVerdicts[otherGate].accepted, ...gateVerdicts[otherGate].rejected]) {
    if (![...verdicts.accepted, ...verdicts.rejected].includes(verdict)) assert.equal(normalizeReviewVerdict(gate, verdict), null);
  }
  assert.equal(normalizeReviewVerdict(gate, 'APPROVED '), null);
}

const historyRow = (event_type, metadata) => ({ event_type, metadata });
const completedGateMode = (reviewGate, reviewMode, attemptId, outcome) => [
  ...['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned'].map((event_type) => historyRow(event_type, { ...identity, reviewGate, reviewMode, attemptId })),
  historyRow('review_outcome', { ...identity, reviewGate, reviewMode, attemptId, outcome }),
];
const approvedCriticChain = [
  ...completedGateMode('critic', 'initial', 'critic-initial', 'CHANGES_REQUESTED'),
  ...completedGateMode('critic', 'correction1', 'critic-correction1', 'READY_FOR_REVIEW'),
  ...completedGateMode('critic', 'review1', 'critic-review1', 'APPROVED'),
];
assert.deepEqual(foldReviewHistory(approvedCriticChain, identity), { status: 'allowed', nextMode: 'initial' }, 'Critic approval must not consume Code Review initial');
assert.deepEqual(foldReviewHistory([...approvedCriticChain, historyRow('not-an-event', { ...identity })], identity), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' });

const ppState = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-review-state-'));
const ppProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-review-project-'));
let ppChildren = 0;
const ppLifecycle = { stateDir: ppState, pipelineId: 'pp-pipeline', project: ppProject };
const ppContext = path.join(ppProject, 'agents.output', 'code-review', '038.md');
mkdirSync(path.dirname(ppContext), { recursive: true });
// Plan 059 Slice 3 (req 1): Project Pipeline primary reviews now complete through the
// canonical structured boundary — the exact assigned artifact must carry the
// pidex-review-outcome-v1 payload (parity with host-direct).
writeFileSync(ppContext, structuredFenced(structuredPayload()));
bindCurrent(ppState, ppProject, 'pp-pipeline');
const ppChild = () => ({ exitCode: 0, finalText: '<!-- ROUTING\nverdict: REJECTED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/038.md\n-->' });
try {
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer' }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), /REVIEW_IDENTITY_INVALID/);
  assert.equal(ppChildren, 0);
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-security', ...identity, reviewGate: 'security-review' }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), /REVIEW_IDENTITY_INVALID/);
  assert.equal(ppChildren, 0, 'unsupported Project Pipeline gate must create zero children');
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-implementer', ...identity }, ppLifecycle, () => { ppChildren += 1; return 'child'; }), /REVIEW_DISPATCH_DENIED/);
  assert.equal(ppChildren, 0);
  assert.match(executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer', ...identity }, ppLifecycle, () => { ppChildren += 1; return ppChild(); }).finalText, /REJECTED/);
  assert.equal(ppChildren, 1);
  assert.throws(() => executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer', ...identity }, ppLifecycle, () => { ppChildren += 1; return ppChild(); }), /REVIEW_HISTORY_INVALID/);
  assert.equal(ppChildren, 1, 'duplicate Project Pipeline delivery must create zero second child');
} finally { rmSync(ppState, { recursive: true, force: true }); rmSync(ppProject, { recursive: true, force: true }); }

const ppCompletionState = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-completion-state-'));
const ppCompletionProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-completion-project-'));
const ppCompletionPipeline = 'family-pp-completion';
try {
  const ppCompletionBase = eventBase(ppCompletionState, ppCompletionProject);
  const ppCompletionContext = path.join(ppCompletionProject, 'agents.output', 'code-review', '038.md');
  mkdirSync(path.dirname(ppCompletionContext), { recursive: true });
  mkdirSync(ppCompletionBase, { recursive: true });
  bindCurrent(ppCompletionState, ppCompletionProject, ppCompletionPipeline);
  // Plan 059 Slice 3 (req 1): PP primary reviews complete through the canonical
  // structured boundary; the assigned artifact carries the structured payload
  // (clean approval: no active findings) and the ROUTING verdict agrees.
  writeFileSync(ppCompletionContext, structuredFenced(structuredPayload({ verdict: 'APPROVED', findings: [] })));
  const ppResult = executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 direct review' }, { stateDir: ppCompletionState, pipelineId: 'ignored-for-derived-identity', project: ppCompletionProject, projectId: 'pp-unchanged', resolveCurrentProject: () => ppCompletionProject }, () => ({ exitCode: 0, finalText: '<!-- ROUTING\nverdict: APPROVED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/038.md\n-->' }));
  assert.match(ppResult.finalText, /APPROVED/);
  const ppRows = readFileSync(path.join(ppCompletionBase, `${ppCompletionPipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.planId === 'plan-038');
  // Plan 059 Slice 2 (AD-1): uniform completion_prepared receipt for every new
  // lifecycle completion, including the Project Pipeline legacy ROUTING path.
  assert.deepEqual(ppRows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome']);
} finally { rmSync(ppCompletionState, { recursive: true, force: true }); rmSync(ppCompletionProject, { recursive: true, force: true }); }

for (const explicitIdentity of [false, true]) {
  const changedState = mkdtempSync(path.join(os.tmpdir(), `pidex-pp-authority-${explicitIdentity ? 'explicit' : 'omitted'}-state-`));
  const reservedProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-authority-reserved-'));
  const replacementProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-authority-replacement-'));
  const changedPipeline = `family-pp-authority-${explicitIdentity ? 'explicit' : 'omitted'}`;
  let currentProject = reservedProject;
  try {
    const base = eventBase(changedState, reservedProject);
    mkdirSync(base, { recursive: true });
    mkdirSync(path.join(reservedProject, 'agents.output', 'code-review'), { recursive: true });
    writeFileSync(path.join(reservedProject, 'agents.output', 'code-review', '038.md'), '# review\n');
    bindCurrent(changedState, reservedProject, changedPipeline);
    const params = explicitIdentity
      ? { agent: 'pidex-code-reviewer', ...identity }
      : { agent: 'pidex-code-reviewer', task: 'Plan 038 direct review' };
    assert.throws(() => executeProjectPipelineReviewBoundary(params, {
      stateDir: changedState,
      pipelineId: explicitIdentity ? changedPipeline : 'ignored-for-derived-identity',
      project: reservedProject,
      projectId: `pp-authority-${explicitIdentity ? 'explicit' : 'omitted'}`,
      resolveCurrentProject: () => currentProject,
    }, () => {
      currentProject = replacementProject;
      return ppChild();
    }), /REVIEW_PROJECT_AUTHORITY_CHANGED/);
    const rows = readFileSync(path.join(base, `${changedPipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.planId === 'plan-038');
    assert.deepEqual(rows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted'], `${explicitIdentity ? 'explicit' : 'omitted'} A→B completion must append no completion events`);
    assert.equal(rows.some((row) => row.event_type === 'review_outcome'), false);
  } finally {
    rmSync(changedState, { recursive: true, force: true });
    rmSync(reservedProject, { recursive: true, force: true });
    rmSync(replacementProject, { recursive: true, force: true });
  }
}

const correctionOwnerState = mkdtempSync(path.join(os.tmpdir(), 'pidex-correction-owner-state-'));
const correctionOwnerProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-correction-owner-project-'));
let correctionOwnerChildren = 0;
try {
  const base = eventBase(correctionOwnerState, correctionOwnerProject);
  mkdirSync(base, { recursive: true });
  const options = {
    agentCwd: correctionOwnerProject,
    reviewLifecycle: { stateDir: correctionOwnerState, pipelineId: 'ignored' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => {
      correctionOwnerChildren += 1;
      params.onProcessStarted?.();
      return params.agent === 'pidex-planner'
        ? { agent: params.agent, provider: 'pi', exitCode: 0, finalText: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-critic\ncontext_file: agents.output/planning/038.md\n-->', stderr: '' }
        : { agent: params.agent, provider: 'pi', exitCode: 0, finalText: 'ordinary result', stderr: '' };
    },
  };
  const eventsRoot = path.join(correctionOwnerState, 'pipeline-events');
  const foreignProject = path.join(correctionOwnerProject, 'foreign-project');
  mkdirSync(foreignProject);
  const foreignBase = path.join(eventsRoot, 'legacy-foreign-root');
  mkdirSync(foreignBase);
  writeFileSync(path.join(foreignBase, 'plan-12345.current'), 'foreign-pipeline');
  writeFileSync(path.join(foreignBase, 'foreign-pipeline.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(foreignProject).canonicalProject, pipeline_id: 'foreign-pipeline', plan_key: 'plan-12345' })}\n`);
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 12345 ordinary planning with valid foreign legacy authority' }, options);
  await executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'Plan 12345 ordinary implementation with valid foreign legacy authority' }, options);
  assert.equal(correctionOwnerChildren, 2, 'well-formed foreign legacy authority must be ignored for identity-free primary dispatch');
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 12345 reviewer without authority' }, options), /REVIEW_IDENTITY_INVALID/);
  assert.equal(correctionOwnerChildren, 2, 'reviewer authority absence must fail closed with zero children');

  for (const [plan, project_path] of [['12346', undefined], ['12347', 42], ['12348', path.join(correctionOwnerProject, 'missing-project')]]) {
    const malformedBase = path.join(eventsRoot, `legacy-malformed-root-${plan}`);
    const malformedPipeline = `malformed-pipeline-${plan}`;
    mkdirSync(malformedBase);
    writeFileSync(path.join(malformedBase, `plan-${plan}.current`), malformedPipeline);
    writeFileSync(path.join(malformedBase, `${malformedPipeline}.jsonl`), `${JSON.stringify({ event_type: 'pipeline_started', ...(project_path === undefined ? {} : { project_path }), pipeline_id: malformedPipeline, plan_key: `plan-${plan}` })}\n`);
    await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-planner', task: `Plan ${plan} malformed legacy root must fail closed` }, options), /REVIEW_IDENTITY_INVALID/);
    assert.equal(correctionOwnerChildren, 2, `malformed legacy project_path for Plan ${plan} must create zero ordinary children`);
  }

  for (const [plan, malformedPointer] of [['12349', (current) => mkdirSync(current)], ['12350', (current) => symlinkSync(path.join(correctionOwnerProject, 'missing-pointer-target'), current, 'file')]]) {
    const malformedBase = path.join(eventsRoot, `legacy-malformed-pointer-${plan}`);
    mkdirSync(malformedBase);
    malformedPointer(path.join(malformedBase, `plan-${plan}.current`));
    for (const agent of ['pidex-planner', 'pidex-implementer']) {
      await assert.rejects(() => executeHostAgentBoundary({ agent, task: `Plan ${plan} malformed current pointer must fail closed` }, options), /REVIEW_IDENTITY_INVALID/);
      assert.equal(correctionOwnerChildren, 2, `${agent} must create zero children for malformed current pointer`);
    }
  }

  for (const [plan, fault] of [['12351', 'lstatSync'], ['12352', 'readFileSync']]) {
    const current = path.join(base, `plan-${plan}.current`);
    writeFileSync(current, 'unreadable-pipeline');
    for (const agent of ['pidex-planner', 'pidex-implementer']) {
      const source = `import { createRequire, syncBuiltinESMExports } from 'node:module'; const [indexUrl, current, agent, project, stateDir, fault] = process.argv.slice(1); const require = createRequire(import.meta.url); const fs = require('node:fs'); const original = fs[fault]; fs[fault] = (candidate, ...args) => { if (candidate === current) { const error = new Error('injected pointer ${fault} fault'); error.code = 'EIO'; throw error; } return original(candidate, ...args); }; syncBuiltinESMExports(); const { executeHostAgentBoundary } = await import(indexUrl); let children = 0; try { await executeHostAgentBoundary({ agent, task: 'Plan ${plan} pointer fault' }, { agentCwd: project, reviewLifecycle: { stateDir, pipelineId: 'ignored' }, loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }), resolveSandboxState: () => ({ enabled: false }), runConfigured: async () => { children += 1; return { agent, provider: 'pi', exitCode: 0, finalText: 'ordinary result', stderr: '' }; } }); console.log(JSON.stringify({ children })); } catch (error) { console.log(JSON.stringify({ code: error.message, children })); }`;
      const probe = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', source, new URL('./index.ts', import.meta.url).href, current, agent, correctionOwnerProject, correctionOwnerState, fault], { encoding: 'utf8' });
      assert.equal(probe.status, 0, probe.stderr || probe.stdout);
      assert.deepEqual(JSON.parse(probe.stdout.trim()), { code: 'REVIEW_HISTORY_UNAVAILABLE', children: 0 }, `${agent} ${fault} current-pointer fault must fail closed as unavailable`);
    }
    rmSync(current);
  }

  bindCurrent(correctionOwnerState, correctionOwnerProject, 'family-owner');
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 038 ordinary planning' }, options);
  await executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'Plan 038 ordinary implementation' }, options);
  assert.equal(correctionOwnerChildren, 4, 'zero-pending correction owners must remain ordinary calls');

  mkdirSync(path.join(correctionOwnerProject, 'agents.output', 'planning'), { recursive: true });
  writeFileSync(path.join(correctionOwnerProject, 'agents.output', 'planning', '038.md'), '# planner context\n');
  const start = (gate) => reserveReviewStart({ stateDir: correctionOwnerState, project: correctionOwnerProject, pipelineId: 'family-owner', identity: { runFamilyId: 'family-owner', planId: 'plan-038', reviewGate: gate, reviewMode: 'initial', attemptId: lifecycleAttempt('family-owner', gate, 'initial') }, start: () => 'seed' });
  const critic = { runFamilyId: 'family-owner', planId: 'plan-038', reviewGate: 'critic', reviewMode: 'initial', attemptId: lifecycleAttempt('family-owner', 'critic', 'initial') };
  assert.equal(start('critic').status, 'accepted');
  assert.equal(recordReviewCompletion({ stateDir: correctionOwnerState, project: correctionOwnerProject, pipelineId: 'family-owner', identity: critic, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 038 tracked correction' }, options);
  assert.equal(correctionOwnerChildren, 5, 'one pending planner correction must remain lifecycle tracked');
  for (const gate of ['code-review', 'security']) {
    const current = { runFamilyId: 'family-owner', planId: 'plan-038', reviewGate: gate, reviewMode: 'initial', attemptId: lifecycleAttempt('family-owner', gate, 'initial') };
    assert.equal(start(gate).status, 'accepted');
    assert.equal(recordReviewCompletion({ stateDir: correctionOwnerState, project: correctionOwnerProject, pipelineId: 'family-owner', identity: current, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  }
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'Plan 038 ambiguous correction' }, options), /REVIEW_IDENTITY_INVALID/);
  assert.equal(correctionOwnerChildren, 5, 'multiple pending corrections must create zero children');
} finally { rmSync(correctionOwnerState, { recursive: true, force: true }); rmSync(correctionOwnerProject, { recursive: true, force: true }); }

const slugState = mkdtempSync(path.join(os.tmpdir(), 'pidex-slug-state-'));
const slugRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-slug-root-'));
const slugProject = path.join(slugRoot, 'Project With Space!');
try {
  mkdirSync(slugProject);
  const base = path.join(slugState, 'pipeline-events', 'Project-With-Space');
  const context = path.join(slugProject, 'agents.output', 'code-review', '038.md');
  mkdirSync(path.dirname(context), { recursive: true });
  mkdirSync(base, { recursive: true });
  writeFileSync(path.join(base, 'plan-038.current'), 'family-slug');
  writeFileSync(path.join(base, 'family-slug.jsonl'), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(slugProject).canonicalProject, pipeline_id: 'family-slug', plan_key: 'plan-038' })}\n`);
  writeFileSync(context, structuredFenced(structuredPayload({ verdict: 'APPROVED', findings: [] })));
  const result = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 review' }, {
    agentCwd: slugProject,
    reviewLifecycle: { stateDir: slugState, pipelineId: 'ignored' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => { params.onProcessStarted?.(); return { agent: 'pidex-code-reviewer', provider: 'pi', exitCode: 0, finalText: '<!-- ROUTING\nverdict: APPROVED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/038.md\n-->', stderr: '' }; },
  });
  assert.match(result.finalText, /APPROVED/);
} finally { rmSync(slugState, { recursive: true, force: true }); rmSync(slugRoot, { recursive: true, force: true }); }

const artifactState = mkdtempSync(path.join(os.tmpdir(), 'pidex-artifact-state-'));
const artifactProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-artifact-project-'));
const foreignContext = path.join(mkdtempSync(path.join(os.tmpdir(), 'pidex-foreign-context-')), 'review.md');
writeFileSync(foreignContext, '# foreign\n');
bindCurrent(artifactState, artifactProject, 'artifact-pipeline');
try {
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', ...identity }, {
    agentCwd: artifactProject,
    reviewLifecycle: { stateDir: artifactState, pipelineId: 'artifact-pipeline' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => { params.onProcessStarted?.(); return { agent: 'pidex-code-reviewer', provider: 'pi', exitCode: 0, finalText: `<!-- ROUTING\nverdict: APPROVED\nroute_to: pidex-implementer\ncontext_file: ${foreignContext}\n-->`, stderr: '' }; },
  }), /REVIEW_ROUTING_INVALID/);
} finally { rmSync(artifactState, { recursive: true, force: true }); rmSync(artifactProject, { recursive: true, force: true }); rmSync(path.dirname(foreignContext), { recursive: true, force: true }); }

const symlinkArtifactState = mkdtempSync(path.join(os.tmpdir(), 'pidex-symlink-artifact-state-'));
const symlinkArtifactProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-symlink-artifact-project-'));
const symlinkArtifactForeign = mkdtempSync(path.join(os.tmpdir(), 'pidex-symlink-artifact-foreign-'));
try {
  writeFileSync(path.join(symlinkArtifactForeign, 'review.md'), '# foreign\n');
  mkdirSync(path.join(symlinkArtifactProject, 'agents.output'), { recursive: true });
  symlinkSync(symlinkArtifactForeign, path.join(symlinkArtifactProject, 'agents.output', 'link'), 'dir');
  bindCurrent(symlinkArtifactState, symlinkArtifactProject, 'symlink-artifact');
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', ...identity }, {
    agentCwd: symlinkArtifactProject,
    reviewLifecycle: { stateDir: symlinkArtifactState, pipelineId: 'symlink-artifact' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => { params.onProcessStarted?.(); return { agent: params.agent, provider: 'pi', exitCode: 0, finalText: '<!-- ROUTING\nverdict: APPROVED\nroute_to: pidex-implementer\ncontext_file: agents.output/link/review.md\n-->', stderr: '' }; },
  }), /REVIEW_ROUTING_INVALID/);
} finally { rmSync(symlinkArtifactState, { recursive: true, force: true }); rmSync(symlinkArtifactProject, { recursive: true, force: true }); rmSync(symlinkArtifactForeign, { recursive: true, force: true }); }

const directArtifactState = mkdtempSync(path.join(os.tmpdir(), 'pidex-direct-artifact-state-'));
const directArtifactProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-direct-artifact-project-'));
const directExpected = 'agents.output/code-review/038.md';
const directProjectId = 'pp-direct-artifact';
const directArchive = path.join(directArtifactState, 'project-archives', directProjectId, directExpected);
const directResult = (overrides = {}) => ({ exitCode: 0, archive_sync_status: 'complete', context_file: directExpected, archive_context_file: directArchive, routing: { verdict: 'APPROVED', route_to: 'pidex-implementer', context_file: directExpected }, ...overrides });
const directParams = { agent: 'pidex-code-reviewer', ...identity, projectId: directProjectId, expectedOutputPath: directExpected };
const resetDirectRoot = (pipelineId) => { const base = eventBase(directArtifactState, directArtifactProject); mkdirSync(base, { recursive: true }); for (const name of readdirSync(base)) if (name.endsWith('.jsonl')) rmSync(path.join(base, name)); bindCurrent(directArtifactState, directArtifactProject, pipelineId); };
try {
  mkdirSync(path.dirname(directArchive), { recursive: true });
  writeFileSync(directArchive, '# archive\n');
  // Plan 059 Slice 3 (req 1): the direct PP boundary reads the exact assigned
  // artifact from the canonical project root (the archive-mount in the direct
  // flow) through the structured completion boundary — the artifact must carry
  // the pidex-review-outcome-v1 payload. The archive_context_file path check
  // (isDirectReviewContext) remains the authority for the reported archive path.
  const directProjectContext = path.join(directArtifactProject, directExpected);
  mkdirSync(path.dirname(directProjectContext), { recursive: true });
  writeFileSync(directProjectContext, structuredFenced(structuredPayload({ verdict: 'APPROVED', findings: [] })));
  resetDirectRoot('direct-artifact');
  const result = executeProjectPipelineReviewBoundary(directParams, { stateDir: directArtifactState, pipelineId: 'direct-artifact', project: directArtifactProject }, () => directResult());
  assert.equal(result.context_file, directExpected, 'direct reviewer accepts only exact canonical archived context');

  const foreignArchive = path.join(directArtifactProject, 'foreign.md');
  writeFileSync(foreignArchive, '# foreign\n');
  resetDirectRoot('direct-foreign');
  assert.throws(() => executeProjectPipelineReviewBoundary(directParams, { stateDir: directArtifactState, pipelineId: 'direct-foreign', project: directArtifactProject }, () => directResult({ archive_context_file: foreignArchive })), /REVIEW_ROUTING_INVALID/);

  const archiveForeign = path.join(directArtifactProject, 'archive-foreign.md');
  writeFileSync(archiveForeign, '# archive foreign\n');
  rmSync(directArchive);
  symlinkSync(archiveForeign, directArchive, 'file');
  resetDirectRoot('direct-symlink');
  assert.throws(() => executeProjectPipelineReviewBoundary(directParams, { stateDir: directArtifactState, pipelineId: 'direct-symlink', project: directArtifactProject }, () => directResult()), /REVIEW_ROUTING_INVALID/);
  rmSync(directArchive);
  writeFileSync(directArchive, '# archive\n');

  resetDirectRoot('direct-returned-mismatch');
  assert.throws(() => executeProjectPipelineReviewBoundary(directParams, { stateDir: directArtifactState, pipelineId: 'direct-returned-mismatch', project: directArtifactProject }, () => directResult({ context_file: 'agents.output/code-review/other.md' })), /REVIEW_ROUTING_INVALID/);
  resetDirectRoot('direct-routing-mismatch');
  assert.throws(() => executeProjectPipelineReviewBoundary(directParams, { stateDir: directArtifactState, pipelineId: 'direct-routing-mismatch', project: directArtifactProject }, () => directResult({ routing: { verdict: 'APPROVED', route_to: 'pidex-implementer', context_file: 'agents.output/code-review/other.md' } })), /REVIEW_ROUTING_INVALID/);
} finally { rmSync(directArtifactState, { recursive: true, force: true }); rmSync(directArtifactProject, { recursive: true, force: true }); }

// Plan 059 Slice 3 (req 1/2): Project Pipeline primary reviews complete through the
// canonical structured boundary — freshly revalidated registry authority, exact
// archived assigned artifact, post-child authority-change guard preserved, typed
// reviewCompletion parity with host-direct. Host-authority PP writes TBRs only
// beneath the canonical registered host root under the project TBR lock.
const ppStructuredState = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-structured-host-state-'));
const ppStructuredHost = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-structured-host-project-'));
const ppStructuredHostPipeline = 'family-pp-structured-host';
const ppHostArchive = path.join(ppStructuredState, 'project-archives', 'pp-host-wired', 'agents.output', 'code-review', '059.md');
try {
  const hostContext = path.join(ppStructuredHost, 'agents.output', 'code-review', '059.md');
  mkdirSync(path.dirname(hostContext), { recursive: true });
  bindCurrent(ppStructuredState, ppStructuredHost, ppStructuredHostPipeline, 'plan-038');
  writeFileSync(hostContext, structuredFenced(structuredPayload({ verdict: 'REJECTED' })));
  mkdirSync(path.dirname(ppHostArchive), { recursive: true });
  writeFileSync(ppHostArchive, structuredFenced(structuredPayload({ verdict: 'REJECTED' })));
  const ppHostResult = executeProjectPipelineReviewBoundary(
    { agent: 'pidex-code-reviewer', ...identity, projectId: 'pp-host-wired', expectedOutputPath: 'agents.output/code-review/059.md' },
    { stateDir: ppStructuredState, pipelineId: ppStructuredHostPipeline, project: ppStructuredHost, projectId: 'pp-host-wired', resolveCurrentProject: () => ppStructuredHost },
    () => ({ exitCode: 0, archive_sync_status: 'complete', context_file: 'agents.output/code-review/059.md', archive_context_file: ppHostArchive, routing: { verdict: 'REJECTED', route_to: 'pidex-implementer', context_file: 'agents.output/code-review/059.md' } }),
  );
  assert.equal(ppHostResult.reviewCompletion.status, 'CHANGES_REQUESTED', 'PP host-authority completion surfaces typed CHANGES_REQUESTED (parity with host-direct)');
  assert.equal(ppHostResult.reviewCompletion.tbrIds.length, 1, 'PP host-authority typed result carries the stable TBR ID');
  const hostTbrDir = path.join(ppStructuredHost, 'wiki', 'tbr', 'items');
  assert.equal(readdirSync(hostTbrDir).length, 1, 'host-authority PP writes TBR only beneath the canonical registered host root');
  assert.match(readFileSync(path.join(hostTbrDir, readdirSync(hostTbrDir)[0]), 'utf8'), /^sourceFindingId: F-structured-immediate$/m, 'host TBR item is the exact canonical rendered item');
} finally { rmSync(ppStructuredState, { recursive: true, force: true }); rmSync(ppStructuredHost, { recursive: true, force: true }); }

// Plan 059 Slice 3 (req 1/3/6): archive-only Project Pipeline completion holds the
// project TBR lock then the external archive lock (global order), writes TBRs only
// beneath the freshly registry-derived archive root, and fails closed when the
// canonical project is not the registered archive authority (no cwd/custom/URL
// fallback can become TBR authority).
const ppArchivePidexRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-structured-archive-pidex-'));
// Production shape: stateDir === <pidexRoot>/state. The registry-derived archive
// authority lives beneath <pidexRoot>/state/project-archives (resolveArchiveRoot /
// lifecycle.mjs record.archive.path), which is also what the direct-context check
// (isDirectReviewContext: stateDir/project-archives/...) expects — one authority.
const ppArchiveState = path.join(ppArchivePidexRoot, 'state');
const ppArchiveRoot = path.join(ppArchiveState, 'project-archives', 'pp-archive-wired');
const ppArchivePipeline = 'family-pp-structured-archive';
const ppArchiveArtifact = path.join(ppArchiveRoot, 'agents.output', 'code-review', '059.md');
try {
  mkdirSync(path.dirname(ppArchiveArtifact), { recursive: true });
  writeFileSync(ppArchiveArtifact, structuredFenced(structuredPayload({ verdict: 'REJECTED' })));
  bindCurrent(ppArchiveState, ppArchiveRoot, ppArchivePipeline, 'plan-038');
  const ppArchiveResult = executeProjectPipelineReviewBoundary(
    { agent: 'pidex-code-reviewer', ...identity, projectId: 'pp-archive-wired', expectedOutputPath: 'agents.output/code-review/059.md' },
    { stateDir: ppArchiveState, pipelineId: ppArchivePipeline, project: ppArchiveRoot, projectId: 'pp-archive-wired', archiveAuthority: { pidexRoot: ppArchivePidexRoot, projectId: 'pp-archive-wired' }, resolveCurrentProject: () => ppArchiveRoot },
    () => ({ exitCode: 0, archive_sync_status: 'complete', context_file: 'agents.output/code-review/059.md', archive_context_file: ppArchiveArtifact, routing: { verdict: 'REJECTED', route_to: 'pidex-implementer', context_file: 'agents.output/code-review/059.md' } }),
  );
  assert.equal(ppArchiveResult.reviewCompletion.status, 'CHANGES_REQUESTED', 'PP archive-only completion surfaces typed CHANGES_REQUESTED');
  assert.equal(ppArchiveResult.reviewCompletion.tbrIds.length, 1, 'PP archive-only typed result carries the stable TBR ID');
  const archiveTbrDir = path.join(ppArchiveRoot, 'wiki', 'tbr', 'items');
  assert.equal(readdirSync(archiveTbrDir).length, 1, 'archive-only PP writes TBR only beneath the registry-derived archive root');
  assert.match(readFileSync(path.join(archiveTbrDir, readdirSync(archiveTbrDir)[0]), 'utf8'), /^sourceFindingId: F-structured-immediate$/m, 'archive TBR item is the exact canonical rendered item');
  // Fresh registry authority, no fallback: a canonical project that is not the
  // registered archive root fails closed before any completion event or TBR write.
  const foreignProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-foreign-project-'));
  try {
    bindCurrent(ppArchiveState, foreignProject, 'family-pp-foreign', 'plan-038');
    assert.throws(() => executeProjectPipelineReviewBoundary(
      { agent: 'pidex-code-reviewer', ...identity, projectId: 'pp-archive-wired', expectedOutputPath: 'agents.output/code-review/059.md' },
      { stateDir: ppArchiveState, pipelineId: 'family-pp-foreign', project: foreignProject, projectId: 'pp-archive-wired', archiveAuthority: { pidexRoot: ppArchivePidexRoot, projectId: 'pp-archive-wired' }, resolveCurrentProject: () => foreignProject },
      () => ({ exitCode: 0, archive_sync_status: 'complete', context_file: 'agents.output/code-review/059.md', archive_context_file: ppArchiveArtifact, routing: { verdict: 'REJECTED', route_to: 'pidex-implementer', context_file: 'agents.output/code-review/059.md' } }),
    ), /REVIEW_PROJECT_AUTHORITY_CHANGED/, 'archive authority mismatch fails closed at the PP boundary (fresh registry re-derivation, no cwd/custom fallback)');
    assert.equal(existsSync(path.join(foreignProject, 'wiki', 'tbr')), false, 'no TBR bytes ever land outside the registered archive authority');
  } finally { rmSync(foreignProject, { recursive: true, force: true }); }
} finally { rmSync(ppArchiveState, { recursive: true, force: true }); }

// Plan 059 Slice 3 (req 1): corrections remain compatible — they carry no structured
// payload and keep the legacy ROUTING path with the uniform receipt.
const ppCorrectionState = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-correction-state-'));
const ppCorrectionProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-pp-correction-project-'));
try {
  const correctionBase = eventBase(ppCorrectionState, ppCorrectionProject);
  mkdirSync(correctionBase, { recursive: true });
  bindCurrent(ppCorrectionState, ppCorrectionProject, 'family-pp-correction', 'plan-038');
  const seed = { ...identity, reviewMode: 'initial', attemptId: 'attempt-pp-seed' };
  assert.equal(reserveReviewStart({ stateDir: ppCorrectionState, project: ppCorrectionProject, pipelineId: 'family-pp-correction', identity: seed, start: () => 'child' }).status, 'accepted');
  assert.equal(recordReviewCompletion({ stateDir: ppCorrectionState, project: ppCorrectionProject, pipelineId: 'family-pp-correction', identity: seed, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  const correction = { ...identity, reviewMode: 'correction1', attemptId: 'attempt-pp-correction' };
  // Direct PP correction flow requires the full archived-result shape (context_file,
  // archive_sync_status, archive_context_file) for the isDirectReviewContext check
  // even though corrections complete through the legacy ROUTING path (no structured
  // payload, no reviewCompletion).
  const ppCorrectionArchive = path.join(ppCorrectionState, 'project-archives', 'pp-correct', 'agents.output', 'code-review', '059.md');
  mkdirSync(path.dirname(ppCorrectionArchive), { recursive: true });
  writeFileSync(ppCorrectionArchive, '# corrected\n');
  const ppCorrectionResult = executeProjectPipelineReviewBoundary(
    { agent: 'pidex-implementer', ...correction, projectId: 'pp-correct', expectedOutputPath: 'agents.output/code-review/059.md' },
    { stateDir: ppCorrectionState, pipelineId: 'family-pp-correction', project: ppCorrectionProject, projectId: 'pp-correct', resolveCurrentProject: () => ppCorrectionProject },
    () => ({ exitCode: 0, finalText: '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-code-reviewer\ncontext_file: agents.output/code-review/059.md\n-->', archive_sync_status: 'complete', context_file: 'agents.output/code-review/059.md', archive_context_file: ppCorrectionArchive, routing: { verdict: 'COMPLETE', route_to: 'pidex-code-reviewer', context_file: 'agents.output/code-review/059.md' } }),
  );
  assert.match(ppCorrectionResult.finalText, /COMPLETE/);
  assert.equal(ppCorrectionResult.reviewCompletion, undefined, 'corrections keep the legacy contract: no structured reviewCompletion');
  const correctionRows = readFileSync(path.join(correctionBase, 'family-pp-correction.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.attemptId === 'attempt-pp-correction');
  assert.deepEqual(correctionRows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome'], 'corrections complete with the uniform six-event receipt sequence');
} finally { rmSync(ppCorrectionState, { recursive: true, force: true }); rmSync(ppCorrectionProject, { recursive: true, force: true }); }

const aggregateState = mkdtempSync(path.join(os.tmpdir(), 'pidex-aggregate-review-state-'));
const aggregateProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-aggregate-review-project-'));
try {
  const base = eventBase(aggregateState, aggregateProject);
  const rootPipeline = 'root-038';
  const rootStream = path.join(base, `${rootPipeline}.jsonl`);
  const tuple = (family, mode) => ({ runFamilyId: family, planId: 'plan-038', reviewGate: 'code-review', reviewMode: mode, attemptId: `attempt-${family}-${mode}` });
  mkdirSync(base, { recursive: true });
  bindCurrent(aggregateState, aggregateProject, rootPipeline);
  const start = (current, pipelineId = 'caller-selected-stream') => reserveReviewStart({ stateDir: aggregateState, project: aggregateProject, pipelineId, identity: current, start: () => 'child' });
  const finish = (current, outcome) => recordReviewCompletion({ stateDir: aggregateState, project: aggregateProject, pipelineId: 'caller-selected-stream', identity: current, outcome });

  const initial = tuple('family-a', 'initial');
  assert.equal(start(initial).status, 'accepted', 'explicit tuple must bind pointed root, not caller stream');
  assert.equal(finish(initial, 'CHANGES_REQUESTED').status, 'CHANGES_REQUESTED');
  const correction1 = tuple('family-b', 'correction1');
  assert.equal(start(correction1).status, 'accepted');
  assert.equal(finish(correction1, 'READY_FOR_REVIEW').status, 'READY_FOR_REVIEW');
  const review1 = tuple('family-c', 'review1');
  assert.equal(start(review1).status, 'accepted');
  assert.equal(finish(review1, 'CHANGES_REQUESTED').status, 'CHANGES_REQUESTED');
  const correction2 = tuple('family-d', 'correction2');
  assert.equal(start(correction2).status, 'accepted');
  assert.equal(finish(correction2, 'SUBMITTED').status, 'SUBMITTED');
  const review2 = tuple('family-e', 'review2');
  assert.equal(start(review2).status, 'accepted');
  assert.deepEqual(finish(review2, 'CHANGES_REQUESTED'), { status: 'TBR_WRITE_BLOCKED' }, 'review2 rejection must remain durable returned uncertainty without TBR write');
  const rootRows = readFileSync(rootStream, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(rootRows.filter((row) => row.event_type === 'review_outcome').length, 4, 'review2 rejection appends no outcome');
  assert.deepEqual(foldReviewHistory(rootRows, review2), { status: 'uncertain', code: 'SPAWN_RETURNED_UNCERTAIN' });
  assert.equal(start(tuple('family-f', 'initial')).status, 'uncertain', 'returned uncertainty blocks later families');
  assert.match(readFileSync(rootStream, 'utf8'), /family-a/);
  assert.doesNotMatch(readFileSync(rootStream, 'utf8'), /caller-selected-stream/);

  const conflictPipeline = 'root-conflict';
  bindCurrent(aggregateState, aggregateProject, conflictPipeline);
  writeFileSync(path.join(base, 'split-family.jsonl'), `${JSON.stringify(historyRow('start_reserved', tuple('split-family', 'initial')))}\n`);
  assert.deepEqual(start(tuple('family-new', 'initial')), { status: 'denied', code: 'REVIEW_HISTORY_INVALID' }, 'matching non-root stream is unordered conflict, never merge input');

  const approvalPipeline = 'root-approved';
  for (const name of readdirSync(base)) if (name.endsWith('.jsonl')) rmSync(path.join(base, name));
  bindCurrent(aggregateState, aggregateProject, approvalPipeline);
  const approved = tuple('family-approved', 'initial');
  assert.equal(start(approved).status, 'accepted');
  assert.equal(finish(approved, 'APPROVED').status, 'APPROVED');
  assert.equal(start(tuple('family-stale', 'initial')).status, 'resumed', 'approval terminally closes aggregate gate');

  const contentionPipeline = 'root-contention';
  for (const name of readdirSync(base)) if (name.endsWith('.jsonl')) rmSync(path.join(base, name));
  bindCurrent(aggregateState, aggregateProject, contentionPipeline);
  const c0 = tuple('seed-initial', 'initial'); assert.equal(start(c0).status, 'accepted'); assert.equal(finish(c0, 'CHANGES_REQUESTED').status, 'CHANGES_REQUESTED');
  const c1 = tuple('seed-correction1', 'correction1'); assert.equal(start(c1).status, 'accepted'); assert.equal(finish(c1, 'READY_FOR_REVIEW').status, 'READY_FOR_REVIEW');
  const c2 = tuple('seed-review1', 'review1'); assert.equal(start(c2).status, 'accepted'); assert.equal(finish(c2, 'CHANGES_REQUESTED').status, 'CHANGES_REQUESTED');
  let releaseWinner;
  let winnerAtBarrier;
  let childStarts = 0;
  let acceptedStarts = 0;
  const winner = reserveReviewStartAsync({ stateDir: aggregateState, project: aggregateProject, pipelineId: 'caller-selected-stream', identity: tuple('contender-a', 'correction2'), start: (onProcessStarted) => new Promise((resolve) => { childStarts += 1; winnerAtBarrier = () => { onProcessStarted(); acceptedStarts += 1; resolve('winner-child'); }; }) });
  while (!winnerAtBarrier) await new Promise((resolve) => queueMicrotask(resolve));
  const loser = await reserveReviewStartAsync({ stateDir: aggregateState, project: aggregateProject, pipelineId: 'caller-selected-stream', identity: tuple('contender-b', 'correction2'), start: () => { childStarts += 1; return 'must-not-start'; } });
  releaseWinner = winnerAtBarrier;
  releaseWinner();
  const winnerResult = await winner;
  assert.equal(winnerResult.status, 'accepted');
  assert.equal(loser.status, 'unavailable', 'distinct-family final-slot loser cannot enter child start');
  assert.equal(childStarts, 1, 'final-slot race creates exactly one child authority');
  assert.equal(acceptedStarts, 1, 'final-slot race appends exactly one acceptance authority');
  const correction2Rows = readFileSync(path.join(base, `${contentionPipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.reviewMode === 'correction2');
  assert.equal(correction2Rows.filter((row) => row.event_type === 'spawn_accepted').length, 1, 'root stream has one durable correction2 acceptance');
  assert.deepEqual([...new Set(correction2Rows.map((row) => `${row.metadata.runFamilyId}|${row.metadata.attemptId}`))], ['contender-a|attempt-contender-a-correction2'], 'root stream has one durable correction2 tuple');
  assert.deepEqual(reserveReviewStart({ stateDir: aggregateState, project: path.join(aggregateProject, 'missing'), pipelineId: 'ignored', identity: tuple('bad-canonical', 'initial'), start: () => 'child' }), { status: 'denied', code: 'REVIEW_CANONICAL_PROJECT_UNAVAILABLE' }, 'canonical project failure fails closed');
} finally { rmSync(aggregateState, { recursive: true, force: true }); rmSync(aggregateProject, { recursive: true, force: true }); }

// Plan 059 Slice 1 — host-direct tracer reads the exact assigned artifact payload.
const structuredHostState = mkdtempSync(path.join(os.tmpdir(), 'pidex-structured-host-state-'));
const structuredHostProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-structured-host-project-'));
const structuredContext = path.join(structuredHostProject, 'agents.output', 'code-review', '059.md');
const structuredBase = eventBase(structuredHostState, structuredHostProject);
const s1Identity = (family) => ({ runFamilyId: family, planId: 'plan-059', reviewGate: 'code-review', reviewMode: 'initial', attemptId: `attempt-${family}` });
const s1Reset = (pipelineId) => { mkdirSync(structuredBase, { recursive: true }); for (const name of readdirSync(structuredBase)) if (name.endsWith('.jsonl')) rmSync(path.join(structuredBase, name)); bindCurrent(structuredHostState, structuredHostProject, pipelineId, 'plan-059'); const wiki = path.join(structuredHostProject, 'wiki'); if (readdirSync(structuredHostProject).includes('wiki')) rmSync(wiki, { recursive: true, force: true }); };
const s1Rows = (pipelineId, family) => readFileSync(path.join(structuredBase, `${pipelineId}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.planId === 'plan-059' && row.metadata?.runFamilyId === family);
const s1Tbr = () => { const dir = path.join(structuredHostProject, 'wiki', 'tbr', 'items'); try { return readdirSync(dir).sort(); } catch { return []; } };
let s1Children = 0;
const s1Options = (pipelineId) => ({
  agentCwd: structuredHostProject,
  reviewLifecycle: { stateDir: structuredHostState, pipelineId },
  loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
  resolveSandboxState: () => ({ enabled: false }),
  runConfigured: async (params) => { s1Children += 1; params.onProcessStarted?.(); return { agent: params.agent, provider: 'pi', exitCode: 0, finalText: '<!-- ROUTING\nverdict: REJECTED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/059.md\n-->', stderr: '' }; },
});
try {
  mkdirSync(path.dirname(structuredContext), { recursive: true });
  // ROUTING/structured-verdict mismatch fails closed before any completion event.
  s1Reset('family-s1-mismatch');
  writeFileSync(structuredContext, structuredFenced(structuredPayload({ verdict: 'APPROVED', findings: [] })));
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 059 verdict mismatch', ...s1Identity('family-s1-mismatch') }, s1Options('family-s1-mismatch')), /STRUCTURED_ROUTING_MISMATCH/);
  assert.equal(s1Rows('family-s1-mismatch', 'family-s1-mismatch').some((row) => row.event_type === 'review_outcome'), false, 'mismatch appends no review outcome');

  // Missing structured payload fails closed: prompt-only classification is not load-bearing.
  s1Reset('family-s1-missing');
  writeFileSync(structuredContext, '# prose-only review\n');
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 059 missing payload', ...s1Identity('family-s1-missing') }, s1Options('family-s1-missing')), /STRUCTURED_OUTCOME_MISSING/);
  assert.equal(s1Rows('family-s1-missing', 'family-s1-missing').some((row) => row.event_type === 'review_outcome'), false, 'missing payload appends no review outcome');

  // In-contract rejected host review archives immediate findings and completes
  // CHANGES_REQUESTED with the uniform six-event receipt sequence (AD-1).
  s1Reset('family-s1-rejected');
  writeFileSync(structuredContext, structuredFenced(structuredPayload()));
  const rejectedHost = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 059 rejected review', ...s1Identity('family-s1-rejected') }, s1Options('family-s1-rejected'));
  assert.match(rejectedHost.finalText, /REJECTED/);
  assert.deepEqual(s1Rows('family-s1-rejected', 'family-s1-rejected').map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome'], 'uniform six-event completion with fixed-position receipt');
  assert.equal(s1Rows('family-s1-rejected', 'family-s1-rejected').at(-1).metadata.outcome, 'CHANGES_REQUESTED');
  const rejectedReceipt = s1Rows('family-s1-rejected', 'family-s1-rejected').find((row) => row.event_type === 'completion_prepared').metadata;
  assert.equal(rejectedReceipt.intendedOutcome, 'CHANGES_REQUESTED', 'receipt binds intended outcome');
  assert.match(rejectedReceipt.artifactDigest, /^[a-f0-9]{64}$/, 'receipt binds the exact assigned-artifact digest');
  assert.match(rejectedReceipt.outcomeDigest, /^[a-f0-9]{64}$/, 'receipt binds the canonical completion digest');
  assert.equal(rejectedReceipt.tbrIds.length, 1, 'receipt binds the archived stable TBR ID');
  assert.match(s1Tbr().map((name) => readFileSync(path.join(structuredHostProject, 'wiki', 'tbr', 'items', name), 'utf8')).join(''), /^sourceFindingId: F-structured-immediate$/m, 'host rejection archives the immediate finding');
  // Plan 059 Slice 2 (item 7): typed completion status surfaced on the host boundary
  // result for the Slice 4 policy consumer (SKILL policy untouched here).
  assert.equal(rejectedHost.reviewCompletion.status, 'CHANGES_REQUESTED', 'typed completion status surfaces to the policy consumer');

  // Expansion completes durably (AD-7): typed USER_DECISION_REQUIRED, six-event receipt
  // sequence, zero TBR, non-spawnable expansion_pending fold. Retry resumes without a child.
  s1Reset('family-s1-expansion');
  writeFileSync(structuredContext, structuredFenced(structuredPayload({ contractDisposition: 'scope_expansion', findings: [structuredActiveFinding] })));
  const expansionHost = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 059 expansion review', ...s1Identity('family-s1-expansion') }, s1Options('family-s1-expansion'));
  assert.deepEqual(s1Rows('family-s1-expansion', 'family-s1-expansion').map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted', 'completion_prepared', 'spawn_returned', 'review_outcome'], 'expansion records durable returned review truth with the uniform receipt');
  assert.equal(s1Rows('family-s1-expansion', 'family-s1-expansion').at(-1).metadata.outcome, 'USER_DECISION_REQUIRED');
  const expansionReceipt = s1Rows('family-s1-expansion', 'family-s1-expansion').find((row) => row.event_type === 'completion_prepared').metadata;
  assert.equal(expansionReceipt.intendedOutcome, 'USER_DECISION_REQUIRED', 'expansion receipt binds intended outcome');
  assert.deepEqual(expansionReceipt.tbrIds, [], 'expansion receipt binds empty TBR IDs');
  assert.deepEqual(s1Tbr(), [], 'expansion writes no TBR archive');
  assert.equal(expansionHost.reviewCompletion.status, 'USER_DECISION_REQUIRED', 'expansion typed status surfaces to the policy consumer');
  assert.equal(expansionHost.reviewCompletion.disposition, 'scope_expansion', 'expansion disposition surfaces with the typed status');
  const s1ChildrenAfterExpansion = s1Children;
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 059 expansion retry', ...s1Identity('family-s1-expansion') }, s1Options('family-s1-expansion')), /REVIEW_DISPATCH_RESUMED/, 'expansion leaves the review non-spawnable: retry resumes without a child');
  assert.equal(s1Children, s1ChildrenAfterExpansion, 'expansion spawns zero additional children and never a correction');

  // Review2 terminal rejection through the host boundary: CLOSED_WITH_TBR typed result
  // surfaced for the Slice 4 policy consumer, all findings archived, lifecycle closed.
  const terminalState = mkdtempSync(path.join(os.tmpdir(), 'pidex-s2-terminal-host-state-'));
  const terminalProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-s2-terminal-host-project-'));
  const terminalContext = path.join(terminalProject, 'agents.output', 'code-review', '059.md');
  const terminalBase = eventBase(terminalState, terminalProject);
  mkdirSync(path.dirname(terminalContext), { recursive: true });
  let terminalChildren = 0;
  const terminalOptions = (mode) => ({
    agentCwd: terminalProject,
    reviewLifecycle: { stateDir: terminalState, pipelineId: 'terminal-host' },
    loadConfig: () => ({ defaults: { provider: 'pi' }, agents: {} }),
    resolveSandboxState: () => ({ enabled: false }),
    runConfigured: async (params) => {
      terminalChildren += 1;
      params.onProcessStarted?.();
      const isCorrection = params.agent === 'pidex-implementer';
      return { agent: params.agent, provider: 'pi', exitCode: 0, finalText: isCorrection
        ? '<!-- ROUTING\nverdict: COMPLETE\nroute_to: pidex-code-reviewer\ncontext_file: agents.output/code-review/059.md\n-->'
        : `<!-- ROUTING\nverdict: REJECTED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/059.md\n-->`, stderr: '' };
    },
  });
  try {
    mkdirSync(terminalBase, { recursive: true });
    bindCurrent(terminalState, terminalProject, 'terminal-host', 'plan-059');
    for (const mode of ['initial', 'correction1', 'review1', 'correction2']) {
      if (!mode.startsWith('correction')) writeFileSync(terminalContext, structuredFenced(structuredPayload({ verdict: 'REJECTED' })));
      const agent = mode.startsWith('correction') ? 'pidex-implementer' : 'pidex-code-reviewer';
      await executeHostAgentBoundary({ agent, task: `Plan 059 ${mode}`, ...s1Identity('family-terminal'), reviewMode: mode, attemptId: `attempt-terminal-${mode}` }, terminalOptions(mode));
    }
    writeFileSync(terminalContext, structuredFenced(structuredPayload({ verdict: 'REJECTED', findings: [structuredTerminalActiveFinding, structuredImmediateFinding] })));
    const terminalHost = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 059 review2 terminal', ...s1Identity('family-terminal'), reviewMode: 'review2', attemptId: 'attempt-terminal-review2' }, terminalOptions('review2'));
    assert.match(terminalHost.finalText, /REJECTED/);
    assert.equal(terminalHost.reviewCompletion.status, 'CLOSED_WITH_TBR', 'review2 terminal typed status surfaces to the policy consumer');
    assert.equal(terminalHost.reviewCompletion.tbrIds.length, 2, 'typed result carries both stable TBR IDs');
    const terminalRows = readFileSync(path.join(terminalBase, 'terminal-host.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.attemptId === 'attempt-terminal-review2');
    assert.equal(terminalRows.at(-1).metadata.outcome, 'closed', 'review2 rejection lifecycle outcome is closed');
    assert.equal(terminalRows.find((row) => row.event_type === 'completion_prepared').metadata.intendedOutcome, 'closed', 'terminal receipt binds closed');
    // Terminal retry through the host boundary folds terminal and resumes without a child.
    const childrenBeforeTerminalRetry = terminalChildren;
    await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 059 review2 terminal retry', ...s1Identity('family-terminal'), reviewMode: 'review2', attemptId: 'attempt-terminal-review2' }, terminalOptions('review2')), /REVIEW_DISPATCH_RESUMED/, 'terminal retry resumes without a second child');
    assert.equal(terminalChildren, childrenBeforeTerminalRetry, 'terminal retry spawns zero additional children');
  } finally { rmSync(terminalState, { recursive: true, force: true }); rmSync(terminalProject, { recursive: true, force: true }); }
} finally { rmSync(structuredHostState, { recursive: true, force: true }); rmSync(structuredHostProject, { recursive: true, force: true }); }

console.log('review budget TBR tests passed');
