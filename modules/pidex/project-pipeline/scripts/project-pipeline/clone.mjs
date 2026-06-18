#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadProjectRecord, saveProjectRecord } from './registry.mjs';

function docker(args, opts = {}) {
  const proc = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, ...opts });
  if (proc.status !== 0) throw new Error(`docker ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  return proc.stdout;
}

export function validateGitUrl(url) {
  const value = String(url || '').trim();
  if (/^https:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+\.git$/.test(value)) return { ok: true, url: value };
  if (/^git@[A-Za-z0-9_.-]+:[A-Za-z0-9_.\/-]+\.git$/.test(value)) return { ok: true, url: value };
  return { ok: false, reason: 'unsupported-git-url' };
}

export function cloneArgs(record, url, branch = '') {
  const args = ['exec', '--workdir', '/', record.docker.container_name, 'bash', '-lc'];
  const branchPart = branch ? ` --branch ${shellQuote(branch)}` : '';
  args.push(`rm -rf /workspace/* /workspace/.[!.]* /workspace/..?* 2>/dev/null || true; git clone${branchPart} ${shellQuote(url)} /workspace`);
  return args;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

export function cloneProject(options = {}) {
  const pidexRoot = path.resolve(options.pidexRoot || process.cwd());
  const record = loadProjectRecord(pidexRoot, options.projectId);
  const valid = validateGitUrl(options.url);
  if (!valid.ok) throw new Error(`unsupported git url: ${options.url}`);
  const runner = options.runner || ((args) => docker(args));
  runner(cloneArgs(record, valid.url, options.branch || ''));
  record.source = { kind: 'git-url', ref: valid.url, branch: options.branch || '', imported_at: new Date().toISOString() };
  record.status = 'ready';
  const file = saveProjectRecord(pidexRoot, record);
  return { ok: true, record, registry_file: file };
}

export function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pidex-root') out.pidexRoot = argv[++i];
    else if (arg === '--project-id') out.projectId = argv[++i];
    else if (arg === '--url') out.url = argv[++i];
    else if (arg === '--branch') out.branch = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: clone.mjs --pidex-root PATH --project-id ID --url GIT_URL [--branch BRANCH] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.projectId) throw new Error('--project-id is required');
    if (!args.url) throw new Error('--url is required');
    const result = cloneProject(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : result.record.source.ref);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
