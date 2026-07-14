#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { dockerSpawnSync } from './docker-spawn.mjs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadProjectRecord, saveProjectRecord } from './registry.mjs';
import { seedProjectMirrorImportBaseline } from './project-mirror.mjs';

const BLOCKED_NAMES = new Set(['.git', 'node_modules', 'agents.output', '.fallow', '.ssh', '.aws', '.config', 'secrets', 'credentials']);
const BLOCKED_EXT = new Set(['.env', '.pem', '.key', '.p12', '.pfx']);

function run(bin, args, opts = {}) {
  const proc = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
  if (proc.status !== 0) throw new Error(`${bin} ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  return proc.stdout;
}

export function pathWithin(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function classifyImportPath(rel) {
  const normalized = String(rel || '').replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.includes('..') || normalized.startsWith('/')) return { ok: false, reason: 'path-traversal' };
  for (const part of normalized.split('/')) {
    const lower = part.toLowerCase();
    if (BLOCKED_NAMES.has(lower)) return { ok: false, reason: `blocked-name:${part}` };
  }
  const base = path.basename(normalized).toLowerCase();
  if (base === '.env' || base.startsWith('.env.')) return { ok: false, reason: 'blocked-env-file' };
  const ext = path.extname(base);
  if (BLOCKED_EXT.has(ext)) return { ok: false, reason: `blocked-extension:${ext}` };
  return { ok: true };
}

function gitFiles(project) {
  try {
    run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: project });
    return run('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: project }).split('\0').filter(Boolean);
  } catch {
    return undefined;
  }
}

function walkFilesEsm(root, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\', '/');
    const classification = classifyImportPath(rel);
    if (!classification.ok) continue;
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walkFilesEsm(root, full, out);
    else if (st.isFile()) out.push(rel);
  }
  return out;
}

export function collectImportFiles(projectRoot) {
  const project = path.resolve(projectRoot);
  if (!existsSync(project)) throw new Error(`project path does not exist: ${project}`);
  const files = gitFiles(project) || walkFilesEsm(project);
  const accepted = [];
  const skipped = [];
  for (const rel of files) {
    const full = path.join(project, rel);
    if (!pathWithin(project, full)) { skipped.push({ path: rel, reason: 'path-escape' }); continue; }
    const classification = classifyImportPath(rel);
    if (!classification.ok) { skipped.push({ path: rel, reason: classification.reason }); continue; }
    const st = lstatSync(full);
    if (st.isSymbolicLink()) { skipped.push({ path: rel, reason: 'symlink-blocked' }); continue; }
    if (!st.isFile()) continue;
    accepted.push({ path: rel.replaceAll('\\', '/'), size: st.size });
  }
  return { project, files: accepted.sort((a, b) => a.path.localeCompare(b.path)), skipped };
}

export function importLocalProject(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  const collected = collectImportFiles(options.source);
  const runner = options.runner || ((args) => {
    const proc = dockerSpawnSync(args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (proc.status !== 0) throw new Error(`docker ${args.join(' ')} failed: ${((proc.stderr || proc.stdout || '')).trim()}`);
    return proc.stdout;
  });
  const copied = [];
  for (const file of collected.files) {
    const source = path.join(collected.project, file.path);
    const targetDir = path.posix.dirname(`/workspace/${file.path}`);
    runner(['exec', '--user', 'node', record.docker.container_name, 'mkdir', '-p', targetDir]);
    runner(['cp', source, `${record.docker.container_name}:/workspace/${file.path}`]);
    copied.push(file);
  }
  record.control_project_path ||= collected.project;
  record.source = { kind: 'host-path', ref: collected.project, imported_at: new Date().toISOString(), files_copied: copied.length, files_skipped: collected.skipped.length };
  record.status = 'ready';
  const file = saveProjectRecord(pidexRoot, record);
  const mirrorBaseline = seedProjectMirrorImportBaseline({ pidexRoot, projectId: record.project_id, hostRoot: collected.project, files: copied });
  return { ok: true, record, registry_file: file, copied, skipped: collected.skipped, mirror_baseline: mirrorBaseline };
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--source') out.source = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: import-local.mjs --pidex-root PATH --project-id ID --source PATH --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.projectId) throw new Error('--project-id is required');
    if (!args.source) throw new Error('--source is required');
    const result = importLocalProject(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.copied.length} copied`);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
