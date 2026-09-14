import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// Execute the exact shipped controller with isolated filesystem/process doubles.
// No Docker, npm, filesystem mutation or provider access.
const source = readFileSync(new URL('./pi-upgrade-container.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function run(mode = 'success') {
  const target = '0.85.1', previous = mode === 'downgrade' ? '0.86.0' : '0.80.3';
  const pi = '/usr/local/bin/pi';
  const old = '../lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js';
  const links = new Map([[pi, old]]), writes = [], calls = [], outputs = [];
  let counter = 0;
  const fs = {
    lstatSync(p) { return { isSymbolicLink: () => p === pi, isDirectory: () => p !== pi, uid: mode === 'unowned' ? 1000 : 0, mode: 0o755 }; },
    readlinkSync(p) { return links.get(p); },
    realpathSync(p) { return p === pi ? '/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js' : p; },
    mkdirSync(p) { writes.push(p); },
    readFileSync() { return JSON.stringify({ version: mode === 'bad-package' ? '0.0.1' : target, bin: { pi: 'dist/bundle/cli.js' } }); },
    symlinkSync(to, p) { links.set(p, to); writes.push(p); },
    renameSync(from, to) { links.set(to, links.get(from)); links.delete(from); writes.push(to); },
  };
  const spawn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    if (args[1] === 'install') {
      if (mode === 'timeout') return { status: null, error: new Error('timeout'), signal: 'SIGKILL' };
      return { status: mode === 'install-fail' ? 1 : 0 };
    }
    const switched = links.get(pi) !== old;
    if ((mode === 'verify-fail' || mode === 'rollback-fail') && args[0] === pi && switched) return { status: 1 };
    if (mode === 'rollback-fail' && args[0] === pi && !switched && writes.includes(pi)) return { status: 1 };
    return { status: 0, stdout: args[0] === pi && !switched ? previous : target };
  };
  const proc = { env: { PIDEX_PROJECT_PIPELINE_CONTAINER: mode === 'host' ? undefined : '1' }, argv: ['node', target], getuid: () => 0, exitCode: 0, exit() { throw new Error('unexpected no-op in fixture'); } };
  vm.runInNewContext(source, { fs, path, randomUUID: () => `owned-${++counter}`, spawnSync: spawn, process: proc, console: { log: text => outputs.push(JSON.parse(text)) } });
  return { result: outputs.at(-1), calls, writes, links, old };
}

for (const [mode, status] of [
  ['success', 'verified'], ['install-fail', 'failed_unchanged'], ['timeout', 'held'],
  ['bad-package', 'failed_unchanged'], ['verify-fail', 'rolled_back'], ['rollback-fail', 'held'],
  ['downgrade', 'failed_unchanged'], ['unowned', 'failed_unchanged'], ['host', 'failed_unchanged'],
]) test(`container controller: ${mode} reports ${status}`, () => {
  const r = run(mode);
  assert.equal(r.result.status, status);
  if (mode !== 'success') assert.equal(r.links.get('/usr/local/bin/pi'), r.old);
  for (const p of r.writes) assert.ok(p.startsWith('/opt/pidex-pi') || p.startsWith('/usr/local/bin/'), p);
  if (['downgrade', 'unowned', 'host'].includes(mode)) assert.equal(r.calls.some(c => c.args[1] === 'install'), false);
});

test('container install isolates npm config/cache/prefix, disables scripts, and never touches models or credentials', () => {
  const r = run(), install = r.calls.find(c => c.args[1] === 'install');
  assert.ok(install.args.includes('@earendil-works/pi-coding-agent@0.85.1'));
  for (const flag of ['--ignore-scripts', '--no-audit', '--no-fund', '--engine-strict']) assert.ok(install.args.includes(flag));
  assert.equal(install.opts.env.NPM_CONFIG_USERCONFIG, '/dev/null');
  assert.equal(install.opts.env.NPM_CONFIG_GLOBALCONFIG, '/dev/null');
  assert.equal(install.opts.env.NODE_OPTIONS, undefined);
  assert.equal(install.opts.timeout, 180000);
  assert.doesNotMatch(JSON.stringify(r.calls), /pidex-secrets|\/workspace|--print|--list-models/);
});
