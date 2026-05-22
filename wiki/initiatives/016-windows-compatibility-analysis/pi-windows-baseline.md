---
title: Pi Windows Baseline
type: analysis
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, pi, baseline, compatibility]
---

# Pi Windows Baseline

## Purpose

Understand what Pi already supports on Windows and separate Pi-inherited behavior from PIDEX-owned behavior before PIDEX adds any Windows runtime support.

PIDEX is a Pi package/extension. The safest Windows plan is to align with Pi's platform contract instead of creating a separate, conflicting shell/runtime model.

## Sources reviewed

Pi documentation:

- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/README.md`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/windows.md`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/terminal-setup.md`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md`

Pi implementation signals:

- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/utils/shell.js`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/bash.js`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/config.js`
- `/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/tools/edit-diff.js`

## Pi's documented Windows contract

Pi's Windows setup documentation is short and specific:

- Pi requires a Bash shell on Windows.
- Shell resolution order:
  1. custom `shellPath` from `~/.pi/agent/settings.json`
  2. Git Bash at `C:\Program Files\Git\bin\bash.exe`
  3. `bash.exe` on `PATH` from Cygwin, MSYS2, WSL, etc.
- For most users, Git for Windows is expected to be sufficient.

Pi's main README and terminal setup docs add Windows terminal caveats:

- Windows Terminal multiline input may need `Ctrl+Enter` or key forwarding.
- Image paste uses `Alt+V` on Windows.
- Windows Terminal binds `Alt+Enter` to fullscreen by default; users must remap it if they want Pi follow-up queueing through `Alt+Enter`.

## Pi implementation behavior relevant to PIDEX

### Shell execution

Pi's local bash execution uses `getShellConfig()` and then spawns:

```text
spawn(shell, [...args, command], { shell: false-equivalent direct spawn, cwd, env, stdio })
```

Key points:

- On Windows, Pi does not default to PowerShell or `cmd.exe` for the bash tool.
- It searches Git Bash and PATH Bash, or uses configured `shellPath`.
- On Unix, it tries `/bin/bash`, then PATH Bash, then `sh`.
- The execution API remains a Bash command substrate even on Windows.

PIDEX implication: PIDEX should not claim native PowerShell compatibility just because the user is on Windows. The first Pi-aligned Windows target is Bash-on-Windows, not PowerShell-native.

### Process cleanup

Pi explicitly branches process cleanup by platform:

- non-Windows: detached process groups and `SIGKILL`
- Windows: no detached process group; use `taskkill /F /T /PID <pid>` for process tree cleanup

PIDEX implication: scripts or dashboard wrappers that manage PIDs, background processes, traps, `kill`, `pkill`, or PID files need separate Windows handling. Do not retrofit Linux shell scripts with casual Windows branches.

### Path/package handling

Pi has Windows-specific handling around:

- `win32` path operations when `process.platform === "win32"` or package paths contain backslashes
- npm global root detection where Windows path shape is ambiguous
- package installs from local paths, npm, and git
- package manifests under `package.json` `pi` key

PIDEX implication: Pi can load package resources from PIDEX's `package.json` manifest, but PIDEX still owns any path assumptions inside its own extension, scripts, dashboard, docs, and generated artifacts.

### CRLF/edit handling

Pi's edit diff code detects line endings, normalizes CRLF/LF for matching, and restores line endings where needed.

PIDEX implication: Pi's own edit tool is relatively CRLF-aware, but PIDEX's Python/Node parsers and markdown/JSONL readers still need their own CRLF audit if they read generated files directly.

### Extensions/packages

Pi extensions are TypeScript modules loaded as package resources. Pi packages can declare resources via `package.json`:

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  }
}
```

PIDEX already uses this pattern. Package install may use local paths, npm, or git. Runtime dependencies for distributed packages belong in `dependencies`; Pi core packages should remain peer dependencies.

PIDEX implication: PIDEX's package shape is aligned with Pi's package model. Windows risk is more likely in PIDEX-owned commands/scripts and in extension subprocess behavior than in basic Pi package discovery.

## Pi-inherited vs PIDEX-owned behavior

| Area | Owner | PIDEX conclusion |
|---|---|---|
| Pi interactive UI and keybindings | Pi | Inherit Pi's Windows Terminal caveats; document if PIDEX docs mention Windows usage. |
| Bash tool shell selection | Pi | Inherit `shellPath` / Git Bash / PATH Bash contract for commands executed through Pi's bash tool. |
| Extension loading from Pi package manifest | Pi + PIDEX package metadata | Mostly inherited, but PIDEX must test package install/load from Windows paths. |
| Pi package install mechanics | Pi | Inherit support, but validate `pi install ~/pidex` from Windows Git Bash and WSL. |
| Tool edit CRLF handling | Pi | Inherited for Pi edit tool only; PIDEX parsers still require audit. |
| PIDEX install/uninstall scripts | PIDEX | Linux-owned; future Windows support needs separate wrappers. |
| PIDEX dashboard launcher | PIDEX | `dashboard/start.sh` is Linux-owned; future Windows support needs `start.windows.*` or npm-direct docs. |
| PIDEX Git hook installer | PIDEX | Linux-owned; Windows support needs separate installer or explicit unsupported status. |
| PIDEX pipeline/delegate/quality scripts | PIDEX | Audit before claiming Git Bash/WSL support; do not assume Pi shell fixes cover direct script execution. |
| PIDEX provider/profile dashboard behavior | PIDEX | Preserve Linux behavior; Windows changes require regression proof. |

## Recommended first Windows target

Recommended first target for testing:

> Windows + Git for Windows Bash + Node/npm + Python + Git + Pi installed, with PIDEX installed as a Pi package from a local `~/pidex` checkout.

Reasoning:

- This matches Pi's documented Windows shell contract.
- It tests PIDEX through the closest Windows-native Pi path.
- It avoids prematurely designing native PowerShell wrappers before the Bash-on-Windows surface is understood.

Recommended practical user path until evidence exists:

1. WSL2 for safest near-Linux experimentation.
2. Git Bash for Pi-aligned Windows analysis.
3. Native PowerShell only after separate Windows-owned wrappers exist.

## What PIDEX can rely on

PIDEX can tentatively rely on Pi for:

- locating a Bash shell on Windows when commands execute through Pi's bash tool
- exposing `shellPath` for nonstandard Bash locations
- loading PIDEX as a Pi package from `package.json` resource declarations
- Windows Terminal caveat documentation at Pi level
- Pi-level process cleanup for commands executed through Pi's bash tool
- Pi edit-tool CRLF resilience

These are not yet PIDEX support claims; they are dependencies to validate.

## What PIDEX must handle itself

PIDEX must separately handle or document:

- `install.sh`, `uninstall.sh`, and `dashboard/start.sh`
- global Git hook installation/uninstallation
- direct execution of `npm run check`, `npm run public:check`, and shell scripts under `scripts/`
- Python script portability and interpreter naming (`python3` vs `python`)
- Node dashboard build/dev scripts and spawned commands
- provider/delegate subprocess assumptions
- path serialization into pipeline events, agents output, dashboard APIs, wiki reports, and context files
- Windows paths with drive letters, backslashes, spaces, and CRLF
- executable-bit assumptions

## Phase 1 decision

Proceed with this support-target ordering for the next phases:

1. Preserve Linux as canonical.
2. Treat WSL2 as the safest Windows recommendation but still validate it.
3. Treat Windows + Git Bash as the first Pi-aligned Windows target to analyze.
4. Treat native PowerShell/CMD as unsupported until separate Windows-owned wrappers are planned and tested.

## Open validation questions for laptop testing

- Does `pi install ~/pidex` work from Git Bash when `~` resolves to a Windows home path?
- Does `pi install <Windows path>` tolerate spaces and backslashes for PIDEX specifically?
- Does `/pidex` load and expose PIDEX commands from a Windows-installed package?
- Does `pidex_agent` execute a no-op/direct-mode smoke without path corruption?
- Does `python scripts/compat/windows-audit.py --json` work in native PowerShell?
- Does `python3 scripts/compat/windows-audit.py --json` work in Git Bash and WSL2?
- Does `npm --prefix dashboard run typecheck` pass on Windows?
- Does `npm --prefix dashboard run build` pass on Windows?
- Should the dashboard Windows path be direct npm commands first, or an additive `dashboard/start.windows.mjs` wrapper?

## Next phase handoff

Phase 2 should create `entrypoint-inventory.md` and classify every PIDEX public and internal entrypoint by:

- Linux-owned canonical
- WSL2 likely
- Git Bash candidate
- needs Windows-owned wrapper
- unsupported until explicitly implemented

## Navigation

- Initiative index: [[index]]
- Implementation plan: [[implementation-plan]]
- Phase 0 baseline: [[linux-feature-baseline]]
- Pi compatibility notes: [[pi-compatibility-first]]
