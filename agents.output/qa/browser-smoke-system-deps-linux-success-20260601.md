# Browser Smoke QA Substrate — Linux System Deps Success

Date: 2026-06-01
Remote: `root@10.0.0.107`
Workspace: `/root/pidex-browser-smoke-linux`

## Change under test

Added explicit module opt-in flag:

```bash
--with-system-deps
```

to `browser-smoke.install`. This runs:

```bash
npm --prefix state/browser-smoke exec playwright -- install-deps chromium
```

It is intentionally explicit because it uses apt and mutates host-level Linux packages.

## Validation

Local validation before remote:

```bash
node --check modules/pidex/browser-smoke/scripts/browser-smoke/install.mjs
npm run modules:validate
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --dry-run --yes --with-system-deps
```

Remote real install:

```bash
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --yes --with-system-deps --timeout-ms 600000
```

Result: PASS.

Playwright installed/updated required Debian 13 Chromium dependencies, including `libnspr4`, `libnss3`, `libatk*`, `libxdamage1`, `libxkbcommon0`, `xvfb`, and fonts.

Then browser install completed from existing cache:

```text
browser-smoke install complete
```

Remote preflight after system deps:

```bash
node scripts/modules/run-check.mjs --capability browser-smoke.preflight --agent orchestrator --phase maintenance --project "$PWD" -- --json --timeout-ms 30000
```

Result: PASS.

```json
{
  "type": "browser-smoke-preflight",
  "status": "BROWSER-SMOKE-PASS",
  "reason": "browser_launch_probe_passed",
  "source": "pidex-local",
  "package": "playwright",
  "ok": true,
  "executable_path": "/root/pidex-browser-smoke-linux/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome",
  "exit_code": 0
}
```

Cleanup check:

```bash
node scripts/modules/run-check.mjs --capability browser-smoke.cleanup-check --agent orchestrator --phase maintenance --project "$PWD" -- --json
```

Result: PASS.

```json
{
  "status": "BROWSER-SMOKE-PASS",
  "reason": "no_browser_smoke_processes_detected",
  "process_count": 0
}
```

## Verdict

PASS.

Complete Linux path now works when:

1. workspace/cache are on disk-backed storage instead of memory-pressured `/tmp` tmpfs;
2. browser binaries are installed; and
3. system dependencies are explicitly installed with `--with-system-deps`.
