import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
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

function readBoundedProjectFile(root, relative, options = {}) {
  const maxBytes = Number(options.maxBytes || 1024 * 1024);
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]+/).some((part) => part === '..' || part === '')) {
    throw new Error('ANGULAR_PROJECT_FILE_PATH_INVALID');
  }
  const target = path.resolve(root, relative);
  if (!pathWithin(root, target)) throw new Error('ANGULAR_PROJECT_FILE_ESCAPE');
  if (!existsSync(target)) return null;
  let current = path.resolve(root);
  for (const part of relative.split(/[\\/]+/)) {
    current = path.join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`ANGULAR_PROJECT_FILE_LINK:${relative}`);
  }
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error(`ANGULAR_PROJECT_FILE_INVALID:${relative}`);
  const physical = realpathSync(target);
  if (!pathWithin(realpathSync(root), physical)) throw new Error(`ANGULAR_PROJECT_FILE_ESCAPE:${relative}`);
  return readFileSync(physical, 'utf8');
}

export function readBoundedProjectJson(root, relative, options = {}) {
  const text = readBoundedProjectFile(root, relative, options);
  if (text === null) return null;
  try { return JSON.parse(text); }
  catch { throw new Error(`ANGULAR_PROJECT_JSON_INVALID:${relative}`); }
}
