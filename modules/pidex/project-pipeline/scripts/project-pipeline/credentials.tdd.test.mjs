import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCredentialCopyOps, classifyCredentialSource, copyGitCredentials } from './credentials.mjs';
import { createProjectRecord, loadProjectRecord, saveProjectRecord } from './registry.mjs';

function tmp() { return mkdtempSync(path.join(os.tmpdir(), 'pidex-project-creds-')); }
function write(file, text) { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }

test('classifyCredentialSource rejects directories, symlinks missing and disallowed ssh config', () => {
  const root = tmp();
  const key = path.join(root, 'id_ed25519');
  write(key, 'PRIVATE KEY');
  assert.equal(classifyCredentialSource(key).ok, true);
  assert.equal(classifyCredentialSource(path.join(root, 'missing')).reason, 'not-found');
  mkdirSync(path.join(root, '.ssh'));
  assert.equal(classifyCredentialSource(path.join(root, '.ssh')).reason, 'directory-rejected');
  const sshConfig = path.join(root, '.ssh/config');
  write(sshConfig, 'Host *');
  assert.equal(classifyCredentialSource(sshConfig).reason, 'ssh-config-rejected');
});

test('buildCredentialCopyOps copies selected files into /pidex-secrets and records redacted inventory', () => {
  const root = tmp();
  const key = path.join(root, 'id_ed25519');
  const known = path.join(root, 'known_hosts');
  write(key, 'PRIVATE KEY');
  write(known, 'github.com ssh-ed25519 AAAA');
  const record = createProjectRecord({ project_id: 'pp-creds-abc123', name: 'demo' });
  const result = buildCredentialCopyOps(record, [{ kind: 'ssh-key', source: key }, { kind: 'known-hosts', source: known }]);
  assert.equal(result.ops.some((op) => op[0] === 'cp' && String(op[2]).endsWith(':/pidex-secrets/git/.ssh/id_ed25519')), true);
  assert.equal(result.ops.some((op) => op[0] === 'cp' && String(op[2]).endsWith(':/pidex-secrets/git/.ssh/known_hosts')), true);
  assert.equal(result.inventory.length, 2);
  assert.equal(result.inventory[0].fingerprint.startsWith('sha256:'), true);
  assert.equal(JSON.stringify(result.inventory).includes('PRIVATE KEY'), false);
});

test('copyGitCredentials updates registry and invokes docker ops', () => {
  const pidexRoot = tmp();
  const key = path.join(tmp(), 'id_ed25519');
  write(key, 'PRIVATE KEY');
  const record = createProjectRecord({ project_id: 'pp-creds-copy1', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(pidexRoot, record);
  const calls = [];
  const result = copyGitCredentials({ pidexRoot, projectId: 'pp-creds-copy1', entries: [{ kind: 'ssh-key', source: key }], runner: (args) => { calls.push(args); return 'ok'; } });
  assert.equal(result.ok, true);
  assert.equal(calls.some((op) => op[0] === 'cp'), true);
  const loaded = loadProjectRecord(pidexRoot, 'pp-creds-copy1');
  assert.equal(loaded.credentials.git, 'configured');
  assert.equal(loaded.credentials.inventory.length, 1);
});
