#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createProjectRecord, dockerResourceNames, loadProjectRecord, removeProjectRecord, saveProjectRecord, safeProjectId } from './registry.mjs';

export const DEFAULT_IMAGE = 'pidex/project-node22:local';

export function dockerLabels(projectId, kind) {
  return [
    'pidex.sandbox=true',
    'pidex.project_sandbox=true',
    `pidex.project_id=${safeProjectId(projectId)}`,
    `pidex.kind=${kind}`,
  ];
}

function docker(args, opts = {}) {
  const proc = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...opts });
  if (proc.status !== 0) throw new Error(`docker ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  return proc.stdout;
}

export function volumeCreateArgs(name, projectId, kind) {
  return ['volume', 'create', ...dockerLabels(projectId, kind).flatMap((label) => ['--label', label]), name];
}

export function previewPublishArgs(record) {
  const ports = record.preview?.ports;
  if (!ports) return [];
  const out = [];
  for (let offset = 0; offset < ports.size; offset += 1) {
    const hostPort = ports.base + offset;
    const containerPort = ports.container_base + offset;
    out.push('--publish', `${ports.host_bind}:${hostPort}:${containerPort}`);
  }
  return out;
}

export function containerCreateArgs(record) {
  const d = record.docker;
  return [
    'create',
    '--name', d.container_name,
    ...dockerLabels(record.project_id, 'project-container').flatMap((label) => ['--label', label]),
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--pids-limit', '512',
    '--memory', '2g',
    '--cpus', '2',
    '--tmpfs', '/tmp:rw,nosuid,nodev,size=512m',
    '--mount', `type=volume,source=${d.workspace_volume},target=/workspace`,
    '--mount', `type=volume,source=${d.secrets_volume},target=/pidex-secrets`,
    '--mount', `type=volume,source=${d.cache_volume},target=/cache`,
    '--workdir', '/workspace',
    '--env', 'HOME=/pidex-home',
    '--env', 'PI_CODING_AGENT_DIR=/pidex-secrets/pi/agent',
    '--env', 'PIDEX_PROJECT_PIPELINE_CONTAINER=1',
    ...previewPublishArgs(record),
    d.image || DEFAULT_IMAGE,
    'sleep', 'infinity',
  ];
}

export function containerStartArgs(record) {
  return ['start', record.docker.container_name];
}

export function removeArgs(record) {
  return {
    container: ['rm', '-f', record.docker.container_name],
    volumes: [record.docker.workspace_volume, record.docker.secrets_volume, record.docker.cache_volume].map((name) => ['volume', 'rm', '-f', name]),
  };
}

function runDocker(args, runner) {
  if (runner) return runner(args);
  return docker(args);
}

export function createProjectSandbox(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = createProjectRecord({ name: options.name, project_id: options.projectId, image: options.image || DEFAULT_IMAGE, source_kind: options.sourceKind || 'empty', source_ref: options.sourceRef || '' });
  const d = record.docker;
  const created = [];
  let file = saveProjectRecord(pidexRoot, record);
  try {
    runDocker(volumeCreateArgs(d.workspace_volume, record.project_id, 'workspace'), options.runner); created.push(d.workspace_volume);
    runDocker(volumeCreateArgs(d.secrets_volume, record.project_id, 'secrets'), options.runner); created.push(d.secrets_volume);
    runDocker(volumeCreateArgs(d.cache_volume, record.project_id, 'cache'), options.runner); created.push(d.cache_volume);
    runDocker(containerCreateArgs(record), options.runner);
    runDocker(containerStartArgs(record), options.runner);
    record.status = 'ready';
    record.archive.path = path.join(pidexRoot, 'state', 'project-archives', record.project_id);
    file = saveProjectRecord(pidexRoot, record);
    return { ok: true, record, file, created };
  } catch (error) {
    record.status = 'needs-repair';
    record.repair = { reason: error.message || String(error), created };
    try { file = saveProjectRecord(pidexRoot, record); } catch {}
    return { ok: false, reason: error.message || String(error), record, file, created };
  }
}

export function openProjectSandbox(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  try {
    runDocker(containerStartArgs(record), options.runner);
    record.status = 'ready';
    const file = saveProjectRecord(pidexRoot, record);
    return { ok: true, record, file };
  } catch (error) {
    record.status = 'container-missing';
    record.repair = { reason: error.message || String(error) };
    const file = saveProjectRecord(pidexRoot, record);
    return { ok: false, reason: error.message || String(error), record, file };
  }
}

export function repairProjectSandbox(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = safeProjectId(options.projectId);
  if (options.confirm !== projectId) throw new Error(`refusing to repair project sandbox without --confirm ${projectId}`);
  const record = loadProjectRecord(pidexRoot, projectId);
  const volumeChecks = {
    workspace: record.docker.workspace_volume,
    secrets: record.docker.secrets_volume,
    cache: record.docker.cache_volume,
  };
  const missingVolumes = [];
  for (const [kind, name] of Object.entries(volumeChecks)) {
    try { runDocker(['volume', 'inspect', name], options.runner); } catch { missingVolumes.push(kind); }
  }
  if (missingVolumes.length) {
    record.status = 'repair-blocked';
    record.repair = { reason: 'missing-volumes', missing_volumes: missingVolumes };
    const file = saveProjectRecord(pidexRoot, record);
    return { ok: false, reason: 'missing-volumes', missing_volumes: missingVolumes, record, file };
  }
  let containerExists = true;
  try { runDocker(['inspect', record.docker.container_name], options.runner); } catch { containerExists = false; }
  try {
    if (!containerExists) runDocker(containerCreateArgs(record), options.runner);
    runDocker(containerStartArgs(record), options.runner);
    record.status = 'ready';
    record.repair = { last_action: containerExists ? 'started-container' : 'recreated-container', repaired_at: new Date().toISOString() };
    const file = saveProjectRecord(pidexRoot, record);
    return { ok: true, action: record.repair.last_action, record, file };
  } catch (error) {
    record.status = 'needs-repair';
    record.repair = { reason: error.message || String(error), last_action: containerExists ? 'start-failed' : 'recreate-failed' };
    const file = saveProjectRecord(pidexRoot, record);
    return { ok: false, reason: 'repair-failed', action: record.repair.last_action, record, file };
  }
}

export function removeProjectSandbox(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectId = safeProjectId(options.projectId);
  if (options.confirm !== projectId) throw new Error(`refusing to remove project sandbox without --confirm ${projectId}`);
  const record = loadProjectRecord(pidexRoot, projectId);
  const args = removeArgs(record);
  const errors = [];
  try { runDocker(args.container, options.runner); } catch (error) { errors.push(error.message || String(error)); }
  for (const volumeArgs of args.volumes) {
    try { runDocker(volumeArgs, options.runner); } catch (error) { errors.push(error.message || String(error)); }
  }
  removeProjectRecord(pidexRoot, projectId);
  return { ok: errors.length === 0, project_id: projectId, errors };
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'create' || arg === 'open' || arg === 'repair' || arg === 'remove') out.command = arg;
    else if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--name') out.name = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--image') out.image = argv[++i];
    else if (arg === '--confirm') out.confirm = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: lifecycle.mjs <create|open|repair|remove> --pidex-root PATH [--name NAME|--project-id ID] [--confirm ID] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.command) throw new Error('command is required');
    let result;
    if (args.command === 'create') result = createProjectSandbox(args);
    else if (args.command === 'open') result = openProjectSandbox(args);
    else if (args.command === 'repair') result = repairProjectSandbox(args);
    else if (args.command === 'remove') result = removeProjectSandbox(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : (result.ok ? 'ok' : result.reason));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
