import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const VALID_MODULE_KINDS = new Set(['core-required', 'core-toggleable', 'optional-internal']);
export const VALID_PHASES = new Set(['preflight', 'planning', 'critic-review', 'implementation', 'code-review', 'qa', 'uat', 'security', 'devops', 'pre-release', 'post-release', 'quality-refresh', 'maintenance']);
export const VALID_IMPORTANCE = new Set(['required', 'recommended', 'optional']);
export const VALID_SCOPES = new Set(['install', 'project']);
export const VALID_MUTABILITY = new Set(['read-only', 'writes-artifacts', 'writes-project', 'writes-config', 'external-side-effects']);
export const VALID_CAPABILITY_KINDS = new Set(['check', 'tool', 'report']);

export function scriptPidexRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '../..');
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const key = arg.slice(2);
    if (key === 'json' || key === 'debug' || key === 'help') { out[key] = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    out[key] = value;
    i += 1;
  }
  return out;
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function tryReadJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return readJson(file);
}

function walkModuleJson(root) {
  const modulesRoot = path.join(root, 'modules');
  const files = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name === 'module.json') files.push(full);
    }
  }
  walk(modulesRoot);
  return files.sort();
}

export function loadModuleSystem(pidexRoot) {
  const manifestFiles = walkModuleJson(pidexRoot);
  const modules = manifestFiles.map((file) => ({ file, manifest: readJson(file) }));
  const configPath = path.join(pidexRoot, 'config', 'modules.json');
  const localConfigPath = path.join(pidexRoot, 'config', 'modules.local.json');
  const baseConfig = tryReadJson(configPath, { modules: {} });
  const localConfig = tryReadJson(localConfigPath, { modules: {} });
  const configModules = { ...(baseConfig.modules || {}), ...(localConfig.modules || {}) };
  const byId = new Map();
  for (const item of modules) byId.set(item.manifest.id, item);
  return { pidexRoot, manifestFiles, modules, byId, configPath, localConfigPath, configModules };
}

export function knownAgents(pidexRoot) {
  const agentsDir = path.join(pidexRoot, 'agents');
  const names = new Set(['orchestrator']);
  if (!existsSync(agentsDir)) return names;
  for (const entry of readdirSync(agentsDir)) {
    const match = entry.match(/^(pidex-[A-Za-z0-9_-]+)\.md$/);
    if (match) names.add(match[1]);
  }
  return names;
}

export function moduleEnabled(system, manifest) {
  if (manifest.kind === 'core-required') return { enabled: true, locked: true, source: 'core-required' };
  const configured = system.configModules[manifest.id];
  if (configured && typeof configured.enabled === 'boolean') return { enabled: configured.enabled, locked: false, source: 'config' };
  return { enabled: manifest.default_enabled !== false, locked: false, source: 'manifest-default' };
}

export function validateProjectPath(project) {
  if (!project) throw new Error('--project is required');
  const resolved = path.resolve(project);
  if (!existsSync(resolved)) throw new Error(`--project does not exist: ${resolved}`);
  return resolved;
}

export function currentPlatformId() {
  if (process.platform === 'win32') return commandExists('bash') ? 'windows-git-bash' : 'windows-native';
  if (process.platform === 'linux' && /microsoft|wsl/i.test(readFileSafe('/proc/version'))) return 'wsl2';
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'darwin') return 'macos';
  return process.platform;
}

function readFileSafe(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

export function commandExists(bin) {
  const proc = spawnSync(process.platform === 'win32' ? 'where' : 'command', process.platform === 'win32' ? [bin] : ['-v', bin], { shell: process.platform !== 'win32', stdio: 'ignore' });
  return proc.status === 0;
}

export function validateProtectedContexts(system, projectRoot) {
  const errors = [];
  if (!projectRoot) return errors;
  // Public-readiness is fixed-core authority under scripts/release/public-readiness.sh.
  // Toggleable modules must not gate PIDEX self-release/publication readiness.
  // Keep this hook for future protected fixed-core contexts, but do not protect
  // pidex.release-safety module enablement here.
  path.resolve(projectRoot);
  path.resolve(system.pidexRoot);
  return errors;
}

export function validateCapabilityCommand(pidexRoot, capability) {
  const errors = [];
  const command = capability.command;
  if (!command || typeof command.bin !== 'string' || !Array.isArray(command.args)) return errors;
  const allowedBins = new Set(['node', 'bash']);
  const riskyFlags = new Set(['-e', '--eval', '-c', '--command']);
  if (!allowedBins.has(command.bin)) errors.push(`${capability.id}: command bin is not allowed: ${command.bin}`);
  if (command.passthrough === true) {
    const policy = command.passthrough_policy;
    if (!policy || typeof policy !== 'object') {
      errors.push(`${capability.id}: passthrough commands must define passthrough_policy`);
    } else if (!Array.isArray(policy.allowed_patterns) || policy.allowed_patterns.length === 0) {
      errors.push(`${capability.id}: passthrough_policy.allowed_patterns must be a non-empty array`);
    } else {
      if ('allow_absolute_project_paths' in policy && typeof policy.allow_absolute_project_paths !== 'boolean') {
        errors.push(`${capability.id}: passthrough_policy.allow_absolute_project_paths must be boolean when present`);
      }
      if ('allowed_absolute_roots' in policy && (!Array.isArray(policy.allowed_absolute_roots) || policy.allowed_absolute_roots.some((root) => typeof root !== 'string'))) {
        errors.push(`${capability.id}: passthrough_policy.allowed_absolute_roots must be a string array when present`);
      }
      for (const pattern of policy.allowed_patterns) {
        if (typeof pattern !== 'string') errors.push(`${capability.id}: passthrough allowed pattern must be a string`);
        else { try { new RegExp(pattern); } catch { errors.push(`${capability.id}: invalid passthrough allowed pattern: ${pattern}`); } }
      }
    }
  }
  for (const arg of command.args) {
    if (typeof arg !== 'string') {
      errors.push(`${capability.id}: command args must be strings`);
      continue;
    }
    if (riskyFlags.has(arg)) errors.push(`${capability.id}: risky interpreter flag is not allowed: ${arg}`);
  }
  const firstArg = command.args[0];
  if (command.bin === 'node' || command.bin === 'bash') {
    if (typeof firstArg !== 'string' || !/\.(mjs|js|sh)$/.test(firstArg)) {
      errors.push(`${capability.id}: ${command.bin} command must start with a relative script path`);
    }
  }
  for (const arg of command.args) {
    if (typeof arg !== 'string') continue;
    if (!/\.(mjs|js|sh|ps1|ts|tsx|json|md|txt|yml|yaml)$/.test(arg)) continue;
    if (path.isAbsolute(arg)) {
      errors.push(`${capability.id}: command file args must be relative to PIDEX root: ${arg}`);
      continue;
    }
    const resolved = path.resolve(pidexRoot, arg);
    if (path.relative(pidexRoot, resolved).startsWith('..') || path.relative(pidexRoot, resolved) === '') {
      errors.push(`${capability.id}: command file arg escapes PIDEX root: ${arg}`);
    }
  }
  return errors;
}

export function validateSystem(system) {
  const errors = [];
  const moduleIds = new Set();
  const capabilityIds = new Set();
  const agents = knownAgents(system.pidexRoot);
  for (const { file, manifest } of system.modules) {
    if (!manifest || typeof manifest !== 'object') { errors.push(`${file}: manifest must be object`); continue; }
    if (typeof manifest.id !== 'string' || !manifest.id) errors.push(`${file}: id is required`);
    if (moduleIds.has(manifest.id)) errors.push(`duplicate module id: ${manifest.id}`);
    moduleIds.add(manifest.id);
    if (manifest.schema_version !== 1) errors.push(`${manifest.id}: schema_version must be 1`);
    if (!VALID_MODULE_KINDS.has(manifest.kind)) errors.push(`${manifest.id}: invalid kind ${manifest.kind}`);
    if (!Array.isArray(manifest.dependencies)) errors.push(`${manifest.id}: dependencies must be array`);
    for (const dep of manifest.dependencies || []) if (!system.byId.has(dep)) errors.push(`${manifest.id}: unknown dependency ${dep}`);
    for (const capability of manifest.capabilities || []) {
      if (!capability.id) errors.push(`${manifest.id}: capability id is required`);
      if (capabilityIds.has(capability.id)) errors.push(`duplicate capability id: ${capability.id}`);
      capabilityIds.add(capability.id);
      if (!VALID_CAPABILITY_KINDS.has(capability.kind)) errors.push(`${capability.id}: invalid kind ${capability.kind}`);
      if (!Array.isArray(capability.phases) || capability.phases.length === 0) errors.push(`${capability.id}: phases must be non-empty array`);
      for (const phase of capability.phases || []) if (!VALID_PHASES.has(phase)) errors.push(`${capability.id}: invalid phase ${phase}`);
      if (!VALID_SCOPES.has(capability.scope)) errors.push(`${capability.id}: invalid scope ${capability.scope}`);
      if (!VALID_IMPORTANCE.has(capability.importance)) errors.push(`${capability.id}: invalid importance ${capability.importance}`);
      if (!Array.isArray(capability.allowed_agents) || capability.allowed_agents.length === 0) errors.push(`${capability.id}: allowed_agents must be non-empty array`);
      for (const agent of capability.allowed_agents || []) if (!agents.has(agent)) errors.push(`${capability.id}: unknown allowed agent ${agent}`);
      if (!Array.isArray(capability.mutability) || capability.mutability.length === 0) errors.push(`${capability.id}: mutability must be non-empty array`);
      for (const item of capability.mutability || []) if (!VALID_MUTABILITY.has(item)) errors.push(`${capability.id}: invalid mutability ${item}`);
      if (!capability.command || typeof capability.command.bin !== 'string' || !Array.isArray(capability.command.args)) errors.push(`${capability.id}: command must use structured {bin,args}`);
      errors.push(...validateCapabilityCommand(system.pidexRoot, capability));
    }
  }
  for (const configuredId of Object.keys(system.configModules)) {
    const item = system.byId.get(configuredId);
    if (!item) errors.push(`config references unknown module: ${configuredId}`);
    else if (item.manifest.kind === 'core-required') errors.push(`core-required module must not be configurable: ${configuredId}`);
  }
  for (const { manifest } of system.modules) {
    const state = moduleEnabled(system, manifest);
    if (!state.enabled) continue;
    for (const dep of manifest.dependencies || []) {
      const depItem = system.byId.get(dep);
      if (depItem && !moduleEnabled(system, depItem.manifest).enabled) errors.push(`${manifest.id}: dependency disabled: ${dep}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function allCapabilities(system) {
  const out = [];
  for (const { manifest } of system.modules) {
    const moduleState = moduleEnabled(system, manifest);
    for (const capability of manifest.capabilities || []) out.push({ module: manifest, moduleState, capability });
  }
  return out;
}

export function capabilityAvailability(system, entry, agent, phase, projectRoot) {
  const { module, moduleState, capability } = entry;
  const platform = currentPlatformId();
  const supported = capability.supported_platforms || [];
  if (!moduleState.enabled) {
    return { available: false, reason: 'module_disabled', requirement_active: false };
  }
  for (const dep of module.dependencies || []) {
    const depItem = system.byId.get(dep);
    if (!depItem || !moduleEnabled(system, depItem.manifest).enabled) return { available: false, reason: 'dependency_disabled', requirement_active: true };
  }
  if (!capability.allowed_agents.includes(agent)) return { available: false, reason: 'agent_not_allowed', requirement_active: false };
  if (!capability.phases.includes(phase)) return { available: false, reason: 'phase_not_allowed', requirement_active: false };
  if (supported.length && !supported.includes(platform)) return { available: false, reason: 'platform_not_declared', requirement_active: capability.importance === 'required', platform };
  if (!commandExists(capability.command.bin)) return { available: false, reason: 'platform_command_unavailable', requirement_active: capability.importance === 'required', platform };
  return { available: true, reason: undefined, requirement_active: capability.importance === 'required', platform };
}

export function runnerInvocation(capabilityId, agent, phase, project) {
  return { bin: 'node', args: ['scripts/modules/run-check.mjs', '--capability', capabilityId, '--agent', agent, '--phase', phase, '--project', project] };
}

export function evidencePath(pidexRoot, projectRoot, scope) {
  const dir = scope === 'project' ? path.join(projectRoot, 'pidex', 'state', 'modules', 'evidence') : path.join(pidexRoot, 'state', 'modules', 'evidence');
  mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  return path.join(dir, `${date}.jsonl`);
}

export function appendJsonLine(file, value) {
  writeFileSync(file, `${JSON.stringify(value)}\n`, { flag: 'a' });
}
