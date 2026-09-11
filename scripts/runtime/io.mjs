import * as fs from 'node:fs';
import path from 'node:path';
import { RuntimeBaselineError, MAX_RECORD_BYTES, parseRecordJson } from './contracts.mjs';

export function safePath(root, relative = '') {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.includes('\\')
      || relative.split('/').some(p => p === '..' || p === '.') || relative.includes('\0') || relative.includes(':')) {
    throw new RuntimeBaselineError('PATH_UNSAFE');
  }
  let current = path.resolve(root);
  // Existing ancestors of the state root must also be link-free. Callers may
  // canonicalize an explicitly selected source root before entering this seam.
  const parsed = path.parse(current);
  for (const part of current.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    parsed.root = path.join(parsed.root, part);
    checkLink(parsed.root);
  }
  for (const part of relative.split('/').filter(Boolean)) {
    current = path.join(current, part);
    checkLink(current);
  }
  return current;
}
function checkLink(file) {
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new RuntimeBaselineError('PATH_UNSAFE'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function assertRegular(stat) {
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)throw new RuntimeBaselineError('PATH_UNSAFE');
}
function assertUnchanged(before,after,disk,used) {
  if(used!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs||disk.ino!==after.ino||disk.dev!==after.dev||disk.isSymbolicLink())throw new RuntimeBaselineError('CANDIDATE_CHANGED');
}
export function readBounded(root, relative, maxBytes = MAX_RECORD_BYTES) {
  const file = safePath(root, relative);
  let fd;
  try {
    const initial=fs.lstatSync(file);
    assertRegular(initial);
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    const before = fs.fstatSync(fd);
    assertRegular(before);
    if(initial.ino!==before.ino||initial.dev!==before.dev)throw new RuntimeBaselineError('CANDIDATE_CHANGED');
    if (before.size > maxBytes) throw new RuntimeBaselineError('OBSERVATION_LIMIT');
    const bytes = Buffer.alloc(before.size + 1);
    let used = 0;
    while (used < bytes.length) {
      const n = fs.readSync(fd, bytes, used, bytes.length - used, null);
      if (!n) break;
      used += n;
    }
    const after = fs.fstatSync(fd);
    const disk = fs.lstatSync(file);
    assertUnchanged(before,after,disk,used);
    return { bytes: bytes.subarray(0,used), stat: after };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
export function readJson(root, relative) { return parseRecordJson(readBounded(root, relative).bytes); }
export function issue(error, component, fallback = 'SOURCE_UNAVAILABLE') {
  return {code: error instanceof RuntimeBaselineError ? error.code : fallback, component};
}
