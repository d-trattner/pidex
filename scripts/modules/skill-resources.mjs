#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, closeSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadModuleSystem, moduleEnabled, validateSystem } from './lib.mjs';

const rootFromHere = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const parse = (argv) => {
  const out = { action: argv[0], moduleId: undefined, dryRun: false, cascade: false, json: false };
  for (const arg of argv.slice(1)) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--cascade') out.cascade = true;
    else if (arg === '--json') out.json = true;
    else if (!out.moduleId) out.moduleId = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!['status', 'enable', 'disable'].includes(out.action)) throw new Error('action must be status, enable, or disable');
  if (out.action !== 'status' && !out.moduleId) throw new Error('module id required');
  return out;
};

const resourceItems = (system) => system.modules.filter((item) => item.manifest.skill_package).sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
const packagePath = (item) => path.resolve(path.dirname(item.file), ...item.manifest.skill_package.path.split('/'));
const state = (system, id) => {
  const item = system.byId.get(id);
  return item ? moduleEnabled(system, item.manifest).enabled : false;
};

export function moduleStateRevision(system) {
  const effective = system.modules.map((item) => [item.manifest.id, state(system, item.manifest.id)]).sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256').update(JSON.stringify(effective)).digest('hex');
}

export function planModuleAction(system, action, moduleId, cascade = false) {
  if (!['enable', 'disable'].includes(action)) throw new Error('action must be enable or disable');
  const validation = validateSystem(system);
  const blockingErrors = validation.errors.filter((error) => !error.includes('dependency disabled:'));
  if (blockingErrors.length) throw new Error(`module system invalid: ${blockingErrors.join('; ')}`);
  const target = system.byId.get(moduleId);
  if (!target) throw new Error(`unknown module: ${moduleId}`);
  if (target.manifest.kind === 'core-required') throw new Error(`locked module: ${moduleId}`);

  const ids = [];
  if (action === 'enable') {
    const visiting = new Set();
    const visit = (id) => {
      if (visiting.has(id)) throw new Error(`dependency cycle at ${id}`);
      const item = system.byId.get(id);
      if (!item) throw new Error(`missing dependency: ${id}`);
      visiting.add(id);
      for (const dep of item.manifest.dependencies || []) visit(dep);
      visiting.delete(id);
      if (item.manifest.kind !== 'core-required' && !ids.includes(id) && !state(system, id)) ids.push(id);
    };
    visit(moduleId);
  } else {
    const collectDependents = (id) => {
      for (const item of system.modules) {
        if (!state(system, item.manifest.id) || !(item.manifest.dependencies || []).includes(id)) continue;
        if (!cascade) throw new Error(`enabled dependents: ${item.manifest.id}`);
        collectDependents(item.manifest.id);
        if (!ids.includes(item.manifest.id)) ids.push(item.manifest.id);
      }
    };
    collectDependents(moduleId);
    if (state(system, moduleId)) ids.push(moduleId);
  }

  return ids.map((id) => {
    const item = system.byId.get(id);
    return { action, moduleId: id, packagePath: item.manifest.skill_package ? packagePath(item) : null };
  });
}

export function planSkillResourceAction(system, action, moduleId, cascade = false) {
  const target = system.byId.get(moduleId);
  if (!target?.manifest.skill_package) throw new Error(`unknown skill module: ${moduleId}`);
  return planModuleAction(system, action, moduleId, cascade);
}

function assertSafeLocalState(localPath) {
  if (!existsSync(localPath)) return;
  const stat = lstatSync(localPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('unsafe modules.local.json');
}

export function applyModuleAction({ pidexRoot, action, moduleId, cascade = false, dryRun = false, expectedRevision, runPi = defaultRunPi }) {
  let system = loadModuleSystem(pidexRoot);
  const revision = moduleStateRevision(system);
  if (expectedRevision && expectedRevision !== revision) throw Object.assign(new Error('module state changed; refresh required'), { code: 'MODULE_STATE_CONFLICT' });
  const actions = planModuleAction(system, action, moduleId, cascade);
  if (dryRun || actions.length === 0) return { ok: true, changed: false, actions, revision, reload_required: actions.some((item) => item.packagePath) };

  const lockPath = path.join(pidexRoot, 'config', '.modules-action.lock');
  let lockFd;
  try {
    lockFd = openSync(lockPath, 'wx', 0o600);
  } catch {
    throw Object.assign(new Error('another module action is in progress'), { code: 'MODULE_ACTION_BUSY' });
  }

  const attemptedPackages = [];
  try {
    system = loadModuleSystem(pidexRoot);
    if (moduleStateRevision(system) !== revision) throw Object.assign(new Error('module state changed; refresh required'), { code: 'MODULE_STATE_CONFLICT' });
    for (const item of actions) {
      if (!item.packagePath) continue;
      const command = item.action === 'enable' ? 'install' : 'remove';
      attemptedPackages.push(item);
      const result = runPi(command, item.packagePath);
      if (!result.ok) throw new Error(`pi ${command} failed for ${item.moduleId}: ${result.error || 'unknown error'}`);
    }
    const localPath = system.localConfigPath;
    assertSafeLocalState(localPath);
    const current = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : { modules: {} };
    current.modules ||= {};
    for (const item of actions) current.modules[item.moduleId] = { ...(current.modules[item.moduleId] || {}), enabled: action === 'enable' };
    const temp = `${localPath}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(temp, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temp, localPath);
    const nextEffective = system.modules.map((item) => {
      const changed = actions.some((candidate) => candidate.moduleId === item.manifest.id);
      return [item.manifest.id, changed ? action === 'enable' : state(system, item.manifest.id)];
    }).sort(([a], [b]) => a.localeCompare(b));
    const nextRevision = createHash('sha256').update(JSON.stringify(nextEffective)).digest('hex');
    return { ok: true, changed: true, actions, revision: nextRevision, reload_required: actions.some((item) => item.packagePath) };
  } catch (error) {
    for (const item of attemptedPackages.reverse()) {
      const rollback = item.action === 'enable' ? 'remove' : 'install';
      try { runPi(rollback, item.packagePath); } catch {}
    }
    throw error;
  } finally {
    if (lockFd !== undefined) closeSync(lockFd);
    try { unlinkSync(lockPath); } catch {}
  }
}

export function applySkillResourceAction(options) {
  const system = loadModuleSystem(options.pidexRoot);
  const target = system.byId.get(options.moduleId);
  if (!target?.manifest.skill_package) throw new Error(`unknown skill module: ${options.moduleId}`);
  return applyModuleAction(options);
}

function defaultRunPi(command, packageRoot) {
  const result = spawnSync('pi', [command, packageRoot], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false, timeout: 120_000, killSignal: 'SIGTERM', maxBuffer: 1024 * 1024 });
  return { ok: !result.error && result.status === 0, error: result.error?.message || result.stderr?.trim() || '' };
}

export function skillResourceStatus(pidexRoot) {
  const system = loadModuleSystem(pidexRoot);
  return resourceItems(system).map((item) => ({ module: item.manifest.id, enabled: state(system, item.manifest.id), registration: 'unverified', skills: item.manifest.skill_package.skills, package: packagePath(item) }));
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
