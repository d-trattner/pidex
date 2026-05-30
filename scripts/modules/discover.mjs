#!/usr/bin/env node
import path from 'node:path';
import { allCapabilities, capabilityAvailability, loadModuleSystem, parseArgs, runnerInvocation, scriptPidexRoot, validateProjectPath, validateSystem } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const pidexRoot = args['pidex-root'] ? path.resolve(String(args['pidex-root'])) : scriptPidexRoot(import.meta.url);
const agent = args.agent;
const phase = args.phase;
if (!agent || !phase) {
  console.error('--agent and --phase are required');
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
  console.log(JSON.stringify({ ok: false, pidex_root: pidexRoot, project, errors: validation.errors }, null, 2));
  process.exit(1);
}

function formatCapability(entry, requestedAgent, requestedPhase) {
  const availability = capabilityAvailability(system, entry, requestedAgent, requestedPhase);
  const base = {
    capability_id: entry.capability.id,
    module_id: entry.module.id,
    kind: entry.capability.kind,
    phases: entry.capability.phases,
    scope: entry.capability.scope,
    importance: entry.capability.importance,
    mutability: entry.capability.mutability,
    allowed_agents: entry.capability.allowed_agents,
    enabled: entry.moduleState.enabled,
    available: availability.available,
    reason: availability.reason,
    requirement_active: availability.requirement_active,
    platform: availability.platform,
    execute: runnerInvocation(entry.capability.id, requestedAgent, requestedPhase, project),
  };
  if (args.debug) base.command = entry.capability.command;
  return base;
}

const entries = allCapabilities(system);
let output;
if (agent === 'orchestrator') {
  const phases = [...new Set(entries.flatMap((entry) => entry.capability.phases))].sort();
  output = {
    ok: true,
    agent,
    phase,
    project,
    pidex_root: pidexRoot,
    current_phase: phase,
    pipeline_map: phases.map((itemPhase) => ({
      phase: itemPhase,
      status: itemPhase === phase ? 'current' : 'other',
      capabilities: entries
        .filter((entry) => entry.capability.phases.includes(itemPhase) && entry.capability.allowed_agents.includes(agent))
        .map((entry) => formatCapability(entry, agent, itemPhase)),
    })),
  };
} else {
  output = {
    ok: true,
    agent,
    phase,
    project,
    pidex_root: pidexRoot,
    capabilities: entries
      .filter((entry) => entry.capability.phases.includes(phase) && entry.capability.allowed_agents.includes(agent))
      .map((entry) => formatCapability(entry, agent, phase)),
  };
}

console.log(JSON.stringify(output, null, 2));
