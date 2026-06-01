#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [resolvedModule, cacheDir] = process.argv.slice(2);
if (!resolvedModule || !cacheDir) {
  console.error(JSON.stringify({ ok: false, reason: 'missing_probe_args' }));
  process.exit(2);
}

try {
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= cacheDir;
  const mod = await import(pathToFileURL(resolvedModule).href);
  const chromium = mod.chromium || mod.default?.chromium;
  if (!chromium) {
    console.log(JSON.stringify({ ok: false, reason: 'chromium_api_unavailable' }));
    process.exit(1);
  }
  const executablePath = chromium.executablePath();
  try {
    await access(executablePath);
  } catch {
    console.log(JSON.stringify({ ok: false, reason: 'browser_executable_missing', executable_path: executablePath }));
    process.exit(1);
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    await browser.close();
    console.log(JSON.stringify({ ok: true, executable_path: executablePath }));
  } catch (error) {
    try { if (browser) await browser.close(); } catch {}
    console.log(JSON.stringify({ ok: false, reason: 'browser_launch_failed', executable_path: executablePath, error: String(error?.message || error) }));
    process.exit(1);
  }
} catch (error) {
  console.log(JSON.stringify({ ok: false, reason: 'launch_probe_exception', error: String(error?.message || error) }));
  process.exit(1);
}
