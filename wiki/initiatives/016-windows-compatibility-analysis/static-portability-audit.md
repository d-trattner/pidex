---
title: Static Portability Audit
type: analysis
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, portability, static-audit, risk]
---

# Static Portability Audit

## Purpose

Identify concrete Windows portability risks from static inspection before running PIDEX on a Windows machine.

This audit is read-only. It recommends future wrappers, docs, or tests only; it does not approve edits to Linux-owned runtime files.

## Severity scale

| Severity | Meaning |
|---|---|
| S0 blocker | Blocks any Windows support claim for that path until fixed, wrapped, or explicitly documented unsupported. |
| S1 high | Likely to fail or mutate incorrectly on at least one Windows target. Needs proof or a separate Windows path. |
| S2 medium | May work under WSL2/Git Bash but needs targeted smoke evidence. |
| S3 low | Mostly documentation/test gap or easily validated portability concern. |

## Target modes

- Linux canonical: current supported path.
- WSL2: safest Windows-adjacent path because Linux semantics mostly hold.
- Windows + Git Bash: first Pi-aligned Windows target.
- Native PowerShell/CMD: not claimed; requires separate wrappers.

## Executive summary

PIDEX is not ready to claim native Windows support. The static audit supports the current plan:

1. Preserve Linux/direct-mode as canonical.
2. Use WSL2 as the safest Windows recommendation for now.
3. Treat Windows + Git Bash as the first real Pi-aligned Windows target to test.
4. Keep native PowerShell/CMD unsupported until additive Windows-owned wrappers exist.
5. Do not add inline Windows branches to existing Linux-owned scripts.

The highest-risk areas are:

- install/uninstall global behavior and executable-bit assumptions
- dashboard process management in `dashboard/start.sh`
- global Git hooks
- Bash release/doctor/smoke gates
- delegate subprocess invocation and auth path assumptions
- direct Bash scripts that bypass Pi's Windows shell abstraction

Python and Node code are better cross-platform candidates, but still require path/CRLF/interpreter testing on Windows.

## High-risk file findings

### `install.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Exact checkout requirement uses `$HOME/pidex` and `pwd -P`. | S1 | Git Bash / native Windows | `TARGET_DIR="$HOME/pidex"`; script refuses any other path. Git Bash `HOME` may be acceptable, but native Windows path shape is untested. | Keep unchanged. Future `install.windows.ps1` should define Windows path contract explicitly. |
| Bash-only option parsing and arrays. | S1 | Native PowerShell/CMD | `#!/usr/bin/env bash`, `set -euo pipefail`, `CMD=(...)`. | Native support needs a `.ps1` wrapper; do not branch inside `install.sh`. |
| Installs global npm package and writes marker state. | S2 | Git Bash | `npm install --global @ast-grep/cli`; marker under `state/skills`. Windows global npm behavior and permissions may differ. | Test only in Windows branch/laptop; consider docs before automatic install on Windows. |
| Optional global Git hook installation delegates to Linux-owned hook script. | S0 for Windows hook support | Git Bash/native Windows | calls `scripts/git-hooks/install-global.sh`. | Disable/document unsupported in Windows docs until separate hook plan exists. |

### `uninstall.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Same exact `$HOME/pidex` and Bash assumptions as install. | S1 | Git Bash/native Windows | `TARGET_DIR="$HOME/pidex"`, Bash arrays. | Keep unchanged; future `uninstall.windows.ps1`. |
| May remove global npm ast-grep based on marker. | S2 | Git Bash/native Windows | `npm uninstall --global @ast-grep/cli`; marker file. | Windows wrapper should make removal behavior explicit and non-surprising. |
| Optional global Git hook restore delegates to Linux-owned script. | S0 for Windows hook support | Git Bash/native Windows | calls `scripts/git-hooks/uninstall-global.sh`. | Separate hook uninstall wrapper or unsupported docs. |

### `dashboard/start.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Linux process management. | S0 for native Windows, S1 for Git Bash | Uses `kill`, PID file, `nohup`, background `&`, `ss -ltnp`, `awk`, `hostname -I`, `/tmp`. | Keep unchanged. Future `dashboard/start.windows.mjs` should use Node child process/process cleanup, or docs should use direct npm commands first. |
| Hardcoded `/tmp` logs and ingest output. | S1 | Git Bash/native Windows | `LOG="/tmp/pidex-dashboard-$PORT.log"`; ingest output under `/tmp`. | Windows wrapper should use OS temp dir via Node/Python/PowerShell. |
| Linux LAN IP detection. | S2 | Git Bash/WSL2 | `hostname -I`. | Windows wrapper should use Node `os.networkInterfaces()` or PowerShell equivalent. |
| Python interpreter assumes `python3`. | S2 | Native Windows | `python3 "$INGEST_SCRIPT"`. | Windows docs/wrapper should accept `python` fallback or use `py`. |

### `scripts/release/public-readiness.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Release gate is Linux-owned and exact `~/pidex`. | S1 | Git Bash/native Windows | `EXPECTED="$HOME/pidex"`; Bash/Python/rg/npm pack mix. | Keep as Linux public gate. Use `windows-audit.py` and future Windows readiness script separately. |
| Uses Bash, `grep`, `rg`, `mktemp`, `trap`, embedded Python, npm pack. | S1 | Git Bash/native Windows | Many POSIX dependencies. | Do not make cross-platform in-place. If needed, build `public-readiness.windows.py`. |
| Pack excludes `wiki/` from package but tracked wiki docs are allowed in repo. | S3 | all | Existing release contract. | No action for Windows; just understand docs are repo-only unless README/readme included. |

### `scripts/doctor.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Assumes Linux install path and Python executable name. | S1 | Git Bash/native Windows | exact `~/pidex`; `python3`; `/tmp` logs. | Keep Linux doctor; future Windows doctor should be separate if needed. |
| Global Git hook health assumes executable bits and Linux hook path. | S0 for Windows hook support | Git Bash/native Windows | `[ -x hook ]`, global `core.hooksPath`, Bash scanner smoke. | Document Windows hook unsupported until validated. |
| Temp repo scanner smoke uses `mktemp -d`, trap, `/tmp` logs. | S2 | Git Bash/WSL2 | POSIX temp and shell behavior. | Likely WSL2; Git Bash requires testing. |

### `scripts/smoke-test.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Uses `/tmp`, `trap`, `find`, `xargs`, `bash -n`, `grep`. | S1 | Git Bash/native Windows | Static grep findings. | Keep as Linux smoke. Future Windows smoke should be separate checklist/script. |
| Uses `/tmp/project-smoke` sample paths. | S2 | Git Bash/WSL2 | Linux path examples. | Windows smoke should use temp directory from platform. |

### `scripts/delegate/codex.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Bash delegate wrapper outside Pi shell abstraction. | S1 | Git Bash/native Windows | `#!/usr/bin/env bash`, arrays, stdin redirection, command lookup. | Test on Git Bash before claim; consider future Node/Python delegate wrapper if needed. |
| Auth path assumes `$HOME/.codex/auth.json`. | S2 | Git Bash/native Windows | Auth file check. | Validate Codex CLI auth location on Windows. |
| Requires `python3` for auth JSON validation. | S2 | Native Windows | `python3 -c`. | Windows wrapper should support `python`/`py`, or use Node. |
| Suppresses all Codex stderr/stdout except final file. | S3 | all | Existing behavior. | No Windows-specific change, but Windows failures may need better diagnostics in future wrapper. |

### `scripts/delegate/check-auth.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Bash + `mapfile` + process substitution. | S1 | Git Bash/native Windows | Static inspection. | Git Bash likely, native unsupported. Consider Python rewrite/wrapper if needed. |
| Python executable assumes `python3`. | S2 | native Windows | Auth JSON parsing. | Future Windows auth check should support Python launcher/Node. |

### `scripts/pipeline/event.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Core pipeline event writer is Bash wrapper around Python. | S1 | Git Bash/native Windows | Bash parsing plus embedded Python. | Do not touch casually. If Windows needs support, add separate Python/Node entrypoint or wrapper after tests. |
| Uses `pwd -P`, `RUNNING_PI_STATE_DIR`, and Path.resolve. | S2 | Git Bash | Project path normalization may convert/mangle Windows path shapes. | Test path serialization in WSL2/Git Bash; inspect JSONL outputs. |
| Auto-PDQ and wiki hygiene are triggered from terminal events. | S2 | Git Bash/WSL2 | Subprocesses use `sys.executable`, good, but root paths and downstream scripts need tests. | Good candidate after shell wrapper risk is addressed. |

### `scripts/history/*.sh` and `scripts/metrics/*.sh`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Depend on Bash and `jq` for history; Python for metrics. | S1/S2 | Git Bash/WSL2 | `jq` usage in history scripts; Bash assoc arrays in append. | Ensure `jq` availability is documented or replace with Python in a future separate path. |
| JSONL path serialization may carry Windows path forms into dashboard. | S2 | Git Bash/native Windows | `cwd`, project paths are serialized. | Test dashboard display and filters with Windows-shaped paths. |

### `scripts/git-hooks/**`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Global Git hook install/uninstall is Linux-user oriented. | S0 for Windows hook support | Git Bash/native Windows | docs and scripts set global `core.hooksPath`; check executable bits. | Document unsupported or write separate Windows hook installer after explicit validation. |
| Hook scripts require Bash shebang and executable bit. | S1 | Windows Git | `#!/usr/bin/env bash`, `[ -x ]` checks. | Git for Windows may support Bash hooks, but executable bit behavior needs proof. |
| Scanner uses many grep pipelines and staged diff assumptions. | S2 | Git Bash | `grep -E`, `git diff --cached` style scanner. | Test scanner in Git Bash disposable repo before claiming. |

### `scripts/profile/*` and provider-limit helpers

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Profile shell helpers use Bash and `python3`. | S2 | Git Bash/WSL2 | wrapper scripts. | Likely easy to wrap or rewrite; not first blocker. |
| `scripts/provider-limits/check-and-alert.sh` hardcodes `$HOME/pidex`. | S2 | Git Bash/native Windows | `python3 "$HOME/pidex/scripts/provider-limits/probe.py"`. | Prefer root-relative or Windows wrapper in later phase; do not edit now. |
| `scripts/provider-limits/probe.py` is Python. | S2 | Windows | Needs path/subprocess audit. | Candidate for Windows tests. |

### `scripts/quality/*`, `scripts/wiki/hygiene.py`, `scripts/project-context/init.py`

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Python scripts generally use `pathlib`/JSON and are cross-platform candidates. | S2 | Windows all | Static inventory; `py_compile` passes on Linux. | Run py_compile and targeted tests on Windows later. |
| Some commands/docs assume `python3`. | S2 | native Windows | Skills and shell wrappers invoke `python3`. | Windows docs should use `python` fallback. Future wrappers should call `sys.executable` where possible. |
| CRLF and Obsidian/wiki path normalization require real tests. | S2 | Windows all | Wiki/context markdown parsing. | Add fixture tests if Windows failures appear. |

### Dashboard TypeScript/Node code

| Finding | Severity | Target mode | Evidence | Recommended mitigation |
|---|---:|---|---|---|
| Build/typecheck are likely cross-platform. | S2 | Windows all | npm/Vite/TS stack; already Linux-passing. | Test `npm --prefix dashboard run typecheck` and `npm --prefix dashboard run build` on Windows. |
| Runtime launch is blocked by `dashboard/start.sh`, not necessarily app code. | S1 | native Windows | Start script uses Linux process management. | Prefer direct npm command or `dashboard/start.windows.mjs` later. |
| Dashboard data paths may receive Windows-shaped project roots. | S2 | Git Bash/native Windows | API/filter/display likely assumes strings. | Test with audit outputs and synthetic Windows project paths if needed. |

## Cross-cutting blockers

| Blocker | Severity | Affected areas | Mitigation |
|---|---:|---|---|
| Native PowerShell has no supported wrappers. | S0 | install, uninstall, dashboard, gates, delegate | Add separate `.ps1` or Node/Python wrappers only after support target is approved. |
| Global Git hooks are unvalidated on Windows. | S0 | install/uninstall, doctor, hook scripts | Keep unsupported in Windows docs until disposable Windows Git tests pass. |
| Linux-owned scripts mix Bash, POSIX tools, embedded Python, and npm. | S1 | release/doctor/smoke/delegate/profile/history/metrics | Keep canonical Linux scripts unchanged; add Windows-owned wrappers or docs. |
| Process management assumes Unix semantics. | S1 | dashboard/start, smoke, any background preview helpers | Use Node/PowerShell process management in future Windows wrappers. |
| Interpreter naming differs. | S2 | Python scripts invoked by shell/docs | Windows docs should use `python`; wrappers can use `sys.executable`/launcher detection. |
| Path shape assumptions need real evidence. | S2 | package install, pipeline JSONL, dashboard filters, wiki/context | Run WSL2/Git Bash/native audit and inspect outputs. |

## Suggested mitigation order

1. Do not implement runtime Windows changes yet.
2. Use this audit to build the compatibility matrix.
3. Use the matrix to define laptop smoke tests for:
   - WSL2
   - Windows + Git Bash
   - native PowerShell audit-only
4. If Git Bash support is selected, test these first:
   - `python scripts/compat/windows-audit.py --json`
   - `pi install ~/pidex` or documented local path equivalent
   - `/pidex` command discovery/load only
   - `npm --prefix dashboard run typecheck`
   - `npm --prefix dashboard run build`
5. Defer Git hook support until later.
6. Defer native PowerShell install/dashboard wrappers until evidence justifies them.

## Phase 3 conclusion

Static evidence supports a conservative support statement:

- Linux: supported/currently tested.
- WSL2: safest Windows recommendation for now, pending smoke evidence.
- Windows + Git Bash: first Pi-aligned target, experimental until tested.
- Native PowerShell/CMD: not supported beyond running the read-only audit with `python`.

No existing Linux-owned runtime file should be modified for Windows until the compatibility matrix and smoke plan are reviewed.

## Navigation

- Initiative index: [[index]]
- Implementation plan: [[implementation-plan]]
- Phase 0 baseline: [[linux-feature-baseline]]
- Phase 1 Pi baseline: [[pi-windows-baseline]]
- Phase 2 entrypoint inventory: [[entrypoint-inventory]]
