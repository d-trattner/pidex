#!/usr/bin/env node
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, unlinkSync, writeSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allowedCompletionOutcome, foldReviewHistory, validateReviewIdentity } from '../../../../../extensions/pidex/review-budget.ts';

function rootFromScript() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'); }
function slug(value) { return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown'; }
function normalizePlan(value) { const s = String(value || '').trim(); let m = s.match(/^(?:plan-)?(\d{1,3})$/i); if (m) return `plan-${m[1].padStart(3, '0')}`; m = s.match(/^(?:plan-)?(\d{1,3})[-_]/i); if (m) return `plan-${m[1].padStart(3, '0')}`; return s || 'unknown-plan'; }
function timestampId() { return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function parse(argv) {
  const out = { root: rootFromScript(), stateDir: process.env.RUNNING_PI_STATE_DIR || '', project: '', projectSlug: '', pipelineId: process.env.RUNNING_PI_PIPELINE_ID || '', plan: 'unknown-plan', event: '', status: '', actor: 'orchestrator', message: '', source: 'manual', projectMode: '', testProject: undefined, metadataJson: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const v = () => argv[++i] || '';
    if (a === '--project') out.project = v(); else if (a === '--state-dir') out.stateDir = v(); else if (a === '--project-slug' || a === '--slug') out.projectSlug = v(); else if (a === '--pipeline-id') out.pipelineId = v(); else if (a === '--plan') out.plan = v(); else if (a === '--event' || a === '--event-type') out.event = v(); else if (a === '--status') out.status = v(); else if (a === '--actor') out.actor = v(); else if (a === '--message') out.message = v(); else if (a === '--source') out.source = v(); else if (a === '--project-mode') out.projectMode = v(); else if (a === '--test-project') { const value = v().toLowerCase(); if (!['true', 'false'].includes(value)) { console.error('--test-project requires true or false'); process.exit(2); } out.testProject = value === 'true'; } else if (a === '--metadata-json') out.metadataJson = v(); else if (a === '-h' || a === '--help') { console.log('Usage: event.mjs --plan PLAN --event EVENT [options]'); process.exit(0); } else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  out.stateDir ||= path.join(out.root, 'state');
  if (!out.project) out.project = process.cwd();
  if (!out.event) { console.error('Missing required --event'); process.exit(2); }
  return out;
}
function runOptional(command, args, options) { try { const cp = spawnSync(command, args, options); if (cp.stdout?.trim()) console.log(cp.stdout.trim()); if (cp.status !== 0 && (cp.stderr || cp.stdout)) console.error((cp.stderr || cp.stdout).trim()); } catch (error) { console.error(`${path.basename(args[0] || command)} failed: ${error instanceof Error ? error.message : String(error)}`); } }

function reviewPaths({ stateDir, project, identity }) {
  if (!stateDir || !project || !validateReviewIdentity(identity).ok) throw new Error('invalid review lifecycle location');
  let canonicalProject;
  try { canonicalProject = realpathSync.native(project); } catch { throw new Error('REVIEW_CANONICAL_PROJECT_UNAVAILABLE'); }
  const base = path.join(stateDir, 'pipeline-events', slug(path.basename(canonicalProject)));
  return { base, lock: path.join(base, `.review-${identity.planId}-${identity.reviewGate}.lock`) };
}

function bindReviewRoot(locations, identity) {
  try {
    const pipelineId = readFileSync(path.join(locations.base, `${identity.planId}.current`), 'utf8').trim();
    if (!/^[a-zA-Z0-9._-]{1,160}$/.test(pipelineId)) return { code: 'REVIEW_HISTORY_INVALID' };
    const stream = path.join(locations.base, `${pipelineId}.jsonl`);
    for (const name of readdirSync(locations.base)) {
      if (!name.endsWith('.jsonl') || name === `${pipelineId}.jsonl`) continue;
      const rows = readReviewRows(path.join(locations.base, name));
      if (rows.some((row) => row?.metadata?.planId === identity.planId && row?.metadata?.reviewGate === identity.reviewGate)) return { code: 'REVIEW_HISTORY_INVALID' };
    }
    return { stream };
  } catch { return { code: 'REVIEW_HISTORY_INVALID' }; }
}

function readReviewRows(stream) {
  if (!existsSync(stream)) return [];
  const text = readFileSync(stream, 'utf8');
  if (!text.trim()) return [];
  return text.trim().split('\n').map((line) => JSON.parse(line));
}

function appendReviewEvent(stream, event_type, metadata) {
  const payload = Buffer.from(`${JSON.stringify({ timestamp: new Date().toISOString(), event_type, metadata })}\n`);
  const fd = openSync(stream, 'a');
  try {
    let offset = 0;
    while (offset < payload.length) {
      const written = writeSync(fd, payload, offset, payload.length - offset);
      if (!Number.isInteger(written) || written <= 0) throw new Error('review lifecycle short write');
      offset += written;
    }
    fsyncSync(fd);
  } finally { closeSync(fd); }
}

function processStart(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    return fields[19] || null;
  } catch { return null; }
}

function lockOwner(identity) { return { pid: process.pid, processStart: processStart(process.pid), identity }; }
function validLockOwner(value) {
  return value && Number.isInteger(value.pid) && value.pid > 0 && typeof value.processStart === 'string' && value.processStart.length > 0 && value.processStart.length <= 128 && validateReviewIdentity(value.identity).ok;
}
function sameTuple(left, right) { return left.runFamilyId === right.runFamilyId && left.planId === right.planId && left.reviewGate === right.reviewGate && left.reviewMode === right.reviewMode && left.attemptId === right.attemptId; }
function ownerProvenDead(owner) {
  try { process.kill(owner.pid, 0); } catch (error) { return error?.code === 'ESRCH'; }
  const currentStart = processStart(owner.pid);
  return Boolean(currentStart && currentStart !== owner.processStart);
}
function writeLockOwner(lock, identity) {
  const owner = lockOwner(identity);
  if (!owner.processStart) throw new Error('process start identity unavailable');
  const file = path.join(lock, 'owner.json');
  writeFileSync(file, JSON.stringify(owner), { mode: 0o600 });
  const fd = openSync(file, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function sleep(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function takeReviewLock(lock, identity) {
  const deadline = Date.now() + 500;
  while (true) {
    try { mkdirSync(lock, { mode: 0o700 }); writeLockOwner(lock, identity); return { held: true }; }
    catch (error) {
      if (error?.code !== 'EEXIST') { try { rmSync(lock, { recursive: true, force: true }); } catch {} throw error; }
      let owner;
      try { owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8')); } catch { return { held: false, code: 'REVIEW_LOCK_UNCERTAIN' }; }
      if (!validLockOwner(owner)) return { held: false, code: 'REVIEW_LOCK_UNCERTAIN' };
      if (ownerProvenDead(owner)) { try { rmSync(lock, { recursive: true, force: false }); continue; } catch { return { held: false, code: 'REVIEW_LOCK_UNCERTAIN' }; } }
      if (!sameTuple(owner.identity, identity) || Date.now() >= deadline) return { held: false, code: 'REVIEW_LOCK_UNAVAILABLE' };
      sleep(10);
    }
  }
}
function releaseReviewLock(lock) { unlinkSync(path.join(lock, 'owner.json')); rmdirSync(lock); return true; }

export function reserveReviewStart({ stateDir, project, pipelineId, identity, start }) {
  if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return { status: 'denied' };
  let locations;
  try { locations = reviewPaths({ stateDir, project, identity }); mkdirSync(locations.base, { recursive: true }); } catch (error) { return { status: 'denied', code: error?.message === 'REVIEW_CANONICAL_PROJECT_UNAVAILABLE' ? error.message : undefined }; }
  const lock = takeReviewLock(locations.lock, identity);
  if (!lock.held) return { status: 'unavailable', code: lock.code };
  let result;
  try {
    const root = bindReviewRoot(locations, identity);
    if (root.code) result = { status: 'denied', code: root.code };
    else {
      const state = foldReviewHistory(readReviewRows(root.stream), identity);
      if (state.status === 'denied' || state.status === 'uncertain') result = state;
      else if (state.status === 'terminal') result = { status: 'resumed', terminal: state.terminal };
      else if (state.status === 'spawn_accepted') result = { status: 'resumed' };
      else {
        if (state.status === 'allowed' || state.status === 'resume_reserved') appendReviewEvent(root.stream, 'start_reserved', identity);
        appendReviewEvent(root.stream, 'spawn_entered', identity);
        const started = start();
        if (started && typeof started.then === 'function') throw new Error('OS-start seam must return synchronously');
        appendReviewEvent(root.stream, 'spawn_accepted', identity);
        result = { status: 'accepted', started };
      }
    }
  } catch { result = { status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }; }
  try { releaseReviewLock(locations.lock); } catch { return { status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' }; }
  return result;
}

export function reserveReviewStartAsync({ stateDir, project, pipelineId, identity, start }) {
  if (!validateReviewIdentity(identity).ok || typeof start !== 'function') return Promise.resolve({ status: 'denied' });
  let locations;
  try { locations = reviewPaths({ stateDir, project, identity }); mkdirSync(locations.base, { recursive: true }); } catch (error) { return Promise.resolve({ status: 'denied', code: error?.message === 'REVIEW_CANONICAL_PROJECT_UNAVAILABLE' ? error.message : undefined }); }
  const lock = takeReviewLock(locations.lock, identity);
  if (!lock.held) return Promise.resolve({ status: 'unavailable', code: lock.code });
  try {
    const root = bindReviewRoot(locations, identity);
    if (root.code) { releaseReviewLock(locations.lock); return Promise.resolve({ status: 'denied', code: root.code }); }
    const state = foldReviewHistory(readReviewRows(root.stream), identity);
    if (state.status === 'denied' || state.status === 'uncertain') { releaseReviewLock(locations.lock); return Promise.resolve(state); }
    if (state.status === 'terminal' || state.status === 'spawn_accepted') { releaseReviewLock(locations.lock); return Promise.resolve({ status: 'resumed', ...(state.status === 'terminal' ? { terminal: state.terminal } : {}) }); }
    if (state.status === 'allowed' || state.status === 'resume_reserved') appendReviewEvent(root.stream, 'start_reserved', identity);
    appendReviewEvent(root.stream, 'spawn_entered', identity);
    return new Promise((resolve) => {
      let child; let signalled = false; let finished = false;
      const finish = (result) => { if (finished) return; finished = true; try { releaseReviewLock(locations.lock); } catch { resolve({ status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' }); return; } resolve(result); };
      const processStarted = () => { signalled = true; try { appendReviewEvent(root.stream, 'spawn_accepted', identity); if (child !== undefined) finish({ status: 'accepted', started: child }); } catch { finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); } };
      try {
        child = start(processStarted);
        if (signalled && !finished) finish({ status: 'accepted', started: child });
        Promise.resolve(child).catch(() => { if (!signalled) finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); });
      } catch { finish({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); }
    });
  } catch { try { releaseReviewLock(locations.lock); } catch {} return Promise.resolve({ status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }); }
}

export function recordReviewCompletion({ stateDir, project, pipelineId, identity, outcome }) {
  let locations;
  if (!validateReviewIdentity(identity).ok || !allowedCompletionOutcome(identity, outcome)) return { status: 'denied' };
  try { locations = reviewPaths({ stateDir, project, identity }); } catch (error) { return { status: 'denied', code: error?.message === 'REVIEW_CANONICAL_PROJECT_UNAVAILABLE' ? error.message : undefined }; }
  const lock = takeReviewLock(locations.lock, identity);
  if (!lock.held) return { status: 'unavailable', code: lock.code };
  let result;
  try {
    const root = bindReviewRoot(locations, identity);
    if (root.code) result = { status: 'denied', code: root.code };
    else {
      const state = foldReviewHistory(readReviewRows(root.stream), identity);
      if (state.status === 'terminal') result = state.terminal === outcome ? { status: 'resumed' } : { status: 'denied' };
      else if (state.status !== 'spawn_accepted') result = state.status === 'uncertain' ? state : { status: 'denied' };
      else if (identity.reviewMode === 'review2' && outcome === 'CHANGES_REQUESTED') { appendReviewEvent(root.stream, 'spawn_returned', identity); result = { status: 'TBR_WRITE_BLOCKED' }; }
      else { appendReviewEvent(root.stream, 'spawn_returned', identity); appendReviewEvent(root.stream, 'review_outcome', { ...identity, outcome }); result = { status: outcome }; }
    }
  } catch { result = { status: 'unavailable', code: 'REVIEW_LIFECYCLE_UNAVAILABLE' }; }
  try { releaseReviewLock(locations.lock); } catch { return { status: 'unavailable', code: 'REVIEW_LOCK_RELEASE_UNCERTAIN' }; }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
const args = parse(process.argv.slice(2));
const projectPath = path.resolve(args.project.replace(/^~(?=$|[\\/])/, process.env.HOME || ''));
const projectSlug = args.projectSlug || path.basename(projectPath) || slug(projectPath);
const projectSlugSafe = slug(projectSlug);
const planKey = normalizePlan(args.plan);
const planSafe = slug(planKey);
const base = path.join(args.stateDir, 'pipeline-events', projectSlugSafe);
mkdirSync(base, { recursive: true });
const currentFile = path.join(base, `${planSafe}.current`);
const terminalEvents = new Set(['pipeline_completed', 'pipeline_failed', 'pipeline_aborted', 'pipeline_cancelled']);
let pipelineId = args.pipelineId;
if (!pipelineId) {
  if (args.event === 'pipeline_started') {
    pipelineId = slug(`${projectSlugSafe}-${planSafe}-${timestampId()}`);
    writeFileSync(currentFile, pipelineId, 'utf8');
  } else if (existsSync(currentFile)) {
    pipelineId = readFileSync(currentFile, 'utf8').trim();
    if (!pipelineId) { console.error(`Active pipeline id file is empty for project=${projectSlugSafe} plan=${planKey}: ${currentFile}`); process.exit(1); }
  } else if (terminalEvents.has(args.event)) {
    console.error(`Terminal event ${args.event} for project=${projectSlugSafe} plan=${planKey} has no active pipeline id. Pass --pipeline-id explicitly or emit pipeline_started first; refusing to create an orphan terminal pipeline.`);
    process.exit(1);
  } else {
    pipelineId = slug(`${projectSlugSafe}-${planSafe}-${timestampId()}`);
    writeFileSync(currentFile, pipelineId, 'utf8');
  }
} else {
  pipelineId = slug(pipelineId);
  if (args.event === 'pipeline_started') writeFileSync(currentFile, pipelineId, 'utf8');
}
let metadata = null;
if (args.metadataJson) {
  try { metadata = JSON.parse(args.metadataJson); } catch (error) { console.error(`Invalid --metadata-json: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) { console.error('--metadata-json must be a JSON object'); process.exit(1); }
}
const record = { timestamp: new Date().toISOString(), project_path: projectPath, project_slug: projectSlug, pipeline_id: pipelineId, plan_key: planKey, event_type: args.event, status: args.status || null, actor: args.actor || null, message: args.message || null, project_mode: args.projectMode || null, ...(typeof args.testProject === 'boolean' ? { is_test_project: args.testProject } : {}), metadata, source: args.source || null };
const outPath = path.join(base, `${pipelineId}.jsonl`);
writeFileSync(outPath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
if (terminalEvents.has(args.event) && existsSync(currentFile)) { try { if (readFileSync(currentFile, 'utf8').trim() === pipelineId) unlinkSync(currentFile); } catch {} }
console.log(`${outPath} pipeline_id=${pipelineId}`);
if (terminalEvents.has(args.event) && process.env.PIDEX_PIPELINE_EVENT_RUN_OPTIONAL_HOOKS === '1') {
  if (!['0', 'false', 'no', 'off'].includes(String(process.env.PIDEX_AUTO_PDQ || '1').toLowerCase())) {
    const script = path.join(args.root, 'scripts', 'quality', 'run-auto-pdq.mjs');
    if (existsSync(script)) runOptional(process.execPath, [script, '--project', projectPath, '--plan', planKey, '--pipeline-id', pipelineId, '--terminal-event', args.event], { cwd: args.root, encoding: 'utf8', timeout: Number(process.env.PIDEX_AUTO_PDQ_TIMEOUT_SECONDS || 120) * 1000 });
  }
  const hygiene = path.join(args.root, 'scripts', 'wiki', 'hygiene.mjs');
  if (existsSync(hygiene)) runOptional(process.execPath, [hygiene, 'cadence', '--project', projectPath, '--plan', planKey, '--pipeline-id', pipelineId, '--terminal-event', args.event], { cwd: args.root, encoding: 'utf8', timeout: Number(process.env.PIDEX_WIKI_HYGIENE_CADENCE_TIMEOUT_SECONDS || 30) * 1000 });
}
}
