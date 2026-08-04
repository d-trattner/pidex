#!/usr/bin/env node
// Plan 059 Slice 3 (AD-3): single shared implementation of the project-scoped
// TBR serialization lock, used by BOTH the lifecycle completion boundary
// (event.mjs takeTbrLock / withProjectTbrLock) and archive sync carry
// validation (archive-sync.mjs). One lock file, one owner format, one
// fail-closed acquisition — no second lock framework, no circular module
// authority (this module imports only project-key.mjs in the same lib).
//
// The lock lives at stateDir/pipeline-events/.tbr-<projectKey>.lock — external
// to replaceable project/archive content. Owner semantics mirror the existing
// fail-closed directory lock used for lifecycle selection/gate locks: malformed,
// dead-but-unproven, or unreadable owners fail closed (UNCERTAIN); deadline
// without proof fails UNAVAILABLE; no mtime/stale takeover ever. Stale-lock
// cleanup is operator repair, never automatic.
import { existsSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, rmdirSync, closeSync, fsyncSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalProjectIdentity, projectKeyFromResolvedPath } from './project-key.mjs';

const SELF_PROCESS_START = `opaque-${process.pid}-${Math.floor(Date.now() - process.uptime() * 1000)}`;
function processStart(pid) {
  try { const stat = readFileSync(`/proc/${pid}/stat`, 'utf8'); return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19] || null; }
  catch { return pid === process.pid ? SELF_PROCESS_START : null; }
}
function ownerProvenDead(owner) {
  try { process.kill(owner.pid, 0); } catch (error) { return error?.code === 'ESRCH'; }
  const currentStart = processStart(owner.pid); return Boolean(currentStart && currentStart !== owner.processStart);
}
function sleep(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function validOwner(value) {
  return value && Number.isInteger(value.pid) && value.pid > 0 && typeof value.processStart === 'string' && value.processStart.length > 0 && value.processStart.length <= 128 && typeof value.key === 'string' && value.key.length <= 256;
}
function writeNewFileDurable(file, content, mode = 0o600) {
  const fd = openSync(file, 'wx', mode);
  try { const payload = Buffer.from(content); let offset = 0; while (offset < payload.length) { const written = writeSync(fd, payload, offset, payload.length - offset); if (!Number.isInteger(written) || written <= 0) throw new Error('tbr lock short write'); offset += written; } fsyncSync(fd); }
  finally { closeSync(fd); }
}

export function projectTbrLockPath({ stateDir, project }) {
  const identity = canonicalProjectIdentity(project);
  return path.join(path.resolve(stateDir), 'pipeline-events', `.tbr-${identity.projectKey}.lock`);
}

// First-sync support: before the archive root exists no boundary writer can
// contend (canonicalProjectIdentity of a missing root fails closed upstream), so
// the lock key falls back to the deterministic resolved-path key. Once the root
// exists every participant uses the canonical realpath key — identical for a
// non-symlinked root.
function tbrKey(project) {
  try { return canonicalProjectIdentity(project).projectKey; }
  catch { return projectKeyFromResolvedPath(path.resolve(project)); }
}

// Acquire the project TBR serialization lock. Returns { held: true, lock } or
// { held: false, code: 'REVIEW_TBR_LOCK_UNCERTAIN' | 'REVIEW_TBR_LOCK_UNAVAILABLE' }.
// Caller releases with releaseProjectTbrLock(lock) — the same unlink+rmdir the
// lifecycle boundary uses, so both sides interoperate on the identical lock.
export function acquireProjectTbrLock({ stateDir, project, lockTimeoutMs = 1000 }) {
  const lock = path.join(path.resolve(stateDir), 'pipeline-events', `.tbr-${tbrKey(project)}.lock`);
  const eventsRoot = path.dirname(lock);
  if (existsSync(eventsRoot) && !lstatSync(eventsRoot).isDirectory()) return { held: false, code: 'REVIEW_TBR_LOCK_UNCERTAIN' };
  mkdirSync(eventsRoot, { recursive: true });
  const deadline = Date.now() + Math.max(0, lockTimeoutMs);
  const key = tbrKey(project);
  while (true) {
    let created = false;
    try {
      mkdirSync(lock, { mode: 0o700 }); created = true;
      const owner = { pid: process.pid, processStart: processStart(process.pid), key };
      if (!owner.processStart) throw new Error('process start identity unavailable');
      writeNewFileDurable(path.join(lock, 'owner.json'), JSON.stringify(owner), 0o600);
      return { held: true, lock };
    } catch (error) {
      if (created) { try { rmSync(lock, { recursive: true, force: true }); } catch {} throw error; }
      if (error?.code !== 'EEXIST') throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(path.join(lock, 'owner.json'), 'utf8')); }
      catch (readError) {
        // Owner.json not yet durable while the creator is mid-acquisition: keep
        // waiting until the deadline. Malformed or unreadable owner content fails
        // closed with UNCERTAIN and never takes over by mtime/staleness.
        if (readError?.code === 'ENOENT' && Date.now() < deadline) { sleep(10); continue; }
        return { held: false, code: 'REVIEW_TBR_LOCK_UNCERTAIN' };
      }
      if (!validOwner(owner)) return { held: false, code: 'REVIEW_TBR_LOCK_UNCERTAIN' };
      if (ownerProvenDead(owner)) return { held: false, code: 'REVIEW_TBR_LOCK_UNCERTAIN' };
      if (Date.now() >= deadline) return { held: false, code: 'REVIEW_TBR_LOCK_UNAVAILABLE' };
      sleep(10);
    }
  }
}

export function releaseProjectTbrLock(lock) {
  unlinkSync(path.join(lock, 'owner.json'));
  rmdirSync(lock);
}
