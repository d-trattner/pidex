# Windows status

PIDEX is currently developed and validated on Linux. The supported runtime path is the existing Linux/direct-mode workflow documented in the main README.

Windows compatibility is under active validation. This page is intentionally conservative: PIDEX still does **not** claim full native Windows runtime support, and Linux/direct mode remains the primary supported path. Native Windows now has focused evidence for the PowerShell bootstrap, Bash-backed `pnpm run check`, Docker sandbox helper runtime, and multiple real `/pd` Project Pipeline runs with Docker Desktop Linux containers, including managed preview approval and host-side browser-smoke validation for Vite React UI fixtures. Broader native Windows `/pidex`/`/pd` pipeline coverage still needs extended evidence.

## Current support statement

| Environment | Status | Notes |
|---|---|---|
| Linux | Supported/currently tested | Canonical PIDEX path. Use the existing `install.sh`, `dashboard/start.sh` or cross-platform `node dashboard/start.mjs`, and validation commands. |
| WSL2 | Safest Windows recommendation for full pipelines for now | Expected to be closest to the Linux path, but still needs explicit PIDEX smoke evidence before being called fully supported. |
| Windows + Git Bash | Experimental / under analysis | Pi documents a Git Bash-based Windows path. PIDEX still needs validation of delegated pipeline behavior, hooks, and broader path handling before support is claimed. Git Bash can satisfy Bash-backed validation commands such as `pnpm run check`. |
| Native PowerShell / CMD | Experimental, partially validated | `install.windows.ps1`, cross-platform `node dashboard/start.mjs`, Bash-backed `pnpm run check`, Docker sandbox helper smoke, and real `/pd` Project Pipeline runs with managed preview approval and browser-smoke evidence have passed with Docker Desktop Linux containers. Full native Windows pipeline support is not claimed yet. |

## Platform separation rule

Linux/direct-mode files are canonical and Linux-owned. Windows work should default to additive Windows-owned files, wrappers, docs, and rules.

Preferred future pattern:

| Linux-owned path | Preferred Windows-owned/additive path |
|---|---|
| `install.sh` | `install.windows.ps1` |
| `uninstall.sh` | `uninstall.windows.ps1` |
| `dashboard/start.sh` | `dashboard/start.mjs` cross-platform Node launcher |
| `scripts/release/public-readiness.sh` | `compat-windows.audit` capability |
| `git-security-hooks.install` capability | `scripts/git-hooks/install-global.windows.ps1` or explicit unsupported docs |

Do not add `if Windows then ... else ...` branches to Linux-owned runtime files unless explicitly approved and regression-proven.

## Read-only audit

Run the audit script to collect local readiness signals without changing files or settings:

```bash
node scripts/modules/run-check.mjs --capability compat-windows.audit --agent pidex-devops --phase maintenance --project "$PWD"
```

For machine-readable output:

```bash
node scripts/modules/run-check.mjs --capability compat-windows.audit --agent pidex-devops --phase maintenance --project "$PWD" -- --json
```

The audit reports:

- OS/platform and likely environment (`linux`, `wsl`, `windows-git-bash`, `windows-native`, etc.)
- availability of `bash`, `node`, `npm`, pinned `pnpm`, optional `corepack`, `git`, and `pi`
- PIDEX checkout path shape
- dashboard prerequisite signals
- known unsupported or risky Windows entrypoints

The audit is informational. Missing tools or risky entrypoints are reported as findings; the script does not install anything, modify configuration, or start PIDEX services.

## Known risky or unsupported areas on Windows

These areas need more evidence before PIDEX can make a stronger Windows support claim:

- `install.sh` and `uninstall.sh` are Linux-owned Bash entrypoints.
- `dashboard/start.sh` is a Linux-owned dashboard launcher; use `node dashboard/start.mjs` on native Windows where Bash is unavailable.
- `pnpm run check` is Bash-backed and is not a pure native PowerShell validation path; use Git Bash/WSL or a future Windows-owned check wrapper.
- global Git hook install/uninstall scripts are Linux-owned and may not map cleanly to Windows Git configuration.
- provider/delegate and broader/full pipeline scripts still need native Windows validation of delegated agent behavior, auth handling, and path quoting beyond the focused Project Pipeline smoke/preview/browser-smoke scenarios.
- native PowerShell support requires more Windows-owned wrappers and smoke tests before support can be promoted.

## Experimental PowerShell bootstrap

PIDEX includes an additive Windows-owned bootstrap script:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/master/install.windows.ps1 | iex
```

For testing this initiative branch before merge:

```powershell
$env:PIDEX_INSTALL_BRANCH='feat/pnpm-package-manager-hardening'; irm https://raw.githubusercontent.com/d-trattner/pidex/feat/pnpm-package-manager-hardening/install.windows.ps1 | iex
```

Safer inspect-first form:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/master/install.windows.ps1 -OutFile install.windows.ps1
notepad .\install.windows.ps1
powershell -ExecutionPolicy Bypass -File .\install.windows.ps1
```

The bootstrap is experimental. It clones/verifies `$HOME\pidex`, checks Git/Node/npm/pinned pnpm/Pi/Git Bash, requires Node >=22.12.0 and Pi CLI >=0.78.0, adds Git Bash to PATH for the installer session, runs the Node read-only audit, installs PIDEX workspace dependencies when missing with `pnpm install --frozen-lockfile --ignore-scripts` when `pnpm-lock.yaml` is present, and runs `pi install`. Corepack may provide pnpm, but standalone `pnpm@10.33.0` is also supported. It does not require Python for bootstrap, does not call `install.sh`, and does not install global Git hooks.

## Experimental uninstall helper

Windows includes an additive PowerShell uninstall helper:

```powershell
cd $HOME\pidex
.\uninstall.windows.ps1
```

It removes PIDEX from Pi settings with `pi uninstall $HOME\pidex`, preserves the checkout by default, and does not manage global Git hooks.

Useful options:

```powershell
.\uninstall.windows.ps1 -DryRun
.\uninstall.windows.ps1 -RemoveCheckout
.\uninstall.windows.ps1 -RemoveAstGrep
```

`-RemoveAstGrep` only removes `@ast-grep/cli` when the PIDEX install marker exists.

For a separate PowerShell window/session, expose Git Bash before running Bash-backed pnpm checks:

```powershell
$env:Path = "C:\Program Files\Git\bin;$env:Path"
pnpm run public:check
```

Initial Windows 11 bootstrap evidence: the bootstrap installed PIDEX into Pi, `/reload` loaded PIDEX skills/prompts/extension, `/pidex` pre-flight started without edits, `pnpm run public:check` passed via PowerShell after adding Git Bash to PATH, and `pnpm -C dashboard run typecheck` plus `pnpm -C dashboard run build` passed with Node 26. This is still not a full Windows runtime support claim.

Additional native Windows Docker sandbox evidence, refreshed on 2026-06-07 from `$HOME\pidex` with Docker Desktop Linux containers, standalone `pnpm@10.33.0`, and Pi CLI `0.78.0` for current pipeline testing:

- `docker run --rm node:22-slim node --version` succeeded with Node `v22.22.3` inside Docker.
- The `sandbox.probe` runtime check returned `ok: true` with `os: "windows-git-bash"` and confirmed Docker daemon, Linux container, Node container, temp mount write, and host-observed write.
- Targeted sandbox runtime tests passed from native PowerShell: `probe`, `lifecycle`, `run-command`, `diff`, `apply`, `extract-artifacts`, and `cleanup`.
- Extension sandbox tests passed after Windows file-URL and test command-shape fixes: `sandbox-host-bash`, `child-extensions`, and `sandbox-tool-call`.
- A real helper smoke passed from native PowerShell: `run-command` edited a copied workspace through Docker, `extract-artifacts --check` found the assigned artifact, `diff` produced a source patch excluding gitignored `agents.output/**`, `apply` updated the host fixture, artifact extraction copied `agents.output/implementation/test.md`, cleanup removed the workspace, and no `pidex.sandbox=true` containers remained.

## Experimental dashboard launcher

Windows uses the cross-platform Node dashboard launcher; Bash is not required for starting the dashboard:

```powershell
cd $HOME\pidex
node dashboard/start.mjs
```

On native Windows, the default is foreground/in-process to avoid visible cmd-window churn from spawned helper processes. Keep that PowerShell/CMD window open while using the dashboard, and stop it with `Ctrl+C`.

Useful options:

```powershell
node dashboard/start.mjs --host 0.0.0.0 --domain your.local.name
node dashboard/start.mjs --production
```

`--production` forces the production build+preview path. The default native Windows path intentionally skips that path and starts the local dev server in-process for calmer one-command startup.

A local friendly domain can also be configured in `$HOME\pidex\config\dashboard.local.json`:

```json
{
  "domain": "your.local.name"
}
```

The launcher is experimental. On Linux it can start detached and prints the local URL. On native Windows it stays attached by default to keep startup predictable and avoid flashing helper console windows.

Additional native Windows Project Pipeline evidence, refreshed on 2026-06-29 and 2026-07-06 from `$HOME\pidex` with Docker Desktop Linux containers and standalone `pnpm@10.33.0`:

- `pnpm run check` passed from native PowerShell with Git Bash available for Bash-backed checks.
- `install.windows.ps1` completed and installed the local PIDEX checkout into Pi.
- `/pdproject use project-pipeline` saved Project Pipeline mode for a disposable docs project.
- `/pd` ran a low docs-improvement task through the persistent Docker Project Sandbox with `no_fallback=true`.
- Full Project Pipeline phase chain completed: planner, critic, implementer, code-reviewer, security, and QA.
- `/pdproject runs`, `/pdproject artifacts`, and confirmed `/pdproject remove` worked.
- Automatic managed preview gates passed for simple and dashboard-style Vite React TypeScript fixtures: Project Pipeline completed through QA/UAT, preview started from inside the Docker Project Sandbox, localhost URLs were presented for user approval, HTTP 200/content checks passed, and approval/stop flows worked.
- Windows full `/pd` from home passed for `pidex-win-pd-smoke-2`: QA emitted the canonical Project Pipeline browser-smoke request schema, the host bridge resolved the managed preview URL from the Project Pipeline registry (`http://localhost:42120`), PIDEX-local Playwright returned `BROWSER-SMOKE-PASS`, title/text/selector/url/console checks passed, and screenshot evidence was archived under `browser-smoke/**`.
- Project Pipeline Docker helper calls now guard Git Bash/MSYS path conversion internally, so operators should not need to remember `MSYS_NO_PATHCONV=1` for PIDEX-managed Docker calls.
- Windows-specific fixes were required for LF shell checkout, Bash path tests, Docker image auto-build, archive path normalization, credential staging through the cache volume, safe Project Pipeline passthrough args, Pi settings sanitization inside Docker, preview port adoption, preview `$PORT` expansion, and Vite default preview command handling.

## Recommended Windows approach today

If you are on Windows and want to experiment with PIDEX today, prefer WSL2 for the broadest Linux-equivalent path. If you use native Windows, start with the experimental PowerShell bootstrap above or run the audit script first. Project Pipeline can be tested from native PowerShell/Pi with Docker Desktop Linux containers, including managed preview and browser-smoke flows, but full native Windows support remains experimental until more medium/high scenarios and broader workflow coverage are collected.

## Next native Windows extended testing

Before running real native Windows `/pidex` or `/pd` pipeline tests, verify the active Pi CLI is current enough:

```powershell
npm install -g @earendil-works/pi-coding-agent@0.78.0
pi --version
pi install C:\Users\Daniel\pidex
```

Pi `0.75.5` was observed to make child specialist spawns exit immediately with no stderr/stdout/tool turns, so it is not valid evidence for sandbox specialist routing.

Recommended next evidence before promoting Windows status:

1. Run more medium/high real `/pd` Project Pipeline scenarios from native Windows/Pi.
2. Exercise existing-project source changes and confirm Docker Project Sandbox persistence across multiple runs.
3. Run or defer a focused native Windows hardened-pipeline scenario separately from Project Pipeline.
4. Confirm provider auth behavior for non-Pi provider credentials when copied into disposable Project Sandboxes.
5. Record whether Git Bash is required for each Bash-backed validation step, and keep that separate from Docker Project Pipeline success.
