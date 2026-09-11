#!/usr/bin/env node
import { closeSync, constants as fsConstants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmdirSync, rmSync, unlinkSync, writeSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allowedCompletionOutcome, foldReviewHistory, normalizeReviewPlan, normalizeReviewVerdict, validateReviewIdentity } from '../../../../../extensions/pidex/review-budget.ts';
import { canonicalProjectIdentity, projectPlanSelectionLock } from '../../lib/project-key.mjs';
import { canonicalizeReviewOutcome, promoteTbr, writeTbr } from '../../../../../scripts/quality/tbr.mjs';
import { extractStructuredPayload, validateStructuredReviewOutcome } from '../../../../../scripts/quality/structured-review.mjs';
import { acquireProjectArchiveLock, resolveArchiveRoot } from '../../../../../modules/pidex/project-pipeline/scripts/project-pipeline/archive-sync.mjs';
import { acquireProjectTbrLock, projectTbrLockPath } from '../../lib/tbr-lock.mjs';
import { resolveStateRoot } from '../../lib/state-root.mjs';
import { RECOVERY_SCHEMA } from '../../../../../scripts/runtime/closeout-receipt.mjs';
import { createCloseoutRecovery, validateCloseoutRequest, describeCloseoutRecovery } from '../../../../../scripts/runtime/closeout-recovery.mjs';
import { inspectExecution } from '../../../../../scripts/runtime/review-execution.mjs';
import { readBounded, safePath } from '../../../../../scripts/runtime/io.mjs';
import { CLOSEOUT_SCHEMA, CLOSEOUT_START, CLOSEOUT_END, CLOSEOUT_PUBLISHERS, POST_RETRO_AGENTS, foldCloseoutObligations, assertCloseoutObligationsComplete, closeoutHash, closeoutArtifactPath, closeoutResultRouting } from '../../../../../scripts/runtime/closeout-obligations.mjs';
// Plan 059 Slice 3 (AD-6): archive-only Project Pipeline completion reuses the
// existing external archive lock framework from the project-pipeline module (no
// second lock framework, no circular module authority — archive-sync.mjs only
// imports registry.mjs, never this module). The boundary composes the project TBR
// serialization lock then the external archive lock (TBR -> archive -> selection
// -> gate) for archive-only authority so the atomic archive swap cannot rename the
// root mid-write.

const TERMINAL_EVENTS = new Set(['pipeline_completed', 'pipeline_failed', 'pipeline_aborted', 'pipeline_cancelled']);

function rootFromScript() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'); }
function slug(value, max = 160) { return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'unknown'; }
export function normalizePlan(value) { const s = String(value || '').trim(); return normalizeReviewPlan(s) ?? slug(s || 'unknown-plan', 80); }
function timestampId() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function parse(argv) {
  const out = { root: rootFromScript(), stateDir: resolveStateRoot({ root: rootFromScript() }), project: '', projectSlug: '', pipelineId: process.env.RUNNING_PI_PIPELINE_ID || '', plan: 'unknown-plan', event: '', status: '', actor: 'orchestrator', message: '', source: 'manual', projectMode: '', testProject: undefined, metadataJson: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const v = () => argv[++i] || '';
    if (a === '--project') out.project = v(); else if (a === '--state-dir') out.stateDir = v(); else if (a === '--project-slug' || a === '--slug') out.projectSlug = v(); else if (a === '--pipeline-id') out.pipelineId = v(); else if (a === '--plan') out.plan = v(); else if (a === '--event' || a === '--event-type') out.event = v(); else if (a === '--status') out.status = v(); else if (a === '--actor') out.actor = v(); else if (a === '--message') out.message = v(); else if (a === '--source') out.source = v(); else if (a === '--project-mode') out.projectMode = v(); else if (a === '--test-project') { const value = v().toLowerCase(); if (!['true', 'false'].includes(value)) throw new Error('--test-project requires true or false'); out.testProject = value === 'true'; } else if (a === '--confirm-closeout') out.confirmTerminal = true; else if (a === '--metadata-json') out.metadataJson = v(); else if (a === '-h' || a === '--help') { out.help = true; } else throw new Error(`Unknown arg: ${a}`);
  }
  out.stateDir ||= path.join(out.root, 'state');
  if (!out.project) out.project = process.cwd();
  if (!out.event && !out.help) throw new Error('Missing required --event');
  return out;
}
function runOptional(command, args, options) { try { const cp = spawnSync(command, args, options); if (cp.stdout?.trim()) console.log(cp.stdout.trim()); if (cp.status !== 0 && (cp.stderr || cp.stdout)) console.error((cp.stderr || cp.stdout).trim()); } catch (error) { console.error(`${path.basename(args[0] || command)} failed: ${error instanceof Error ? error.message : String(error)}`); } }

function readReviewRows(stream) {
  if (!existsSync(stream)) return [];
  const text = readFileSync(stream, 'utf8');
  if (!text.trim()) return [];
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

function regularFile(file) {
  try { return lstatSync(file).isFile(); } catch { return false; }
}

function currentPointerFile(current) {
  try {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('REVIEW_HISTORY_INVALID');
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    if (error?.message === 'REVIEW_HISTORY_INVALID') throw error;
    throw new Error('REVIEW_HISTORY_UNAVAILABLE');
  }
}

function assertAuthorityBase(eventsRoot, base) {
  if (path.dirname(base) !== eventsRoot) throw new Error('REVIEW_HISTORY_INVALID');
  if (existsSync(base) && !lstatSync(base).isDirectory()) throw new Error('REVIEW_HISTORY_INVALID');
}

function authorityAtBase(base, canonicalProject, planId, legacy = false) {
  const current = path.join(base, `${planId}.current`);
  if (!currentPointerFile(current)) return null;
  let pipelineId;
  try { pipelineId = readFileSync(current, 'utf8').trim(); }
  catch { throw new Error('REVIEW_HISTORY_UNAVAILABLE'); }
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(pipelineId)) throw new Error('REVIEW_HISTORY_INVALID');
  const stream = path.join(base, `${pipelineId}.jsonl`);
  if (!regularFile(stream)) throw new Error('REVIEW_HISTORY_INVALID');
  const rows = readReviewRows(stream);
  const pipelineRoots = rows.filter((row) => row?.event_type === 'pipeline_started' && row?.pipeline_id === pipelineId && row?.plan_key === planId);
  const roots = legacy
    ? pipelineRoots.filter((row) => {
      if (typeof row?.project_path !== 'string') throw new Error('REVIEW_HISTORY_INVALID');
      let rootProject;
      try { rootProject = canonicalProjectIdentity(row.project_path).canonicalProject; }
      catch { throw new Error('REVIEW_HISTORY_INVALID'); }
      return rootProject === canonicalProject;
    })
    : pipelineRoots.filter((row) => row?.project_path === canonicalProject);
  if (legacy && pipelineRoots.length > 0 && roots.length === 0) return null;
  if (roots.length !== 1 || rows.some((row) => TERMINAL_EVENTS.has(row?.event_type) && row?.pipeline_id === pipelineId && row?.plan_key === planId)) throw new Error('REVIEW_HISTORY_INVALID');
  return { base, current, stream, pipelineId, rows };
}

function legacyAuthorities(eventsRoot, hashedBase, canonicalProject, planId) {
  if (!existsSync(eventsRoot)) return [];
  const matches = [];
  for (const entry of readdirSync(eventsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || path.join(eventsRoot, entry.name) === hashedBase) continue;
    const authority = authorityAtBase(path.join(eventsRoot, entry.name), canonicalProject, planId, true);
    if (authority) matches.push(authority);
  }
  return matches;
}

function resolvePipelineAuthority({ stateDir, project, planId, allowCreate = false }) {
  const normalizedPlan = normalizePlan(planId);
  const { canonicalProject, projectKey } = canonicalProjectIdentity(project);
  const eventsRoot = path.join(path.resolve(stateDir), 'pipeline-events');
  const hashedBase = path.join(eventsRoot, projectKey);
  assertAuthorityBase(eventsRoot, hashedBase);
  const hashedCurrent = path.join(hashedBase, `${normalizedPlan}.current`);
  const hashed = authorityAtBase(hashedBase, canonicalProject, normalizedPlan);
  if (hashed) return { ...hashed, canonicalProject, projectKey, planId: normalizedPlan, legacy: false, eventsRoot };
  const legacy = legacyAuthorities(eventsRoot, hashedBase, canonicalProject, normalizedPlan);
  if (legacy.length === 1 && !allowCreate) return { ...legacy[0], canonicalProject, projectKey, planId: normalizedPlan, legacy: true, eventsRoot };
  if (legacy.length !== 0) throw new Error('REVIEW_HISTORY_INVALID');
  if (!allowCreate) throw new Error('REVIEW_AUTHORITY_NOT_FOUND');
  return { base: hashedBase, current: hashedCurrent, canonicalProject, projectKey, planId: normalizedPlan, legacy: false, eventsRoot };
}

const SELF_PROCESS_START = `opaque-${process.pid}-${Math.floor(Date.now() - process.uptime() * 1000)}`;
function processStart(pid) {
  try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19] || null; }
  catch { return pid === process.pid ? SELF_PROCESS_START : null; }
}
function ownerProvenDead(owner) {
  try { process.kill(owner.pid, 0); } catch (error) { return error?.code === 'ESRCH'; }
  const currentStart = processStart(owner.pid); return Boolean(currentStart && currentStart !== owner.processStart);
}
function sleep(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function lockOwner(key, identity) { return { pid: process.pid, processStart: processStart(process.pid), key, ...(identity ? { identity } : {}) }; }
function validOwner(value, requireIdentity) { return value && Number.isInteger(value.pid) && value.pid > 0 && typeof value.processStart === 'string' && value.processStart.length > 0 && value.processStart.length <= 128 && ((typeof value.key === 'string' && value.key.length <= 256) || (requireIdentity && validateReviewIdentity(value.identity).ok)) && (!requireIdentity || validateReviewIdentity(value.identity).ok); }
function writeLockOwner(lock, key, identity) {
  const owner = lockOwner(key, identity); if (!owner.processStart) throw new Error('process start identity unavailable');
  writeNewFileDurable(path.join(lock, 'owner.json'), JSON.stringify(owner), 0o600);
}
function takeLock(lock, key, identity, unavailableCode) {
  const deadline = Date.now() + 1000; const requireIdentity = Boolean(identity); const uncertainCode = unavailableCode.replace(/_UNAVAILABLE$/, '_UNCERTAIN');
  while (true) {
    let created = false;
    try { mkdirSync(lock, { mode: 0o700 }); created = true; writeLockOwner(lock, key, identity); return { held: true }; }
    catch (error) {
      if (created) { try { rmSync(lock, { recursive: true, force: true }); } catch {} throw error; }
      if (error?.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8')); }
      catch (readError) {
        // Owner.json not yet durable while the creator is mid-acquisition (transient
        // contention): keep waiting until the deadline. Malformed or unreadable owner
        // content fails closed with UNCERTAIN and never takes over by mtime/staleness.
        if (readError?.code === 'ENOENT' && Date.now() < deadline) { sleep(10); continue; }
        return { held: false, code: uncertainCode };
      }
      if (!validOwner(owner, requireIdentity)) return { held: false, code: uncertainCode };
      if (ownerProvenDead(owner)) return { held: false, code: uncertainCode };
      if (Date.now() >= deadline) return { held: false, code: unavailableCode };
      sleep(10);
    }
  }
}
function releaseLock(lock) { unlinkSync(path.join(lock, 'owner.json')); rmdirSync(lock); }

// Plan 059 Slice 2 (AD-3): binding global lock order is TBR serialization lock ->
// external Project Archive lock (Slice 3) -> lifecycle plan-selection lock ->
// lifecycle review-gate lock. Slice 2 host scope participates with TBR -> selection
// -> gate. The in-process assertion detects same-operation order violations before
// any acquisition (no caller may hold a later lock and request an earlier one);
// cross-process serialization is guaranteed by the lock files themselves. Owner
// semantics stay fail-closed via takeLock: malformed, dead-but-unproven, or
// unreadable owners never take over by mtime or staleness.
//
// Order tracking is scoped per operation (AsyncLocalStorage) so opposing
// concurrent in-process operations contend on the lock files instead of failing
// the assertion against a sibling operation's held locks. Nested callers (the
// completion boundary -> recordReviewCompletion) join the enclosing operation's
// context, so the TBR -> selection -> gate sequence is asserted as one chain.
const LOCK_ORDER = { tbr: 0, archive: 1, selection: 2, gate: 3 };
const lockContext = new AsyncLocalStorage();
function heldLocksOf() { const held = lockContext.getStore(); return held instanceof Set ? held : null; }
function withLockContext(fn) {
  if (lockContext.getStore() !== undefined) return fn();
  return lockContext.run(new Set(), fn);
}
function acquireLockOrdered(category, acquire) {
  const held = heldLocksOf() ?? new Set();
  const rank = LOCK_ORDER[category];
  if ([...held].some((heldCategory) => LOCK_ORDER[heldCategory] > rank)) throw new Error("REVIEW_LOCK_ORDER_VIOLATION");
  const result = acquire();
  if (result.held) held.add(category);
  return result;
}
function releaseLockOrdered(category, lock) {
  try { releaseLock(lock); } finally { const held = heldLocksOf(); if (held) held.delete(category); }
}
// External archive lock wrapper (AD-6): the archive lock is acquired inside the
// same per-operation context after the TBR lock and before any selection lock, so
// the global order TBR -> archive -> selection -> gate is asserted as one chain.
// The acquire result shape differs from takeLock ({ ok, release }), so release is
// routed to the archive lock's own owner-token-verified release().
function acquireArchiveLockOrdered(acquire) {
  const held = heldLocksOf() ?? new Set();
  const rank = LOCK_ORDER.archive;
  if ([...held].some((heldCategory) => LOCK_ORDER[heldCategory] > rank)) throw new Error('REVIEW_LOCK_ORDER_VIOLATION');
  const result = acquire();
  if (result.ok) held.add('archive');
  return result;
}
function releaseArchiveLockOrdered(lock) {
  try { lock.release(); } finally { const held = heldLocksOf(); if (held) held.delete('archive'); }
}

function selectionLocation(stateDir, project, planId) {
  const identity = canonicalProjectIdentity(project); const normalizedPlan = normalizePlan(planId);
  return { ...identity, planId: normalizedPlan, lock: projectPlanSelectionLock(stateDir, identity.projectKey, normalizedPlan) };
}
function takeSelectionLock(stateDir, project, planId) {
  const selection = selectionLocation(stateDir, project, planId); const eventsRoot = path.dirname(selection.lock);
  if (existsSync(eventsRoot) && !lstatSync(eventsRoot).isDirectory()) throw new Error('REVIEW_HISTORY_INVALID');
  mkdirSync(eventsRoot, { recursive: true });
  const result = acquireLockOrdered('selection', () => takeLock(selection.lock, `${selection.projectKey}|${selection.planId}`, undefined, 'REVIEW_SELECTION_LOCK_UNAVAILABLE'));
  return { ...selection, ...result };
}

// Project-scoped external TBR serialization lock (AD-3): keyed by canonical project
// root identity (projectKey), located beneath stateDir/pipeline-events so it stays
// external to replaceable project/archive content. Every shared-index writer
// (completion TBR writes, promoteTbr, archive carry validation) must hold it. The
// acquisition itself is the single shared implementation in lib/tbr-lock.mjs so
// the lifecycle boundary and archive sync contend on the identical lock file with
// identical fail-closed owner semantics (no second lock framework).
function takeTbrLock(stateDir, project) {
  const lock = projectTbrLockPath({ stateDir, project });
  const eventsRoot = path.dirname(lock);
  if (existsSync(eventsRoot) && !lstatSync(eventsRoot).isDirectory()) throw new Error('REVIEW_HISTORY_INVALID');
  mkdirSync(eventsRoot, { recursive: true });
  const result = acquireLockOrdered('tbr', () => acquireProjectTbrLock({ stateDir, project, lockTimeoutMs: 1000 }));
  return { lock, ...result };
}

// Shared lock-aware wrapper: runs fn under the project TBR lock and releases it in
// reverse order. Used by promoteTbr (Slice 2) and later by archive carry validation
// (Slice 3) which composes TBR -> archive lock externally.
export function withProjectTbrLock({ stateDir, project }, fn) {
  return withLockContext(() => {
    const tbrLock = takeTbrLock(stateDir, project);
    if (!tbrLock.held) return { ok: false, code: tbrLock.code };
    try { return fn(canonicalProjectIdentity(project).canonicalProject); }
    finally { releaseLockOrdered('tbr', tbrLock.lock); }
  });
}

// promoteTbr joins the shared TBR serialization scope through the lock-aware wrapper
// (AD-3; no mtime/stale takeover, no Slice 3 archive lock involved here).
export function promoteTbrLocked({ stateDir, project, ...rest }) {
  return withProjectTbrLock({ stateDir, project }, (root) => promoteTbr({ root, ...rest }));
}

function writeNewFileDurable(file, content, mode = 0o600) {
  const fd = openSync(file, 'wx', mode);
  try { const payload = Buffer.from(content); let offset = 0; while (offset < payload.length) { const written = writeSync(fd, payload, offset, payload.length - offset); if (!Number.isInteger(written) || written <= 0) throw new Error('lifecycle short write'); offset += written; } fsyncSync(fd); }
  finally { closeSync(fd); }
}

function appendReviewEvent(stream, event_type, metadata) {
  appendRecordDurable(stream, { timestamp: new Date().toISOString(), event_type, metadata });
}
function appendRecordDurable(stream, record) {
  const payload = Buffer.from(`${JSON.stringify(record)}\n`); const fd = openSync(stream, 'a');
  try { let offset = 0; while (offset < payload.length) { const written = writeSync(fd, payload, offset, payload.length - offset); if (!Number.isInteger(written) || written <= 0) throw new Error('review lifecycle short write'); offset += written; } fsyncSync(fd); }
  finally { closeSync(fd); }
}

function bindReviewRoot(authority, identity) {
  if (!authority?.stream || authority.pipelineId !== readFileSync(authority.current, 'utf8').trim()) return { code: 'REVIEW_HISTORY_INVALID' };
  const rootRows = readReviewRows(authority.stream);
  for (const name of readdirSync(authority.base)) {
    if (!name.endsWith('.jsonl') || name === path.basename(authority.stream)) continue;
    const candidate = path.join(authority.base, name);
    if (!regularFile(candidate)) return { code: 'REVIEW_HISTORY_INVALID' };
    let rows; try { rows = readReviewRows(candidate); } catch { return { code: 'REVIEW_HISTORY_INVALID' }; }
    if (rows.some((row) => row?.metadata?.planId === identity.planId && row?.metadata?.reviewGate === identity.reviewGate)) return { code: 'REVIEW_HISTORY_INVALID' };
  }
  return { stream: authority.stream, pipelineId: authority.pipelineId, rows: rootRows };
}
function reviewLock(authority, identity) { return path.join(authority.base, `.review-${identity.planId}-${identity.reviewGate}.lock`); }
function releasePair(gateLock, selectionLock) {
  let uncertain = false; try { if (gateLock) releaseLockOrdered('gate', gateLock); } catch { uncertain = true; }
  try { if (selectionLock) releaseLockOrdered('selection', selectionLock); } catch { uncertain = true; }
  return !uncertain;
}
function lifecycleErrorResult(error) {
  if (['REVIEW_HISTORY_INVALID', 'REVIEW_AUTHORITY_NOT_FOUND'].includes(error?.message)) return { status: 'denied', code: 'REVIEW_HISTORY_INVALID' };
  if (error?.message === 'REVIEW_CANONICAL_PROJECT_UNAVAILABLE') return { status: 'denied', code: error.message };
  if (error?.message === 'REVIEW_LOCK_ORDER_VIOLATION') return { status: 'denied', code: 'REVIEW_LOCK_ORDER_VIOLATION' };
  return { status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' };
}

// Shared selection -> gate -> root mutation context (DRY): acquires the canonical
// lock pair in order and binds the review root. Releases both on any acquisition
// failure so callers never manage partial lock state; a thrown acquisition error
// is also cleaned up here before propagation.
function reviewMutationContext(stateDir, project, identity) {
  let selection; let gate;
  try {
    selection = takeSelectionLock(stateDir, project, identity.planId);
    if (!selection.held) return { error: { status: 'unavailable', code: selection.code } };
    const authority = resolvePipelineAuthority({ stateDir, project, planId: identity.planId });
    gate = reviewLock(authority, identity);
    const held = acquireLockOrdered('gate', () => takeLock(gate, identity.attemptId, identity, 'REVIEW_LOCK_UNAVAILABLE'));
    if (!held.held) { releaseLockOrdered('selection', selection.lock); return { error: { status: 'unavailable', code: held.code } }; }
    return { selection, gate, root: bindReviewRoot(authority, identity) };
  } catch (error) {
    if (gate) releasePair(gate, selection.lock); else if (selection?.held) releaseLockOrdered('selection', selection.lock);
    throw error;
  }
}

// Pre-acceptance transient launch failure is recorded exactly once per attempt
// with the fixed nullable evidence shape and a retryable/exhausted typed result.
const FAILED_TO_START_EVIDENCE = { exitCode: null, timedOut: false, turnLimitHit: false, finalTextPresent: false, routingPresent: false, artifactPresent: false };
function recordFailedToStart(root, reservation, physical) {
  appendReviewEvent(root.stream, 'physical_outcome', { ...reservation.metadata, outcome: 'FAILED_TO_START_TRANSIENT', evidence: FAILED_TO_START_EVIDENCE });
  const attempt = reservation.physical || physical || {};
  return { status: attempt.physicalOrdinal === 1 ? 'exhausted' : 'retryable', outcome: 'FAILED_TO_START_TRANSIENT', ...attempt };
}

// Shared pre-spawn state classification + physical reservation for both start
// seams (host async + Project Pipeline sync): same fold contract, same events.
function reserveStateResult(state, resume) {
  if (state.status === 'denied' || state.status === 'uncertain') return state;
  if (state.status === 'abort_hold') return { status: 'held', reviewCompletion: { status: 'REVIEW_ABORTED' } };
  if (state.status === 'primary_hold' && !resume) return { status: 'held', reviewCompletion: { status: 'PRIMARY_REVIEW_UNAVAILABLE', holdId: state.holdId } };
  if (resume && state.status !== 'primary_hold') return { status: 'denied', code: 'REVIEW_RESUME_INVALID' };
  if (state.status === 'physical_accepted') return { ...state, status: 'uncertain', code: 'REVIEW_PHYSICAL_ACCEPTED_UNCERTAIN' };
  if (state.status === 'physical_exhausted') return { ...state, status: 'exhausted' };
  if (state.status === 'terminal' || state.status === 'spawn_accepted' || state.status === 'prepared' || state.status === 'expansion_pending') return { status: 'resumed', ...(state.status === 'terminal' ? { terminal: state.terminal } : {}) };
  return null;
}
function reviewStartReservation(root, identity, state, physical, resume) {
  const reservation = resume ? consumeReviewHold(root, identity, state, resume) : physicalReservation(identity, state, physical);
  if (!reservation.ok) return { denied: reservation.retry ? { status: 'retryable', ...reservation.retry } : { status: 'denied', code: resume ? 'REVIEW_RESUME_INVALID' : 'REVIEW_PHYSICAL_ATTEMPT_INVALID' } };
  if (state.status === 'allowed' || state.status === 'resume_reserved' || state.status === 'physical_retry' || resume) appendReviewEvent(root.stream, 'start_reserved', reservation.metadata);
  appendReviewEvent(root.stream, 'spawn_entered', reservation.metadata);
  return { reservation };
}

const IDENTITY_MATCH_KEYS = ['runFamilyId', 'planId', 'reviewGate', 'reviewMode', 'attemptId'];
function matchesIdentity(metadata, identity) { return Boolean(metadata) && IDENTITY_MATCH_KEYS.every((key) => metadata[key] === identity[key]); }

// BD-62-03: FAILED_TO_START_TRANSIENT is valid only in the exact pre-acceptance
// 3-event grammar (start_reserved -> spawn_entered -> physical_outcome). The
// post-acceptance record seam accepts only outcomes that follow spawn_accepted.
const POST_ACCEPTANCE_PHYSICAL_OUTCOMES = new Set(['FAILED_TO_RUN', 'TIMED_OUT', 'TURN_LIMIT_HIT', 'MALFORMED_COMPLETION']);
export function deriveReviewPhysicalAttempt(identity, physicalGeneration, physicalOrdinal) {
  if (!validateReviewIdentity(identity).ok || !Number.isInteger(physicalGeneration) || physicalGeneration < 0 || !Number.isInteger(physicalOrdinal) || physicalOrdinal < 0 || physicalOrdinal > 1) return null;
  const physicalAttemptId = createHash('sha256').update([identity.runFamilyId, identity.planId, identity.reviewGate, identity.reviewMode, identity.attemptId, physicalGeneration, physicalOrdinal].join('|')).digest('hex');
  return { physicalGeneration, physicalOrdinal, physicalAttemptId };
}
function samePhysical(left, right) { return Boolean(left && right && left.physicalGeneration === right.physicalGeneration && left.physicalOrdinal === right.physicalOrdinal && left.physicalAttemptId === right.physicalAttemptId); }
function physicalReservation(identity, state, physical) {
  if (!physical) return { ok: true, metadata: identity };
  const expected = deriveReviewPhysicalAttempt(identity, physical.physicalGeneration, physical.physicalOrdinal);
  if (!samePhysical(expected, physical)) return { ok: false };
  if (state.status === 'allowed' && expected.physicalGeneration === 0 && expected.physicalOrdinal === 0) return { ok: true, metadata: { ...identity, ...expected } };
  if (state.status === 'physical_retry') {
    if (expected.physicalGeneration === state.physicalGeneration && expected.physicalOrdinal === state.physicalOrdinal) return { ok: true, metadata: { ...identity, ...expected } };
    return { ok: false, retry: { physicalGeneration: state.physicalGeneration, physicalOrdinal: state.physicalOrdinal } };
  }
  return { ok: false };
}
function consumeReviewHold(root, identity, state, resume) {
  if (!resume || resume.resumeConfirmed !== true || !/^hold-[a-f0-9]{32}$/.test(String(resume.resumeHoldId || '')) || state.status !== 'primary_hold' || resume.resumeHoldId !== state.holdId) return { ok: false };
  const physical = deriveReviewPhysicalAttempt(identity, state.physicalGeneration + 1, 0);
  if (!physical) return { ok: false };
  appendReviewEvent(root.stream, 'review_resume_authorized', { ...identity, holdId: state.holdId });
  appendReviewEvent(root.stream, 'review_resume_consumed', { ...identity, holdId: state.holdId });
  return { ok: true, metadata: { ...identity, ...physical }, physical };
}

export function resolvePlanReviewAuthority({ stateDir, project, planId }) {
  return withLockContext(() => {
    const normalizedPlan = normalizePlan(planId);
    const selection = takeSelectionLock(stateDir, project, normalizedPlan); if (!selection.held) throw new Error(selection.code);
    try { const authority = resolvePipelineAuthority({ stateDir, project, planId: normalizedPlan }); return { ...authority, rows: readReviewRows(authority.stream) }; }
    finally { releaseLockOrdered('selection', selection.lock); }
  });
}

// Shared lock-context mutation wrapper: acquires selection -> gate -> root, runs
// the mutation, releases the pair, and maps lifecycle failures. Callers never
// manage partial lock state and cannot skip release.
function withReviewMutation(stateDir, project, identity, mutate) {
  return withLockContext(() => {
    let result;
    try {
      const ctx = reviewMutationContext(stateDir, project, identity);
      if (ctx.error) return ctx.error;
      result = ctx.root.code ? { status: 'denied', code: ctx.root.code } : mutate(ctx);
      if (!releasePair(ctx.gate, ctx.selection.lock)) return { status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' };
      return result;
    } catch (error) { return lifecycleErrorResult(error); }
  });
}

// Shared pre-dispatch classification + reservation for both start seams: returns
// a terminal/denied result or the reserved attempt to launch.
function reviewStartClassified(ctx, identity, physical, resume) {
  const state = foldReviewHistory(ctx.root.rows, identity);
  const classified = reserveStateResult(state, resume);
  if (classified) return { result: classified };
  const reserved = reviewStartReservation(ctx.root, identity, state, physical, resume);
  if (reserved.denied) return { result: reserved.denied };
  return { reservation: reserved.reservation };
}

export function reserveReviewStart({ stateDir, project, pipelineId, identity, physical, resume, start }) {
  if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return { status: 'denied' };
  return withReviewMutation(stateDir, project, identity, (ctx) => {
    const classified = reviewStartClassified(ctx, identity, physical, resume);
    if (classified.result) return classified.result;
    let started;
    try { started = start(); }
    catch { return recordFailedToStart(ctx.root, classified.reservation, physical); }
    if (started && typeof started.then === 'function') throw new Error('OS-start seam must return synchronously');
    appendReviewEvent(ctx.root.stream, 'spawn_accepted', classified.reservation.metadata);
    return { status: 'accepted', started, ...(classified.reservation.physical || physical || {}) };
  });
}

export function reserveReviewStartAsync({ stateDir, project, pipelineId, identity, physical, resume, start }) {
  return withLockContext(() => {
    if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return Promise.resolve({ status: 'denied' });
    try {
      const ctx = reviewMutationContext(stateDir, project, identity);
      if (ctx.error) return Promise.resolve(ctx.error);
      const releaseThen = (value) => { releasePair(ctx.gate, ctx.selection.lock); return Promise.resolve(value); };
      if (ctx.root.code) return releaseThen({ status: 'denied', code: ctx.root.code });
      const classified = reviewStartClassified(ctx, identity, physical, resume);
      if (classified.result) return releaseThen(classified.result);
      const reservation = classified.reservation;
      const attemptMetadata = reservation.physical || physical || {};
      return new Promise((resolve) => {
        let child; let signalled = false; let finished = false;
        const finish = (result) => { if (finished) return; finished = true; if (!releasePair(ctx.gate, ctx.selection.lock)) { resolve({ status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' }); return; } resolve(result); };
        const accepted = (started) => finish({ status: 'accepted', started, ...attemptMetadata });
        const failToStart = (error) => {
          if (/^REVIEW_EXECUTION_/.test(String(error?.message || ''))) { finish({ status: 'unavailable', code: error.message }); return; }
          try { finish(recordFailedToStart(ctx.root, reservation, physical)); } catch { finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); }
        };
        const processStarted = (evidence) => {
          if (signalled) throw new Error('REVIEW_SPAWN_ACCEPTANCE_DUPLICATE');
          signalled = true;
          try {
            if (evidence !== undefined && (!evidence || Object.keys(evidence).length !== 1 || !/^[a-f0-9]{64}$/.test(evidence.executionStartDigest))) throw new Error('REVIEW_EXECUTION_ACCEPTANCE_INVALID');
            appendReviewEvent(ctx.root.stream, 'spawn_accepted', { ...reservation.metadata, ...(evidence ?? {}) });
            if (child !== undefined) accepted(child);
          } catch {
            finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' });
            throw new Error('REVIEW_LIFECYCLE_UNAVAILABLE');
          }
        };
        try { child = start(processStarted, Object.freeze({ ...attemptMetadata })); if (signalled && !finished) accepted(child); Promise.resolve(child).catch(error => { if (!signalled) failToStart(error); }); }
        catch (error) { failToStart(error); }
      });
    } catch (error) { return Promise.resolve(lifecycleErrorResult(error)); }
  });
}

export function resumeReviewHold({ stateDir, project, pipelineId, identity, resumeHoldId, resumeConfirmed, start }) {
  if (resumeConfirmed !== true || !/^hold-[a-f0-9]{32}$/.test(String(resumeHoldId || ''))) return { status: 'denied', code: 'REVIEW_RESUME_INVALID' };
  return reserveReviewStart({ stateDir, project, pipelineId, identity, resume: { resumeHoldId, resumeConfirmed }, start });
}

export function recordReviewPhysicalOutcome({ stateDir, project, pipelineId, identity, physical, outcome, evidence = {} }) {
  if (!validateReviewIdentity(identity).ok || !POST_ACCEPTANCE_PHYSICAL_OUTCOMES.has(outcome)) return { status: 'denied', code: 'REVIEW_PHYSICAL_OUTCOME_INVALID' };
  const expected = deriveReviewPhysicalAttempt(identity, physical?.physicalGeneration, physical?.physicalOrdinal);
  if (!samePhysical(expected, physical)) return { status: 'denied', code: 'REVIEW_PHYSICAL_ATTEMPT_INVALID' };
  const safeEvidence = { exitCode: Number.isInteger(evidence.exitCode) ? evidence.exitCode : null, timedOut: evidence.timedOut === true, turnLimitHit: evidence.turnLimitHit === true, finalTextPresent: evidence.finalTextPresent === true, routingPresent: evidence.routingPresent === true, artifactPresent: evidence.artifactPresent === true };
  return withReviewMutation(stateDir, project, identity, (ctx) => {
    const state = foldReviewHistory(ctx.root.rows, identity);
    const duplicate = ctx.root.rows.find((candidate) => candidate?.event_type === 'physical_outcome' && candidate?.metadata?.outcome === outcome && samePhysical(candidate.metadata, physical) && matchesIdentity(candidate.metadata, identity));
    if (duplicate) return JSON.stringify(duplicate.metadata.evidence || {}) === JSON.stringify(safeEvidence) ? { status: physical.physicalOrdinal === 0 ? 'retryable' : 'exhausted' } : { status: 'denied', code: 'REVIEW_PHYSICAL_OUTCOME_CONFLICT' };
    if (state.status !== 'physical_accepted' || !samePhysical(state, physical)) return { status: 'denied', code: 'REVIEW_PHYSICAL_OUTCOME_INVALID' };
    appendReviewEvent(ctx.root.stream, 'spawn_returned', { ...identity, ...physical });
    appendReviewEvent(ctx.root.stream, 'physical_outcome', { ...identity, ...physical, outcome, evidence: safeEvidence });
    return { status: physical.physicalOrdinal === 0 ? 'retryable' : 'exhausted', outcome };
  });
}

export function recordReviewHold({ stateDir, project, pipelineId, identity, physical, status }) {
  if (!validateReviewIdentity(identity).ok || !['PRIMARY_REVIEW_UNAVAILABLE', 'REVIEW_ABORTED'].includes(status)) return { status: 'denied', code: 'REVIEW_HOLD_INVALID' };
  const expected = deriveReviewPhysicalAttempt(identity, physical?.physicalGeneration, physical?.physicalOrdinal);
  if (!samePhysical(expected, physical) || (status === 'PRIMARY_REVIEW_UNAVAILABLE' && physical.physicalOrdinal !== 1)) return { status: 'denied', code: 'REVIEW_HOLD_INVALID' };
  return withReviewMutation(stateDir, project, identity, (ctx) => {
    const state = foldReviewHistory(ctx.root.rows, identity);
    if (status === 'REVIEW_ABORTED' && state.status === 'abort_hold') return { status };
    if (status === 'PRIMARY_REVIEW_UNAVAILABLE' && state.status === 'primary_hold') return { status, holdId: state.holdId };
    if ((status === 'REVIEW_ABORTED' && state.status !== 'physical_accepted') || (status === 'PRIMARY_REVIEW_UNAVAILABLE' && (state.status !== 'physical_exhausted' || !samePhysical(state, physical)))) return { status: 'denied', code: `REVIEW_HOLD_STATE_${state.status}` };
    const holdId = status === 'PRIMARY_REVIEW_UNAVAILABLE' ? `hold-${createHash('sha256').update(JSON.stringify({ identity, physical, status })).digest('hex').slice(0, 32)}` : undefined;
    appendReviewEvent(ctx.root.stream, 'review_hold', { ...identity, ...physical, status, ...(holdId ? { holdId } : {}) });
    return holdId ? { status, holdId } : { status };
  });
}

// Internal host recovery seam: no caller-supplied exit/outcome or event rows.
// Selection + gate locks cover receipt validation and the complete transition.
export function reconcileReviewExecution({ stateDir, project, pipelineId, identity, actor, scope }) {
  if (!validateReviewIdentity(identity).ok || !/^[a-f0-9]{64}$/.test(scope ?? '')) return { status: 'denied', code: 'REVIEW_EXECUTION_IDENTITY_INVALID' };
  return withReviewMutation(stateDir, project, identity, ctx => {
    if (pipelineId !== ctx.root.pipelineId) return { status: 'denied', code: 'REVIEW_EXECUTION_MISMATCH' };
    const state = foldReviewHistory(ctx.root.rows, identity);
    if (state.status !== 'physical_accepted') return { status: 'not_pending' };
    const physical = deriveReviewPhysicalAttempt(identity, state.physicalGeneration, state.physicalOrdinal);
    const accepted = ctx.root.rows.findLast(row => row.event_type === 'spawn_accepted' && matchesIdentity(row.metadata, identity) && samePhysical(row.metadata, physical));
    const binding = { project: canonicalProjectIdentity(project).canonicalProject, pipelineId, identity, physical, actor, scope };
    const observed = inspectExecution(stateDir, binding, accepted?.metadata?.executionStartDigest);
    if (observed.status === 'aborted') {
      appendReviewEvent(ctx.root.stream, 'review_hold', { ...identity, ...physical, status: 'REVIEW_ABORTED', executionReceiptDigest: observed.receiptDigest });
      return { status: 'held', reviewCompletion: { status: 'REVIEW_ABORTED' } };
    }
    if (observed.status !== 'failed') return { status: observed.status === 'running' ? 'running' : 'uncertain', code: observed.code ?? 'REVIEW_EXECUTION_UNCONFIRMED' };
    const outcome = observed.reason === 'timeout' ? 'TIMED_OUT' : observed.reason === 'turn_limit' ? 'TURN_LIMIT_HIT' : 'FAILED_TO_RUN';
    const metadata = { ...identity, ...physical, executionReceiptDigest: observed.receiptDigest };
    appendReviewEvent(ctx.root.stream, 'spawn_returned', metadata);
    appendReviewEvent(ctx.root.stream, 'physical_outcome', { ...metadata, outcome, evidenceSource: 'supervisor_exit', evidence: { exitCode: observed.exitCode, timedOut: outcome === 'TIMED_OUT', turnLimitHit: outcome === 'TURN_LIMIT_HIT', finalTextPresent: false, routingPresent: false, artifactPresent: false } });
    return { status: 'reconciled', outcome, ...physical };
  });
}

export function recordReviewAbortHold({ stateDir, project, pipelineId, identity, physical }) {
  return recordReviewHold({ stateDir, project, pipelineId, identity, physical, status: 'REVIEW_ABORTED' });
}

export function recordReviewCompletion({ stateDir, project, pipelineId, identity, outcome, receipt: receiptExtra }) {
  if (!validateReviewIdentity(identity).ok || !allowedCompletionOutcome(identity, outcome)) return { status: 'denied' };
  return withReviewMutation(stateDir, project, identity, (ctx) => {
    const state = foldReviewHistory(ctx.root.rows, identity);
    if (state.status === 'terminal') return state.terminal === canonicalTerminalStatus(outcome) ? { status: 'resumed', terminal: state.terminal } : { status: 'denied' };
    if (state.status === 'uncertain') return state;
    if (state.status === 'expansion_pending') return outcome === 'USER_DECISION_REQUIRED' ? { status: 'USER_DECISION_REQUIRED' } : { status: 'denied' };
    if (state.status === 'prepared') {
      // Plan 059 Slice 2 crash rule: prepared-only and prepared+returned states resume
      // under the exact same receipt (identity + artifact digest + outcome digest +
      // intended outcome + TBR IDs); a differing duplicate receipt fails closed.
      const receipt = receiptMetadata(identity, outcome, receiptExtra);
      const existing = existingReceipt(ctx.root.rows, identity);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(receipt)) return { status: 'denied', code: 'REVIEW_RECEIPT_MISMATCH' };
      const identityRows = ctx.root.rows.filter((candidate) => matchesIdentity(candidate.metadata, identity));
      if (!identityRows.some((candidate) => candidate.event_type === 'spawn_returned')) appendReviewEvent(ctx.root.stream, 'spawn_returned', identity);
      if (!identityRows.some((candidate) => candidate.event_type === 'review_outcome')) appendReviewEvent(ctx.root.stream, 'review_outcome', { ...identity, outcome });
      return { status: outcome };
    }
    if (state.status !== 'spawn_accepted' && state.status !== 'physical_accepted') return { status: 'denied' };
    const physical = state.status === 'physical_accepted' ? deriveReviewPhysicalAttempt(identity, state.physicalGeneration, state.physicalOrdinal) : null;
    const metadata = physical ? { ...identity, ...physical } : identity;
    if (identity.reviewMode === 'review2' && outcome === 'CHANGES_REQUESTED') { appendReviewEvent(ctx.root.stream, 'spawn_returned', metadata); return { status: 'TBR_WRITE_BLOCKED' }; }
    // Uniform fixed-position receipt for every new lifecycle completion: after
    // spawn_accepted, before spawn_returned. Binds canonical identity, exact
    // artifact digest, canonical completion digest, intended outcome, stable TBR IDs.
    appendReviewEvent(ctx.root.stream, 'completion_prepared', { ...receiptMetadata(identity, outcome, receiptExtra), ...(physical || {}) });
    appendReviewEvent(ctx.root.stream, 'spawn_returned', metadata);
    appendReviewEvent(ctx.root.stream, 'review_outcome', { ...metadata, outcome });
    return { status: outcome };
  });
}

// Canonical terminal status mapping (security F-1): the completion boundary passes
// lifecycle outcomes (APPROVED / closed / CHANGES_REQUESTED / USER_DECISION_REQUIRED)
// while the fold derives canonical terminal statuses (accepted / closed). Terminal
// retries compare canonical forms so a direct same-identity retry after an accepted
// six-event terminal returns the same typed status instead of a false denied
// REVIEW_HISTORY_INVALID; outcomes whose canonical terminal differs still deny
// fail-closed (mismatched-outcome denial is never weakened).
function canonicalTerminalStatus(value) {
  if (value === 'APPROVED' || value === 'accepted') return 'accepted';
  return value;
}

function completionDigest(value) {
  return createHash('sha256').update(JSON.stringify(canonicalizeReviewOutcome(value))).digest('hex');
}
function receiptMetadata(identity, outcome, extra = {}) {
  return { ...identity, artifactDigest: extra.artifactDigest || '', outcomeDigest: extra.outcomeDigest || completionDigest(outcome), intendedOutcome: outcome, tbrIds: Array.isArray(extra.tbrIds) ? extra.tbrIds : [] };
}
function existingReceipt(rows, identity) {
  for (const candidate of rows) {
    if (candidate?.event_type !== 'completion_prepared' || !matchesIdentity(candidate.metadata, identity)) continue;
    return candidate.metadata;
  }
  return null;
}

const STRUCTURED_ARTIFACT_MAX_BYTES = 512 * 1024;

// Exact artifact read hardened against TOCTOU and hardlinks (Plan 059 Slice 2):
// path confinement walk (no symlink component), then descriptor-based no-follow open
// where portable (POSIX O_NOFOLLOW), fstat verification of the opened inode (regular
// file, size cap, nlink <= 1 so a hardlinked artifact cannot smuggle foreign bytes),
// and a path re-lstat identity check against the opened descriptor (dev+ino) to
// detect a swap after the walk. The digest is computed over the exact bytes read from
// the descriptor, closing the stat/read TOCTOU.
//
// Plan 059 Slice A (native-Windows correction): where numeric O_NOFOLLOW is
// unavailable (Windows), the read does NOT reject all artifacts and never claims
// no-follow semantics. The portable fallback re-verifies every confined component
// by pre-lstat (symlink/junction/non-regular/hardlink/oversize all fail closed),
// opens O_RDONLY, requires dev+ino identity between the walked inode and the
// opened descriptor (a path swapped after the walk fails closed), reads the exact
// bounded bytes from the descriptor, then verifies the opened inode is unchanged
// (post-fstat) and the path still resolves to the same non-symlink regular
// single-link file with the same dev+ino/size/mtime (post-lstat) plus canonical
// realpath containment before and after. Any uncertainty fails closed with the
// same typed codes as the POSIX path.
function structuredArtifact(root, artifactPath) {
  // QA blocker fix (native-Windows correction): any ':' in the artifact path is
  // rejected here, before path resolution or open — NTFS alternate data stream
  // (`file.md:evil`) and drive-like alternate syntax (`C:evil`) can never reach
  // the confined reader. PIDEX artifacts are review-outcome markdown relative
  // paths; a colon has no legitimate use.
  if (typeof artifactPath !== 'string' || !artifactPath || artifactPath.length > 1024 || path.isAbsolute(artifactPath) || path.win32.isAbsolute(artifactPath) || artifactPath.includes('\\') || artifactPath.includes(':') || artifactPath.split('/').includes('..')) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
  const resolved = path.resolve(root, artifactPath);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
  let current = root; let pre = null;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let stat; try { stat = lstatSync(current); } catch { return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' }; }
    if (stat.isSymbolicLink()) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
    pre = stat;
  }
  // Test seam (Plan 059 Slice A): PIDEX_ARTIFACT_FORCE_PORTABLE_READ forces the
  // portable no-O_NOFOLLOW path on POSIX so the native-Windows fallback contract
  // is exercised in CI. Production-inert: absent by default, zero behavior change.
  if (typeof fsConstants.O_NOFOLLOW === 'number' && process.env.PIDEX_ARTIFACT_FORCE_PORTABLE_READ !== '1') return readArtifactNofollow(resolved);
  return readArtifactPortable(root, resolved, pre);
}

// Shared bounded descriptor read (Plan 059 Slice A): reads the exact bytes of
// the already-open descriptor with a hard 512KiB bound, returning the exact byte
// buffer so the digest is computed over descriptor bytes only (stat/read TOCTOU
// closed). Used by both the POSIX no-follow path and the portable fallback.
function readDescriptorBounded(fd) {
  const chunks = []; const buffer = Buffer.alloc(64 * 1024); let total = 0; let offset = 0;
  while (true) {
    const n = readSync(fd, buffer, 0, buffer.length, offset);
    if (n <= 0) break;
    total += n; if (total > STRUCTURED_ARTIFACT_MAX_BYTES) return { ok: false, code: 'REVIEW_ARTIFACT_TOO_LARGE' };
    chunks.push(Buffer.from(buffer.subarray(0, n))); offset += n;
  }
  return { ok: true, bytes: Buffer.concat(chunks) };
}

// POSIX descriptor path: numeric O_NOFOLLOW retained unchanged (Plan 059 Slice A).
function readArtifactNofollow(resolved) {
  let fd;
  try { fd = openSync(resolved, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW); }
  catch { return { ok: false, code: 'REVIEW_ARTIFACT_UNAVAILABLE' }; }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
    if (opened.size > STRUCTURED_ARTIFACT_MAX_BYTES) return { ok: false, code: 'REVIEW_ARTIFACT_TOO_LARGE' };
    if (opened.nlink > 1) return { ok: false, code: 'REVIEW_ARTIFACT_HARDLINK' };
    let verify;
    try { verify = lstatSync(resolved); } catch { return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' }; }
    if (verify.dev !== opened.dev || verify.ino !== opened.ino) return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' };
    const read = readDescriptorBounded(fd); if (!read.ok) return read;
    return { ok: true, text: read.bytes.toString('utf8'), sha256: createHash('sha256').update(read.bytes).digest('hex') };
  } finally { closeSync(fd); }
}

// Portable descriptor path (native Windows, no numeric O_NOFOLLOW): every
// confined component and the artifact itself were already lstat-verified by the
// caller's walk (pre). Fail closed on non-regular/single-link/oversize, require
// dev+ino identity between the walked inode and the opened descriptor, read the
// exact bounded bytes from the descriptor, then verify the opened inode is
// unchanged (post-fstat) and the path still resolves to the same non-symlink
// regular single-link file with the same dev+ino/size/mtime (post-lstat) plus
// canonical realpath containment. Never claims O_NOFOLLOW semantics.
export function readArtifactPortable(root, resolved, pre) {
  if (!pre || pre.isSymbolicLink() || !pre.isFile()) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
  if (pre.nlink > 1) return { ok: false, code: 'REVIEW_ARTIFACT_HARDLINK' };
  if (pre.size > STRUCTURED_ARTIFACT_MAX_BYTES) return { ok: false, code: 'REVIEW_ARTIFACT_TOO_LARGE' };
  let canonicalRoot; let canonicalBefore;
  try { canonicalRoot = realpathSync(root); canonicalBefore = realpathSync(resolved); }
  catch { return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' }; }
  const beforeRelative = path.relative(canonicalRoot, canonicalBefore);
  if (beforeRelative === '..' || beforeRelative.startsWith(`..${path.sep}`) || path.isAbsolute(beforeRelative)) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
  let fd;
  try { fd = openSync(resolved, fsConstants.O_RDONLY); }
  catch { return { ok: false, code: 'REVIEW_ARTIFACT_UNAVAILABLE' }; }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
    if (opened.nlink > 1) return { ok: false, code: 'REVIEW_ARTIFACT_HARDLINK' };
    if (opened.size > STRUCTURED_ARTIFACT_MAX_BYTES) return { ok: false, code: 'REVIEW_ARTIFACT_TOO_LARGE' };
    if (opened.dev !== pre.dev || opened.ino !== pre.ino) return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' };
    const read = readDescriptorBounded(fd); if (!read.ok) return read;
    const after = fstatSync(fd);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.nlink !== opened.nlink || after.mtimeMs !== opened.mtimeMs) return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' };
    let verify;
    try { verify = lstatSync(resolved); } catch { return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' }; }
    if (verify.isSymbolicLink() || !verify.isFile() || verify.nlink > 1) return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' };
    if (verify.dev !== opened.dev || verify.ino !== opened.ino || verify.size !== opened.size || verify.mtimeMs !== opened.mtimeMs) return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' };
    let canonicalAfter;
    try { canonicalAfter = realpathSync(resolved); } catch { return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' }; }
    const afterRelative = path.relative(canonicalRoot, canonicalAfter);
    if (afterRelative === '..' || afterRelative.startsWith(`..${path.sep}`) || path.isAbsolute(afterRelative)) return { ok: false, code: 'REVIEW_ARTIFACT_CHANGED' };
    return { ok: true, text: read.bytes.toString('utf8'), sha256: createHash('sha256').update(read.bytes).digest('hex') };
  } finally { closeSync(fd); }
}

// Canonical contract-level completion boundary (Plan 059). Owns artifact confinement
// read, pidex-review-outcome-v1 parsing, strict validation, terminal matrix
// enforcement, ROUTING/structured-verdict agreement, TBR archival (immediate for
// non-final; all findings for final review2), uniform fixed-position completion
// receipt, lifecycle completion, and typed result construction.
//
// Typed results: accepted | CHANGES_REQUESTED | USER_DECISION_REQUIRED |
// CLOSED_WITH_TBR | resumed | denied(code) | unavailable(code).
//
// Lock order (AD-3): project TBR serialization lock -> plan-selection -> review-gate,
// all held for the completion write, released in reverse. Fail-closed owner
// semantics, no mtime takeover. Crash retry rules: terminal retries return the same
// terminal typed status without rewriting evidence; prepared-only and prepared+
// returned retries resume missing lifecycle appends under the exact same receipt;
// TBR write is idempotent byte-verified before any receipt.
// Legacy histories remain fold-valid; completion_prepared receipts are uniform for
// all new completions. Corrections (no structured payload) keep the legacy ROUTING
// path through recordReviewCompletion and receive a canonical completion digest.
export function completeStructuredReviewOutcome({ stateDir, project, pipelineId, identity, artifactPath, routingVerdict, routeTo, archive }) {
  return withLockContext(() => {
    try {
      if (!validateReviewIdentity(identity).ok) return { status: 'denied', code: 'REVIEW_IDENTITY_INVALID' };
      if (identity.reviewMode.startsWith('correction')) return { status: 'denied', code: 'REVIEW_OUTCOME_INVALID' };
      const routing = normalizeReviewVerdict(identity.reviewGate, routingVerdict);
      if (!routing) return { status: 'denied', code: 'REVIEW_OUTCOME_INVALID' };
      let canonicalProject;
      try { canonicalProject = canonicalProjectIdentity(project).canonicalProject; }
      catch { return { status: 'denied', code: 'REVIEW_CANONICAL_PROJECT_UNAVAILABLE' }; }
      // Plan 059 Slice 3 (requirement 6): archive-only authority must be the
      // freshly reloaded registry-derived archive root — no cwd/custom archive/URL
      // fallback may become TBR authority. The caller reloads the registry record
      // per call; this re-derivation fails closed if a stale/mismatched project
      // root ever reaches the boundary with an archive option.
      if (archive) {
        let expectedArchive;
        try { expectedArchive = path.resolve(resolveArchiveRoot({ pidexRoot: archive.pidexRoot, projectId: archive.projectId })); }
        catch { return { status: 'denied', code: 'REVIEW_PROJECT_AUTHORITY_CHANGED' }; }
        if (canonicalProject !== expectedArchive) return { status: 'denied', code: 'REVIEW_PROJECT_AUTHORITY_CHANGED' };
      }
      const artifact = structuredArtifact(canonicalProject, artifactPath);
      if (!artifact.ok) return { status: 'denied', code: artifact.code };
      const parsed = extractStructuredPayload(artifact.text);
      if (!parsed.ok) return { status: 'denied', code: parsed.code };
      const checked = validateStructuredReviewOutcome(parsed.value, identity.reviewGate, { archiveActive: identity.reviewMode === 'review2' });
      if (!checked.ok) return { status: 'denied', code: checked.code };
      if (checked.value.verdict !== routing) return { status: 'denied', code: 'STRUCTURED_ROUTING_MISMATCH' };
      // Intended lifecycle outcome (AD-2/AD-7): expansion stops as USER_DECISION_REQUIRED;
      // review2 in-contract rejection is terminal `closed`; approval closes accepted.
      let intendedOutcome;
      if (checked.value.expansion || checked.value.verdict === 'USER_DECISION_REQUIRED') intendedOutcome = 'USER_DECISION_REQUIRED';
      else if (checked.value.verdict === 'APPROVED') intendedOutcome = 'APPROVED';
      else if (identity.reviewMode === 'review2') intendedOutcome = 'closed';
      else intendedOutcome = 'CHANGES_REQUESTED';
      // Plan 059 Slice 4 (item 3): deterministic route_to agreement. A non-final
      // in-contract rejection must route to the gate's correction owner
      // (critic -> pidex-planner; code-review/security/qa -> pidex-implementer); a
      // ROUTING route_to naming any other target fails closed. Terminal
      // CLOSED_WITH_TBR and expansion USER_DECISION_REQUIRED override rejection
      // routes and never auto-correct, so they skip route enforcement entirely.
      const correctionOwner = identity.reviewGate === 'critic' ? 'pidex-planner' : 'pidex-implementer';
      if (intendedOutcome === 'CHANGES_REQUESTED' && routeTo !== correctionOwner) return { status: 'denied', code: 'REVIEW_ROUTE_MISMATCH' };
      if (!allowedCompletionOutcome(identity, intendedOutcome)) return { status: 'denied', code: 'REVIEW_OUTCOME_INVALID' };
      const findings = checked.value.expansion
        ? []
        : intendedOutcome === 'closed'
          ? [...checked.value.active, ...checked.value.immediateTbr].map((finding) => ({ ...finding, disposition: 'tbr_immediate' }))
          : checked.value.immediateTbr;
      const artifactDigest = artifact.sha256;
      const outcomeDigest = completionDigest(parsed.value);
      const tbrLock = takeTbrLock(stateDir, canonicalProject);
      if (!tbrLock.held) return { status: 'unavailable', code: tbrLock.code };
      let archiveLock;
      try {
        // Plan 059 Slice 3 (AD-6): archive-only authority holds the external
        // archive lock across the TBR write and lifecycle completion, acquired
        // after the TBR lock and before selection/gate. No write can land across
        // an atomic archive swap; TBRs written pre-swap survive via Slice 3 carry.
        if (archive) {
          archiveLock = acquireArchiveLockOrdered(() => acquireProjectArchiveLock({ pidexRoot: archive.pidexRoot, projectId: archive.projectId, operation: 'tbr-terminalization', lockTimeoutMs: archive.lockTimeoutMs }));
          if (!archiveLock.ok) return { status: 'unavailable', code: 'REVIEW_ARCHIVE_LOCK_UNAVAILABLE' };
        }
        let tbrIds = [];
        if (findings.length) {
          const written = writeTbr({ root: canonicalProject, identity, findings });
          if (!written?.ok) return { status: 'TBR_WRITE_BLOCKED', code: written?.code || 'TBR_WRITE_FAILED' };
          tbrIds = written.items.map((item) => item.stableTbrId);
        }
        const completion = recordReviewCompletion({ stateDir, project: canonicalProject, pipelineId, identity, outcome: intendedOutcome, receipt: { artifactDigest, outcomeDigest, tbrIds } });
        if (completion.status === 'resumed') {
          if (completion.terminal === 'closed') return { status: 'CLOSED_WITH_TBR', tbrIds };
          if (completion.terminal === 'accepted') return { status: 'accepted', tbrIds };
          return { status: 'resumed' };
        }
        if (completion.status === 'denied') return { status: 'denied', code: completion.code || 'REVIEW_HISTORY_INVALID' };
        if (completion.status === 'uncertain') return { status: 'denied', code: 'REVIEW_HISTORY_INVALID' };
        if (completion.status === 'unavailable') return { status: 'unavailable', code: completion.code || 'REVIEW_LIFECYCLE_UNAVAILABLE' };
        if (completion.status === intendedOutcome) {
          if (intendedOutcome === 'APPROVED') return { status: 'accepted', tbrIds };
          if (intendedOutcome === 'closed') return { status: 'CLOSED_WITH_TBR', tbrIds };
          if (intendedOutcome === 'USER_DECISION_REQUIRED') return { status: 'USER_DECISION_REQUIRED', disposition: checked.value.disposition };
          return { status: 'CHANGES_REQUESTED', tbrIds };
        }
        return { status: 'denied', code: 'REVIEW_COMPLETION_UNAVAILABLE' };
      } finally {
        if (archiveLock?.ok) releaseArchiveLockOrdered(archiveLock);
        releaseLockOrdered('tbr', tbrLock.lock);
      }
    } catch (error) {
      if (error?.message === 'REVIEW_LOCK_ORDER_VIOLATION') return { status: 'denied', code: 'REVIEW_LOCK_ORDER_VIOLATION' };
      return { status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' };
    }
  });
}

function eventAuthority({ stateDir, project, planId, event }) {
  try { return resolvePipelineAuthority({ stateDir, project, planId, allowCreate: event === 'pipeline_started' }); }
  catch (error) {
    if (TERMINAL_EVENTS.has(event) && ['REVIEW_HISTORY_INVALID', 'REVIEW_AUTHORITY_NOT_FOUND'].includes(error?.message)) throw new Error(`Terminal event ${event} for project=${path.basename(project)} plan=${planId} has no active pipeline id`);
    throw error;
  }
}

function eventPipelineId(options, authority, planId, isStart) {
  if (isStart) return slug(options.pipelineId || `${options.projectSlug || path.basename(authority.canonicalProject)}-${planId}-${timestampId()}`);
  if (options.pipelineId && slug(options.pipelineId) !== authority.pipelineId) throw new Error('pipeline id does not match active authority');
  return authority.pipelineId;
}

function buildPipelineRecord(options, authority, pipelineId, planId, event) {
  return {
    timestamp: new Date().toISOString(), project_path: authority.canonicalProject,
    project_slug: options.projectSlug || path.basename(authority.canonicalProject), pipeline_id: pipelineId,
    plan_key: planId, event_type: event, status: options.status || null, actor: options.actor || null,
    message: options.message || null, project_mode: options.projectMode || null,
    ...(typeof options.testProject === 'boolean' ? { is_test_project: options.testProject } : {}),
    metadata: options.metadata ?? null, source: options.source || null,
  };
}

function persistPipelineRecord(authority, pipelineId, record, isStart) {
  const outPath = path.join(authority.base, `${pipelineId}.jsonl`);
  if (!isStart) { appendRecordDurable(outPath, record); return outPath; }
  writeNewFileDurable(outPath, `${JSON.stringify(record)}\n`);
  try { writeNewFileDurable(authority.current, pipelineId); }
  catch (error) { try { unlinkSync(outPath); } catch {} throw error; }
  return outPath;
}

// Production host boundary is the producer. The generic event CLI cannot write
// these reserved rows. A closure binds return processing to this admitted run;
// a lost publisher/consumer return remains pending, never implicitly waived.
export function beginHostCloseoutDispatch({ stateDir, project, planId, actor } = {}) {
  if (!CLOSEOUT_PUBLISHERS.has(actor) && !POST_RETRO_AGENTS.has(actor)) return null;
  const canonical = canonicalTerminalBase(stateDir, project);
  const active = existsSync(canonical.base) ? readdirSync(canonical.base).filter(n => /^plan-[0-9]+\.current$/.test(n)).map(n => n.slice(0, -8)) : [];
  if (!active.length) return null; // standalone calls are not pipeline closeout
  if (!planId || planId === 'unknown-plan') {
    if (active.length !== 1) throw new Error('PIPELINE_CLOSEOUT_PLAN_AMBIGUOUS');
    planId = active[0];
  }
  const ctx = { stateDir, project: canonical.canonicalProject, planId };
  const mutate = fn => withLockContext(() => {
    const selection = takeSelectionLock(stateDir, project, planId); if (!selection.held) throw new Error(selection.code);
    try {
      let authority;
      try { authority = resolvePipelineAuthority({ ...ctx }); }
      catch (error) {
        if (error?.message === 'REVIEW_AUTHORITY_NOT_FOUND') throw new Error(`REVIEW_AUTHORITY_NOT_FOUND: requested_plan=${planId}; observed_active_plans=${active.join(',')}; no dispatch admitted. Verify the handoff's explicit Plan: NNN header against its intended opening record; do not change or repair authority.`);
        throw error;
      }
      if (authority.base !== canonical.base) throw new Error('PIPELINE_CLOSEOUT_LEGACY_UNCOVERED');
      return fn(authority, { project: ctx.project, planId, pipelineId: authority.pipelineId });
    } finally { releaseLockOrdered('selection', selection.lock); }
  });
  const admitted = mutate((authority, binding) => {
    const state = foldCloseoutObligations(authority.rows, binding);
    if ([...state.dispatches.values()].some(d => d.actor === actor && d.schema === RECOVERY_SCHEMA)) throw new Error('PIPELINE_CLOSEOUT_ALREADY_DISPATCHED');
    if ([...state.dispatches.values()].some(d => d.status === 'running' && (d.actor === actor || (CLOSEOUT_PUBLISHERS.has(actor) && CLOSEOUT_PUBLISHERS.has(d.actor))))) throw new Error('PIPELINE_CLOSEOUT_DISPATCH_PENDING');
    if (actor === 'pidex-retrospective' && [...state.obligations.values()].some(o => o.status === 'pending')) throw new Error('PIPELINE_CLOSEOUT_OBLIGATIONS_PENDING');
    const consumes = [...state.obligations.values()].filter(o => o.status === 'pending' && o.actor === actor);
    if (actor === 'pidex-pi' && !consumes.length && [...state.obligations.values()].some(o => o.status === 'pending')) throw new Error('PIPELINE_CLOSEOUT_HANDOFF_NOT_REQUIRED');
    if (!CLOSEOUT_PUBLISHERS.has(actor) && !consumes.length) {
      if (state.dispatches.size) throw new Error('PIPELINE_CLOSEOUT_HANDOFF_NOT_REQUIRED');
      return null;
    }
    const id = randomUUID(); const roundId = consumes[0]?.roundId ?? id;
    const metadata = { schema: CLOSEOUT_SCHEMA, ...binding, id, actor, roundId, consumes: consumes.map(o => o.id) };
    const row = { event_type: CLOSEOUT_START, metadata };
    foldCloseoutObligations([...authority.rows, row], binding); // includes overlap/round checks
    appendRecordDurable(authority.stream, { timestamp: new Date().toISOString(), ...row });
    return { metadata, consumes };
  });
  if (!admitted) return null;
  const { metadata } = admitted;
  let finished = false;
  return {
    id: metadata.id,
    instruction: '\nFor THIS invocation only (other calls have different IDs), in BOTH final chat and artifact ROUTING echo exactly closeout_dispatch: ' + metadata.id + '\nand closeout_obligations: ' + (metadata.consumes.join(', ') || 'none') + '\n' + (CLOSEOUT_PUBLISHERS.has(actor)
      ? '\nPIDEX CLOSEOUT CONTRACT: In BOTH final chat ROUTING and artifact ROUTING, explicitly include post_retro_handoffs: none OR a comma-separated subset of pidex-planner, pidex-roadmap, pidex-architect. Use ATX (#/##) section headings. Nonempty standard sections Planning Insights, Roadmap Updates and Architecture Patterns REQUIRE pidex-planner, pidex-roadmap and pidex-architect respectively, even if the field says none. Omit an inapplicable section or use only None. in it. Declared targets are additive and cannot waive section-derived work. PI DEFERRED only defers configuration changes, never these handoffs. Retrospective COMPLETE routes to pidex-pi; completed/deferred PI analysis routes to orchestrator. Missing/mismatched declarations block completion.\n'
      : '\nPIDEX POST-RETRO HANDOFF: Fulfil only the following declared learning/backlog/architecture obligations, not a new feature plan or review cycle. Return COMPLETE (or APPROVED), route_to: orchestrator, with matching final/artifact ROUTING and an agents.output markdown context_file. DEFERRED is not completion. Sources: ' + JSON.stringify(admitted.consumes) + '\n'),
    finish(result) {
      if (finished) throw new Error('PIPELINE_CLOSEOUT_RETURN_REPLAYED');
      if (result?.agent !== actor) throw new Error('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
      let artifact = null; let verdict = null; let requests = []; let outcome = 'failed';
      if (result.exitCode === 0 && !result.aborted && !result.timedOut && !result.turnLimitHit) {
        const relative = closeoutArtifactPath(result.finalText);
        if (typeof relative !== 'string' || !/^agents\.output\/.+\.md$/.test(relative)) throw new Error('PIPELINE_CLOSEOUT_ARTIFACT_INVALID');
        const bytes = readBounded(ctx.project, relative, 128 * 1024).bytes;
        const routing = closeoutResultRouting(actor, result.finalText, bytes.toString('utf8'));
        if (routing.dispatchId !== metadata.id || JSON.stringify([...routing.consumes].sort()) !== JSON.stringify([...metadata.consumes].sort())) throw new Error('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
        const positive = actor === 'pidex-retrospective' ? routing.verdict === 'COMPLETE' : ['COMPLETE', 'APPROVED', ...(actor === 'pidex-pi' ? ['DEFERRED'] : [])].includes(routing.verdict);
        if (positive) {
          verdict = routing.verdict; requests = routing.requests;
          artifact = { path: relative, digest: closeoutHash(bytes), content: bytes.toString('utf8') }; outcome = 'completed';
        } else if (!['BLOCKED', 'DEFERRED'].includes(routing.verdict)) throw new Error('PIPELINE_CLOSEOUT_VERDICT_INVALID');
      }
      const end = { schema: metadata.schema, project: metadata.project, planId, pipelineId: metadata.pipelineId, id: metadata.id, outcome, artifact, verdict, requests };
      const pending = mutate((authority, binding) => {
        if (binding.pipelineId !== metadata.pipelineId) throw new Error('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
        const row = { event_type: CLOSEOUT_END, metadata: end };
        const next = foldCloseoutObligations([...authority.rows, row], binding);
        appendRecordDurable(authority.stream, { timestamp: new Date().toISOString(), ...row });
        return [...next.obligations.values()].filter(o => o.status === 'pending').map(o => ({ id: o.id, actor: o.actor }));
      });
      finished = true;
      return { status: outcome === 'completed' ? 'dispatch_completed' : 'dispatch_failed', dispatchId: metadata.id, obligationsDeclared: requests, obligationPolicy: metadata.schema, pendingObligations: pending };
    },
  };
}

export function beginRecoverableHostCloseout({ stateDir, project, actor, request, scope }) {
  validateCloseoutRequest(request);
  const canonical = canonicalTerminalBase(stateDir, project);
  const context = { project: canonical.canonicalProject, planId: request.planId, pipelineId: request.pipelineId };
  const mutate = fn => withLockContext(() => {
    const lock = takeSelectionLock(stateDir, project, request.planId); if (!lock.held) throw new Error(lock.code);
    try {
      const a = resolvePipelineAuthority({ stateDir, project, planId: request.planId });
      if (a.base !== canonical.base || a.pipelineId !== request.pipelineId) throw new Error('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
      return fn(a);
    } finally { releaseLockOrdered('selection', lock.lock); }
  });
  return createCloseoutRecovery({ stateRoot: stateDir, context, actor, request, scope, mutate, append: appendRecordDurable });
}

export function inspectHostCloseout({ stateDir, project, planId, pipelineId, dispatchId, scope }) {
  if (process.platform !== 'linux' || !/^plan-[0-9]{1,40}$/.test(planId) || !/^[a-zA-Z0-9._-]{1,160}$/.test(pipelineId)) throw new Error('PIPELINE_CLOSEOUT_REQUEST_INVALID');
  const canonical = canonicalTerminalBase(stateDir, project);
  const file = path.relative(stateDir, path.join(canonical.base, `${pipelineId}.jsonl`)).split(path.sep).join('/');
  const rows = readBounded(stateDir, file, 8 * 1024 * 1024).bytes.toString('utf8').trim().split('\n').map(JSON.parse);
  const roots = rows.filter(r => r.event_type === 'pipeline_started');
  if (roots.length !== 1 || roots[0].project_path !== canonical.canonicalProject || roots[0].plan_key !== planId || roots[0].pipeline_id !== pipelineId) throw new Error('PIPELINE_CLOSEOUT_RETURN_IDENTITY_INVALID');
  return describeCloseoutRecovery({ rows, context: { project: canonical.canonicalProject, planId, pipelineId }, stateRoot: stateDir, dispatchId, scope });
}

function canonicalTerminalBase(stateDir, project) {
  const canonical = canonicalProjectIdentity(project);
  return { ...canonical, base: safePath(stateDir, `pipeline-events/${canonical.projectKey}`) };
}
function completedReviewsAreTerminal(rows, planId) {
  const gates = new Map();
  for (const row of rows) {
    if (row?.metadata?.reviewGate === undefined) continue;
    const checked = validateReviewIdentity(row.metadata);
    if (!checked.ok || checked.value.planId !== planId) throw new Error('PIPELINE_REVIEW_INCOMPLETE');
    gates.set(checked.value.reviewGate, checked.value);
  }
  for (const identity of gates.values()) {
    if (foldReviewHistory(rows, identity).status !== 'terminal') throw new Error('PIPELINE_REVIEW_INCOMPLETE');
  }
}
function confirmExistingTerminal(options, stateDir, project, planId, event) {
  const { base, canonicalProject } = canonicalTerminalBase(stateDir, project);
  const stream = path.join(base, `${options.pipelineId}.jsonl`);
  if (!regularFile(stream)) return null;
  const relative = path.relative(stateDir, stream).split(path.sep).join('/');
  const rows = readBounded(stateDir, relative, 8 * 1024 * 1024).bytes.toString('utf8').trim().split('\n').map(line => JSON.parse(line));
  const roots = rows.filter(row => row.event_type === 'pipeline_started');
  if (roots.length !== 1 || roots[0].project_path !== canonicalProject || roots[0].plan_key !== planId || roots[0].pipeline_id !== options.pipelineId) throw new Error('PIPELINE_CLOSEOUT_IDENTITY_INVALID');
  const terminals = rows.filter(row => TERMINAL_EVENTS.has(row.event_type));
  if (!terminals.length) return null;
  if (terminals.length !== 1 || terminals[0] !== rows.at(-1) || terminals[0].event_type !== event || terminals[0].pipeline_id !== options.pipelineId || terminals[0].plan_key !== planId || terminals[0].project_path !== canonicalProject) throw new Error('PIPELINE_CLOSEOUT_CONFLICT');
  if (event === 'pipeline_completed') {
    completedReviewsAreTerminal(rows, planId);
    assertCloseoutObligationsComplete(rows, { project: canonicalProject, planId, pipelineId: options.pipelineId });
  }
  const current = path.join(base, `${planId}.current`);
  if (currentPointerFile(current)) {
    if (readBounded(stateDir, path.relative(stateDir, current).split(path.sep).join('/'), 256).bytes.toString('utf8').trim() !== options.pipelineId) throw new Error('PIPELINE_CLOSEOUT_CONFLICT');
    unlinkSync(current); // same selection lock; never delete a successor pointer
  }
  const streamFd = openSync(stream, 'r'); try { fsyncSync(streamFd); } finally { closeSync(streamFd); }
  const fd = openSync(base, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
  return { outPath: stream, pipelineId: options.pipelineId, record: terminals[0], confirmed: true, alreadyRecorded: true };
}

// Explicit orchestrator declaration, not inferred success. Existing tracked
// reviews must be terminal; UAT/DevOps/task acceptance remain caller obligations.
function validateCloseoutOptions(options) {
  if (process.platform !== 'linux') throw new Error('PIPELINE_CLOSEOUT_PLATFORM_UNCOVERED');
  if (!TERMINAL_EVENTS.has(options.event) || !/^[a-zA-Z0-9._-]{1,160}$/.test(options.pipelineId ?? '') || !/^plan-[0-9]{1,40}$/.test(options.plan ?? '') || !options.project) throw new Error('PIPELINE_CLOSEOUT_IDENTITY_INVALID');
}
export function confirmPipelineCloseout(options = {}) {
  return recordPipelineEvent({ ...options, confirmTerminal: true });
}

export function recordPipelineEvent(options = {}) {
  if (options.confirmTerminal) validateCloseoutOptions(options);
  return withLockContext(() => {
    const stateDir = path.resolve(options.stateDir || path.join(rootFromScript(), 'state'));
    const project = options.project || process.cwd();
    const event = String(options.event || ''); if (!event) throw new Error('Missing required --event');
    if (event.startsWith('pipeline_closeout_')) throw new Error('PIPELINE_CLOSEOUT_RESERVED_EVENT');
    const planId = normalizePlan(options.plan);
    const selection = takeSelectionLock(stateDir, project, planId); if (!selection.held) throw new Error(selection.code);
    try {
      const isStart = event === 'pipeline_started';
      if (options.confirmTerminal) {
        const existing = confirmExistingTerminal(options, stateDir, project, planId, event);
        if (existing) return existing;
      }
      const authority = eventAuthority({ stateDir, project, planId, event });
      if (isStart && authority.stream) throw new Error('pipeline already active');
      mkdirSync(authority.base, { recursive: true });
      const pipelineId = eventPipelineId(options, authority, planId, isStart);
      if (options.confirmTerminal) {
        if (authority.base !== canonicalTerminalBase(stateDir, project).base) throw new Error('PIPELINE_CLOSEOUT_LEGACY_UNCOVERED');
        if (event === 'pipeline_completed') completedReviewsAreTerminal(readReviewRows(authority.stream), planId);
      }
      if (event === 'pipeline_completed') assertCloseoutObligationsComplete(authority.rows, { project: authority.canonicalProject, planId, pipelineId });
      const record = buildPipelineRecord(options, authority, pipelineId, planId, event);
      const outPath = persistPipelineRecord(authority, pipelineId, record, isStart);
      if (TERMINAL_EVENTS.has(event) && existsSync(authority.current) && readFileSync(authority.current, 'utf8').trim() === pipelineId) unlinkSync(authority.current);
      if (options.confirmTerminal) { const fd = openSync(authority.base, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
      return { outPath, pipelineId, record, authority, ...(options.confirmTerminal ? { confirmed: true, alreadyRecorded: false } : {}) };
    } finally { releaseLockOrdered('selection', selection.lock); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parse(process.argv.slice(2));
    if (args.help) { console.log('Usage: event.mjs --plan PLAN --event EVENT [options]'); process.exit(0); }
    let metadata = null; if (args.metadataJson) { metadata = JSON.parse(args.metadataJson); if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('--metadata-json must be a JSON object'); }
    const result = recordPipelineEvent({ stateDir: args.stateDir, project: args.project.replace(/^~(?=$|[\\/])/, process.env.HOME || ''), projectSlug: args.projectSlug, pipelineId: args.pipelineId, plan: normalizePlan(args.plan), event: args.event, status: args.status, actor: args.actor, message: args.message, source: args.source, projectMode: args.projectMode, testProject: args.testProject, metadata, confirmTerminal: args.confirmTerminal });
    console.log(args.confirmTerminal ? JSON.stringify({ status: 'confirmed', pipelineId: result.pipelineId, planId: result.record.plan_key, event: result.record.event_type, alreadyRecorded: result.alreadyRecorded }) : `${result.outPath} pipeline_id=${result.pipelineId}`);
    if (!result.alreadyRecorded && TERMINAL_EVENTS.has(args.event) && process.env.PIDEX_PIPELINE_EVENT_RUN_OPTIONAL_HOOKS === '1') {
      const hygiene = path.join(args.root, 'scripts', 'wiki', 'hygiene.mjs'); if (existsSync(hygiene)) runOptional(process.execPath, [hygiene, 'cadence', '--project', result.record.project_path, '--plan', result.record.plan_key, '--pipeline-id', result.pipelineId, '--terminal-event', args.event], { cwd: args.root, encoding: 'utf8', timeout: Number(process.env.PIDEX_WIKI_HYGIENE_CADENCE_TIMEOUT_SECONDS || 30) * 1000 });
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(2); }
}
