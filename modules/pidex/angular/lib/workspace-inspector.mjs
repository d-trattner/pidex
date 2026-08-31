import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectPackageManager } from '../../../../scripts/package-manager/detect.mjs';
import { pathWithin, readBoundedProjectJson, resolveAngularProjectRoot } from './project-root.mjs';
import { resolveWorkspaceNxCli } from './nx-cli.mjs';

const PACKAGE_KEYS = ['@angular/core', '@angular/cli', 'typescript', 'rxjs', '@angular/material', '@angular/cdk', 'nx', '@nx/angular'];
const MAX_NX_PROJECTS = 200;
const MAX_NX_OUTPUT = 4 * 1024 * 1024;

function packageValue(pkg, name) {
  return pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name] ?? pkg?.peerDependencies?.[name] ?? null;
}

function parseVersion(value) {
  const match = String(value || '').match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)/);
  return match ? { raw: match[0].replace(/^[^0-9]+/, ''), major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

export function angular22NodeCompatibility(version = process.versions.node) {
  const parsed = parseVersion(version);
  if (!parsed) return 'unknown';
  const minimum = parsed.major === 22 ? [22, 22, 3] : parsed.major === 24 ? [24, 15, 0] : parsed.major === 26 ? [26, 0, 0] : null;
  if (!minimum) return 'unsupported';
  const actual = [parsed.major, parsed.minor, parsed.patch];
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] > minimum[i]) return 'supported';
    if (actual[i] < minimum[i]) return 'unsupported';
  }
  return 'supported';
}

function installedVersion(root, name) {
  const target = path.join(root, 'node_modules', ...name.split('/'), 'package.json');
  try {
    if (!existsSync(target)) return null;
    const physical = realpathSync(target);
    if (!pathWithin(root, physical) || !lstatSync(physical).isFile() || lstatSync(physical).size > 256 * 1024) return null;
    const pkg = JSON.parse(readFileSync(physical, 'utf8'));
    return typeof pkg?.version === 'string' ? pkg.version : null;
  } catch { return null; }
}

function normalizeAngularProjects(angularJson) {
  if (!angularJson?.projects || typeof angularJson.projects !== 'object' || Array.isArray(angularJson.projects)) return [];
  return Object.entries(angularJson.projects).slice(0, MAX_NX_PROJECTS).map(([name, project]) => ({
    name,
    root: typeof project?.root === 'string' ? project.root : null,
    source_root: typeof project?.sourceRoot === 'string' ? project.sourceRoot : null,
    project_type: typeof project?.projectType === 'string' ? project.projectType : null,
    targets: Object.keys(project?.architect || project?.targets || {}).sort(),
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function parseJsonOutput(proc, category) {
  if (proc.error || proc.signal || proc.status !== 0) return { ok: false, category, exit_code: proc.status, signal: proc.signal || null };
  try { return { ok: true, value: JSON.parse(proc.stdout) }; }
  catch { return { ok: false, category: `${category}_invalid_json`, exit_code: proc.status, signal: null }; }
}

function runNx(project, args, spawn = spawnSync) {
  let cli;
  try { cli = resolveWorkspaceNxCli(project); }
  catch { return { ok: false, category: 'nx_local_binary_missing' }; }
  const proc = spawn(cli.bin, [...cli.prefixArgs, ...args], {
    cwd: project,
    shell: false,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: MAX_NX_OUTPUT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NX_DAEMON: 'false', NX_TASKS_RUNNER_DYNAMIC_OUTPUT: 'false', CI: 'true' },
  });
  return parseJsonOutput(proc, 'nx_command_failed');
}

function validNxProjectNames(value) {
  return Array.isArray(value) && value.length <= MAX_NX_PROJECTS && value.every((name) => typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(name));
}

function safeNxRelative(value) {
  return typeof value === 'string' && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..') ? value : null;
}

function normalizeNxProject(name, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = safeNxRelative(value.root); const sourceRoot = safeNxRelative(value.sourceRoot);
  if ((value.root !== undefined && !root) || (value.sourceRoot !== undefined && !sourceRoot)) return null;
  const tags = Array.isArray(value.tags) ? value.tags.filter((item) => typeof item === 'string' && item.length <= 100).slice(0, 200).sort() : [];
  const targets = Object.keys(value.targets || {}).filter((item) => /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(item)).sort();
  return { name, root, source_root: sourceRoot, project_type: typeof value.projectType === 'string' && value.projectType.length <= 40 ? value.projectType : null, tags, targets };
}

export function resolveNxWorkspace(project, options = {}) {
  const spawn = options.spawn || spawnSync;
  const projectsResult = runNx(project, ['show', 'projects', '--json'], spawn);
  if (!projectsResult.ok) return { status: 'blocked', blocker: projectsResult.category, projects: [], graph: null };
  if (!validNxProjectNames(projectsResult.value)) return { status: 'blocked', blocker: 'nx_projects_invalid', projects: [], graph: null };
  const projects = [];
  for (const name of [...projectsResult.value].sort()) {
    const detail = runNx(project, ['show', 'project', name, '--json'], spawn);
    const normalized = detail.ok ? normalizeNxProject(name, detail.value) : null;
    if (!normalized) return { status: 'blocked', blocker: `nx_project_invalid:${name}`, projects: [], graph: null };
    projects.push(normalized);
  }
  const graph = runNx(project, ['graph', '--print'], spawn);
  if (!graph.ok) return { status: 'partial', blocker: graph.category, projects, graph: null };
  return { status: 'resolved', blocker: null, projects, graph: graph.value };
}

function collectVersions(root, pkg) {
  const declarations = Object.fromEntries(PACKAGE_KEYS.map((name) => [name, packageValue(pkg, name)]));
  const installed = Object.fromEntries(PACKAGE_KEYS.map((name) => [name, installedVersion(root, name)]));
  const version = (name) => parseVersion(installed[name] || declarations[name]);
  return {
    declarations,
    installed,
    angular: version('@angular/core'),
    material: version('@angular/material'),
    cdk: version('@angular/cdk'),
    nx: version('nx'),
    nxAngular: version('@nx/angular'),
  };
}

function alignmentWarnings(versions) {
  const warnings = [];
  if (versions.material && versions.cdk && versions.material.raw !== versions.cdk.raw) warnings.push('material_cdk_version_mismatch');
  if (versions.angular?.major === 22 && versions.material && versions.material.major !== 22) warnings.push('angular_material_major_mismatch');
  if (versions.nx && versions.nxAngular && versions.nx.raw !== versions.nxAngular.raw) warnings.push('nx_package_version_mismatch');
  if (versions.angular?.major === 22 && versions.nx && versions.nx.major < 23) warnings.push('nx_angular22_unsupported');
  return warnings;
}

function workspaceStatus(pkg, isAngular) {
  if (!pkg) return 'malformed_or_missing_package';
  return isAngular ? 'angular_workspace' : 'not_angular';
}

export function inspectAngularWorkspace(options = {}) {
  const root = resolveAngularProjectRoot(options.project).physical;
  const pkg = readBoundedProjectJson(root, 'package.json', { maxBytes: 1024 * 1024 });
  const angularJson = readBoundedProjectJson(root, 'angular.json', { maxBytes: 2 * 1024 * 1024 });
  const nxJson = readBoundedProjectJson(root, 'nx.json', { maxBytes: 1024 * 1024 });
  const versions = collectVersions(root, pkg);
  const isAngular = Boolean(angularJson || versions.declarations['@angular/core']);
  const isNx = Boolean(nxJson || versions.declarations.nx || versions.declarations['@nx/angular']);
  const packageManager = detectPackageManager({ project: root, mode: 'existing' });
  const nxResolution = !isNx ? null : (options.resolveNx ? resolveNxWorkspace(root, { spawn: options.spawn }) : { status: 'not_requested', blocker: null, projects: [], graph: null });
  return {
    schema: 'pidex-angular-workspace-inspection-v1', status: workspaceStatus(pkg, isAngular), project_root: root, package_manager: packageManager,
    runtime: { node: process.versions.node, angular22_compatibility: angular22NodeCompatibility() }, declarations: versions.declarations, installed: versions.installed,
    angular: { version: versions.angular?.raw || null, projects: normalizeAngularProjects(angularJson) },
    material: { detected: Boolean(versions.material || versions.cdk), material_version: versions.material?.raw || null, cdk_version: versions.cdk?.raw || null },
    nx: { detected: isNx, version: versions.nx?.raw || null, angular_plugin_version: versions.nxAngular?.raw || null, resolution: nxResolution },
    warnings: [...packageManager.warnings, ...alignmentWarnings(versions)].sort(),
  };
}
