---
title: Windows Compatibility Analysis Implementation Plan
type: plan
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, compatibility, implementation-plan]
---

# Windows Compatibility Analysis Implementation Plan

## Goal

Produce an evidence-backed answer for Windows support without breaking current Linux/direct-mode PIDEX behavior.

The plan is documentation/audit-first. Milestone A may add Windows status docs and a read-only audit script, but this is not a Windows-support implementation. Actual runtime support changes come only after the compatibility matrix and preservation gates are approved.

## Guiding Constraints

- Start from Pi's own Windows compatibility contract.
- Preserve every current Linux/direct-mode PIDEX feature.
- Do not promise native Windows support before a real smoke-tested path exists.
- Prefer documentation, read-only probes, additive wrappers, or narrow compatibility fixes over broad rewrites.
- Separate WSL2, Git Bash, and native PowerShell claims.
- Do not modify existing working runtime paths in the first implementation milestone.
- Prefer platform separation over inline platform branching: current Linux/direct-mode files remain canonical; Windows support should use separate Windows entrypoints, wrappers, docs, and platform-specific rules wherever possible.
- Treat any Windows-driven edit to an existing Linux-owned runtime file as an exception requiring explicit justification, review against the Linux feature baseline, and passing Linux regression proof.

## Milestone A — Documentation + Read-only Audit Only

### Purpose

Gain Windows clarity without changing any existing PIDEX runtime behavior.

### Allowed changes

- Add documentation such as `readme/windows.md` and README links.
- Add a read-only compatibility audit script, e.g. `scripts/compat/windows-audit.py`.
- Add tests for that audit script if useful.

### Platform separation model

Keep Linux files as the canonical path and add Windows-specific files beside them when implementation begins. The default plan is not to make existing Linux scripts cross-platform; it is to add a Windows layer next to them.

| Linux-owned path | Preferred Windows-owned/additive path |
|---|---|
| `install.sh` | `install.windows.ps1` |
| `uninstall.sh` | `uninstall.windows.ps1` |
| `dashboard/start.sh` | `dashboard/start.windows.mjs` or `dashboard/start.windows.ps1` |
| `scripts/release/public-readiness.sh` | `scripts/compat/windows-audit.py` or `scripts/release/public-readiness.windows.py` |
| `scripts/git-hooks/install-global.sh` | `scripts/git-hooks/install-global.windows.ps1` or explicit unsupported docs |
| broad agent prompt changes | platform-specific rules such as `rules/platform/windows.md` |

Only introduce shared lower-level helpers after the separate Windows path is validated and Linux regression checks remain green. Do not add `if Windows then ... else ...` branches to Linux-owned files unless an explicit exception is approved.

### Forbidden changes in Milestone A

Do not modify these existing working paths in Milestone A, including for "small" Windows conditionals:

- `install.sh`
- `uninstall.sh`
- `dashboard/start.sh`
- `extensions/pidex/index.ts`
- `scripts/pipeline/event.sh`
- `scripts/quality/*`
- `scripts/git-hooks/*`
- existing dashboard runtime behavior
- existing provider/profile behavior

### Milestone A deliverables

1. `readme/windows.md` with explicit support status:
   - Linux is supported/currently tested.
   - WSL2 is the safest Windows recommendation for now.
   - Pi's Git Bash path is under analysis/experimental for PIDEX.
   - Native PowerShell support is not claimed.
2. `scripts/compat/windows-audit.py` that reports environment readiness only:
   - OS/platform
   - Bash availability and likely Git Bash path
   - `node`, `npm`, `python3`/`python`, `git`, `pi`
   - PIDEX checkout path shape
   - dashboard prerequisites
   - known unsupported/risky entrypoints
3. A Linux preservation proof after the docs/audit additions.

### Milestone A exit criteria

- No existing runtime entrypoint behavior changed.
- Linux/direct-mode validation still passes.
- Public docs no longer leave Windows status ambiguous.
- Audit script can be run safely on Linux/WSL/Git Bash/native Windows without mutation.

## Phase 0 — Baseline Freeze

### Purpose

Define what "current PIDEX works" means before any Windows-support changes.

### Tasks

1. Record current feature inventory from README/readme docs:
   - `/pidex`, `/pd`
   - `pidex_agent` direct-mode routing
   - dashboard sections
   - provider limits/profiles
   - estimate-only balances
   - optional parallel agents
   - auto-PDQ and `/pdq`
   - `/pdwiki`
   - `/pdmem`
   - project context
   - install/uninstall
   - Git security hook
   - public readiness gate
2. Map each feature to at least one validation command or manual smoke check.
3. Create a Linux/direct-mode regression checklist.

### Deliverable

`linux-feature-baseline.md`

### Exit Criteria

- Baseline checklist exists.
- Current Linux validation commands pass.
- Any manual-only feature has a documented smoke procedure.

## Phase 1 — Pi Windows Baseline

### Purpose

Understand what Pi already supports on Windows and what PIDEX should inherit.

### Tasks

1. Read Pi docs:
   - `README.md`
   - `docs/windows.md`
   - `docs/terminal-setup.md`
   - relevant SDK/extension docs if package loading is implicated
2. Inspect Pi implementation patterns:
   - shell resolution
   - process cleanup
   - package install path handling
   - path normalization
   - CRLF handling
   - extension loading
3. Summarize Pi's Windows support contract:
   - Git Bash expectation
   - `shellPath`
   - Bash on PATH
   - Windows Terminal caveats
4. Identify what PIDEX can rely on vs what PIDEX bypasses.

### Deliverable

`pi-windows-baseline.md`

### Exit Criteria

- Recommended first Windows target is proposed: WSL2, Git Bash, or native PowerShell.
- Pi-inherited behavior and PIDEX-owned behavior are separated.

## Phase 2 — PIDEX Entrypoint Inventory

### Purpose

Classify every PIDEX command/script by Windows exposure and support requirement.

### Tasks

1. Inventory public entrypoints:
   - `install.sh`
   - `uninstall.sh`
   - `dashboard/start.sh`
   - `npm run check`
   - `npm run public:check`
   - `/pidex`, `/pd`, `/pdq`, `/pdwiki`, `/pdmem`, `/pdparallel`
2. Inventory internal scripts:
   - `scripts/delegate/*`
   - `scripts/pipeline/*`
   - `scripts/quality/*`
   - `scripts/wiki/*`
   - `scripts/provider-limits/*`
   - `scripts/profile/*`
   - `scripts/git-hooks/*`
   - `scripts/parallel-agents/*`
   - `scripts/project-context/*`
3. For each entrypoint, classify:
   - Linux-only OK
   - should work under WSL2
   - should work under Git Bash
   - needs native PowerShell wrapper
   - candidate for Node/Python rewrite
4. Identify hard blockers:
   - POSIX-only commands
   - `/tmp`
   - `chmod`
   - executable bits
   - signals/traps/PID files
   - path quoting
   - `~` expansion
   - drive letters/spaces

### Deliverable

`entrypoint-inventory.md`

### Exit Criteria

- Every script/command has an owner category and support recommendation.
- No ambiguous public entrypoints remain unclassified.

## Phase 3 — Static Portability Audit

### Purpose

Find concrete code-level portability risks before testing on Windows.

### Tasks

1. Audit shell scripts for:
   - `bash` assumptions
   - `set -euo pipefail` compatibility under Git Bash
   - `mktemp`, `sed`, `grep`, `rg`, `find`, `xargs`
   - signal handling
   - process cleanup
   - `pwd -P`
   - `/tmp`
   - path quoting
2. Audit TypeScript/Node code for:
   - `path.resolve` vs string path slicing
   - `/` assumptions
   - spawned command assumptions
   - environment variable naming
   - port/process handling
3. Audit Python scripts for:
   - `pathlib` usage
   - subprocess shell assumptions
   - newline/CRLF handling
   - executable-bit assumptions
4. Audit package/public gate behavior for Windows feasibility.

### Deliverable

`static-portability-audit.md`

### Exit Criteria

- All findings have severity and suggested mitigation.
- Findings are grouped by target support mode.

## Phase 4 — Compatibility Matrix

### Purpose

Turn the audit into a support decision.

### Tasks

1. Create support matrix for:
   - Linux current
   - WSL2
   - Windows + Git Bash
   - Native PowerShell
2. For each feature, mark:
   - supported now
   - likely supported but unverified
   - needs small fix
   - needs wrapper/rewrite
   - unsupported / non-goal
3. Identify the first credible Windows support claim.

### Deliverable

`compatibility-matrix.md`

### Exit Criteria

- A recommended first Windows path is selected.
- Unsupported modes have clear wording.

## Phase 5 — Smoke Test Design

### Purpose

Define proof before implementation.

### Tasks

1. Design smoke test for chosen Windows target.
2. Include at minimum:
   - clone/install at expected path
   - `pi install`
   - `/reload`
   - `/pd` command appears/loads
   - dashboard install/build/start or documented alternative
   - `npm run check` equivalent
   - `npm run public:check` if supported
   - one read-only `/pdq` or script quality report
   - one wiki/context script smoke
3. Define what must be manual vs automated.

### Deliverable

`windows-smoke-test-plan.md`

### Exit Criteria

- Smoke test is executable by a human on a Windows machine.
- Smoke test distinguishes WSL2/Git Bash/PowerShell clearly.

## Phase 6 — Documentation Patch Proposal

### Purpose

Revise the Milestone A Windows docs based on the completed compatibility matrix, without overclaiming.

### Tasks

1. Review README Windows wording from Milestone A.
2. Review `readme/windows.md` from Milestone A.
3. Propose changes only for support claims that are backed by smoke-test evidence.
4. Update install docs only after support claim is selected.
5. Include known unsupported paths.

### Deliverable

`windows-docs-proposal.md`

### Exit Criteria

- Docs say exactly what is tested and what is not.
- Phase 6 does not duplicate Milestone A; it refines Milestone A docs using audit evidence.
- No native Windows claim unless native Windows smoke passes.

## Phase 7 — Implementation Plan for Windows Support

### Purpose

If analysis recommends changes, plan them as small safe slices after Milestone A.

### Possible Slices

1. Documentation-only WSL2 recommendation.
2. Native PowerShell one-line bootstrap design and additive `install.windows.ps1` prototype. This should be Windows-owned and must not call or modify `install.sh`. It should clone/check out `$HOME\\pidex` when needed, verify prerequisites, run `scripts/compat/windows-audit.py`, ensure Pi's Git Bash prerequisite is present, run `pi install <pidex-root>`, and skip global Git hook installation by default.
3. Git Bash install/start docs and smoke script.
4. Additive command resolver helper for future Windows wrappers; do not wire into existing Linux scripts yet.
5. Additive Windows-safe dashboard start wrapper, e.g. `dashboard/start.windows.mjs` or `dashboard/start.windows.ps1`; keep `dashboard/start.sh` unchanged.
6. Windows-safe public readiness variant or separate compatibility check; keep Linux gate unchanged.
7. Separate Windows Git hook wrapper or explicit Windows unsupported docs; keep Linux hook scripts unchanged.
8. Platform-specific agent/rule docs for Windows tasks rather than conditionalizing all existing agent instructions.
9. Only after proven wrappers exist, consider extracting shared lower-level helpers. Extraction must not delete or silently change Linux-owned entrypoints in the same slice.

### Deliverable

`windows-support-implementation-plan.md`

### Exit Criteria

- Each slice has validation and rollback notes.
- Linux baseline validation remains mandatory after each slice.

## Required Validation After Every Implementation Slice

Every implementation slice must answer:

```text
Did this change any Linux-owned runtime file?
Did this change existing Linux/direct-mode behavior?
If yes to either, why was that unavoidable and where is the regression proof?
```

Run at minimum on Linux/direct-mode:

```bash
cd ~/pidex
npm run public:check
npm --prefix dashboard run typecheck
npm --prefix dashboard run build
bash scripts/doctor.sh
python3 scripts/wiki/hygiene.py audit --project ~/pidex
```

Plus any feature-specific tests for touched areas.

## Open Decisions

- First target: WSL2 or Git Bash?
- Should native PowerShell provide the public one-line bootstrap while Git Bash remains Pi's required command shell?
- Should the Windows one-liner use `irm <raw install.windows.ps1> | iex`, an inspect-first download command, or both in docs?
- Should `install.windows.ps1` clone the repo itself when missing, or require users to clone first?
- Should `~/pidex` / `$HOME\\pidex` remain mandatory on Windows through Git Bash/PowerShell path semantics?
- Should global Git hook installation be disabled by default on Windows?
- Should dashboard get an additive Node-based `start.windows.mjs` wrapper, a PowerShell wrapper, or both, while preserving `start.sh`?
- Should public readiness remain Linux-only while `windows-audit.py` handles Windows readiness?
- Should Windows agent guidance live under `rules/platform/windows.md`, agent-specific Windows rules, or both?
- Which, if any, existing runtime scripts should ever be modified after additive wrappers prove themselves?

## Navigation

- Initiative index: [[index]]
- Brief: [[brief]]
- Pi compatibility notes: [[pi-compatibility-first]]
- Active initiatives: [[../index]]
- PIDEX status: [[../../status]]
