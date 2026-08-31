#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAngularVerification } from '../../lib/verification-contract.mjs';

export function parseVerifyArgs(argv = []) {
  const out = { json: false, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') out.project = argv[++i] || '';
    else if (arg === '--operation') out.operation = argv[++i] || '';
    else if (arg === '--project-name') out.projectName = argv[++i] || '';
    else if (arg === '--timeout-ms') out.timeoutMs = Number(argv[++i]);
    else if (arg === '--json') out.json = true;
    else if (arg === '--help') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: verify.mjs --project <absolute-path> --operation build|test|lint|affected|all [--project-name NAME] [--timeout-ms N] [--json]'; }

async function main(argv = process.argv.slice(2)) {
  try {
    const args = parseVerifyArgs(argv);
    if (args.help) { console.log(usage()); return 0; }
    if (!path.isAbsolute(args.project || '')) throw new Error('--project must be absolute');
    const result = await runAngularVerification(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.status}\t${result.results.map((item) => `${item.target}:${item.status}`).join(',')}`);
    return result.status === 'passed' ? 0 : 1;
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
