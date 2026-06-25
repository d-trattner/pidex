import { spawn } from 'node:child_process';
import { createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const PROCESS_NAME = 'preview';
const DEFAULT_STATE_ROOT = '/cache/pidex-preview';
const DEFAULT_WORKSPACE = '/workspace';
const DEFAULT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_STOP_TIMEOUT_MS = 3_000;
const DEFAULT_LOG_BYTES = 16 * 1024;

export function validateProcessName(name = PROCESS_NAME) {
  if (name !== PROCESS_NAME) throw new Error('unsupported preview process name');
  return PROCESS_NAME;
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function validateManagedStateRoot({ stateRoot = DEFAULT_STATE_ROOT, workspace = DEFAULT_WORKSPACE } = {}) {
  const resolvedState = path.resolve(stateRoot);
  const resolvedWorkspace = path.resolve(workspace);
  ensureDir(resolvedState);
  if (existsSync(resolvedState) && lstatSync(resolvedState).isSymbolicLink()) throw new Error('state root symlink escape rejected');
  const realState = realpathSync(resolvedState);
  const realWorkspace = existsSync(resolvedWorkspace) ? realpathSync(resolvedWorkspace) : resolvedWorkspace;
  if (realState === realWorkspace || realState.startsWith(`${realWorkspace}${path.sep}`)) throw new Error('state root must stay outside workspace');
  return realState;
}

function processDir(stateRoot, processName) {
  validateProcessName(processName);
  const dir = path.join(stateRoot, PROCESS_NAME);
  ensureDir(dir);
  const realState = realpathSync(stateRoot);
  const realDir = realpathSync(dir);
  if (realDir !== path.join(realState, PROCESS_NAME)) throw new Error('process state path escape rejected');
  return realDir;
}

function readState(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function writeState(file, state) {
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function ownerToken(stateRoot) {
  return `pidex-preview:${realpathSync(stateRoot)}:${PROCESS_NAME}`;
}

function commandLabel(command = []) {
  return command.join(' ').replace(/(token|secret|password)=[^\s]+/gi, '$1=<redacted>').slice(0, 160);
}

export function redactPreviewLog(input = '', { maxBytes = DEFAULT_LOG_BYTES } = {}) {
  const limit = Math.max(0, maxBytes);
  const bounded = String(input).slice(-limit);
  const redacted = bounded
    .replace(/\b(token|secret|password|api[_-]?key)=([^\s]+)/gi, '$1=<redacted>')
    .replace(/\/(?:[^\s/]+\/)*pidex-secrets\/[^\s]+/gi, '<redacted-secret-path>')
    .replace(/(?:^|\s)docker\s+(?:run|create|exec)\b[^\n]*/gi, ' <redacted-docker-command>')
    .replace(/fingerprint[:=][^\s]+/gi, 'fingerprint=<redacted>');
  return redacted.slice(-limit);
}

function appendLogStream(stream, fileStream) {
  stream.on('data', (chunk) => fileStream.write(chunk));
}

async function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function isPortListening(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    socket.setTimeout(200);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForExit(child, timeoutMs) {
  const exit = once(child, 'exit').then(() => true).catch(() => true);
  const timeout = sleep(timeoutMs).then(() => false);
  return Promise.race([exit, timeout]);
}

function killProcessGroup(pid, signal) {
  try { process.kill(-pid, signal); return true; } catch {}
  try { process.kill(pid, signal); return true; } catch {}
  return false;
}

async function stopPid(pid, timeoutMs) {
  if (!isProcessAlive(pid)) return true;
  killProcessGroup(pid, 'SIGTERM');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await sleep(50);
  }
  killProcessGroup(pid, 'SIGKILL');
  await sleep(100);
  return !isProcessAlive(pid);
}

export function parseProcessManagerCliArgs(argv = []) {
  const separator = argv.indexOf('--');
  const prefix = separator === -1 ? argv : argv.slice(0, separator);
  const tail = separator === -1 ? [] : argv.slice(separator + 1);
  const out = { json: false, processName: PROCESS_NAME };
  for (let i = 0; i < prefix.length; i += 1) {
    const arg = prefix[i];
    if (['start', 'status', 'logs', 'stop'].includes(arg) && !out.action) out.action = arg;
    else if (arg === '--json') out.json = true;
    else if (arg === '--state-root') out.stateRoot = prefix[++i];
    else if (arg === '--workspace') out.workspace = prefix[++i];
    else if (arg === '--process-name') out.processName = prefix[++i];
    else if (arg === '--port') out.containerPort = Number(prefix[++i]);
    else if (arg === '--max-bytes') out.maxBytes = Number(prefix[++i]);
    else if (arg === '--readiness-timeout-ms') out.readinessTimeoutMs = Number(prefix[++i]);
    else if (arg === '--stop-timeout-ms') out.stopTimeoutMs = Number(prefix[++i]);
    else throw new Error(`unknown process argument: ${arg}`);
  }
  if (!out.action) throw new Error('process action is required');
  if (out.action === 'start') {
    if (!tail.length) throw new Error('preview command required');
    out.command = tail;
  } else if (tail.length) throw new Error(`preview ${out.action} does not accept command tail`);
  return out;
}

export function createProcessManager(options = {}) {
  const workspace = path.resolve(options.workspace || DEFAULT_WORKSPACE);
  ensureDir(workspace);
  const stateRoot = validateManagedStateRoot({ stateRoot: options.stateRoot || DEFAULT_STATE_ROOT, workspace });
  const defaults = {
    readinessTimeoutMs: options.readinessTimeoutMs || DEFAULT_READY_TIMEOUT_MS,
    stopTimeoutMs: options.stopTimeoutMs || DEFAULT_STOP_TIMEOUT_MS,
  };

  function paths(processName = PROCESS_NAME) {
    const dir = processDir(stateRoot, processName);
    return {
      dir,
      stateFile: path.join(dir, 'state.json'),
      logFile: path.join(dir, 'preview.log'),
    };
  }

  async function start(args = {}) {
    const processName = validateProcessName(args.processName || PROCESS_NAME);
    const command = args.command || [];
    if (!Array.isArray(command) || command.length === 0) throw new Error('preview command required');
    const port = Number(args.containerPort || args.port || args.env?.PORT);
    if (!Number.isInteger(port) || port <= 0) throw new Error('valid preview port required');
    const p = paths(processName);
    const previous = readState(p.stateFile);
    if (previous?.status === 'running') await stop({ processName, containerPort: previous.port || port });

    const env = { ...process.env, ...args.env, HOST: '0.0.0.0', PORT: String(port), PIDEX_PREVIEW_HOST: '0.0.0.0', PIDEX_PREVIEW_PORT: String(port) };
    const out = await import('node:fs').then(({ createWriteStream }) => createWriteStream(p.logFile, { flags: 'w', mode: 0o600 }));
    const child = spawn(command[0], command.slice(1), { cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    appendLogStream(child.stdout, out);
    appendLogStream(child.stderr, out);
    const state = {
      status: 'starting',
      pid: child.pid,
      pgid: child.pid,
      owner_token: ownerToken(stateRoot),
      port,
      cwd: workspace,
      command_label: commandLabel(command),
      started_at: new Date().toISOString(),
    };
    writeState(p.stateFile, state);
    const deadline = Date.now() + (args.readinessTimeoutMs || defaults.readinessTimeoutMs);
    let exited = false;
    child.once('exit', () => { exited = true; out.end(); });
    while (Date.now() < deadline) {
      if (exited || !isProcessAlive(child.pid)) {
        state.status = 'failed';
        state.last_error_category = 'preview_process_exited';
        writeState(p.stateFile, state);
        return { ok: false, status: 'failed', error_category: 'preview_process_exited' };
      }
      if (await isPortListening(port)) {
        state.status = 'running';
        state.ready_at = new Date().toISOString();
        writeState(p.stateFile, state);
        child.unref();
        return { ok: true, status: 'running', pid: child.pid, cwd: workspace, port };
      }
      await sleep(50);
    }
    await stopPid(child.pid, defaults.stopTimeoutMs);
    state.status = 'failed';
    state.last_error_category = 'preview_port_not_listening';
    writeState(p.stateFile, state);
    return { ok: false, status: 'failed', error_category: 'preview_port_not_listening' };
  }

  async function status(args = {}) {
    const processName = validateProcessName(args.processName || PROCESS_NAME);
    const p = paths(processName);
    const state = readState(p.stateFile);
    if (!state?.pid) return { ok: true, status: 'stopped' };
    if (state.owner_token !== ownerToken(stateRoot)) return { ok: false, status: 'unknown', error_category: 'preview_stale_pid_owner_mismatch' };
    const alive = isProcessAlive(state.pid);
    const listening = alive && state.port ? await isPortListening(state.port) : false;
    const nextStatus = alive && listening ? 'running' : (state.status === 'failed' ? 'failed' : 'stopped');
    if (nextStatus !== state.status) writeState(p.stateFile, { ...state, status: nextStatus, stopped_at: nextStatus === 'stopped' ? new Date().toISOString() : state.stopped_at });
    return { ok: true, status: nextStatus, pid: alive ? state.pid : undefined, port: state.port };
  }

  async function logs(args = {}) {
    const processName = validateProcessName(args.processName || PROCESS_NAME);
    const p = paths(processName);
    if (!existsSync(p.logFile)) return { ok: true, status: 'ok', text: '' };
    const size = statSync(p.logFile).size;
    const maxBytes = args.maxBytes || DEFAULT_LOG_BYTES;
    const startAt = Math.max(0, size - maxBytes);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const stream = createReadStream(p.logFile, { start: startAt, end: Math.max(0, size - 1) });
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    return { ok: true, status: 'ok', text: redactPreviewLog(Buffer.concat(chunks).toString('utf8'), { maxBytes }) };
  }

  async function stop(args = {}) {
    const processName = validateProcessName(args.processName || PROCESS_NAME);
    const p = paths(processName);
    const state = readState(p.stateFile);
    if (!state?.pid) return { ok: true, status: 'stopped' };
    if (state.owner_token !== ownerToken(stateRoot)) return { ok: false, status: 'unknown', error_category: 'preview_stale_pid_owner_mismatch' };
    const killed = await stopPid(state.pid, args.stopTimeoutMs || defaults.stopTimeoutMs);
    const freed = state.port ? !(await isPortListening(state.port)) : true;
    const ok = killed && freed;
    writeState(p.stateFile, { ...state, status: ok ? 'stopped' : 'stopping', stopped_at: new Date().toISOString(), last_error_category: ok ? '' : 'preview_stop_incomplete' });
    return ok ? { ok: true, status: 'stopped' } : { ok: false, status: 'stopping', error_category: 'preview_stop_incomplete' };
  }

  return { start, status, logs, stop, stateRoot, workspace };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseProcessManagerCliArgs(process.argv.slice(2));
    const manager = createProcessManager({ stateRoot: args.stateRoot, workspace: args.workspace, readinessTimeoutMs: args.readinessTimeoutMs, stopTimeoutMs: args.stopTimeoutMs });
    let result;
    if (args.action === 'start') result = await manager.start(args);
    else if (args.action === 'status') result = await manager.status(args);
    else if (args.action === 'logs') result = await manager.logs(args);
    else if (args.action === 'stop') result = await manager.stop(args);
    console.log(args.json ? JSON.stringify(result) : (result.status || 'ok'));
    process.exit(result.ok === false ? 1 : 0);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, status: 'failed', error_category: error.category || 'preview_process_manager_failed' }));
    process.exit(2);
  }
}
