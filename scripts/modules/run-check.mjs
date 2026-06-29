#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { allCapabilities, appendJsonLine, capabilityAvailability, evidencePath, loadModuleSystem, parseArgs, scriptPidexRoot, validateProjectPath, validateSystem } from './lib.mjs';

const rawArgv = process.argv.slice(2);
const passthroughSeparator = rawArgv.indexOf('--');
const runnerArgv = passthroughSeparator === -1 ? rawArgv : rawArgv.slice(0, passthroughSeparator);
const passthroughArgs = passthroughSeparator === -1 ? [] : rawArgv.slice(passthroughSeparator + 1);
const args = parseArgs(runnerArgv);
if (args.help) {
  console.log(`Usage: node scripts/modules/run-check.mjs --capability <id> --agent <agent> --phase <phase> --project <absolute-project-root> [options]\n\nRuns a PIDEX module capability through the module runner and writes structured evidence.\n\nOptions:\n  --capability <id>    Required. Capability id, for example release.reference-integrity.\n  --agent <name>       Required. PIDEX agent name or pseudo-agent 'orchestrator'.\n  --phase <phase>      Required. Lifecycle phase, for example pre-release.\n  --project <path>     Required. Absolute project root.\n  --pidex-root <path>  PIDEX root for tests/advanced use. Defaults to repository root.\n  --help               Show this help.`);
  process.exit(0);
}
const pidexRoot = args['pidex-root'] ? path.resolve(String(args['pidex-root'])) : scriptPidexRoot(import.meta.url);
const capabilityId = args.capability;
const agent = args.agent;
const phase = args.phase;
if (!capabilityId || !agent || !phase) {
  console.error('--capability, --agent, and --phase are required');
  process.exit(2);
}
let project;
try {
  if (!path.isAbsolute(String(args.project || ''))) throw new Error('--project must be absolute');
  project = validateProjectPath(args.project);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const system = loadModuleSystem(pidexRoot);
const validation = validateSystem(system);
if (!validation.ok) {
  console.error(validation.errors.join('\n'));
  process.exit(1);
}
const entry = allCapabilities(system).find((item) => item.capability.id === capabilityId);
if (!entry) {
  console.error(`unknown capability: ${capabilityId}`);
  process.exit(1);
}
const availability = capabilityAvailability(system, entry, agent, phase, project);
if (!availability.available) {
  console.error(`capability unavailable: ${availability.reason}`);
  process.exit(1);
}

const startedAt = new Date().toISOString();
const command = entry.capability.command;
if (passthroughArgs.length && command.passthrough !== true) {
  console.error(`capability does not allow passthrough args: ${capabilityId}`);
  process.exit(2);
}
function expandPolicyRoot(root) {
  return String(root)
    .replaceAll('__PIDEX_ROOT__', pidexRoot)
    .replaceAll('__PROJECT_ROOT__', project)
    .replaceAll('__HOME__', os.homedir());
}

function withinRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function pathAllowedByPolicy(policy, arg) {
  const value = String(arg);
  if (value.includes('..')) return false;
  if (!path.isAbsolute(value)) return true;
  const resolved = path.resolve(value);
  if (policy.allow_absolute_project_paths === true && withinRoot(project, resolved)) return true;
  const allowedRoots = Array.isArray(policy.allowed_absolute_roots) ? policy.allowed_absolute_roots : [];
  return allowedRoots.some((root) => withinRoot(expandPolicyRoot(root), resolved));
}

function passthroughAllowed(command, argsToCheck) {
  const policy = command.passthrough_policy || {};
  const patterns = policy.allowed_patterns || [];
  return argsToCheck.every((arg) => pathAllowedByPolicy(policy, arg) && patterns.some((pattern) => new RegExp(pattern).test(arg)));
}

function scrubSecretLike(value) {
  return String(value)
    .replace(/\b(AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g, '[REDACTED]')
    .replace(/\b(ghp|gho|ghs)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{82}/g, '[REDACTED]')
    .replace(/\bsk-(proj-)?[A-Za-z0-9_-]{40,}\b/g, '[REDACTED]')
    .replace(/sk-ant-api03-[A-Za-z0-9_-]{80,}/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, '[REDACTED]');
}

function redactArgs(argsToRedact) {
  const sensitive = /(?:token|secret|password|passwd|api[-_]?key|credential|auth)/i;
  const out = [];
  let redactNext = false;
  for (const arg of argsToRedact) {
    if (redactNext) {
      out.push('[REDACTED]');
      redactNext = false;
      continue;
    }
    const eq = String(arg).match(/^(--?[^=]+)=(.*)$/);
    if (eq && sensitive.test(eq[1])) {
      out.push(`${eq[1]}=[REDACTED]`);
      continue;
    }
    out.push(scrubSecretLike(arg));
    if (sensitive.test(String(arg))) redactNext = true;
  }
  return out;
}

if (passthroughArgs.length && !passthroughAllowed(command, passthroughArgs)) {
  console.error(`passthrough args rejected by capability policy: ${capabilityId}`);
  process.exit(2);
}
const execArgs = command.args.map((arg) => String(arg).replaceAll('__PIDEX_PROJECT__', project));
const executedArgs = [...execArgs, ...passthroughArgs];
const redactedPassthroughArgs = redactArgs(passthroughArgs);
const redactedExecutedArgs = [...execArgs, ...redactedPassthroughArgs];
const proc = spawnSync(command.bin, executedArgs, { cwd: pidexRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const endedAt = new Date().toISOString();
const status = proc.status === 0 ? 'passed' : 'failed';
const evidence = {
  type: 'module_capability_evidence',
  module_id: entry.module.id,
  capability_id: entry.capability.id,
  agent,
  phase,
  project,
  scope: entry.capability.scope,
  status,
  started_at: startedAt,
  ended_at: endedAt,
  exit_code: proc.status,
  signal: proc.signal,
  command: { bin: command.bin, args: command.args },
  executed_command: { bin: command.bin, args: redactedExecutedArgs },
  passthrough_args: redactedPassthroughArgs,
  artifacts: [],
};
const file = evidencePath(pidexRoot, project, entry.capability.scope);
appendJsonLine(file, evidence);
if (proc.stdout) process.stdout.write(proc.stdout);
if (proc.stderr) process.stderr.write(proc.stderr);
console.error(`module capability evidence: ${file}`);
process.exit(proc.status ?? 1);
