---
ID: 024
Origin: 024
UUID: 1ee1f134
Status: Implemented
---

# Browser Smoke QA Substrate Implementation

## Summary

Implemented MVP optional first-party PIDEX browser-smoke substrate.

## Files changed

- `modules/pidex/browser-smoke/module.json`
- `modules/pidex/browser-smoke/README.md`
- `modules/pidex/browser-smoke/scripts/browser-smoke/status.mjs`
- `modules/pidex/browser-smoke/scripts/browser-smoke/paths.mjs`
- `modules/pidex/browser-smoke/scripts/browser-smoke/preflight.mjs`
- `modules/pidex/browser-smoke/scripts/browser-smoke/install.mjs`
- `modules/pidex/browser-smoke/scripts/browser-smoke/cleanup-check.mjs`
- `modules/pidex/browser-smoke/scripts/browser-smoke/status.tdd.test.mjs`
- `install.sh`
- `install.windows.ps1`
- `.gitignore`
- `package.json`

## Implemented capabilities

- `browser-smoke.preflight`
  - read-only package detection and bounded Chromium launch probe;
  - project-local Playwright preferred over PIDEX-local runtime;
  - canonical status tokens emitted.
- `browser-smoke.install`
  - explicit PIDEX-local install under `state/browser-smoke/`;
  - browser cache under `.cache/ms-playwright/`;
  - supports `--dry-run`, `--package-only`, `--with-browsers`, `--timeout-ms`.
- `browser-smoke.cleanup-check`
  - best-effort leftover process visibility using PIDEX cache/module markers.

## Installer behavior

Linux:

- `--with-browser-smoke` explicitly installs via module capability.
- `--skip-browser-smoke` skips.
- interactive TTY default asks a plain-language browser-smoke prompt with default No.
- non-interactive skips with enablement instructions.

Windows:

- `-WithBrowserSmoke`, `-SkipBrowserSmoke`, and `-NonInteractive` added.
- env overrides supported: `PIDEX_WITH_BROWSER_SMOKE`, `PIDEX_SKIP_BROWSER_SMOKE`, `PIDEX_INSTALL_BROWSER_SMOKE`, `PIDEX_NONINTERACTIVE`, `CI`.
- interactive host asks plain-language prompt with default No.
- non-interactive skips with enablement instructions.

## Safety constraints preserved

- No npm-global Playwright install.
- No user project mutation for generic PIDEX browser-smoke setup.
- No silent browser download in non-interactive/default skip path.
- Runtime/cache paths ignored by Git.
- Status tokens are pinned in executable source of truth: `status.mjs`.

## TDD Compliance

| Requirement | Status | Evidence |
|---|---|---|
| Status token source-of-truth has executable test | PASS | `modules/pidex/browser-smoke/scripts/browser-smoke/status.tdd.test.mjs` |
| Module manifest validates before use | PASS | `npm run modules:validate` |
| No browser download in dry-run install path | PASS | `browser-smoke.install --dry-run --yes` output only prints intended commands |
| Preflight can classify unconfigured state without install side effects | PASS | `browser-smoke.preflight --json --no-launch` returned `BROWSER-SMOKE-SKIP-NOT-CONFIGURED` |
| Cleanup check avoids self-process false positives | PASS | `browser-smoke.cleanup-check --json` returned `BROWSER-SMOKE-PASS` after refinement |
| Windows runtime syntax validated | DEFERRED_TO_QA | `pwsh` unavailable in local Linux environment; PowerShell dry-run/parse validation required in QA/devops |

## Validation performed

```bash
bash -n install.sh
node modules/pidex/browser-smoke/scripts/browser-smoke/status.tdd.test.mjs
npm run modules:validate
node scripts/modules/run-check.mjs --capability browser-smoke.preflight --agent orchestrator --phase maintenance --project "$PWD" -- --json --no-launch
node scripts/modules/run-check.mjs --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$PWD" -- --dry-run --yes
node scripts/modules/run-check.mjs --capability browser-smoke.cleanup-check --agent orchestrator --phase maintenance --project "$PWD" -- --json
```

Results:

- `bash -n install.sh`: PASS
- status contract test: PASS
- `npm run modules:validate`: PASS
- `browser-smoke.preflight --json --no-launch`: PASS with `BROWSER-SMOKE-SKIP-NOT-CONFIGURED` (expected before install)
- `browser-smoke.install --dry-run --yes`: PASS, no download/mutation
- `browser-smoke.cleanup-check --json`: PASS, no browser-smoke processes detected
- PowerShell parse check skipped locally because `pwsh` is not installed in this Linux environment; Windows dry-run validation remains for QA/devops.

<!-- ROUTING
verdict: IMPLEMENTED
route_to: pidex-code-reviewer
reason: Browser-smoke module MVP, installer integration, status contract, and artifact hygiene implemented.
context_file: agents.output/implementation/browser-smoke-qa-substrate-implementation.md
-->
