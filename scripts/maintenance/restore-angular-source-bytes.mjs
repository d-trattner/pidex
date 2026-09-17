#!/usr/bin/env node
// Explicit host maintenance. Never normalize the verifier or regenerate a lock.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyAngularSourceLock } from '../../modules/pidex/angular/lib/source-lock.mjs';

const LOCK = 'modules/pidex/angular/config/source-lock.json';
const MIRROR = 'skills/angular-application/references/upstream/UPSTREAM.json';
const BASE = 'skills/angular-application/references';
const TREES = ['official-angular', 'official-material', 'official-nx', 'upstream'];
const MAX = 4 * 1024 * 1024;
const fail = code => { throw new Error(code); };
const id = st => `${st.dev}:${st.ino}`;

function dirIdentity(dir) {
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || path.relative(path.resolve(dir), fs.realpathSync.native(dir))) fail('unsafe-directory');
  return { path: dir, id: id(st) };
}
function checkDirs(dirs) { for (const d of dirs) if (dirIdentity(d.path).id !== d.id) fail('directory-changed'); }
function snapshot(root, rel) {
  const parts = rel.split('/');
  const dirs = [dirIdentity(root)];
  for (const part of parts.slice(0, -1)) dirs.push(dirIdentity(path.join(dirs.at(-1).path, part)));
  const file = path.join(root, rel), st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size > MAX) fail('unsafe-source-file');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (id(opened) !== id(st) || opened.nlink !== 1 || opened.size !== st.size) fail('source-changed');
    const buffer = Buffer.alloc(st.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const n = fs.readSync(fd, buffer, count, buffer.length - count, count);
      if (!n) break;
      count += n;
    }
    if (count !== st.size || fs.fstatSync(fd).size !== st.size) fail('source-changed');
    checkDirs(dirs);
    return { rel, file, dirs, id: id(st), mode: st.mode & 0o777, bytes: buffer.subarray(0, count) };
  } finally { fs.closeSync(fd); }
}
function unchanged(root, before) {
  checkDirs(before.dirs);
  const current = snapshot(root, before.rel);
  if (current.id !== before.id || current.mode !== before.mode || !current.bytes.equals(before.bytes)) fail('source-changed');
}
function crlfToLf(bytes) {
  // Comparison only. These bytes are NEVER used as the replacement content.
  const out = Buffer.alloc(bytes.length); let size = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10) continue;
    out[size++] = bytes[i];
  }
  return out.subarray(0, size);
}
function scanReferences(root) {
  const files = []; let entries = 0;
  function walk(rel, depth) {
    if (depth > 12) fail('source-limit');
    const identity = dirIdentity(path.join(root, rel));
    const dir = fs.opendirSync(identity.path);
    try {
      for (let item; (item = dir.readSync());) {
        if (++entries > 1000) fail('source-limit');
        const next = `${rel}/${item.name}`, st = fs.lstatSync(path.join(root, next));
        if (st.isSymbolicLink()) fail('unsafe-source-file');
        if (st.isDirectory()) walk(next, depth + 1);
        else if (!st.isFile() || st.nlink !== 1 || item.name === 'SKILL.md') fail('unsafe-source-file');
        else files.push(next);
      }
    } finally { dir.closeSync(); }
    checkDirs([identity]);
  }
  walk(BASE, 0);
  return files.filter(p => TREES.some(t => p.startsWith(`${BASE}/${t}/`))).sort();
}

export function restoreAngularSourceBytes({ root = process.cwd(), apply = false, beforeWrite } = {}) {
  const repaired = []; let candidate, owner, head, activePath, result;
  const finish = value => { result = value; return value; };
  try {
    if (typeof apply !== 'boolean') fail('invalid-options');
    if (process.env.PIDEX_PROJECT_PIPELINE_CONTAINER === '1' || process.env.PIDEX_PROJECT_PIPELINE_CHILD === '1') fail('host-only');
    root = path.resolve(root); const rootIdentity = dirIdentity(root);
    const deadline = Date.now() + 60000;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
    const git = (args, allowed = [0]) => {
      const remaining = deadline - Date.now(); if (remaining <= 0) fail('git-deadline');
      const p = spawnSync('git', ['-C', root, '-c', 'core.fsmonitor=false', ...args], { env, encoding: 'buffer', timeout: Math.min(remaining, 10000), maxBuffer: MAX });
      if (!allowed.includes(p.status) || p.error || p.signal) fail('git-read-failed');
      return p.stdout;
    };
    if (path.relative(root, git(['rev-parse', '--show-toplevel']).toString().trim())) fail('not-checkout-root');
    const gitDir = dirIdentity(git(['rev-parse', '--absolute-git-dir']).toString().trim());
    if (git(['config', '--get-regexp', '^(extensions[.]partialclone|remote[.].*[.]promisor)$'], [0, 1]).length) fail('partial-clone-unsupported');
    const indexLock = git(['rev-parse', '--git-path', 'index.lock']).toString().trim();
    const checkIndexLock = () => {
      try { fs.lstatSync(path.resolve(root, indexLock)); fail('git-index-busy'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    };
    checkIndexLock();
    const lockFile = path.join(gitDir.path, 'pidex-angular-source-restore.lock');
    if (!apply) {
      try { fs.lstatSync(lockFile); fail('restore-lock-busy'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (apply) {
      let fd;
      try { fd = fs.openSync(lockFile, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') fail('restore-lock-busy'); throw error; }
      owner = { fd, file: lockFile, id: id(fs.fstatSync(fd)), dir: gitDir, token: JSON.stringify({ pid: process.pid, nonce: randomUUID() }) };
      fs.writeFileSync(fd, owner.token); fs.fsyncSync(fd);
    }
    head = git(['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) fail('invalid-head');
    const blob = rel => git(['cat-file', 'blob', `${head}:${rel}`]);
    const lockBytes = blob(LOCK), mirrorBytes = blob(MIRROR);
    if (!lockBytes.equals(mirrorBytes)) fail('head-lock-mismatch');
    const manifest = JSON.parse(lockBytes.toString('utf8'));
    if (!Array.isArray(manifest.members) || manifest.members.length > 200) fail('invalid-head-lock');
    const paths = manifest.members.map(m => m.path);
    for (const rel of paths) if (typeof rel !== 'string' || rel.length > 240 || !/^[A-Za-z0-9_./-]+$/.test(rel) || rel.split('/').some(p => !p || p === '.' || p === '..') || !TREES.some(t => rel.startsWith(`${BASE}/${t}/`))) fail('invalid-head-path');
    paths.push(LOCK, MIRROR);
    if (new Set(paths).size !== paths.length) fail('invalid-head-path');
    const tree = git(['ls-tree', '-rz', head, '--', ...paths]).toString().split('\0').filter(Boolean);
    const expectedIndex = tree.map(row => {
      const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(row);
      if (!match) fail('unsafe-head-member');
      return `${match[1]} ${match[2]} 0\t${match[3]}`;
    }).sort().join('\0');
    if (tree.length !== paths.length) fail('head-member-missing');
    const index = () => git(['ls-files', '--stage', '-z', '--', ...paths]).toString().split('\0').filter(Boolean).sort().join('\0');
    const stableGit = () => {
      checkDirs([rootIdentity, gitDir]); checkIndexLock();
      if (owner) {
        const st = fs.lstatSync(owner.file);
        if (!st.isFile() || st.nlink !== 1 || id(st) !== owner.id || st.size > 4096 || fs.readFileSync(owner.file, 'utf8') !== owner.token) fail('restore-owner-changed');
      }
      if (git(['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim() !== head || index() !== expectedIndex) fail('head-or-index-changed');
    };
    stableGit();
    const managed = paths.filter(p => p !== LOCK).sort().join('\0');
    if (scanReferences(root).join('\0') !== managed) fail('source-closure-changed');
    candidate = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-byte-proof-'));
    const plan = []; let total = 0;
    for (const rel of paths) {
      activePath = rel;
      const expected = rel === LOCK ? lockBytes : rel === MIRROR ? mirrorBytes : blob(rel);
      if ((total += expected.length) > 32 * 1024 * 1024) fail('source-limit');
      const current = snapshot(root, rel);
      if (!current.bytes.equals(expected) && !crlfToLf(current.bytes).equals(expected)) fail('local-content-changed');
      const target = path.join(candidate, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, expected);
      plan.push({ ...current, expected });
    }
    // The original byte/size/SHA, mirror and closure verifier proves HEAD blobs
    // BEFORE the first source write. No hash or manifest is regenerated.
    verifyAngularSourceLock({ pidexRoot: candidate });
    stableGit();
    for (const file of plan) { activePath = file.rel; unchanged(root, file); }
    const changes = plan.filter(file => !file.bytes.equals(file.expected));
    if (!apply) return finish({ ok: true, status: changes.length ? 'repair-needed' : 'clean', head, files: changes.map(f => ({ path: f.rel, before_bytes: f.bytes.length, after_bytes: f.expected.length })) });
    for (const file of changes) {
      activePath = file.rel;
      stableGit(); unchanged(root, file);
      const temporary = path.join(path.dirname(file.file), `.pidex-source-${randomUUID()}.tmp`);
      let temporaryId;
      try {
        const fd = fs.openSync(temporary, 'wx', file.mode);
        try { temporaryId = id(fs.fstatSync(fd)); fs.fchmodSync(fd, file.mode); fs.writeFileSync(fd, file.expected); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        beforeWrite?.(file.rel);
        stableGit(); unchanged(root, file);
        const staged = snapshot(root, path.relative(root, temporary).split(path.sep).join('/'));
        if (staged.id !== temporaryId || !staged.bytes.equals(file.expected)) fail('temporary-changed');
        fs.renameSync(temporary, file.file);
        repaired.push(file.rel);
        if (!snapshot(root, file.rel).bytes.equals(file.expected)) fail('post-write-mismatch');
      } finally {
        checkDirs(file.dirs);
        if (temporaryId) try {
          const st = fs.lstatSync(temporary);
          if (!st.isFile() || st.nlink !== 1 || id(st) !== temporaryId) fail('temporary-changed');
          fs.unlinkSync(temporary);
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    }
    stableGit();
    const verified = verifyAngularSourceLock({ pidexRoot: root });
    return finish({ ok: true, status: 'verified', head, repaired, aggregate_sha256: verified.aggregate_sha256 });
  } catch (error) {
    const codes = new Set(['invalid-options', 'unsafe-directory', 'directory-changed', 'unsafe-source-file', 'source-changed', 'host-only', 'git-deadline', 'git-read-failed', 'not-checkout-root', 'partial-clone-unsupported', 'git-index-busy', 'invalid-head', 'head-lock-mismatch', 'invalid-head-lock', 'invalid-head-path', 'unsafe-head-member', 'head-member-missing', 'head-or-index-changed', 'source-closure-changed', 'local-content-changed', 'source-limit', 'post-write-mismatch', 'restore-owner-changed', 'temporary-changed', 'restore-lock-busy']);
    return finish({ ok: false, status: repaired.length ? 'held-partial' : 'blocked', error: codes.has(error?.message) ? error.message : String(error?.message).startsWith('ANGULAR_SOURCE_') ? 'source-integrity-failed' : 'restore-unavailable', head, repaired, ...(['local-content-changed', 'source-changed', 'unsafe-source-file', 'post-write-mismatch'].includes(error?.message) && activePath ? { path: activePath } : {}) });
  } finally {
    let cleanupFailed = false;
    if (candidate) try { fs.rmSync(candidate, { recursive: true, force: true }); } catch { cleanupFailed = true; }
    if (owner) {
      try { fs.closeSync(owner.fd); } catch { cleanupFailed = true; }
      // Unknown/replaced owners are never reclaimed.
      try {
        checkDirs([owner.dir]);
        const st = fs.lstatSync(owner.file);
        if (st.isFile() && st.nlink === 1 && st.size <= 4096 && id(st) === owner.id && fs.readFileSync(owner.file, 'utf8') === owner.token) fs.unlinkSync(owner.file);
        else cleanupFailed = true;
      } catch { cleanupFailed = true; }
    }
    if (cleanupFailed && result) Object.assign(result, { ok: false, status: 'held-cleanup', error: 'cleanup-unconfirmed', repaired });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--apply' && args[0] !== '--check')) {
    console.error('Usage: node scripts/maintenance/restore-angular-source-bytes.mjs [--check|--apply] (from the PIDEX checkout root)');
    process.exitCode = 2;
  } else {
    const result = restoreAngularSourceBytes({ apply: args[0] === '--apply' });
    console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
  }
}
