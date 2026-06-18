import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloneArgs, cloneProject, validateGitUrl } from './clone.mjs';
import { createProjectRecord, loadProjectRecord, saveProjectRecord } from './registry.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-clone-')); }

test('validateGitUrl accepts https/ssh git urls and rejects shell-ish input', () => {
  assert.equal(validateGitUrl('https://github.com/a/b.git').ok, true);
  assert.equal(validateGitUrl('git@github.com:a/b.git').ok, true);
  assert.equal(validateGitUrl('https://github.com/a/b').ok, false);
  assert.equal(validateGitUrl('git@github.com:a/b.git; rm -rf /').ok, false);
});

test('cloneArgs runs git clone inside workspace with quoted url and branch', () => {
  const record = createProjectRecord({ project_id: 'pp-clone-abc123', name: 'demo' });
  const args = cloneArgs(record, 'git@github.com:a/b.git', 'main');
  assert.deepEqual(args.slice(0, 6), ['exec', '--workdir', '/', 'pidex-project-pp-clone-abc123', 'bash', '-lc']);
  assert.match(args[6], /git clone --branch 'main' 'git@github.com:a\/b.git' \/workspace/);
});

test('cloneProject updates registry and invokes docker runner', () => {
  const root = tmp();
  const record = createProjectRecord({ project_id: 'pp-clone-def456', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(root, record);
  const calls = [];
  const result = cloneProject({ pidexRoot: root, projectId: 'pp-clone-def456', url: 'https://github.com/a/b.git', branch: 'main', runner: (args) => { calls.push(args); return 'ok'; } });
  assert.equal(result.ok, true);
  assert.equal(calls[0][0], 'exec');
  const loaded = loadProjectRecord(root, 'pp-clone-def456');
  assert.equal(loaded.source.kind, 'git-url');
  assert.equal(loaded.source.ref, 'https://github.com/a/b.git');
  assert.equal(loaded.source.branch, 'main');
});
