#!/usr/bin/env node
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { safeProjectId } from './registry.mjs';

const DEFAULT_LIMITS = { maxFiles: 5000, maxBytes: 50 * 1024 * 1024, maxFileBytes: 2 * 1024 * 1024, maxDepth: 16 };
const BLOCKED_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.exe', '.dll', '.so', '.dylib', '.jar', '.py', '.rb', '.pl', '.php', '.wasm', '.pem', '.key', '.p12', '.pfx', '.env']);
const BLOCKED_NAMES = new Set(['.ssh', '.aws', '.config', 'secrets', 'secret', 'credentials', 'credential', '.git', 'node_modules']);
const TEXT_EXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.html', '.htm', '.log']);
const BROWSER_REQUEST_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{2,120}$/;
const BROWSER_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;
const BROWSER_EXT = new Set(['.json', '.png', '.jpg', '.jpeg', '.webp']);
const BROWSER_LIMITS = Object.freeze({ maxBundles: 500, maxFiles: 2500, maxFileBytes: 2 * 1024 * 1024, maxResultBytes: 256 * 1024, maxBytes: 500 * 1024 * 1024 });
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

export function trustedDirectoryIdentity(dir, { create = false } = {}) {
  const resolved = path.resolve(dir);
  if (create) mkdirSync(resolved, { recursive: true });
  const st = lstatSync(resolved);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('unsafe directory identity');
  const canonical = realpathSync.native(resolved);
  if (path.relative(resolved, canonical) !== '') throw new Error('unsafe directory chain');
  return { path: resolved, canonical, dev: st.dev, ino: st.ino };
}

export function assertTrustedDirectory(identity) {
  const current = trustedDirectoryIdentity(identity.path);
  if (current.canonical !== identity.canonical || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('directory identity changed');
  return current;
}

export function removeOwnedDirectory(identity) {
  assertTrustedDirectory(identity);
  rmSync(identity.path, { recursive: true, force: false });
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

export function resolveArchiveRoot(options = {}) {
  if (options.unsafeAllowCustomArchiveRoot) return path.resolve(options.archiveRoot || 'project-archive');
  if (!options.pidexRoot) throw new Error('pidexRoot is required for archive sync');
  if (!options.projectId) throw new Error('projectId is required for archive sync');
  const root = path.resolve(options.pidexRoot, 'state', 'project-archives');
  const target = path.join(root, safeProjectId(options.projectId));
  if (!pathWithin(root, target)) throw new Error('archive root escapes PIDEX project archive root');
  return target;
}

export function projectArchiveLockPath(options = {}) {
  if (options.unsafeAllowCustomArchiveRoot) {
    if (!options.archiveRoot) throw new Error('archiveRoot is required for custom archive lock');
    const archiveRoot = path.resolve(options.archiveRoot);
    return path.join(path.dirname(archiveRoot), `.${path.basename(archiveRoot)}.archive.lock`);
  }
  if (!options.pidexRoot) throw new Error('pidexRoot is required for archive lock');
  if (!options.projectId) throw new Error('projectId is required for archive lock');
  return path.join(path.resolve(options.pidexRoot), 'state', 'project-archive-locks', `${safeProjectId(options.projectId)}.lock`);
}

function sleep(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }

export function acquireProjectArchiveLock(options = {}) {
  const lock = projectArchiveLockPath(options);
  const timeoutMs = Number.isInteger(options.lockTimeoutMs) ? Math.max(0, options.lockTimeoutMs) : 5000;
  const deadline = Date.now() + timeoutMs;
  const token = crypto.randomBytes(16).toString('hex');
  const parentIdentity = trustedDirectoryIdentity(path.dirname(lock), { create: true });
  while (true) {
    let created = false;
    try {
      assertTrustedDirectory(parentIdentity);
      mkdirSync(lock, { mode: 0o700 });
      created = true;
      writeFileSync(path.join(lock, 'owner.json'), `${JSON.stringify({ token, pid: process.pid, operation: String(options.operation || 'archive'), created_at: new Date().toISOString() })}\n`, { flag: 'wx', mode: 0o600 });
      return {
        ok: true,
        path: lock,
        release() {
          assertTrustedDirectory(parentIdentity);
          const owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8'));
          if (owner?.token !== token) throw new Error('archive lock ownership changed');
          unlinkSync(path.join(lock, 'owner.json'));
          rmdirSync(lock);
        },
      };
    } catch (error) {
      if (created) { try { rmSync(lock, { recursive: true, force: true }); } catch {} throw error; }
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) return { ok: false, error: 'archive lock unavailable', path: lock };
      sleep(Math.min(25, Math.max(1, deadline - Date.now())));
    }
  }
}

export function validateBrowserEvidenceBundle(bundleDir, requestId = path.basename(bundleDir)) {
  if (!BROWSER_REQUEST_RE.test(String(requestId || ''))) throw new Error('invalid browser evidence request id');
  const root = path.resolve(bundleDir);
  const st = lstatSync(root);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('invalid browser evidence bundle');
  const files = [];
  let bytes = 0;
  for (const name of readdirSync(root).sort()) {
    if (!BROWSER_FILE_RE.test(name) || !BROWSER_EXT.has(path.extname(name).toLowerCase())) throw new Error('invalid browser evidence file');
    const file = path.join(root, name);
    if (!pathWithin(root, file)) throw new Error('browser evidence path escape');
    const fileStat = lstatSync(file);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.nlink > 1) throw new Error('invalid browser evidence file type');
    const cap = name === 'browser-smoke-result.json' ? BROWSER_LIMITS.maxResultBytes : BROWSER_LIMITS.maxFileBytes;
    if (fileStat.size > cap || files.length >= 20) throw new Error('browser evidence bundle limit exceeded');
    bytes += fileStat.size;
    files.push({ name, size: fileStat.size, sha256: sha256(file) });
  }
  if (!files.some((item) => item.name === 'browser-smoke-result.json')) throw new Error('browser evidence result missing');
  return { request_id: requestId, files, bytes };
}

function carryBrowserEvidence(archiveRoot, nextRoot) {
  const sourceRoot = path.join(archiveRoot, 'browser-smoke');
  if (!existsSync(sourceRoot)) return;
  const rootStat = lstatSync(sourceRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('invalid browser evidence root');
  let bundles = 0; let files = 0; let bytes = 0;
  for (const requestId of readdirSync(sourceRoot).sort()) {
    if (++bundles > BROWSER_LIMITS.maxBundles) throw new Error('browser evidence capacity exceeded');
    const source = path.join(sourceRoot, requestId);
    const inventory = validateBrowserEvidenceBundle(source, requestId);
    files += inventory.files.length; bytes += inventory.bytes;
    if (files > BROWSER_LIMITS.maxFiles || bytes > BROWSER_LIMITS.maxBytes) throw new Error('browser evidence capacity exceeded');
    const target = path.join(nextRoot, 'browser-smoke', requestId);
    mkdirSync(target, { recursive: true });
    for (const item of inventory.files) {
      copyFileSync(path.join(source, item.name), path.join(target, item.name));
      if (sha256(path.join(target, item.name)) !== item.sha256) throw new Error('browser evidence changed during copy');
    }
  }
}

export function syncProjectArchive(options = {}) {
  const workspace = path.resolve(options.workspace || '.');
  const archiveRoot = resolveArchiveRoot(options);
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) };
  const sources = ['agents.output', 'wiki'];
  const report = { ok: true, copied: [], skipped: [], warnings: [], limits, archive_root: archiveRoot };
  let stageIdentity;
  let nextRoot;
  let lock;
  try { lock = acquireProjectArchiveLock({ ...options, archiveRoot, operation: 'sync' }); }
  catch (error) { return { ...report, ok: false, error: error.message || String(error) }; }
  if (!lock.ok) return { ...report, ok: false, error: lock.error };
  try {
    const archiveParent = trustedDirectoryIdentity(path.dirname(archiveRoot), { create: true });
    const stageRoot = mkdtempSync(path.join(archiveParent.path, `.${path.basename(archiveRoot)}.staging-`));
    stageIdentity = trustedDirectoryIdentity(stageRoot);
    nextRoot = path.join(stageRoot, 'latest');
    mkdirSync(nextRoot);
    const state = { stageRoot: nextRoot, copied: report.copied, skipped: report.skipped, limits, files_seen: 0, bytes_copied: 0 };
    for (const source of sources) {
      const sourcePath = path.join(workspace, source);
      if (!existsSync(sourcePath)) { report.warnings.push({ source, reason: 'source-missing' }); continue; }
      if (!pathWithin(workspace, sourcePath)) { report.skipped.push({ path: source, reason: 'source-escape' }); continue; }
      walkSource(sourcePath, workspace, source, state);
    }
    carryBrowserEvidence(archiveRoot, nextRoot);
    report.bytes_copied = state.bytes_copied;
    report.files_copied = report.copied.length;
    report.files_skipped = report.skipped.length;
    report.generated_at = new Date().toISOString();
    writeFileSync(path.join(nextRoot, 'archive-sync-report.json.tmp'), JSON.stringify(report, null, 2));
    renameSync(path.join(nextRoot, 'archive-sync-report.json.tmp'), path.join(nextRoot, 'archive-sync-report.json'));
    assertTrustedDirectory(stageIdentity);
    const previous = `${archiveRoot}.previous-${process.pid}-${Date.now()}`;
    let previousMoved = false;
    try {
      if (existsSync(archiveRoot)) { renameSync(archiveRoot, previous); previousMoved = true; }
      renameSync(nextRoot, archiveRoot);
      assertTrustedDirectory(stageIdentity);
      rmdirSync(stageIdentity.path);
      stageIdentity = undefined;
      if (previousMoved) rmSync(previous, { recursive: true, force: true });
      return report;
    } catch (publishError) {
      if (previousMoved && !existsSync(archiveRoot) && existsSync(previous)) {
        try { renameSync(previous, archiveRoot); } catch {}
      }
      throw publishError;
    }
  } catch (error) {
    report.ok = false;
    report.error = error.message || String(error);
    if (stageIdentity) { try { removeOwnedDirectory(stageIdentity); } catch {} }
    return report;
  } finally {
    lock.release();
  }
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') out.workspace = argv[++i];
    else if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: archive-sync.mjs --workspace PATH --pidex-root PATH --project-id ID --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.workspace) throw new Error('--workspace is required');
    if (!args.pidexRoot) throw new Error('--pidex-root is required');
    if (!args.projectId) throw new Error('--project-id is required');
    const result = syncProjectArchive(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.files_copied || 0} copied, ${result.files_skipped || 0} skipped`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
