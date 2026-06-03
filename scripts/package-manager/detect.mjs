#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm', 'supported'],
  ['package-lock.json', 'npm', 'compatibility'],
  ['yarn.lock', 'yarn', 'unsupported'],
  ['bun.lock', 'bun', 'unsupported'],
  ['bun.lockb', 'bun', 'unsupported'],
];
const SUPPORTED_FIELDS = new Set(['pnpm', 'npm', 'yarn', 'bun']);

function parseArgs(argv) {
  const out = { project: process.cwd(), mode: 'existing', json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--mode') out.mode = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '-h' || arg === '--help') out.help = true;
    else throw new Error(`Unknown arg: ${arg}`);
  }
  if (!['existing', 'greenfield'].includes(out.mode)) throw new Error(`Invalid --mode: ${out.mode || '(empty)'}`);
  if (!out.project) throw new Error('--project must not be empty');
  return out;
}

function usage() {
  return `Usage: detect.mjs [--project PATH] [--mode existing|greenfield] [--json]\n\nDetect package-manager evidence without running package managers or changing files.`;
}

function safeStat(value) {
  try { return lstatSync(value); } catch { return null; }
}

function resolveProject(input) {
  const abs = path.resolve(input || '.');
  const stat = safeStat(abs);
  if (stat?.isFile()) return path.dirname(abs);
  return abs;
}

function parentOf(dir) {
  const parent = path.dirname(dir);
  return parent === dir ? null : parent;
}

function findGitRoot(start) {
  let current = start;
  while (current) {
    if (existsSync(path.join(current, '.git'))) return current;
    current = parentOf(current);
  }
  return null;
}

function ancestorsFromProject(start) {
  const gitRoot = findGitRoot(start);
  const out = [];
  let current = start;
  while (current) {
    out.push(current);
    if (gitRoot && current === gitRoot) break;
    const parent = parentOf(current);
    if (!parent) break;
    current = parent;
  }
  return out;
}

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

function packageManagerName(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const scoped = raw.startsWith('@') ? raw.slice(1) : raw;
  const slash = scoped.indexOf('/');
  const at = scoped.indexOf('@');
  let name = scoped;
  if (slash >= 0) name = scoped.slice(0, slash + 1) + scoped.slice(slash + 1).split('@')[0];
  else if (at >= 0) name = scoped.slice(0, at);
  return name || null;
}

function lockEvidenceAt(dir) {
  const found = [];
  for (const [file, manager, support] of LOCKFILES) {
    if (existsSync(path.join(dir, file))) found.push({ file, manager, support, dir });
  }
  return found;
}

function uniqueManagers(evidence) {
  return [...new Set(evidence.map((item) => item.manager))];
}

function supportFor(manager) {
  if (manager === 'pnpm') return 'supported';
  if (manager === 'npm') return 'compatibility';
  if (manager === 'yarn' || manager === 'bun') return 'unsupported';
  return 'unknown';
}

function nearestPackageDir(ancestors) {
  return ancestors.find((dir) => existsSync(path.join(dir, 'package.json'))) || null;
}

function nearestWorkspaceDir(ancestors) {
  return ancestors.find((dir) => existsSync(path.join(dir, 'pnpm-workspace.yaml'))) || null;
}

function nearestAncestorLocks(ancestors, packageRoot) {
  const start = ancestors.indexOf(packageRoot);
  const search = start >= 0 ? ancestors.slice(start + 1) : ancestors.slice(1);
  for (const dir of search) {
    const evidence = lockEvidenceAt(dir);
    if (evidence.length) return evidence;
  }
  return [];
}

function lockfileLabel(evidence) {
  if (!evidence.length) return 'none';
  const files = [...new Set(evidence.map((item) => item.file))];
  if (files.length > 1) return 'multiple';
  return files[0];
}

export function detectPackageManager(options = {}) {
  const projectRoot = resolveProject(options.project || process.cwd());
  const mode = options.mode || 'existing';
  if (!['existing', 'greenfield'].includes(mode)) throw new Error(`Invalid mode: ${mode}`);

  const warnings = [];
  const ancestors = ancestorsFromProject(projectRoot);
  const packageRoot = nearestPackageDir(ancestors) || projectRoot;
  const packageJsonPath = path.join(packageRoot, 'package.json');
  const pkg = existsSync(packageJsonPath) ? readJson(packageJsonPath) : null;
  const packageManagerField = typeof pkg?.packageManager === 'string' ? pkg.packageManager : null;
  const fieldManager = packageManagerName(packageManagerField);
  const fieldKnown = fieldManager && SUPPORTED_FIELDS.has(fieldManager);
  const hasUnsupportedPackageManagerField = Boolean(packageManagerField && !fieldKnown);
  if (hasUnsupportedPackageManagerField) warnings.push(`unsupported_packageManager_field:${packageManagerField}`);
  if (pkg && !packageManagerField && pkg.scripts && Object.keys(pkg.scripts).some((name) => String(pkg.scripts[name]).includes('npm '))) warnings.push('npm_script_convention_detected');

  const sameRootLocks = lockEvidenceAt(packageRoot);
  const sameRootManagers = uniqueManagers(sameRootLocks);
  const workspaceRoot = nearestWorkspaceDir(ancestors);
  const workspaceLocks = workspaceRoot && workspaceRoot !== packageRoot ? lockEvidenceAt(workspaceRoot).filter((item) => item.manager === 'pnpm') : [];
  const ancestorLocks = nearestAncestorLocks(ancestors, packageRoot);

  let selectedLocks = sameRootLocks;
  let lockfileRoot = sameRootLocks.length ? packageRoot : null;
  let workspaceMembership = false;
  if (!selectedLocks.length && workspaceLocks.length) {
    selectedLocks = workspaceLocks;
    lockfileRoot = workspaceRoot;
    workspaceMembership = true;
  } else if (!selectedLocks.length && ancestorLocks.length) {
    selectedLocks = ancestorLocks;
    lockfileRoot = ancestorLocks[0].dir;
  }

  let packageManager = 'unknown';
  let support = 'unknown';
  let confidence = 'fallback';

  const sameRootConflict = sameRootManagers.length > 1;
  if (sameRootConflict) {
    packageManager = 'unknown';
    support = 'conflict';
    confidence = 'conflict';
    warnings.push(`multiple_lockfiles_same_root:${sameRootLocks.map((item) => item.file).join(',')}`);
  } else if (hasUnsupportedPackageManagerField && selectedLocks.length) {
    packageManager = 'unknown';
    support = 'conflict';
    confidence = 'conflict';
    warnings.push(`packageManager_lockfile_conflict:${fieldManager || 'unsupported'}:${selectedLocks[0].manager}`);
  } else if (hasUnsupportedPackageManagerField) {
    packageManager = 'unknown';
    support = 'unsupported';
    confidence = 'packageManager';
  } else if (fieldKnown && selectedLocks.length && fieldManager !== selectedLocks[0].manager) {
    packageManager = 'unknown';
    support = 'conflict';
    confidence = 'conflict';
    warnings.push(`packageManager_lockfile_conflict:${fieldManager}:${selectedLocks[0].manager}`);
  } else if (fieldKnown) {
    packageManager = fieldManager;
    support = supportFor(fieldManager);
    confidence = 'packageManager';
  } else if (selectedLocks.length) {
    packageManager = selectedLocks[0].manager;
    support = selectedLocks[0].support;
    confidence = 'lockfile';
  } else if (mode === 'greenfield') {
    packageManager = 'pnpm';
    support = 'supported';
    confidence = 'greenfield-default';
  } else {
    packageManager = 'unknown';
    support = 'unknown';
    confidence = 'fallback';
  }

  return {
    package_manager: packageManager,
    support,
    confidence,
    project_root: projectRoot,
    package_root: packageRoot,
    workspace_root: workspaceRoot || null,
    lockfile_root: lockfileRoot,
    lockfile: support === 'conflict' && sameRootConflict ? 'multiple' : lockfileLabel(selectedLocks),
    package_manager_field: packageManagerField,
    mode,
    warnings,
  };
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); return; }
    const result = detectPackageManager(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.package_manager}\t${result.support}\t${result.confidence}`);
      if (result.warnings.length) console.log(`warnings\t${result.warnings.join(',')}`);
    }
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) main();
