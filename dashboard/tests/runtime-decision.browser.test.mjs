// Real Chromium, existing local executable only. No downloads, application DB or model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { projectDecisionStatus } from '../../scripts/runtime/decision-status.mjs';

const executable = process.env.PIDEX_BROWSER_EXECUTABLE;
assert.ok(executable && fs.existsSync(executable), 'Set PIDEX_BROWSER_EXECUTABLE to an existing local Chromium executable; never auto-install.');
const root = fileURLToPath(new URL('../', import.meta.url));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pidex-decision-browser-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, server, pendingResponse, requests = 0, mode = 'good';
const errors = [], network = [];
const data = projectDecisionStatus({ schema_version: 1, status: 'unregistered', binding: 'unbound', can_dispatch: true }, { observer: 'dashboard', observedAt: '2026-09-11T12:00:00.000Z' });
async function until(fn, label) {
  for (let i = 0; i < 300; i++) { if (await fn()) return; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
try {
  const id = '\0pidex-decision-entry';
  server = await createServer({ configFile: false, root, appType: 'custom', logLevel: 'silent', plugins: [react(), {
    name: 'decision-fixture', resolveId(source) { if (source === '/__decision-entry.tsx') return id; },
    load(source) { if (source === id) return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {QueryClient,QueryClientProvider} from '@tanstack/react-query'; import {RuntimeDecisionPanel} from '/components/runtime-decision-panel.tsx'; const client=new QueryClient(); let root; window.mountPanel=()=>{root=createRoot(document.getElementById('app'));root.render(React.createElement(QueryClientProvider,{client},React.createElement(RuntimeDecisionPanel)));}; window.unmountPanel=()=>root.unmount(); window.mountPanel();`; },
  }], server: { host: '127.0.0.1', port: 0, fs: { allow: [path.dirname(root)] } } });
  server.middlewares.use(async (req, res, next) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/', '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><script type="module" src="/__decision-entry.tsx"></script></body></html>')); return;
    }
    if (req.url === '/api/summary?view=decision-status') {
      requests++; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      if (mode === 'hold') { pendingResponse = res; return; }
      res.end(JSON.stringify(mode === 'malformed' ? { schema: data.schema, observer: 'dashboard' } : data)); return;
    }
    next();
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = spawn(executable, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; browser.stderr.on('data', chunk => { stderr += chunk; });
  await until(() => fs.existsSync(path.join(profile, 'DevToolsActivePort')) || browser.exitCode !== null, 'Chromium startup');
  assert.equal(browser.exitCode, null, stderr);
  const port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(row => row.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let serial = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const ticket = pending.get(message.id); pending.delete(message.id); if (ticket) message.error ? ticket.reject(new Error(JSON.stringify(message.error))) : ticket.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent') network.push(message.params.request.url);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    const timer = setTimeout(() => { if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`)); }, 15000); timer.unref();
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  const text = () => evaluate('document.body.innerText');
  const click = () => evaluate("document.querySelector('button').click()");
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Page.navigate', { url: origin });
  await until(async () => (await text()).includes('Noch nicht abgefragt'), 'initial render');
  await delay(200); assert.equal(requests, 0, 'no automatic observation on mount');
  await click(); await until(async () => (await text()).includes(data.observed_at), 'manual response');
  assert.equal(requests, 1); assert.match(await text(), /Installiert: Nicht nachgewiesen/); assert.match(await text(), /Legacy-Dispatch erlaubt/);
  mode = 'hold'; await click(); await until(async () => (await text()).includes('Beobachtung läuft'), 'refresh');
  assert.doesNotMatch(await text(), /2026-09-11T12:00:00/); assert.equal(await evaluate("document.querySelector('button').disabled"), true);
  await until(() => Boolean(pendingResponse), 'held request'); pendingResponse.statusCode = 503; pendingResponse.end('{}'); pendingResponse = null;
  await until(async () => (await text()).includes('Status nicht verfügbar'), 'error');
  await delay(200); assert.equal(requests, 2, 'no automatic retry'); assert.doesNotMatch(await text(), /2026-09-11T12:00:00/);
  mode = 'malformed'; await click(); await until(() => requests === 3, 'malformed request');
  await until(async () => (await text()).includes('Status nicht verfügbar'), 'malformed response refused');
  mode = 'good'; await click(); await until(async () => (await text()).includes(data.observed_at), 'manual recovery');
  await evaluate("window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online'))"); await delay(200); assert.equal(requests, 4, 'no focus/reconnect observation');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, 'mobile card fits viewport');
  if (process.env.PIDEX_BROWSER_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.PIDEX_BROWSER_EVIDENCE_DIR, { recursive: true });
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(process.env.PIDEX_BROWSER_EVIDENCE_DIR, 'decision-mobile.png'), Buffer.from(screenshot.data, 'base64'));
  }
  await evaluate('window.unmountPanel()'); await delay(100); await evaluate('window.mountPanel()');
  await until(async () => (await text()).includes('Noch nicht abgefragt'), 'remount forgets old response'); assert.equal(requests, 4);
  assert.deepEqual(errors, []); assert.ok(network.every(url => url.startsWith(origin + '/')), 'no external application requests');
  console.log(JSON.stringify({ status: 'passed', realBrowser: true, requests, checks: ['manual', 'refresh-hides-old', 'error-hides-old', 'no-retry', 'schema-refusal', 'recovery', 'no-focus-reconnect', 'mobile', 'remount-forgets', 'no-external-requests'] }));
  await send('Browser.close');
} finally {
  pendingResponse?.end('{}'); socket?.close();
  if (browser && browser.exitCode === null) { const exited = once(browser, 'exit'); browser.kill('SIGTERM'); await exited; }
  await server?.close(); fs.rmSync(profile, { recursive: true, force: true });
}
