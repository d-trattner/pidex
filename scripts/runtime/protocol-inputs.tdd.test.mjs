import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { executionProtocolInputs } from '../../modules/pidex/analysis-metrics-history/lib/execution-protocol-inputs.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
for (const changed of executionProtocolInputs) test(`module-owned fingerprint rejects changes to ${changed}`, async t => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-protocol-inputs-'));
  t.after(() => fs.rmSync(copy, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'scripts/runtime'), path.join(copy, 'scripts/runtime'), { recursive: true });
  for (const name of ['extensions/pidex/index.ts', 'extensions/pidex/review-budget.ts', ...executionProtocolInputs]) {
    fs.mkdirSync(path.dirname(path.join(copy, name)), { recursive: true });
    fs.copyFileSync(path.join(root, name), path.join(copy, name));
  }
  const runtime = await import(pathToFileURL(path.join(copy, 'scripts/runtime/review-execution.mjs')).href);
  assert.match(runtime.EXECUTION_PROTOCOL_DIGEST, /^[a-f0-9]{64}$/);
  fs.appendFileSync(path.join(copy, changed), '\n// fixture drift\n');
  assert.throws(() => runtime.assertExecutionSupport(), { message: 'REVIEW_EXECUTION_SCOPE_CHANGED' });
});
