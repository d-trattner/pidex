#!/usr/bin/env node
import path from 'node:path';
import { VALID_PHASES, knownAgents, loadModuleSystem, parseArgs, renderMatchedAgentRules, scriptPidexRoot, validateProjectPath, validateSystem } from './lib.mjs';

function usage() {
  return `Usage: node scripts/modules/render-rules.mjs --agent <agent> --phase <phase> --project <absolute-project-root> --mode <mode> [options]\n\nRenders matched module-scoped agent_rules with provenance wrappers. This is a rendering helper only; it does not inject prompts or grant tools.\n\nOptions:\n  --agent <name>       Required. PIDEX specialist agent name.\n  --phase <phase>      Required. Lifecycle phase.\n  --project <path>     Required. Absolute project root.\n  --mode <mode>        Required explicit opaque mode context.\n  --pidex-root <path>  PIDEX root for tests/advanced use. Defaults to repository root.\n  --max-bytes <n>      Aggregate rendered output cap. Default 65536.\n  --help               Show this help.`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const pidexRoot = args['pidex-root'] ? path.resolve(String(args['pidex-root'])) : scriptPidexRoot(import.meta.url);
const agent = args.agent;
const phase = args.phase;
const mode = args.mode;
if (!agent || !phase || !mode) {
  console.error('--agent, --phase, and --mode are required');
  console.error(usage());
  process.exit(2);
}
let project;
try {
  project = validateProjectPath(args.project);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
let maxBytes = 64 * 1024;
if (args['max-bytes'] !== undefined) {
  maxBytes = Number(args['max-bytes']);
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > 1024 * 1024) {
    console.error('--max-bytes must be an integer between 1024 and 1048576');
    process.exit(2);
  }
}

const system = loadModuleSystem(pidexRoot);
if (!knownAgents(pidexRoot).has(agent)) {
  console.error(`unknown agent: ${agent}`);
  process.exit(2);
}
if (!VALID_PHASES.has(phase)) {
  console.error(`unknown phase: ${phase}`);
  process.exit(2);
}
const validation = validateSystem(system);
if (!validation.ok) {
  console.error(`module validation failed:\n- ${validation.errors.join('\n- ')}`);
  process.exit(1);
}

console.log(renderMatchedAgentRules(system, { agent, phase, project, mode }, { maxBytes }));
