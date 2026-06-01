# Browser Smoke QA Substrate — Linux Real Install/Launch Attempt

Date: 2026-06-01
Remote: `root@10.0.0.107`
Workspace: `/tmp/pidex-browser-smoke-linux`

## Scope

Operator approved testing the deferred real opt-in install/launch path on the disposable Linux test server.

## Results

### PIDEX-local package install

The real `browser-smoke.install` command timed out under an outer 600s timeout. Inspection showed PIDEX-local package dependencies were installed under:

```text
/tmp/pidex-browser-smoke-linux/state/browser-smoke/
```

Observed files:

```text
state/browser-smoke/package.json
state/browser-smoke/package-lock.json
state/browser-smoke/node_modules/.package-lock.json
```

### Browser binary download

The browser install was retried after the operator asked to try again, using a clean PIDEX-owned browser cache and extended Playwright download connection timeout:

```bash
rm -rf .cache/ms-playwright
PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT=120000 timeout 1200 node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --yes --timeout-ms 900000
```

Result: still timed out under the outer 1200s guard. Post-run inspection showed the PIDEX-local Playwright package remained installed, but browser binaries were still absent; `.cache/ms-playwright/` contained only `.links/` metadata.

Direct browser install command was also attempted with a longer timeout:

```bash
PLAYWRIGHT_BROWSERS_PATH=$PWD/.cache/ms-playwright timeout 900 npm --prefix state/browser-smoke exec playwright -- install chromium
```

Result: `BLOCKED_INFRA`.

Evidence:

```text
Downloading Chrome for Testing 148.0.7778.96 (playwright chromium v1223) from https://cdn.playwright.dev/builds/cft/148.0.7778.96/linux64/chrome-linux64.zip
0% of 175.4 MiB
Error: Request to https://storage.googleapis.com/chrome-for-testing-public/148.0.7778.96/linux64/chrome-linux64.zip timed out after 30000ms
```

The remote host/network could not complete the 175.4 MiB Chromium download reliably. Package-level Playwright setup is present (`Version 1.60.0`), but browser binary installation is incomplete on this server.

### Bounded launch probe hardening

The initial preflight launch probe could hang until the outer process timeout. Implementation was hardened to execute browser launch in a child process with a `spawnSync(..., { timeout })` boundary via:

```text
modules/pidex/browser-smoke/scripts/browser-smoke/launch-probe.mjs
```

Revalidation after hardening:

```bash
node --check modules/pidex/browser-smoke/scripts/browser-smoke/preflight.mjs
node --check modules/pidex/browser-smoke/scripts/browser-smoke/launch-probe.mjs
npm run modules:validate
timeout 45 node scripts/modules/run-check.mjs --capability browser-smoke.preflight --agent orchestrator --phase maintenance --project "$PWD" -- --json --timeout-ms 20000
```

Result: PASS as bounded infra classification:

```json
{
  "type": "browser-smoke-preflight",
  "status": "BROWSER-SMOKE-BLOCKED-INFRA",
  "reason": "browser_launch_probe_timeout",
  "source": "pidex-local",
  "package": "playwright",
  "resolved": "/tmp/pidex-browser-smoke-linux/state/browser-smoke/node_modules/playwright/index.js",
  "ok": false,
  "error": "launch probe timed out after 20000ms"
}
```

## Runaway finding after retry

After the retry, the operator inspected the host console while SSH was timing out. The culprit was confirmed as Playwright's out-of-process browser downloader:

```text
/usr/local/bin/node /tmp/pidex-browser-smoke-linux/state/browser-smoke/node_modules/playwright-core/lib/entry/oopBrowserDownload.js
node /tmp/pidex-browser-smoke-linux/state/browser-smoke/node_modules/.bin/playwright install chromium
```

Observed states included `Dl` and high CPU. Manual cleanup killed these processes and restarted SSH.

This exposed an install-command lifecycle gap: an outer shell `timeout` can leave Playwright/npm grandchildren behind. The module install implementation was therefore hardened to run commands in a managed process group on Linux and use `taskkill /t /f` on Windows timeout.

## Verdict

`BLOCKED_INFRA`, not feature failure.

The real install path partially succeeded for PIDEX-local npm package setup, but browser binary download was blocked/hung in Playwright's downloader on this server. The launch path now fails bounded and reports `BROWSER-SMOKE-BLOCKED-INFRA` instead of hanging, and install command timeouts now attempt process-tree cleanup.

## Follow-up

- Actual browser download/launch should be tested on a host with reliable access to Playwright/Chrome CDN, e.g. the operator's Windows host where browser tooling may already be available.
- The module install command was corrected to use:

```bash
npm --prefix <state/browser-smoke> exec playwright -- install chromium
```

instead of the less reliable `npx --prefix ...` form.
