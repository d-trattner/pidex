import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import vm from 'node:vm';

// Execute the exact shipped controller with isolated filesystem/process doubles.
// Controller fixtures never invoke Docker/npm. The separate npm regression below
// runs only the installed CLI's offline config parser in an owned temp directory.
const source = readFileSync(new URL('./pi-upgrade-container.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function run(mode = 'success') {
  const target = '0.85.1', previous = mode === 'downgrade' ? '0.86.0' : '0.80.3';
  const pi = '/usr/local/bin/pi';
  const old = '../lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js';
  const links = new Map([[pi, old]]), writes = [], configFiles = [], calls = [], outputs = [];
  let counter = 0;
  const fs = {
    lstatSync(p) { return { isSymbolicLink: () => p === pi, isDirectory: () => p !== pi, uid: mode === 'unowned' ? 1000 : 0, mode: 0o755 }; },
    readlinkSync(p) { return links.get(p); },
    realpathSync(p) { return p === pi ? '/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js' : p; },
    mkdirSync(p) { writes.push(p); },
    writeFileSync(p, data, options) {
      if (mode === 'config-fail' && configFiles.length === 1) throw new Error('config-create-failed');
      writes.push(p); configFiles.push({ path: p, data, options });
    },
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
  return { result: outputs.at(-1), calls, writes, configFiles, links, old };
}

for (const [mode, status] of [
  ['success', 'verified'], ['config-fail', 'failed_unchanged'], ['install-fail', 'failed_unchanged'], ['timeout', 'held'],
  ['bad-package', 'failed_unchanged'], ['verify-fail', 'rolled_back'], ['rollback-fail', 'held'],
  ['downgrade', 'failed_unchanged'], ['unowned', 'failed_unchanged'], ['host', 'failed_unchanged'],
]) test(`container controller: ${mode} reports ${status}`, () => {
  const r = run(mode);
  assert.equal(r.result.status, status);
  if (mode !== 'success') assert.equal(r.links.get('/usr/local/bin/pi'), r.old);
  for (const p of r.writes) assert.ok(p.startsWith('/opt/pidex-pi') || p.startsWith('/usr/local/bin/'), p);
  if (['downgrade', 'unowned', 'host', 'config-fail'].includes(mode)) assert.equal(r.calls.some(c => c.args[1] === 'install'), false);
});

test('container install isolates npm config/cache/prefix, disables scripts, and never touches models or credentials', () => {
  const r = run(), install = r.calls.find(c => c.args[1] === 'install');
  assert.ok(install.args.includes('@earendil-works/pi-coding-agent@0.85.1'));
  for (const flag of ['--ignore-scripts', '--no-audit', '--no-fund', '--engine-strict']) assert.ok(install.args.includes(flag));
  const userConfig = install.opts.env.NPM_CONFIG_USERCONFIG;
  const globalConfig = install.opts.env.NPM_CONFIG_GLOBALCONFIG;
  assert.notEqual(userConfig, globalConfig);
  assert.equal(r.configFiles.length, 2);
  for (const file of r.configFiles) {
    assert.ok([userConfig, globalConfig].includes(file.path));
    assert.equal(path.dirname(file.path), install.opts.cwd);
    assert.equal(file.data, '');
    assert.equal(file.options.flag, 'wx');
    assert.equal(file.options.mode, 0o600);
  }
  assert.equal(install.opts.env.NODE_OPTIONS, undefined);
  assert.equal(install.opts.timeout, 180000);
  assert.doesNotMatch(JSON.stringify(r.calls), /pidex-secrets|\/workspace|--print|--list-models/);
});

test('real local npm loads the controller config pair without double-loading', t => {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(nodeDir, 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDir, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(nodeDir, '../share/nodejs/npm/bin/npm-cli.js'),
    ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'npm')),
  ];
  const npmCli = candidates.filter(Boolean).filter(p => existsSync(p)).map(p => realpathSync(p)).find(p => path.basename(p) === 'npm-cli.js');
  if (!npmCli) { t.skip('No local npm CLI available; never download one for this test'); return; }
  const root = mkdtempSync(path.join(tmpdir(), 'pidex-pi-npm-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, 'package.json'), '{"private":true}\n');
  const install = run().calls.find(c => c.args[1] === 'install');
  const env = { ...install.opts.env, PATH: process.env.PATH, HOME: root, USERPROFILE: root, NPM_CONFIG_CACHE: path.join(root, 'cache'), NPM_CONFIG_OFFLINE: 'true', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NPM_CONFIG_AUDIT: 'false', NPM_CONFIG_IGNORE_SCRIPTS: 'true' };
  // Mirror the controller's path identity on this host, including an accidental alias.
  for (const key of ['NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_GLOBALCONFIG']) env[key] = path.join(root, path.posix.basename(install.opts.env[key]));
  for (const file of new Set([env.NPM_CONFIG_USERCONFIG, env.NPM_CONFIG_GLOBALCONFIG])) writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
  const invoke = selectedEnv => spawnSync(process.execPath, [npmCli, 'config', 'get', 'registry', '--offline'], { cwd: root, env: selectedEnv, encoding: 'utf8', timeout: 15000, maxBuffer: 65536 });
  const result = invoke(env);
  assert.equal(result.status, 0, result.stderr || String(result.error));
  assert.equal(result.stdout.trim(), 'https://registry.npmjs.org/');
  assert.doesNotMatch(result.stderr, /double-loading config/);
  const collision = invoke({ ...env, NPM_CONFIG_GLOBALCONFIG: env.NPM_CONFIG_USERCONFIG });
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /double-loading config/);
});
