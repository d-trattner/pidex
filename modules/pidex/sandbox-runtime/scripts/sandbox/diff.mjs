#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isForbiddenPatchPath } from './policy.mjs';

function git(args, cwd, opts = {}) {
  const proc = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, ...opts });
  if (proc.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  return proc.stdout;
}

export function parseDiffArgs(argv) {
  const out = { workspace: '', patches: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') out.workspace = argv[++i] || '';
    else if (arg === '--patches') out.patches = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

export function parseNameStatus(text) {
  return String(text || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    return { status: parts[0], paths: parts.slice(1) };
  });
}

export function validateChangedFiles(entries) {
  const findings = [];
  for (const entry of entries) {
    for (const p of entry.paths) {
      if (isForbiddenPatchPath(p)) findings.push({ path: p, reason: 'forbidden-secret-runtime-or-artifact-path' });
    }
    if (/^T|^A|^M/.test(entry.status) && entry.status.includes('120000')) findings.push({ path: entry.paths[0], reason: 'symlink-change-blocked' });
  }
  return findings;
}

export function generateSandboxDiff(options = {}) {
  const workspace = path.resolve(options.workspace || '.');
  const patches = path.resolve(options.patches || path.join(workspace, '..', 'patches'));
  mkdirSync(patches, { recursive: true });
  git(['add', '-A', '--', '.', ':(exclude)agents.output/**', ':(exclude)state/**', ':(exclude)logs/**'], workspace);
  const nameStatus = git(['diff', '--cached', '--name-status', 'HEAD'], workspace);
  const entries = parseNameStatus(nameStatus);
  const findings = validateChangedFiles(entries);
  if (findings.length) {
    const statusPath = path.join(patches, 'status.txt');
    writeFileSync(statusPath, git(['status', '--porcelain=v1'], workspace));
    return { ok: false, reason: 'forbidden-patch-paths', findings, changed_files: entries, status_path: statusPath };
  }
  const patchPath = path.join(patches, 'sandbox.patch');
  const statusPath = path.join(patches, 'status.txt');
  const changedPath = path.join(patches, 'changed-files.txt');
  const patch = git(['diff', '--cached', '--binary', 'HEAD'], workspace);
  writeFileSync(patchPath, patch);
  writeFileSync(statusPath, git(['status', '--porcelain=v1'], workspace));
  writeFileSync(changedPath, nameStatus);
  return { ok: true, patch_path: patchPath, status_path: statusPath, changed_files_path: changedPath, changed_files: entries, empty: patch.length === 0 };
}

function usage() { return 'Usage: diff.mjs --workspace PATH [--patches PATH] --json'; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseDiffArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = generateSandboxDiff(args);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
