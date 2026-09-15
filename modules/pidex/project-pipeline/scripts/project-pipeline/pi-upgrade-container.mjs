// Sent to the confirmed container's /usr/local/bin/node. Never run on the host.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const target = process.argv[1];
const pi = '/usr/local/bin/pi';
const root = '/opt/pidex-pi';
const versionPattern = /^\d+\.\d+\.\d+$/;
const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', LANG: 'C.UTF-8', NODE_ENV: 'production' };
const probe = (file) => {
  const p = spawnSync('/usr/local/bin/node', [file, '--version'], { cwd: '/', env, encoding: 'utf8', timeout: 10000, maxBuffer: 4096 });
  const value = String(p.stdout || '').trim();
  if (p.status !== 0 || !versionPattern.test(value)) throw new Error('version-probe-failed');
  return value;
};
const emit = (status, extra = {}) => console.log(JSON.stringify({ status, ...extra }));
let oldLink;
let before;
let switched = false;
let uncertain = false;
try {
  if (process.env.PIDEX_PROJECT_PIPELINE_CONTAINER !== '1' || process.getuid() !== 0 || !versionPattern.test(target || '')) throw new Error('invalid-target');
  const st = fs.lstatSync(pi);
  if (!st.isSymbolicLink() || st.uid !== 0) throw new Error('unsupported-pi-layout');
  oldLink = fs.readlinkSync(pi);
  const oldReal = fs.realpathSync(pi);
  if (!oldReal.startsWith('/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/') && !oldReal.startsWith(`${root}/`)) throw new Error('unsupported-pi-layout');
  before = probe(pi);
  if (before === target) { emit('verified', { before, after: before }); process.exit(0); }
  const a = before.split('.').map(Number), b = target.split('.').map(Number);
  const different = a.findIndex((v, i) => v !== b[i]);
  if (different >= 0 && a[different] > b[different]) throw new Error('downgrade-denied');
  fs.mkdirSync(root, { recursive: true, mode: 0o755 });
  const rs = fs.lstatSync(root);
  if (!rs.isDirectory() || rs.isSymbolicLink() || rs.uid !== 0 || (rs.mode & 0o022)) throw new Error('unsupported-pi-layout');
  const stage = path.join(root, `${target}-${randomUUID()}`);
  fs.mkdirSync(stage, { mode: 0o755 });
  // npm rejects loading the same path as both user and global config.
  // Separate empty, exclusively created files keep both scopes isolated.
  const userConfig = path.join(stage, 'user.npmrc');
  const globalConfig = path.join(stage, 'global.npmrc');
  for (const file of [userConfig, globalConfig]) fs.writeFileSync(file, '', { flag: 'wx', mode: 0o600 });
  const installEnv = { ...env, NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig };
  // Isolated prefix: failure cannot overwrite the previous installation.
  // No workspace/npmrc, credential config, package lifecycle scripts or model calls.
  const install = spawnSync('/usr/local/bin/node', [
    '/usr/local/lib/node_modules/npm/bin/npm-cli.js', 'install',
    '--prefix', stage, '--cache', path.join(stage, 'cache'), '--registry', 'https://registry.npmjs.org',
    '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--engine-strict',
    `@earendil-works/pi-coding-agent@${target}`,
  ], { cwd: stage, env: installEnv, stdio: 'ignore', timeout: 180000, killSignal: 'SIGKILL' });
  if (install.error || install.signal) { uncertain = true; throw new Error('install-unconfirmed'); }
  if (install.status !== 0) throw new Error('install-failed');
  const pkgRoot = path.join(stage, 'node_modules/@earendil-works/pi-coding-agent');
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  if (pkg.version !== target || typeof pkg.bin?.pi !== 'string') throw new Error('version-mismatch');
  const bin = fs.realpathSync(path.resolve(pkgRoot, pkg.bin.pi));
  if (!bin.startsWith(`${pkgRoot}/`) || probe(bin) !== target) throw new Error('version-mismatch');
  const next = `/usr/local/bin/.pidex-pi-${randomUUID()}`;
  fs.symlinkSync(bin, next);
  fs.renameSync(next, pi);
  switched = true;
  if (probe(pi) !== target) throw new Error('version-mismatch');
  emit('verified', { before, after: target });
} catch (error) {
  let status = uncertain ? 'held' : 'failed_unchanged';
  if (switched) {
    try {
      const rollback = `/usr/local/bin/.pidex-pi-${randomUUID()}`;
      fs.symlinkSync(oldLink, rollback);
      fs.renameSync(rollback, pi);
      status = probe(pi) === before ? 'rolled_back' : 'held';
    } catch { status = 'held'; }
  }
  const allowed = ['invalid-target', 'unsupported-pi-layout', 'version-probe-failed', 'downgrade-denied', 'install-unconfirmed', 'install-failed', 'version-mismatch'];
  emit(status, { ...(before ? { before } : {}), reason: allowed.includes(error.message) ? error.message : 'container-update-failed' });
  process.exitCode = 1;
}
