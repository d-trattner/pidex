# PIDEX Browser Smoke Module

Optional first-party browser-smoke substrate for PIDEX QA.

## Capabilities

- `browser-smoke.preflight` — read-only Playwright/browser availability and bounded launch probe.
- `browser-smoke.install` — explicit PIDEX-local Playwright setup under `state/browser-smoke/` with browser cache under `.cache/ms-playwright/`.
- `browser-smoke.cleanup-check` — best-effort check for leftover browser-smoke processes.

## Storage

- Module source: `modules/pidex/browser-smoke/`
- Runtime dependencies: `state/browser-smoke/`
- Browser cache: `.cache/ms-playwright/`

Do not use npm-global Playwright by default. Do not mutate user projects unless the project already owns Playwright.

## Install modes

Package + browser cache install does not require root if the PIDEX checkout is writable:

```bash
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --yes
```

Minimal Linux servers may also need host-level Chromium dependencies. This is intentionally separate because it runs Playwright's `install-deps chromium`, uses apt, requires root/passwordless sudo, and modifies system packages:

```bash
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --yes --with-system-deps
```

If system dependencies are missing, preflight returns `BROWSER-SMOKE-BLOCKED-INFRA` with browser launch errors such as missing `libnspr4.so`/`libnss3.so`.

## Status contract

Status tokens are exported from `scripts/browser-smoke/status.mjs`.
