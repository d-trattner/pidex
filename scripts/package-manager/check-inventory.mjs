import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CHECK_STAGES } from './run-check-stages.mjs';

// Read-only inventory, not a shell parser or an execution/approval mechanism.
// Reject new shell grammar instead of silently misreporting command boundaries.
export function checkInventory(scripts) {
  const result = [];
  for (const stage of CHECK_STAGES) {
    if (typeof scripts[stage] !== 'string' || !scripts[stage].trim()) throw new Error(`Missing stage: ${stage}`);
    for (const [index, command] of scripts[stage].split(' && ').entries()) {
      if (!/^(node|bash) [A-Za-z0-9_./* =:-]+$/.test(command)) throw new Error(`Unsupported command grammar: ${stage}:${index + 1}`);
      result.push({ ordinal: result.length + 1, stage, stageOrdinal: index + 1, command,
        kind: command.startsWith('bash ') ? 'shell' : 'node',
        // Wildcards and multi-file commands remain a single acceptance unit.
        approval: 'not-authorized-by-inventory' });
    }
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { scripts } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify({ schema: 'pidex-check-inventory-v1', execution: false, commands: checkInventory(scripts) }, null, 2));
}
