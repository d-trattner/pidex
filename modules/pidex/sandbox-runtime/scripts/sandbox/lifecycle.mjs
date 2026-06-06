#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readlinkSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DEFAULT_IMAGE, isCopyExcluded, listFilesRecursive } from './policy.mjs';

export function parseLifecycleArgs(argv) {
  const out = { project: process.cwd(), pidexRoot: process.cwd(), mode: 'hardened-pipeline', image: DEFAULT_IMAGE, json: false, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--pidex-root') out.pidexRoot = argv[++i] || '';
    else if (arg === '--mode') out.mode = argv[++i] || '';
    else if (arg === '--image') out.image = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '--keep') out.keep = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

export function makeRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 10);
  return `sandbox-${stamp}-${rand}`;
}

export function runStatePaths(pidexRoot, runId) {
  const runRoot = path.resolve(pidexRoot, 'state', 'sandbox', 'runs', runId);
  return {
    run_id: runId,
    run_root: runRoot,
    workspace: path.join(runRoot, 'workspace'),
    logs: path.join(runRoot, 'logs'),
    patches: path.join(runRoot, 'patches'),
    artifacts: path.join(runRoot, 'artifacts'),
    metadata: path.join(runRoot, 'metadata.json'),
  };
}

function git(args, cwd) {
  const proc = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (proc.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  return proc.stdout.trim();
}

function gitCopyItems(projectRoot) {
  const proc = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: projectRoot, encoding: 'utf8' });
  if (proc.status !== 0) return null;
  const rels = proc.stdout.split('\0').filter(Boolean);
  if (!rels.length) return [];
  return rels.map((rel) => {
    const abs = path.join(projectRoot, rel);
    if (!existsSync(abs)) return null;
    const entry = lstatSync(abs);
    return { rel: rel.replaceAll('\\', '/'), abs, entry };
  }).filter(Boolean);
}

export function copyProjectToWorkspace(projectRoot, workspace, limits = {}) {
  const gitItems = gitCopyItems(projectRoot);
  const usedGitFileList = gitItems !== null;
  const items = gitItems ?? listFilesRecursive(projectRoot);
  const maxFileBytes = Number.isFinite(Number(limits.max_file_size_mb)) && Number(limits.max_file_size_mb) > 0
    ? Number(limits.max_file_size_mb) * 1024 * 1024
    : Infinity;
  const maxTotalBytes = Number.isFinite(Number(limits.max_total_copy_mb)) && Number(limits.max_total_copy_mb) > 0
    ? Number(limits.max_total_copy_mb) * 1024 * 1024
    : Infinity;
  mkdirSync(workspace, { recursive: true });
  const copied = [];
  const skipped = [];
  const violations = [];
  let total = 0;
  for (const item of items) {
    if (isCopyExcluded(item.rel)) { skipped.push({ path: item.rel, reason: 'excluded' }); continue; }
    const dest = path.join(workspace, item.rel);
    if (item.entry.isDirectory()) { mkdirSync(dest, { recursive: true }); continue; }
    if (item.entry.isSymbolicLink()) {
      const target = readlinkSync(item.abs);
      mkdirSync(path.dirname(dest), { recursive: true });
      try { symlinkSync(target, dest); } catch { skipped.push({ path: item.rel, reason: 'symlink-preserve-failed' }); }
      continue;
    }
    if (!item.entry.isFile()) { skipped.push({ path: item.rel, reason: 'non-regular' }); continue; }
    const size = item.entry.isFile() ? statSync(item.abs).size : 0;
    if (size > maxFileBytes) { violations.push({ path: item.rel, reason: 'max-file-size', bytes: size, max_bytes: maxFileBytes }); continue; }
    if (total + size > maxTotalBytes) { violations.push({ path: item.rel, reason: 'max-total-size', bytes: total + size, max_bytes: maxTotalBytes }); continue; }
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(item.abs, dest);
    total += size;
    copied.push(item.rel);
  }
  if (violations.length) throw new Error(`copy policy limit exceeded: ${JSON.stringify(violations)}`);
  return { copied_count: copied.length, skipped, total_bytes: total, source: usedGitFileList ? 'git-ls-files' : 'recursive-scan', limits: { max_file_size_mb: Number.isFinite(maxFileBytes) ? maxFileBytes / 1024 / 1024 : null, max_total_copy_mb: Number.isFinite(maxTotalBytes) ? maxTotalBytes / 1024 / 1024 : null } };
}

export function initWorkspaceGit(workspace) {
  git(['init'], workspace);
  git(['config', 'user.name', 'PIDEX Sandbox'], workspace);
  git(['config', 'user.email', 'pidex-sandbox@example.invalid'], workspace);
  git(['add', '-A'], workspace);
  git(['commit', '-m', 'pidex sandbox baseline'], workspace);
  return git(['rev-parse', 'HEAD'], workspace);
}

export function createSandboxRun(options = {}) {
  const projectRoot = path.resolve(options.project || process.cwd());
  const pidexRoot = path.resolve(options.pidexRoot || projectRoot);
  const runId = options.runId || makeRunId();
  const paths = runStatePaths(pidexRoot, runId);
  for (const dir of [paths.run_root, paths.workspace, paths.logs, paths.patches, paths.artifacts]) mkdirSync(dir, { recursive: true });
  const baselineHead = existsSync(path.join(projectRoot, '.git')) ? git(['rev-parse', 'HEAD'], projectRoot) : null;
  const copy = copyProjectToWorkspace(projectRoot, paths.workspace, options.limits || {});
  const workspaceBaseline = initWorkspaceGit(paths.workspace);
  const metadata = {
    run_id: runId,
    mode: options.mode || 'hardened-pipeline',
    project_root: projectRoot,
    workspace: paths.workspace,
    baseline_head: baselineHead,
    workspace_baseline_head: workspaceBaseline,
    container_user_mode: 'image-default',
    container_user_enforced: false,
    image: options.image || DEFAULT_IMAGE,
    network: 'none',
    network_reason: 'static-command',
    env_files_used: [],
    env_keys: [],
    api_hosts_detected: [],
    env_values_recorded: false,
    install_scripts: 'disabled',
    command_phase: null,
    package_scripts_executed: [],
    artifact_paths_extracted: [],
    stdout_log: path.join(paths.logs, 'stdout.log'),
    stderr_log: path.join(paths.logs, 'stderr.log'),
    cleanup: 'pending',
    copy,
    created_at: new Date().toISOString(),
  };
  writeFileSync(paths.metadata, JSON.stringify(metadata, null, 2));
  return { ok: true, ...paths, metadata_path: paths.metadata, metadata };
}

function usage() { return 'Usage: lifecycle.mjs --project PATH [--pidex-root PATH] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseLifecycleArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = createSandboxRun(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
