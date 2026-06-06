#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_IMAGE = 'node:22-slim';

export function parseArgs(argv) {
  const out = { json: false, image: DEFAULT_IMAGE };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') { out.json = true; continue; }
    if (arg === '--image') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('missing value for --image');
      out.image = value;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') { out.help = true; continue; }
    throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

export function classifyOs({ platform = process.platform, env = process.env, procVersion = readProcVersion() } = {}) {
  if (platform === 'win32') return commandExists('bash') ? 'windows-git-bash' : 'windows-native';
  if (platform === 'linux' && /microsoft|wsl/i.test(procVersion || '')) return 'wsl2';
  if (platform === 'linux') return 'linux';
  return 'other';
}

function readProcVersion() {
  try { return readFileSync('/proc/version', 'utf8'); } catch { return ''; }
}

export function commandExists(bin, runner = spawnSync) {
  const proc = process.platform === 'win32'
    ? runner('where', [bin], { encoding: 'utf8' })
    : runner('command', ['-v', bin], { shell: true, encoding: 'utf8' });
  return proc.status === 0;
}

function preview(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function failedCheck(id, reason, details = {}) {
  return { id, ok: false, reason, ...details };
}

function passedCheck(id, details = {}) {
  return { id, ok: true, ...details };
}

function run(runner, bin, args, timeoutMs = 120_000) {
  return runner(bin, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
}

function dockerFailureReason(step, proc) {
  if (proc.error?.code === 'ENOENT') return 'docker-cli-not-found';
  if (proc.error?.code === 'ETIMEDOUT') return `${step}-timed-out`;
  const stderr = preview(proc.stderr);
  const stdout = preview(proc.stdout);
  if (/Cannot connect to the Docker daemon|docker daemon is not running|Is the docker daemon running/i.test(`${stderr} ${stdout}`)) return 'docker-daemon-unavailable';
  if (/permission denied|Got permission denied/i.test(`${stderr} ${stdout}`)) return 'docker-permission-denied';
  if (/image operating system|no matching manifest|linux/i.test(`${stderr} ${stdout}`) && step.includes('linux')) return 'linux-containers-unavailable';
  if (/Mounts denied|drive is not shared|file sharing|not a shared path|invalid mount config|permission denied/i.test(`${stderr} ${stdout}`)) return 'docker-mount-write-unavailable';
  return `${step}-failed`;
}

function actionable(reason, osId) {
  const windowsMount = osId === 'windows-native' || osId === 'windows-git-bash';
  const messages = {
    'docker-cli-not-found': 'Install Docker and ensure the docker CLI is on PATH.',
    'docker-daemon-unavailable': windowsMount ? 'Start Docker Desktop, switch to Linux containers, then retry.' : 'Start Docker Engine/daemon and ensure your user can access it.',
    'docker-permission-denied': windowsMount ? 'Check Docker Desktop permissions and retry from a shell allowed to use Docker.' : 'Add your user to the docker group or use a Docker context your user can access, then retry.',
    'linux-containers-unavailable': windowsMount ? 'Switch Docker Desktop to Linux containers; PIDEX sandbox MVP uses Linux images.' : 'Ensure Docker can run Linux containers and pull/run the selected image.',
    'docker-mount-write-unavailable': windowsMount ? 'Enable Docker Desktop file sharing for the temp directory/drive and retry; mount+write is required.' : 'Ensure Docker can bind-mount and write to the temporary directory.',
  };
  return messages[reason] || 'Inspect the failed check stdout/stderr preview and fix Docker before enabling hardened-pipeline.';
}

export function createProbeResult({ ok, modeAvailable, osId, image, checks, tempDir, reason }) {
  const firstFailure = checks.find((check) => !check.ok);
  const unavailableReason = reason || firstFailure?.reason;
  return {
    ok,
    available: modeAvailable,
    mode: modeAvailable ? 'hardened-pipeline' : 'unavailable',
    os: osId,
    image,
    temp_dir: tempDir || null,
    checks,
    reason: unavailableReason || null,
    actionable: unavailableReason ? actionable(unavailableReason, osId) : null,
  };
}

export function runProbe(options = {}) {
  const runner = options.runner || spawnSync;
  const image = options.image || DEFAULT_IMAGE;
  const osId = options.osId || classifyOs(options.osOptions || {});
  const checks = [passedCheck('os-classification', { os: osId })];

  if (!commandExists('docker', runner)) {
    checks.push(failedCheck('docker-cli', 'docker-cli-not-found'));
    return createProbeResult({ ok: false, modeAvailable: false, osId, image, checks });
  }
  checks.push(passedCheck('docker-cli'));

  const info = run(runner, 'docker', ['info', '--format', '{{json .ServerVersion}}'], 30_000);
  if (info.status !== 0) {
    checks.push(failedCheck('docker-daemon', dockerFailureReason('docker-daemon', info), { stderr_preview: preview(info.stderr), stdout_preview: preview(info.stdout) }));
    return createProbeResult({ ok: false, modeAvailable: false, osId, image, checks });
  }
  checks.push(passedCheck('docker-daemon', { server_version: preview(info.stdout).replace(/^"|"$/g, '') }));

  const uname = run(runner, 'docker', ['run', '--rm', image, 'uname', '-s']);
  if (uname.status !== 0 || !/^Linux\s*$/i.test(String(uname.stdout || '').trim())) {
    checks.push(failedCheck('linux-container', dockerFailureReason('linux-container', uname), { stderr_preview: preview(uname.stderr), stdout_preview: preview(uname.stdout) }));
    return createProbeResult({ ok: false, modeAvailable: false, osId, image, checks });
  }
  checks.push(passedCheck('linux-container', { uname: String(uname.stdout).trim() }));

  const node = run(runner, 'docker', ['run', '--rm', image, 'node', '--version']);
  if (node.status !== 0 || !/^v\d+\./.test(String(node.stdout || '').trim())) {
    checks.push(failedCheck('node-container', dockerFailureReason('node-container', node), { stderr_preview: preview(node.stderr), stdout_preview: preview(node.stdout) }));
    return createProbeResult({ ok: false, modeAvailable: false, osId, image, checks });
  }
  checks.push(passedCheck('node-container', { node_version: String(node.stdout).trim() }));

  const tempDir = options.tempDir || mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-probe-'));
  const marker = 'pidex-sandbox-probe-ok';
  const markerFile = path.join(tempDir, 'probe.txt');
  try {
    const mount = `${tempDir}:/workspace`;
    const write = run(runner, 'docker', ['run', '--rm', '-v', mount, '-w', '/workspace', image, 'sh', '-lc', `printf ${marker} > probe.txt`]);
    if (write.status !== 0) {
      checks.push(failedCheck('temp-mount-write', dockerFailureReason('temp-mount-write', write), { stderr_preview: preview(write.stderr), stdout_preview: preview(write.stdout) }));
      return createProbeResult({ ok: false, modeAvailable: false, osId, image, checks, tempDir });
    }
    checks.push(passedCheck('temp-mount-write'));

    const hostObserved = existsSync(markerFile) && readFileSync(markerFile, 'utf8') === marker;
    if (!hostObserved) {
      checks.push(failedCheck('host-observed-write', 'host-did-not-observe-container-write'));
      return createProbeResult({ ok: false, modeAvailable: false, osId, image, checks, tempDir });
    }
    checks.push(passedCheck('host-observed-write'));
    return createProbeResult({ ok: true, modeAvailable: true, osId, image, checks, tempDir });
  } finally {
    if (!options.keepTemp && tempDir && path.basename(tempDir).startsWith('pidex-sandbox-probe-')) {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
}

function printHelp() {
  console.log('Usage: node modules/pidex/sandbox-runtime/scripts/sandbox/probe.mjs --json [--image node:22-slim]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { printHelp(); process.exit(0); }
    if (!args.json) throw new Error('--json is required; probe emits JSON only');
    const result = runProbe({ image: args.image });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, available: false, mode: 'unavailable', reason: 'probe-error', actionable: error.message }, null, 2));
    process.exit(1);
  }
}
