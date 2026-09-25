import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CHECK_STAGES = Object.freeze([
  'check:bootstrap',
  'check:runtime',
  'check:quality',
  'check:release',
]);

export function stageInvocation(stage, platform = process.platform, env = process.env) {
  if (!CHECK_STAGES.includes(stage)) throw new Error(`Unknown check stage: ${stage}`);
  if (platform === 'win32') {
    return {
      command: env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', `pnpm.cmd run ${stage}`],
    };
  }
  return { command: 'corepack', args: ['pnpm', 'run', stage] };
}

export function runCheckStages({ platform = process.platform, env = process.env, spawn = spawnSync } = {}) {
  for (const stage of CHECK_STAGES) {
    const invocation = stageInvocation(stage, platform, env);
    const result = spawn(invocation.command, invocation.args, {
      cwd: process.cwd(),
      env,
      stdio: 'inherit',
      shell: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return Number.isInteger(result.status) ? result.status : 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCheckStages();
  } catch (error) {
    console.error(`check dispatcher failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
