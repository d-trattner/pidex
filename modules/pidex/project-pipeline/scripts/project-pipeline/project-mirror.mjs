#!/usr/bin/env node
import crypto from 'node:crypto';
import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadProjectRecord, saveProjectRecord, safeProjectId } from './registry.mjs';
import { classifyArchivePath, pathWithin, resolveArchiveRoot } from './archive-sync.mjs';

const PREFIXES = ['agents.output', 'wiki'];
const CONFLICT_PATH_LIMIT = 20;
const LIMITS = { maxFiles: 5000, maxBytes: 50 * 1024 * 1024, maxFileBytes: 2 * 1024 * 1024, maxDepth: 16 };
const HASH_RE = /^[a-f0-9]{64}$/;

function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function sameStat(a, b) { return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs; }
function readStableRegular(file) {
  let fd;
  try {
    fd = openSync(file, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const before = fstatSync(fd);
    if (!before.isFile()) throw new Error('unsafe regular file');
    const content = readFileSync(fd);
    const after = fstatSync(fd);
    if (!sameStat(before, after) || content.length !== after.size) throw new Error('file changed while reading');
    return { content, hash: digest(content), stat: after };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
function hashFile(file) { return readStableRegular(file).hash; }
function canonicalExisting(value) { return realpathSync.native(path.resolve(value)); }
function canonicalCandidate(value) { try { return canonicalExisting(value); } catch { return path.resolve(value); } }
function rootIdentity(root) { return crypto.createHash('sha256').update(root).digest('hex').slice(0, 32); }
function manifestRoot(pidexRoot) { return path.join(path.resolve(pidexRoot), 'state', 'project-mirrors'); }
export function projectMirrorManifestPath(pidexRoot, projectId) { return path.join(manifestRoot(pidexRoot), `${safeProjectId(projectId)}.json`); }
export function projectMirrorLockPath(pidexRoot, hostRoot) { return path.join(manifestRoot(pidexRoot), 'locks', `${rootIdentity(canonicalCandidate(hostRoot))}.lock`); }

function atomicJson(file, value, beforeRename) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    beforeRename?.();
    renameSync(tmp, file);
  } finally {
    rmSync(tmp, { force: true });
  }
}
function isTimestamp(value) {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
function emptyManifest(projectId, hostRoot) { return { schema_version: 1, project_id: projectId, host_root: hostRoot, files: {} }; }
function readManifest(file, projectId, hostRoot) {
  if (!existsSync(file)) return emptyManifest(projectId, hostRoot);
  let value;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch { throw new Error('invalid mirror manifest'); }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || value.schema_version !== 1 || value.project_id !== projectId) throw new Error('invalid mirror manifest');
  if (typeof value.host_root !== 'string' || value.host_root !== hostRoot) throw new Error('project mirror host root changed');
  if (!value.files || Object.getPrototypeOf(value.files) !== Object.prototype) throw new Error('invalid mirror manifest');
  const entries = Object.entries(value.files);
  if (entries.length > LIMITS.maxFiles) throw new Error('invalid mirror manifest');
  for (const [rel, hash] of entries) if (safeRelative(rel) !== rel || typeof hash !== 'string' || !HASH_RE.test(hash)) throw new Error('invalid mirror manifest');
  for (const field of ['mirrored_at', 'import_baseline_at']) if (field in value && !isTimestamp(value[field])) throw new Error('invalid mirror manifest');
  return value;
}
function boundedResult(status, degraded, counts = {}, conflicts = []) {
  return {
    status,
    degraded,
    copied: counts.copied || 0,
    updated: counts.updated || 0,
    deleted: counts.deleted || 0,
    conflicts: conflicts.length,
    conflict_paths: conflicts.slice(0, CONFLICT_PATH_LIMIT),
  };
}
function safeRelative(rel) {
  const normalized = String(rel || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) throw new Error('mirror path outside allowed prefixes');
  if (!classifyArchivePath(normalized).ok || normalized.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('unsafe mirror path');
  return normalized;
}
function revalidateArchiveChain(archiveRoot, rel, expectedParent) {
  const parts = safeRelative(rel).split('/');
  let current = archiveRoot;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const st = lstatSync(current);
    if (!st.isDirectory() || st.isSymbolicLink() || !pathWithin(archiveRoot, canonicalExisting(current))) throw new Error('archive parent unsafe');
  }
  if (canonicalExisting(current) !== expectedParent) throw new Error('archive parent changed');
}
function readArchiveReport(archiveRoot) {
  const report = JSON.parse(readStableRegular(path.join(archiveRoot, 'archive-sync-report.json')).content.toString('utf8'));
  if (!report || report.ok !== true || !Array.isArray(report.copied)) throw new Error('invalid archive publication report');
  const hashes = new Map();
  for (const item of report.copied) {
    const rel = safeRelative(item?.path);
    if (hashes.has(rel) || !HASH_RE.test(item?.sha256 || '') || !Number.isSafeInteger(item?.size) || item.size < 0 || item.size > LIMITS.maxFileBytes) throw new Error('invalid archive publication report');
    hashes.set(rel, { hash: item.sha256, size: item.size });
  }
  if (hashes.size > LIMITS.maxFiles) throw new Error('archive limits exceeded');
  return hashes;
}
function listArchiveFiles(archiveRoot) {
  const files = [];
  let bytes = 0;
  function walk(rel) {
    const safe = safeRelative(rel.replaceAll('\\', '/'));
    if (safe.split('/').length > LIMITS.maxDepth) throw new Error('archive limits exceeded');
    const full = path.join(archiveRoot, safe);
    if (!pathWithin(archiveRoot, full)) throw new Error('archive path escape');
    const st = lstatSync(full);
    if (st.isSymbolicLink()) throw new Error('archive symlink blocked');
    if (st.isDirectory()) {
      if (!pathWithin(archiveRoot, canonicalExisting(full))) throw new Error('archive directory escape');
      for (const entry of readdirSync(full)) walk(path.join(safe, entry));
    } else if (st.isFile()) {
      if (st.size > LIMITS.maxFileBytes || files.length >= LIMITS.maxFiles || (bytes += st.size) > LIMITS.maxBytes) throw new Error('archive limits exceeded');
      files.push(safe);
    } else throw new Error('archive special file blocked');
  }
  for (const prefix of PREFIXES) if (existsSync(path.join(archiveRoot, prefix))) walk(prefix);
  return files.sort();
}
function readArchiveSource(archiveRoot, rel, reportEntry) {
  const source = path.join(archiveRoot, rel);
  const expectedParent = canonicalExisting(path.dirname(source));
  revalidateArchiveChain(archiveRoot, rel, expectedParent);
  const stable = readStableRegular(source);
  revalidateArchiveChain(archiveRoot, rel, expectedParent);
  if (stable.content.length > LIMITS.maxFileBytes || !reportEntry || reportEntry.hash !== stable.hash || reportEntry.size !== stable.content.length) throw new Error('archive source differs from publication report');
  return stable;
}
function assertSafeRoot(hostRoot, pidexRoot) {
  const resolved = path.resolve(hostRoot);
  if (!existsSync(resolved)) throw new Error('host-root-missing');
  const rootStat = lstatSync(resolved);
  if (rootStat.isSymbolicLink()) throw new Error('unsafe-host-root');
  if (!rootStat.isDirectory()) throw new Error('host-root-missing');
  const canonical = canonicalExisting(resolved);
  const blocked = [path.parse(canonical).root, canonicalCandidate(os.homedir()), canonicalCandidate(pidexRoot)];
  if (blocked.includes(canonical)) throw new Error('unsafe-host-root');
  return canonical;
}
function assertRootStable(hostRoot) {
  if (!existsSync(hostRoot) || lstatSync(hostRoot).isSymbolicLink() || canonicalExisting(hostRoot) !== hostRoot) throw new Error('unsafe-host-root');
}
function ensureSafeParent(hostRoot, rel) {
  assertRootStable(hostRoot);
  const parts = safeRelative(rel).split('/');
  let current = hostRoot;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current);
    const st = lstatSync(current);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('unsafe-destination-component');
    const canonical = canonicalExisting(current);
    if (!pathWithin(hostRoot, canonical)) throw new Error('destination-escape');
  }
  assertRootStable(hostRoot);
  return current;
}
function validateLeaf(hostRoot, target) {
  if (!pathWithin(hostRoot, target)) throw new Error('destination-escape');
  if (!existsSync(target)) return;
  const st = lstatSync(target);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('unsafe-destination-leaf');
}
function revalidateDestinationParent(hostRoot, rel, expectedParent) {
  assertRootStable(hostRoot);
  const parts = safeRelative(rel).split('/');
  let current = hostRoot;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (!existsSync(current)) throw new Error('destination parent replaced');
    const st = lstatSync(current);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('unsafe destination parent');
    const canonical = canonicalExisting(current);
    if (!pathWithin(hostRoot, canonical)) throw new Error('destination parent escape');
  }
  if (canonicalExisting(current) !== expectedParent) throw new Error('destination parent identity changed');
}
function leafSnapshot(target) {
  if (!existsSync(target)) return null;
  const stable = readStableRegular(target);
  return { hash: stable.hash, dev: stable.stat.dev, ino: stable.stat.ino, size: stable.stat.size, mtimeMs: stable.stat.mtimeMs };
}
function sameLeaf(actual, expected) {
  if (actual === null || expected === null) return actual === expected;
  return actual.hash === expected.hash && actual.dev === expected.dev && actual.ino === expected.ino && actual.size === expected.size && actual.mtimeMs === expected.mtimeMs;
}
function copySafely(content, hostRoot, rel, expectedLeaf, operationHook) {
  const parent = ensureSafeParent(hostRoot, rel);
  const expectedParent = canonicalExisting(parent);
  const target = path.join(hostRoot, rel);
  validateLeaf(hostRoot, target);
  const temp = path.join(parent, `.${path.basename(target)}.pidex-mirror-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    writeFileSync(temp, content, { flag: 'wx', mode: 0o600 });
    operationHook?.({ phase: 'before-rename', rel });
    revalidateDestinationParent(hostRoot, rel, expectedParent);
    validateLeaf(hostRoot, target);
    if (!sameLeaf(leafSnapshot(target), expectedLeaf)) return false;
    renameSync(temp, target);
    return true;
  } finally {
    rmSync(temp, { force: true });
  }
}
function revalidateDirectoryRemoval(hostRoot, directory, expectedDirectory, expectedParent) {
  assertRootStable(hostRoot);
  const relative = path.relative(hostRoot, directory).replaceAll('\\', '/');
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('unsafe empty directory cleanup');
  let current = hostRoot;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (!existsSync(current)) throw new Error('empty directory replaced');
    const st = lstatSync(current);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('unsafe empty directory cleanup');
    if (!pathWithin(hostRoot, canonicalExisting(current))) throw new Error('empty directory escape');
  }
  if (canonicalExisting(current) !== expectedDirectory || canonicalExisting(path.dirname(current)) !== expectedParent) throw new Error('empty directory identity changed');
}

function deleteSafely(hostRoot, rel, expectedLeaf, operationHook) {
  const parent = ensureSafeParent(hostRoot, rel);
  const expectedParent = canonicalExisting(parent);
  const target = path.join(hostRoot, rel);
  validateLeaf(hostRoot, target);
  operationHook?.({ phase: 'before-delete', rel });
  revalidateDestinationParent(hostRoot, rel, expectedParent);
  validateLeaf(hostRoot, target);
  if (!sameLeaf(leafSnapshot(target), expectedLeaf)) return false;
  if (existsSync(target)) unlinkSync(target);
  let current = path.dirname(target);
  for (const prefix of PREFIXES) {
    const stop = path.join(hostRoot, prefix);
    while (pathWithin(stop, current) && current !== stop) {
      if (!existsSync(current) || readdirSync(current).length) break;
      const expectedDirectory = canonicalExisting(current);
      const expectedParent = canonicalExisting(path.dirname(current));
      operationHook?.({ phase: 'before-empty-dir-delete', rel: path.relative(hostRoot, current).replaceAll('\\', '/') });
      revalidateDirectoryRemoval(hostRoot, current, expectedDirectory, expectedParent);
      if (readdirSync(current).length) break;
      rmSync(current, { recursive: false });
      current = path.dirname(current);
    }
  }
  return true;
}
function resolveHostRoot(pidexRoot, record, internalDisposable) {
  const controlPath = record.control_project_path ? path.resolve(record.control_project_path) : '';
  const sourcePath = record.source?.kind === 'host-path' && record.source?.ref ? path.resolve(record.source.ref) : '';
  const controlIdentity = controlPath ? canonicalCandidate(controlPath) : '';
  const sourceIdentity = sourcePath ? canonicalCandidate(sourcePath) : '';
  if (controlIdentity && sourceIdentity && controlIdentity !== sourceIdentity) return { result: boundedResult('degraded-host-root-conflict', true) };
  if (!controlPath && !sourcePath) return { result: boundedResult(internalDisposable ? 'skipped-internal-no-host-root' : 'degraded-host-root-missing', !internalDisposable) };
  let root;
  try { root = assertSafeRoot(controlPath || sourcePath, pidexRoot); }
  catch (error) { return { result: boundedResult(error.message === 'host-root-missing' ? 'degraded-host-root-missing' : 'degraded-unsafe-root', true) }; }
  if (!record.control_project_path) {
    record.control_project_path = root;
    saveProjectRecord(pidexRoot, record);
  }
  return { root };
}

function mirrorArchiveFiles({ archiveRoot, hostRoot, previous, nextFiles, counts, conflicts, operationHook }) {
  const reportHashes = readArchiveReport(archiveRoot);
  const archiveFiles = listArchiveFiles(archiveRoot);
  if (archiveFiles.length !== reportHashes.size || archiveFiles.some((rel) => !reportHashes.has(rel))) throw new Error('archive publication report mismatch');
  let bytesRead = 0;
  for (const rel of archiveFiles) {
    const target = path.join(hostRoot, rel);
    ensureSafeParent(hostRoot, rel);
    validateLeaf(hostRoot, target);
    operationHook?.({ phase: 'before-source-read', rel });
    const incoming = readArchiveSource(archiveRoot, rel, reportHashes.get(rel));
    if ((bytesRead += incoming.content.length) > LIMITS.maxBytes) throw new Error('archive limits exceeded');
    const incomingHash = incoming.hash;
    const priorHash = previous.files[rel];
    const hostLeaf = leafSnapshot(target);
    if (hostLeaf === null) {
      if (!copySafely(incoming.content, hostRoot, rel, null, operationHook)) conflicts.push(rel);
      else { counts.copied += 1; nextFiles[rel] = incomingHash; }
      continue;
    }
    if (hostLeaf.hash === incomingHash) { nextFiles[rel] = incomingHash; continue; }
    if (priorHash && hostLeaf.hash === priorHash) {
      if (!copySafely(incoming.content, hostRoot, rel, hostLeaf, operationHook)) conflicts.push(rel);
      else { counts.updated += 1; nextFiles[rel] = incomingHash; }
      continue;
    }
    conflicts.push(rel);
  }
  return new Set(archiveFiles);
}

function removeStaleOwnedFiles({ archiveSet, hostRoot, previous, nextFiles, counts, conflicts, operationHook }) {
  for (const [rel, priorHash] of Object.entries(previous.files || {})) {
    if (archiveSet.has(rel)) continue;
    const target = path.join(hostRoot, safeRelative(rel));
    ensureSafeParent(hostRoot, rel);
    validateLeaf(hostRoot, target);
    if (!existsSync(target)) { delete nextFiles[rel]; continue; }
    const hostLeaf = leafSnapshot(target);
    if (hostLeaf?.hash === priorHash) {
      if (deleteSafely(hostRoot, rel, hostLeaf, operationHook)) { delete nextFiles[rel]; counts.deleted += 1; }
      else conflicts.push(rel);
    } else conflicts.push(rel);
  }
}

export function seedProjectMirrorImportBaseline(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = safeProjectId(options.projectId);
  const hostRoot = assertSafeRoot(options.hostRoot, pidexRoot);
  const manifestFile = projectMirrorManifestPath(pidexRoot, projectId);
  const previous = readManifest(manifestFile, projectId, hostRoot);
  const lock = projectMirrorLockPath(pidexRoot, hostRoot);
  mkdirSync(path.dirname(lock), { recursive: true });
  try { mkdirSync(lock, { recursive: false }); } catch { throw new Error('project mirror locked or stale'); }
  try {
    writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, project_id: projectId, root_identity: rootIdentity(hostRoot), operation: 'import-baseline', started_at: new Date().toISOString() }), { mode: 0o600 });
    const files = { ...(previous.files || {}) };
    for (const item of options.files || []) {
      const rel = String(item?.path || '').replaceAll('\\', '/');
      if (!rel.startsWith('wiki/')) continue;
      const safe = safeRelative(rel);
      const source = path.join(hostRoot, safe);
      if (!existsSync(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) continue;
      files[safe] = hashFile(source);
    }
    atomicJson(manifestFile, { schema_version: 1, project_id: projectId, host_root: hostRoot, files, mirrored_at: previous.mirrored_at || null, import_baseline_at: new Date().toISOString() });
    return { ok: true, files_seeded: Object.keys(files).filter((rel) => rel.startsWith('wiki/')).length };
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export function syncProjectMirror(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = safeProjectId(options.projectId);
  let record;
  let resolved;
  try {
    record = options.record || loadProjectRecord(pidexRoot, projectId);
    resolved = resolveHostRoot(pidexRoot, record, options.internalDisposable === true);
  } catch {
    return boundedResult('failed', true);
  }
  if (resolved.result) return resolved.result;
  const hostRoot = resolved.root;
  const archiveRoot = resolveArchiveRoot({ pidexRoot, projectId });
  if (!existsSync(archiveRoot)) return boundedResult('failed', true);
  const manifestFile = projectMirrorManifestPath(pidexRoot, projectId);
  let previous;
  try { previous = readManifest(manifestFile, projectId, hostRoot); }
  catch (error) { return boundedResult(error.message === 'project mirror host root changed' ? 'degraded-host-root-changed' : 'degraded-manifest-invalid', true); }
  const lock = projectMirrorLockPath(pidexRoot, hostRoot);
  mkdirSync(path.dirname(lock), { recursive: true });
  try { mkdirSync(lock, { recursive: false }); }
  catch { return boundedResult('locked-or-stale', true); }
  const counts = { copied: 0, updated: 0, deleted: 0 };
  const conflicts = [];
  const nextFiles = { ...(previous.files || {}) };
  try {
    writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, project_id: projectId, root_identity: rootIdentity(hostRoot), started_at: new Date().toISOString() }), { mode: 0o600 });
    const archiveSet = mirrorArchiveFiles({ archiveRoot, hostRoot, previous, nextFiles, counts, conflicts, operationHook: options.operationHook });
    removeStaleOwnedFiles({ archiveSet, hostRoot, previous, nextFiles, counts, conflicts, operationHook: options.operationHook });
    atomicJson(manifestFile, { schema_version: 1, project_id: projectId, host_root: hostRoot, files: nextFiles, mirrored_at: new Date().toISOString() }, () => options.operationHook?.({ phase: 'before-manifest-rename' }));
    return boundedResult(conflicts.length ? 'conflict' : 'complete', conflicts.length > 0, counts, [...new Set(conflicts)].sort());
  } catch (error) {
    try { atomicJson(manifestFile, { schema_version: 1, project_id: projectId, host_root: hostRoot, files: nextFiles, mirrored_at: new Date().toISOString() }); } catch {}
    const message = error instanceof Error ? error.message : String(error);
    const status = /unsafe|escape|symlink|destination|special file|outside allowed/i.test(message) ? 'degraded-unsafe-root' : 'failed';
    return boundedResult(status, true, counts, conflicts);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
