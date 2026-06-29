#!/usr/bin/env node
import { dockerSpawnSync } from './docker-spawn.mjs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TAG = 'pidex/project-node22:local';

function moduleRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function docker(args, opts = {}) {
  const proc = dockerSpawnSync(args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
  return { status: proc.status ?? 1, stdout: proc.stdout || '', stderr: proc.stderr || '' };
}

export function buildImageArgs(options = {}) {
  const root = path.resolve(options.moduleRoot || moduleRoot());
  return ['build', '-t', options.tag || DEFAULT_TAG, '-f', path.join(root, 'Dockerfile'), root];
}

export function inspectImageArgs(tag = DEFAULT_TAG) {
  return ['image', 'inspect', tag, '--format', '{{json .Id}}'];
}

export function imageStatus(options = {}) {
  const runner = options.runner || ((args) => docker(args));
  const tag = options.tag || DEFAULT_TAG;
  const proc = runner(inspectImageArgs(tag));
  if (proc.status !== 0) return { ok: false, tag, status: 'missing', reason: (proc.stderr || proc.stdout || '').trim() };
  return { ok: true, tag, status: 'present', image_id: String(proc.stdout || '').trim().replace(/^"|"$/g, '') };
}

export function buildImage(options = {}) {
  const runner = options.runner || ((args) => docker(args));
  const tag = options.tag || DEFAULT_TAG;
  const proc = runner(buildImageArgs({ ...options, tag }));
  if (proc.status !== 0) return { ok: false, tag, reason: (proc.stderr || proc.stdout || '').trim() };
  const status = imageStatus({ tag, runner });
  return { ok: true, tag, image_id: status.image_id || '', output: proc.stdout };
}

export function parseArgs(argv) {
  const out = { command: 'status', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'build' || arg === 'status') out.command = arg;
    else if (arg === '--tag') out.tag = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: image.mjs [status|build] [--tag TAG] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = args.command === 'build' ? buildImage(args) : imageStatus(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.tag}: ${result.status || (result.ok ? 'built' : 'failed')}`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
