import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function pidexRootFromModuleUrl(importMetaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '../../../../..');
}

export function browserSmokePaths(pidexRoot = pidexRootFromModuleUrl()) {
  return {
    pidexRoot,
    stateDir: path.join(pidexRoot, 'state', 'browser-smoke'),
    cacheDir: path.join(pidexRoot, '.cache', 'ms-playwright'),
    packageJson: path.join(pidexRoot, 'state', 'browser-smoke', 'package.json'),
  };
}
