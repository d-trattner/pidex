#!/usr/bin/env node
import path from 'node:path';
import { loadModuleSystem, parseArgs, scriptPidexRoot, validateProjectPath, validateSystem } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
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
const output = { ok: validation.ok, pidex_root: pidexRoot, project, errors: validation.errors };
console.log(JSON.stringify(output, null, 2));
process.exit(validation.ok ? 0 : 1);
