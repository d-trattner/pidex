#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main, transitionReviewOutcome } from './orchestrator-events.mjs';

const identity = { planId: 'plan-038', runFamilyId: 'family-038', reviewGate: 'code-review' };
const finding = (findingId) => ({
  findingId, relation: 'new', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'tbr_immediate',
  title: `Deferred ${findingId}`, shortDescription: 'Structured finding deferred from current gate.', originEpic: 'initiative-038', reviewArtifact: 'agents.output/code-review/038.md', affectedIdentifiers: ['scripts/quality/tbr.mjs'], deferredReason: 'New finding cannot extend current gate.', nextAnalysisOrDisconfirmingTest: 'Validate canonical payload.',
});
const active = { findingId: 'F-active', relation: 'assigned', class: 'Product', reproductionState: 'reproduced', causedByCorrection: false, severity: 'High', disposition: 'active' };
const reorderKeys = (value) => Array.isArray(value) ? value.map(reorderKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorderKeys(child)])) : value;
const root = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-b3-'));
try {
  const events = []; let spawns = 0;
  const result = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-b3-1'), finding('F-b3-2')] }, appendOutcome: () => events.push('outcome'), appendRoute: () => events.push('route'), spawn: () => { spawns += 1; } });
  assert.equal(result.status, 'CHANGES_REQUESTED', 'non-final rejection records truthful operator status (R1: CLOSED_WITH_TBR reserved for canonical boundary)');
  assert.deepEqual(readdirSync(path.join(root, 'wiki/tbr/items')).length, 2, 'all immediate items persist before continuation');
  assert.deepEqual(events, ['outcome', 'route']);
  assert.equal(spawns, 1);

  const blockedEvents = []; let blockedSpawns = 0;
  const blocked = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-blocked')] }, write: () => ({ ok: false, code: 'TBR_PATH_INVALID' }), appendOutcome: () => blockedEvents.push('outcome'), appendRoute: () => blockedEvents.push('route'), spawn: () => { blockedSpawns += 1; } });
  assert.deepEqual(blocked, { status: 'TBR_WRITE_BLOCKED', code: 'TBR_PATH_INVALID' });
  assert.deepEqual(blockedEvents, []);
  assert.equal(blockedSpawns, 0, 'writer failure cannot produce outcome-derived spawn');
  for (const code of ['TBR_ITEM_INVALID', 'TBR_WRITE_FAILED']) {
    let faultSpawns = 0;
    assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding(`F-${code}`)] }, write: () => ({ ok: false, code }), appendOutcome: () => { throw new Error('event must stay after failed item/index write'); }, spawn: () => { faultSpawns += 1; } }), { status: 'TBR_WRITE_BLOCKED', code });
    assert.equal(faultSpawns, 0);
  }
  let eventSpawns = 0;
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-event-fault')] }, appendOutcome: () => false, appendRoute: () => { throw new Error('route must stay after event'); }, spawn: () => { eventSpawns += 1; } }), { status: 'TBR_WRITE_BLOCKED', code: 'TBR_OUTCOME_APPEND_FAILED' });
  assert.equal(eventSpawns, 0, 'failed event append cannot spawn continuation');

  for (const [name, callbacks, code] of [
    ['missing-outcome', { appendRoute: () => true, spawn: () => true }, 'TBR_OUTCOME_APPEND_FAILED'],
    ['missing-route', { appendOutcome: () => true, spawn: () => true }, 'TBR_ROUTE_APPEND_FAILED'],
    ['missing-spawn', { appendOutcome: () => true, appendRoute: () => true }, 'TBR_SPAWN_FAILED'],
    ['throwing-outcome', { appendOutcome: () => { throw new Error('outcome failure'); }, appendRoute: () => true, spawn: () => true }, 'TBR_OUTCOME_APPEND_FAILED'],
    ['throwing-route', { appendOutcome: () => true, appendRoute: () => { throw new Error('route failure'); }, spawn: () => true }, 'TBR_ROUTE_APPEND_FAILED'],
    ['throwing-spawn', { appendOutcome: () => true, appendRoute: () => true, spawn: () => { throw new Error('spawn failure'); } }, 'TBR_SPAWN_FAILED'],
  ]) assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding(`F-${name}`)] }, ...callbacks }), { status: 'TBR_WRITE_BLOCKED', code }, `${name} is a bounded transition failure`);

  const semanticOutcomes = new Map(); let retryRoutes = 0;
  const appendOnce = (value, event) => {
    const existing = semanticOutcomes.get(event.semanticId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(value)) return false;
    if (existing) return { ok: true, duplicate: true };
    semanticOutcomes.set(event.semanticId, value); return true;
  };
  const retryOutcome = { verdict: 'REJECTED', findings: [active, finding('F-retry')] };
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: retryOutcome, appendOutcome: appendOnce, appendRoute: () => { retryRoutes += 1; return false; }, spawn: () => true }), { status: 'TBR_WRITE_BLOCKED', code: 'TBR_ROUTE_APPEND_FAILED' });
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: reorderKeys(retryOutcome), appendOutcome: appendOnce, appendRoute: () => { retryRoutes += 1; return true; }, spawn: () => true }).status, 'CHANGES_REQUESTED', 'key-reordered semantic retry resumes without duplicate (R1: truthful status, never CLOSED_WITH_TBR)');
  assert.equal(semanticOutcomes.size, 1, 'equivalent retry must not append duplicate durable outcome');
  assert.equal(retryRoutes, 2, 'retry resumes route boundary');
  // Plan 059 Slice 2 (AD-4/R1): full canonical byte dedup catches the byte-different
  // retry under the same stable ID at the writer boundary first — TBR_COLLISION
  // fails closed before the semantic-append boundary is ever reached.
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { ...retryOutcome, findings: [active, { ...finding('F-retry'), title: 'Changed durable retry value' }] }, appendOutcome: appendOnce, appendRoute: () => true, spawn: () => true }), { status: 'TBR_WRITE_BLOCKED', code: 'TBR_COLLISION' }, 'changed value under current event identity conflicts at the byte-dedup writer boundary');

  const zeroSpawn = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-zero-spawn')] }, appendOutcome: () => true, appendRoute: () => true, spawn: () => true });
  assert.equal(zeroSpawn.status, 'CHANGES_REQUESTED', 'explicit no-op spawn boundary is successful (R1: truthful operator status)');

  const malformedEvents = [];
  assert.deepEqual(transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [{ id: 'legacy' }] }, appendOutcome: () => malformedEvents.push('outcome') }), { status: 'TBR_WRITE_BLOCKED', code: 'REVIEW_FINDING_INVALID' });
  assert.deepEqual(malformedEvents, [], 'exact validation happens before writer/event boundary');

  const repaired = transitionReviewOutcome({ root, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-b3-1'), finding('F-b3-2')] }, appendOutcome: () => true, appendRoute: () => true, spawn: () => true });
  assert.equal(repaired.status, 'CHANGES_REQUESTED', 'retry converges on stable items and full index repair (R1: truthful operator status, never CLOSED_WITH_TBR)');
} finally { rmSync(root, { recursive: true, force: true }); }

const dryRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-dry-'));
try {
  assert.equal(main(['--dry-run', '--project', dryRoot, '--pipeline-id', 'dry-038', '--operator-type', 'OpReview', '--gate', 'code-review', '--review-outcome-json', JSON.stringify({ verdict: 'REJECTED', findings: [active, finding('F-dry')] })]), 0);
  assert.equal(existsSync(path.join(dryRoot, 'wiki')), false, '--dry-run must not write local TBR artifact');
} finally { rmSync(dryRoot, { recursive: true, force: true }); }

const cliRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-cli-'));
const cliState = path.resolve('state/orchestrator-events', path.basename(cliRoot));
try {
  const cliOutcome = { verdict: 'REJECTED', findings: [active, finding('F-cli')] };
  const cliArgs = ['--project', cliRoot, '--pipeline-id', 'cli-038', '--run-family-id', 'cli-family-038', '--operator-type', 'OpReview', '--gate', 'code-review', '--review-outcome-json', JSON.stringify(cliOutcome)];
  assert.equal(main(cliArgs), 0);
  assert.equal(main([...cliArgs.slice(0, -1), JSON.stringify(reorderKeys(cliOutcome))]), 0, 'key-reordered CLI retry accepts durable duplicate');
  const cliRows = readFileSync(path.join(cliState, 'cli-038.jsonl'), 'utf8').trim().split('\n');
  assert.equal(cliRows.length, 1, 'CLI JSONL appends semantic review outcome once');
  assert.equal(main([...cliArgs.slice(0, -1), JSON.stringify({ ...cliOutcome, findings: [active, { ...finding('F-cli'), title: 'Changed CLI durable value' }] })]), 1, 'CLI blocks changed semantic duplicate under current event identity');
} finally { rmSync(cliRoot, { recursive: true, force: true }); rmSync(cliState, { recursive: true, force: true }); }

// Plan 059 Slice 2 correction R1 (code-review Major 1): the CLI review-outcome
// path must serialize shared-index TBR writes on the project-scoped TBR lock
// (same authority + stateDir/project as the canonical completion boundary) and
// must never claim the lifecycle CLOSED_WITH_TBR terminal independently of
// completeStructuredReviewOutcome. Truthful operator statuses: approval ->
// accepted, non-final rejection -> CHANGES_REQUESTED. Lock-uncertain CLI writes
// nothing (no TBR items, no operator event). Only completeStructuredReviewOutcome
// may produce the lifecycle CLOSED_WITH_TBR terminal.
const truthfulRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-truth-'));
try {
  const approved = transitionReviewOutcome({ root: truthfulRoot, identity, outcome: { verdict: 'APPROVED', findings: [finding('F-approve-1')] }, appendOutcome: () => true, appendRoute: () => true, spawn: () => true });
  assert.equal(approved.status, 'accepted', 'approval with immediate findings archives and records accepted, never CLOSED_WITH_TBR');
  const rejected = transitionReviewOutcome({ root: truthfulRoot, identity, outcome: { verdict: 'REJECTED', findings: [active, finding('F-reject-1')] }, appendOutcome: () => true, appendRoute: () => true, spawn: () => true });
  assert.equal(rejected.status, 'CHANGES_REQUESTED', 'non-final rejection archives immediate and records CHANGES_REQUESTED, never CLOSED_WITH_TBR');
  assert.notEqual(approved.status, 'CLOSED_WITH_TBR', 'CLI transition path never claims the lifecycle terminal');
  assert.notEqual(rejected.status, 'CLOSED_WITH_TBR', 'CLI transition path never claims the lifecycle terminal');
} finally { rmSync(truthfulRoot, { recursive: true, force: true }); }

// Lock-uncertain CLI review outcome (AD-3): while another process holds the
// project TBR serialization lock (the same withProjectTbrLock authority boundary
// completions use), the CLI path fails closed and writes NOTHING — no wiki/tbr
// index items and no operator event append.
const lockedRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-locked-'));
const lockedState = path.resolve('state');
const lockedEvents = path.join(lockedState, 'orchestrator-events', path.basename(lockedRoot));
const holderSource = `import { withProjectTbrLock } from ${JSON.stringify(new URL('../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs', import.meta.url).href)}; const [stateDir, project] = process.argv.slice(1); withProjectTbrLock({ stateDir, project }, () => { const end = Date.now() + 3000; while (Date.now() < end) {} return 'held'; });`;
try {
  const holder = spawn(process.execPath, ['--input-type=module', '--eval', holderSource, lockedState, lockedRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
  let holderError = '';
  holder.stderr.on('data', (chunk) => { holderError += chunk; });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const lockedCode = main(['--project', lockedRoot, '--pipeline-id', 'locked-038', '--run-family-id', 'locked-family-038', '--operator-type', 'OpReview', '--gate', 'code-review', '--review-outcome-json', JSON.stringify({ verdict: 'REJECTED', findings: [active, finding('F-locked')] })]);
  assert.equal(lockedCode, 1, 'lock-uncertain CLI review outcome fails closed');
  assert.equal(existsSync(path.join(lockedRoot, 'wiki', 'tbr', 'items')), false, 'lock-uncertain CLI writes no TBR index items');
  assert.equal(existsSync(path.join(lockedEvents, 'locked-038.jsonl')), false, 'lock-uncertain CLI appends no operator event');
  await new Promise((resolve) => holder.on('close', resolve));
  assert.equal(holderError, '', holderError);
} finally { rmSync(lockedRoot, { recursive: true, force: true }); rmSync(lockedEvents, { recursive: true, force: true }); }

// Concurrent CLI writers on the same project serialize on the project TBR lock:
// both index writers survive and both operator events are recorded — no lost
// rows from the shared project TBR index (AD-3 "Different plans/gates cannot race
// and lose entries from the shared project TBR index").
const concurrentRoot = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-concurrent-'));
const concurrentState = path.resolve('state');
const concurrentEvents = path.join(concurrentState, 'orchestrator-events', path.basename(concurrentRoot));
const cliSource = `import { main } from ${JSON.stringify(new URL('./orchestrator-events.mjs', import.meta.url).href)}; const [project, pipelineId, runFamily, outcomeJson] = process.argv.slice(1); process.exitCode = main(['--project', project, '--pipeline-id', pipelineId, '--run-family-id', runFamily, '--operator-type', 'OpReview', '--gate', 'code-review', '--review-outcome-json', outcomeJson]);`;
const runCli = (family, findingId) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', cliSource, concurrentRoot, 'cli-conc-038', family, JSON.stringify({ verdict: 'REJECTED', findings: [active, finding(findingId)] })], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let error = '';
  child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject); child.on('close', (code) => resolve({ code, output, error }));
});
try {
  const [concA, concB] = await Promise.all([runCli('family-conc-a', 'F-conc-a'), runCli('family-conc-b', 'F-conc-b')]);
  assert.equal(concA.code, 0, concA.error + concA.output);
  assert.equal(concB.code, 0, concB.error + concB.output);
  const concItems = readdirSync(path.join(concurrentRoot, 'wiki', 'tbr', 'items'));
  assert.equal(concItems.length, 2, 'both concurrent CLI index writers survive');
  const concIndex = readFileSync(path.join(concurrentRoot, 'wiki', 'tbr', 'index.md'), 'utf8');
  assert.match(concIndex, /F-conc-a/, 'concurrent CLI writer A survives in the shared index');
  assert.match(concIndex, /F-conc-b/, 'concurrent CLI writer B survives in the shared index');
  const concRows = readFileSync(path.join(concurrentEvents, 'cli-conc-038.jsonl'), 'utf8').trim().split('\n');
  assert.equal(concRows.length, 2, 'both concurrent CLI operator events recorded, no duplicate index loss');
} finally { rmSync(concurrentRoot, { recursive: true, force: true }); rmSync(concurrentEvents, { recursive: true, force: true }); }

// Security F-2 (conditional lock parity gap): the CLI must derive its state root
// from RUNNING_PI_STATE_DIR when provided (the same configured state root the host
// lifecycle and event.mjs honor) so the CLI TBR lock and the host serialize on the
// same lock file; otherwise it defaults to <repo>/state. A lock taken under the env
// state root must block the CLI with zero writes (no TBR index items, no operator
// event append); the default (env unset) path stays compatible with the repo state
// root. Subprocess lanes: real child processes, real env control, no in-process
// STATE override.
const envState = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-envstate-'));
const envProject = mkdtempSync(path.join(os.tmpdir(), 'pidex-tbr-envproj-'));
const envStateHolder = `import { withProjectTbrLock } from ${JSON.stringify(new URL('../../modules/pidex/analysis-metrics-history/lib/review-lifecycle.mjs', import.meta.url).href)}; const [stateDir, project] = process.argv.slice(1); withProjectTbrLock({ stateDir, project }, () => { const end = Date.now() + 3000; while (Date.now() < end) {} return 'held'; });`;
const envCliSource = `import { main } from ${JSON.stringify(new URL('./orchestrator-events.mjs', import.meta.url).href)}; const [project, pipelineId, runFamily, outcomeJson] = process.argv.slice(1); process.exitCode = main(['--project', project, '--pipeline-id', pipelineId, '--run-family-id', runFamily, '--operator-type', 'OpReview', '--gate', 'code-review', '--review-outcome-json', outcomeJson]);`;
const runCliSubprocess = (project, pipelineId, runFamily, outcomeJson, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', envCliSource, project, pipelineId, runFamily, outcomeJson], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let error = '';
  child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
  child.on('error', reject); child.on('close', (code) => resolve({ code, output, error }));
});
const cleanEnv = { ...process.env }; delete cleanEnv.RUNNING_PI_STATE_DIR;
let envHolder;
try {
  envHolder = spawn(process.execPath, ['--input-type=module', '--eval', envStateHolder, envState, envProject], { stdio: ['ignore', 'pipe', 'pipe'] });
  let envHolderError = '';
  envHolder.stderr.on('data', (chunk) => { envHolderError += chunk; });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const envLocked = await runCliSubprocess(envProject, 'env-locked-038', 'env-locked-family-038', JSON.stringify({ verdict: 'REJECTED', findings: [active, finding('F-env-locked')] }), { ...cleanEnv, RUNNING_PI_STATE_DIR: envState });
  assert.equal(envLocked.code, 1, 'lock under RUNNING_PI_STATE_DIR blocks the CLI with zero writes (security F-2): ' + envLocked.error + envLocked.output);
  assert.equal(existsSync(path.join(envProject, 'wiki', 'tbr', 'items')), false, 'blocked env-state CLI writes no TBR index items');
  assert.equal(existsSync(path.join(envState, 'orchestrator-events', path.basename(envProject), 'env-locked-038.jsonl')), false, 'blocked env-state CLI appends no operator event under the env state root');
  await new Promise((resolve) => envHolder.on('close', resolve));
  assert.equal(envHolderError, '', envHolderError);
  // Default compat: without RUNNING_PI_STATE_DIR the CLI uses <repo>/state as before.
  const defaultRun = await runCliSubprocess(envProject, 'env-default-038', 'env-default-family-038', JSON.stringify({ verdict: 'REJECTED', findings: [active, finding('F-env-default')] }), cleanEnv);
  assert.equal(defaultRun.code, 0, 'default (env unset) CLI path stays compatible (security F-2): ' + defaultRun.error + defaultRun.output);
  assert.equal(readdirSync(path.join(envProject, 'wiki', 'tbr', 'items')).length, 1, 'default CLI writes the TBR index item into the project root');
  assert.equal(existsSync(path.join(path.resolve('state'), 'orchestrator-events', path.basename(envProject), 'env-default-038.jsonl')), true, 'default CLI appends the operator event under the repo state root');
} finally { if (envHolder && envHolder.exitCode === null) envHolder.kill(); rmSync(envState, { recursive: true, force: true }); rmSync(envProject, { recursive: true, force: true }); rmSync(path.join(path.resolve('state'), 'orchestrator-events', path.basename(envProject)), { recursive: true, force: true }); }

console.log('orchestrator-events.mjs tests passed');
