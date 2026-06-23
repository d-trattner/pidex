import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildCredentialCopyOps, classifyCredentialSource, copyGitCredentials, copySelectedCredentials, resetCredentials, validateCredentialCommand } from './credentials.mjs';
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
  assert.equal(result.ops.some((op) => op[0] === 'cp' && String(op[2]).includes(':/tmp/pidex-credential-')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('--user') && op.includes('node') && String(op.at(-1)).includes('/pidex-secrets/git/.ssh/id_ed25519')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('--user') && op.includes('node') && String(op.at(-1)).includes('/pidex-secrets/git/.ssh/known_hosts')), true);
  assert.equal(result.inventory.length, 2);
  assert.equal(result.inventory[0].fingerprint.startsWith('sha256:'), true);
  assert.equal(JSON.stringify(result.inventory).includes('PRIVATE KEY'), false);
});

test('buildCredentialCopyOps supports Pi and provider allowlisted destinations', () => {
  const root = tmp();
  const piAuth = path.join(root, 'auth.json');
  const codexAuth = path.join(root, 'codex-auth.json');
  write(piAuth, '{"openai":"redacted"}');
  write(codexAuth, '{"tokens":"redacted"}');
  const record = createProjectRecord({ project_id: 'pp-creds-pi123', name: 'demo' });
  const result = buildCredentialCopyOps(record, [{ kind: 'pi-auth', source: piAuth }, { kind: 'codex-auth', source: codexAuth }]);
  assert.equal(result.ops.some((op) => op[0] === 'cp' && String(op[2]).includes(':/tmp/pidex-credential-')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('--user') && op.includes('node') && String(op.at(-1)).includes('/pidex-secrets/pi/agent/auth.json')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('--user') && op.includes('node') && String(op.at(-1)).includes('/pidex-secrets/providers/codex/auth.json')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('ln') && op.includes('/pidex-home/.pi/agent')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && String(op.at(-1)).includes('chmod 600') && String(op.at(-1)).includes('/pidex-secrets/pi/agent/auth.json')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && String(op.at(-1)).includes('chmod 600') && String(op.at(-1)).includes('/pidex-secrets/providers/codex/auth.json')), true);
  assert.equal(result.ops.some((op) => op.includes('777')), false);
  assert.deepEqual(result.inventory.map((item) => item.group), ['pi', 'providers']);
  assert.equal(JSON.stringify(result.inventory).includes('redacted'), false);
});

test('validateCredentialCommand constrains named copy commands to matching credential groups', () => {
  assert.throws(() => validateCredentialCommand({ command: 'copy-git', entries: [{ kind: 'pi-auth' }] }), /copy-git/);
  assert.throws(() => validateCredentialCommand({ command: 'copy-pi', entries: [{ kind: 'codex-auth' }] }), /copy-pi/);
  assert.throws(() => validateCredentialCommand({ command: 'copy-provider', entries: [{ kind: 'ssh-key' }] }), /copy-provider/);
  assert.equal(validateCredentialCommand({ command: 'copy-provider', entries: [{ kind: 'codex-auth' }] }).ok, true);
});

test('copySelectedCredentials updates pi and provider credential state', () => {
  const pidexRoot = tmp();
  const piAuth = path.join(tmp(), 'auth.json');
  const codexAuth = path.join(tmp(), 'auth.json');
  write(piAuth, '{"pi":"auth"}');
  write(codexAuth, '{"codex":"auth"}');
  const record = createProjectRecord({ project_id: 'pp-creds-picopy1', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(pidexRoot, record);
  const calls = [];
  const result = copySelectedCredentials({ pidexRoot, projectId: 'pp-creds-picopy1', command: 'copy', acknowledgeTrustedPersistentContainer: true, entries: [{ kind: 'pi-auth', source: piAuth }, { kind: 'codex-auth', source: codexAuth }], runner: (args) => { calls.push(args); return 'ok'; } });
  assert.equal(result.ok, true);
  assert.equal(calls.some((op) => op[0] === 'cp'), true);
  const loaded = loadProjectRecord(pidexRoot, 'pp-creds-picopy1');
  assert.equal(loaded.credentials.pi, 'configured');
  assert.deepEqual(loaded.credentials.providers, ['codex']);
});

test('copyGitCredentials updates registry and invokes docker ops', () => {
  const pidexRoot = tmp();
  const key = path.join(tmp(), 'id_ed25519');
  write(key, 'PRIVATE KEY');
  const record = createProjectRecord({ project_id: 'pp-creds-copy1', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(pidexRoot, record);
  const calls = [];
  assert.throws(() => copyGitCredentials({ pidexRoot, projectId: 'pp-creds-copy1', entries: [{ kind: 'ssh-key', source: key }], runner: (args) => { calls.push(args); return 'ok'; } }), /acknowledge/);
  const result = copyGitCredentials({ pidexRoot, projectId: 'pp-creds-copy1', acknowledgeTrustedPersistentContainer: true, entries: [{ kind: 'ssh-key', source: key }], runner: (args) => { calls.push(args); return 'ok'; } });
  assert.equal(result.ok, true);
  assert.equal(calls.some((op) => op[0] === 'cp'), true);
  const loaded = loadProjectRecord(pidexRoot, 'pp-creds-copy1');
  assert.equal(loaded.credentials.git, 'configured');
  assert.equal(loaded.credentials.inventory.length, 1);
});

test('credentials CLI status non-json prints without crashing', () => {
  const pidexRoot = tmp();
  const record = createProjectRecord({ project_id: 'pp-creds-cli01', name: 'demo' });
  record.status = 'ready';
  saveProjectRecord(pidexRoot, record);
  const proc = spawnSync(process.execPath, ['modules/pidex/project-pipeline/scripts/project-pipeline/credentials.mjs', 'status', '--pidex-root', pidexRoot, '--project-id', 'pp-creds-cli01'], { cwd: path.resolve('.'), encoding: 'utf8' });
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /pp-creds-cli01: git=missing/);
});

test('resetCredentials clears secrets volume and registry credential inventory', () => {
  const pidexRoot = tmp();
  const record = createProjectRecord({ project_id: 'pp-creds-reset1', name: 'demo' });
  record.status = 'ready';
  record.credentials = { git: 'configured', pi: 'configured', providers: ['x'], inventory: [{ kind: 'ssh-key' }] };
  saveProjectRecord(pidexRoot, record);
  const calls = [];
  const result = resetCredentials({ pidexRoot, projectId: 'pp-creds-reset1', runner: (args) => { calls.push(args); return 'ok'; } });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], ['exec', '--user', 'node', 'pidex-project-pp-creds-reset1', 'rm', '-rf', '/pidex-secrets/git', '/pidex-secrets/pi', '/pidex-secrets/providers']);
  const loaded = loadProjectRecord(pidexRoot, 'pp-creds-reset1');
  assert.equal(loaded.credentials.git, 'missing');
  assert.equal(loaded.credentials.inventory.length, 0);
});
