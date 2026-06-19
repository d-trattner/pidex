#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadProjectRecord, registryRoot, safeProjectId } from './registry.mjs';

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function docker(args) {
  const proc = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
  return { status: proc.status ?? 1, stdout: proc.stdout || '', stderr: proc.stderr || '' };
}

function parseInspectJson(proc) {
  if (proc.status !== 0) return undefined;
  try {
    const parsed = JSON.parse(proc.stdout || '[]');
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return undefined;
  }
}

export function inspectDockerResources(record, runner = docker) {
  const warnings = [];
  const containerProc = runner(['inspect', record.docker.container_name]);
  const container = parseInspectJson(containerProc);
  if (!container) warnings.push({ resource: 'container', name: record.docker.container_name, reason: (containerProc.stderr || containerProc.stdout || 'inspect failed').trim() });
  const volumes = {};
  for (const [kind, name] of Object.entries({ workspace: record.docker.workspace_volume, secrets: record.docker.secrets_volume, cache: record.docker.cache_volume })) {
    const proc = runner(['volume', 'inspect', name]);
    volumes[kind] = { name, exists: proc.status === 0 };
    if (proc.status !== 0) warnings.push({ resource: 'volume', kind, name, reason: (proc.stderr || proc.stdout || 'inspect failed').trim() });
  }
  const containerState = container?.State || {};
  return {
    ok: warnings.length === 0,
    container: {
      name: record.docker.container_name,
      exists: Boolean(container),
      running: containerState.Running === true,
      status: containerState.Status || (container ? 'unknown' : 'missing'),
    },
    volumes,
    warnings,
  };
}

function withDockerHealth(record, options) {
  if (options.checkDocker === false) return record;
  return { ...record, docker_health: inspectDockerResources(record, options.runner) };
}

export function projectPipelineStatus(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const root = registryRoot(pidexRoot);
  if (options.projectId) {
    try {
      const record = withDockerHealth(loadProjectRecord(pidexRoot, safeProjectId(options.projectId)), options);
      return { ok: true, pidex_root: pidexRoot, projects: [record] };
    } catch (error) {
      return { ok: false, pidex_root: pidexRoot, reason: error.message || String(error), projects: [] };
    }
  }
  if (!existsSync(root)) return { ok: true, pidex_root: pidexRoot, projects: [] };
  const projects = [];
  const errors = [];
  for (const entry of readdirSync(root).filter((name) => name.endsWith('.json')).sort()) {
    const id = entry.slice(0, -5);
    try { projects.push(withDockerHealth(loadProjectRecord(pidexRoot, id), options)); } catch (error) { errors.push({ file: entry, reason: error.message || String(error) }); }
  }
  return { ok: errors.length === 0, pidex_root: pidexRoot, projects, errors };
}

function usage() { return 'Usage: status.mjs [--pidex-root PATH] [--project-id ID] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = projectPipelineStatus(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.projects.length} project(s)`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
