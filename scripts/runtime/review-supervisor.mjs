import { spawn } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { canonicalJson } from './contracts.mjs';
import { readJson } from './io.mjs';
import { validateExecutionBinding, linuxBoot, linuxProcess, processMatches, ownedExecutionChildren, signalExecutionChild, publishExecutionRecord, hasExecutionStop, executionDigest, EXECUTION_PROTOCOL_DIGEST } from './review-execution.mjs';

// Linux group leader is retained until quiescence and receipt publication.
// Hard-killing this leader/group deliberately leaves no trustworthy end receipt.
const directory = process.argv[2];
let child;
let descriptor;
let self;
let privateKey;
let publicKey;
function signed(payload) { return { ...payload, signature: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64') }; }
let reason = 'exited';
let stopping = false;
let childExit;
let streamsClosed = false;
let finishing = false;
let hardTimer;
let runtimeTimer;
let pollTimer;
let outputGone = false;
let hardening = false;
const controls = new Set();
const startupTimer = setTimeout(() => process.exit(2), 10_000);

function owned() { return ownedExecutionChildren(); }
function controlReason(fallback) {
  for (const name of ['user_abort', 'admission_failed', 'timeout', 'turn_limit', 'final_drain']) if (controls.has(name) || hasExecutionStop(directory, descriptor, name)) return name;
  return fallback;
}
function hardStop() {
  if (hardening || finishing) return;
  hardening = true; stopping = true;
  const deadline = Date.now() + 5_000;
  const kill = () => {
    if (finishing) return;
    try { for (const ref of owned()) signalExecutionChild(ref, 'SIGKILL'); } catch { /* no receipt until a stable quiescent observation */ }
    if (Date.now() >= deadline) { process.kill(-process.pid, 'SIGKILL'); return; }
    setTimeout(kill, 25);
  };
  kill();
}
function interrupt(fallback) {
  if (finishing || stopping) return;
  stopping = true;
  try { reason = controlReason(fallback); } catch { hardStop(); return; }
  if (!child) { process.exit(2); return; }
  // The signal also reaches this supervisor, whose handler is now idempotent.
  process.kill(-process.pid, 'SIGTERM');
  try { for (const ref of owned()) signalExecutionChild(ref, 'SIGTERM'); } catch { /* bounded hard cleanup follows */ }
  hardTimer = setTimeout(hardStop, 5_000);
}
function forward(stream, data, output) {
  if (outputGone) return;
  if (!output.write(data)) { stream.pause(); output.once('drain', () => stream.resume()); }
}
function checkFinished() {
  if (finishing || !childExit) return;
  let members;
  try { members = owned(); } catch { return; }
  if (members.length) { interrupt(reason === 'exited' ? 'external_stop' : reason); return; }
  if (!streamsClosed) return;
  finishing = true;
  clearTimeout(hardTimer); clearTimeout(runtimeTimer); clearInterval(pollTimer);
  try {
    reason = controlReason(reason);
    publishExecutionRecord(directory, 'ended.json', signed({
      version: 1, nonce: descriptor.nonce, descriptorDigest: executionDigest(descriptor), supervisor: self, childPid: child.pid,
      exitCode: childExit.code, signal: childExit.signal, reason, quiescent: true,
    }));
  } catch { process.exit(2); return; }
  // Normal EOF drains all forwarded output; don't exit() and truncate pipes.
  if (process.connected) process.disconnect();
  process.exitCode = childExit.code ?? 1;
}

try {
  if (process.platform !== 'linux' || !process.send || process.env.PIDEX_REVIEW_SUBREAPER !== '1') throw new Error();
  descriptor = readJson(directory, 'dispatch.json');
  if (descriptor.protocol !== EXECUTION_PROTOCOL_DIGEST || descriptor.version !== 1 || !validateExecutionBinding(descriptor.binding) || descriptor.boot !== linuxBoot() || descriptor.owner?.pid !== process.ppid || !processMatches(descriptor.owner)) throw new Error();
  const current = linuxProcess(process.pid);
  if (!current || current.group !== process.pid) throw new Error();
  self = { pid: current.pid, start: current.start, group: current.group };
  const pair = generateKeyPairSync('ed25519');
  privateKey = pair.privateKey; // Never serialized, inherited by the child, or logged.
  publicKey = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  process.on('SIGTERM', () => interrupt('external_stop'));
  process.on('SIGINT', () => interrupt('external_stop'));
  process.on('SIGHUP', () => interrupt('external_stop'));
  process.on('disconnect', () => interrupt('owner_lost'));
  process.on('error', () => interrupt('owner_lost'));
  process.on('message', message => {
    if (message?.type === 'hard-stop') hardStop();
    if (message?.type === 'stop' && ['user_abort', 'timeout', 'turn_limit', 'final_drain', 'admission_failed'].includes(message.reason)) {
      controls.add(message.reason);
      interrupt(message.reason);
    }
  });
  for (const stream of [process.stdout, process.stderr]) stream.on('error', () => {
    outputGone = true; child?.stdout?.resume(); child?.stderr?.resume(); interrupt('owner_lost');
  });
  process.once('message', spec => {
    clearTimeout(startupTimer);
    if (!spec || typeof spec.command !== 'string' || !spec.command || !Array.isArray(spec.args) || spec.args.length > 256 || spec.args.some(a => typeof a !== 'string' || a.length > 65536) || spec.cwd !== descriptor.binding.project || !Number.isInteger(spec.maxRuntimeMs) || spec.maxRuntimeMs < 1 || spec.maxRuntimeMs > 3_600_000) { process.exit(2); return; }
    const env = { ...process.env };
    delete env.NODE_CHANNEL_FD; delete env.NODE_CHANNEL_SERIALIZATION_MODE; delete env.PIDEX_REVIEW_SUBREAPER;
    child = spawn(spec.command, spec.args, { cwd: spec.cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    child.once('spawn', () => {
      try {
        publishExecutionRecord(directory, 'started.json', signed({ version: 1, nonce: descriptor.nonce, descriptorDigest: executionDigest(descriptor), supervisor: self, childPid: child.pid, publicKey }));
        if (process.connected) process.send({ type: 'started' }, error => { if (error) interrupt('owner_lost'); });
      } catch { interrupt('external_stop'); }
    });
    child.stdout.on('data', data => forward(child.stdout, data, process.stdout));
    child.stderr.on('data', data => forward(child.stderr, data, process.stderr));
    child.once('error', () => { clearTimeout(runtimeTimer); clearInterval(pollTimer); process.exit(2); });
    child.once('exit', (code, signal) => { childExit = { code, signal }; checkFinished(); });
    child.once('close', () => { streamsClosed = true; checkFinished(); });
    runtimeTimer = setTimeout(() => interrupt('timeout'), spec.maxRuntimeMs);
    pollTimer = setInterval(checkFinished, 20);
  });
} catch {
  clearTimeout(startupTimer);
  process.stderr.write('REVIEW_SUPERVISOR_UNAVAILABLE\n');
  process.exitCode = 2;
  if (process.connected) process.disconnect();
}
