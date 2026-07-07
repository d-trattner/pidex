#!/usr/bin/env node
// Cross-platform PIDEX dashboard launcher. Keeps dashboard/start.sh for Linux compatibility,
// but this Node entrypoint works on native Windows where Bash may be unavailable.
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DASHBOARD_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PIDEX_ROOT = path.resolve(DASHBOARD_ROOT, '..');
const DEFAULT_PORT = '18777';
const DEFAULT_HOST = '127.0.0.1';

export function parseDashboardStartArgs(argv = []) {
  const out = { host: DEFAULT_HOST, port: DEFAULT_PORT, domain: '', foreground: false, build: true, ingest: true, dev: false, publicRead: process.env.PIDEX_PROVIDER_LIMITS_PUBLIC_READ === '1', publicWrite: process.env.PIDEX_PROVIDER_LIMITS_PUBLIC_WRITE === '1', help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--host') out.host = next();
    else if (arg === '--port') out.port = next();
    else if (arg === '--domain') out.domain = next();
    else if (arg === '--foreground') out.foreground = true;
    else if (arg === '--no-build') out.build = false;
    else if (arg === '--no-ingest') out.ingest = false;
    else if (arg === '--dev') out.dev = true;
    else if (arg === '--public-read') out.publicRead = true;
    else if (arg === '--public-write') out.publicWrite = true;
    else if (arg === '-h' || arg === '--help') out.help = true;
    else throw new Error(`Unknown arg: ${arg}`);
  }
  return out;
}

function usage() {
  return `Usage: node dashboard/start.mjs [options]\n\nOptions:\n  --host HOST       Bind host. Default: 127.0.0.1\n  --port PORT       Bind port. Default: 18777\n  --domain NAME     Print friendly domain URL. Default: config/dashboard*.json or disabled\n  --public-read     Allow unauthenticated provider-limits GETs on public bind\n  --public-write    Allow same-origin provider-limits writes on public bind\n  --no-build        Skip production build before start\n  --no-ingest       Skip SQLite ingest before start\n  --dev             Run Vite dev server instead of production preview\n  --foreground      Run server in foreground instead of detached background\n  -h, --help        Show help`;
}

function readDashboardDomain(root = PIDEX_ROOT) {
  let value = '';
  for (const file of ['config/dashboard.json', 'config/dashboard.local.json']) {
    const p = path.join(root, file);
    if (!existsSync(p)) continue;
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf8'));
      if (parsed?.domain != null && String(parsed.domain).trim()) value = String(parsed.domain).trim();
    } catch {}
  }
  return value;
}

export function findNodeBinUpwards(start, binName, platform = process.platform) {
  let dir = path.resolve(start);
  const names = platform === 'win32' ? [`${binName}.cmd`, `${binName}.ps1`, binName] : [binName];
  while (dir && dir !== path.dirname(dir)) {
    for (const name of names) {
      const candidate = path.join(dir, 'node_modules', '.bin', name);
      if (existsSync(candidate)) return candidate;
    }
    dir = path.dirname(dir);
  }
  return '';
}

function stopPid(pid) {
  const n = Number.parseInt(String(pid || '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return;
  try { process.kill(n, 'SIGTERM'); } catch {}
}

function runChecked(command, args, options = {}) {
  const proc = spawnSync(command, args, { cwd: DASHBOARD_ROOT, stdio: 'inherit', shell: false, ...options });
  if (proc.status !== 0) process.exit(proc.status || 1);
}

function localLanIp() {
  for (const items of Object.values(os.networkInterfaces())) {
    for (const item of items || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return '';
}

export function dashboardUrls({ host, port, domain }) {
  const urls = [`Local:  http://127.0.0.1:${port}/dashboard`];
  const lan = localLanIp();
  if (host === '0.0.0.0' && lan) urls.push(`LAN:    http://${lan}:${port}/dashboard`);
  if (host === '0.0.0.0' && domain) urls.push(`Domain: http://${domain}/dashboard`);
  return urls;
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseDashboardStartArgs(argv); } catch (error) { console.error(error.message || String(error)); console.error(usage()); process.exit(2); }
  if (opts.help) { console.log(usage()); return; }
  if (!opts.domain) opts.domain = process.env.PIDEX_DASHBOARD_DOMAIN || readDashboardDomain();

  const log = path.join(os.tmpdir(), `pidex-dashboard-${opts.port}.log`);
  const pidFile = path.join(DASHBOARD_ROOT, `.dashboard-${opts.port}.pid`);
  if (existsSync(pidFile)) {
    try { stopPid(readFileSync(pidFile, 'utf8')); } catch {}
    try { rmSync(pidFile, { force: true }); } catch {}
  }

  const vite = findNodeBinUpwards(DASHBOARD_ROOT, 'vite');
  if (!vite) {
    console.error(`Missing dashboard dependency: vite. Run pnpm install --frozen-lockfile --ignore-scripts from '${PIDEX_ROOT}' using the pinned pnpm version, or install PIDEX through the full installer.`);
    process.exit(1);
  }

  if (opts.ingest) {
    const ingest = path.join(PIDEX_ROOT, 'scripts', 'dashboard', 'ingest.mjs');
    if (existsSync(ingest)) {
      console.log('==> Ingesting dashboard data');
      const proc = spawnSync(process.execPath, [ingest, '--db', path.join(DASHBOARD_ROOT, 'data', 'pidex.sqlite'), '--project', PIDEX_ROOT], { cwd: PIDEX_ROOT, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
      if (proc.status !== 0) {
        console.error('Dashboard ingest failed. Output omitted?');
        if (proc.stderr) console.error(proc.stderr);
        process.exit(proc.status || 1);
      }
      writeFileSync(path.join(os.tmpdir(), 'pidex-dashboard-ingest.json'), proc.stdout || '', 'utf8');
    }
  }

  if (!opts.dev && opts.build) {
    console.log('==> Building dashboard');
    runChecked(vite, ['build']);
  }

  mkdirSync(path.join(DASHBOARD_ROOT, 'data'), { recursive: true });
  const env = {
    ...process.env,
    PIDEX_DASHBOARD_ROOT: DASHBOARD_ROOT,
    PIDEX_DASHBOARD_DB: path.join(DASHBOARD_ROOT, 'data', 'pidex.sqlite'),
    PIDEX_PROVIDER_LIMITS_PUBLIC_READ: opts.publicRead ? '1' : '0',
    PIDEX_PROVIDER_LIMITS_PUBLIC_WRITE: opts.publicWrite ? '1' : '0',
    PIDEX_DASHBOARD_PUBLIC_BIND: ['127.0.0.1', 'localhost', '::1'].includes(opts.host) ? '0' : '1',
  };
  const args = opts.dev ? ['--host', opts.host, '--port', opts.port, '--strictPort'] : ['preview', '--host', opts.host, '--port', opts.port, '--strictPort'];

  if (opts.foreground) {
    console.log(`==> Starting dashboard in foreground on ${opts.host}:${opts.port}`);
    for (const line of dashboardUrls(opts)) console.log(line);
    const child = spawn(vite, args, { cwd: DASHBOARD_ROOT, env, stdio: 'inherit', shell: false });
    const code = await new Promise((resolve) => child.on('close', resolve));
    process.exit(Number(code || 0));
  }

  console.log(`==> Starting dashboard on ${opts.host}:${opts.port}`);
  const out = openSync(log, 'a');
  const err = openSync(log, 'a');
  const child = spawn(vite, args, { cwd: DASHBOARD_ROOT, env, detached: true, stdio: ['ignore', out, err], shell: false });
  child.unref();
  writeFileSync(pidFile, `${child.pid}\n`, 'utf8');
  console.log('PIDEX dashboard started.');
  console.log(`PID:    ${child.pid}`);
  console.log(`Log:    ${log}`);
  for (const line of dashboardUrls(opts)) console.log(line);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
