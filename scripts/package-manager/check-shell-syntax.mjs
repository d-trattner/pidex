import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `bash -n a.sh b.sh` checks only a.sh: b.sh is an argument to a.sh.
// Invoke once per file, fail closed, and never execute script bodies.
export function checkShellSyntax(files, { spawn = spawnSync, cwd = process.cwd() } = {}) {
  if (!files.length) throw new Error('At least one shell file is required');
  for (const file of files) {
    const result = spawn('bash', ['-n', '--', file], { cwd, shell: false, stdio: 'inherit', timeout: 10000 });
    if (result.error || result.signal || result.status !== 0) {
      console.error(`Shell syntax check failed: ${file}${result.error ? ` (${result.error.code})` : ''}`);
      return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = checkShellSyntax(process.argv.slice(2));
}
