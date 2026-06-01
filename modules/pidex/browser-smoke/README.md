# PIDEX Browser Smoke Module

Optional first-party browser-smoke substrate for PIDEX QA.

## Capabilities

- `browser-smoke.preflight` — read-only Playwright/browser availability and bounded launch probe.
- `browser-smoke.install` — explicit PIDEX-local Playwright setup under `state/browser-smoke/` with browser cache under `.cache/ms-playwright/`. Add `--with-system-deps` only when host-level Linux packages may be installed.
- `browser-smoke.cleanup-check` — best-effort check for leftover browser-smoke processes.

## Storage

- Module source: `modules/pidex/browser-smoke/`
- Runtime dependencies: `state/browser-smoke/`
- Browser cache: `.cache/ms-playwright/`

Do not use npm-global Playwright by default. Do not mutate user projects unless the project already owns Playwright.

## Status contract

Status tokens are exported from `scripts/browser-smoke/status.mjs`.
