import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { buildCredentialCopyOps, classifyCredentialSource, copyGitCredentials, copySelectedCredentials, resetCredentials, sanitizePiSettingsContent, validateCredentialCommand } from './credentials.mjs';
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
  assert.equal(result.ops.some((op) => op[0] === 'cp'), false);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('chmod') && op.includes('700') && op.includes('/pidex-secrets/git/.ssh')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec-input' && op[1] === key && op.includes('-i') && op.includes('--user') && op.includes('node') && op.includes('/pidex-secrets/git/.ssh/id_ed25519') && op.includes('600')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec-input' && op[1] === known && op.includes('-i') && op.includes('--user') && op.includes('node') && op.includes('/pidex-secrets/git/.ssh/known_hosts') && op.includes('644')), true);
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
  assert.equal(result.ops.some((op) => op[0] === 'cp'), false);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('chmod') && op.includes('700') && op.includes('/pidex-secrets/pi/agent')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec-input' && op[1] === piAuth && op.includes('-i') && op.includes('--user') && op.includes('node') && op.includes('/pidex-secrets/pi/agent/auth.json') && op.includes('600')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec-input' && op[1] === codexAuth && op.includes('-i') && op.includes('--user') && op.includes('node') && op.includes('/pidex-secrets/providers/codex/auth.json') && op.includes('600')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('ln') && op.includes('/pidex-home/.pi/agent')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec-input' && op.includes('/pidex-secrets/pi/agent/auth.json') && op.includes('600')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec-input' && op.includes('/pidex-secrets/providers/codex/auth.json') && op.includes('600')), true);
  assert.equal(result.ops.some((op) => op.includes('777')), false);
  assert.deepEqual(result.inventory.map((item) => item.group), ['pi', 'providers']);
  assert.equal(JSON.stringify(result.inventory).includes('redacted'), false);
});

test('sanitizePiSettingsContent strips host-local packages for container Pi startup', () => {
  const sanitized = sanitizePiSettingsContent(JSON.stringify({ packages: ['/host/pi-web-access'], packageSettings: { x: true }, defaultProvider: 'openai-codex', theme: 'dark' }));
  const parsed = JSON.parse(sanitized);
  assert.deepEqual(parsed.packages, []);
  assert.equal('packageSettings' in parsed, false);
  assert.equal(parsed.defaultProvider, 'openai-codex');
  assert.equal(parsed.theme, 'dark');
});

test('buildCredentialCopyOps sanitizes pi-settings before copy', () => {
  const root = tmp();
  const piSettings = path.join(root, 'settings.json');
  write(piSettings, JSON.stringify({ packages: ['/host/pi-web-access'], defaultProvider: 'openai-codex' }));
  const record = createProjectRecord({ project_id: 'pp-creds-settings1', name: 'demo' });
  const result = buildCredentialCopyOps(record, [{ kind: 'pi-settings', source: piSettings }]);
  const op = result.ops.find((item) => item[0] === 'exec-input');
  assert.equal(op[1].source, piSettings);
  assert.deepEqual(JSON.parse(op[1].input).packages, []);
  assert.equal(op.includes('/pidex-secrets/pi/agent/settings.json'), true);
});

test('buildCredentialCopyOps passes hostile destination filenames as positional shell args', () => {
  const root = tmp();
  const hostile = path.join(root, 'id_$(touch pwn)`echo bad` "quoted" key');
  write(hostile, 'PRIVATE KEY');
  const record = createProjectRecord({ project_id: 'pp-creds-hostile1', name: 'demo' });
  const result = buildCredentialCopyOps(record, [{ kind: 'ssh-key', source: hostile }]);
  const op = result.ops.find((item) => item[0] === 'exec-input');
  assert.ok(op, 'expected exec-input operation');
  assert.equal(op[1], hostile);
  assert.equal(op.includes('cat > "$1" && chmod "$2" "$1"'), true);
  assert.equal(op.at(-2), '/pidex-secrets/git/.ssh/id_$(touch pwn)`echo bad` "quoted" key');
  assert.equal(op.at(-1), '600');
  assert.equal(JSON.stringify(op).includes('cat > "/pidex-secrets/git/.ssh/id_'), false);
  assert.equal(JSON.stringify(op).includes('$(touch pwn)`echo bad`'), true, 'hostile filename is data argument only');
});

test('buildCredentialCopyOps supports HTTPS git credential store file', () => {
  const root = tmp();
  const gitCreds = path.join(root, 'github.git-credentials');
  write(gitCreds, 'https://user:token@github.com\n');
  const record = createProjectRecord({ project_id: 'pp-creds-gcm123', name: 'demo' });
  const result = buildCredentialCopyOps(record, [{ kind: 'git-credentials', source: gitCreds }]);
  assert.equal(result.ops.some((op) => op[0] === 'exec-input' && op[1] === gitCreds && op.includes('/pidex-secrets/git/.git-credentials') && op.includes('600')), true);
  assert.equal(result.ops.some((op) => op[0] === 'exec' && op.includes('git') && op.includes('credential.helper') && op.includes('store --file=/pidex-secrets/git/.git-credentials')), true);
  assert.equal(result.inventory[0].kind, 'git-credentials');
  assert.equal(JSON.stringify(result.inventory).includes('token'), false);
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
  assert.equal(calls.some((op) => op[0] === 'exec-input'), true);
  assert.equal(calls.some((op) => op[0] === 'cp'), false);
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
  assert.equal(calls.some((op) => op[0] === 'exec-input'), true);
  assert.equal(calls.some((op) => op[0] === 'cp'), false);
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
