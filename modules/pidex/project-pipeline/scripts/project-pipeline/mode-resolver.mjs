#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MODES = new Set(['host-direct', 'hardened-pipeline', 'project-pipeline']);

export function projectModeKey(projectRoot) {
  const resolved = path.resolve(projectRoot || process.cwd());
  return crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 24);
}

export function modeRecordPath(pidexRoot, projectRoot) {
  return path.join(path.resolve(pidexRoot || process.cwd()), 'state', 'project-pipeline-modes', `${projectModeKey(projectRoot)}.json`);
}

function atomicWriteJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}

export function saveProjectMode(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const mode = options.mode;
  if (!MODES.has(mode)) throw new Error(`unsupported project pipeline mode: ${mode}`);
  const file = modeRecordPath(pidexRoot, projectRoot);
  const record = { schema_version: 1, project_root: projectRoot, mode, decided_at: new Date().toISOString(), source: options.source || 'explicit' };
  atomicWriteJson(file, record);
  return { ok: true, file, record };
}

export function loadProjectMode(options = {}) {
  const file = modeRecordPath(options.pidexRoot || process.cwd(), options.projectRoot || process.cwd());
  if (!existsSync(file)) return undefined;
  const record = JSON.parse(readFileSync(file, 'utf8'));
  if (record?.schema_version !== 1) throw new Error('unsupported project mode schema');
  if (!MODES.has(record.mode)) throw new Error(`unsupported saved project mode: ${record.mode}`);
  return { file, record };
}

export function resolveProjectPipelineMode(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const explicitMode = options.mode || process.env.PIDEX_PIPELINE_MODE;
  if (explicitMode) {
    const saved = saveProjectMode({ pidexRoot, projectRoot, mode: explicitMode, source: options.source || 'explicit' });
    return { ok: true, mode: explicitMode, source: saved.record.source, decision_required: false, saved_file: saved.file, project_root: projectRoot, no_fallback: explicitMode === 'project-pipeline' };
  }
  const saved = loadProjectMode({ pidexRoot, projectRoot });
  if (saved) return { ok: true, mode: saved.record.mode, source: 'saved', decision_required: false, saved_file: saved.file, project_root: projectRoot, no_fallback: saved.record.mode === 'project-pipeline' };
  return { ok: false, mode: undefined, source: 'missing', decision_required: true, project_root: projectRoot, choices: [...MODES], reason: 'project has no saved pipeline mode; ask once and save explicit choice' };
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-root') out.projectRoot = argv[++i];
    else if (arg === '--mode') out.mode = argv[++i];
    else if (arg === '--source') out.source = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: mode-resolver.mjs --pidex-root PATH --project-root PATH [--mode host-direct|hardened-pipeline|project-pipeline] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = resolveProjectPipelineMode(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : (result.ok ? result.mode : result.reason));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
