import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readBoundedProjectJson, resolveAngularProjectRoot } from './project-root.mjs';

test('project root and bounded JSON reject links, traversal, malformed and oversized data', () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'pidex-angular-root-'));
  const root = path.join(parent, 'project'); mkdirSync(root);
  writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  assert.equal(readBoundedProjectJson(root, 'package.json').name, 'fixture');
  assert.equal(resolveAngularProjectRoot(root).physical, root);
  assert.throws(() => readBoundedProjectJson(root, '../outside.json'), /PATH_INVALID/);
  writeFileSync(path.join(root, 'bad.json'), '{');
  assert.throws(() => readBoundedProjectJson(root, 'bad.json'), /JSON_INVALID/);
  writeFileSync(path.join(root, 'large.json'), 'x'.repeat(20));
  assert.throws(() => readBoundedProjectJson(root, 'large.json', { maxBytes: 10 }), /FILE_INVALID/);
  symlinkSync(path.join(root, 'package.json'), path.join(root, 'linked.json'));
  assert.throws(() => readBoundedProjectJson(root, 'linked.json'), /FILE_LINK/);
  symlinkSync(root, path.join(parent, 'root-link'), 'dir');
  assert.throws(() => resolveAngularProjectRoot(path.join(parent, 'root-link')), /ROOT_INVALID/);
  rmSync(parent, { recursive: true, force: true });
});
