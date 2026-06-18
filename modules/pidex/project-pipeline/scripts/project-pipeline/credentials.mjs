#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadProjectRecord, saveProjectRecord } from './registry.mjs';

const BROAD_ROOTS = new Set(['.ssh', '.config', '.pi', '.codex']);

function docker(args, opts = {}) {
  const proc = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...opts });
  if (proc.status !== 0) throw new Error(`docker ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  return proc.stdout;
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

export function gitCredentialDest(kind, source) {
  const base = path.basename(source);
  if (kind === 'ssh-key') return `/pidex-secrets/git/.ssh/${base}`;
  if (kind === 'known-hosts') return '/pidex-secrets/git/.ssh/known_hosts';
  if (kind === 'gitconfig') return '/pidex-secrets/git/.gitconfig';
  throw new Error(`unsupported credential kind: ${kind}`);
}

export function buildCredentialCopyOps(record, entries) {
  const ops = [];
  const inventory = [];
  for (const entry of entries) {
    const source = path.resolve(entry.source || '');
    const classification = classifyCredentialSource(source);
    if (!classification.ok) throw new Error(`credential source rejected (${classification.reason}): ${entry.source}`);
    const dest = gitCredentialDest(entry.kind, source);
    ops.push(['exec', record.docker.container_name, 'mkdir', '-p', path.posix.dirname(dest)]);
    ops.push(['cp', source, `${record.docker.container_name}:${dest}`]);
    ops.push(['exec', record.docker.container_name, 'chmod', entry.kind === 'ssh-key' ? '600' : '644', dest]);
    inventory.push({ kind: entry.kind, source_label: redactPath(source), destination: dest, fingerprint: `sha256:${fingerprintFile(source)}`, copied_at: new Date().toISOString() });
  }
  ops.push(['exec', record.docker.container_name, 'chmod', '700', '/pidex-secrets/git/.ssh']);
  return { ops, inventory };
}

export function copyGitCredentials(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  const entries = options.entries || [];
  const runner = options.runner || ((args) => docker(args));
  const { ops, inventory } = buildCredentialCopyOps(record, entries);
  for (const op of ops) runner(op);
  record.credentials.git = inventory.length ? 'configured' : 'skipped';
  record.credentials.inventory = [...(record.credentials.inventory || []), ...inventory];
  const file = saveProjectRecord(pidexRoot, record);
  return { ok: true, registry_file: file, inventory };
}

export function parseArgs(argv) {
  const out = { json: false, entries: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--ssh-key') out.entries.push({ kind: 'ssh-key', source: argv[++i] });
    else if (arg === '--known-hosts') out.entries.push({ kind: 'known-hosts', source: argv[++i] });
    else if (arg === '--gitconfig') out.entries.push({ kind: 'gitconfig', source: argv[++i] });
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: credentials.mjs --pidex-root PATH --project-id ID [--ssh-key FILE] [--known-hosts FILE] [--gitconfig FILE] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.projectId) throw new Error('--project-id is required');
    const result = copyGitCredentials(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.inventory.length} credential file(s) copied`);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
