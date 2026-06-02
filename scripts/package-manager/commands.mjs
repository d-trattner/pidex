#!/usr/bin/env node
import process from 'node:process';
import { detectPackageManager } from './detect.mjs';

const OPERATIONS = new Set([
  'install-frozen',
  'install-frozen-ignore-scripts',
  'run-script',
  'exec',
  'audit-moderate',
]);

function parseArgs(argv) {
  const out = { project: process.cwd(), mode: 'existing', operation: '', script: '', bin: '', args: [], json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--mode') out.mode = argv[++i] || '';
    else if (arg === '--operation') out.operation = argv[++i] || '';
    else if (arg === '--script') out.script = argv[++i] || '';
    else if (arg === '--bin') out.bin = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '--') { out.args = argv.slice(i + 1); break; }
    else if (arg === '-h' || arg === '--help') out.help = true;
    else throw new Error(`Unknown arg: ${arg}`);
  }
  if (!out.help && !OPERATIONS.has(out.operation)) throw new Error(`Invalid --operation: ${out.operation || '(empty)'}`);
  if (!['existing', 'greenfield'].includes(out.mode)) throw new Error(`Invalid --mode: ${out.mode || '(empty)'}`);
  return out;
}

function usage() {
  return `Usage: commands.mjs --operation OP [--project PATH] [--mode existing|greenfield] [--script NAME] [--bin NAME] [--json] [-- ARGS...]\n\nOperations: ${[...OPERATIONS].join(', ')}\nBuild package-manager command argv without executing it.`;
}

function assertToken(name, value, pattern) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${name} is required`);
  if (!pattern.test(raw)) throw new Error(`invalid ${name}: ${raw}`);
  return raw;
}

function assertExtraArgs(args = []) {
  for (const arg of args) {
    if (String(arg).includes('\0')) throw new Error('invalid arg: contains NUL byte');
  }
  return args.map(String);
}

function ensureRunnable(detection) {
  if (detection.support === 'conflict') throw new Error('package-manager conflict; refusing to build command');
  if (detection.support === 'unknown') throw new Error('package-manager unknown; refusing to build command');
  if (detection.support === 'unsupported') throw new Error(`package-manager unsupported: ${detection.package_manager}`);
  if (!['pnpm', 'npm'].includes(detection.package_manager)) throw new Error(`package-manager not supported for commands: ${detection.package_manager}`);
}

export function buildPackageManagerCommand(detection, request = {}) {
  const operation = request.operation;
  if (!OPERATIONS.has(operation)) throw new Error(`Invalid operation: ${operation || '(empty)'}`);
  ensureRunnable(detection);

  const manager = detection.package_manager;
  const extraArgs = assertExtraArgs(request.args || []);

  if (operation === 'install-frozen') {
    return manager === 'pnpm'
      ? ['pnpm', 'install', '--frozen-lockfile']
      : ['npm', 'ci'];
  }
  if (operation === 'install-frozen-ignore-scripts') {
    return manager === 'pnpm'
      ? ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts']
      : ['npm', 'ci', '--ignore-scripts'];
  }
  if (operation === 'run-script') {
    const script = assertToken('script', request.script, /^[A-Za-z0-9:_./-]+$/);
    return manager === 'pnpm'
      ? ['pnpm', 'run', script, ...extraArgs]
      : ['npm', 'run', script, ...extraArgs];
  }
  if (operation === 'exec') {
    const bin = assertToken('bin', request.bin, /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/);
    return manager === 'pnpm'
      ? ['pnpm', 'exec', bin, ...extraArgs]
      : ['npm', 'exec', '--', bin, ...extraArgs];
  }
  if (operation === 'audit-moderate') {
    return manager === 'pnpm'
      ? ['pnpm', 'audit', '--audit-level', 'moderate']
      : ['npm', 'audit', '--audit-level=moderate'];
  }
  throw new Error(`Unhandled operation: ${operation}`);
}

export function packageManagerCommand(options = {}) {
  const detection = options.detection || detectPackageManager({ project: options.project, mode: options.mode || 'existing' });
  const argv = buildPackageManagerCommand(detection, options);
  return { detection, operation: options.operation, argv };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); return; }
    const result = packageManagerCommand(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.argv.join('\t'));
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
