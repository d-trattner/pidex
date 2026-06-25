#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 2;
export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,80}$/;

export function safeProjectId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!PROJECT_ID_PATTERN.test(id)) throw new Error(`invalid project id: ${value}`);
  if (id.includes('..') || id.includes('/') || id.includes('\\')) throw new Error(`invalid project id: ${value}`);
  return id;
}

export function slugifyProjectName(name) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'project';
}

export function newProjectId(name, suffix = undefined) {
  const tail = suffix || Math.random().toString(36).slice(2, 10);
  return safeProjectId(`pp-${slugifyProjectName(name)}-${tail}`);
}

export function registryRoot(pidexRoot) {
  return path.join(path.resolve(pidexRoot), 'state', 'sandbox-projects');
}

export function projectFile(pidexRoot, projectId) {
  return path.join(registryRoot(pidexRoot), `${safeProjectId(projectId)}.json`);
}

export function containedPath(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function atomicWriteJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}

export function dockerResourceNames(projectId) {
  const id = safeProjectId(projectId);
  return {
    container_name: `pidex-project-${id}`,
    workspace_volume: `pidex-project-${id}-workspace`,
    secrets_volume: `pidex-project-${id}-secrets`,
    cache_volume: `pidex-project-${id}-cache`,
  };
}

export function createProjectRecord(options = {}) {
  const projectId = options.project_id ? safeProjectId(options.project_id) : newProjectId(options.name || 'project', options.suffix);
  const now = options.now || new Date().toISOString();
  const docker = dockerResourceNames(projectId);
  return {
    schema_version: SCHEMA_VERSION,
    project_id: projectId,
    name: String(options.name || projectId),
    mode: 'project-pipeline',
    target: { kind: 'local' },
    source: { kind: options.source_kind || 'empty', ref: options.source_ref || '', imported_at: options.source_kind ? now : '' },
    docker: { image: options.image || 'pidex/project-node22:local', ...docker },
    credentials: { git: 'missing', pi: 'missing', providers: [], inventory: [] },
    archive: { path: options.archive_path || '', last_sync_at: '' },
    features: { preview_ports: false },
    status: 'creating',
    runs: [],
    lock: undefined,
    created_at: now,
    updated_at: now,
  };
}

export function validateProjectRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object') return ['record must be object'];
  if (record.schema_version !== 1 && record.schema_version !== SCHEMA_VERSION) errors.push(`unsupported schema_version: ${record.schema_version}`);
  try { safeProjectId(record.project_id); } catch (error) { errors.push(error.message); }
  if (record.mode !== 'project-pipeline') errors.push(`invalid mode: ${record.mode}`);
  if (!record.target || record.target.kind !== 'local') errors.push('local MVP requires target.kind=local');
  if (!record.docker || typeof record.docker !== 'object') errors.push('docker metadata required');
  for (const key of ['container_name', 'workspace_volume', 'secrets_volume', 'cache_volume']) {
    if (!record.docker?.[key] || !String(record.docker[key]).startsWith(`pidex-project-${record.project_id}`)) errors.push(`invalid docker.${key}`);
  }
  if (!Array.isArray(record.runs)) errors.push('runs must be array');
  const previewPorts = record.preview?.ports;
  if (previewPorts) {
    const validBind = previewPorts.host_bind === '127.0.0.1' || previewPorts.host_bind === '0.0.0.0';
    if (!Number.isInteger(previewPorts.base) || !Number.isInteger(previewPorts.size) || previewPorts.base < 1 || previewPorts.size < 1 || previewPorts.base + previewPorts.size - 1 > 65535) errors.push('invalid preview.ports range');
    if (previewPorts.container_base !== previewPorts.base) errors.push('invalid preview.ports container_base');
    if (!validBind) errors.push('invalid preview.ports host_bind');
  }
  return errors;
}

export function normalizeProjectRecord(record) {
  if (!record || typeof record !== 'object') return record;
  if (record.schema_version === undefined) record.schema_version = 1;
  return record;
}

export function saveProjectRecord(pidexRoot, record) {
  const toSave = { ...record, schema_version: SCHEMA_VERSION };
  const errors = validateProjectRecord(toSave);
  if (errors.length) throw new Error(`invalid project record: ${errors.join('; ')}`);
  const file = projectFile(pidexRoot, toSave.project_id);
  if (!containedPath(registryRoot(pidexRoot), file)) throw new Error('project record path escapes registry root');
  atomicWriteJson(file, { ...toSave, updated_at: new Date().toISOString() });
  return file;
}

export function loadProjectRecord(pidexRoot, projectId) {
  const file = projectFile(pidexRoot, projectId);
  if (!existsSync(file)) throw new Error(`project record not found: ${safeProjectId(projectId)}`);
  const record = normalizeProjectRecord(JSON.parse(readFileSync(file, 'utf8')));
  const errors = validateProjectRecord(record);
  if (errors.length) throw new Error(`invalid project record ${file}: ${errors.join('; ')}`);
  return record;
}

export function listProjectRecords(pidexRoot) {
  const root = registryRoot(pidexRoot);
  if (!existsSync(root)) return [];
  const records = [];
  for (const entry of readdirSync(root).filter((name) => name.endsWith('.json')).sort()) {
    records.push(loadProjectRecord(pidexRoot, entry.slice(0, -5)));
  }
  return records;
}

function lockRoot(pidexRoot) {
  return path.join(registryRoot(pidexRoot), '.registry.lock');
}

export async function withRegistryLock(pidexRoot, _reason, fn) {
  const lock = lockRoot(pidexRoot);
  mkdirSync(path.dirname(lock), { recursive: true });
  const started = Date.now();
  while (true) {
    try {
      mkdirSync(lock);
      writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
      break;
    } catch (error) {
      if (Date.now() - started > 5000) throw new Error('registry lock timeout');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export function removeProjectRecord(pidexRoot, projectId) {
  const file = projectFile(pidexRoot, projectId);
  if (existsSync(file)) rmSync(file);
  return file;
}

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--name') out.name = argv[++i];
    else if (arg === '--project-id') out.project_id = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: registry.mjs --pidex-root PATH --name NAME [--project-id ID] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.pidexRoot) throw new Error('--pidex-root is required');
    const record = createProjectRecord({ name: args.name, project_id: args.project_id });
    const file = saveProjectRecord(args.pidexRoot, record);
    const output = { ok: true, file, record };
    console.log(args.json ? JSON.stringify(output, null, 2) : file);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
