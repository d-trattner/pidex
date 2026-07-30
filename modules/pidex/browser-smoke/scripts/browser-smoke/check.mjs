#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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

function truncateUtf8(value, maxBytes) {
  let bytes = 0;
  let truncated = '';
  for (const codePoint of value) {
    const codePointBytes = Buffer.byteLength(codePoint, 'utf8');
    if (bytes + codePointBytes > maxBytes) break;
    truncated += codePoint;
    bytes += codePointBytes;
  }
  return truncated;
}

function appendConsoleError(consoleErrors, value, budget) {
  const recordCount = budget?.records ?? consoleErrors.length;
  if (recordCount >= 20) return;
  const next = redactSecretText(value);
  const currentBytes = budget?.bytes ?? consoleErrors.reduce((sum, item) => sum + Buffer.byteLength(item, 'utf8'), 0);
  const truncated = truncateUtf8(next, 4096 - currentBytes);
  if (!truncated) return;
  consoleErrors.push(truncated);
  if (budget) {
    budget.records += 1;
    budget.bytes += Buffer.byteLength(truncated, 'utf8');
  }
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

const SCHEMA2_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
const SCHEMA2_CLEANUP_BUDGET_MS = 100;

function schema2Deadline(timeoutMs) {
  const endsAt = Date.now() + timeoutMs;
  return {
    remaining() { return Math.max(0, endsAt - Date.now()); },
  };
}

function schema2DeadlineError() {
  const error = new Error('schema2-deadline-exceeded');
  error.code = 'schema2-deadline-exceeded';
  return error;
}

async function withinSchema2Deadline(work, deadline) {
  const remaining = deadline.remaining();
  if (remaining <= 0) throw schema2DeadlineError();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => { timer = setTimeout(() => reject(schema2DeadlineError()), remaining); }),
    ]);
  } finally { clearTimeout(timer); }
}

function setSchema2DefaultTimeout(target, deadline) {
  const remaining = deadline.remaining();
  if (remaining <= 0) throw schema2DeadlineError();
  target?.setDefaultTimeout?.(remaining);
}

async function closeSchema2Resource(resource) {
  let settled = false;
  let timer;
  try {
    const close = Promise.resolve().then(() => resource.close?.()).catch(() => {});
    await Promise.race([close.then(() => { settled = true; }), new Promise((resolve) => { timer = setTimeout(resolve, SCHEMA2_CLEANUP_BUDGET_MS); })]);
  } finally { clearTimeout(timer); }
  return settled;
}

function schema2CleanupFailureResult(request, viewports, startedAt, outputDir) {
  const failedViewports = viewports.map((viewport) => {
    if (viewport.screenshot) { try { unlinkSync(path.resolve(outputDir, viewport.screenshot)); } catch {} }
    return { ...viewport, status: 'BLOCKED_INFRA', status_reason: 'runtime-infra', stage: viewport.stage === 'complete' ? 'capture' : viewport.stage, screenshot: null };
  });
  return schema2Result(request, failedViewports, startedAt);
}

function schema2Result(request, viewports, startedAt) {
  const failed = viewports.find((viewport) => viewport.status !== 'PASS');
  const status = failed?.status || 'PASS';
  return { schema: 2, ok: status === 'PASS', status, status_reason: failed?.status_reason || 'all-checks-passed', project_id: request.project_id, request_id: request.request_id, phase_run_id: request.phase_run_id, requester: request.requester, preview_url_source: 'project-pipeline-registry', viewports, started_at: startedAt, ended_at: new Date().toISOString() };
}

async function schema2Containment(context, page, previewUrl) {
  const previewOrigin = new URL(previewUrl).origin;
  const pending = new Set();
  let blocked = false;
  const track = (work) => {
    const task = Promise.resolve().then(work).catch(() => { blocked = true; }).finally(() => pending.delete(task));
    pending.add(task);
    return task;
  };
  const abortForeign = async (route) => {
    try {
      const target = new URL(route.request().url());
      if ((target.protocol !== 'http:' && target.protocol !== 'https:') || target.origin !== previewOrigin) { blocked = true; await route.abort('blockedbyclient'); } else await route.continue();
    } catch { blocked = true; try { await route.abort('blockedbyclient'); } catch {} }
  };
  if (typeof context.route === 'function') await context.route('**/*', abortForeign);
  page.on?.('popup', (popup) => track(async () => { blocked = true; await popup.close(); }));
  context.on?.('page', (unexpected) => { if (unexpected !== page) track(async () => { blocked = true; await unexpected.close(); }); });
  page.on?.('download', (download) => track(async () => { blocked = true; await download.cancel(); }));
  page.on?.('filechooser', (chooser) => track(async () => { blocked = true; await chooser.setInputFiles([]); }));
  return {
    async checkpoint() {
      await Promise.all([...pending]);
      if (blocked) { const error = new Error('schema2-navigation-contained'); error.code = 'schema2-navigation-contained'; throw error; }
    },
  };
}

async function runSchema2Viewport(context, url, viewport, consoleErrors, consoleBudget, outputDir, deadline) {
  setSchema2DefaultTimeout(context, deadline);
  const page = await withinSchema2Deadline(() => context.newPage(), deadline);
  setSchema2DefaultTimeout(page, deadline);
  const containment = await withinSchema2Deadline(() => schema2Containment(context, page, url), deadline);
  const bounded = (work) => withinSchema2Deadline(work, deadline);
  const checkpoint = () => bounded(() => containment.checkpoint());
  const observations = { preconditions: [], actions: [], checks: [] };
  const fail = (status, status_reason, stage) => ({ id: viewport.id, width: viewport.width, height: viewport.height, status, status_reason, stage, ...observations, console_errors: consoleErrors, screenshot: null });
  page.on?.('console', (msg) => { if (msg.type?.() === 'error') appendConsoleError(consoleErrors, msg.text?.() || '', consoleBudget); });
  page.on?.('pageerror', (err) => appendConsoleError(consoleErrors, err?.message || err, consoleBudget));
  let stage = 'navigation';
  try {
    const targetUrl = new URL(viewport.route, url);
    if (targetUrl.origin !== new URL(url).origin) throw new Error('schema2-route-origin');
    await bounded(() => page.goto(targetUrl.href, { waitUntil: 'domcontentloaded', timeout: deadline.remaining() }));
    await checkpoint();
    stage = 'preconditions';
    for (const item of viewport.preconditions) {
      if (item.type === 'selector_present') { const count = await bounded(() => page.locator(item.selector).count()); observations.preconditions.push({ type: item.type, selector: item.selector, count, ok: count > 0 }); }
      else { const authenticated_count = await bounded(() => page.locator(item.authenticated_selector).count()); const login_count = await bounded(() => page.locator(item.login_selector).count()); observations.preconditions.push({ type: item.type, authenticated_count, login_count, ok: authenticated_count > 0 && login_count === 0 }); }
      await checkpoint();
    }
    const failedPrecondition = observations.preconditions.find((item) => !item.ok);
    if (failedPrecondition) return failedPrecondition.type === 'auth_state'
      ? fail('AUTH_STATE_MISMATCH', 'auth-state-mismatch', 'preconditions')
      : fail('PRECONDITION_FAILED', 'precondition-failed', 'preconditions');
    stage = 'actions';
    for (const item of viewport.actions) {
      const locator = item.selector ? page.locator(item.selector) : null; const target_count = locator ? await bounded(() => locator.count()) : null;
      const observation = item.type === 'scroll_into_view' ? { type: item.type, selector: item.selector, target_count, block: item.block, inline: item.inline, ok: target_count > 0 } : item.type === 'keyboard' ? { type: item.type, selector: item.selector || null, key: item.key, target_count, ok: target_count === null || target_count > 0 } : { type: item.type, selector: item.selector, target_count, ok: target_count > 0 };
      observations.actions.push(observation);
      if (!observation.ok) return fail('FAILED_FEATURE', 'feature-failed', 'actions');
      if (item.type === 'hover') await bounded(() => locator.hover()); else if (item.type === 'focus') await bounded(() => locator.focus()); else if (item.type === 'keyboard') { if (locator) await bounded(() => locator.press(item.key)); else await bounded(() => page.keyboard.press(item.key)); } else await bounded(() => locator.evaluate((element, alignment) => element.scrollIntoView(alignment), { block: item.block, inline: item.inline }));
      await checkpoint();
    }
    if (!observations.actions.every((item) => item.ok)) return fail('FAILED_FEATURE', 'feature-failed', 'actions');
    stage = 'checks';
    for (const item of viewport.checks) {
      if (item.type === 'selector_present') { const count = await bounded(() => page.locator(item.selector).count()); observations.checks.push({ type: item.type, selector: item.selector, count, ok: count > 0 }); }
      else if (item.type === 'aria_describedby') { const trigger = page.locator(item.trigger_selector), description = page.locator(item.description_selector); const trigger_count = await bounded(() => trigger.count()), description_count = await bounded(() => description.count()); const linked = (await bounded(() => trigger.getAttribute('aria-describedby'))) === item.description_selector.replace(/^[.#]/, ''); const visible = description_count > 0 && await bounded(() => description.isVisible()); observations.checks.push({ type: item.type, trigger_selector: item.trigger_selector, description_selector: item.description_selector, trigger_count, description_count, linked, visible, ok: trigger_count > 0 && linked && visible }); }
      else if (item.type === 'dimension') { const count = await bounded(() => page.locator(item.selector).count()); const actual = count ? await bounded(() => page.locator(item.selector).evaluate((node, property) => node[property], item.property)) : 0; const ok = item.operator === 'eq' ? actual === item.value : item.operator === 'lte' ? actual <= item.value : actual >= item.value; observations.checks.push({ type: item.type, selector: item.selector, property: item.property, operator: item.operator, expected: item.value, actual, count, ok: count > 0 && ok }); }
      else if (item.type === 'bounding_box') { const subject = page.locator(item.subject_selector), reference = page.locator(item.reference_selector); const subject_count = await bounded(() => subject.count()), reference_count = await bounded(() => reference.count()); const subject_box = subject_count ? await bounded(() => subject.boundingBox()) : null, reference_box = reference_count ? await bounded(() => reference.boundingBox()) : null; const contained = subject_box && reference_box && subject_box.x >= reference_box.x && subject_box.y >= reference_box.y && subject_box.x + subject_box.width <= reference_box.x + reference_box.width && subject_box.y + subject_box.height <= reference_box.y + reference_box.height; const overlaps = subject_box && reference_box && subject_box.x < reference_box.x + reference_box.width && subject_box.x + subject_box.width > reference_box.x && subject_box.y < reference_box.y + reference_box.height && subject_box.y + subject_box.height > reference_box.y; const present = subject_count === 1 && reference_count === 1 && subject_box && reference_box && Object.values(subject_box).every(Number.isFinite) && Object.values(reference_box).every(Number.isFinite); const ok = !present ? false : item.relation === 'contained_by' ? contained : item.relation === 'overlaps' ? overlaps : !overlaps; observations.checks.push({ type: item.type, subject_selector: item.subject_selector, reference_selector: item.reference_selector, relation: item.relation, subject_count, reference_count, subject_box, reference_box, ok: Boolean(ok) }); }
      else observations.checks.push({ type: 'console', errors: 'none', ok: consoleErrors.length === 0 });
      await checkpoint();
    }
    if (!observations.checks.every((item) => item.ok)) return fail('FAILED_FEATURE', 'feature-failed', 'checks');
    stage = 'capture';
    let screenshot = null; if (viewport.capture.screenshot) { screenshot = `${viewport.id}.png`; const screenshotPath = path.resolve(outputDir, screenshot); if (!pathWithin(outputDir, screenshotPath) || (existsSync(screenshotPath) && lstatSync(screenshotPath).isSymbolicLink())) throw new Error('screenshot-path-unsafe'); await bounded(() => page.screenshot({ path: screenshotPath, fullPage: false })); if (statSync(screenshotPath).size > SCHEMA2_SCREENSHOT_MAX_BYTES) { unlinkSync(screenshotPath); throw new Error('screenshot-oversized'); } }
    await checkpoint();
    return { id: viewport.id, width: viewport.width, height: viewport.height, status: 'PASS', status_reason: 'all-checks-passed', stage: 'complete', ...observations, console_errors: consoleErrors, screenshot };
  } catch (error) { return fail('BLOCKED_INFRA', error?.code === 'schema2-navigation-contained' || error?.message === 'schema2-route-origin' ? 'navigation-infra' : 'runtime-infra', stage); }
}

async function runSchema2Check({ playwright, request, url, outputDir, startedAt }) {
  const browser = await playwright.chromium.launch({ headless: true }); const viewports = []; const consoleBudget = { records: 0, bytes: 0 }; let cleanupFailed = false;
  try { for (const viewport of request.viewports) { const deadline = schema2Deadline(request.timeout_ms); let context; try { context = await withinSchema2Deadline(() => browser.newContext({ viewport: { width: viewport.width, height: viewport.height } }), deadline); viewports.push(await runSchema2Viewport(context, url, viewport, [], consoleBudget, outputDir, deadline)); } catch (error) { viewports.push({ id: viewport.id, width: viewport.width, height: viewport.height, status: 'BLOCKED_INFRA', status_reason: 'runtime-infra', stage: 'navigation', preconditions: [], actions: [], checks: [], console_errors: [], screenshot: null }); } finally { if (context && !await closeSchema2Resource(context)) cleanupFailed = true; } } } finally { if (!await closeSchema2Resource(browser)) cleanupFailed = true; }
  return cleanupFailed ? schema2CleanupFailureResult(request, viewports, startedAt, outputDir) : schema2Result(request, viewports, startedAt);
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
    if (request.schema === 2) return writeResult(outputDir, await runSchema2Check({ playwright, request, url, outputDir, startedAt }));
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
