---
title: Linux Feature Baseline
type: baseline
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, linux, baseline, regression]
---

# Linux Feature Baseline

## Purpose

This document freezes what "PIDEX currently works" means before Windows-support work changes any runtime path.

Linux/direct-mode remains canonical. Windows support must be additive and must not weaken these baseline behaviors.

## Baseline environment

- Checkout path: `~/pidex`
- Supported current runtime: Linux direct mode
- Pi package mode: PIDEX installed as a Pi package/extension
- Primary shell/runtime assumptions: Bash, Node/npm, Python 3, Git, Pi CLI

## Required preservation gates

Run these from `~/pidex` before merging Windows-support changes that could affect runtime behavior:

```bash
npm run public:check
npm --prefix dashboard run typecheck
npm --prefix dashboard run build
bash scripts/doctor.sh
python3 scripts/wiki/hygiene.py audit --project ~/pidex
```

Expected result:

- `npm run public:check` passes on a clean tree.
- dashboard typecheck passes.
- dashboard build completes.
- `scripts/doctor.sh` reports `Doctor result: ok`.
- wiki hygiene audit exits successfully. Existing hygiene findings may be tracked separately; the baseline gate is command health unless a change intentionally targets hygiene content.

For local pre-commit work on a dirty tree, use `bash scripts/release/public-readiness.sh --dirty-ok` as a preflight only. Do not treat `--dirty-ok` as release proof.

## Feature inventory and validation map

| Feature / capability | Current Linux expectation | Validation |
|---|---|---|
| Install | `./install.sh` installs PIDEX package from `~/pidex`; dry run is available. | `bash scripts/doctor.sh`; optional manual smoke: `./install.sh --dry-run`. |
| Uninstall | `./uninstall.sh` removes PIDEX package; dry run is available. | Manual only when testing uninstall: `./uninstall.sh --dry-run`. Do not run destructive uninstall during normal preservation checks. |
| Pi skill entrypoints | `/pidex` and `/pd` start the PIDEX pre-flight/orchestrator path. | Manual Pi smoke: invoke `/pidex Work on <test-project>` or `/pd Work on <test-project>` and stop before any unwanted code changes. |
| `pidex_agent` direct-mode routing | Orchestrator can route to configured `pidex-*` agents using `config/agents.json`. | Pi package load probe in `bash scripts/doctor.sh`; manual smoke via a small controlled PIDEX run if needed. |
| Agent/rule package contents | Agents, skills, prompts, rules, templates, config, extension, scripts, and docs are packaged without private runtime artifacts. | `npm run public:check` package-content checks. |
| Dashboard app | Dashboard builds and typechecks; runtime remains Linux-owned through `dashboard/start.sh`. | `npm --prefix dashboard run typecheck`; `npm --prefix dashboard run build`; optional manual smoke: `cd dashboard && ./start.sh`. |
| Dashboard sections | Overview, Live, Runs, Quality, Usage, Wiki, Context, and Settings sections are expected routes/features. | Build/typecheck plus manual browser smoke after `dashboard/start.sh`. |
| Provider limits/profiles | Provider-native Codex quota windows and Spark/no-Spark profiles remain available through current config and dashboard/API behavior. | `npm run public:check`; dashboard build/typecheck; manual dashboard Usage/Settings smoke if touching provider/profile code. |
| Estimate-only balances | Public defaults do not ship local balances; provider balance state remains local/runtime-only. | `npm run public:check`. |
| Optional parallel agents | Disabled by default in public config; configurable through existing settings path. | `npm run public:check`; manual Settings smoke if touching parallel-agent UI/config. |
| Pipeline event recording | Existing `scripts/pipeline/*` behavior remains Linux-owned and unchanged unless explicitly scoped. | `npm run check` via `npm run public:check`; targeted script smoke if touched. |
| Automatic PDQ reports | Terminal pipeline lifecycle can trigger automatic PDQ unless disabled with `PIDEX_AUTO_PDQ=0`. | Manual pipeline terminal-event smoke when changing pipeline/quality integration. |
| `/pdq` quality reports | Read-only PIDEX quality/self-improvement report path remains available. | Manual Pi smoke: invoke `/pdq`; command/script health covered indirectly by `npm run check`. |
| `/pdwiki` / wiki hygiene | Wiki hygiene audit remains available and writes reports under `agents.output/wiki-hygiene/`. | `python3 scripts/wiki/hygiene.py audit --project ~/pidex`. |
| `/pdmem` project session memory | Writes lightweight project session memory to `<project-root>/wiki/session-memory/`. | Manual Pi smoke in a disposable project; verify file creation in that project only. |
| Project context | PIDEX project context lives under `<project-root>/pidex/context/`; dashboard Context route supports review/edit flows. | `node --test dashboard/lib/server/context-md.tdd.test.mjs` via `npm run check`; dashboard build/typecheck. |
| Global Git security hook | Optional Linux-user global hook install remains functional and reversible. | `bash scripts/doctor.sh` hook health section; security scanner fake-token smoke inside doctor. |
| Public readiness gate | Release/public package invariants remain clean. | `npm run public:check` on clean tree. |
| Windows status/audit docs | Windows docs and read-only audit clarify status without runtime mutation. | `python3 scripts/compat/windows-audit.py`; `python3 scripts/compat/windows-audit.py --json`. |

## Manual smoke procedures

### Pi entrypoint smoke

Use a disposable project path. Stop after proving orchestration starts unless the test intentionally runs a full pipeline.

```text
/pidex Work on <disposable-project>; smoke only, do not edit production files
```

Expected:

- PIDEX pre-flight/orchestration starts.
- Routing references `pidex-*` agents.
- No `rp-*` role leakage appears in active routing.

Repeat with `/pd` if alias behavior is in scope.

### Dashboard runtime smoke

```bash
cd ~/pidex/dashboard
./start.sh
```

Expected:

- dashboard starts locally
- Overview route loads
- navigation exposes Live, Runs, Quality, Usage, Wiki, Context, Settings
- no startup regression in existing Linux launcher

### `/pdq` smoke

```text
/pdq
```

Expected:

- read-only quality report flow starts
- generated artifacts remain under `agents.output/quality/`
- no runtime code or rules are mutated unless explicitly requested by the command contract

### `/pdwiki` smoke

```bash
python3 scripts/wiki/hygiene.py audit --project ~/pidex
```

Expected:

- command exits successfully
- report paths are printed
- tracked source files are not mutated

### `/pdmem` smoke

Use a disposable project:

```text
/pdmem smoke note for disposable project only
```

Expected:

- a session-memory markdown file is written under `<project-root>/wiki/session-memory/`
- PIDEX repo source files are not mutated

## Windows-change regression rule

Any Windows-driven change that touches an existing Linux-owned runtime file requires explicit exception review and this baseline proof.

Linux-owned runtime files include at least:

- `install.sh`
- `uninstall.sh`
- `dashboard/start.sh`
- `extensions/pidex/index.ts`
- `scripts/pipeline/*`
- `scripts/quality/*`
- `scripts/git-hooks/*`
- existing dashboard/provider runtime behavior

Preferred Windows support remains separate Windows-owned files, wrappers, docs, and rules.

## Current Phase 0 evidence

As of Milestone A branch validation, these commands passed on Linux:

```bash
npm run public:check
npm --prefix dashboard run typecheck
npm --prefix dashboard run build
bash scripts/doctor.sh
python3 scripts/wiki/hygiene.py audit --project ~/pidex
```

This evidence establishes the starting Linux baseline for subsequent Windows analysis.

## Navigation

- Initiative index: [[index]]
- Implementation plan: [[implementation-plan]]
- Windows status doc: ../../../readme/windows.md
- Pi compatibility notes: [[pi-compatibility-first]]
