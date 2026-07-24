#!/usr/bin/env node
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmdirSync, rmSync, unlinkSync, writeSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allowedCompletionOutcome, foldReviewHistory, normalizeReviewPlan, validateReviewIdentity } from '../../../../../extensions/pidex/review-budget.ts';
import { canonicalProjectIdentity, projectPlanSelectionLock } from '../../lib/project-key.mjs';

const TERMINAL_EVENTS = new Set(['pipeline_completed', 'pipeline_failed', 'pipeline_aborted', 'pipeline_cancelled']);

function rootFromScript() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'); }
function slug(value, max = 160) { return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || 'unknown'; }
export function normalizePlan(value) { const s = String(value || '').trim(); return normalizeReviewPlan(s) ?? slug(s || 'unknown-plan', 80); }
function timestampId() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function parse(argv) {
  const out = { root: rootFromScript(), stateDir: process.env.RUNNING_PI_STATE_DIR || '', project: '', projectSlug: '', pipelineId: process.env.RUNNING_PI_PIPELINE_ID || '', plan: 'unknown-plan', event: '', status: '', actor: 'orchestrator', message: '', source: 'manual', projectMode: '', testProject: undefined, metadataJson: '' };
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

function assertAuthorityBase(eventsRoot, base) {
  if (path.dirname(base) !== eventsRoot) throw new Error('REVIEW_HISTORY_INVALID');
  if (existsSync(base) && !lstatSync(base).isDirectory()) throw new Error('REVIEW_HISTORY_INVALID');
}

function authorityAtBase(base, canonicalProject, planId) {
  const current = path.join(base, `${planId}.current`);
  if (!regularFile(current)) return null;
  const pipelineId = readFileSync(current, 'utf8').trim();
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(pipelineId)) throw new Error('REVIEW_HISTORY_INVALID');
  const stream = path.join(base, `${pipelineId}.jsonl`);
  if (!regularFile(stream)) throw new Error('REVIEW_HISTORY_INVALID');
  const rows = readReviewRows(stream);
  const roots = rows.filter((row) => row?.event_type === 'pipeline_started' && row?.pipeline_id === pipelineId && row?.plan_key === planId && row?.project_path === canonicalProject);
  if (roots.length !== 1 || rows.some((row) => TERMINAL_EVENTS.has(row?.event_type) && row?.pipeline_id === pipelineId && row?.plan_key === planId)) throw new Error('REVIEW_HISTORY_INVALID');
  return { base, current, stream, pipelineId, rows };
}

function legacyAuthorities(eventsRoot, hashedBase, canonicalProject, planId) {
  if (!existsSync(eventsRoot)) return [];
  const matches = [];
  for (const entry of readdirSync(eventsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || path.join(eventsRoot, entry.name) === hashedBase) continue;
    try { const authority = authorityAtBase(path.join(eventsRoot, entry.name), canonicalProject, planId); if (authority) matches.push(authority); }
    catch (error) { if (error?.message !== 'REVIEW_HISTORY_INVALID') throw error; }
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
  if (existsSync(hashedCurrent)) {
    const hashed = authorityAtBase(hashedBase, canonicalProject, normalizedPlan);
    if (!hashed) throw new Error('REVIEW_HISTORY_INVALID');
    return { ...hashed, canonicalProject, projectKey, planId: normalizedPlan, legacy: false, eventsRoot };
  }
  const legacy = legacyAuthorities(eventsRoot, hashedBase, canonicalProject, normalizedPlan);
  if (legacy.length === 1 && !allowCreate) return { ...legacy[0], canonicalProject, projectKey, planId: normalizedPlan, legacy: true, eventsRoot };
  if (legacy.length !== 0) throw new Error('REVIEW_HISTORY_INVALID');
  if (!allowCreate) throw new Error('REVIEW_HISTORY_INVALID');
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
      let owner; try { owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8')); } catch { return { held: false, code: uncertainCode }; }
      if (!validOwner(owner, requireIdentity)) return { held: false, code: uncertainCode };
      if (ownerProvenDead(owner)) return { held: false, code: uncertainCode };
      if (Date.now() >= deadline) return { held: false, code: unavailableCode };
      sleep(10);
    }
  }
}
function releaseLock(lock) { unlinkSync(path.join(lock, 'owner.json')); rmdirSync(lock); }

function selectionLocation(stateDir, project, planId) {
  const identity = canonicalProjectIdentity(project); const normalizedPlan = normalizePlan(planId);
  return { ...identity, planId: normalizedPlan, lock: projectPlanSelectionLock(stateDir, identity.projectKey, normalizedPlan) };
}
function takeSelectionLock(stateDir, project, planId) {
  const selection = selectionLocation(stateDir, project, planId); const eventsRoot = path.dirname(selection.lock);
  if (existsSync(eventsRoot) && !lstatSync(eventsRoot).isDirectory()) throw new Error('REVIEW_HISTORY_INVALID');
  mkdirSync(eventsRoot, { recursive: true });
  const result = takeLock(selection.lock, `${selection.projectKey}|${selection.planId}`, undefined, 'REVIEW_SELECTION_LOCK_UNAVAILABLE');
  return { ...selection, ...result };
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
  let uncertain = false; try { if (gateLock) releaseLock(gateLock); } catch { uncertain = true; }
  try { if (selectionLock) releaseLock(selectionLock); } catch { uncertain = true; }
  return !uncertain;
}
function lifecycleErrorResult(error) {
  if (error?.message === 'REVIEW_HISTORY_INVALID') return { status: 'denied', code: 'REVIEW_HISTORY_INVALID' };
  if (error?.message === 'REVIEW_CANONICAL_PROJECT_UNAVAILABLE') return { status: 'denied', code: error.message };
  return { status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' };
}

export function resolvePlanReviewAuthority({ stateDir, project, planId }) {
  const normalizedPlan = normalizePlan(planId);
  const selection = takeSelectionLock(stateDir, project, normalizedPlan); if (!selection.held) throw new Error(selection.code);
  try { const authority = resolvePipelineAuthority({ stateDir, project, planId: normalizedPlan }); return { ...authority, rows: readReviewRows(authority.stream) }; }
  finally { releaseLock(selection.lock); }
}

export function reserveReviewStart({ stateDir, project, pipelineId, identity, start }) {
  if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return { status: 'denied' };
  let selection; let gate; let gateHeld = false;
  try {
    selection = takeSelectionLock(stateDir, project, identity.planId); if (!selection.held) return { status: 'unavailable', code: selection.code };
    const authority = resolvePipelineAuthority({ stateDir, project, planId: identity.planId });
    gate = reviewLock(authority, identity); const held = takeLock(gate, identity.attemptId, identity, 'REVIEW_LOCK_UNAVAILABLE'); if (!held.held) { releaseLock(selection.lock); return { status: 'unavailable', code: held.code }; } gateHeld = true;
    const root = bindReviewRoot(authority, identity); let result;
    if (root.code) result = { status: 'denied', code: root.code };
    else {
      const state = foldReviewHistory(root.rows, identity);
      if (state.status === 'denied' || state.status === 'uncertain') result = state;
      else if (state.status === 'terminal') result = { status: 'resumed', terminal: state.terminal };
      else if (state.status === 'spawn_accepted') result = { status: 'resumed' };
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
}

export function reserveReviewStartAsync({ stateDir, project, pipelineId, identity, start }) {
  if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return Promise.resolve({ status: 'denied' });
  let selection; let gate; let gateHeld = false;
  try {
    selection = takeSelectionLock(stateDir, project, identity.planId); if (!selection.held) return Promise.resolve({ status: 'unavailable', code: selection.code });
    const authority = resolvePipelineAuthority({ stateDir, project, planId: identity.planId });
    gate = reviewLock(authority, identity); const held = takeLock(gate, identity.attemptId, identity, 'REVIEW_LOCK_UNAVAILABLE'); if (!held.held) { releaseLock(selection.lock); return Promise.resolve({ status: 'unavailable', code: held.code }); } gateHeld = true;
    const root = bindReviewRoot(authority, identity); if (root.code) { releasePair(gate, selection.lock); return Promise.resolve({ status: 'denied', code: root.code }); }
    const state = foldReviewHistory(root.rows, identity);
    if (state.status === 'denied' || state.status === 'uncertain') { releasePair(gate, selection.lock); return Promise.resolve(state); }
    if (state.status === 'terminal' || state.status === 'spawn_accepted') { releasePair(gate, selection.lock); return Promise.resolve({ status: 'resumed', ...(state.status === 'terminal' ? { terminal: state.terminal } : {}) }); }
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
}

export function recordReviewCompletion({ stateDir, project, pipelineId, identity, outcome }) {
  if (!validateReviewIdentity(identity).ok || !allowedCompletionOutcome(identity, outcome)) return { status: 'denied' };
  let selection; let gate; let gateHeld = false;
  try {
    selection = takeSelectionLock(stateDir, project, identity.planId); if (!selection.held) return { status: 'unavailable', code: selection.code };
    const authority = resolvePipelineAuthority({ stateDir, project, planId: identity.planId });
    gate = reviewLock(authority, identity); const held = takeLock(gate, identity.attemptId, identity, 'REVIEW_LOCK_UNAVAILABLE'); if (!held.held) { releaseLock(selection.lock); return { status: 'unavailable', code: held.code }; } gateHeld = true;
    const root = bindReviewRoot(authority, identity); let result;
    if (root.code) result = { status: 'denied', code: root.code };
    else {
      const state = foldReviewHistory(root.rows, identity);
      if (state.status === 'terminal') result = state.terminal === outcome ? { status: 'resumed' } : { status: 'denied' };
      else if (state.status !== 'spawn_accepted') result = state.status === 'uncertain' ? state : { status: 'denied' };
      else if (identity.reviewMode === 'review2' && outcome === 'CHANGES_REQUESTED') { appendReviewEvent(root.stream, 'spawn_returned', identity); result = { status: 'TBR_WRITE_BLOCKED' }; }
      else { appendReviewEvent(root.stream, 'spawn_returned', identity); appendReviewEvent(root.stream, 'review_outcome', { ...identity, outcome }); result = { status: outcome }; }
    }
    if (!releasePair(gate, selection.lock)) return { status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' };
    return result;
  } catch (error) { if (gateHeld || selection?.held) releasePair(gateHeld ? gate : null, selection?.lock); return lifecycleErrorResult(error); }
}

function eventAuthority({ stateDir, project, planId, event }) {
  try { return resolvePipelineAuthority({ stateDir, project, planId, allowCreate: event === 'pipeline_started' }); }
  catch (error) {
    if (TERMINAL_EVENTS.has(event) && error?.message === 'REVIEW_HISTORY_INVALID') throw new Error(`Terminal event ${event} for project=${path.basename(project)} plan=${planId} has no active pipeline id`);
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
  } finally { releaseLock(selection.lock); }
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
