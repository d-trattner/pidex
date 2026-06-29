#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { dockerSpawnSync } from './docker-spawn.mjs';
import { fileURLToPath } from 'node:url';
import { loadProjectRecord, saveProjectRecord } from './registry.mjs';

const BROAD_ROOTS = new Set(['.ssh', '.config', '.pi', '.codex']);

function docker(args, opts = {}) {
  const proc = dockerSpawnSync(args, { encoding: opts.input ? undefined : 'utf8', maxBuffer: 10 * 1024 * 1024, ...opts });
  const stdout = Buffer.isBuffer(proc.stdout) ? proc.stdout.toString('utf8') : proc.stdout;
  const stderr = Buffer.isBuffer(proc.stderr) ? proc.stderr.toString('utf8') : proc.stderr;
  if (proc.status !== 0) throw new Error(`docker ${args.join(' ')} failed: ${(stderr || stdout || '').trim()}`);
  return stdout;
}

function runCredentialDockerOp(op) {
  if (op[0] === 'exec-input') {
    const [, source, ...args] = op;
    return docker(args, { input: readFileSync(source) });
  }
  return docker(op);
}

export function redactPath(file) {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const resolved = path.resolve(file);
  if (home && resolved.startsWith(path.resolve(home))) return `~${resolved.slice(path.resolve(home).length)}`.replaceAll('\\', '/');
  return path.basename(file);
}

export function classifyCredentialSource(file) {
  if (!file) return { ok: false, reason: 'missing-path' };
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) return { ok: false, reason: 'not-found' };
  const st = lstatSync(resolved);
  if (st.isDirectory()) return { ok: false, reason: 'directory-rejected' };
  if (st.isSymbolicLink()) return { ok: false, reason: 'symlink-rejected' };
  if (!st.isFile()) return { ok: false, reason: 'not-regular-file' };
  const parts = resolved.replaceAll('\\', '/').split('/').map((p) => p.toLowerCase());
  for (const root of BROAD_ROOTS) {
    if (parts.at(-1) === root) return { ok: false, reason: `broad-root-rejected:${root}` };
  }
  const base = path.basename(resolved).toLowerCase();
  if (base === 'config' && parts.includes('.ssh')) return { ok: false, reason: 'ssh-config-rejected' };
  if (base === 'authorized_keys') return { ok: false, reason: 'authorized-keys-rejected' };
  return { ok: true, size: st.size };
}

export function fingerprintFile(file) {
  return crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function credentialDest(kind, source) {
  const base = path.basename(source);
  if (kind === 'ssh-key') return `/pidex-secrets/git/.ssh/${base}`;
  if (kind === 'known-hosts') return '/pidex-secrets/git/.ssh/known_hosts';
  if (kind === 'gitconfig') return '/pidex-secrets/git/.gitconfig';
  if (kind === 'pi-auth') return '/pidex-secrets/pi/agent/auth.json';
  if (kind === 'pi-settings') return '/pidex-secrets/pi/agent/settings.json';
  if (kind === 'pi-models') return '/pidex-secrets/pi/agent/models.json';
  if (kind === 'codex-auth') return '/pidex-secrets/providers/codex/auth.json';
  if (kind === 'codex-config') return '/pidex-secrets/providers/codex/config.toml';
  if (kind === 'gemini-oauth') return '/pidex-secrets/providers/gemini/oauth_creds.json';
  if (kind === 'gemini-settings') return `/pidex-secrets/providers/gemini/${base}`;
  throw new Error(`unsupported credential kind: ${kind}`);
}

export const gitCredentialDest = credentialDest;

function credentialMode(kind) {
  return kind.endsWith('-auth') || kind === 'gemini-oauth' || kind === 'ssh-key' ? '600' : '644';
}

function credentialGroup(kind) {
  if (kind.startsWith('pi-')) return 'pi';
  if (kind.startsWith('codex-') || kind.startsWith('gemini-')) return 'providers';
  return 'git';
}

export function buildCredentialCopyOps(record, entries) {
  const ops = [];
  const inventory = [];
  for (const entry of entries) {
    const source = path.resolve(entry.source || '');
    const classification = classifyCredentialSource(source);
    if (!classification.ok) throw new Error(`credential source rejected (${classification.reason}): ${entry.source}`);
    const dest = credentialDest(entry.kind, source);
    const dir = path.posix.dirname(dest);
    ops.push(['exec', '--user', 'node', record.docker.container_name, 'mkdir', '-p', dir]);
    ops.push(['exec', '--user', 'node', record.docker.container_name, 'chmod', '700', dir]);
    ops.push(['exec-input', source, 'exec', '-i', '--user', 'node', record.docker.container_name, 'sh', '-c', 'cat > "$1" && chmod "$2" "$1"', 'sh', dest, credentialMode(entry.kind)]);
    inventory.push({ kind: entry.kind, group: credentialGroup(entry.kind), source_label: redactPath(source), destination: dest, fingerprint: `sha256:${fingerprintFile(source)}`, copied_at: new Date().toISOString() });
  }
  if (entries.some((entry) => entry.kind.startsWith('pi-'))) {
    ops.push(['exec', '--user', 'node', record.docker.container_name, 'mkdir', '-p', '/pidex-home/.pi']);
    ops.push(['exec', '--user', 'node', record.docker.container_name, 'ln', '-sfn', '/pidex-secrets/pi/agent', '/pidex-home/.pi/agent']);
  }
  return { ops, inventory };
}

export function validateCredentialCommand(options = {}) {
  const entries = options.entries || [];
  const command = options.command || 'copy';
  if (command === 'copy-git' && entries.some((entry) => credentialGroup(entry.kind) !== 'git')) throw new Error('copy-git accepts only git credential flags');
  if (command === 'copy-pi' && entries.some((entry) => credentialGroup(entry.kind) !== 'pi')) throw new Error('copy-pi accepts only pi credential flags');
  if (command === 'copy-provider' && entries.some((entry) => credentialGroup(entry.kind) !== 'providers')) throw new Error('copy-provider accepts only provider credential flags');
  return { ok: true };
}

export function copySelectedCredentials(options = {}) {
  validateCredentialCommand(options);
  if (options.acknowledgeTrustedPersistentContainer !== true) throw new Error('credential copy requires --acknowledge-trusted-persistent-container');
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  const entries = options.entries || [];
  const runner = options.runner || runCredentialDockerOp;
  const { ops, inventory } = buildCredentialCopyOps(record, entries);
  for (const op of ops) runner(op);
  if (inventory.some((item) => item.group === 'git')) record.credentials.git = 'configured';
  if (inventory.some((item) => item.group === 'pi')) record.credentials.pi = 'configured';
  const providerNames = new Set(record.credentials.providers || []);
  for (const item of inventory) {
    if (item.kind.startsWith('codex-')) providerNames.add('codex');
    if (item.kind.startsWith('gemini-')) providerNames.add('gemini');
  }
  record.credentials.providers = [...providerNames].sort();
  record.credentials.inventory = [...(record.credentials.inventory || []), ...inventory];
  const file = saveProjectRecord(pidexRoot, record);
  return { ok: true, registry_file: file, inventory };
}

export const copyGitCredentials = copySelectedCredentials;

export function credentialStatus(options = {}) {
  const record = loadProjectRecord(path.resolve(options.pidexRoot || process.cwd()), options.projectId);
  return { ok: true, project_id: record.project_id, credentials: record.credentials };
}

export function resetCredentials(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  const runner = options.runner || ((args) => docker(args));
  runner(['exec', '--user', 'node', record.docker.container_name, 'rm', '-rf', '/pidex-secrets/git', '/pidex-secrets/pi', '/pidex-secrets/providers']);
  record.credentials = { git: 'missing', pi: 'missing', providers: [], inventory: [] };
  const file = saveProjectRecord(pidexRoot, record);
  return { ok: true, registry_file: file, project_id: record.project_id };
}

export function parseArgs(argv) {
  const out = { command: 'copy-git', json: false, entries: [], acknowledgeTrustedPersistentContainer: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'copy-git' || arg === 'copy-pi' || arg === 'copy-provider' || arg === 'status' || arg === 'reset') out.command = arg;
    else if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--ssh-key') out.entries.push({ kind: 'ssh-key', source: argv[++i] });
    else if (arg === '--known-hosts') out.entries.push({ kind: 'known-hosts', source: argv[++i] });
    else if (arg === '--gitconfig') out.entries.push({ kind: 'gitconfig', source: argv[++i] });
    else if (arg === '--pi-auth') out.entries.push({ kind: 'pi-auth', source: argv[++i] });
    else if (arg === '--pi-settings') out.entries.push({ kind: 'pi-settings', source: argv[++i] });
    else if (arg === '--pi-models') out.entries.push({ kind: 'pi-models', source: argv[++i] });
    else if (arg === '--codex-auth') out.entries.push({ kind: 'codex-auth', source: argv[++i] });
    else if (arg === '--codex-config') out.entries.push({ kind: 'codex-config', source: argv[++i] });
    else if (arg === '--gemini-oauth') out.entries.push({ kind: 'gemini-oauth', source: argv[++i] });
    else if (arg === '--gemini-settings') out.entries.push({ kind: 'gemini-settings', source: argv[++i] });
    else if (arg === '--acknowledge-trusted-persistent-container') out.acknowledgeTrustedPersistentContainer = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: credentials.mjs <copy-git|copy-pi|copy-provider|status|reset> --pidex-root PATH --project-id ID [--acknowledge-trusted-persistent-container --ssh-key FILE --pi-auth FILE --codex-auth FILE] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.projectId) throw new Error('--project-id is required');
    const result = args.command === 'status' ? credentialStatus(args) : args.command === 'reset' ? resetCredentials(args) : copySelectedCredentials(args);
    const text = args.command === 'status'
      ? `${result.project_id}: git=${result.credentials?.git || 'unknown'} pi=${result.credentials?.pi || 'unknown'}`
      : args.command === 'reset'
        ? `${result.project_id}: credentials reset`
        : `${result.inventory.length} credential file(s) copied`;
    console.log(args.json ? JSON.stringify(result, null, 2) : text);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
