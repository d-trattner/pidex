import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { validateBrowserSmokeRequest } from './request-schema.mjs';
import { validateBrowserSmokeResult } from './result-contract.mjs';
import { runBrowserSmokeCheck } from './check.mjs';

const request = {
  schema: 2, requester: 'pidex-qa', project_id: 'pidex-browser-smoke-demo', request_id: 'qa-schema2-rich', phase_run_id: 'pprun-abc123/pidex-qa/phase-6', created_at: '2026-07-01T12:00:00.000Z', preview: { managed: true, process: 'preview' }, timeout_ms: 10000,
  viewports: [{ id: 'mobile', width: 320, height: 800, route: '/dashboard', preconditions: [{ type: 'selector_present', selector: '.app' }], actions: [{ type: 'hover', selector: '.menu' }, { type: 'focus', selector: '.search' }, { type: 'keyboard', key: 'Tab' }, { type: 'scroll_into_view', selector: '.footer', block: 'end', inline: 'nearest' }], checks: [{ type: 'selector_present', selector: '.app' }, { type: 'aria_describedby', trigger_selector: '.help', description_selector: '.tip' }, { type: 'dimension', selector: '.table', property: 'scrollWidth', operator: 'lte', value: 320 }, { type: 'bounding_box', subject_selector: '.modal', reference_selector: '.shell', relation: 'contained_by' }, { type: 'console', errors: 'none' }], capture: { screenshot: true, console_errors: true } }],
};

test('schema2 closed rich-browser request accepts allowed operations and rejects extras before launch', () => {
  assert.equal(validateBrowserSmokeRequest(request).ok, true);
  assert.equal(validateBrowserSmokeRequest({ ...request, unexpected: true }).ok, false);
  assert.equal(validateBrowserSmokeRequest({ ...request, viewports: [{ ...request.viewports[0], actions: [{ type: 'click', selector: '.menu' }] }] }).ok, false);
});

test('schema2 result accepts exact derived observations and rejects inconsistent or excess fields', () => {
  const result = { schema: 2, ok: true, status: 'PASS', status_reason: 'all-checks-passed', project_id: request.project_id, request_id: request.request_id, phase_run_id: request.phase_run_id, requester: request.requester, preview_url_source: 'project-pipeline-registry', started_at: '2026-07-01T12:00:00.000Z', ended_at: '2026-07-01T12:00:01.000Z', viewports: [{ id: 'mobile', width: 320, height: 800, status: 'PASS', status_reason: 'all-checks-passed', stage: 'complete', preconditions: [{ type: 'selector_present', selector: '.app', count: 1, ok: true }], actions: [{ type: 'hover', selector: '.menu', target_count: 1, ok: true }, { type: 'focus', selector: '.search', target_count: 1, ok: true }, { type: 'keyboard', selector: null, key: 'Tab', target_count: null, ok: true }, { type: 'scroll_into_view', selector: '.footer', target_count: 1, block: 'end', inline: 'nearest', ok: true }], checks: [{ type: 'selector_present', selector: '.app', count: 1, ok: true }, { type: 'aria_describedby', trigger_selector: '.help', description_selector: '.tip', trigger_count: 1, description_count: 1, linked: true, visible: true, ok: true }, { type: 'dimension', selector: '.table', property: 'scrollWidth', operator: 'lte', expected: 320, actual: 300, count: 1, ok: true }, { type: 'bounding_box', subject_selector: '.modal', reference_selector: '.shell', relation: 'contained_by', subject_count: 1, reference_count: 1, subject_box: { x: 0, y: 0, width: 100, height: 100 }, reference_box: { x: 0, y: 0, width: 320, height: 800 }, ok: true }, { type: 'console', errors: 'none', ok: true }], console_errors: [], screenshot: 'mobile.png' }] };
  assert.equal(validateBrowserSmokeResult(result, request).ok, true);
  assert.equal(validateBrowserSmokeResult({ ...result, extra: true }, request).ok, false);
  assert.equal(validateBrowserSmokeResult({ ...result, ok: false }, request).ok, false);
  const forgedCompleteRuntime = { ...result, ok: false, status: 'BLOCKED_INFRA', status_reason: 'runtime-infra', viewports: result.viewports.map((viewport) => ({ ...viewport, status: 'BLOCKED_INFRA', status_reason: 'runtime-infra' })) };
  assert.equal(validateBrowserSmokeResult(forgedCompleteRuntime, request).ok, false);
});

test('schema2 runner creates isolated viewport evidence through fixed browser operations', async () => {
  const page = { on() {}, goto: async () => {}, locator: () => ({ count: async () => 1, getAttribute: async () => 'tip', isVisible: async () => true, evaluate: async (_fn, property) => property ? 300 : null, boundingBox: async () => ({ x: 0, y: 0, width: 100, height: 100 }), hover: async () => {}, focus: async () => {}, press: async () => {}, scrollIntoViewIfNeeded: async () => {} }), keyboard: { press: async () => {} }, screenshot: async ({ path: target }) => writeFileSync(target, 'image') };
  const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} }) } };
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request, outputDir: '/tmp/pidex-schema2-runner', playwright });
  assert.equal(result.schema, 2);
  assert.equal(result.status, 'PASS');
  assert.equal(result.viewports[0].screenshot, 'mobile.png');
});

test('schema2 registers immutable-origin guard before goto, aborts foreign traffic, and launches zero browsers for invalid requests', async () => {
  const registrations = [];
  let launchCount = 0;
  const page = { on() {}, goto: async () => { assert.equal(registrations.length, 1); await registrations[0]({ request: () => ({ url: () => 'http://localhost:42080/app.js' }), continue: async () => { page.continued = true; }, abort: async () => { page.aborted = true; } }); await registrations[0]({ request: () => ({ url: () => 'https://example.invalid/script.js' }), continue: async () => { page.continued = true; }, abort: async () => { page.aborted = true; } }); }, locator: () => ({ count: async () => 1 }), keyboard: { press: async () => {} } };
  const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ route: async (_pattern, handler) => registrations.push(handler), newPage: async () => page, close: async () => {} }), close: async () => { launchCount += 1; } }) } };
  const guarded = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], actions: [], checks: [], capture: { screenshot: false, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-guard', playwright });
  assert.equal(page.continued, true);
  assert.equal(page.aborted, true);
  assert.equal(guarded.status, 'BLOCKED_INFRA');
  assert.equal(guarded.status_reason, 'navigation-infra');
  const invalid = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], width: 0 }] }, outputDir: '/tmp/pidex-schema2-invalid', playwright });
  assert.equal(invalid.status_reason, 'invalid-viewport');
  assert.equal(launchCount, 1);
});

test('schema2 rejects unsafe viewport IDs, resolved foreign routes, and forged PASS observations', () => {
  assert.equal(validateBrowserSmokeRequest({ ...request, viewports: [{ ...request.viewports[0], id: '../../outside-evidence' }] }).ok, false);
  assert.equal(validateBrowserSmokeRequest({ ...request, viewports: [{ ...request.viewports[0], route: '/\\\\evil.example/path' }] }).ok, false);
  const forged = { schema: 2, ok: true, status: 'PASS', status_reason: 'all-checks-passed', project_id: request.project_id, request_id: request.request_id, phase_run_id: request.phase_run_id, requester: request.requester, preview_url_source: 'project-pipeline-registry', started_at: '2026-07-01T12:00:00.000Z', ended_at: '2026-07-01T12:00:01.000Z', viewports: [{ id: 'mobile', width: 320, height: 800, status: 'PASS', status_reason: 'all-checks-passed', stage: 'complete', preconditions: [{ type: 'selector_present', selector: '.forged', count: 0, ok: true }], actions: [{ type: 'hover', selector: '.menu', target_count: 1, ok: true }, { type: 'focus', selector: '.search', target_count: 1, ok: true }, { type: 'keyboard', selector: null, key: 'Tab', target_count: null, ok: true }, { type: 'scroll_into_view', selector: '.footer', target_count: 1, block: 'end', inline: 'nearest', ok: true }], checks: [{ type: 'selector_present', selector: '.app', count: 1, ok: true }, { type: 'aria_describedby', trigger_selector: '.help', description_selector: '.tip', trigger_count: 1, description_count: 1, linked: true, visible: true, ok: true }, { type: 'dimension', selector: '.table', property: 'scrollWidth', operator: 'lte', expected: 320, actual: 300, count: 1, ok: true }, { type: 'bounding_box', subject_selector: '.modal', reference_selector: '.shell', relation: 'contained_by', subject_count: 0, reference_count: 0, subject_box: null, reference_box: null, ok: true }, { type: 'console', errors: 'none', ok: true }], console_errors: [], screenshot: 'mobile.png' }] };
  assert.equal(validateBrowserSmokeResult(forged, request).ok, false);
});

test('schema2 applies absolute viewport deadline across hung action, check, and capture then closes context', async () => {
  const cases = [
    { name: 'action', actions: [{ type: 'hover', selector: '.menu' }], checks: [], capture: { screenshot: false, console_errors: false }, page: { locator: () => ({ count: async () => 1, hover: () => new Promise(() => {}) }) } },
    { name: 'check', actions: [], checks: [{ type: 'selector_present', selector: '.required' }], capture: { screenshot: false, console_errors: false }, page: { locator: () => ({ count: () => new Promise(() => {}) }) } },
    { name: 'capture', actions: [], checks: [], capture: { screenshot: true, console_errors: false }, page: { locator: () => ({ count: async () => 1 }), screenshot: () => new Promise(() => {}) } },
  ];
  for (const item of cases) {
    let closed = false;
    const page = { on() {}, goto: async () => {}, keyboard: { press: async () => {} }, ...item.page };
    const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ setDefaultTimeout() {}, newPage: async () => page, close: async () => { closed = true; } }), close: async () => {} }) } };
    const timed = await Promise.race([
      runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, timeout_ms: 1000, viewports: [{ ...request.viewports[0], preconditions: [], actions: item.actions, checks: item.checks, capture: item.capture }] }, outputDir: `/tmp/pidex-schema2-deadline-${item.name}`, playwright }),
      new Promise((resolve) => setTimeout(() => resolve({ timed_out: true }), 1300)),
    ]);
    assert.equal(timed.timed_out, undefined);
    assert.deepEqual([timed.status, timed.status_reason], ['BLOCKED_INFRA', 'runtime-infra']);
    assert.equal(closed, true);
  }
});

test('schema2 checkpoints delayed side effects after checks and capture before PASS', async () => {
  const listeners = new Map();
  const emit = (event, value) => Promise.all((listeners.get(event) || []).map((listener) => listener(value)));
  const page = {
    on: (event, listener) => listeners.set(event, [...(listeners.get(event) || []), listener]),
    goto: async () => {},
    locator: () => ({ count: async () => { emit('popup', { close: async () => new Promise((resolve) => setTimeout(resolve, 1)) }); return 1; } }),
    keyboard: { press: async () => {} },
  };
  const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} }) } };
  const preconditioned = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], preconditions: [{ type: 'selector_present', selector: '.required' }], actions: [], checks: [], capture: { screenshot: false, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-precondition-barrier', playwright });
  assert.deepEqual([preconditioned.status, preconditioned.status_reason], ['BLOCKED_INFRA', 'navigation-infra']);
  const checked = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], preconditions: [], actions: [], checks: [{ type: 'selector_present', selector: '.checked' }], capture: { screenshot: false, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-check-barrier', playwright });
  assert.deepEqual([checked.status, checked.status_reason], ['BLOCKED_INFRA', 'navigation-infra']);

  const captureListeners = new Map();
  const capturePage = {
    on: (event, listener) => captureListeners.set(event, [...(captureListeners.get(event) || []), listener]),
    goto: async () => {}, locator: () => ({ count: async () => 1 }), keyboard: { press: async () => {} },
    screenshot: async ({ path: target }) => { writeFileSync(target, 'image'); await Promise.all((captureListeners.get('popup') || []).map((listener) => listener({ close: async () => {} }))); },
  };
  const capturePlaywright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => capturePage, close: async () => {} }), close: async () => {} }) } };
  const captured = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], preconditions: [], actions: [], checks: [], capture: { screenshot: true, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-capture-barrier', playwright: capturePlaywright });
  assert.deepEqual([captured.status, captured.status_reason], ['BLOCKED_INFRA', 'navigation-infra']);
});

test('schema2 uses bounded viewport screenshot and rejects oversized artifact before next viewport', async () => {
  let screenshotOptions; const oversizedPath = '/tmp/pidex-schema2-oversized/mobile.png';
  const page = { on() {}, goto: async () => {}, locator: () => ({ count: async () => 1 }), keyboard: { press: async () => {} }, screenshot: async (options) => { screenshotOptions = options; writeFileSync(options.path, Buffer.alloc(2 * 1024 * 1024 + 1)); } };
  const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: async () => {} }), close: async () => {} }) } };
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], preconditions: [], actions: [], checks: [], capture: { screenshot: true, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-oversized', playwright });
  assert.equal(screenshotOptions.fullPage, false);
  assert.deepEqual([result.status, result.status_reason], ['BLOCKED_INFRA', 'runtime-infra']);
  assert.equal(existsSync(oversizedPath), false);
});

test('schema2 awaits delayed goto/action side-effect barriers and applies every exact scroll alignment', async () => {
  const alignments = ['start', 'center', 'end', 'nearest'];
  const scrolls = alignments.flatMap((block) => alignments.map((inline) => ({ type: 'scroll_into_view', selector: '.footer', block, inline })));
  const calls = []; let downloadCanceled = false; let chooserCleared = false; let popupClosed = false;
  const listeners = new Map(); const contextListeners = new Map(); let gotoSideEffects = true;
  const emit = async (event, value) => Promise.all((listeners.get(event) || []).map((listener) => listener(value)));
  const emitContext = async (event, value) => Promise.all((contextListeners.get(event) || []).map((listener) => listener(value)));
  const page = {
    on: (event, listener) => listeners.set(event, [...(listeners.get(event) || []), listener]),
    goto: async () => { if (gotoSideEffects) { await emit('download', { cancel: async () => { await new Promise((resolve) => setTimeout(resolve, 1)); downloadCanceled = true; } }); await emit('filechooser', { setInputFiles: async (files) => { await new Promise((resolve) => setTimeout(resolve, 1)); chooserCleared = Array.isArray(files) && files.length === 0; } }); await emit('popup', { close: async () => { await new Promise((resolve) => setTimeout(resolve, 1)); popupClosed = true; } }); } },
    locator: () => ({ count: async () => 1, evaluate: async (_fn, options) => { calls.push(options); }, hover: async () => { if (!gotoSideEffects) await emitContext('page', { close: async () => { popupClosed = true; } }); } }),
    keyboard: { press: async () => {} },
  };
  const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ on: (event, listener) => contextListeners.set(event, [...(contextListeners.get(event) || []), listener]), newPage: async () => page, close: async () => {} }), close: async () => {} }) } };
  const result = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], preconditions: [], actions: [{ type: 'hover', selector: '.menu' }, ...scrolls], checks: [], capture: { screenshot: false, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-barriers', playwright });
  assert.equal(downloadCanceled, true);
  assert.equal(chooserCleared, true);
  assert.equal(popupClosed, true);
  assert.equal(result.status, 'BLOCKED_INFRA');
  assert.equal(result.status_reason, 'navigation-infra');
  assert.deepEqual(calls, []);
  gotoSideEffects = false;
  const actionBlocked = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], preconditions: [], actions: [{ type: 'hover', selector: '.menu' }], checks: [], capture: { screenshot: false, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-action-barrier', playwright });
  assert.equal(actionBlocked.status_reason, 'navigation-infra');
  const safePage = { on() {}, goto: async () => {}, locator: () => ({ count: async () => 1, evaluate: async (_fn, options) => { calls.push(options); } }), keyboard: { press: async () => {} } };
  const safePlaywright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => safePage, close: async () => {} }), close: async () => {} }) } };
  const scrolled = await runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, viewports: [{ ...request.viewports[0], preconditions: [], actions: scrolls, checks: [], capture: { screenshot: false, console_errors: false } }] }, outputDir: '/tmp/pidex-schema2-scrolls', playwright: safePlaywright });
  assert.equal(scrolled.status, 'PASS');
  assert.deepEqual(calls, scrolls.map(({ block, inline }) => ({ block, inline })));
});

test('schema2 bounded cleanup returns typed runtime infra when context or browser close hangs', async () => {
  for (const hung of ['context', 'browser']) {
    const page = { on() {}, goto: async () => {}, locator: () => ({ count: async () => 1 }), keyboard: { press: async () => {} } };
    const playwright = { chromium: { launch: async () => ({ newContext: async () => ({ newPage: async () => page, close: () => hung === 'context' ? new Promise(() => {}) : Promise.resolve() }), close: () => hung === 'browser' ? new Promise(() => {}) : Promise.resolve() }) } };
    const timed = await Promise.race([
      runBrowserSmokeCheck({ url: 'http://localhost:42080/', request: { ...request, timeout_ms: 1000, viewports: [{ ...request.viewports[0], preconditions: [], actions: [], checks: [], capture: { screenshot: false, console_errors: false } }] }, outputDir: `/tmp/pidex-schema2-hung-${hung}-close`, playwright }),
      new Promise((resolve) => setTimeout(() => resolve({ timed_out: true }), 1300)),
    ]);
    assert.equal(timed.timed_out, undefined);
    assert.deepEqual([timed.status, timed.status_reason], ['BLOCKED_INFRA', 'runtime-infra']);
    assert.equal(timed.viewports[0].stage, 'capture');
  }
});
