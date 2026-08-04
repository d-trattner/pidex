#!/usr/bin/env node
import { closeSync, constants as fsConstants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, rmdirSync, rmSync, unlinkSync, writeSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    if (a === '--project') out.project = v(); else if (a === '--state-dir') out.stateDir = v(); else if (a === '--project-slug' || a === '--slug') out.projectSlug = v(); else if (a === '--pipeline-id') out.pipelineId = v(); else if (a === '--plan') out.plan = v(); else if (a === '--event' || a === '--event-type') out.event = v(); else if (a === '--status') out.status = v(); else if (a === '--actor') out.actor = v(); else if (a === '--message') out.message = v(); else if (a === '--source') out.source = v(); else if (a === '--project-mode') out.projectMode = v(); else if (a === '--test-project') { const value = v().toLowerCase(); if (!['true', 'false'].includes(value)) throw new Error('--test-project requires true or false'); out.testProject = value === 'true'; } else if (a === '--metadata-json') out.metadataJson = v(); else if (a === '-h' || a === '--help') { out.help = true; } else throw new Error(`Unknown arg: ${a}`);
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
  const payload = Buffer.from(`${JSON.stringify({ timestamp: new Date().toISOString(), event_type, metadata })}\n`); const fd = openSync(stream, 'a');
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
  return { stream: authority.stream, rows: rootRows };
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

export function resolvePlanReviewAuthority({ stateDir, project, planId }) {
  return withLockContext(() => {
    const normalizedPlan = normalizePlan(planId);
    const selection = takeSelectionLock(stateDir, project, normalizedPlan); if (!selection.held) throw new Error(selection.code);
    try { const authority = resolvePipelineAuthority({ stateDir, project, planId: normalizedPlan }); return { ...authority, rows: readReviewRows(authority.stream) }; }
    finally { releaseLockOrdered('selection', selection.lock); }
  });
}

export function reserveReviewStart({ stateDir, project, pipelineId, identity, start }) {
  return withLockContext(() => {
    if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return { status: 'denied' };
    let selection; let gate; let gateHeld = false;
    try {
      selection = takeSelectionLock(stateDir, project, identity.planId); if (!selection.held) return { status: 'unavailable', code: selection.code };
      const authority = resolvePipelineAuthority({ stateDir, project, planId: identity.planId });
      gate = reviewLock(authority, identity); const held = acquireLockOrdered('gate', () => takeLock(gate, identity.attemptId, identity, 'REVIEW_LOCK_UNAVAILABLE')); if (!held.held) { releaseLockOrdered('selection', selection.lock); return { status: 'unavailable', code: held.code }; } gateHeld = true;
      const root = bindReviewRoot(authority, identity); let result;
      if (root.code) result = { status: 'denied', code: root.code };
      else {
        const state = foldReviewHistory(root.rows, identity);
        if (state.status === 'denied' || state.status === 'uncertain') result = state;
        else if (state.status === 'terminal' || state.status === 'spawn_accepted' || state.status === 'prepared' || state.status === 'expansion_pending') result = { status: 'resumed', ...(state.status === 'terminal' ? { terminal: state.terminal } : {}) };
        else {
          if (state.status === 'allowed' || state.status === 'resume_reserved') appendReviewEvent(root.stream, 'start_reserved', identity);
          appendReviewEvent(root.stream, 'spawn_entered', identity); const started = start();
          if (started && typeof started.then === 'function') throw new Error('OS-start seam must return synchronously');
          appendReviewEvent(root.stream, 'spawn_accepted', identity); result = { status: 'accepted', started };
        }
      }
      if (!releasePair(gate, selection.lock)) return { status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' };
      return result;
    } catch (error) { if (gateHeld || selection?.held) releasePair(gateHeld ? gate : null, selection?.lock); return lifecycleErrorResult(error); }
  });
}

export function reserveReviewStartAsync({ stateDir, project, pipelineId, identity, start }) {
  return withLockContext(() => {
    if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return Promise.resolve({ status: 'denied' });
    let selection; let gate; let gateHeld = false;
    try {
      selection = takeSelectionLock(stateDir, project, identity.planId); if (!selection.held) return Promise.resolve({ status: 'unavailable', code: selection.code });
      const authority = resolvePipelineAuthority({ stateDir, project, planId: identity.planId });
      gate = reviewLock(authority, identity); const held = acquireLockOrdered('gate', () => takeLock(gate, identity.attemptId, identity, 'REVIEW_LOCK_UNAVAILABLE')); if (!held.held) { releaseLockOrdered('selection', selection.lock); return Promise.resolve({ status: 'unavailable', code: held.code }); } gateHeld = true;
      const root = bindReviewRoot(authority, identity); if (root.code) { releasePair(gate, selection.lock); return Promise.resolve({ status: 'denied', code: root.code }); }
      const state = foldReviewHistory(root.rows, identity);
      if (state.status === 'denied' || state.status === 'uncertain') { releasePair(gate, selection.lock); return Promise.resolve(state); }
      if (state.status === 'terminal' || state.status === 'spawn_accepted' || state.status === 'prepared' || state.status === 'expansion_pending') { releasePair(gate, selection.lock); return Promise.resolve({ status: 'resumed', ...(state.status === 'terminal' ? { terminal: state.terminal } : {}) }); }
      if (state.status === 'allowed' || state.status === 'resume_reserved') appendReviewEvent(root.stream, 'start_reserved', identity);
      appendReviewEvent(root.stream, 'spawn_entered', identity);
      return new Promise((resolve) => {
        let child; let signalled = false; let finished = false;
        const finish = (result) => { if (finished) return; finished = true; if (!releasePair(gate, selection.lock)) { resolve({ status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' }); return; } resolve(result); };
        const processStarted = () => { if (signalled) throw new Error('REVIEW_SPAWN_ACCEPTANCE_DUPLICATE'); signalled = true; try { appendReviewEvent(root.stream, 'spawn_accepted', identity); if (child !== undefined) finish({ status: 'accepted', started: child }); } catch { finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); } };
        try { child = start(processStarted); if (signalled && !finished) finish({ status: 'accepted', started: child }); Promise.resolve(child).catch(() => { if (!signalled) finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); }); }
        catch { finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); }
      });
    } catch (error) { if (gateHeld || selection?.held) releasePair(gateHeld ? gate : null, selection?.lock); return Promise.resolve(lifecycleErrorResult(error)); }
  });
}

export function recordReviewCompletion({ stateDir, project, pipelineId, identity, outcome, receipt: receiptExtra }) {
  return withLockContext(() => {
    if (!validateReviewIdentity(identity).ok || !allowedCompletionOutcome(identity, outcome)) return { status: 'denied' };
    let selection; let gate; let gateHeld = false;
    try {
      selection = takeSelectionLock(stateDir, project, identity.planId); if (!selection.held) return { status: 'unavailable', code: selection.code };
      const authority = resolvePipelineAuthority({ stateDir, project, planId: identity.planId });
      gate = reviewLock(authority, identity); const held = acquireLockOrdered('gate', () => takeLock(gate, identity.attemptId, identity, 'REVIEW_LOCK_UNAVAILABLE')); if (!held.held) { releaseLockOrdered('selection', selection.lock); return { status: 'unavailable', code: held.code }; } gateHeld = true;
      const root = bindReviewRoot(authority, identity); let result;
      if (root.code) result = { status: 'denied', code: root.code };
      else {
        const state = foldReviewHistory(root.rows, identity);
        if (state.status === 'terminal') result = state.terminal === canonicalTerminalStatus(outcome) ? { status: 'resumed', terminal: state.terminal } : { status: 'denied' };
        else if (state.status === 'uncertain') result = state;
        else if (state.status === 'expansion_pending') result = outcome === 'USER_DECISION_REQUIRED' ? { status: 'USER_DECISION_REQUIRED' } : { status: 'denied' };
        else if (state.status === 'prepared') {
          // Plan 059 Slice 2 crash rule: prepared-only and prepared+returned states resume
          // under the exact same receipt (identity + artifact digest + outcome digest +
          // intended outcome + TBR IDs); a differing duplicate receipt fails closed.
          const receipt = receiptMetadata(identity, outcome, receiptExtra);
          const existing = existingReceipt(root.rows, identity);
          if (!existing || JSON.stringify(existing) !== JSON.stringify(receipt)) result = { status: 'denied', code: 'REVIEW_RECEIPT_MISMATCH' };
          else {
            const identityRows = root.rows.filter((candidate) => candidate?.metadata && ['runFamilyId', 'planId', 'reviewGate', 'reviewMode', 'attemptId'].every((key) => candidate.metadata[key] === identity[key]));
            if (!identityRows.some((candidate) => candidate.event_type === 'spawn_returned')) appendReviewEvent(root.stream, 'spawn_returned', identity);
            if (!identityRows.some((candidate) => candidate.event_type === 'review_outcome')) appendReviewEvent(root.stream, 'review_outcome', { ...identity, outcome });
            result = { status: outcome };
          }
        }
        else if (state.status !== 'spawn_accepted') result = { status: 'denied' };
        else if (identity.reviewMode === 'review2' && outcome === 'CHANGES_REQUESTED') { appendReviewEvent(root.stream, 'spawn_returned', identity); result = { status: 'TBR_WRITE_BLOCKED' }; }
        else {
          // Uniform fixed-position receipt for every new lifecycle completion: after
          // spawn_accepted, before spawn_returned. Binds canonical identity, exact
          // artifact digest, canonical completion digest, intended outcome, stable TBR IDs.
          appendReviewEvent(root.stream, 'completion_prepared', receiptMetadata(identity, outcome, receiptExtra));
          appendReviewEvent(root.stream, 'spawn_returned', identity);
          appendReviewEvent(root.stream, 'review_outcome', { ...identity, outcome });
          result = { status: outcome };
        }
      }
      if (!releasePair(gate, selection.lock)) return { status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' };
      return result;
    } catch (error) { if (gateHeld || selection?.held) releasePair(gateHeld ? gate : null, selection?.lock); return lifecycleErrorResult(error); }
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
    if (candidate?.event_type !== 'completion_prepared' || !candidate.metadata) continue;
    if (['runFamilyId', 'planId', 'reviewGate', 'reviewMode', 'attemptId'].every((key) => candidate.metadata[key] === identity[key])) return candidate.metadata;
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
// the descriptor, closing the stat/read TOCTOU. Where O_NOFOLLOW is unavailable the
// read fails closed truthfully with REVIEW_ARTIFACT_NOFOLLOW_UNAVAILABLE rather than
// claiming no-follow semantics it cannot provide.
function structuredArtifact(root, artifactPath) {
  if (typeof artifactPath !== 'string' || !artifactPath || artifactPath.length > 1024 || path.isAbsolute(artifactPath) || path.win32.isAbsolute(artifactPath) || artifactPath.includes('\\') || artifactPath.split('/').includes('..')) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
  const resolved = path.resolve(root, artifactPath);
  const relative = path.relative(root, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let stat; try { stat = lstatSync(current); } catch { return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' }; }
    if (stat.isSymbolicLink()) return { ok: false, code: 'REVIEW_ARTIFACT_INVALID' };
  }
  if (typeof fsConstants.O_NOFOLLOW !== 'number') return { ok: false, code: 'REVIEW_ARTIFACT_NOFOLLOW_UNAVAILABLE' };
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
    const chunks = []; const buffer = Buffer.alloc(64 * 1024); let total = 0; let offset = 0;
    while (true) {
      const n = readSync(fd, buffer, 0, buffer.length, offset);
      if (n <= 0) break;
      total += n; if (total > STRUCTURED_ARTIFACT_MAX_BYTES) return { ok: false, code: 'REVIEW_ARTIFACT_TOO_LARGE' };
      chunks.push(Buffer.from(buffer.subarray(0, n))); offset += n;
    }
    const bytes = Buffer.concat(chunks);
    return { ok: true, text: bytes.toString('utf8'), sha256: createHash('sha256').update(bytes).digest('hex') };
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
      if (checked.value.expansion) intendedOutcome = 'USER_DECISION_REQUIRED';
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
  if (!isStart) { writeFileSync(outPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' }); return outPath; }
  writeNewFileDurable(outPath, `${JSON.stringify(record)}\n`);
  try { writeNewFileDurable(authority.current, pipelineId); }
  catch (error) { try { unlinkSync(outPath); } catch {} throw error; }
  return outPath;
}

export function recordPipelineEvent(options = {}) {
  return withLockContext(() => {
    const stateDir = path.resolve(options.stateDir || path.join(rootFromScript(), 'state'));
    const project = options.project || process.cwd();
    const event = String(options.event || ''); if (!event) throw new Error('Missing required --event');
    const planId = normalizePlan(options.plan);
    const selection = takeSelectionLock(stateDir, project, planId); if (!selection.held) throw new Error(selection.code);
    try {
      const isStart = event === 'pipeline_started';
      const authority = eventAuthority({ stateDir, project, planId, event });
      if (isStart && authority.stream) throw new Error('pipeline already active');
      mkdirSync(authority.base, { recursive: true });
      const pipelineId = eventPipelineId(options, authority, planId, isStart);
      const record = buildPipelineRecord(options, authority, pipelineId, planId, event);
      const outPath = persistPipelineRecord(authority, pipelineId, record, isStart);
      if (TERMINAL_EVENTS.has(event) && existsSync(authority.current) && readFileSync(authority.current, 'utf8').trim() === pipelineId) unlinkSync(authority.current);
      return { outPath, pipelineId, record, authority };
    } finally { releaseLockOrdered('selection', selection.lock); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parse(process.argv.slice(2));
    if (args.help) { console.log('Usage: event.mjs --plan PLAN --event EVENT [options]'); process.exit(0); }
    let metadata = null; if (args.metadataJson) { metadata = JSON.parse(args.metadataJson); if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('--metadata-json must be a JSON object'); }
    const result = recordPipelineEvent({ stateDir: args.stateDir, project: args.project.replace(/^~(?=$|[\\/])/, process.env.HOME || ''), projectSlug: args.projectSlug, pipelineId: args.pipelineId, plan: args.plan, event: args.event, status: args.status, actor: args.actor, message: args.message, source: args.source, projectMode: args.projectMode, testProject: args.testProject, metadata });
    console.log(`${result.outPath} pipeline_id=${result.pipelineId}`);
    if (TERMINAL_EVENTS.has(args.event) && process.env.PIDEX_PIPELINE_EVENT_RUN_OPTIONAL_HOOKS === '1') {
      if (!['0', 'false', 'no', 'off'].includes(String(process.env.PIDEX_AUTO_PDQ || '1').toLowerCase())) { const script = path.join(args.root, 'scripts', 'quality', 'run-auto-pdq.mjs'); if (existsSync(script)) runOptional(process.execPath, [script, '--project', result.record.project_path, '--plan', result.record.plan_key, '--pipeline-id', result.pipelineId, '--terminal-event', args.event], { cwd: args.root, encoding: 'utf8', timeout: Number(process.env.PIDEX_AUTO_PDQ_TIMEOUT_SECONDS || 120) * 1000 }); }
      const hygiene = path.join(args.root, 'scripts', 'wiki', 'hygiene.mjs'); if (existsSync(hygiene)) runOptional(process.execPath, [hygiene, 'cadence', '--project', result.record.project_path, '--plan', result.record.plan_key, '--pipeline-id', result.pipelineId, '--terminal-event', args.event], { cwd: args.root, encoding: 'utf8', timeout: Number(process.env.PIDEX_WIKI_HYGIENE_CADENCE_TIMEOUT_SECONDS || 30) * 1000 });
    }
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(2); }
}
