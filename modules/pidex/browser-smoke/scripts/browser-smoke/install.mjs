#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { browserSmokePaths } from './paths.mjs';

function parseArgs(argv) {
  const out = { dryRun: false, yes: false, packageOnly: false, withBrowsers: true, withSystemDeps: false, timeoutMs: 300000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--yes') out.yes = true;
    else if (arg === '--package-only') { out.packageOnly = true; out.withBrowsers = false; }
    else if (arg === '--with-browsers') out.withBrowsers = true;
    else if (arg === '--with-system-deps') out.withSystemDeps = true;
    else if (arg === '--timeout-ms') out.timeoutMs = Number(argv[++i] || out.timeoutMs);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function killProcessTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
      setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      }, 5000).unref();
    }
  } catch {}
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      ...options,
    });
    let timedOut = false;
    const timeoutMs = Number(options.timeout || 0);
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
    }, timeoutMs) : null;
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (timedOut) reject(new Error(`command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`));
      else if (code !== 0) reject(new Error(`command failed: ${command} ${args.join(' ')} (${code ?? signal})`));
      else resolve();
    });
  });
}

function ensurePackageJson(stateDir) {
  mkdirSync(stateDir, { recursive: true });
  const file = path.join(stateDir, 'package.json');
  if (!existsSync(file)) {
    writeFileSync(file, `${JSON.stringify({ private: true, name: '@pidex/browser-smoke-runtime', version: '0.0.0', description: 'PIDEX-local browser smoke runtime dependencies' }, null, 2)}\n`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const paths = browserSmokePaths();
  console.log('PIDEX browser-smoke install');
  console.log(`state: ${paths.stateDir}`);
  console.log(`cache: ${paths.cacheDir}`);
  console.log('This installs optional PIDEX-local Playwright support. It does not use npm global and does not mutate user projects.');
  if (args.dryRun) {
    console.log(`DRY-RUN: mkdir -p ${paths.stateDir} ${paths.cacheDir}`);
    console.log(`DRY-RUN: npm --prefix ${paths.stateDir} install @playwright/test`);
    if (args.withSystemDeps) console.log(`DRY-RUN: PLAYWRIGHT_BROWSERS_PATH=${paths.cacheDir} npm --prefix ${paths.stateDir} exec playwright -- install-deps chromium`);
    if (args.withBrowsers) console.log(`DRY-RUN: PLAYWRIGHT_BROWSERS_PATH=${paths.cacheDir} npm --prefix ${paths.stateDir} exec playwright -- install chromium`);
    else console.log('DRY-RUN: browser binary install skipped (--package-only)');
    process.exit(0);
  }
  ensurePackageJson(paths.stateDir);
  mkdirSync(paths.cacheDir, { recursive: true });
  await run('npm', ['--prefix', paths.stateDir, 'install', '@playwright/test'], { timeout: Math.max(args.timeoutMs, 300000) });
  if (args.withSystemDeps) {
    console.log('Installing Linux system dependencies for Chromium. This may use apt and modify the host.');
    await run('npm', ['--prefix', paths.stateDir, 'exec', 'playwright', '--', 'install-deps', 'chromium'], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: paths.cacheDir },
      timeout: args.timeoutMs,
    });
  }
  if (args.withBrowsers) {
    await run('npm', ['--prefix', paths.stateDir, 'exec', 'playwright', '--', 'install', 'chromium'], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: paths.cacheDir },
      timeout: args.timeoutMs,
    });
  }
  console.log('browser-smoke install complete');
} catch (error) {
  console.error(`browser-smoke install failed: ${error?.message || error}`);
  process.exit(1);
}
