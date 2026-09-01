import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInspectArgs } from './inspect.mjs';

test('Angular inspector CLI accepts only project and output arguments', () => {
  assert.deepEqual(parseInspectArgs(['--project', '/workspace', '--json']), { project: '/workspace', json: true });
  assert.throws(() => parseInspectArgs(['--resolve-nx']), /unknown argument/);
  assert.throws(() => parseInspectArgs(['--command', 'rm -rf /']), /unknown argument/);
  assert.throws(() => parseInspectArgs(['--operation', 'build']), /unknown argument/);
});
