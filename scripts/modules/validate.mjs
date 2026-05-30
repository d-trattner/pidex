#!/usr/bin/env node
import path from 'node:path';
import { loadModuleSystem, parseArgs, scriptPidexRoot, validateProjectPath, validateProtectedContexts, validateSystem } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`Usage: node scripts/modules/validate.mjs --project <absolute-project-root> [--pidex-root <path>]\n\nValidates PIDEX module manifests and install-level module config.\n\nOptions:\n  --project <path>     Required. Absolute project root used for protected-context checks.\n  --pidex-root <path>  PIDEX root for tests/advanced use. Defaults to repository root.\n  --help               Show this help.`);
  process.exit(0);
}
const pidexRoot = args['pidex-root'] ? path.resolve(String(args['pidex-root'])) : scriptPidexRoot(import.meta.url);
let project;
try {
  project = validateProjectPath(args.project);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const system = loadModuleSystem(pidexRoot);
const validation = validateSystem(system);
const errors = [...validation.errors, ...validateProtectedContexts(system, project)];
const output = { ok: errors.length === 0, pidex_root: pidexRoot, project, errors };
console.log(JSON.stringify(output, null, 2));
process.exit(output.ok ? 0 : 1);
