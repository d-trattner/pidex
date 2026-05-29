# Windows status

PIDEX is currently developed and validated on Linux. The supported runtime path is the existing Linux/direct-mode workflow documented in the main README.

Windows compatibility is under analysis. This page is intentionally conservative: Milestone A adds clarity and a read-only audit only. It does **not** claim that PIDEX is supported on native Windows, and it does not change Linux runtime behavior.

## Current support statement

| Environment | Status | Notes |
|---|---|---|
| Linux | Supported/currently tested | Canonical PIDEX path. Use the existing `install.sh`, `dashboard/start.sh`, and validation commands. |
| WSL2 | Safest Windows recommendation for now | Expected to be closest to the Linux path, but still needs explicit PIDEX smoke evidence before being called fully supported. |
| Windows + Git Bash | Experimental / under analysis | Pi documents a Git Bash-based Windows path. PIDEX still needs validation of delegated pipeline behavior, hooks, and broader path handling before support is claimed. |
| Native PowerShell / CMD | Experimental bootstrap only | `install.windows.ps1` has passed an initial Windows 11 smoke for clone/install/Pi resource loading and dashboard typecheck/build. Native PowerShell runtime support beyond the bootstrap is not claimed. |

## Platform separation rule

Linux/direct-mode files are canonical and Linux-owned. Windows work should default to additive Windows-owned files, wrappers, docs, and rules.

Preferred future pattern:

| Linux-owned path | Preferred Windows-owned/additive path |
|---|---|
| `install.sh` | `install.windows.ps1` |
| `uninstall.sh` | `uninstall.windows.ps1` |
| `dashboard/start.sh` | `dashboard/start.windows.ps1` |
| `scripts/release/public-readiness.sh` | `scripts/compat/windows-audit.mjs` |
| `scripts/git-hooks/install-global.sh` | `scripts/git-hooks/install-global.windows.ps1` or explicit unsupported docs |

Do not add `if Windows then ... else ...` branches to Linux-owned runtime files unless explicitly approved and regression-proven.

## Read-only audit

Run the audit script to collect local readiness signals without changing files or settings:

```bash
node scripts/compat/windows-audit.mjs
```

For machine-readable output:

```bash
node scripts/compat/windows-audit.mjs --json
```

The audit reports:

- OS/platform and likely environment (`linux`, `wsl`, `windows-git-bash`, `windows-native`, etc.)
- availability of `bash`, `node`, `npm`, `git`, and `pi`
- PIDEX checkout path shape
- dashboard prerequisite signals
- known unsupported or risky Windows entrypoints

The audit is informational. Missing tools or risky entrypoints are reported as findings; the script does not install anything, modify configuration, or start PIDEX services.

## Known risky or unsupported areas on Windows

These areas need evidence before PIDEX can make a stronger Windows support claim:

- `install.sh` and `uninstall.sh` are Linux-owned Bash entrypoints.
- `dashboard/start.sh` is a Linux-owned dashboard launcher.
- global Git hook install/uninstall scripts are Linux-owned and may not map cleanly to Windows Git configuration.
- provider/delegate and pipeline scripts assume the current direct-mode Linux workflow until separate Windows validation exists.
- native PowerShell support requires Windows-owned wrappers and smoke tests.

## Experimental PowerShell bootstrap

PIDEX includes an additive Windows-owned bootstrap script:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/master/install.windows.ps1 | iex
```

For testing this initiative branch before merge:

```powershell
$env:PIDEX_INSTALL_BRANCH='initiative-016-windows-milestone-a'; irm https://raw.githubusercontent.com/d-trattner/pidex/initiative-016-windows-milestone-a/install.windows.ps1 | iex
```

Safer inspect-first form:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/master/install.windows.ps1 -OutFile install.windows.ps1
notepad .\install.windows.ps1
powershell -ExecutionPolicy Bypass -File .\install.windows.ps1
```

The bootstrap is experimental. It clones/verifies `$HOME\pidex`, checks Git/Node/npm/Pi/Git Bash, requires Node >=22.12.0, adds Git Bash to PATH for the installer session, runs the Node read-only audit, installs dashboard dependencies when missing with `npm ci` when a dashboard lockfile is present, and runs `pi install`. It does not require Python for bootstrap, does not call `install.sh`, and does not install global Git hooks.

For a separate PowerShell window/session, expose Git Bash before running Bash-backed npm checks:

```powershell
$env:Path = "C:\Program Files\Git\bin;$env:Path"
npm run public:check
```

Initial Windows 11 evidence: the bootstrap installed PIDEX into Pi, `/reload` loaded PIDEX skills/prompts/extension, `/pidex` pre-flight started without edits, `npm run public:check` passed via PowerShell after adding Git Bash to PATH, and `npm --prefix dashboard run typecheck` plus `npm --prefix dashboard run build` passed with Node 26. This is still not a full Windows runtime support claim.

## Experimental dashboard launcher

Windows includes an additive PowerShell dashboard launcher:

```powershell
cd $HOME\pidex\dashboard
.\start.windows.ps1
```

Useful options:

```powershell
.\start.windows.ps1 -NoBuild
.\start.windows.ps1 -Dev
.\start.windows.ps1 -HostName 0.0.0.0 -Domain your.local.name
```

A local friendly domain can also be configured in `$HOME\pidex\config\dashboard.local.json`:

```json
{
  "domain": "your.local.name"
}
```

The launcher is experimental and runs in the foreground.

## Recommended Windows approach today

If you are on Windows and want to experiment with PIDEX today, prefer WSL2 and follow the Linux README inside the WSL environment. If you use native Windows, start with the experimental PowerShell bootstrap above or run the audit script first. Treat Windows support as experimental until the smoke plan has real laptop evidence.
