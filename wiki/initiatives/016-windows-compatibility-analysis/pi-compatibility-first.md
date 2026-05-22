---
title: Pi Compatibility First Notes
type: analysis
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, pi, compatibility]
---

# Pi Compatibility First Notes

## Why this comes first

PIDEX is a Pi package/extension, so Windows support should start by understanding Pi's own Windows story. If PIDEX fights Pi's platform assumptions, PIDEX will become fragile. If PIDEX aligns with Pi's abstractions, Windows support can be smaller and safer.

## Pi's documented Windows baseline

Pi documents Windows setup in `/usr/lib/node_modules/@earendil-works/pi-coding-agent/docs/windows.md`:

- Pi requires a Bash shell on Windows.
- Shell lookup order:
  1. custom `shellPath` from `~/.pi/agent/settings.json`
  2. Git Bash at `C:\Program Files\Git\bin\bash.exe`
  3. `bash.exe` on `PATH` from Cygwin, MSYS2, WSL, etc.
- For most users, Git for Windows is expected to be sufficient.

The README also notes Windows-specific terminal behavior:

- multiline input: `Ctrl+Enter` on Windows Terminal
- image paste: `Alt+V` on Windows
- `Alt+Enter` conflicts with Windows Terminal fullscreen unless remapped

## Pi implementation lessons observed

From installed Pi code under `/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/`:

### 1. Keep Bash as the command substrate on Windows

Pi does not use PowerShell as the default tool shell. It resolves Bash explicitly through `getShellConfig()`:

- custom `shellPath`
- Git Bash standard install path
- `where bash.exe`

PIDEX should not assume native PowerShell compatibility just because the OS is Windows. First Windows target should probably be **Pi-on-Windows-with-Git-Bash** or **WSL2**, not PowerShell-native.

### 2. Use Node platform checks for process behavior

Pi avoids Unix-only detached process behavior on Windows and has Windows-specific process-tree cleanup using `taskkill`.

PIDEX should audit places that use:

- PID files
- background processes
- `kill`
- Unix process groups
- signal names
- `trap`
- `pkill`/`pgrep`

Dashboard `start.sh` is a likely hotspot.

### 3. Do not rely on POSIX path shape at API boundaries

Pi has multiple changelog entries around Windows path handling:

- package installs with paths containing spaces
- drive letters and mixed path separators
- prompt cwd backslashes breaking Bash execution
- CRLF edit matching and rendering

PIDEX should audit every boundary where paths are serialized into prompts, JSONL, shell commands, dashboard URLs, or Git paths.

### 4. Prefer explicit shell invocation over ambient shell assumptions

Pi uses `spawn(shell, ['-c', command], { shell: false })` style behavior in its shell helper path. This avoids `cmd.exe` surprises.

PIDEX scripts that use nested shell calls should avoid relying on whichever shell happens to run them.

### 5. Treat executable bits and package manager shims as Windows-sensitive

Pi has fixes for Windows package-manager shim installs and binary detection. PIDEX install/uninstall scripts and Git hooks should assume executable bits may not behave like Linux.

### 6. CRLF matters

Pi explicitly fixed edit matching/display problems around CRLF. PIDEX should make sure generated markdown/JSONL parsing tolerates CRLF where reasonable.

## PIDEX implications

### Likely safest support statement

For the next public docs iteration, avoid promising native Windows support. A safe statement would be:

> PIDEX is currently developed and tested on Linux. On Windows, use WSL2 or Pi's documented Git Bash setup at your own risk until the Windows compatibility initiative is complete.

If we want a stronger claim, test it first.

### Audit should be reordered

The initiative should analyze in this order:

1. Pi's Windows support contract and shell/path abstractions.
2. PIDEX features that run inside Pi and can rely on Pi behavior.
3. PIDEX scripts that bypass Pi and therefore need their own compatibility plan.
4. Dashboard/node/Python behavior independent of Pi.
5. Documentation/support matrix.

### Candidate first target

Based on Pi's own docs, the most natural first target is:

> Windows + Git for Windows Bash + Node/Python/Git installed + Pi package installed normally.

WSL2 may still be easier, but Git Bash is closer to Pi's documented Windows path.

Native PowerShell support should be treated as a later, explicit porting effort.

## Open questions for a real audit

- Does `pi install ~/pidex` work from Git Bash on Windows when `~` expands to a Windows user home path?
- Does Pi package loading resolve PIDEX extension paths correctly when installed from a Windows path with backslashes/spaces?
- Do PIDEX `pidex_agent` calls work with Windows project roots?
- Does the dashboard start script need a Windows-native wrapper, or should Windows users run dashboard through `npm --prefix dashboard run dev` directly?
- Should PIDEX global Git hook installation be disabled on Windows until separately validated?
- Should public readiness gate remain Linux-only, or should there be a Windows/WSL variant?

## Navigation

- Initiative index: [[index]]
- Brief: [[brief]]
- Active initiatives: [[../index]]
- PIDEX status: [[../../status]]
