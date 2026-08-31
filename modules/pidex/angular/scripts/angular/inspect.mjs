#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectAngularWorkspace } from '../../lib/workspace-inspector.mjs';

export function parseInspectArgs(argv = []) {
  const out = { json: false, resolveNx: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--json') out.json = true;
    else if (arg === '--resolve-nx') out.resolveNx = true;
    else if (arg === '--help') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: inspect.mjs --project <absolute-path> [--resolve-nx] [--json]'; }

function main(argv = process.argv.slice(2)) {
  try {
    const args = parseInspectArgs(argv);
    if (args.help) { console.log(usage()); return 0; }
    if (!path.isAbsolute(args.project || '')) throw new Error('--project must be absolute');
    const result = inspectAngularWorkspace(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.status}\tangular=${result.angular.version || 'none'}\tnx=${result.nx.version || 'none'}\tmaterial=${result.material.material_version || 'none'}`);
    return result.status === 'malformed_or_missing_package' ? 1 : 0;
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
