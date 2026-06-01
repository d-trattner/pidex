#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { browserSmokePaths } from './paths.mjs';

function parseArgs(argv) {
  const out = { dryRun: false, yes: false, packageOnly: false, withBrowsers: true, timeoutMs: 300000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--yes') out.yes = true;
    else if (arg === '--package-only') { out.packageOnly = true; out.withBrowsers = false; }
    else if (arg === '--with-browsers') out.withBrowsers = true;
    else if (arg === '--timeout-ms') out.timeoutMs = Number(argv[++i] || out.timeoutMs);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const proc = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (proc.status !== 0) throw new Error(`command failed: ${command} ${args.join(' ')} (${proc.status})`);
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
    if (args.withBrowsers) console.log(`DRY-RUN: PLAYWRIGHT_BROWSERS_PATH=${paths.cacheDir} npx --prefix ${paths.stateDir} playwright install chromium`);
    else console.log('DRY-RUN: browser binary install skipped (--package-only)');
    process.exit(0);
  }
  ensurePackageJson(paths.stateDir);
  mkdirSync(paths.cacheDir, { recursive: true });
  run('npm', ['--prefix', paths.stateDir, 'install', '@playwright/test']);
  if (args.withBrowsers) {
    run('npx', ['--prefix', paths.stateDir, 'playwright', 'install', 'chromium'], {
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: paths.cacheDir },
      timeout: args.timeoutMs,
    });
  }
  console.log('browser-smoke install complete');
} catch (error) {
  console.error(`browser-smoke install failed: ${error?.message || error}`);
  process.exit(1);
}
