import * as fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, createPublicKey, verify } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { canonicalJson } from './contracts.mjs';
import { readJson, readBounded, safePath } from './io.mjs';

const sourceRoot = fs.realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
// Narrow executable contract pin, not a claim of complete WorkingBaseline identity.
const protocolFiles = ['scripts/runtime/review-execution.mjs', 'scripts/runtime/review-supervisor.mjs', 'scripts/runtime/review-subreaper.py', 'scripts/runtime/io.mjs', 'scripts/runtime/contracts.mjs', 'scripts/runtime/closeout-obligations.mjs', 'scripts/runtime/closeout-receipt.mjs', 'scripts/runtime/closeout-recovery.mjs', 'extensions/pidex/index.ts', 'extensions/pidex/review-budget.ts', 'modules/pidex/analysis-metrics-history/scripts/pipeline/event.mjs'];
function observeProtocolDigest() { return createHash('sha256').update(Buffer.concat(protocolFiles.map(file => Buffer.concat([Buffer.from(file + '\0'), readBounded(sourceRoot, file).bytes])))).digest('hex'); }
export const EXECUTION_PROTOCOL_DIGEST = observeProtocolDigest();

export const SUBREAPER_SHIM = fileURLToPath(new URL('./review-subreaper.py', import.meta.url));
let supportChecked = false;
export function assertExecutionSupport() {
  if (observeProtocolDigest() !== EXECUTION_PROTOCOL_DIGEST) fail('REVIEW_EXECUTION_SCOPE_CHANGED');
  if (supportChecked) return;
  if (process.platform !== 'linux') fail('REVIEW_EXECUTION_UNCOVERED');
  const probe = spawnSync('python3', [SUBREAPER_SHIM, '--probe'], { timeout: 5000, stdio: 'ignore' });
  if (probe.error || probe.status !== 0) fail('REVIEW_EXECUTION_SUBREAPER_UNAVAILABLE');
  supportChecked = true;
}

const HEX = /^[a-f0-9]{64}$/;
const ID_KEYS = ['attemptId', 'planId', 'reviewGate', 'reviewMode', 'runFamilyId'];
const PHYSICAL_KEYS = ['physicalAttemptId', 'physicalGeneration', 'physicalOrdinal'];
export const executionDigest = value => createHash('sha256').update(canonicalJson(value)).digest('hex');
const digest = executionDigest;
function signedRecordValid(record, publicKey) {
  if (typeof publicKey !== 'string' || publicKey.length > 128 || typeof record.signature !== 'string' || record.signature.length !== 88) return false;
  const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), type: 'spki', format: 'der' });
  if (key.asymmetricKeyType !== 'ed25519') return false;
  const { signature, ...payload } = record;
  return verify(null, Buffer.from(canonicalJson(payload)), key, Buffer.from(signature, 'base64'));
}
const fail = code => { throw new Error(code); };
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...expected].sort().join('|');

export function validateCloseoutExecutionBinding(binding) {
  return keys(binding, ['kind', 'project', 'pipelineId', 'planId', 'dispatchId', 'actor', 'scope']) && binding.kind === 'closeout'
    && typeof binding.project === 'string' && path.isAbsolute(binding.project) && path.resolve(binding.project) === binding.project
    && typeof binding.pipelineId === 'string' && /^[a-zA-Z0-9._-]{1,160}$/.test(binding.pipelineId)
    && typeof binding.planId === 'string' && /^plan-[0-9]{1,40}$/.test(binding.planId) && typeof binding.dispatchId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(binding.dispatchId)
    && ['pidex-retrospective', 'pidex-pi', 'pidex-planner', 'pidex-roadmap', 'pidex-architect'].includes(binding.actor) && typeof binding.scope === 'string' && HEX.test(binding.scope);
}
export function validateExecutionBinding(binding) {
  if (binding?.kind === 'closeout') return validateCloseoutExecutionBinding(binding);
  if (!keys(binding, ['project', 'pipelineId', 'identity', 'physical', 'actor', 'scope'])) return false;
  const { identity: id, physical: p } = binding;
  if (!keys(id, ID_KEYS) || !keys(p, PHYSICAL_KEYS)) return false;
  if (!ID_KEYS.every(k => typeof id[k] === 'string' && id[k].length > 0 && id[k].length <= 160)) return false;
  if (!/^plan-[0-9]{1,40}$/.test(id.planId) || !['critic', 'code-review', 'security', 'qa'].includes(id.reviewGate) || !['initial', 'correction1', 'review1', 'correction2', 'review2'].includes(id.reviewMode)) return false;
  if (!Number.isInteger(p.physicalGeneration) || p.physicalGeneration < 0 || ![0, 1].includes(p.physicalOrdinal) || !HEX.test(p.physicalAttemptId)) return false;
  const expected = createHash('sha256').update([id.runFamilyId, id.planId, id.reviewGate, id.reviewMode, id.attemptId, p.physicalGeneration, p.physicalOrdinal].join('|')).digest('hex');
  const correction = id.reviewMode.startsWith('correction');
  const actor = correction ? (id.reviewGate === 'critic' ? 'pidex-planner' : 'pidex-implementer') : ({ critic: 'pidex-critic', 'code-review': 'pidex-code-reviewer', security: 'pidex-security', qa: 'pidex-qa' })[id.reviewGate];
  return expected === p.physicalAttemptId && binding.actor === actor && HEX.test(binding.scope) && typeof binding.pipelineId === 'string' && binding.pipelineId.length > 0 && binding.pipelineId.length <= 240 && typeof binding.project === 'string' && path.isAbsolute(binding.project) && path.resolve(binding.project) === binding.project;
}

export function executionDirectory(stateRoot, binding) {
  if (!validateExecutionBinding(binding)) fail('REVIEW_EXECUTION_IDENTITY_INVALID');
  // Scope is checked in the receipt, not used to open a second slot for one attempt.
  const { scope: _scope, ...identity } = binding;
  return safePath(stateRoot, `${binding.kind === 'closeout' ? 'closeout-executions' : 'review-executions'}/${digest(identity)}`);
}

export function linuxProcess(pid) {
  if (process.platform !== 'linux' || !Number.isInteger(pid) || pid <= 0) return null;
  try {
    const text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const fields = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
    return { pid, state: fields[0], parent: Number(fields[1]), group: Number(fields[2]), start: fields[19] };
  } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return null; throw error; }
}
export function linuxBoot() { return fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); }
export function processMatches(ref) {
  const current = linuxProcess(ref?.pid);
  return Boolean(current && current.start === ref.start && current.group === ref.group && !['Z', 'X'].includes(current.state));
}
// With a verified subreaper, every remaining live descendant has a highest
// live ancestor directly parented here. Recheck the kernel child list to avoid
// declaring quiescence during reparenting. Zombies cannot execute more work.
export function ownedExecutionChildren() {
  const file = `/proc/self/task/${process.pid}/children`;
  const before = fs.readFileSync(file, 'utf8').trim();
  const rows = before ? before.split(/\s+/).map(pid => linuxProcess(Number(pid))) : [];
  if (fs.readFileSync(file, 'utf8').trim() !== before || rows.some(row => !row || row.parent !== process.pid)) fail('REVIEW_EXECUTION_OBSERVATION_CHANGED');
  return rows.filter(row => !['Z', 'X'].includes(row.state));
}
export function signalExecutionChild(ref, signal) {
  if (!Number.isInteger(ref?.pid) || ref.pid <= 1 || !/^\d+$/.test(ref.start) || !['SIGTERM', 'SIGKILL'].includes(signal)) fail('REVIEW_EXECUTION_SIGNAL_INVALID');
  const result = spawnSync('python3', [SUBREAPER_SHIM, '--signal', String(ref.pid), ref.start, signal], { timeout: 1000, stdio: 'ignore' });
  if (result.error || ![0, 3].includes(result.status)) fail('REVIEW_EXECUTION_SIGNAL_UNCONFIRMED');
}
export function liveGroupMembers(group) {
  return fs.readdirSync('/proc').filter(p => /^\d+$/.test(p)).map(p => linuxProcess(Number(p))).filter(p => p && p.group === group && !['Z', 'X'].includes(p.state));
}

// Immutable no-replace publication. A crash leaving an extra hardlink is refused
// by readJson/readBounded rather than treated as a committed receipt.
export function publishExecutionRecord(directory, name, value) {
  const destination = safePath(directory, name);
  const temporary = safePath(directory, `.${name}.${randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, canonicalJson(value)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.linkSync(temporary, destination); }
  finally { fs.unlinkSync(temporary); }
  const dir = fs.openSync(directory, 'r');
  try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
}

export function prepareExecution(stateRoot, binding) {
  assertExecutionSupport();
  const directory = executionDirectory(stateRoot, binding);
  if (fs.realpathSync(binding.project) !== binding.project) fail('REVIEW_EXECUTION_IDENTITY_INVALID');
  fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  // An existing slot is never overwritten or adopted, even if its owner died.
  fs.mkdirSync(directory, { mode: 0o700 });
  const owner = linuxProcess(process.pid);
  if (!owner) fail('REVIEW_EXECUTION_OWNER_UNAVAILABLE');
  const descriptor = { version: 1, binding, boot: linuxBoot(), nonce: randomUUID(), protocol: EXECUTION_PROTOCOL_DIGEST, owner: { pid: owner.pid, start: owner.start, group: owner.group } };
  publishExecutionRecord(directory, 'dispatch.json', descriptor);
  return { directory, descriptor };
}

export function requestExecutionStop(directory, reason) {
  if (!['user_abort', 'timeout', 'turn_limit', 'final_drain', 'admission_failed'].includes(reason)) fail('REVIEW_EXECUTION_CONTROL_INVALID');
  const descriptor = readJson(directory, 'dispatch.json');
  const value = { version: 1, nonce: descriptor.nonce, reason };
  try { publishExecutionRecord(directory, `${reason}.json`, value); }
  catch (error) {
    if (error.code !== 'EEXIST' || canonicalJson(readJson(directory, `${reason}.json`)) !== canonicalJson(value)) throw error;
  }
}
export function hasExecutionStop(directory, descriptor, reason) {
  try {
    if (canonicalJson(readJson(directory, `${reason}.json`)) !== canonicalJson({ version: 1, nonce: descriptor.nonce, reason })) fail('REVIEW_EXECUTION_CONTROL_INVALID');
    return true;
  }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function inspectExecution(stateRoot, binding, expectedStartDigest) {
  try {
    if (observeProtocolDigest() !== EXECUTION_PROTOCOL_DIGEST) return { status: 'uncertain', code: 'REVIEW_EXECUTION_SCOPE_CHANGED' };
    const directory = executionDirectory(stateRoot, binding);
    let descriptor;
    try { descriptor = readJson(directory, 'dispatch.json'); }
    catch (error) { if (error.code === 'ENOENT') return { status: 'unrecorded' }; throw error; }
    if (!keys(descriptor, ['version', 'binding', 'boot', 'nonce', 'owner', 'protocol']) || descriptor.protocol !== EXECUTION_PROTOCOL_DIGEST || descriptor.version !== 1 || !validateExecutionBinding(descriptor.binding) || canonicalJson(descriptor.binding) !== canonicalJson(binding) || descriptor.boot !== linuxBoot() || !/^[a-f0-9-]{36}$/.test(descriptor.nonce)) return { status: 'uncertain', code: 'REVIEW_EXECUTION_MISMATCH' };
    let started;
    try { started = readJson(directory, 'started.json'); }
    catch (error) { if (error.code === 'ENOENT') return { status: 'uncertain', code: 'REVIEW_EXECUTION_START_UNCONFIRMED' }; throw error; }
    if (!keys(started, ['version', 'nonce', 'supervisor', 'childPid', 'descriptorDigest', 'publicKey', 'signature']) || started.descriptorDigest !== digest(descriptor) || !signedRecordValid(started, started.publicKey) || started.version !== 1 || started.nonce !== descriptor.nonce || !keys(started.supervisor, ['pid', 'start', 'group']) || !Number.isInteger(started.supervisor.pid) || started.supervisor.pid <= 0 || started.supervisor.group !== started.supervisor.pid || !/^\d+$/.test(started.supervisor.start) || !Number.isInteger(started.childPid) || started.childPid <= 0) return { status: 'uncertain', code: 'REVIEW_EXECUTION_RECEIPT_INVALID' };
    if (!HEX.test(expectedStartDigest ?? '') || digest(started) !== expectedStartDigest) return { status: 'uncertain', code: 'REVIEW_EXECUTION_PIN_MISMATCH' };
    if (processMatches(started.supervisor)) return { status: 'running' };
    let ended;
    try { ended = readJson(directory, 'ended.json'); }
    catch (error) { if (error.code === 'ENOENT') return { status: 'uncertain', code: 'REVIEW_EXECUTION_END_UNCONFIRMED' }; throw error; }
    if (!keys(ended, ['version', 'nonce', 'supervisor', 'childPid', 'exitCode', 'signal', 'reason', 'quiescent', 'descriptorDigest', 'signature']) || ended.descriptorDigest !== started.descriptorDigest || !signedRecordValid(ended, started.publicKey) || ended.version !== 1 || ended.nonce !== descriptor.nonce || canonicalJson(ended.supervisor) !== canonicalJson(started.supervisor) || ended.childPid !== started.childPid || ended.quiescent !== true || !(ended.exitCode === null || (Number.isInteger(ended.exitCode) && ended.exitCode >= 0 && ended.exitCode <= 255)) || ![null, 'SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGPIPE'].includes(ended.signal) || (ended.exitCode === null) === (ended.signal === null) || !['exited', 'owner_lost', 'external_stop', 'user_abort', 'timeout', 'turn_limit', 'final_drain', 'admission_failed'].includes(ended.reason)) return { status: 'uncertain', code: 'REVIEW_EXECUTION_RECEIPT_INVALID' };
    // A durable explicit abort dominates even a late failure/timeout receipt.
    if (hasExecutionStop(directory, descriptor, 'user_abort') || ended.reason === 'user_abort') return { status: 'aborted', receiptDigest: digest(ended) };
    if (hasExecutionStop(directory, descriptor, 'admission_failed') || ended.reason === 'admission_failed') return { status: 'uncertain', code: 'REVIEW_EXECUTION_ACCEPTANCE_INVALID' };
    if (ended.exitCode === 0 || ended.reason === 'final_drain') return { status: 'finished', code: 'REVIEW_COMPLETION_UNCONFIRMED', receiptDigest: digest(ended), exitCode: ended.exitCode, reason: ended.reason };
    return { status: 'failed', exitCode: ended.exitCode, signal: ended.signal, reason: ended.reason, receiptDigest: digest(ended) };
  } catch { return { status: 'uncertain', code: 'REVIEW_EXECUTION_UNAVAILABLE' }; }
}

// Low-level process launcher, not review admission. Caller must reserve first.
// Executable/args/env travel in memory only; receipts contain no environment.
export function spawnObservedExecution({ stateRoot, binding, command, args = [], cwd, env = process.env, onProcessStarted, maxRuntimeMs = 3_600_000 }) {
  let directory;
  try { ({ directory } = prepareExecution(stateRoot, binding)); }
  catch (error) { throw Object.assign(new Error('REVIEW_EXECUTION_PREPARE_FAILED'), { code: error.code, cause: error }); }
  const supervisor = fileURLToPath(new URL('./review-supervisor.mjs', import.meta.url));
  const proc = spawn('python3', [SUBREAPER_SHIM, process.execPath, supervisor, directory], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let accepted = false;
  let supervisorRef;
  proc.on('message', message => {
    if (message?.type !== 'started' || accepted) return;
    accepted = true;
    try {
      const started = readJson(directory, 'started.json');
      if (started.supervisor?.pid !== proc.pid || !signedRecordValid(started, started.publicKey)) fail('REVIEW_EXECUTION_ACCEPTANCE_INVALID');
      onProcessStarted?.({ executionStartDigest: digest(started) });
    } catch { requestExecutionStop(directory, 'admission_failed'); proc.kill('SIGTERM'); }
  });
  proc.once('spawn', () => {
    supervisorRef = linuxProcess(proc.pid);
    proc.send({ command, args, cwd, maxRuntimeMs }, error => { if (error && processMatches(supervisorRef)) proc.kill('SIGTERM'); });
  });
  return {
    proc, directory,
    stop: reason => {
      if (!['user_abort', 'timeout', 'turn_limit', 'final_drain', 'admission_failed'].includes(reason)) fail('REVIEW_EXECUTION_CONTROL_INVALID');
      let persisted = true;
      try { requestExecutionStop(directory, reason); } catch { persisted = false; }
      if (proc.connected) {
        proc.send({ type: 'stop', reason }, error => { if (error && processMatches(supervisorRef)) proc.kill('SIGTERM'); });
        return true;
      }
      return persisted && processMatches(supervisorRef) ? proc.kill('SIGTERM') : false;
    },
    hardStop: () => {
      if (!processMatches(supervisorRef) || supervisorRef.group !== supervisorRef.pid) return false;
      if (!proc.connected) return false;
      proc.send({ type: 'hard-stop' }, () => {});
      return true;
    },
  };
}
