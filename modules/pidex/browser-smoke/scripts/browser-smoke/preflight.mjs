#!/usr/bin/env node
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_SMOKE_STATUS } from './status.mjs';
import { browserSmokePaths } from './paths.mjs';

function parseArgs(argv) {
  const out = { json: false, require: false, noLaunch: false, timeoutMs: 10000, project: process.env.PIDEX_PROJECT || process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--require') out.require = true;
    else if (arg === '--no-launch') out.noLaunch = true;
    else if (arg === '--timeout-ms') out.timeoutMs = Number(argv[++i] || out.timeoutMs);
    else if (arg === '--project') out.project = argv[++i] || out.project;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function projectRoot(project) {
  return path.resolve(project);
}

function tryResolvePlaywright(baseDir) {
  try {
    const req = createRequire(path.join(baseDir, 'package.json'));
    const resolved = req.resolve('playwright');
    return { ok: true, package: 'playwright', resolved, source_dir: baseDir };
  } catch {}
  try {
    const req = createRequire(path.join(baseDir, 'package.json'));
    const resolved = req.resolve('@playwright/test');
    return { ok: true, package: '@playwright/test', resolved, source_dir: baseDir };
  } catch {}
  return { ok: false, source_dir: baseDir };
}

function choosePlaywright(project, stateDir) {
  const projectLocal = tryResolvePlaywright(project);
  if (projectLocal.ok) return { ...projectLocal, source: 'project-local' };
  const pidexLocal = tryResolvePlaywright(stateDir);
  if (pidexLocal.ok) return { ...pidexLocal, source: 'pidex-local' };
  return { ok: false, source: 'not-configured' };
}

function launchProbe(resolvedModule, cacheDir, timeoutMs) {
  const probeScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'launch-probe.mjs');
  const proc = spawnSync(process.execPath, [probeScript, resolvedModule, cacheDir], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cacheDir },
  });
  if (proc.error?.code === 'ETIMEDOUT') return { ok: false, reason: 'browser_launch_probe_timeout', error: `launch probe timed out after ${timeoutMs}ms` };
  const text = String(proc.stdout || '').trim().split(/\r?\n/).pop() || '';
  try {
    const parsed = JSON.parse(text);
    return { ...parsed, exit_code: proc.status, stderr: proc.stderr?.trim() || undefined };
  } catch {
    return { ok: false, reason: 'browser_launch_probe_unparseable', exit_code: proc.status, stdout: proc.stdout?.trim(), stderr: proc.stderr?.trim() };
  }
}

function print(result, json) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.status}: ${result.reason}`);
    console.log(`source: ${result.source}`);
    if (result.executable_path) console.log(`executable: ${result.executable_path}`);
    if (result.error) console.log(`error: ${result.error}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const paths = browserSmokePaths();
  const project = projectRoot(args.project);
  const chosen = choosePlaywright(project, paths.stateDir);
  let result = {
    type: 'browser-smoke-preflight',
    status: BROWSER_SMOKE_STATUS.SKIP_NOT_CONFIGURED,
    reason: 'playwright_not_configured',
    source: chosen.source,
    project,
    state_dir: paths.stateDir,
    cache_dir: paths.cacheDir,
  };
  if (chosen.ok) {
    result = { ...result, status: BROWSER_SMOKE_STATUS.PASS, reason: 'playwright_package_available', source: chosen.source, package: chosen.package, resolved: chosen.resolved };
    if (!args.noLaunch) {
      const probe = launchProbe(chosen.resolved, paths.cacheDir, args.timeoutMs);
      result = probe.ok
        ? { ...result, status: BROWSER_SMOKE_STATUS.PASS, reason: 'browser_launch_probe_passed', ...probe }
        : { ...result, status: BROWSER_SMOKE_STATUS.BLOCKED_INFRA, reason: probe.reason, ...probe };
    }
  }
  print(result, args.json);
  if (args.require && result.status !== BROWSER_SMOKE_STATUS.PASS) process.exit(1);
} catch (error) {
  const result = { type: 'browser-smoke-preflight', status: BROWSER_SMOKE_STATUS.BLOCKED_INFRA, reason: 'preflight_exception', error: String(error?.message || error) };
  print(result, process.argv.includes('--json'));
  process.exit(1);
}
