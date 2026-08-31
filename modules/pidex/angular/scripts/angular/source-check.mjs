#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAngularSourceLock } from '../../lib/source-lock.mjs';

export function main(argv = process.argv.slice(2)) {
  try {
    const allowed = new Set(['--json', '--help']);
    for (const arg of argv) if (!allowed.has(arg)) throw new Error(`unknown argument: ${arg}`);
    if (argv.includes('--help')) { console.log('Usage: source-check.mjs [--json]'); return 0; }
    const result = verifyAngularSourceLock();
    console.log(argv.includes('--json') ? JSON.stringify(result, null, 2) : `${result.status}\t${result.members}\t${result.aggregate_sha256}`);
    return 0;
  } catch (error) {
    console.error(error.message || String(error));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
