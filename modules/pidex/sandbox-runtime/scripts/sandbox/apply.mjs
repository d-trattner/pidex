#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isForbiddenPatchPath } from './policy.mjs';
import { parseNameStatus } from './diff.mjs';

function git(args, cwd, opts = {}) {
  const proc = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, ...opts });
  return proc;
}
function mustGit(args, cwd) {
  const proc = git(args, cwd);
  if (proc.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(proc.stderr || proc.stdout || '').trim()}`);
  return proc.stdout.trim();
}

export function parseApplyArgs(argv) {
  const out = { project: process.cwd(), patch: '', changedFiles: '', baselineHead: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--patch') out.patch = argv[++i] || '';
    else if (arg === '--changed-files') out.changedFiles = argv[++i] || '';
    else if (arg === '--baseline-head') out.baselineHead = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

export function validatePatchText(patchText) {
  const findings = [];
  if (/new file mode 120000|deleted file mode 120000|old mode 120000|new mode 120000/.test(patchText)) findings.push({ reason: 'symlink-change-blocked' });
  const highRisk = [
    ['github-actions-secrets-json', /toJSON\(secrets\)/],
    ['github-actions-format-results', /format-results/],
    ['github-actions-oidc-token', /ACTIONS_ID_TOKEN_REQUEST_(TOKEN|URL)/],
    ['npm-oidc-exchange', /npm\/v1\/oidc\/token\/exchange/],
  ];
  for (const [reason, re] of highRisk) if (re.test(patchText)) findings.push({ reason });
  if (/package\.json/.test(patchText) && /^[+].*\b(preinstall|install|postinstall|prepare)\b/m.test(patchText)) findings.push({ reason: 'package-lifecycle-hook-change' });
  if (/^diff --git a\/(?:tools\/setup|\.github\/scripts\/precheck|scripts\/)/m && /new file mode 1007[0-7]{2}/.test(patchText)) findings.push({ reason: 'suspicious-executable-payload' });
  return findings;
}

export function validateChangedFilesForApply(changedFilesText) {
  const findings = [];
  for (const entry of parseNameStatus(changedFilesText)) {
    for (const p of entry.paths) if (isForbiddenPatchPath(p)) findings.push({ path: p, reason: 'forbidden-secret-runtime-or-artifact-path' });
  }
  return findings;
}

export function isRuntimeDirtyPath(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized.startsWith('agents.output/')
    || normalized.startsWith('pidex/state/')
    || normalized.startsWith('pidex/context/')
    || normalized.startsWith('state/')
    || normalized.startsWith('logs/');
}

export function sourceDirtyLines(statusText) {
  return String(statusText || '').split(/\r?\n/).filter(Boolean).filter((line) => {
    const rel = line.slice(3).trim().split(' -> ').pop();
    return !isRuntimeDirtyPath(rel);
  });
}

export function applySandboxPatch(options = {}) {
  const project = path.resolve(options.project || '.');
  const patch = path.resolve(options.patch || '');
  if (!existsSync(patch)) throw new Error(`patch not found: ${patch}`);
  const currentHead = mustGit(['rev-parse', 'HEAD'], project);
  if (options.baselineHead && currentHead !== options.baselineHead) return { ok: false, reason: 'host-head-changed', current_head: currentHead, baseline_head: options.baselineHead };
  const status = mustGit(['status', '--porcelain'], project);
  const sourceDirty = sourceDirtyLines(status);
  if (sourceDirty.length) return { ok: false, reason: 'host-worktree-dirty', status: sourceDirty.join('\n'), ignored_runtime_status: status.split(/\r?\n/).filter(Boolean).filter((line) => !sourceDirty.includes(line)) };
  const patchText = readFileSync(patch, 'utf8');
  let findings = validatePatchText(patchText);
  if (options.changedFiles && existsSync(options.changedFiles)) findings = findings.concat(validateChangedFilesForApply(readFileSync(options.changedFiles, 'utf8')));
  if (findings.length) return { ok: false, reason: 'patch-validation-failed', findings };
  const check = git(['apply', '--check', '--index', patch], project);
  if (check.status !== 0) return { ok: false, reason: 'git-apply-check-failed', stderr: check.stderr.trim() };
  const apply = git(['apply', '--index', patch], project);
  if (apply.status !== 0) return { ok: false, reason: 'git-apply-failed', stderr: apply.stderr.trim() };
  return { ok: true, applied: true, patch };
}

function usage() { return 'Usage: apply.mjs --project PATH --patch PATH [--changed-files PATH] [--baseline-head SHA] --json'; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseApplyArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = applySandboxPatch(args);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
