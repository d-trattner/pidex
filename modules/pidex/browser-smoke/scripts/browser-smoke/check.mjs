#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { BROWSER_SMOKE_STATUS } from './status.mjs';
import { browserSmokePaths } from './paths.mjs';
import { validateBrowserSmokeRequest } from './request-schema.mjs';
import { buildBrowserSmokeResult } from './result-contract.mjs';

function pathWithin(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function assertSafeOutputDir(outputDir, outputRoot = path.dirname(outputDir)) {
  const root = path.resolve(outputRoot);
  const dir = path.resolve(outputDir);
  mkdirSync(root, { recursive: true });
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) throw new Error('output-dir-symlink');
  mkdirSync(dir, { recursive: true });
  const realRoot = realpathSync(root);
  const realDir = realpathSync(dir);
  if (!pathWithin(realRoot, realDir)) throw new Error('output-dir-outside-root');
}

function redactSecretText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[REDACTED]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

function appendConsoleError(consoleErrors, value) {
  if (consoleErrors.length >= 20) return;
  const next = redactSecretText(value);
  const currentBytes = consoleErrors.reduce((sum, item) => sum + Buffer.byteLength(item, 'utf8'), 0);
  const remaining = 4096 - currentBytes;
  if (remaining <= 0) return;
  consoleErrors.push(next.slice(0, remaining));
}

function failResult(request, status, statusReason, url, extras = {}) {
  return buildBrowserSmokeResult({
    status,
    status_reason: statusReason,
    project_id: request?.project_id || 'unknown',
    request_id: request?.request_id || 'unknown',
    phase_run_id: request?.phase_run_id || 'unknown',
    preview_url_source: extras.preview_url_source,
    url: url || '',
    checks: extras.checks || [],
    console_errors: extras.console_errors || [],
    screenshot: extras.screenshot || '',
  });
}

function writeResult(outputDir, result) {
  writeFileSync(path.join(outputDir, 'browser-smoke-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

function resolvePlaywright(project = process.cwd(), stateDir = browserSmokePaths().stateDir) {
  for (const baseDir of [path.resolve(project), path.resolve(stateDir)]) {
    for (const pkg of ['playwright', '@playwright/test']) {
      try {
        const req = createRequire(path.join(baseDir, 'package.json'));
        return { ok: true, package: pkg, resolved: req.resolve(pkg), source_dir: baseDir };
      } catch {}
    }
  }
  return { ok: false, reason: 'playwright_not_configured' };
}

async function loadPlaywright(resolvedModule) {
  const mod = await import(pathToFileURL(resolvedModule).href);
  return mod.chromium ? mod : (mod.default || mod);
}

function cacheDirFromStateDir(stateDir) {
  const resolved = path.resolve(stateDir || browserSmokePaths().stateDir);
  return path.join(path.dirname(path.dirname(resolved)), '.cache', 'ms-playwright');
}

function ensurePlaywrightBrowsersPath(resolved, options = {}) {
  if (options.playwright) return;
  const stateDir = path.resolve(options.stateDir || browserSmokePaths().stateDir);
  const sourceDir = resolved?.source_dir ? path.resolve(resolved.source_dir) : '';
  const browsersPath = options.browsersPath || (sourceDir === stateDir ? cacheDirFromStateDir(stateDir) : '');
  if (browsersPath && !process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(browsersPath);
}

function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '[::1]' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'invalid-url' };
    if (!isLoopbackHost(parsed.hostname)) return { ok: false, reason: 'unsafe-url-host' };
    return { ok: true, parsed };
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
}

async function evaluateChecks(page, request, url) {
  const checks = [];
  const parsedUrl = new URL(url);
  for (const check of request.checks) {
    if (check.type === 'title') {
      const actual = await page.title();
      checks.push({ type: check.type, contains: check.contains, ok: actual.includes(check.contains) });
    } else if (check.type === 'text') {
      const actual = await page.locator('body').textContent({ timeout: 1000 }).catch(() => '');
      checks.push({ type: check.type, contains: check.contains, ok: String(actual || '').includes(check.contains) });
    } else if (check.type === 'selector') {
      const count = await page.locator(check.exists).count();
      checks.push({ type: check.type, exists: check.exists, ok: count > 0, count });
    } else if (check.type === 'url') {
      const pathValue = `${parsedUrl.pathname}${parsedUrl.search}`;
      const ok = check.path_equals !== undefined ? pathValue === check.path_equals : pathValue.includes(check.path_contains);
      checks.push({ type: check.type, ...(check.path_equals !== undefined ? { path_equals: check.path_equals } : { path_contains: check.path_contains }), ok });
    } else if (check.type === 'console') {
      checks.push({ type: check.type, errors: 'none', ok: true });
    }
  }
  return checks;
}

export async function runBrowserSmokeCheck(options = {}) {
  const url = String(options.url || '');
  const outputDir = path.resolve(options.outputDir || process.cwd());
  try {
    assertSafeOutputDir(outputDir, options.outputRoot || path.dirname(outputDir));
  } catch {
    return failResult(undefined, BROWSER_SMOKE_STATUS.BLOCKED_INFRA, 'invalid-output-dir', url);
  }
  const parsedUrl = validateUrl(url);
  const previewUrlSource = options.previewUrlSource;
  let rawRequest;
  try {
    rawRequest = options.request || JSON.parse(readFileSync(options.requestPath, 'utf8'));
  } catch {
    return writeResult(outputDir, failResult(undefined, BROWSER_SMOKE_STATUS.BLOCKED_INFRA, 'invalid-request', url, { preview_url_source: previewUrlSource }));
  }
  const validation = validateBrowserSmokeRequest(rawRequest);
  if (!validation.ok) return writeResult(outputDir, failResult(rawRequest, validation.status, validation.status_reason, url, { preview_url_source: previewUrlSource }));
  const request = validation.request;
  if (!parsedUrl.ok) return writeResult(outputDir, failResult(request, BROWSER_SMOKE_STATUS.BLOCKED_INFRA, parsedUrl.reason, url, { preview_url_source: previewUrlSource }));

  const resolved = options.playwright ? { ok: true, playwright: options.playwright } : resolvePlaywright(options.project || process.cwd(), options.stateDir || browserSmokePaths().stateDir);
  if (!resolved.ok) {
    return writeResult(outputDir, failResult(request, BROWSER_SMOKE_STATUS.SKIP_NOT_CONFIGURED, 'playwright-not-configured', url, { preview_url_source: previewUrlSource }));
  }

  const consoleErrors = [];
  let browser;
  const startedAt = new Date().toISOString();
  try {
    ensurePlaywrightBrowsersPath(resolved, options);
    const playwright = resolved.playwright || await loadPlaywright(resolved.resolved);
    if (!playwright.chromium) return writeResult(outputDir, failResult(request, BROWSER_SMOKE_STATUS.BLOCKED_INFRA, 'chromium-api-unavailable', url, { preview_url_source: previewUrlSource }));
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on?.('console', (msg) => { if (msg.type?.() === 'error') appendConsoleError(consoleErrors, msg.text?.() || ''); });
    page.on?.('pageerror', (err) => appendConsoleError(consoleErrors, err?.message || err));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: request.timeout_ms });
    const checks = await evaluateChecks(page, request, url);
    let screenshot = '';
    if (request.capture.screenshot) {
      const screenshotFile = path.join(outputDir, 'screenshot.png');
      if (!pathWithin(outputDir, screenshotFile)) throw new Error('screenshot path escaped output dir');
      if (existsSync(screenshotFile) && lstatSync(screenshotFile).isSymbolicLink()) throw new Error('screenshot path is symlink');
      await page.screenshot({ path: screenshotFile, fullPage: true });
      screenshot = 'screenshot.png';
    }
    await browser.close();
    const passChecks = checks.every((check) => check.ok === true);
    const passConsole = request.capture.console_errors === false || consoleErrors.length === 0;
    const status = passChecks && passConsole ? BROWSER_SMOKE_STATUS.PASS : BROWSER_SMOKE_STATUS.FAILED_FEATURE;
    const result = buildBrowserSmokeResult({
      status,
      status_reason: status === BROWSER_SMOKE_STATUS.PASS ? 'all-checks-passed' : 'browser-check-failed',
      project_id: request.project_id,
      request_id: request.request_id,
      phase_run_id: request.phase_run_id,
      preview_url_source: previewUrlSource,
      url,
      checks,
      console_errors: consoleErrors,
      screenshot,
      started_at: startedAt,
      ended_at: new Date().toISOString(),
    });
    return writeResult(outputDir, result);
  } catch (error) {
    try { if (browser) await browser.close(); } catch {}
    const result = { ...failResult(request, BROWSER_SMOKE_STATUS.BLOCKED_INFRA, 'browser-check-exception', url, { console_errors: consoleErrors, preview_url_source: previewUrlSource }), error: String(error?.message || error).slice(0, 500) };
    return writeResult(outputDir, result);
  }
}

function parseArgs(argv) {
  const out = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') out.url = argv[++i];
    else if (arg === '--request') out.requestPath = argv[++i];
    else if (arg === '--output-dir') out.outputDir = argv[++i];
    else if (arg === '--project') out.project = argv[++i];
    else if (arg === '--output-root') out.outputRoot = argv[++i];
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() { return 'Usage: check.mjs --url URL --request FILE --output-dir DIR [--output-root DIR] [--project PATH] --json'; }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) { console.log(usage()); process.exit(0); }
    if (!args.url || !args.requestPath || !args.outputDir) throw new Error('--url, --request, and --output-dir are required');
    const result = await runBrowserSmokeCheck(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.status_reason}`);
    process.exit(result.status === BROWSER_SMOKE_STATUS.PASS ? 0 : result.status === BROWSER_SMOKE_STATUS.SKIP_NOT_CONFIGURED ? 3 : 1);
  } catch (error) {
    console.error(error.message || String(error));
    console.error(usage());
    process.exit(2);
  }
}
