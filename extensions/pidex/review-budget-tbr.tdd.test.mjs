#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { admitReviewDispatch, executeHostAgentBoundary, executeProjectPipelineReviewBoundary, normalizePublicReviewIdentity, runConfiguredProviderAttempts } from './index.ts';
import { foldReviewHistory, normalizeReviewVerdict } from './review-budget.ts';
import { closeReviewWithTbr, validateReviewOutcome, writeTbr } from '../../scripts/quality/tbr.mjs';
import { reserveReviewStart, reserveReviewStartAsync, recordReviewCompletion } from '../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs';
import { canonicalProjectIdentity } from '../../modules/pidex/analysis-metrics-history/lib/project-key.mjs';
import '../../scripts/quality/tbr.tdd.test.mjs';
import '../../scripts/quality/orchestrator-events.tdd.test.mjs';

const identity = { runFamilyId: 'family-038', planId: 'plan-038', reviewGate: 'code-review', reviewMode: 'initial', attemptId: 'attempt-1' };
assert.deepEqual(normalizePublicReviewIdentity({ agent: 'pidex-code-reviewer', reviewIdentity: identity }), { agent: 'pidex-code-reviewer', ...identity });
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
const bindCurrent = (stateDir, project, pipelineId) => { const base = eventBase(stateDir, project); mkdirSync(base, { recursive: true }); writeFileSync(path.join(base, 'plan-038.current'), pipelineId); writeFileSync(path.join(base, `${pipelineId}.jsonl`), `${JSON.stringify({ event_type: 'pipeline_started', project_path: canonicalProjectIdentity(project).canonicalProject, pipeline_id: pipelineId, plan_key: 'plan-038' })}\n`, { flag: 'a' }); };
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
writeFileSync(hostContext, '# review\n');
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
  writeFileSync(context, '# review\n');
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
  writeFileSync(lifecycleContext, '# context\n');
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
  const review1 = await executeHostAgentBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 review1' }, lifecycleOptions);
  assert.match(review1.finalText, /APPROVED/);
  assert.equal(lifecycleChildren, 3, 'omitted tuples must derive one normal rejection/correction/review chain');
  const lifecycleRows = readFileSync(path.join(lifecycleBase, `${lifecyclePipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.planId === 'plan-038');
  assert.deepEqual(lifecycleRows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'review_outcome', 'start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'review_outcome', 'start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'review_outcome']);
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
  assert.equal(writeTbr({ root, identity, findings: [{ ...rejected.value.immediateTbr[0], title: 'Renamed finding' }] }).ok, true);
  const itemFiles = readdirSync(path.join(root, 'wiki/tbr/items')).sort();
  assert.equal(itemFiles.length, 2, 'stable ID lookup must ignore retry slug changes');
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
writeFileSync(ppContext, '# review\n');
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
  writeFileSync(ppCompletionContext, '# review\n');
  const ppResult = executeProjectPipelineReviewBoundary({ agent: 'pidex-code-reviewer', task: 'Plan 038 direct review' }, { stateDir: ppCompletionState, pipelineId: 'ignored-for-derived-identity', project: ppCompletionProject }, () => ({ exitCode: 0, finalText: '<!-- ROUTING\nverdict: APPROVED\nroute_to: pidex-implementer\ncontext_file: agents.output/code-review/038.md\n-->' }));
  assert.match(ppResult.finalText, /APPROVED/);
  const ppRows = readFileSync(path.join(ppCompletionBase, `${ppCompletionPipeline}.jsonl`), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((row) => row.metadata?.planId === 'plan-038');
  assert.deepEqual(ppRows.map((row) => row.event_type), ['start_reserved', 'spawn_entered', 'spawn_accepted', 'spawn_returned', 'review_outcome']);
} finally { rmSync(ppCompletionState, { recursive: true, force: true }); rmSync(ppCompletionProject, { recursive: true, force: true }); }

const correctionOwnerState = mkdtempSync(path.join(os.tmpdir(), 'pidex-correction-owner-state-'));
const correctionOwnerProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-correction-owner-project-'));
let correctionOwnerChildren = 0;
try {
  const base = eventBase(correctionOwnerState, correctionOwnerProject);
  mkdirSync(base, { recursive: true });
  bindCurrent(correctionOwnerState, correctionOwnerProject, 'family-owner');
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
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 038 ordinary planning' }, options);
  await executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'Plan 038 ordinary implementation' }, options);
  assert.equal(correctionOwnerChildren, 2, 'zero-pending correction owners must remain ordinary calls');

  mkdirSync(path.join(correctionOwnerProject, 'agents.output', 'planning'), { recursive: true });
  writeFileSync(path.join(correctionOwnerProject, 'agents.output', 'planning', '038.md'), '# planner context\n');
  const start = (gate) => reserveReviewStart({ stateDir: correctionOwnerState, project: correctionOwnerProject, pipelineId: 'family-owner', identity: { runFamilyId: 'family-owner', planId: 'plan-038', reviewGate: gate, reviewMode: 'initial', attemptId: lifecycleAttempt('family-owner', gate, 'initial') }, start: () => 'seed' });
  const critic = { runFamilyId: 'family-owner', planId: 'plan-038', reviewGate: 'critic', reviewMode: 'initial', attemptId: lifecycleAttempt('family-owner', 'critic', 'initial') };
  assert.equal(start('critic').status, 'accepted');
  assert.equal(recordReviewCompletion({ stateDir: correctionOwnerState, project: correctionOwnerProject, pipelineId: 'family-owner', identity: critic, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  await executeHostAgentBoundary({ agent: 'pidex-planner', task: 'Plan 038 tracked correction' }, options);
  assert.equal(correctionOwnerChildren, 3, 'one pending planner correction must remain lifecycle tracked');
  for (const gate of ['code-review', 'security']) {
    const current = { runFamilyId: 'family-owner', planId: 'plan-038', reviewGate: gate, reviewMode: 'initial', attemptId: lifecycleAttempt('family-owner', gate, 'initial') };
    assert.equal(start(gate).status, 'accepted');
    assert.equal(recordReviewCompletion({ stateDir: correctionOwnerState, project: correctionOwnerProject, pipelineId: 'family-owner', identity: current, outcome: 'CHANGES_REQUESTED' }).status, 'CHANGES_REQUESTED');
  }
  await assert.rejects(() => executeHostAgentBoundary({ agent: 'pidex-implementer', task: 'Plan 038 ambiguous correction' }, options), /REVIEW_IDENTITY_INVALID/);
  assert.equal(correctionOwnerChildren, 3, 'multiple pending corrections must create zero children');
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
  writeFileSync(context, '# context\n');
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

console.log('review budget TBR tests passed');
