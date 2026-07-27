#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { allCapabilities, appendJsonLine, capabilityAvailability, evidencePath, loadModuleSystem, parseArgs, scriptPidexRoot, trackedSnapshotMatches, validateNodeTestFixedRuntime, validateProjectPath, validateSystem } from './lib.mjs';

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

function argMatchesAny(patterns, arg) {
  return patterns.some((pattern) => new RegExp(pattern).test(arg));
}

function passthroughAllowed(command, argsToCheck) {
  const policy = command.passthrough_policy || {};
  const patterns = policy.allowed_patterns || [];
  const valuePatterns = policy.allowed_value_patterns || {};
  for (let i = 0; i < argsToCheck.length; i += 1) {
    const arg = argsToCheck[i];
    const previous = i > 0 ? argsToCheck[i - 1] : undefined;
    const contextualPatterns = previous && Array.isArray(valuePatterns[previous]) ? valuePatterns[previous] : undefined;
    if (!pathAllowedByPolicy(policy, arg)) return false;
    if (contextualPatterns && argMatchesAny(contextualPatterns, arg)) continue;
    if (!argMatchesAny(patterns, arg)) return false;
  }
  return true;
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
let runtimeError = '';
let proc;
if (command.validation_profile === 'node-test-fixed-v1') {
  const preflight = validateNodeTestFixedRuntime(project, command);
  if (preflight.error) {
    runtimeError = preflight.error;
    proc = { status: 1, signal: null, stdout: '', stderr: `${runtimeError}\n` };
  } else {
    const preflightHead = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: preflight.root, encoding: 'utf8' }).trim();
    const childEnv = { ...process.env };
    delete childEnv.NODE_TEST_CONTEXT;
    proc = spawnSync(process.execPath, execArgs, { cwd: preflight.root, shell: false, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
    const postflight = validateNodeTestFixedRuntime(project, command);
    const postflightHead = postflight.error ? '' : execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: postflight.root, encoding: 'utf8' }).trim();
    if (postflight.error || postflight.root !== preflight.root || postflightHead !== preflightHead || !trackedSnapshotMatches(preflight.root, preflight.snapshot)) runtimeError = postflight.error || (postflight.root !== preflight.root ? 'POSTFLIGHT_ROOT_DRIFT' : (postflightHead !== preflightHead ? 'POSTFLIGHT_HEAD_DRIFT' : 'POSTFLIGHT_DRIFT'));
  }
} else {
  proc = spawnSync(command.bin, executedArgs, { cwd: pidexRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const endedAt = new Date().toISOString();
const passed = proc.status === 0 && !proc.signal && !proc.error && !runtimeError;
const evidence = {
  type: 'module_capability_evidence',
  module_id: entry.module.id,
  capability_id: entry.capability.id,
  agent,
  phase,
  project,
  scope: entry.capability.scope,
  status: passed ? 'passed' : 'failed',
  started_at: startedAt,
  ended_at: endedAt,
  exit_code: proc.status,
  signal: proc.signal,
  command: { bin: command.bin, args: command.args },
  executed_command: { bin: command.validation_profile === 'node-test-fixed-v1' ? process.execPath : command.bin, args: redactedExecutedArgs },
  passthrough_args: redactedPassthroughArgs,
  artifacts: [],
};
let evidenceError = '';
let file;
try {
  file = evidencePath(pidexRoot, project, entry.capability.scope);
  appendJsonLine(file, evidence);
} catch (error) {
  evidenceError = `EVIDENCE_WRITE_FAILED: ${error.message}`;
}
if (proc.stdout) process.stdout.write(proc.stdout);
if (proc.stderr) process.stderr.write(proc.stderr);
if (runtimeError) console.error(runtimeError);
if (evidenceError) console.error(evidenceError);
if (file && !evidenceError) console.error(`module capability evidence: ${file}`);
process.exit(passed && !evidenceError ? 0 : (proc.status && proc.status !== 0 ? proc.status : 1));
