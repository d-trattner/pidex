---
title: Windows Compatibility Matrix
type: analysis
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, compatibility, matrix, support]
---

# Windows Compatibility Matrix

## Purpose

Turn Milestone A through Phase 3 evidence into a clear support-status matrix for Linux, WSL2, Windows + Git Bash, and native PowerShell/CMD.

This matrix is evidence-based and conservative. It is not a runtime implementation plan.

## Status legend

| Status | Meaning |
|---|---|
| Supported | Current documented path with Linux validation gates passing. |
| Likely / needs smoke | Static evidence suggests it may work, but laptop or target-environment smoke is required. |
| Experimental | Plausible target, but known risks or missing evidence prevent support claim. |
| Audit-only | Safe only for read-only audit/docs commands. Runtime support not claimed. |
| Unsupported | Do not claim support without new Windows-owned implementation and tests. |
| Not applicable | Feature does not apply to this target or is intentionally excluded. |

## Overall support matrix

| Environment | Overall status | Recommended user message | Evidence basis |
|---|---|---|---|
| Linux | Supported | PIDEX is developed and validated on Linux direct mode. | Current validation passes: `npm run public:check`, dashboard typecheck/build, `scripts/doctor.sh`, wiki hygiene audit. |
| WSL2 | Likely / needs smoke | Safest Windows recommendation for experimentation because it is closest to Linux. | Static audit finds many Linux assumptions that WSL2 should satisfy, but no WSL2 smoke evidence yet. |
| Windows + Git Bash | Experimental | First Pi-aligned Windows target to test, not yet supported. | Pi documents Bash-on-Windows via Git Bash; PIDEX scripts still have direct Bash/POSIX/process risks. |
| Native PowerShell/CMD | Audit-only / unsupported runtime | Native Windows runtime support is not claimed. Run only the read-only audit for now. | No PowerShell wrappers exist; Linux-owned Bash scripts are not native Windows entrypoints. |

## Feature compatibility matrix

| Feature / path | Linux | WSL2 | Windows + Git Bash | Native PowerShell/CMD | Notes |
|---|---|---|---|---|---|
| README/docs clarity | Supported | Supported | Supported | Supported | Milestone A docs clarify status without runtime claim. |
| `scripts/compat/windows-audit.py` | Supported | Likely / needs smoke | Likely / needs smoke | Audit-only likely | Designed read-only and Python-only; test `python` vs `python3` on Windows. |
| `install.sh` | Supported | Likely / needs smoke | Experimental | Unsupported | Linux-owned; future native path should be `install.windows.ps1`. |
| `uninstall.sh` | Supported | Likely / needs smoke | Experimental | Unsupported | Linux-owned; future native path should be `uninstall.windows.ps1`. |
| Pi package install `pi install ~/pidex` | Supported | Likely / needs smoke | Experimental | Not claimed | Pi supports Windows Bash, but PIDEX package load from Windows path needs proof. |
| `/pidex` and `/pd` skill invocation | Supported | Likely / needs smoke | Experimental | Unsupported | Depends on Pi package load, extension loading, delegate scripts, path handling. |
| `pidex_agent` direct-mode tool | Supported | Likely / needs smoke | Experimental | Unsupported | Core extension should load through Pi, but subprocess/delegate paths need testing. |
| `scripts/delegate/codex.sh` | Supported | Likely / needs smoke | Experimental | Unsupported | Bash wrapper, `python3`, `$HOME/.codex/auth.json`, Codex CLI behavior need Windows proof. |
| `npm run check` | Supported | Likely / needs smoke | Experimental | Unsupported | Linux gate; broad Bash/Python/Node mix. Keep canonical Linux-only unless future Windows variant exists. |
| `npm run public:check` | Supported | Likely / needs smoke | Experimental | Unsupported | Linux release gate. Native Windows should use future readiness script, not this shell gate. |
| `bash scripts/doctor.sh` | Supported | Likely / needs smoke | Experimental | Unsupported | Hook checks and `/tmp`/executable-bit assumptions are risky. |
| Dashboard `dashboard/start.sh` | Supported | Likely / needs smoke | Experimental/risky | Unsupported | Process management is Unix-oriented. Future path: `dashboard/start.windows.mjs` or direct npm docs. |
| Dashboard typecheck/build | Supported | Likely / needs smoke | Likely / needs smoke | Likely / needs smoke | `npm --prefix dashboard run typecheck/build` should be tested on Windows. |
| Dashboard runtime/API/provider behavior | Supported | Likely / needs smoke | Experimental | Unsupported runtime | Existing behavior must not change; start wrapper is main blocker. |
| Provider limits/profiles | Supported | Likely / needs smoke | Experimental | Unsupported runtime | Python/Node pieces may work, shell helpers need audit evidence. |
| `/pdq` / quality reports | Supported | Likely / needs smoke | Experimental | Unsupported runtime | Python scripts are candidates, but command paths often assume `python3`. |
| `/pdwiki` / wiki hygiene | Supported | Likely / needs smoke | Experimental | Unsupported runtime | Python candidate; CRLF/path/link behavior needs test. |
| `/pdmem` project memory | Supported | Likely / needs smoke | Experimental | Unsupported runtime | Extension command path serialization must be tested. |
| Project context init/edit | Supported | Likely / needs smoke | Experimental | Unsupported runtime | Python/context markdown likely portable, but Windows path/CRLF needs evidence. |
| Optional parallel agents | Supported | Likely / needs smoke | Experimental | Unsupported runtime | Status Python is candidate; lane runner/delegate subprocesses are risky. |
| Global Git security hook install | Supported | Unknown / risky | Unsupported until tested | Unsupported | Do not claim Windows hook support. Separate wrapper/docs required. |
| Git hook scanner itself | Supported | Likely / needs smoke | Experimental | Unsupported | Could work in Git Bash disposable repo; not enough evidence yet. |
| Telegram notify helper | Optional supported on Linux | Unknown | Unsupported initially | Unsupported | Optional helper; not needed for first Windows path. |
| Historical migration scripts | Linux-only / maintenance | Not applicable | Unsupported | Unsupported | Not part of Windows support path. |

## First credible support claim candidates

### Candidate 1: WSL2 experimental support

Possible future wording after laptop smoke passes:

> PIDEX is developed on Linux. WSL2 is the recommended Windows path and has passed the documented smoke checklist, but native Windows support is still not claimed.

Required evidence before this claim:

- `python3 scripts/compat/windows-audit.py --json`
- `npm run public:check` or documented WSL2 subset if global hooks differ
- `npm --prefix dashboard run typecheck`
- `npm --prefix dashboard run build`
- `bash scripts/doctor.sh` or documented exceptions
- minimal Pi package load / `/pidex` command discovery

### Candidate 2: Windows + Git Bash experimental path

Possible future wording after laptop smoke passes:

> PIDEX has an experimental Windows + Git Bash path aligned with Pi's Windows shell support. Use WSL2 for the safest experience; Git Bash support is still limited and does not include global Git hook installation.

Required evidence before this claim:

- Git Bash detects Bash/Node/npm/Python/Git/Pi in `windows-audit.py`
- `pi install ~/pidex` or equivalent local path works
- `/reload` exposes PIDEX commands
- `/pidex` starts pre-flight without path corruption
- dashboard typecheck/build pass
- global Git hook remains documented unsupported or separately tested in a disposable repo

### Candidate 3: native PowerShell audit-only

Safe current/future wording:

> Native PowerShell/CMD runtime support is not claimed. You may run `python scripts/compat/windows-audit.py --json` to collect readiness information.

Required evidence:

- audit script runs under `python` in PowerShell
- no runtime support wording beyond audit-only

## Recommended first Windows target

Primary target for real Windows testing:

> Windows + Git for Windows Bash + Node/npm + Python + Git + Pi installed, with PIDEX checked out at the path used for `pi install`.

Why:

- It aligns with Pi's documented Windows support contract.
- It tests the path most native Windows Pi users are likely to attempt.
- It reveals PIDEX-specific Bash/path issues without prematurely designing PowerShell wrappers.

Practical recommendation remains:

1. WSL2 for safest experimentation.
2. Git Bash for Pi-aligned native Windows analysis.
3. PowerShell audit-only until separate wrappers exist, except that the planned future one-line bootstrap should itself be a Windows-owned PowerShell installer after review.

## Unsupported or deferred areas

Do not include these in the first Windows support claim:

- native PowerShell runtime operation before `install.windows.ps1` or other Windows-owned wrappers are implemented and tested
- `dashboard/start.sh` on native Windows
- global Git hook installation on Windows
- Telegram notification helper on Windows
- historical migration scripts
- full delegated pipeline success under Git Bash before Codex auth/path evidence exists
- any inline Windows branch inside Linux-owned runtime files

## Decision table for next implementation planning

| Decision | Current answer | Rationale |
|---|---|---|
| Should Linux remain canonical? | Yes | All validation evidence is Linux; user explicitly requires no Linux behavior change. |
| Should Windows support modify `install.sh`? | No | Use Windows-owned `install.windows.ps1`; it must not call or edit `install.sh`. |
| Should PIDEX support a one-line Windows bootstrap? | Yes, via additive `install.windows.ps1` | Prefer PowerShell `irm <raw install.windows.ps1> | iex` plus safer inspect-first docs. It clones/checks `$HOME\\pidex`, verifies tools/Git Bash, runs audit, installs dashboard dependencies when missing, installs the Pi package, and skips global Git hooks by default. |
| Should Windows support modify `dashboard/start.sh`? | No | Use `dashboard/start.windows.mjs`/`.ps1` or direct npm docs later. |
| Should public readiness become cross-platform? | Not now | Keep Linux gate; add `windows-audit.py`/future Windows readiness script. |
| Should Git hook support be claimed on Windows? | No | Needs separate proof and likely wrapper. |
| Should Git Bash be tested before PowerShell wrappers? | Yes | Matches Pi's Windows contract. |
| Should native PowerShell be docs/audit-only for now? | Yes | No native wrappers exist. |

## Evidence gaps to close on laptop

Collect outputs from these environments:

1. WSL2
2. Windows + Git Bash
3. Native PowerShell

For each, save:

```bash
python3 scripts/compat/windows-audit.py --json
# or PowerShell/native Python:
python scripts/compat/windows-audit.py --json
```

For WSL2 and Git Bash, additionally test selected smoke commands from the smoke test plan once Phase 5 exists.

## Phase 4 conclusion

The compatibility matrix does **not** justify a Windows runtime support claim yet. It does justify:

- clear docs saying Linux is supported
- WSL2 as safest recommendation
- Git Bash as experimental and under analysis
- native PowerShell as audit-only/unsupported runtime today
- an additive Windows-owned PowerShell one-line bootstrap as the first installation UX candidate
- planning separate Windows-owned wrappers only after smoke evidence

## Navigation

- Initiative index: [[index]]
- Implementation plan: [[implementation-plan]]
- Phase 0 baseline: [[linux-feature-baseline]]
- Phase 1 Pi baseline: [[pi-windows-baseline]]
- Phase 2 entrypoint inventory: [[entrypoint-inventory]]
- Phase 3 static audit: [[static-portability-audit]]
