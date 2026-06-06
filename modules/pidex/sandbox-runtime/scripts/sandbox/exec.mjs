#!/usr/bin/env node
// fallow-ignore-file unused-file -- CLI entry point invoked by PIDEX sandbox runtime via runSandboxJson/agent rules.
import { parseRunArgs, runSandboxCommand } from './run-command.mjs';

try {
  const args = parseRunArgs(process.argv.slice(2));
  const result = runSandboxCommand(args);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(error.message || String(error));
  process.exit(2);
}
