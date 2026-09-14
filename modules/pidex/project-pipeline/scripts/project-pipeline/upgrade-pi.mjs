#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadProjectRecord, safeProjectId } from './registry.mjs';
import { dockerSpawnSync } from './docker-spawn.mjs';
import { withProjectPiLease, writeMaintenanceReceipt } from './pi-maintenance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const version = /^\d+\.\d+\.\d+$/;
const safeErrors = new Set(['confirmation-required', 'project-execution-busy', 'pi-maintenance-held', 'project-not-idle', 'container-not-idle', 'container-identity-mismatch', 'container-mount-mismatch', 'docker-unavailable', 'version-probe-failed', 'invalid-version-pin', 'upgrade-unconfirmed', 'unsupported-pi-layout', 'downgrade-denied', 'install-unconfirmed', 'install-failed', 'version-mismatch', 'container-update-failed']);

export function targetPiVersion() {
  const dockerfile = readFileSync(path.resolve(here, '../../Dockerfile'), 'utf8');
  const matches = [...dockerfile.matchAll(/^ARG PI_CODING_AGENT_VERSION=(\d+\.\d+\.\d+)$/gm)];
  if (matches.length !== 1) throw new Error('invalid-version-pin');
  return matches[0][1];
}

export function inspectUpgradeContainer(record, inspect) {
  const labels = inspect?.Config?.Labels || {};
  if ((inspect?.Config?.Env || []).some(v => /^(NODE_OPTIONS|NODE_PATH|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT)=.+/.test(v))) throw new Error('container-identity-mismatch');
  if (!/^[a-f0-9]{64}$/.test(inspect?.Id || '') || inspect.Name !== `/${record.docker.container_name}` ||
      labels['pidex.project_id'] !== record.project_id || labels['pidex.kind'] !== 'project-container' ||
      labels['pidex.project_sandbox'] !== 'true' || !(inspect.Config?.Env || []).includes('PIDEX_PROJECT_PIPELINE_CONTAINER=1') || !inspect.State?.Running || inspect.State.Paused ||
      inspect.Path !== 'sleep' || JSON.stringify(inspect.Args) !== '["infinity"]') throw new Error('container-identity-mismatch');
  const expected = { '/workspace': record.docker.workspace_volume, '/pidex-secrets': record.docker.secrets_volume, '/cache': record.docker.cache_volume };
  for (const [destination, name] of Object.entries(expected)) {
    const mounts = (inspect.Mounts || []).filter(m => m.Destination === destination);
    if (mounts.length !== 1 || mounts[0].Type !== 'volume' || mounts[0].Name !== name || mounts[0].RW !== true) throw new Error('container-mount-mismatch');
  }
  // No bind/volume overlays on the runtime being maintained.
  if ((inspect.Mounts || []).some(m => !Object.hasOwn(expected, m.Destination) && !(m.Type === 'tmpfs' && m.Destination === '/tmp'))) throw new Error('container-mount-mismatch');
  return inspect.Id;
}

export function upgradeProjectPi(options = {}) {
  let receipt, paths;
  try {
    const projectId = safeProjectId(options.projectId);
    if (options.confirm !== projectId) throw new Error('confirmation-required');
    return withProjectPiLease({ ...options, projectId }, (leasePaths) => {
      paths = leasePaths;
      try {
      const record = loadProjectRecord(options.pidexRoot, projectId);
      if (record.target?.kind !== 'local' || (record.runs || []).some(r => r.started_at && !r.ended_at)) throw new Error('project-not-idle');
      const target = targetPiVersion();
      const runner = options.runner || ((args, opts) => dockerSpawnSync(args, { encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 15000, ...opts }));
      const call = (args, opts) => {
        const proc = runner(args, opts);
        if (proc.error || proc.status !== 0) throw new Error('docker-unavailable');
        return String(proc.stdout || '');
      };
      const id = inspectUpgradeContainer(record, JSON.parse(call(['inspect', record.docker.container_name]))[0]);
      const rows = call(['top', id, '-eo', 'pid,comm']).trim().split(/\r?\n/);
      if (rows.length !== 2 || !/^\s*\d+\s+sleep\s*$/.test(rows[1])) throw new Error('container-not-idle');
      const exec = ['exec', '--user', 'node', '--workdir', '/', id, '/usr/local/bin/pi', '--version'];
      const before = call(exec).trim();
      if (!version.test(before)) throw new Error('version-probe-failed');
      receipt = { schema: 1, operation_id: randomUUID(), project_id: projectId, container_id: id, target, before, status: 'in_progress', started_at: new Date().toISOString() };
      writeMaintenanceReceipt(paths, receipt);
      if (before === target) {
        receipt = { ...receipt, status: 'verified', after: before, finished_at: new Date().toISOString() };
        writeMaintenanceReceipt(paths, receipt);
        return { ok: true, status: 'verified', before, after: before, target, changed: false };
      }
      const controller = readFileSync(path.join(here, 'pi-upgrade-container.mjs'), 'utf8');
      const proc = runner(['exec', '--user', 'root', '--workdir', '/', id, '/usr/local/bin/node', '--input-type=module', '-e', controller, '--', target], { timeout: 240000 });
      let result;
      try { result = JSON.parse(String(proc.stdout || '')); } catch { throw new Error('upgrade-unconfirmed'); }
      if (proc.error || !['verified', 'failed_unchanged', 'rolled_back', 'held'].includes(result.status) ||
          (result.before && (!version.test(result.before) || result.before !== before)) ||
          (result.status === 'verified' && (proc.status !== 0 || result.after !== target))) throw new Error('upgrade-unconfirmed');
      // Recheck the same container and the real node-user CLI; no model request.
      const afterId = inspectUpgradeContainer(record, JSON.parse(call(['inspect', id]))[0]);
      if (afterId !== id) throw new Error('container-identity-mismatch');
      const after = call(exec).trim();
      if (!version.test(after) || (result.status === 'verified' ? after !== target : after !== before)) throw new Error('upgrade-unconfirmed');
      const errorCode = safeErrors.has(result.reason) ? result.reason : 'upgrade-unconfirmed';
      receipt = { ...receipt, status: result.status, after, ...(result.status !== 'verified' ? { error: errorCode } : {}), finished_at: new Date().toISOString() };
      writeMaintenanceReceipt(paths, receipt);
      return { ok: receipt.status === 'verified', status: receipt.status, before, after, target, changed: before !== after, ...(receipt.error ? { error: receipt.error } : {}) };
      } catch (error) {
        if (receipt) {
          try { writeMaintenanceReceipt(paths, { ...receipt, status: 'held', error: safeErrors.has(error.message) ? error.message : 'upgrade-unconfirmed', finished_at: new Date().toISOString() }); } catch { paths.retainLock = true; /* Never release admission after uncertain receipt publication. */ }
        }
        throw error;
      }
    }, true);
  } catch (error) {
    return { ok: false, status: receipt ? 'held' : 'blocked', error: safeErrors.has(error.message) ? error.message : receipt ? 'upgrade-unconfirmed' : 'upgrade-preflight-failed' };
  }
}

export function parseUpgradeArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = { '--pidex-root': 'pidexRoot', '--project-id': 'projectId', '--confirm': 'confirm' }[argv[i]];
    if (argv[i] === '--json') continue;
    if (!key || args[key] !== undefined || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('invalid-arguments');
    args[key] = argv[++i];
  }
  if (!args.pidexRoot || !path.isAbsolute(args.pidexRoot) || !args.projectId || !args.confirm) throw new Error('invalid-arguments');
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = upgradeProjectPi(parseUpgradeArgs(process.argv.slice(2)));
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } catch { console.log(JSON.stringify({ ok: false, status: 'blocked', error: 'invalid-arguments' })); process.exitCode = 2; }
}
