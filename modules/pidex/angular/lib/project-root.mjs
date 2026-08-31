import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export function resolveAngularProjectRoot(input) {
  const requested = path.resolve(String(input || ''));
  if (!existsSync(requested)) throw new Error('ANGULAR_PROJECT_ROOT_MISSING');
  const stat = lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('ANGULAR_PROJECT_ROOT_INVALID');
  const physical = realpathSync(requested);
  if (!lstatSync(physical).isDirectory()) throw new Error('ANGULAR_PROJECT_ROOT_INVALID');
  return { requested, physical };
}

export function pathWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertNoProjectLink(root, relative) {
  let current = path.resolve(root);
  for (const part of relative.split(/[\\/]+/)) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`ANGULAR_PROJECT_FILE_LINK:${relative}`);
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mode === right.mode;
}

function readBoundedProjectFile(root, relative, options = {}) {
  const maxBytes = Number(options.maxBytes || 1024 * 1024);
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]+/).some((part) => part === '..' || part === '')) throw new Error('ANGULAR_PROJECT_FILE_PATH_INVALID');
  const target = path.resolve(root, relative); const physicalRoot = realpathSync(root);
  if (!pathWithin(root, target)) throw new Error('ANGULAR_PROJECT_FILE_ESCAPE');
  if (!existsSync(target)) return null;
  assertNoProjectLink(root, relative);
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW || 0); let fd;
  try {
    fd = openSync(target, flags);
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.size > BigInt(maxBytes)) throw new Error(`ANGULAR_PROJECT_FILE_INVALID:${relative}`);
    const bytes = readFileSync(fd);
    const reread = fstatSync(fd, { bigint: true });
    assertNoProjectLink(root, relative);
    const finalPath = realpathSync(target); const finalStat = lstatSync(target, { bigint: true });
    if (!pathWithin(physicalRoot, finalPath) || !sameIdentity(opened, reread) || !sameIdentity(opened, finalStat)) throw new Error(`ANGULAR_PROJECT_FILE_RACE:${relative}`);
    return bytes.toString('utf8');
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function readBoundedProjectJson(root, relative, options = {}) {
  const text = readBoundedProjectFile(root, relative, options);
  if (text === null) return null;
  try { return JSON.parse(text); }
  catch { throw new Error(`ANGULAR_PROJECT_JSON_INVALID:${relative}`); }
}
