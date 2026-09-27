import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Pure read-only hashing: no process launch, timers, configuration or writes.
// Framing and all containment/hardlink checks match the original synchronous API.
export function dependencyDigest(root, { workspaceRoots = [], onProgress } = {}) {
  const counts = { entries: 0, files: 0, directories: 0, links: 0, bytes: 0 };
  const report = (operation, extra = {}) => onProgress?.({ operation, ...counts, ...extra });
  const roots = [root, ...workspaceRoots];
  for (const directory of roots) {
    report('check-root');
    if (realpathSync(directory) !== path.resolve(directory)) throw new Error('Dependency/workspace root must not be a link');
  }
  const contained = target => roots.some(directory => {
    const relative = path.relative(directory, target);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  });
  const hash = createHash('sha256');
  const walk = directory => {
    report('read-directory');
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name); report('stat-entry');
      const stat = lstatSync(file); counts.entries++;
      const relative = path.relative(root, file); hash.update(`${relative.length}:${relative}`);
      if (stat.isSymbolicLink()) {
        report('check-link');
        if (!contained(realpathSync(file))) throw new Error('Dependency link escapes seed');
        hash.update(`link:${readlinkSync(file)}`); counts.links++;
      } else if (stat.isDirectory()) { counts.directories++; hash.update('directory'); walk(file); }
      else if (stat.isFile() && stat.nlink === 1) {
        report('read-file', { currentFileBytes: stat.size });
        hash.update(`file:${stat.size}:`); const bytes = readFileSync(file); hash.update(bytes);
        counts.files++; counts.bytes += bytes.length;
      } else throw new Error('Dependencies must contain only copied files and internal links');
    }
  };
  // Scan complete allowed trees including ignored workspace files. Never follow
  // junctions/symlinks recursively, including workspace links back to dependencies.
  for (const directory of roots) walk(directory);
  report('complete');
  return hash.digest('hex');
}

export function seedDependencyDigest(source, { onProgress } = {}) {
  onProgress?.({ operation: 'workspace-identity' });
  const dashboard = path.join(source, 'dashboard');
  const workspaceRoots = [];
  if (existsSync(path.join(dashboard, 'package.json'))) {
    if (JSON.parse(readFileSync(path.join(dashboard, 'package.json'), 'utf8')).name !== '@pidex/dashboard') throw new Error('Unexpected dashboard workspace identity');
    workspaceRoots.push(dashboard);
  }
  return dependencyDigest(path.join(source, 'node_modules'), { workspaceRoots, onProgress });
}
