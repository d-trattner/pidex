# Browser Smoke QA Substrate — Windows Dry-Run Smoke

Date: 2026-06-01
Operator: user-provided PowerShell transcript
Workspace: `C:\Users\Daniel\pidex`
Commit under test: pulled after `8b059a8 feat: add optional browser-smoke QA substrate`

## Commands and observed results

### Explicit skip

```powershell
.\install.windows.ps1 -DryRun -SkipBrowserSmoke
```

Result: PASS.

Key evidence:

```text
==> Skipping PIDEX browser-smoke support install
==> Windows bootstrap complete
```

### Explicit install dry-run

```powershell
.\install.windows.ps1 -DryRun -WithBrowserSmoke
```

Result: PASS.

Key evidence:

```text
==> Installing optional PIDEX browser-smoke support
PIDEX browser-smoke install
state: C:\Users\Daniel\pidex\state\browser-smoke
cache: C:\Users\Daniel\pidex\.cache\ms-playwright
This installs optional PIDEX-local Playwright support. It does not use npm global and does not mutate user projects.
DRY-RUN: mkdir -p C:\Users\Daniel\pidex\state\browser-smoke C:\Users\Daniel\pidex\.cache\ms-playwright
DRY-RUN: npm --prefix C:\Users\Daniel\pidex\state\browser-smoke install @playwright/test
DRY-RUN: PLAYWRIGHT_BROWSERS_PATH=C:\Users\Daniel\pidex\.cache\ms-playwright npx --prefix C:\Users\Daniel\pidex\state\browser-smoke playwright install chromium
```

Note: module runner writes evidence even in capability dry-run path:

```text
module capability evidence: C:\Users\Daniel\pidex\state\modules\evidence\2026-06-01.jsonl
```

### Non-interactive skip

```powershell
$env:PIDEX_NONINTERACTIVE="1"; .\install.windows.ps1 -DryRun
```

Result: PASS.

Key evidence:

```text
==> Non-interactive install; skipping PIDEX browser-smoke support (use -WithBrowserSmoke or PIDEX_WITH_BROWSER_SMOKE=1 to enable)
```

### Interactive prompt path

```powershell
Remove-Item Env:\PIDEX_NONINTERACTIVE
.\install.windows.ps1 -DryRun
```

Result: PASS.

The installer displayed the clear plain-language prompt:

```text
Install optional PIDEX browser-smoke support now?
This installs PIDEX-local Playwright/Chromium support for real-browser QA checks: page render, styles, console errors, and basic interactions.
Useful for web/UI/SSR/responsive work; unnecessary for CLI/API/docs/backend-only work.
It may download a large browser (~150-250MB), can be platform-sensitive, and can be installed later.
Install browser-smoke support? [y/N]: y
```

The operator answered `y` in dry-run mode. The installer delegated to the module capability and printed PIDEX-local install commands without downloading:

```text
PIDEX browser-smoke install
state: C:\Users\Daniel\pidex\state\browser-smoke
cache: C:\Users\Daniel\pidex\.cache\ms-playwright
DRY-RUN: npm --prefix C:\Users\Daniel\pidex\state\browser-smoke install @playwright/test
DRY-RUN: PLAYWRIGHT_BROWSERS_PATH=C:\Users\Daniel\pidex\.cache\ms-playwright npx --prefix C:\Users\Daniel\pidex\state\browser-smoke playwright install chromium
```

## Notes

The prompt is clear, but flags remain easier and less stateful for repeatable validation because environment variables such as `PIDEX_NONINTERACTIVE` persist in the shell session until removed.
