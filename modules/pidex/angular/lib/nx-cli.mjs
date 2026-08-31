import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathWithin } from './project-root.mjs';

export function resolveWorkspaceNxCli(root) {
  const candidate = path.join(root, 'node_modules', 'nx', 'bin', 'nx.js');
  if (!existsSync(candidate)) throw new Error('ANGULAR_NX_CLI_MISSING');
  const physical = realpathSync(candidate);
  if (!pathWithin(root, physical) || !lstatSync(physical).isFile()) throw new Error('ANGULAR_NX_CLI_INVALID');
  return { bin: process.execPath, prefixArgs: [physical] };
}
