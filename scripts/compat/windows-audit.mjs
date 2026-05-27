#!/usr/bin/env node
// Read-only Windows compatibility audit for PIDEX. No installs, no mutation.

import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const COMMANDS = ['bash', 'node', 'npm', 'git', 'pi'];
const RISKY_ENTRYPOINTS = [
  ['install.sh', 'linux-owned', 'Prefer a future install.windows.ps1; do not add inline Windows branches to install.sh.'],
  ['uninstall.sh', 'linux-owned', 'Prefer a future uninstall.windows.ps1.'],
  ['dashboard/start.sh', 'linux-owned', 'Prefer a future dashboard/start.windows.mjs or dashboard/start.windows.ps1.'],
  ['scripts/release/public-readiness.sh', 'linux-owned', 'Use this read-only audit or a future public-readiness.windows.mjs for Windows checks.'],
  ['scripts/git-hooks/install-global.sh', 'linux-owned', 'Use a future Windows-specific hook installer or document unsupported behavior.'],
];

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function splitPathEnv() {
  return (process.env.Path || process.env.PATH || '').split(path.delimiter).filter(Boolean);
}

function commandNames(command) {
  if (process.platform === 'win32') {
    if (command.endsWith('.exe') || command.endsWith('.cmd') || command.endsWith('.ps1')) return [command];
    return [`${command}.exe`, `${command}.cmd`, `${command}.ps1`, command];
  }
  return [command];
}

function which(command) {
  for (const dir of splitPathEnv()) {
    for (const name of commandNames(command)) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function gitBashCandidates() {
  return ['ProgramFiles', 'ProgramFiles(x86)']
    .map((key) => process.env[key])
    .filter(Boolean)
    .map((base) => path.join(base, 'Git', 'bin', 'bash.exe'));
}

function resolveCommand(command) {
  const found = which(command);
  if (found) return found;
  if (command === 'bash' && process.platform === 'win32') {
    return gitBashCandidates().find((candidate) => existsSync(candidate)) || null;
  }
  return null;
}

function commandVersion(command, executable) {
  const argsByCommand = {
    bash: ['--version'],
    node: ['--version'],
    npm: ['--version'],
    git: ['--version'],
    pi: ['--version'],
  };
  let runCommand = executable;
  let runArgs = argsByCommand[command];
  if (process.platform === 'win32') {
    const lower = executable.toLowerCase();
    if (['npm', 'pi'].includes(command)) {
      runCommand = process.env.ComSpec || 'cmd.exe';
      runArgs = ['/d', '/c', `${command} ${argsByCommand[command].join(' ')}`];
    } else if (lower.endsWith('.ps1')) {
      runCommand = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
      runArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', executable, ...argsByCommand[command]];
    } else if (lower.endsWith('.cmd') || lower.endsWith('.bat') || !path.extname(executable)) {
      runCommand = process.env.ComSpec || 'cmd.exe';
      runArgs = ['/d', '/c', `${command} ${argsByCommand[command].join(' ')}`];
    }
  }
  const result = spawnSync(runCommand, runArgs, { encoding: 'utf8', timeout: 5000 });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split(/\r?\n/).filter(Boolean);
  return { version: output[0] || null, works: result.status === 0 };
}

function auditCommands() {
  const result = {};
  for (const command of COMMANDS) {
    const found = resolveCommand(command);
    let version = null;
    let executableWorks = false;
    if (found) {
      ({ version, works: executableWorks } = commandVersion(command, found));
    }
    result[command] = {
      available: Boolean(found) && (executableWorks || command === 'pi'),
      path: found,
      version,
      executable_works: executableWorks,
    };
  }
  return result;
}

function detectEnvironment() {
  const release = os.release();
  const env = Object.fromEntries(['MSYSTEM', 'MINGW_PREFIX', 'WSL_DISTRO_NAME', 'WT_SESSION'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
  const isWsl = Boolean(env.WSL_DISTRO_NAME) || release.toLowerCase().includes('microsoft');
  const isGitBash = Boolean(env.MSYSTEM || env.MINGW_PREFIX);
  let kind;
  if (isWsl) kind = 'wsl';
  else if (process.platform === 'win32' && isGitBash) kind = 'windows-git-bash';
  else if (process.platform === 'win32') kind = 'windows-native';
  else if (isGitBash) kind = 'git-bash-like';
  else if (process.platform === 'linux') kind = 'linux';
  else if (process.platform === 'darwin') kind = 'macos';
  else kind = process.platform || 'unknown';
  return {
    kind,
    platform_system: os.type(),
    platform_release: release,
    platform_version: os.version?.() || '',
    machine: os.arch(),
    node_executable: process.execPath,
    environment_markers: env,
  };
}

function pathShape(root) {
  const home = os.homedir();
  return {
    repo_root: root,
    home,
    is_expected_linux_checkout: path.resolve(root).toLowerCase() === path.resolve(home, 'pidex').toLowerCase(),
    contains_backslashes: root.includes('\\'),
    contains_spaces: root.includes(' '),
    has_drive_prefix: /^[A-Za-z]:/.test(root),
    starts_with_slash: root.startsWith('/'),
  };
}

function dashboardPrerequisites(root, commands) {
  const dashboard = path.join(root, 'dashboard');
  return {
    dashboard_dir_exists: existsSync(dashboard),
    package_json_exists: existsSync(path.join(dashboard, 'package.json')),
    node_available: commands.node.available,
    npm_available: commands.npm.available,
    node_modules_present: existsSync(path.join(dashboard, 'node_modules')),
    suggested_checks: ['npm --prefix dashboard run typecheck', 'npm --prefix dashboard run build'],
  };
}

function riskyEntrypoints(root) {
  return RISKY_ENTRYPOINTS.map(([entryPath, status, windows_guidance]) => ({
    path: entryPath,
    status,
    windows_guidance,
    exists: existsSync(path.join(root, ...entryPath.split('/'))),
  }));
}

function parseNodeMajorMinor(version) {
  if (!version) return null;
  const match = version.trim().match(/^v?(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function findings(environment, commands, paths) {
  const items = [];
  if (environment.kind === 'linux') items.push({ level: 'info', message: "Linux detected; this is PIDEX's canonical currently tested path." });
  else if (environment.kind === 'wsl') items.push({ level: 'info', message: 'WSL detected; this is the safest Windows recommendation for now, pending explicit PIDEX smoke evidence.' });
  else if (environment.kind === 'windows-git-bash') items.push({ level: 'warning', message: 'Windows Git Bash detected; Pi supports a Git Bash path, but PIDEX support is still experimental.' });
  else if (environment.kind === 'windows-native') items.push({ level: 'warning', message: 'Native Windows detected; PIDEX does not currently claim full PowerShell/CMD runtime support.' });
  else items.push({ level: 'warning', message: `Unvalidated platform detected: ${environment.kind}.` });

  for (const command of ['bash', 'node', 'npm', 'git', 'pi']) {
    if (!commands[command].available) items.push({ level: 'warning', message: `Required or expected command not found on PATH/standard location: ${command}.` });
  }
  const nodeVersion = parseNodeMajorMinor(commands.node.version);
  if (nodeVersion && (nodeVersion[0] < 22 || (nodeVersion[0] === 22 && nodeVersion[1] < 12))) {
    items.push({ level: 'warning', message: 'PIDEX Windows bootstrap/dashboard dependencies require Node >=22.12.0; current node appears older.' });
  }
  if (paths.contains_spaces) items.push({ level: 'warning', message: 'PIDEX checkout path contains spaces; this is not yet validated for Windows support.' });
  if (!paths.is_expected_linux_checkout) items.push({ level: 'info', message: 'PIDEX v0.1 documents ~/pidex / $HOME\\pidex as the expected checkout path.' });
  return items;
}

function buildReport() {
  const root = repoRoot();
  const environment = detectEnvironment();
  const commands = auditCommands();
  const paths = pathShape(root);
  return {
    audit: 'pidex-windows-compatibility',
    implementation: 'node',
    read_only: true,
    support_summary: {
      linux: 'supported/currently tested',
      wsl2: 'safest Windows recommendation for now',
      windows_git_bash: 'experimental/under analysis',
      native_powershell_cmd: 'experimental bootstrap only; full runtime not claimed',
    },
    environment,
    commands,
    path_shape: paths,
    dashboard: dashboardPrerequisites(root, commands),
    known_unsupported_or_risky_entrypoints: riskyEntrypoints(root),
    findings: findings(environment, commands, paths),
  };
}

function printText(report) {
  console.log('PIDEX Windows compatibility audit (read-only)');
  console.log('===============================================');
  console.log(`Environment: ${report.environment.kind} (${report.environment.platform_system} ${report.environment.platform_release})`);
  console.log(`Repo root: ${report.path_shape.repo_root}`);
  console.log('\nSupport summary:');
  for (const [key, value] of Object.entries(report.support_summary)) console.log(`  - ${key}: ${value}`);
  console.log('\nCommands:');
  for (const [command, info] of Object.entries(report.commands)) {
    const status = info.available ? 'found' : 'missing';
    const suffix = info.version ? ` — ${info.version}` : '';
    console.log(`  - ${command}: ${status}${suffix}`);
  }
  console.log('\nDashboard prerequisites:');
  for (const [key, value] of Object.entries(report.dashboard)) if (key !== 'suggested_checks') console.log(`  - ${key}: ${value}`);
  console.log('\nKnown unsupported/risky entrypoints:');
  for (const entry of report.known_unsupported_or_risky_entrypoints) console.log(`  - ${entry.path}: ${entry.status} (${entry.exists ? 'exists' : 'missing'})`);
  console.log('\nFindings:');
  for (const item of report.findings) console.log(`  - [${item.level}] ${item.message}`);
}

const json = process.argv.includes('--json');
const report = buildReport();
if (json) console.log(JSON.stringify(report, null, 2));
else printText(report);
