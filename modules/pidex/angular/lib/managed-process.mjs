import { spawn, spawnSync } from 'node:child_process';

const DEFAULT_CAPTURE_BYTES = 64 * 1024;

function appendTail(current, chunk, limit) {
  const next = Buffer.concat([current, Buffer.from(chunk)]);
  return next.length <= limit ? next : next.subarray(next.length - limit);
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function signalTree(pid, signal) {
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return result.status === 0;
  }
  try { process.kill(-pid, signal); return true; } catch {}
  try { process.kill(pid, signal); return true; } catch { return false; }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function terminateTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  signalTree(pid, 'SIGTERM');
  for (let i = 0; i < 10 && processAlive(pid); i += 1) await delay(50);
  if (processAlive(pid)) signalTree(pid, 'SIGKILL');
  await delay(50);
  return !processAlive(pid);
}

export async function runManagedProcess(options = {}) {
  const timeoutMs = Number(options.timeoutMs);
  const captureBytes = Number(options.captureBytes || DEFAULT_CAPTURE_BYTES);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('ANGULAR_PROCESS_TIMEOUT_INVALID');
  if (!Number.isInteger(captureBytes) || captureBytes < 1024) throw new Error('ANGULAR_PROCESS_CAPTURE_INVALID');
  const child = spawn(options.bin, options.args || [], {
    cwd: options.cwd, env: options.env, shell: false, detached: process.platform !== 'win32', windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let totalStdout = 0; let totalStderr = 0; let error = null; let timedOut = false;
  child.stdout.on('data', (chunk) => { totalStdout += chunk.length; stdout = appendTail(stdout, chunk, captureBytes); });
  child.stderr.on('data', (chunk) => { totalStderr += chunk.length; stderr = appendTail(stderr, chunk, captureBytes); });
  child.once('error', (value) => { error = value; });
  const timeout = setTimeout(() => { timedOut = true; void terminateTree(child.pid); }, timeoutMs);
  const outcome = await new Promise((resolve) => child.once('close', (status, signal) => resolve({ status, signal })));
  clearTimeout(timeout);
  const cleanupComplete = timedOut ? await terminateTree(child.pid) : !processAlive(child.pid);
  return {
    ...outcome, error, timedOut, cleanupIncomplete: !cleanupComplete,
    stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'),
    stdoutTruncated: totalStdout > stdout.length, stderrTruncated: totalStderr > stderr.length,
  };
}
