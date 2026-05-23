#!/usr/bin/env node
// Manual PIDEX parallel lane test scaffold. Node implementation for cross-platform use.
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function rootFromScript() { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); }
function laneId(agent, provider, model) { return `${agent}:${provider}:${model}`; }
function parseArgs(argv) {
  const args = { root: rootFromScript(), lane: '', agent: '', provider: '', model: '', project: '', task: '', taskText: '', force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') args.root = path.resolve(argv[++i] || args.root);
    else if (a === '--lane') args.lane = argv[++i] || '';
    else if (a === '--agent') args.agent = argv[++i] || '';
    else if (a === '--provider') args.provider = argv[++i] || '';
    else if (a === '--model') args.model = argv[++i] || '';
    else if (a === '--project') args.project = argv[++i] || '';
    else if (a === '--task') args.task = argv[++i] || '';
    else if (a === '--task-text') args.taskText = argv[++i] || '';
    else if (a === '--force') args.force = true;
    else { console.error(`Unknown arg: ${a}`); process.exit(2); }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const lid = args.lane || laneId(args.agent || '', args.provider || '', args.model || '');
if (!lid || (lid.match(/:/g) || []).length < 2) {
  console.error('run-lane.mjs requires --lane or --agent/--provider/--model');
  process.exit(2);
}
if (!args.project) {
  console.error('run-lane.mjs requires --project');
  process.exit(2);
}
const msg = 'manual lane runner scaffold: provider invocation is not enabled yet; status path validated';
spawnSync(process.execPath, [path.join(args.root, 'scripts', 'parallel-agents', 'status.mjs'), '--root', args.root, 'warn', '--lane', lid, '--type', 'tooling-error', '--message', msg, '--no-telegram'], { cwd: args.root, encoding: 'utf8' });
console.log(msg);
process.exit(1);
