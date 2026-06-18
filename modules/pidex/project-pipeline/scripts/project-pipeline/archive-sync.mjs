#!/usr/bin/env node
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEFAULT_LIMITS = { maxFiles: 5000, maxBytes: 50 * 1024 * 1024, maxFileBytes: 2 * 1024 * 1024, maxDepth: 16 };
const BLOCKED_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.exe', '.dll', '.so', '.dylib', '.jar', '.py', '.rb', '.pl', '.php', '.wasm', '.pem', '.key', '.p12', '.pfx', '.env']);
const BLOCKED_NAMES = new Set(['.ssh', '.aws', '.config', 'secrets', 'secret', 'credentials', 'credential', '.git', 'node_modules']);
const TEXT_EXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.html', '.htm', '.log']);
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*['\"]?[A-Za-z0-9_./+=-]{20,}/i,
];

export function normalizeRel(rel) {
  return String(rel || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

export function pathWithin(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function classifyArchivePath(rel) {
  const normalized = normalizeRel(rel);
  if (!normalized || normalized === '.') return { ok: true };
  if (normalized.split('/').some((part) => part === '..' || part === '')) return { ok: false, reason: 'path-traversal' };
  const parts = normalized.split('/');
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (BLOCKED_NAMES.has(lower)) return { ok: false, reason: `blocked-name:${part}` };
    if (lower.startsWith('.') && ['.env', '.npmrc', '.yarnrc', '.netrc'].includes(lower)) return { ok: false, reason: `blocked-hidden:${part}` };
  }
  const ext = path.extname(parts.at(-1) || '').toLowerCase();
  if (BLOCKED_EXT.has(ext)) return { ok: false, reason: `blocked-extension:${ext}` };
  return { ok: true };
}

function sha256(file) {
  return crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
}

function maybeSecret(file, rel) {
  const ext = path.extname(rel).toLowerCase();
  if (!TEXT_EXT.has(ext)) return undefined;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return 'text-read-failed'; }
  for (const pattern of SECRET_PATTERNS) if (pattern.test(text)) return 'secret-pattern';
  return undefined;
}

function ensureEmptyDir(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function walkSource(root, base, rel, state) {
  if (state.files_seen >= state.limits.maxFiles) return state.skipped.push({ path: rel || '.', reason: 'max-files-exceeded' });
  const full = path.join(base, rel);
  const normalized = normalizeRel(rel);
  const depth = normalized ? normalized.split('/').length : 0;
  if (depth > state.limits.maxDepth) return state.skipped.push({ path: normalized, reason: 'max-depth-exceeded' });
  if (!pathWithin(root, full)) return state.skipped.push({ path: normalized, reason: 'source-escape' });
  const st = lstatSync(full);
  const classification = classifyArchivePath(normalized);
  if (!classification.ok) return state.skipped.push({ path: normalized, reason: classification.reason });
  if (st.isSymbolicLink()) return state.skipped.push({ path: normalized, reason: 'symlink-blocked' });
  if (st.isDirectory()) {
    const targetDir = path.join(state.stageRoot, normalized);
    mkdirSync(targetDir, { recursive: true });
    for (const entry of readdirSync(full)) walkSource(root, base, path.join(rel, entry), state);
    return undefined;
  }
  if (!st.isFile()) return state.skipped.push({ path: normalized, reason: 'special-file-blocked' });
  if (st.nlink && st.nlink > 1) return state.skipped.push({ path: normalized, reason: 'hardlink-blocked' });
  if (st.size > state.limits.maxFileBytes) return state.skipped.push({ path: normalized, reason: 'max-file-bytes-exceeded', size: st.size });
  if (state.bytes_copied + st.size > state.limits.maxBytes) return state.skipped.push({ path: normalized, reason: 'max-total-bytes-exceeded', size: st.size });
  const secret = maybeSecret(full, normalized);
  if (secret) return state.skipped.push({ path: normalized, reason: `secret-scan:${secret}`, size: st.size });
  const target = path.join(state.stageRoot, normalized);
  if (!pathWithin(state.stageRoot, target)) return state.skipped.push({ path: normalized, reason: 'target-escape' });
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(full, target);
  state.files_seen += 1;
  state.bytes_copied += st.size;
  state.copied.push({ path: normalized, size: st.size, sha256: sha256(target) });
  return undefined;
}

export function syncProjectArchive(options = {}) {
  const workspace = path.resolve(options.workspace || '.');
  const archiveRoot = path.resolve(options.archiveRoot || 'project-archive');
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const sources = ['agents.output', 'wiki'];
  const stageRoot = path.join(path.dirname(archiveRoot), `.${path.basename(archiveRoot)}.staging-${process.pid}-${Date.now()}`);
  const nextRoot = path.join(stageRoot, 'latest');
  const report = { ok: true, copied: [], skipped: [], warnings: [], limits, archive_root: archiveRoot };
  ensureEmptyDir(nextRoot);
  const state = { stageRoot: nextRoot, copied: report.copied, skipped: report.skipped, limits, files_seen: 0, bytes_copied: 0 };
  try {
    for (const source of sources) {
      const sourcePath = path.join(workspace, source);
      if (!existsSync(sourcePath)) { report.warnings.push({ source, reason: 'source-missing' }); continue; }
      if (!pathWithin(workspace, sourcePath)) { report.skipped.push({ path: source, reason: 'source-escape' }); continue; }
      walkSource(sourcePath, workspace, source, state);
    }
    report.bytes_copied = state.bytes_copied;
    report.files_copied = report.copied.length;
    report.files_skipped = report.skipped.length;
    report.generated_at = new Date().toISOString();
    writeFileSync(path.join(nextRoot, 'archive-sync-report.json.tmp'), JSON.stringify(report, null, 2));
    renameSync(path.join(nextRoot, 'archive-sync-report.json.tmp'), path.join(nextRoot, 'archive-sync-report.json'));
    mkdirSync(path.dirname(archiveRoot), { recursive: true });
    const previous = `${archiveRoot}.previous-${process.pid}-${Date.now()}`;
    if (existsSync(archiveRoot)) renameSync(archiveRoot, previous);
    renameSync(nextRoot, archiveRoot);
    rmSync(stageRoot, { recursive: true, force: true });
    rmSync(previous, { recursive: true, force: true });
    return report;
  } catch (error) {
    report.ok = false;
    report.error = error.message || String(error);
    try { rmSync(stageRoot, { recursive: true, force: true }); } catch {}
    return report;
  }
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') out.workspace = argv[++i];
    else if (arg === '--archive-root') out.archiveRoot = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: archive-sync.mjs --workspace PATH --archive-root PATH --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.workspace) throw new Error('--workspace is required');
    if (!args.archiveRoot) throw new Error('--archive-root is required');
    const result = syncProjectArchive(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.files_copied || 0} copied, ${result.files_skipped || 0} skipped`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
