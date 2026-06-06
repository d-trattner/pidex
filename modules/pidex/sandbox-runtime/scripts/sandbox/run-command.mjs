#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { detectPackageManager } from '../../../../../scripts/package-manager/detect.mjs';
import { buildPackageManagerCommand } from '../../../../../scripts/package-manager/commands.mjs';
import { createSandboxRun } from './lifecycle.mjs';
import { DEFAULT_IMAGE, REQUIRED_PNPM, detectEnvMetadata, validatePhase } from './policy.mjs';

export function parseRunArgs(argv) {
  const out = { project: process.cwd(), pidexRoot: process.cwd(), mode: 'hardened-pipeline', image: DEFAULT_IMAGE, timeoutSeconds: 300, phase: 'edit', preset: '', json: false, command: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') { out.command = argv.slice(i + 1); break; }
    if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--pidex-root') out.pidexRoot = argv[++i] || '';
    else if (arg === '--mode') out.mode = argv[++i] || '';
    else if (arg === '--image') out.image = argv[++i] || '';
    else if (arg === '--timeout-seconds') out.timeoutSeconds = Number(argv[++i] || '0');
    else if (arg === '--phase') out.phase = argv[++i] || '';
    else if (arg === '--preset') out.preset = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function run(bin, args, options = {}) {
  return spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, ...options });
}

function dockerArgs(opts, command) {
  const base = [
    'run', '--rm',
    '--label', 'pidex.sandbox=true',
    '--label', `pidex.sandbox.run_id=${opts.runId}`,
    '--label', `pidex.sandbox.project=${path.basename(opts.projectRoot).replace(/[^A-Za-z0-9_.-]/g, '-')}`,
    '--label', `pidex.sandbox.created_at=${new Date().toISOString()}`,
    '--cap-drop=ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '512', '--memory', '4g', '--cpus', '2',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=1g',
    '--network', opts.network,
  ];
  for (const file of opts.envFiles || []) base.push('--env-file', path.join(opts.projectRoot, file));
  base.push('-v', `${path.resolve(opts.workspace)}:/workspace`, '-w', '/workspace', opts.image, ...command);
  return base;
}

function checkPnpmPrefix() {
  return `if command -v pnpm >/dev/null 2>&1 && [ "$(pnpm --version)" = "${REQUIRED_PNPM}" ]; then true; elif command -v corepack >/dev/null 2>&1 && [ "$(corepack pnpm --version 2>/dev/null)" = "${REQUIRED_PNPM}" ]; then corepack enable >/dev/null 2>&1 || true; else npm install -g pnpm@${REQUIRED_PNPM} >/dev/null && [ "$(pnpm --version)" = "${REQUIRED_PNPM}" ]; fi`;
}

export function commandForPreset(preset, workspace) {
  if (!preset) return null;
  if (preset !== 'package-install-check') throw new Error(`unsupported preset: ${preset}`);
  const detection = detectPackageManager({ project: workspace, mode: 'existing' });
  const argv = buildPackageManagerCommand(detection, { operation: 'install-frozen-ignore-scripts' });
  if (detection.package_manager === 'pnpm') return { argv: ['sh', '-lc', `${checkPnpmPrefix()} && pnpm install --frozen-lockfile --ignore-scripts`], phase: 'install', network: 'default', network_reason: 'package-install', detection };
  return { argv, phase: 'install', network: 'default', network_reason: 'package-install', detection };
}

function sensitiveEnvSummary(items = []) {
  return {
    sensitive_env_key_count: items.length,
    sensitive_env_key_reasons: [...new Set(items.map((item) => item.reason).filter(Boolean))].sort(),
  };
}

export function runSandboxCommand(options = {}) {
  if (options.mode === 'off') return { ok: false, reason: 'sandbox-mode-off' };
  if (options.mode !== 'hardened-pipeline') throw new Error(`unsupported sandbox mode: ${options.mode}`);
  const runState = createSandboxRun(options);
  const preset = commandForPreset(options.preset, runState.workspace);
  const command = preset?.argv || options.command || [];
  if (!command.length) throw new Error('command is required after -- unless --preset is used');
  const phaseInfo = validatePhase(preset?.phase || options.phase || 'edit', command);
  if (!phaseInfo.ok) return { ok: false, reason: phaseInfo.reason, run_id: runState.run_id, workspace: runState.workspace };
  const env = detectEnvMetadata(path.resolve(options.project), phaseInfo);
  if (env.sensitive_env_keys?.length) {
    return { ok: false, reason: 'sensitive-env-keys-blocked', run_id: runState.run_id, workspace: runState.workspace, env_files: env.env_files, ...sensitiveEnvSummary(env.sensitive_env_keys) };
  }
  const network = preset?.network || (env.api_hosts.length ? 'default' : 'none');
  const networkReason = preset?.network_reason || (env.api_hosts.length ? 'project-env-api-urls-detected' : 'static-command');
  const stdoutLog = path.join(runState.logs, 'stdout.log');
  const stderrLog = path.join(runState.logs, 'stderr.log');
  const args = dockerArgs({ runId: runState.run_id, projectRoot: path.resolve(options.project), workspace: runState.workspace, image: options.image || DEFAULT_IMAGE, network, envFiles: env.env_files }, command);
  const started = Date.now();
  const proc = run('docker', args, { timeout: (options.timeoutSeconds || 300) * 1000 });
  writeFileSync(stdoutLog, proc.stdout || '');
  writeFileSync(stderrLog, proc.stderr || '');
  const metadata = JSON.parse(readFileSync(runState.metadata_path, 'utf8'));
  Object.assign(metadata, {
    network,
    network_reason: networkReason,
    env_files_used: env.env_files,
    env_keys: env.env_keys,
    sensitive_env_keys: env.sensitive_env_keys,
    api_hosts_detected: env.api_hosts,
    env_values_recorded: false,
    command_phase: phaseInfo.phase,
    package_manager: preset?.detection?.package_manager,
    install_scripts: preset ? 'disabled' : metadata.install_scripts,
    docker_argv_preview: ['docker', ...args.slice(0, 12), '...'],
    exit_code: proc.status,
    signal: proc.signal,
    duration_ms: Date.now() - started,
    stdout_log: stdoutLog,
    stderr_log: stderrLog,
  });
  writeFileSync(runState.metadata_path, JSON.stringify(metadata, null, 2));
  return {
    ok: proc.status === 0,
    reason: proc.status === 0 ? null : (proc.error?.code === 'ETIMEDOUT' ? 'command-timeout' : 'docker-command-failed'),
    run_id: runState.run_id,
    workspace: runState.workspace,
    metadata_path: runState.metadata_path,
    stdout_log: stdoutLog,
    stderr_log: stderrLog,
    exit_code: proc.status,
    stdout_preview: String(proc.stdout || '').slice(0, 8000),
    stderr_preview: String(proc.stderr || '').slice(0, 8000),
  };
}

function usage() { return 'Usage: run-command.mjs --project PATH --mode hardened-pipeline [--phase test|check|build|integration|edit|install] [--preset package-install-check] -- COMMAND...'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseRunArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = runSandboxCommand(args);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
