import { detectPackageManager } from '../../../../scripts/package-manager/detect.mjs';
import { readBoundedProjectJson, resolveAngularProjectRoot } from './project-root.mjs';

const PACKAGE_KEYS = ['@angular/core', '@angular/cli', 'typescript', 'rxjs', '@angular/material', '@angular/cdk', 'nx', '@nx/angular'];
const MAX_PROJECTS = 200;

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
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > minimum[index]) return 'supported';
    if (actual[index] < minimum[index]) return 'unsupported';
  }
  return 'supported';
}

function installedVersion(root, name) {
  try {
    return readBoundedProjectJson(root, `node_modules/${name}/package.json`, { maxBytes: 256 * 1024 })?.version || null;
  } catch { return null; }
}

function normalizeAngularProjects(angularJson) {
  if (!angularJson?.projects || typeof angularJson.projects !== 'object' || Array.isArray(angularJson.projects)) return [];
  return Object.entries(angularJson.projects).slice(0, MAX_PROJECTS).map(([name, project]) => ({
    name,
    root: typeof project?.root === 'string' ? project.root : null,
    source_root: typeof project?.sourceRoot === 'string' ? project.sourceRoot : null,
    project_type: typeof project?.projectType === 'string' ? project.projectType : null,
    declared_targets: Object.keys(project?.architect || project?.targets || {}).sort(),
  })).sort((left, right) => left.name.localeCompare(right.name));
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

export function inspectAngularWorkspace(options = {}) {
  const root = resolveAngularProjectRoot(options.project).physical;
  const pkg = readBoundedProjectJson(root, 'package.json', { maxBytes: 1024 * 1024 });
  const angularJson = readBoundedProjectJson(root, 'angular.json', { maxBytes: 2 * 1024 * 1024 });
  const nxJson = readBoundedProjectJson(root, 'nx.json', { maxBytes: 1024 * 1024 });
  const versions = collectVersions(root, pkg);
  const isAngular = Boolean(angularJson || versions.declarations['@angular/core']);
  const isNx = Boolean(nxJson || versions.declarations.nx || versions.declarations['@nx/angular']);
  const packageManager = detectPackageManager({ project: root, mode: 'existing' });
  return {
    schema: 'pidex-angular-workspace-inspection-v1',
    status: !pkg ? 'malformed_or_missing_package' : isAngular ? 'angular_workspace' : 'not_angular',
    project_root: root,
    package_manager: packageManager,
    runtime: { node: process.versions.node, angular22_compatibility: angular22NodeCompatibility() },
    declarations: versions.declarations,
    installed: versions.installed,
    angular: { version: versions.angular?.raw || null, projects: normalizeAngularProjects(angularJson) },
    material: { detected: Boolean(versions.material || versions.cdk), material_version: versions.material?.raw || null, cdk_version: versions.cdk?.raw || null },
    nx: { detected: isNx, config_present: Boolean(nxJson), version: versions.nx?.raw || null, angular_plugin_version: versions.nxAngular?.raw || null },
    warnings: [...packageManager.warnings, ...alignmentWarnings(versions)].sort(),
  };
}
