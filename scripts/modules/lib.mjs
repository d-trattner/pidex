import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const VALID_MODULE_KINDS = new Set(['core-required', 'core-toggleable', 'optional-internal']);
export const VALID_PHASES = new Set(['preflight', 'planning', 'critic-review', 'implementation', 'code-review', 'qa', 'uat', 'security', 'devops', 'pre-release', 'post-release', 'quality-refresh', 'maintenance']);
export const VALID_IMPORTANCE = new Set(['required', 'recommended', 'optional']);
export const VALID_SCOPES = new Set(['install', 'project']);
export const VALID_MUTABILITY = new Set(['read-only', 'writes-artifacts', 'writes-project', 'writes-config', 'external-side-effects']);
export const VALID_CAPABILITY_KINDS = new Set(['check', 'tool', 'report']);
export const VALID_AGENT_RULE_AUTHORITY = new Set(['module-scoped']);
const AGENT_RULE_ID_RE = /^[a-z0-9][a-z0-9.-]{2,160}$/;
const AGENT_RULE_TOKEN_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const CAPABILITY_ID_RE = /^[A-Za-z0-9_.:-]{1,160}$/;
const MAX_AGENT_RULE_FILE_BYTES = 16 * 1024;

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
      if ('allowed_value_patterns' in policy && (!policy.allowed_value_patterns || typeof policy.allowed_value_patterns !== 'object' || Array.isArray(policy.allowed_value_patterns))) {
        errors.push(`${capability.id}: passthrough_policy.allowed_value_patterns must be an object when present`);
      }
      for (const [flag, patterns] of Object.entries(policy.allowed_value_patterns || {})) {
        if (typeof flag !== 'string' || !flag.startsWith('--') || !Array.isArray(patterns) || patterns.length === 0 || patterns.some((pattern) => typeof pattern !== 'string')) {
          errors.push(`${capability.id}: passthrough_policy.allowed_value_patterns entries must map flags to non-empty string arrays`);
          continue;
        }
        for (const pattern of patterns) {
          try { new RegExp(pattern); } catch { errors.push(`${capability.id}: invalid passthrough value pattern for ${flag}: ${pattern}`); }
        }
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

function moduleRootFromManifestFile(system, manifest) {
  const item = system.byId.get(manifest.id);
  return item ? path.dirname(item.file) : system.pidexRoot;
}

function pathWithin(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function pathHasSymlink(root, relativePath) {
  let current = path.resolve(root);
  for (const part of relativePath.split(/[\\/]+/).filter(Boolean)) {
    current = path.join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) return true;
  }
  return false;
}

function safeMetadataString(value, max = 200) {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069<>`\[\]\(\)]/u.test(value);
}

function validateAgentRulePath(moduleRoot, rule, errors) {
  const ruleId = rule?.id || 'agent_rule';
  const rel = rule?.path;
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 240) return errors.push(`${ruleId}: invalid agent_rule path`);
  if (path.isAbsolute(rel)) return errors.push(`${ruleId}: agent_rule path must be relative`);
  const normalized = rel.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part === '..' || part === '')) return errors.push(`${ruleId}: agent_rule path must not contain traversal`);
  if (path.extname(normalized) !== '.md') return errors.push(`${ruleId}: agent_rule path must be markdown`);
  if (pathHasSymlink(moduleRoot, normalized)) return errors.push(`${ruleId}: agent_rule path must not include symlinks`);
  const target = path.resolve(moduleRoot, normalized);
  if (!pathWithin(moduleRoot, target)) return errors.push(`${ruleId}: agent_rule path escapes module root`);
  if (!existsSync(target)) return errors.push(`${ruleId}: agent_rule file missing: ${normalized}`);
  const st = lstatSync(target);
  if (!st.isFile()) return errors.push(`${ruleId}: agent_rule path must be a regular file`);
  if (st.size > MAX_AGENT_RULE_FILE_BYTES) return errors.push(`${ruleId}: agent_rule file exceeds max size`);
  const realRoot = realpathSync(moduleRoot);
  const realTarget = realpathSync(target);
  if (!pathWithin(realRoot, realTarget)) return errors.push(`${ruleId}: agent_rule realpath escapes module root`);
}

export function validateAgentRules(system, manifest, agents = knownAgents(system.pidexRoot)) {
  const errors = [];
  const moduleRoot = moduleRootFromManifestFile(system, manifest);
  const rules = manifest.agent_rules;
  if (rules === undefined) return errors;
  if (!Array.isArray(rules)) return [`${manifest.id}: agent_rules must be array`];
  for (const rule of rules) {
    const id = rule?.id;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) { errors.push(`${manifest.id}: agent_rule must be object`); continue; }
    if (typeof id !== 'string' || !AGENT_RULE_ID_RE.test(id)) errors.push(`${manifest.id}: invalid agent_rule id`);
    else if (!id.startsWith(`${manifest.id}.`)) errors.push(`${id}: agent_rule id must start with module id prefix ${manifest.id}.`);
    if (rule.authority !== 'module-scoped') errors.push(`${id || manifest.id}: invalid agent_rule authority`);
    if (rule.agent === 'orchestrator') errors.push(`${id || manifest.id}: orchestrator agent_rules are not allowed in v1`);
    if (typeof rule.agent !== 'string' || !agents.has(rule.agent)) errors.push(`${id || manifest.id}: unknown agent_rule agent ${rule.agent}`);
    if (!Array.isArray(rule.phases) || rule.phases.length === 0) errors.push(`${id || manifest.id}: agent_rule phases must be non-empty array`);
    for (const phase of rule.phases || []) if (!VALID_PHASES.has(phase)) errors.push(`${id || manifest.id}: invalid agent_rule phase ${phase}`);
    validateAgentRulePath(moduleRoot, rule, errors);
    if ('summary' in rule && !safeMetadataString(rule.summary, 200)) errors.push(`${id || manifest.id}: invalid agent_rule summary`);
    if ('audience_scope' in rule && (typeof rule.audience_scope !== 'string' || !AGENT_RULE_TOKEN_RE.test(rule.audience_scope))) errors.push(`${id || manifest.id}: invalid agent_rule audience_scope`);
    const applies = rule.applies_when;
    if (applies !== undefined) {
      if (!applies || typeof applies !== 'object' || Array.isArray(applies)) errors.push(`${id || manifest.id}: agent_rule applies_when must be object`);
      else {
        if ('mode' in applies && (typeof applies.mode !== 'string' || !AGENT_RULE_TOKEN_RE.test(applies.mode))) errors.push(`${id || manifest.id}: invalid agent_rule applies_when.mode`);
        if ('capabilities' in applies) {
          if (!Array.isArray(applies.capabilities)) errors.push(`${id || manifest.id}: agent_rule applies_when.capabilities must be array`);
          for (const capability of applies.capabilities || []) if (typeof capability !== 'string' || !CAPABILITY_ID_RE.test(capability)) errors.push(`${id || manifest.id}: invalid agent_rule capability filter ${capability}`);
        }
      }
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
    errors.push(...validateAgentRules(system, manifest, agents));
  }
  const agentRuleIds = new Set();
  for (const { manifest } of system.modules) {
    for (const rule of manifest.agent_rules || []) {
      if (!rule?.id) continue;
      if (agentRuleIds.has(rule.id)) errors.push(`duplicate agent_rule id: ${rule.id}`);
      agentRuleIds.add(rule.id);
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

export function allAgentRules(system) {
  const out = [];
  for (const { manifest } of system.modules) {
    const moduleState = moduleEnabled(system, manifest);
    for (const rule of manifest.agent_rules || []) out.push({ module: manifest, moduleState, rule });
  }
  return out.sort((a, b) => `${a.module.id}\0${a.rule.id}\0${a.rule.path}`.localeCompare(`${b.module.id}\0${b.rule.id}\0${b.rule.path}`));
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

export function agentRuleAvailability(system, entry, context = {}) {
  const { module, moduleState, rule } = entry;
  if (!moduleState.enabled) return { available: false, reason: 'module_disabled' };
  for (const dep of module.dependencies || []) {
    const depItem = system.byId.get(dep);
    if (!depItem || !moduleEnabled(system, depItem.manifest).enabled) return { available: false, reason: 'dependency_disabled' };
  }
  if (rule.agent !== context.agent) return { available: false, reason: 'agent_not_allowed' };
  if (!rule.phases?.includes(context.phase)) return { available: false, reason: 'phase_not_allowed' };
  const applies = rule.applies_when || {};
  if (applies.mode && applies.mode !== context.mode) return { available: false, reason: context.mode ? 'mode_not_matched' : 'mode_required' };
  for (const capabilityId of applies.capabilities || []) {
    const capabilityEntry = allCapabilities(system).find((item) => item.capability.id === capabilityId);
    if (!capabilityEntry) return { available: false, reason: `capability_missing:${capabilityId}` };
    const capability = capabilityAvailability(system, capabilityEntry, context.agent, context.phase, context.project);
    if (!capability.available) return { available: false, reason: `capability_unavailable:${capabilityId}:${capability.reason}` };
  }
  return { available: true, reason: undefined };
}

export function matchedAgentRules(system, context = {}) {
  return allAgentRules(system).map((entry) => ({ ...entry, availability: agentRuleAvailability(system, entry, context) })).filter((entry) => entry.availability.available);
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
