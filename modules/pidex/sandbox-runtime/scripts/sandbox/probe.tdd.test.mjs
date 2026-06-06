import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyOs, parseArgs, runProbe } from './probe.mjs';

function proc(status = 0, stdout = '', stderr = '') {
  return { status, stdout, stderr };
}

function fakeRunner({ failStep } = {}) {
  const calls = [];
  const runner = (bin, args) => {
    calls.push([bin, args]);
    if (bin === 'command' && args.includes('docker')) return failStep === 'docker-cli' ? proc(1, '', '') : proc(0, '/usr/bin/docker\n', '');
    if (bin === 'where' && args.includes('docker')) return failStep === 'docker-cli' ? proc(1, '', '') : proc(0, 'C:\\Docker\\docker.exe\n', '');
    if (bin !== 'docker') return proc(127, '', 'not found');
    if (args[0] === 'info') return failStep === 'docker-daemon' ? proc(1, '', 'Cannot connect to the Docker daemon') : proc(0, '"25.0.0"\n', '');
    if (args[0] === 'run' && args.includes('uname')) return failStep === 'linux-container' ? proc(1, '', 'image operating system mismatch') : proc(0, 'Linux\n', '');
    if (args[0] === 'run' && args.includes('node') && args.includes('--version')) return failStep === 'node-container' ? proc(1, '', 'node failed') : proc(0, 'v22.12.0\n', '');
    if (args[0] === 'run' && args.includes('-v')) {
      if (failStep === 'temp-mount-write') return proc(1, '', 'Mounts denied: drive is not shared');
      const mount = args[args.indexOf('-v') + 1];
      const hostDir = mount.split(':/workspace')[0];
      writeFileSync(path.join(hostDir, 'probe.txt'), 'pidex-sandbox-probe-ok');
      return proc(0, '', '');
    }
    return proc(1, '', `unexpected docker args: ${args.join(' ')}`);
  };
  runner.calls = calls;
  return runner;
}

test('parseArgs requires explicit JSON mode and accepts image override', () => {
  assert.deepEqual(parseArgs(['--json', '--image', 'node:22-bookworm-slim']), { json: true, image: 'node:22-bookworm-slim' });
  assert.throws(() => parseArgs(['--wat']), /unknown argument/);
});

test('classifyOs recognizes linux and wsl2 without probing Docker', () => {
  assert.equal(classifyOs({ platform: 'linux', procVersion: 'Linux version' }), 'linux');
  assert.equal(classifyOs({ platform: 'linux', procVersion: 'microsoft-standard-WSL2' }), 'wsl2');
  assert.equal(classifyOs({ platform: 'darwin', procVersion: '' }), 'other');
});

test('runProbe returns actionable unavailable result when Docker CLI is missing', () => {
  const result = runProbe({ runner: fakeRunner({ failStep: 'docker-cli' }), osId: 'linux' });
  assert.equal(result.ok, false);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'docker-cli-not-found');
  assert.match(result.actionable, /Install Docker/);
  assert.equal(result.checks.at(-1).id, 'docker-cli');
});

test('runProbe stops at daemon failure with daemon-specific reason', () => {
  const result = runProbe({ runner: fakeRunner({ failStep: 'docker-daemon' }), osId: 'linux' });
  assert.equal(result.reason, 'docker-daemon-unavailable');
  assert.match(result.actionable, /Start Docker Engine/);
  assert.equal(result.checks.at(-1).id, 'docker-daemon');
});

test('runProbe requires Linux containers', () => {
  const result = runProbe({ runner: fakeRunner({ failStep: 'linux-container' }), osId: 'windows-native' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'linux-containers-unavailable');
  assert.match(result.actionable, /Linux containers/);
});

test('runProbe requires mount and write, with Windows Docker Desktop guidance', () => {
  const result = runProbe({ runner: fakeRunner({ failStep: 'temp-mount-write' }), osId: 'windows-native' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'docker-mount-write-unavailable');
  assert.match(result.actionable, /file sharing/);
  assert.equal(result.available, false);
});

test('runProbe succeeds only after host observes container-written marker', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pidex-sandbox-probe-test-'));
  const runner = fakeRunner();
  const result = runProbe({ runner, osId: 'linux', tempDir, keepTemp: false });
  assert.equal(result.ok, true);
  assert.equal(result.available, true);
  assert.equal(result.mode, 'hardened-pipeline');
  assert.deepEqual(result.checks.map((check) => check.id), [
    'os-classification',
    'docker-cli',
    'docker-daemon',
    'linux-container',
    'node-container',
    'temp-mount-write',
    'host-observed-write',
  ]);
});
