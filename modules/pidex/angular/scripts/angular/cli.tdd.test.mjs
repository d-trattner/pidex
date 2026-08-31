import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInspectArgs } from './inspect.mjs';
import { parseVerifyArgs } from './verify.mjs';

test('Angular capability CLIs accept only bounded structured arguments', () => {
  assert.deepEqual(parseInspectArgs(['--project', '/workspace', '--resolve-nx', '--json']), { project: '/workspace', resolveNx: true, json: true });
  assert.deepEqual(parseVerifyArgs(['--project', '/workspace', '--operation', 'affected', '--project-name', 'web-app', '--timeout-ms', '5000', '--json']), { project: '/workspace', operation: 'affected', projectName: 'web-app', timeoutMs: 5000, json: true });
  assert.throws(() => parseInspectArgs(['--command', 'rm -rf /']), /unknown argument/);
  assert.throws(() => parseVerifyArgs(['--', 'sh', '-c']), /unknown argument/);
});
