#!/usr/bin/env node
// fallow-ignore-file unused-file -- CLI entry point invoked by PIDEX sandbox runtime via runSandboxJson/agent rules.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveContained, safeRunId } from './policy.mjs';

function parse(argv) {
  const out = { pidexRoot: process.cwd(), runId: '', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pidex-root') out.pidexRoot = argv[++i] || '';
    else if (argv[i] === '--run-id') out.runId = argv[++i] || '';
    else if (argv[i] === '--json') out.json = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}
try {
  const args = parse(process.argv.slice(2));
  let runId;
  try {
    runId = safeRunId(args.runId);
  } catch (error) {
    const result = { ok: false, reason: 'invalid-run-id', run_id: args.runId, error: error?.message || String(error) };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  const runsRoot = path.resolve(args.pidexRoot, 'state', 'sandbox', 'runs');
  const runRoot = resolveContained(runsRoot, runId);
  const metadata = resolveContained(runRoot, 'metadata.json');
  const result = existsSync(metadata) ? JSON.parse(readFileSync(metadata, 'utf8')) : { ok: false, reason: 'sandbox-run-not-found', run_id: runId };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok === false ? 1 : 0);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(2);
}
