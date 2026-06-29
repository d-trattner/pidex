import { spawnSync } from 'node:child_process';
import process from 'node:process';

export function dockerSpawnSync(args, opts = {}) {
  const env = {
    ...process.env,
    MSYS_NO_PATHCONV: process.env.MSYS_NO_PATHCONV || '1',
    MSYS2_ARG_CONV_EXCL: process.env.MSYS2_ARG_CONV_EXCL || '*',
    ...(opts.env || {}),
  };
  return spawnSync('docker', args, { ...opts, env });
}
