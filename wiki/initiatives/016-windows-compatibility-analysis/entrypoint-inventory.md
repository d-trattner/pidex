---
title: PIDEX Entrypoint Inventory
type: analysis
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, entrypoints, portability, inventory]
---

# PIDEX Entrypoint Inventory

## Purpose

Classify every known PIDEX user-facing and internal entrypoint by Windows exposure and support recommendation before any Windows runtime implementation begins.

This is an inventory only. It does not change runtime behavior.

## Classification legend

| Category | Meaning |
|---|---|
| Linux-owned canonical | Existing Linux/direct-mode path. Do not add inline Windows branches without explicit exception review and Linux regression proof. |
| WSL2 likely | Expected to work or be easiest to support under WSL2 because it resembles Linux, but still needs smoke evidence. |
| Git Bash candidate | Candidate for Pi-aligned Windows Git Bash testing, but not yet supported. |
| Needs Windows-owned wrapper | Future Windows support should use a separate `.windows.*`, `.ps1`, Node, or Python wrapper beside the Linux file. |
| Unsupported / document only | Do not attempt to support in the first Windows slice unless explicitly approved. Document limitation. |
| Cross-platform candidate | Python/Node code appears suitable for Windows after targeted audit/tests, but support is not yet claimed. |

## Public entrypoints

| Entrypoint | Type | Current owner | WSL2 | Git Bash | Native PowerShell/CMD | Recommendation |
|---|---|---|---|---|---|---|
| `./install.sh` | Bash script | Linux-owned canonical | WSL2 likely | Git Bash candidate, risky | Unsupported | Keep unchanged. Future path: `install.windows.ps1`. |
| `./uninstall.sh` | Bash script | Linux-owned canonical | WSL2 likely | Git Bash candidate, risky | Unsupported | Keep unchanged. Future path: `uninstall.windows.ps1`. |
| `dashboard/start.sh` | Bash script | Linux-owned canonical | WSL2 likely | Git Bash candidate, risky around PIDs/processes | Unsupported | Keep unchanged. Future path: `dashboard/start.windows.mjs` or `.ps1`; direct npm commands may be first docs path. |
| `npm run check` | npm script shell/Python/Node mix | Linux validation gate | WSL2 likely | Partial candidate | Unsupported until split | Keep Linux gate canonical. Consider future Windows-specific check script after audit. |
| `npm run public:check` | npm script invoking Bash release gate | Linux validation gate | WSL2 likely | Partial candidate | Unsupported until split | Keep Linux gate canonical. Future path: `scripts/release/public-readiness.windows.py` or continue `scripts/compat/windows-audit.py`. |
| `npm run doctor` / `bash scripts/doctor.sh` | Bash script | Linux-owned canonical | WSL2 likely | Git Bash candidate, risky due hook/process assumptions | Unsupported | Keep unchanged. Future Windows doctor should be separate if needed. |
| `python3 scripts/compat/windows-audit.py` / `python scripts/compat/windows-audit.py` | Python read-only audit | Windows-owned/additive audit | Should work | Should work | Should work | Keep as additive read-only compatibility probe. |
| `/pidex` | Pi skill/orchestrator | Pi + PIDEX direct-mode | Needs smoke | Candidate after Pi package load works | Not claimed | Test under WSL2/Git Bash through Pi; do not port to PowerShell directly. |
| `/pd` | Pi skill alias | Pi + PIDEX direct-mode | Needs smoke | Candidate after `/pidex` works | Not claimed | Same as `/pidex`. |
| `pidex_agent` tool | Pi extension tool | PIDEX extension via Pi | Needs smoke | Candidate after package/paths work | Not claimed | Validate extension loading and child routing on Windows targets. |
| `/pdq` / `pidex-quality` skill | Pi skill plus Python report | PIDEX | Needs smoke | Candidate if Python/path handling works | Not claimed | Underlying `scripts/quality/*` remains Linux-owned until audited. |
| `/pdwiki` / wiki hygiene route | Pi/orchestrator plus Python script | PIDEX | Needs smoke | Candidate if Python/path handling works | Not claimed | Underlying `scripts/wiki/hygiene.py` is cross-platform candidate but must be tested. |
| `/pdmem` | Pi extension command | PIDEX extension | Needs smoke | Candidate after extension path test | Not claimed | Validate project-root detection and Windows path serialization. |
| `/pdparallel` / optional parallel settings | Pi/dashboard/config behavior | PIDEX | Needs smoke | Candidate | Not claimed | Validate through Settings and `scripts/parallel-agents/status.py`. |

## Internal scripts inventory

### Root scripts

| Path | Type | Current owner | Windows recommendation | Notes / blockers |
|---|---|---|---|---|
| `scripts/doctor.sh` | Bash | Linux-owned canonical | Separate Windows doctor later if needed | Uses Linux validation and global hook checks. |
| `scripts/smoke-test.sh` | Bash | Linux-owned canonical | WSL2 likely; Git Bash candidate | Audit command dependencies before Windows claim. |
| `scripts/guard-codex-only.sh` | Bash | Linux-owned check | WSL2 likely; Git Bash candidate | Text scan; may work in Git Bash but not guaranteed. |
| `scripts/release/public-readiness.sh` | Bash | Linux-owned release gate | Keep Linux-only; use future Windows variant if needed | Uses git, grep, Bash, Python embedded script, npm pack. |
| `scripts/compat/windows-audit.py` | Python | Additive Windows audit | Cross-platform candidate | Read-only by design. |
| `scripts/compat/test_windows_audit.py` | Python | Audit test | Cross-platform candidate | Lightweight test; not wired into Linux gate yet. |

### Delegate/provider scripts

| Path | Type | Current owner | Windows recommendation | Notes / blockers |
|---|---|---|---|---|
| `scripts/delegate/check-auth.sh` | Bash | Linux-owned direct-mode support | WSL2 likely; Git Bash candidate after audit | Auth preflight for delegated agents; command lookup and config parsing need audit. |
| `scripts/delegate/codex.sh` | Bash | Linux-owned direct-mode support | Needs Windows-owned wrapper or careful Git Bash proof | High risk: CLI invocation, env/auth, quoting, paths, subprocess behavior. |
| `scripts/provider-limits/check-and-alert.sh` | Bash | Linux-owned operational helper | WSL2 likely; Git Bash candidate after audit | May call Python/probe and notification paths. |
| `scripts/provider-limits/probe.py` | Python | Cross-platform candidate | Test on Windows | Subprocess/CLI assumptions require audit. |
| `scripts/provider-limits/test_probe_tdd.py` | Python test | Cross-platform candidate | Test on Windows | Good candidate for Windows validation. |
| `scripts/profile/current.sh` | Bash | Linux-owned helper | WSL2 likely; Git Bash candidate | Shell/config parsing. |
| `scripts/profile/recommend.sh` | Bash | Linux-owned helper | WSL2 likely; Git Bash candidate | Shell/config parsing. |
| `scripts/profile/use.sh` | Bash | Linux-owned helper | WSL2 likely; Git Bash candidate | May mutate profile state; validate carefully. |

### Pipeline/history/metrics scripts

| Path | Type | Current owner | Windows recommendation | Notes / blockers |
|---|---|---|---|---|
| `scripts/pipeline/event.sh` | Bash | Linux-owned canonical | Do not touch in Windows work without exception | Core pipeline event path; forbidden for Milestone A and high regression risk. |
| `scripts/history/append.sh` | Bash | Linux-owned helper | WSL2 likely; Git Bash candidate | JSONL append/path quoting needs audit. |
| `scripts/history/list.sh` | Bash | Linux-owned helper | WSL2 likely; Git Bash candidate | Used by `/pidex` Step 0; Windows path output needs audit. |
| `scripts/metrics/record.sh` | Bash | Linux-owned helper | WSL2 likely; Git Bash candidate | State/metrics JSONL append risk. |
| `scripts/metrics/summarize.sh` | Bash | Linux-owned helper | WSL2 likely; Git Bash candidate | Text tooling dependency audit needed. |

### Quality/wiki/context scripts

| Path | Type | Current owner | Windows recommendation | Notes / blockers |
|---|---|---|---|---|
| `scripts/quality/report.py` | Python | PIDEX quality | Cross-platform candidate, but currently Linux-gated | Pathlib likely helps; subprocess/path/newline audit needed. |
| `scripts/quality/orchestrator-events.py` | Python | PIDEX quality | Cross-platform candidate | JSONL/path handling audit needed. |
| `scripts/quality/rule-actions.py` | Python | PIDEX quality | Cross-platform candidate | Path handling audit needed. |
| `scripts/quality/run-auto-pdq.py` | Python | PIDEX auto quality | Cross-platform candidate with caution | Trigger context/env assumptions need audit. |
| `scripts/quality/test_report_tdd.py` | Python test | Cross-platform candidate | Test on Windows | Should become part of Windows evidence later. |
| `scripts/wiki/hygiene.py` | Python | PIDEX wiki hygiene | Cross-platform candidate | Needs Windows path/CRLF/link audit. |
| `scripts/project-context/init.py` | Python | PIDEX project context | Cross-platform candidate | Path creation and newline audit needed. |
| `scripts/project-metadata/migrate-to-pidex-folder.py` | Python | Migration helper | Cross-platform candidate but risky | Mutates project metadata; test only on disposable fixtures. |
| `scripts/dashboard/ingest.py` | Python | Dashboard ingest | Cross-platform candidate | SQLite/path handling audit needed. |

### Parallel agents

| Path | Type | Current owner | Windows recommendation | Notes / blockers |
|---|---|---|---|---|
| `scripts/parallel-agents/status.py` | Python | Optional parallel agent status | Cross-platform candidate | Config/path handling likely portable; test. |
| `scripts/parallel-agents/run-lane.py` | Python | Optional parallel lane runner | Needs audit before Windows claim | Subprocess/delegate invocation may be platform-sensitive. |

### Git hooks

| Path | Type | Current owner | Windows recommendation | Notes / blockers |
|---|---|---|---|---|
| `scripts/git-hooks/install-global.sh` | Bash | Linux-owned canonical | Needs Windows-owned wrapper or unsupported docs | Global `core.hooksPath`, executable bits, shell path all risky. |
| `scripts/git-hooks/uninstall-global.sh` | Bash | Linux-owned canonical | Needs Windows-owned wrapper or unsupported docs | Same as install. |
| `scripts/git-hooks/global/pre-commit` | Shell hook | Linux-owned canonical | Unsupported until Git-for-Windows hook behavior validated | Executable bit and interpreter assumptions. |
| `scripts/git-hooks/global/commit-msg` | Shell hook | Linux-owned canonical | Unsupported until Git-for-Windows hook behavior validated | Executable bit and interpreter assumptions. |
| `scripts/git-hooks/lib/security-scan.sh` | Bash | Linux-owned canonical | Git Bash candidate after audit | Scanner may work under Git Bash, but do not claim yet. |

### Analysis/migration/notification scripts

| Path | Type | Current owner | Windows recommendation | Notes / blockers |
|---|---|---|---|---|
| `scripts/analysis/run-pipeline-analysis.sh` | Bash | Linux-owned analysis helper | WSL2 likely; Git Bash candidate | Shell tooling audit needed. |
| `scripts/migration/replay-running-pi-to-pidex.sh` | Bash | Historical migration helper | Unsupported / document only | Not part of core Windows support path. |
| `scripts/telegram/notify.sh` | Bash | Optional Linux operational helper | Unsupported initially | Optional direct-mode notification only; may depend on curl/env/network. |

## Dashboard inventory

| Entrypoint / area | Type | Current owner | Windows recommendation | Notes |
|---|---|---|---|---|
| `dashboard/start.sh` | Bash launcher | Linux-owned canonical | Needs `dashboard/start.windows.mjs` or `.ps1` | Preserve existing Linux launcher. |
| `npm --prefix dashboard run typecheck` | npm/TypeScript | Cross-platform candidate | Test on Windows | Already part of Linux baseline. |
| `npm --prefix dashboard run build` | npm/Vite | Cross-platform candidate | Test on Windows | Already part of Linux baseline. |
| Dashboard dev server via package script | npm/Node | Cross-platform candidate | Potential first Windows dashboard path | Prefer docs/direct npm command before writing wrapper. |
| Dashboard server Python helper `dashboard/lib/server/sqlite-query.py` | Python | Cross-platform candidate | Audit/test | SQLite path and interpreter naming. |
| Dashboard runtime/API/provider behavior | TypeScript/Node | PIDEX runtime | Preserve Linux; audit before Windows claim | Existing provider/profile behavior must not change for Windows work. |

## Pi package resources

| Resource | Current owner | Windows recommendation | Notes |
|---|---|---|---|
| `extensions/pidex/index.ts` | PIDEX extension | Candidate through Pi package load; do not touch for Windows without exception | Core extension. Existing file is Linux/runtime-owned for this initiative. |
| `skills/pidex/SKILL.md` | PIDEX orchestrator skill | Docs may later mention Windows support status, but avoid runtime claims | Contains references to Linux shell scripts and some historical/scaffolded paths. |
| `skills/pd/SKILL.md` | Alias skill | Same as `/pidex` | No separate Windows logic. |
| `skills/pidex-quality/SKILL.md` | Quality skill | Candidate if quality scripts work | Uses `python3`; Windows docs may need `python`. |
| `skills/pdmem/SKILL.md` | Project memory skill | Candidate through extension | Path serialization must be tested. |
| `skills/grill-with-docs/SKILL.md` | Context grilling | Candidate | Mostly docs/context file reads/writes. |
| `prompts/*` | Prompt templates | Candidate | Usually platform-neutral, but any shell examples need audit. |
| `agents/*` and `rules/*` | Agent/rule docs | Candidate | Future Windows guidance should be platform-specific, not broad inline rewrites. |

## Hard blockers and risk patterns to audit

Known risk classes across the inventory:

- Bash-specific entrypoints and `set -euo pipefail`
- POSIX tool assumptions: `grep`, `sed`, `find`, `xargs`, `mktemp`, `chmod`, `realpath`, `readlink`
- process handling: `trap`, `kill`, `pkill`, PID files, background `&`, `nohup`
- path assumptions: `/tmp`, `~/pidex`, forward slashes, drive letters, backslashes, spaces
- executable-bit assumptions for scripts and Git hooks
- interpreter naming: `python3` vs `python`
- CRLF/newline handling in markdown, JSONL, shell scripts, and generated artifacts
- direct subprocess invocation outside Pi's `getShellConfig()` safety layer
- global Git configuration differences on Windows
- dashboard server/dev process cleanup and port handling

## Support recommendation summary

1. Keep Linux/direct-mode files canonical and unchanged.
2. Treat WSL2 as the easiest likely Windows-adjacent path, but still test.
3. Treat Git Bash as the first Pi-aligned Windows target for real evidence.
4. Treat native PowerShell/CMD as unsupported until separate Windows-owned wrappers exist.
5. Prefer direct npm/Python commands for early Windows evidence where possible.
6. Only add wrappers after the static portability audit identifies exact needs.

## Next phase handoff

Phase 3 should create `static-portability-audit.md` and inspect high-risk files first:

1. `install.sh`, `uninstall.sh`, `dashboard/start.sh`
2. `scripts/release/public-readiness.sh`, `scripts/doctor.sh`, `scripts/smoke-test.sh`
3. `scripts/delegate/codex.sh`, `scripts/delegate/check-auth.sh`
4. `scripts/pipeline/event.sh`, `scripts/history/*.sh`, `scripts/metrics/*.sh`
5. `scripts/git-hooks/**`
6. Python cross-platform candidates under `scripts/quality/`, `scripts/wiki/`, `scripts/project-context/`, `scripts/parallel-agents/`, and dashboard helpers
7. dashboard package scripts and server subprocess calls

## Navigation

- Initiative index: [[index]]
- Implementation plan: [[implementation-plan]]
- Phase 0 baseline: [[linux-feature-baseline]]
- Phase 1 Pi baseline: [[pi-windows-baseline]]
