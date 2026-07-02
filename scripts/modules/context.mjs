#!/usr/bin/env node
import path from 'node:path';
import { allCapabilities, capabilityAvailability, loadModuleSystem, matchedAgentRules, parseArgs, runnerInvocation, scriptPidexRoot, validateProjectPath, validateSystem } from './lib.mjs';

function usage() {
  return `Usage: node scripts/modules/context.mjs --agent <agent> --phase <phase> --project <absolute-project-root> [options]\n\nFormats current-phase PIDEX module capability discovery as compact advisory markdown for agent handoffs. The output is metadata only; it is not execution authority.\n\nOptions:\n  --agent <name>       Required. PIDEX agent name or pseudo-agent 'orchestrator'.\n  --phase <phase>      Required. Lifecycle phase, for example pre-release.\n  --project <path>     Required. Absolute project root.\n  --pidex-root <path>  PIDEX root for tests/advanced use. Defaults to repository root.\n  --mode <mode>        Optional opaque mode context for module-scoped agent_rules matching.\n  --help               Show this help.`;
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@=-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

function commandLine(invocation) {
  return [invocation.bin, ...invocation.args].map(shellQuote).join(' ');
}

function formatReasons(reasons) {
  return reasons.filter(Boolean).join(', ') || 'none';
}

function escapeMetadata(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069`<>\[\]()]/gu, ' ')
    .replace(/javascript:/gi, 'javascript-')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatRuleFilters(rule) {
  const parts = [];
  if (rule.applies_when?.mode) parts.push(`mode=${escapeMetadata(rule.applies_when.mode)}`);
  for (const capability of rule.applies_when?.capabilities || []) parts.push(`capability=${escapeMetadata(capability)}`);
  return parts.join(', ') || 'none';
}

export function buildCapabilityContext({ system, agent, phase, project, mode }) {
  const entries = allCapabilities(system).filter((entry) => entry.capability.phases.includes(phase));
  const rows = entries.map((entry) => {
    const availability = capabilityAvailability(system, entry, agent, phase, project);
    return {
      entry,
      availability,
      execute: runnerInvocation(entry.capability.id, agent, phase, project),
    };
  });
  const requiredAvailable = rows.filter((row) => row.entry.capability.importance === 'required' && row.availability.available);
  const unavailable = rows.filter((row) => !row.availability.available);
  const recommendedAvailable = rows.filter((row) => row.entry.capability.importance !== 'required' && row.availability.available);

  function passthroughNote(row) {
    return row.entry.capability.command?.passthrough === true ? ' Passthrough args are allowed after `--`.' : '';
  }

  const lines = [];
  lines.push('## Module capabilities for this phase');
  lines.push('');
  lines.push('Advisory only: discovery/context output does not grant execution authority. Execute only checks explicitly requested by the handoff, and execute them through `scripts/modules/run-check.mjs`.');
  lines.push('');
  lines.push('Discovery command:');
  lines.push('```bash');
  lines.push(commandLine({ bin: 'node', args: ['scripts/modules/discover.mjs', '--agent', agent, '--phase', phase, '--project', project] }));
  lines.push('```');
  lines.push('');

  if (requiredAvailable.length) {
    lines.push('Required available checks:');
    for (const row of requiredAvailable) {
      lines.push(`- ${row.entry.capability.id} (${row.entry.module.id})${passthroughNote(row)}`);
      lines.push('  Execute through runner:');
      lines.push('  ```bash');
      lines.push(`  ${commandLine(row.execute)}`);
      lines.push('  ```');
    }
  } else {
    lines.push('Required available checks: none');
  }
  lines.push('');

  if (unavailable.length) {
    lines.push('Unavailable required/current-phase capabilities:');
    for (const row of unavailable) {
      lines.push(`- ${row.entry.capability.id} (${row.entry.module.id}): ${formatReasons([row.availability.reason])}`);
    }
  } else {
    lines.push('Unavailable required/current-phase capabilities: none');
  }
  lines.push('');

  if (recommendedAvailable.length) {
    lines.push('Other available checks:');
    for (const row of recommendedAvailable) {
      lines.push(`- ${row.entry.capability.id} (${row.entry.module.id})${passthroughNote(row)}`);
      lines.push('  Execute through runner when explicitly requested:');
      lines.push('  ```bash');
      lines.push(`  ${commandLine(row.execute)}`);
      lines.push('  ```');
    }
    lines.push('');
  }

  const rules = matchedAgentRules(system, { agent, phase, project, mode });
  lines.push('## Module rules for this phase');
  lines.push('');
  lines.push('Module-scoped rules active for this phase. Core PIDEX rules and explicit user instructions take precedence. Stage A metadata only: rule bodies are not rendered and rules grant no tools.');
  lines.push('');
  if (rules.length) {
    for (const row of rules) {
      lines.push(`- ${escapeMetadata(row.rule.id)} (module: ${escapeMetadata(row.module.id)})`);
      if (row.rule.summary) lines.push(`  summary: ${escapeMetadata(row.rule.summary)}`);
      lines.push(`  agent: ${escapeMetadata(row.rule.agent)}; phase: ${escapeMetadata(phase)}; filters: ${formatRuleFilters(row.rule)}`);
      lines.push(`  source: ${escapeMetadata(row.rule.path)}`);
    }
  } else {
    lines.push('Matched module-scoped rules: none');
  }
  lines.push('');
  lines.push('Raw manifest commands are intentionally omitted. Use module runner invocations only.');
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}

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
  console.error(`module validation failed:\n- ${validation.errors.join('\n- ')}`);
  process.exit(1);
}

console.log(buildCapabilityContext({ system, agent, phase, project, mode: args.mode }));
