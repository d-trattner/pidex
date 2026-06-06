#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { safeRunId } from './policy.mjs';

export function parseCleanupArgs(argv) {
  const out = { pidexRoot: process.cwd(), runId: '', success: false, preserveOnFailure: true, olderThanHours: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i] || '';
    else if (arg === '--run-id') out.runId = argv[++i] || '';
    else if (arg === '--success') out.success = true;
    else if (arg === '--preserve-on-failure') out.preserveOnFailure = true;
    else if (arg === '--remove-on-failure') out.preserveOnFailure = false;
    else if (arg === '--older-than-hours') out.olderThanHours = Number(argv[++i] || '0');
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

export function confinedRunPaths(pidexRoot, runId) {
  const id = safeRunId(runId);
  const root = path.resolve(pidexRoot);
  const runsRoot = path.join(root, 'state', 'sandbox', 'runs');
  const runRoot = path.resolve(runsRoot, id);
  const rel = path.relative(runsRoot, runRoot);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('cleanup target escapes sandbox runs root');
  if ([runsRoot, root, os.homedir(), path.parse(runRoot).root].includes(runRoot)) throw new Error('refusing unsafe cleanup target');
  for (const p of [runRoot, path.join(runRoot, 'workspace')]) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error(`refusing symlink cleanup target: ${p}`);
  }
  return { runRoot, workspace: path.join(runRoot, 'workspace') };
}

function dockerListLabeledContainers(runId) {
  const args = ['ps', '-aq', '--filter', 'label=pidex.sandbox=true'];
  if (runId) args.push('--filter', `label=pidex.sandbox.run_id=${runId}`);
  const list = spawnSync('docker', args, { encoding: 'utf8' });
  if (list.status !== 0) return { ok: false, reason: 'docker-list-failed', stderr: list.stderr?.trim(), ids: [] };
  return { ok: true, ids: list.stdout.trim().split(/\s+/).filter(Boolean) };
}

function dockerRemoveIds(ids) {
  for (const id of ids) {
    spawnSync('docker', ['stop', '--time', '5', id], { encoding: 'utf8' });
    spawnSync('docker', ['rm', '-f', id], { encoding: 'utf8' });
  }
  return { ok: true, containers_removed: ids.length };
}

function dockerRmContainers(runId) {
  const listed = dockerListLabeledContainers(runId);
  if (!listed.ok) return listed;
  return dockerRemoveIds(listed.ids);
}

function dockerRmStaleContainers(cutoffMs) {
  const listed = dockerListLabeledContainers('');
  if (!listed.ok) return listed;
  const stale = [];
  const skipped = [];
  for (const id of listed.ids) {
    const inspect = spawnSync('docker', ['inspect', '-f', '{{json .Config.Labels}}', id], { encoding: 'utf8' });
    if (inspect.status !== 0) { skipped.push({ id, reason: 'inspect-failed' }); continue; }
    try {
      const labels = JSON.parse(inspect.stdout.trim() || '{}');
      const created = Date.parse(labels['pidex.sandbox.created_at'] || '');
      if (Number.isFinite(created) && created <= cutoffMs) stale.push(id);
      else skipped.push({ id, reason: 'not-stale' });
    } catch {
      skipped.push({ id, reason: 'label-parse-failed' });
    }
  }
  return { ...dockerRemoveIds(stale), skipped_containers: skipped };
}

export function cleanupRun(options = {}) {
  const { runRoot, workspace } = confinedRunPaths(options.pidexRoot || process.cwd(), options.runId);
  const docker = dockerRmContainers(options.runId);
  const removeWorkspace = options.success || options.preserveOnFailure === false;
  let workspace_status = 'preserved';
  let workspace_error = null;
  if (removeWorkspace && existsSync(workspace)) {
    try {
      rmSync(workspace, { recursive: true, force: true });
      workspace_status = existsSync(workspace) ? 'failed' : 'removed';
      if (workspace_status === 'failed') workspace_error = 'workspace still exists after rmSync';
    } catch (error) {
      workspace_status = 'failed';
      workspace_error = error?.message || String(error);
    }
  }
  const ok = docker?.ok !== false && workspace_status !== 'failed';
  const result = { ok, run_id: options.runId, run_root: runRoot, workspace, workspace_status, workspace_error, docker, method: 'host-rm' };
  try { writeFileSync(path.join(runRoot, 'cleanup-status.json'), JSON.stringify(result, null, 2)); } catch {}
  return result;
}

export function cleanupStale(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const olderThanHours = Number(options.olderThanHours || 24);
  if (!Number.isFinite(olderThanHours) || olderThanHours <= 0) throw new Error('--older-than-hours must be a positive number');
  const runsRoot = path.join(pidexRoot, 'state', 'sandbox', 'runs');
  const cutoffMs = Date.now() - olderThanHours * 60 * 60 * 1000;
  const removed = [];
  const skipped = [];
  if (existsSync(runsRoot)) {
    for (const entry of readdirSync(runsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const { runRoot, workspace } = confinedRunPaths(pidexRoot, entry.name);
        const st = statSync(runRoot);
        if (st.mtimeMs > cutoffMs) { skipped.push({ run_id: entry.name, reason: 'not-stale' }); continue; }
        let workspace_status = 'absent';
        let workspace_error = null;
        if (existsSync(workspace)) {
          try {
            rmSync(workspace, { recursive: true, force: true });
            workspace_status = existsSync(workspace) ? 'failed' : 'removed';
            if (workspace_status === 'failed') workspace_error = 'workspace still exists after rmSync';
          } catch (error) {
            workspace_status = 'failed';
            workspace_error = error?.message || String(error);
          }
        }
        if (workspace_status === 'failed') { skipped.push({ run_id: entry.name, reason: workspace_error || 'workspace-removal-failed' }); continue; }
        removed.push({ run_id: entry.name, workspace });
        try { writeFileSync(path.join(runRoot, 'cleanup-status.json'), JSON.stringify({ ok: true, run_id: entry.name, workspace_status, workspace_error, stale_cleanup: true, method: 'host-rm' }, null, 2)); } catch {}
      } catch (error) {
        skipped.push({ run_id: entry.name, reason: error?.message || String(error) });
      }
    }
  }
  const docker = dockerRmStaleContainers(cutoffMs);
  return { ok: docker?.ok !== false && skipped.every((item) => item.reason !== 'workspace-removal-failed'), older_than_hours: olderThanHours, removed, skipped, docker };
}

function usage() { return 'Usage: cleanup.mjs --pidex-root PATH --run-id RUN_ID [--success|--remove-on-failure] --json\n       cleanup.mjs --pidex-root PATH --older-than-hours 24 --json'; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCleanupArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = args.olderThanHours != null ? cleanupStale(args) : cleanupRun(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
