# Browser Smoke QA Substrate — Clean Linux Full Success

Date: 2026-06-01
Remote: `root@10.0.0.107`
Workspace: `/root/pidex-browser-smoke-clean`
Source: clean clone from GitHub
Commit: `92665e2`

## Scope

Clean disk-backed Linux validation after adding explicit browser-smoke system dependency support and user disclosure.

## Commands

```bash
rm -rf /root/pidex-browser-smoke-clean
mkdir -p /root/pidex-browser-smoke-clean
cd /root/pidex-browser-smoke-clean
git clone https://github.com/d-trattner/pidex.git .
git rev-parse --short HEAD
bash -n install.sh
node --check modules/pidex/browser-smoke/scripts/browser-smoke/install.mjs
node --check modules/pidex/browser-smoke/scripts/browser-smoke/preflight.mjs
node --check modules/pidex/browser-smoke/scripts/browser-smoke/launch-probe.mjs
npm run modules:validate
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --dry-run --yes --with-system-deps
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --yes --with-system-deps --timeout-ms 600000
node scripts/modules/run-check.mjs --capability browser-smoke.preflight --agent orchestrator --phase maintenance --project "$PWD" -- --json --timeout-ms 30000
node scripts/modules/run-check.mjs --capability browser-smoke.cleanup-check --agent orchestrator --phase maintenance --project "$PWD" -- --json
```

## Results

- clean clone HEAD: `92665e2`
- syntax checks: PASS
- `npm run modules:validate`: PASS
- dry-run with `--with-system-deps`: PASS and disclosed root/system-package warning
- real `browser-smoke.install --yes --with-system-deps`: PASS
  - Playwright package installed PIDEX-local under `state/browser-smoke/`
  - system deps checked/installed via apt (`install-deps chromium`)
  - Chromium, FFmpeg, and Chromium Headless Shell downloaded under `.cache/ms-playwright/`
- preflight launch probe: PASS

Preflight result:

```json
{
  "type": "browser-smoke-preflight",
  "status": "BROWSER-SMOKE-PASS",
  "reason": "browser_launch_probe_passed",
  "source": "pidex-local",
  "ok": true,
  "executable_path": "/root/pidex-browser-smoke-clean/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
  "exit_code": 0
}
```

Cleanup result:

```json
{
  "status": "BROWSER-SMOKE-PASS",
  "reason": "no_browser_smoke_processes_detected",
  "process_count": 0
}
```

## Verdict

PASS.

The full clean Linux path works when using disk-backed storage and explicit `--with-system-deps` on a host where root/apt changes are allowed.
