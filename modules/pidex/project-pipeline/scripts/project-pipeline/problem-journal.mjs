import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { loadProjectRecord } from './registry.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const MAX_FILE = 32768, MAX_JOURNAL = 16 * 1024 * 1024;
const phases = ['start', 'run', 'transfer', 'planning', 'implementation', 'review', 'qa', 'security', 'uat', 'closeout', 'maintenance'];
const categories = ['runtime', 'provider', 'authentication', 'artifact', 'transfer', 'configuration', 'execution', 'unknown'];
const statuses = ['open', 'investigating', 'blocked', 'resolved'];
const types = ['opened', 'updated', 'resolved'];
const hash = value => createHash('sha256').update(value).digest('hex');
const identity = st => `${st.dev}:${st.ino}`;
function fail() { throw new Error('problem-journal-invalid'); }
function oneOf(value, values) { if (!values.includes(value)) fail(); return value; }
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) fail();
  return value;
}
// Defense in depth, not an invitation to submit sensitive prose. Unknown keys
// never enter the journal; suspicious free-text fields are dropped in entirety.
export function sanitizeProblemText(value, max = 1000) {
  if (typeof value !== 'string' || value.length > max) fail();
  if (/[\x00-\x1f\x7f\u2028\u2029]|-----BEGIN|\b(?:bearer|authorization|[\w-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|credential|cookie))["']?\s*[:= ]|\b(?:sk-|ghp_|github_pat_|AKIA)|\beyJ[A-Za-z0-9_-]+\.|[A-Za-z0-9_+=-]{40,}|[a-z][a-z0-9+.-]*:\/\/|[A-Za-z]:[\\/]|\\|(?:^|[^A-Za-z0-9_.-])\//i.test(value)) return '[redacted]';
  return value.trim();
}
function evidencePath(value) {
  if (typeof value !== 'string' || value.length > 240 || !/^agents\.output\/[A-Za-z0-9_./-]+\.(?:md|json)$/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..') || sanitizeProblemText(value, 240) !== value) fail();
  return value;
}
export function normalizeProblemEvent(input, record, { origin = 'artifact', attempt = false } = {}) {
  if (typeof record?.project_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(record.project_id)) fail();
  if (!input || input.schema_version !== 1 || typeof input.event_id !== 'string' || input.event_id.length !== 36 || !UUID.test(input.event_id) || typeof input.incident_id !== 'string' || input.incident_id.length !== 36 || !UUID.test(input.incident_id) || input.project_id !== record.project_id) fail();
  if (typeof input.run_id !== 'string' || !input.run_id || input.run_id.length > 128) fail();
  const run = (record.runs || []).find(r => r.project_run_id === input.run_id);
  if (!run && !(origin === 'host' && attempt && /^attempt-[a-f0-9-]{36}$/.test(input.run_id || ''))) fail();
  const agent = run ? run.agent : 'orchestrator';
  if (input.agent !== agent || !/^(?:pidex-[a-z-]+|orchestrator)$/.test(agent)) fail();
  const out = { schema_version: 1, event_id: input.event_id, incident_id: input.incident_id, occurred_at: timestamp(input.occurred_at), project_id: record.project_id, run_id: input.run_id, run_scope: run ? 'run' : 'attempt', agent, origin, phase: oneOf(input.phase, phases), event_type: oneOf(input.event_type, types), category: oneOf(input.category, categories), status: oneOf(input.status, statuses) };
  if ((out.event_type === 'resolved') !== (out.status === 'resolved')) fail();
  for (const key of ['summary', 'cause', 'action', 'outcome', 'next_step']) out[key] = sanitizeProblemText(input[key], key === 'summary' ? 280 : 1000);
  if (!Array.isArray(input.evidence) || input.evidence.length > 16) fail();
  out.evidence = [...new Set(input.evidence.map(evidencePath))];
  if (input.runtime != null && (typeof input.runtime !== 'object' || Array.isArray(input.runtime))) fail();
  const runtime = input.runtime || {};
  out.runtime = {};
  for (const key of ['pi_version', 'provider', 'model', 'pidex_commit']) {
    const value = runtime[key];
    if (value == null) out.runtime[key] = null;
    else if (key === 'pidex_commit') out.runtime[key] = typeof value === 'string' && value.length === 40 && /^[a-f0-9]{40}$/.test(value) ? value : null;
    else if (key === 'pi_version') out.runtime[key] = typeof value === 'string' && value.length <= 32 && value.trim() === value && /^\d+\.\d+\.\d+$/.test(value) ? value : null;
    else out.runtime[key] = sanitizeProblemText(value, 160);
  }
  // Runtime values in artifact events remain producer-reported, never attestation.
  return out;
}
function directory(dir, create = false) {
  if (create && !fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || path.relative(path.resolve(dir), fs.realpathSync.native(dir)) !== '') fail();
  return { dir, id: identity(st) };
}
function checkDirectories(dirs) { for (const d of dirs) if (directory(d.dir).id !== d.id) fail(); }
function hostDirectories(record) {
  if (process.env.PIDEX_PROJECT_PIPELINE_CONTAINER === '1' || process.env.PIDEX_PROJECT_PIPELINE_CHILD === '1') fail();
  if (record.control_project_path && !path.isAbsolute(record.control_project_path)) fail();
  if (record.source?.kind === 'host-path' && record.source.ref && !path.isAbsolute(record.source.ref)) fail();
  const control = record.control_project_path ? path.resolve(record.control_project_path) : '';
  const source = record.source?.kind === 'host-path' && record.source.ref ? path.resolve(record.source.ref) : '';
  if ((!control && !source) || (control && source && path.relative(control, source) !== '')) fail();
  const dirs = [directory(control || source)];
  for (const part of ['pidex', 'state', 'pipeline-projects']) {
    checkDirectories(dirs);
    dirs.push(directory(path.join(dirs.at(-1).dir, part), true));
  }
  return dirs;
}
function regularRead(file, max) {
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > max) fail();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (identity(st) !== identity(opened) || opened.nlink !== 1 || opened.size > max) fail();
    const bytes = Buffer.alloc(opened.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const n = fs.readSync(fd, bytes, count, bytes.length - count, count);
      if (!n) break;
      count += n;
    }
    if (count !== opened.size || fs.fstatSync(fd).size !== opened.size) fail();
    return bytes.subarray(0, count).toString('utf8');
  } finally { fs.closeSync(fd); }
}
export function appendProblemEvent(record, inputEvent) {
  const event = normalizeProblemEvent(inputEvent, record, { origin: inputEvent?.origin === 'host' ? 'host' : 'artifact', attempt: inputEvent?.run_scope === 'attempt' });
  const dirs = hostDirectories(record), root = dirs.at(-1).dir;
  const lock = path.join(root, 'journal.lock'), journal = path.join(root, 'journal.jsonl');
  // No stale-owner reclamation or journal repair. A partial tail remains evidence.
  const lockFd = fs.openSync(lock, 'wx', 0o600);
  const nonce = JSON.stringify({ nonce: randomUUID(), pid: process.pid, project_id: record.project_id, started_at: new Date().toISOString() });
  const lockId = identity(fs.fstatSync(lockFd));
  try {
    fs.writeFileSync(lockFd, nonce);
    checkDirectories(dirs);
    const previous = fs.existsSync(journal) ? regularRead(journal, MAX_JOURNAL) : '';
    if (previous && !previous.endsWith('\n')) fail();
    for (const line of previous.split('\n').filter(Boolean)) {
      const item = JSON.parse(line);
      if (item.project_id === event.project_id && item.event_id === event.event_id) {
        const { recorded_at, ...payload } = item;
        // Host re-observation of the same run/phase/cause keeps the first time.
        // Producer timestamps are immutable parts of artifact event identity.
        const comparable = value => value.origin === 'host' ? { ...value, occurred_at: null } : value;
        if (JSON.stringify(comparable(payload)) !== JSON.stringify(comparable(event))) throw new Error('problem-event-conflict');
        return { status: 'duplicate' };
      }
    }
    const bytes = Buffer.from(JSON.stringify({ ...event, recorded_at: new Date().toISOString() }) + '\n');
    if (Buffer.byteLength(previous) + bytes.length > MAX_JOURNAL) fail();
    checkDirectories(dirs);
    const existed = fs.existsSync(journal), before = existed ? fs.lstatSync(journal) : null;
    const fd = fs.openSync(journal, fs.constants.O_WRONLY | fs.constants.O_APPEND | (existed ? 0 : fs.constants.O_CREAT | fs.constants.O_EXCL) | (fs.constants.O_NOFOLLOW || 0), 0o600);
    try {
      const st = fs.fstatSync(fd);
      if (!st.isFile() || st.nlink !== 1 || (before && identity(before) !== identity(st))) fail();
      checkDirectories(dirs);
      if (fs.writeSync(fd, bytes) !== bytes.length) fail();
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    return { status: 'appended' };
  } finally {
    fs.closeSync(lockFd);
    checkDirectories(dirs);
    if (identity(fs.lstatSync(lock)) === lockId && fs.readFileSync(lock, 'utf8') === nonce) fs.unlinkSync(lock);
  }
}
export function importProblemReports({ pidexRoot, projectId, workspace }) {
  const result = { status: 'complete', appended: 0, duplicates: 0, rejected: 0 };
  try {
    const record = loadProjectRecord(pidexRoot, projectId);
    const dirs = [directory(path.resolve(workspace))];
    for (const name of ['agents.output', 'pipeline-problems']) {
      const next = path.join(dirs.at(-1).dir, name);
      if (!fs.existsSync(next)) return result;
      dirs.push(directory(next));
    }
    const names = [], dir = fs.opendirSync(dirs.at(-1).dir);
    try {
      for (let entry; (entry = dir.readSync());) {
        if (names.length >= 100) fail();
        names.push(entry.name);
      }
    } finally { dir.closeSync(); }
    names.sort();
    for (const name of names) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) { result.rejected++; continue; }
      try {
        checkDirectories(dirs);
        const input = JSON.parse(regularRead(path.join(dirs.at(-1).dir, name), MAX_FILE));
        if (name !== `${input.event_id}.json`) fail();
        const event = normalizeProblemEvent(input, record);
        checkDirectories(dirs);
        const written = appendProblemEvent(record, event);
        result[written.status === 'duplicate' ? 'duplicates' : 'appended']++;
      } catch { result.rejected++; }
    }
    if (result.rejected) result.status = 'degraded';
  } catch { result.status = 'unavailable'; }
  return result;
}
// Classify known stderr signatures without retaining the stderr or model names.
export function classifyProblemCause(stderr) {
  const text = typeof stderr === 'string' ? stderr.slice(0, 65536) : '';
  for (const [pattern, code] of [
    [/No models matching|model_not_found/i, 'model-unavailable'],
    [/invalid_api_key|authentication_error|invalid authentication/i, 'provider-authentication-failed'],
    [/rate_limit_exceeded|too many requests/i, 'provider-rate-limited'],
    [/context_length_exceeded|maximum context length/i, 'provider-context-limit'],
  ]) if (pattern.test(text)) return code;
  return null;
}
const classifiedCauses = new Set(['model-unavailable', 'provider-authentication-failed', 'provider-rate-limited', 'provider-context-limit']);
const hostCodes = new Set(['child-pi-failed', 'sandbox-unavailable', 'archive-sync-failed', 'archive-context-missing', 'source-init-failed', 'credential-bootstrap-failed', 'expected-input-missing', 'expected-output-missing', 'routing-invalid', 'write-fence-violation', 'module-rule-injection-failed', 'essential-phase-held', 'agent-run-failed', 'expected-artifact-path-invalid', 'expected-output-exists', 'expected-output-non-regular', 'retry-artifact-provenance-invalid', 'write-fence-output-required', 'write-fence-manifest-failed', 'project-execution-busy', 'pi-maintenance-held', 'project-pipeline-recursion-guard', 'image-build-failed', 'lifecycle-failed', 'project-mirror-degraded', 'artifact-transfer-unavailable']);
export function recordHostProblem(options, result, phase = 'run') {
  try {
    const record = loadProjectRecord(options.pidexRoot || process.cwd(), options.projectId);
    const runId = result?.project_run_id || options.project_run_id;
    const run = typeof runId === 'string' ? (record.runs || []).find(r => r.project_run_id === runId) : undefined;
    const cause = classifiedCauses.has(result?.problem_cause) ? result.problem_cause : hostCodes.has(result?.error) ? result.error : 'unknown';
    const run_id = run?.project_run_id || `attempt-${randomUUID()}`;
    const digest = hash(`${record.project_id}:${run_id}:${phase}:${cause}`).slice(0, 32);
    const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20)}`;
    const category = phase === 'transfer' ? 'transfer'
      : cause === 'model-unavailable' ? 'runtime'
      : cause === 'provider-authentication-failed' ? 'authentication'
      : cause.startsWith('provider-') ? 'provider' : 'execution';
    const event = normalizeProblemEvent({
      schema_version: 1, event_id: id, incident_id: id,
      occurred_at: new Date().toISOString(),
      project_id: record.project_id, run_id, agent: run?.agent || 'orchestrator',
      phase, event_type: 'opened', category, status: 'blocked',
      summary: 'Project Pipeline operation failed', cause,
      action: 'Recorded diagnostic only; no retry or continuation requested',
      outcome: 'Operation failed or remains held; underlying cause may be unknown',
      next_step: 'Inspect locally; wait for an explicit user decision before proceeding',
      evidence: [], runtime: {},
    }, record, { origin: 'host', attempt: !run });
    return { ...appendProblemEvent(record, event), run_id: event.run_id, run_scope: event.run_scope };
  } catch (error) { return { status: 'unavailable', reason: error?.code === 'EEXIST' ? 'journal-busy' : 'journal-unavailable' }; }
}
