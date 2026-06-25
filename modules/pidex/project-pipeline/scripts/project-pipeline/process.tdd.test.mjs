import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import http from 'node:http';
import { createProcessManager, redactPreviewLog, validateManagedStateRoot, validateProcessName } from './process.mjs';

function tmpDir(prefix) { return mkdtempSync(path.join(os.tmpdir(), prefix)); }
function portsBase() { return 45000 + Math.floor(Math.random() * 10000); }
function managerFixture() {
  const root = tmpDir('pidex-process-root-');
  const stateRoot = path.join(root, 'cache', 'pidex-preview');
  const workspace = path.join(root, 'workspace');
  mkdirSync(stateRoot, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  return { root, stateRoot, workspace, manager: createProcessManager({ stateRoot, workspace, readinessTimeoutMs: 2500, stopTimeoutMs: 1000 }) };
}

function serverCommand(port, extra = '') {
  return [process.execPath, '-e', `const http=require('http');${extra};const server=http.createServer((req,res)=>res.end('ok'));server.listen(process.env.PORT,'0.0.0.0');setInterval(()=>{},1000);`];
}

test('validateProcessName allows only preview and rejects traversal/metacharacters', () => {
  assert.equal(validateProcessName('preview'), 'preview');
  for (const name of ['../preview', 'preview;rm -rf /', 'storybook', 'preview/child']) {
    assert.throws(() => validateProcessName(name), /unsupported preview process name/);
  }
});

test('validateManagedStateRoot rejects state roots inside workspace and symlink escapes', () => {
  const root = tmpDir('pidex-process-path-');
  const workspace = path.join(root, 'workspace');
  const cache = path.join(root, 'cache');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(cache, { recursive: true });
  assert.equal(validateManagedStateRoot({ stateRoot: cache, workspace }), cache);
  assert.throws(() => validateManagedStateRoot({ stateRoot: path.join(workspace, 'state'), workspace }), /state root must stay outside workspace/);
  const outside = tmpDir('pidex-process-outside-');
  const link = path.join(root, 'link-cache');
  symlinkSync(outside, link);
  assert.throws(() => validateManagedStateRoot({ stateRoot: link, workspace }), /state root symlink escape rejected/);
});

test('createProcessManager starts preview in workspace, records status/logs, then stops and frees port', async () => {
  const { manager, workspace } = managerFixture();
  const port = portsBase();
  const result = await manager.start({ projectId: 'pp-demo-proc1', processName: 'preview', command: serverCommand(port, "console.log('TOKEN=abc123 secret=/pidex-secrets/auth.json')"), containerPort: port, env: { PORT: String(port) } });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'running');
  assert.equal(result.cwd, workspace);
  const status = await manager.status({ processName: 'preview', containerPort: port });
  assert.equal(status.status, 'running');
  const logs = await manager.logs({ processName: 'preview', maxBytes: 4096 });
  assert.match(logs.text, /TOKEN=<redacted>/);
  assert.doesNotMatch(logs.text, /abc123|pidex-secrets|auth\.json/);
  const stopped = await manager.stop({ processName: 'preview', containerPort: port });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.status, 'stopped');
  const stoppedStatus = await manager.status({ processName: 'preview', containerPort: port });
  assert.notEqual(stoppedStatus.status, 'running');
});

test('createProcessManager fails and cleans up when process exits early or never listens', async () => {
  const { manager } = managerFixture();
  const port = portsBase();
  const early = await manager.start({ processName: 'preview', command: [process.execPath, '-e', "console.error('boom');process.exit(7)"], containerPort: port, env: { PORT: String(port) }, readinessTimeoutMs: 700 });
  assert.equal(early.ok, false);
  assert.equal(early.error_category, 'preview_process_exited');
  const notListening = await manager.start({ processName: 'preview', command: [process.execPath, '-e', 'setInterval(()=>{},1000)'], containerPort: port + 1, env: { PORT: String(port + 1) }, readinessTimeoutMs: 700 });
  assert.equal(notListening.ok, false);
  assert.equal(notListening.error_category, 'preview_port_not_listening');
});

test('stop returns stopped when managed process exits but assigned port remains externally reserved', async () => {
  const { manager, stateRoot } = managerFixture();
  const port = portsBase();
  const reserver = http.createServer((req, res) => res.end('reserved'));
  await new Promise((resolve) => reserver.listen(port, '127.0.0.1', resolve));
  const sleeper = await import('node:child_process').then(({ spawn }) => spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' }));
  sleeper.unref();
  const dir = path.join(stateRoot, 'preview');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ pid: sleeper.pid, owner_token: `pidex-preview:${realpathSync(stateRoot)}:preview`, status: 'running', port, command_label: 'managed sleeper' }));
  try {
    const stopped = await manager.stop({ processName: 'preview', containerPort: port, stopTimeoutMs: 500 });
    assert.equal(stopped.ok, true);
    assert.equal(stopped.status, 'stopped');
    const stoppedStatus = await manager.status({ processName: 'preview', containerPort: port });
    assert.equal(stoppedStatus.status, 'stopped');
  } finally {
    await new Promise((resolve) => reserver.close(resolve));
  }
});

test('stop returns stopped when managed PID remains observable but assigned app port is no longer listening', async () => {
  const { stateRoot, workspace } = managerFixture();
  const port = portsBase();
  const sleeper = await import('node:child_process').then(({ spawn }) => spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' }));
  sleeper.unref();
  const manager = createProcessManager({
    stateRoot,
    workspace,
    stopTimeoutMs: 25,
    processControl: {
      isProcessAlive: (pid) => pid === sleeper.pid,
      killProcessGroup: () => true,
      isPortListening: async () => false,
    },
  });
  const dir = path.join(stateRoot, 'preview');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ pid: sleeper.pid, owner_token: `pidex-preview:${realpathSync(stateRoot)}:preview`, status: 'running', port, command_label: 'managed sleeper' }));
  try {
    const stopped = await manager.stop({ processName: 'preview', containerPort: port, stopTimeoutMs: 25 });
    assert.equal(stopped.ok, true);
    assert.equal(stopped.status, 'stopped');
    assert.doesNotThrow(() => process.kill(sleeper.pid, 0));
  } finally {
    process.kill(-sleeper.pid, 'SIGKILL');
  }
});

test('stop refuses stale PID marker and does not kill unrelated process', async () => {
  const { manager, stateRoot } = managerFixture();
  const sleeper = await import('node:child_process').then(({ spawn }) => spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' }));
  sleeper.unref();
  const dir = path.join(stateRoot, 'preview');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ pid: sleeper.pid, owner_token: 'wrong-token', status: 'running', port: portsBase(), command_label: 'unrelated' }));
  const stopped = await manager.stop({ processName: 'preview', containerPort: portsBase() });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.error_category, 'preview_stale_pid_owner_mismatch');
  assert.doesNotThrow(() => process.kill(sleeper.pid, 0));
  process.kill(-sleeper.pid, 'SIGKILL');
});

test('redactPreviewLog bounds and redacts secret-like output', () => {
  const text = redactPreviewLog('token=abc password=hunter2 /pidex-secrets/auth.json\n'.repeat(200), { maxBytes: 200 });
  assert.ok(text.length <= 220);
  assert.match(text, /token=<redacted>/i);
  assert.doesNotMatch(text, /hunter2|pidex-secrets|auth\.json/);
});
