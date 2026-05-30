#!/usr/bin/env node
import { loadModuleSystem, moduleEnabled, parseArgs, scriptPidexRoot, validateSystem } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const pidexRoot = args['pidex-root'] ? String(args['pidex-root']) : scriptPidexRoot(import.meta.url);
const system = loadModuleSystem(pidexRoot);
const validation = validateSystem(system);
const modules = system.modules.map(({ file, manifest }) => {
  const state = moduleEnabled(system, manifest);
  return {
    id: manifest.id,
    name: manifest.name,
    kind: manifest.kind,
    enabled: state.enabled,
    locked: state.locked,
    source: state.source,
    dependencies: manifest.dependencies || [],
    capability_count: (manifest.capabilities || []).length,
    manifest_path: file.replace(`${pidexRoot}/`, ''),
  };
});

const output = { ok: validation.ok, pidex_root: pidexRoot, modules, errors: validation.errors };
console.log(JSON.stringify(output, null, 2));
process.exit(validation.ok ? 0 : 1);
