---
title: Windows Compatibility Analysis Brief
type: brief
status: planned
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, compatibility, portability, public-release]
---

# Windows Compatibility Analysis Brief

## Problem

PIDEX currently assumes a Linux-like local operator environment. The public README explicitly requires checkout at `~/pidex`, and many scripts/tools are written around Bash, POSIX paths, Unix process behavior, Linux user Git hooks, and local dashboard startup patterns.

If PIDEX becomes public, Windows users may try to install or run it through one of several environments:

- native Windows PowerShell / CMD
- Git Bash
- WSL2
- Windows Terminal with mixed shells
- Pi running on Windows with Node/Python available

Before claiming Windows support, PIDEX needs a precise compatibility analysis. The analysis should start with Pi's own Windows compatibility contract and implementation patterns, then compare PIDEX against that baseline. The goal is not to blindly port everything at once; the goal is to know which paths can be supported safely, which should be documented as unsupported, and which changes are required for a credible Windows path.

## Scope

First analyze Pi's own Windows support:

- Pi Windows docs and support contract
- Bash resolution via `shellPath`, Git Bash, and `bash.exe` on `PATH`
- Pi's process-management/path/CRLF/platform lessons from implementation and changelog
- which Windows assumptions PIDEX can inherit from Pi vs which PIDEX must handle itself

Then audit PIDEX's Windows readiness across:

- installation and uninstall flow
- Pi package install assumptions
- `~/pidex` path contract and Windows equivalents
- Bash scripts under `scripts/`, `install.sh`, `uninstall.sh`, and `dashboard/start.sh`
- Node/TanStack dashboard behavior on Windows
- Python scripts and filesystem/path handling
- SQLite/dashboard ingest assumptions
- Git hook install/uninstall behavior
- global Git `core.hooksPath` behavior on Windows
- provider limits/profile helpers
- optional parallel-agent helpers
- PDQ/quality/reporting scripts
- wiki hygiene scripts
- project context initialization scripts
- generated artifact ignore/package rules
- public readiness gate behavior
- process management, ports, signals, and cleanup
- shell quoting and environment variables
- path separators, drive letters, spaces in paths, symlinks, executable bits

## Platform Separation Principle

Current Linux/direct-mode files remain canonical. Windows support must be designed as a separate platform layer first, not as inline Windows branches inside existing Linux runtime files.

Non-negotiable default:

- Existing Linux entrypoints stay Linux-owned.
- Windows behavior gets separate Windows-owned entrypoints, wrappers, docs, and platform-specific rules.
- Shared cross-platform helpers are allowed only after both platform paths are understood and Linux regression checks remain green.
- Any proposal to modify an existing Linux-owned runtime file for Windows support must be treated as an exception, explicitly justified, and reviewed against the Linux feature baseline.

Prefer:

- `install.windows.ps1` over modifying `install.sh`
- `uninstall.windows.ps1` over modifying `uninstall.sh`
- `dashboard/start.windows.mjs` or `dashboard/start.windows.ps1` over modifying `dashboard/start.sh`
- `scripts/compat/windows-audit.py` over modifying `scripts/release/public-readiness.sh`
- `scripts/release/public-readiness.windows.py` over adding Windows branches to `public-readiness.sh`
- Windows-specific agent/rule docs over making all agent instructions conditional

Existing Linux scripts should not be edited merely to add Windows branches. Shared lower-level helpers may be introduced only after the separate Windows path proves itself and Linux validation remains green.

## Compatibility Preservation Requirement

Any Windows-support work must preserve every currently supported PIDEX feature on Linux/direct-mode.

Before merging Windows-related changes, the implementer must prove that the existing feature set still works or is intentionally unchanged:

- `/pidex` and `/pd` pipeline orchestration
- `pidex_agent` direct-mode specialist routing
- dashboard start/build/typecheck
- dashboard Overview, Live, Runs, Quality, Usage, Wiki, Context, and Settings
- provider limits and profile switching
- estimate-only agent balance/runway tracking
- optional parallel-agent configuration
- automatic PDQ quality reports
- `/pdq`
- `/pdwiki`
- `/pdmem`
- project context initialization/editing
- wiki hygiene audit/cadence
- global Git security hook install/uninstall behavior on Linux
- public readiness gate
- npm package contents
- install/uninstall scripts

Windows changes must not replace Linux behavior with untested cross-platform behavior. Prefer additive wrappers or shared lower-level helpers with regression tests.

## Non-goals

- Do not implement Windows support in the first analysis pass.
- Do not weaken Linux behavior or the current `~/pidex` install contract without an explicit decision.
- Do not promise native Windows support until a smoke-tested install/run path exists.
- Do not assume Git Bash support equals native Windows support.
- Do not rewrite all shell scripts before identifying the minimum supported Windows environment.
- Do not make WSL2 support sound like native Windows support.

## Candidate Support Levels

The analysis should classify possible support levels separately:

| Level | Meaning | Likely effort |
|---|---|---|
| WSL2-supported | PIDEX runs inside Ubuntu/WSL2 with Linux scripts mostly unchanged. | low |
| Git Bash-supported | PIDEX runs from Git Bash with Node/Python/Git available, with limited path fixes. | medium |
| Native PowerShell-supported | PIDEX has Windows-native install/start/check wrappers. | high |
| Cross-platform core | Shared Node/Python entrypoints replace most shell assumptions. | high |

The first public-safe position may simply be:

> Windows users should use WSL2 for now; native Windows support is under analysis.

## Key Questions

1. What does Pi itself support on Windows today, and what support mode should PIDEX align with first?
2. What is the minimum Windows environment PIDEX should support first: WSL2, Git Bash, or native PowerShell?
3. Should `~/pidex` remain the only supported install path for v0.1, with Windows requiring WSL2 or Git Bash path semantics?
4. Which Bash scripts are public entrypoints and need Windows equivalents?
5. Which Bash scripts are internal implementation details and can remain Linux-only for now?
6. Does Pi package/extension loading work for PIDEX from Windows paths with backslashes or spaces?
7. Does the dashboard start/build cleanly on Windows with the current TanStack/Vite setup?
8. Do Python scripts already use `pathlib` enough to be portable, or do they embed POSIX assumptions?
9. How should global Git hooks behave on Windows, especially executable bits and hook path separators?
10. Can public readiness checks run on Windows, or should they remain Linux/WSL-only?
11. What smoke test proves the chosen Windows path works?

## Audit Checklist

### Pi baseline

- Read Pi's Windows setup docs and terminal setup docs.
- Inspect Pi's shell/path/process abstractions where relevant.
- Summarize what Pi already solves and what PIDEX must not duplicate incorrectly.
- Decide whether PIDEX's first Windows path should follow Pi's Git Bash contract or recommend WSL2.

### Install / package

- Inspect `install.sh` and `uninstall.sh` for POSIX-only assumptions.
- Verify `pi install ~/pidex` equivalent for the chosen Windows path.
- Decide whether README should document WSL2-only Windows guidance.
- Check npm package `files` entries for Windows path behavior.

### Scripts

- Inventory every `*.sh` public entrypoint.
- Classify each script as:
  - public entrypoint needing Windows support
  - internal script that can remain Linux-only
  - candidate for Node/Python rewrite
- Check usage of `bash`, `mktemp`, `grep`, `rg`, `sed`, `trap`, `chmod`, process signals, and `/tmp`.

### Dashboard

- Test `npm --prefix dashboard install`, `typecheck`, `build`, and start behavior on Windows or WSL2.
- Check port `18777` handling.
- Check process cleanup and PID-file assumptions.
- Check SQLite/helper behavior.

### Python utilities

- Audit `scripts/**/*.py` for POSIX separators, hardcoded `/`, assumptions about executable bits, symlinks, temp paths, and shell calls.
- Confirm `pathlib` is used consistently for project paths.

### Git hooks

- Determine whether global hook installation should be disabled, optional, or separately implemented on Windows.
- Check Git for Windows hook execution behavior with Bash scripts.
- Decide whether public docs should warn Windows users before installing global hooks.

### Provider/profile helpers

- Check `scripts/provider-limits`, `scripts/profile`, and dashboard profile switching for shell dependence.
- Confirm env-var names and token handling are shell-neutral.

### Quality/self-improvement

- Check `scripts/quality/report.py`, `run-auto-pdq.py`, and event emission for Windows path compatibility.
- Confirm report paths and JSONL handling do not assume POSIX separators.

## Deliverables

1. **Pi compatibility baseline** documenting Pi's own Windows contract and implementation lessons.
2. **Compatibility matrix** covering WSL2, Git Bash, and native PowerShell.
3. **Entrypoint inventory** listing each script/command and support status.
4. **Risk list** for public users.
5. **Recommended first supported Windows path**.
6. **Implementation plan** split into small phases.
7. **Documentation patch proposal** for README/install docs.
8. **Smoke test plan** for validating the chosen path.

## Success Criteria

- PIDEX has an evidence-backed answer to: "Can I run this on Windows?"
- Unsupported Windows modes are documented clearly instead of failing silently.
- The recommended path has a concrete smoke test.
- Any implementation plan preserves the current Linux direct-mode path.
- Existing Linux/direct-mode feature behavior remains green after every Windows-support phase.
- Any unsupported Windows feature is documented explicitly instead of silently degrading.
- Public docs avoid overclaiming Windows support before it exists.

## Initial Hypothesis

Pi's own Windows path is Bash-based, with Git Bash as the likely default. PIDEX should probably align with that before considering native PowerShell support. WSL2 may still be the safest temporary recommendation because PIDEX currently depends heavily on Bash/POSIX behavior. Native Windows support likely requires wrapper scripts or replacing some shell entrypoints with Node/Python equivalents.

## Navigation

- Initiative index: [[index]]
- Active initiatives: [[../index]]
- PIDEX status: [[../../status]]
- PIDEX roadmap: [[../../roadmap]]
- PIDEX index: [[../../index]]
