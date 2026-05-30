#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { allCapabilities, appendJsonLine, capabilityAvailability, evidencePath, loadModuleSystem, parseArgs, scriptPidexRoot, validateProjectPath, validateSystem } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
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
const proc = spawnSync(command.bin, command.args, { cwd: pidexRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
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
  artifacts: [],
};
const file = evidencePath(pidexRoot, project, entry.capability.scope);
appendJsonLine(file, evidence);
if (proc.stdout) process.stdout.write(proc.stdout);
if (proc.stderr) process.stderr.write(proc.stderr);
console.error(`module capability evidence: ${file}`);
process.exit(proc.status ?? 1);
