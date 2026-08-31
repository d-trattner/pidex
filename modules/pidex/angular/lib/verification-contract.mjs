import { detectPackageManager } from '../../../../scripts/package-manager/detect.mjs';
import { buildPackageManagerCommand } from '../../../../scripts/package-manager/commands.mjs';
import { inspectAngularWorkspace } from './workspace-inspector.mjs';
import { readBoundedProjectJson, resolveAngularProjectRoot } from './project-root.mjs';
import { runManagedProcess } from './managed-process.mjs';
import { resolveWorkspaceNxCli } from './nx-cli.mjs';

const OPERATIONS = new Set(['build', 'test', 'lint', 'affected', 'all']);
const TARGET_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const DEFAULT_TIMEOUT_MS = 240_000;
const MAX_OUTPUT_CHARS = 64 * 1024;

export function redactAngularOutput(value = '') {
  return String(value)
    .replace(/\b(AKIA|ASIA)[A-Z2-7]{16}\b/g, '[REDACTED]')
    .replace(/\b(ghp|gho|ghs)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{40,}/g, '[REDACTED]')
    .replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]')
    .slice(-MAX_OUTPUT_CHARS);
}

function nxRequests(root, operation, projectName) {
  const cli = resolveWorkspaceNxCli(root);
  if (operation === 'affected') return [{ id: 'affected', bin: cli.bin, args: [...cli.prefixArgs, 'affected', '-t', 'build,test,lint', '--outputStyle=static'] }];
  const targets = operation === 'all' ? ['build', 'test', 'lint'] : [operation];
  return targets.map((target) => ({
    id: target,
    bin: cli.bin,
    args: [...cli.prefixArgs, ...(projectName ? ['run', `${projectName}:${target}`, '--outputStyle=static'] : ['run-many', '-t', target, '--all', '--outputStyle=static'])],
  }));
}

function packageRequests(root, operation, packageManager) {
  if (operation === 'affected') throw new Error('ANGULAR_VERIFY_AFFECTED_REQUIRES_NX');
  const pkg = readBoundedProjectJson(root, 'package.json', { maxBytes: 1024 * 1024 });
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const targets = operation === 'all' ? ['build', 'test', 'lint'].filter((name) => typeof scripts[name] === 'string') : [operation];
  if (!targets.length || targets.some((name) => typeof scripts[name] !== 'string')) throw new Error('ANGULAR_VERIFY_SCRIPT_MISSING');
  return targets.map((target) => {
    const [bin, ...args] = buildPackageManagerCommand(packageManager, { operation: 'run-script', script: target });
    return { id: target, bin, args };
  });
}

export function buildVerificationRequests(options = {}) {
  if (!OPERATIONS.has(options.operation)) throw new Error('ANGULAR_VERIFY_OPERATION_INVALID');
  if (options.projectName && !TARGET_RE.test(options.projectName)) throw new Error('ANGULAR_VERIFY_PROJECT_NAME_INVALID');
  const roots = resolveAngularProjectRoot(options.project);
  const inspection = options.inspection || inspectAngularWorkspace({ project: roots.physical });
  if (inspection.status !== 'angular_workspace') throw new Error('ANGULAR_VERIFY_NOT_ANGULAR');
  const packageManager = detectPackageManager({ project: roots.physical, mode: 'existing' });
  if (!['pnpm', 'npm'].includes(packageManager.package_manager) || ['conflict', 'unsupported', 'unknown'].includes(packageManager.support)) throw new Error('ANGULAR_VERIFY_PACKAGE_MANAGER_BLOCKED');
  const requests = inspection.nx.detected
    ? nxRequests(roots.physical, options.operation, options.projectName)
    : packageRequests(roots.physical, options.operation, packageManager);
  return { root: roots.physical, inspection, packageManager, requests };
}

function processStatus(proc) {
  if (proc.cleanupIncomplete) return 'cleanup_incomplete';
  if (proc.timedOut) return 'timed_out';
  return proc.status === 0 && !proc.signal && !proc.error ? 'passed' : 'failed';
}

async function executeRequest(prepared, request, execute, timeoutMs) {
  const tick = Date.now();
  const proc = await execute({
    bin: request.bin, args: request.args, cwd: prepared.root, timeoutMs, captureBytes: MAX_OUTPUT_CHARS,
    env: { ...process.env, CI: 'true', NX_DAEMON: 'false', NX_TASKS_RUNNER_DYNAMIC_OUTPUT: 'false', NG_CLI_ANALYTICS: 'false' },
  });
  const stdout = String(proc.stdout || ''); const stderr = String(proc.stderr || proc.error?.message || '');
  return {
    target: request.id, status: processStatus(proc), exit_code: proc.status, signal: proc.signal || null, duration_ms: Date.now() - tick,
    stdout: redactAngularOutput(stdout), stderr: redactAngularOutput(stderr), output_truncated: Boolean(proc.stdoutTruncated || proc.stderrTruncated),
  };
}

function overallStatus(results) {
  if (results.every((item) => item.status === 'passed')) return 'passed';
  if (results.some((item) => item.status === 'cleanup_incomplete')) return 'cleanup_incomplete';
  return results.some((item) => item.status === 'timed_out') ? 'timed_out' : 'failed';
}

export async function runAngularVerification(options = {}) {
  const prepared = buildVerificationRequests(options);
  const execute = options.execute || runManagedProcess;
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900_000) throw new Error('ANGULAR_VERIFY_TIMEOUT_INVALID');
  const started = new Date().toISOString(); const results = [];
  for (const request of prepared.requests) {
    const result = await executeRequest(prepared, request, execute, timeoutMs); results.push(result);
    if (result.status !== 'passed') break;
  }
  return {
    schema: 'pidex-angular-verification-result-v1', status: overallStatus(results), operation: options.operation,
    project_name: options.projectName || null, project_root: prepared.root, started_at: started, ended_at: new Date().toISOString(),
    source_lock: 'pidex-angular-source-lock-v1', coverage: { status: 'NOT_CONFIGURED' }, results,
  };
}
