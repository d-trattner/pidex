#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadModuleSystem, moduleEnabled, validateSystem } from './lib.mjs';

const rootFromHere = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const parse = (argv) => {
  const out = { action: argv[0], moduleId: argv[1], dryRun: false, cascade: false, json: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--cascade') out.cascade = true;
    else if (arg === '--json') out.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!['status', 'enable', 'disable'].includes(out.action)) throw new Error('action must be status, enable, or disable');
  if (out.action !== 'status' && !out.moduleId) throw new Error('module id required');
  return out;
};

const resourceItems = (system) => system.modules.filter((item) => item.manifest.skill_package).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
const packagePath = (item) => path.resolve(path.dirname(item.file), ...item.manifest.skill_package.path.split('/'));

export function planSkillResourceAction(system, action, moduleId, cascade = false) {
  if (!['enable', 'disable'].includes(action)) throw new Error('action must be enable or disable');
  const validation = validateSystem(system);
  const blockingErrors = validation.errors.filter((error) => action !== 'disable' || !error.includes('dependency disabled:'));
  if (blockingErrors.length) throw new Error(`module system invalid: ${blockingErrors.join('; ')}`);
  const items = resourceItems(system);
  const byId = new Map(items.map((item) => [item.manifest.id, item]));
  if (!byId.has(moduleId)) throw new Error(`unknown skill module: ${moduleId}`);
  const enabled = (id) => {
    const item = system.byId.get(id);
    return item ? moduleEnabled(system, item.manifest).enabled : false;
  };
  const ids = [];
  if (action === 'enable') {
    const visit = (id) => {
      const item = system.byId.get(id);
      for (const dep of item?.manifest.dependencies || []) if (byId.has(dep)) visit(dep);
      if (byId.has(id) && !ids.includes(id) && !enabled(id)) ids.push(id);
    };
    visit(moduleId);
  } else {
    const dependents = items.filter((item) => enabled(item.manifest.id) && item.manifest.dependencies.includes(moduleId)).map((item) => item.manifest.id);
    if (dependents.length && !cascade) throw new Error(`enabled dependents: ${dependents.join(', ')}`);
    if (cascade) ids.push(...dependents.sort().reverse());
    if (enabled(moduleId)) ids.push(moduleId);
  }
  return ids.map((id) => ({ action, moduleId: id, packagePath: packagePath(byId.get(id)) }));
}

export function applySkillResourceAction({ pidexRoot, action, moduleId, cascade = false, dryRun = false, runPi = defaultRunPi }) {
  const system = loadModuleSystem(pidexRoot);
  const actions = planSkillResourceAction(system, action, moduleId, cascade);
  if (dryRun || actions.length === 0) return { ok: true, changed: false, actions, reload_required: actions.length > 0 };
  const attempted = [];
  try {
    for (const item of actions) {
      const command = item.action === 'enable' ? 'install' : 'remove';
      attempted.push(item);
      const result = runPi(command, item.packagePath);
      if (!result.ok) throw new Error(`pi ${command} failed for ${item.moduleId}: ${result.error || 'unknown error'}`);
    }
    const localPath = system.localConfigPath;
    if (existsSync(localPath)) {
      const stat = lstatSync(localPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('unsafe modules.local.json');
    }
    const current = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : { modules: {} };
    current.modules ||= {};
    for (const item of actions) current.modules[item.moduleId] = { ...(current.modules[item.moduleId] || {}), enabled: action === 'enable' };
    const temp = `${localPath}.tmp-${process.pid}`;
    writeFileSync(temp, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temp, localPath);
    return { ok: true, changed: true, actions, reload_required: true };
  } catch (error) {
    for (const item of attempted.reverse()) {
      const rollback = item.action === 'enable' ? 'remove' : 'install';
      try { runPi(rollback, item.packagePath); } catch {}
    }
    throw error;
  }
}

function defaultRunPi(command, packageRoot) {
  const result = spawnSync('pi', [command, packageRoot], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false, timeout: 120_000, killSignal: 'SIGTERM', maxBuffer: 1024 * 1024 });
  return { ok: !result.error && result.status === 0, error: result.error?.message || result.stderr?.trim() || '' };
}

export function skillResourceStatus(pidexRoot) {
  const system = loadModuleSystem(pidexRoot);
  return resourceItems(system).map((item) => ({ module: item.manifest.id, enabled: moduleEnabled(system, item.manifest).enabled, skills: item.manifest.skill_package.skills, package: packagePath(item) }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parse(process.argv.slice(2));
    const pidexRoot = rootFromHere();
    const result = args.action === 'status' ? { ok: true, modules: skillResourceStatus(pidexRoot) } : applySkillResourceAction({ pidexRoot, ...args });
    console.log(args.json ? JSON.stringify(result, null, 2) : args.action === 'status' ? result.modules.map((x) => `${x.module}: ${x.enabled ? 'enabled' : 'disabled'} [${x.skills.join(', ')}]`).join('\n') : `${args.dryRun ? 'Would change' : 'Changed'}: ${result.actions.map((x) => x.moduleId).join(', ') || 'none'}${result.reload_required ? '\nRun /reload in Pi.' : ''}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
