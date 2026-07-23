# PIDEX

<p align="center">
  <img src="readme/assets/pidex-logo.svg" alt="PIDEX animated logo" width="160">
</p>

PIDEX is my personal LLM pipeline automation project. To be clear, I am heavily assisted by LLMs while building it, and I have invested most of my time over the last months trying to improve every aspect. It is experimental, constantly changing, and shaped by lessons learned from real local projects. The LLM world moves fast, and I try to filter what is worth trying and what is not. The number of new tools and open-source projects emerging every day is enormous; no one can try everything, so deciding what to test is not easy. PIDEX is my way of trying ideas directly, measuring what happens, and keeping the parts that seem to help.

Metrics are a useful way to test what works and what does not, so PIDEX includes a local dashboard for pipeline state, quality signals, provider usage, and project context. PIDEX also follows the LLM Wiki direction: durable project knowledge should be explicit, reviewable, and close to the source instead of hidden behind opaque retrieval machinery. I tried RAG too, but for this project I prefer fewer dependencies and more explicit context.

The pipeline is self-improving through rules. Every project can split refinements into global PIDEX rules and project-specific rules. If you have refinements you think would help, feel free to add them in a PR.

Like many devs, I was initially driven by the excitement of creating things with little effort. Over time, that feeling had to give way to a more disciplined process, so most of the refinement now happens at the user-llm level. Having an orchestrator question you in detail is the most important step. You can use the `grill-me` or `grill-with-docs` skill for that, or rely on the predefined orchestrator instructions.

## Current status

PIDEX is an experimental direct-mode MVP. Linux/direct mode remains the primary supported path today. Local Docker Project Pipeline is validated for the current MVP on Linux and has focused native Windows Docker Desktop evidence, including automatic managed preview approval flows and host-side browser-smoke checks for Vite React UI fixtures.

Lifecycle-tracked Critic, Code Review, Security, and QA work uses bounded review budgets: a fixed number of review dispatches per project, plan, and gate. The limit prevents review loops without limiting normal planning, implementation, tokens, cost, or time.

The main active work is PIDEX’s self-improvement loop: collecting quality evidence from real pipeline runs, improving PDQ reports, and using those signals to decide which rules, prompts, and workflow changes actually help. Quality Rule Learning is now in validation/hardening: PDQ reports include operator contracts, valid operator-decision evidence, trace normalization, dashboard quality views, and a disabled-by-default background contract governor for local expectation corrections. PIDEX also includes Docker-backed sandboxing in two forms: the optional hardened agent sandbox for selected source-changing pipeline work, and the validated local Project Pipeline MVP where project work runs inside a persistent Docker Project Sandbox. Both require the canonical `~/pidex` runtime checkout on Linux/WSL2 or `$HOME\pidex` for the experimental Windows bootstrap.

## Detailed feature docs

More detailed documentation for complex features lives in [`readme/`](readme/):

- [Dashboard](readme/dashboard.md)
- [Provider limits and profiles](readme/provider-limits-and-profiles.md)
- [Global Git security hook](readme/security-hooks.md)
- [Wiki hygiene](readme/wiki-hygiene.md)
- [Optional parallel agents](readme/parallel-agents.md)
- [Docker sandbox](readme/sandbox.md)
- [Project modes](readme/modes.md)
- [Bounded lifecycle review budgets](readme/review-budgets.md)
- [Project Pipeline](readme/project-pipeline.md)
- [Automatic quality reports](readme/automatic-quality-reports.md)
- [Quality governance](readme/quality-governance.md)
- [PIDEX modules](readme/modules.md)
- [Project session memory](readme/project-memory.md)
- [Project context](readme/project-context.md)
- [Windows status](readme/windows.md)

Project/process docs:

- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Prerequisites

PIDEX currently supports Linux/direct mode and includes experimental Windows bootstrap plus focused native Windows Docker Project Pipeline validation, including managed preview UX and Project Pipeline browser-smoke evidence on Docker Desktop Linux containers.

Linux / WSL2 recommended prerequisites:

- Git
- Node.js `>=22.19.0`
- npm (for Pi/npm bootstrap)
- pnpm `10.33.0` (Corepack may provide it, or install standalone with `npm install -g pnpm@10.33.0`)
- Pi CLI `>=0.78.0` installed globally:
  ```bash
  npm install -g @earendil-works/pi-coding-agent@0.78.0
  pi --version
  ```
- local Pi/Codex/provider authentication configured outside PIDEX

Windows prerequisites for the experimental PowerShell bootstrap:

- Git for Windows, including Git Bash for Bash-backed validation commands
- For native Windows `/pidex`/`/pd` host-direct work that uses Pi's Bash-backed command tool: a normal WSL2 Linux distribution with `/bin/bash` available as the default WSL distro. Docker Desktop's internal `docker-desktop` WSL distro is not sufficient. Validate with `wsl -e /bin/bash -lc "echo bash-ok"`.
- Node.js `>=22.12.0`
- npm (for Pi/npm bootstrap)
- pnpm `10.33.0` (Corepack may provide it, or install standalone with `npm install -g pnpm@10.33.0`)
- Pi CLI `>=0.78.0` installed globally:
  ```powershell
  npm install -g @earendil-works/pi-coding-agent@0.78.0
  pi --version
  ```
- Optional Docker Project Pipeline validation: Docker Desktop running Linux containers. Native Windows Project Pipeline `/pd` smoke and dashboard-style managed preview approval runs have passed, including a full Windows `/pd` browser-smoke run where QA emitted the canonical request schema and host Playwright returned `BROWSER-SMOKE-PASS`; broader native Windows pipeline support remains experimental.

See [Windows status](readme/windows.md) for support boundaries and the PowerShell bootstrap.

## Install

PIDEX v0.3 requires the canonical runtime checkout at exactly `~/pidex` on Linux/WSL2, or `$HOME\pidex` for the Windows bootstrap. Other runtime paths are not supported yet.

### Install modes

| Mode | Command | Result |
| --- | --- | --- |
| Full checkout | `git clone https://github.com/d-trattner/pidex.git ~/pidex && cd ~/pidex && ./install.sh` | Creates the canonical runtime checkout directly. Best for servers, development, and dashboard use. |
| Pi package bootstrap | `pi install npm:@d-trattner/pidex`, then `/pidex-init-home` in Pi | Installs lightweight Pi commands first, then initializes the canonical `~/pidex` checkout. |

### Full checkout install

Linux / WSL2:

```bash
git clone https://github.com/d-trattner/pidex.git ~/pidex
cd ~/pidex
./install.sh
# simulate without changing Pi settings:
./install.sh --dry-run
```

`install.sh` installs dashboard dependencies when needed, runs validation checks, runs `pi install ~/pidex`, and may optionally install the global Git security hook and optional browser-smoke QA support after interactive prompts. Non-interactive installs skip optional features unless requested.

Useful Linux/WSL2 install flags:

```bash
./install.sh --skip-dashboard-deps
./install.sh --install-global-git-hook
./install.sh --skip-global-git-hook
./install.sh --with-browser-smoke
./install.sh --with-browser-smoke --with-browser-smoke-system-deps
./install.sh --skip-browser-smoke
```

The same controls also exist as environment variables for automation, but flags are preferred for manual use.

Browser-smoke support is optional Playwright/Chromium-based QA for real browser checks (rendering, styles, console errors, and basic interactions). The normal browser-smoke install is PIDEX-local under runtime state/cache directories; it does not use npm-global Playwright and does not mutate user projects. On minimal Linux servers, actually launching Chromium may also require host-level packages. Use `--with-browser-smoke-system-deps` only when you accept that PIDEX may run Playwright's `install-deps chromium`, which uses apt, requires root/passwordless sudo, and modifies system packages.

### Pi package bootstrap install

PIDEX can also be installed as a lightweight Pi bootstrap package:

```bash
pi install npm:@d-trattner/pidex
```

The npm package provides the Pi commands/skills only. It does not replace the canonical `~/pidex` runtime checkout, and it is not the dashboard/runtime distribution. After installing the package, run this in Pi:

```text
/pidex-init-home
```

That command clones PIDEX into the canonical runtime checkout, runs the platform installer, removes the bootstrap package registration when possible, and asks you to run `/reload`. On Linux/WSL2 it uses `~/pidex` and `install.sh`; on native Windows it uses `$HOME\pidex` and `install.windows.ps1`. Normal `/pidex` and `/pd` pipeline runs require the canonical checkout and will stop with setup guidance if it is missing.

Runtime installation requires `pnpm@10.33.0`. Corepack may provide it, or install standalone with:

```bash
npm install -g pnpm@10.33.0
```

Keep npm's role narrow: npm installs Pi and the lightweight PIDEX bootstrap package; pnpm installs/checks the PIDEX runtime workspace.

### Windows experimental bootstrap

Windows experimental bootstrap:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/master/install.windows.ps1 | iex
```

Useful Windows install flags when running a downloaded script locally:

```powershell
.\install.windows.ps1 -SkipDashboardDeps
.\install.windows.ps1 -DryRun
```

For the one-line `irm ... | iex` form, use the defaults unless you specifically need an advanced automation override.

In the detailed docs, `<pidex-root>` means the canonical runtime checkout: `~/pidex` for Linux/WSL2 and `$HOME\pidex` for the Windows bootstrap.

Uninstall:

```bash
cd ~/pidex
./uninstall.sh
# simulate without changing Pi settings:
./uninstall.sh --dry-run
```

## Quick start

After a first install in a new Pi session, PIDEX resources should be available immediately. If Pi was already open during install, run `/reload` once.

In Pi:

```text
/pidex Work on ~/my-project
```

`/pd` is available as a short alias. The orchestrator routes work through Codex-oriented `pidex-*` specialist agents. PIDEX saves an explicit per-project mode: `host-direct`, `hardened-pipeline`, or `project-pipeline`. See [Project modes](readme/modes.md) for the capability matrix. For projects saved in `project-pipeline` mode, `/pd` runs through the persistent Docker Project Sandbox path instead of host-direct kickoff.

Project session memory:

```text
/pdmem optional note
```

`/pdmem` writes to `<project-root>/wiki/session-memory/`. See [Project session memory](readme/project-memory.md).

## Repo scope

- `agents/` – role prompts
- `rules/` – role-specific rules
- `templates/` – artifact/checklist templates
- `extensions/pidex/` – Pi extension entrypoint (`pidex_agent`)
- `config/agents.json` – default agent routing configuration
- `config/profiles/*.json` – provider/profile presets, including Spark/no-Spark and GPT-5.6 role-routing variants
- `scripts/delegate/` – `codex` delegate/auth wrapper
- `pidex.analysis-metrics-history` module – analytics, metrics, history helpers
- `pidex.memory-wiki-hygiene` module – wiki hygiene audit/cadence module
- `dashboard/` – local analytics UI
- `readme/` – detailed feature docs

## Smoke checks

```bash
cd ~/pidex
bash scripts/doctor.sh
pnpm run check
bash scripts/smoke-test.sh
node scripts/modules/run-check.mjs --capability memory-wiki-hygiene.check --agent pidex-wiki-hygienist --phase maintenance --project ~/pidex
```

## Dashboard

Cross-platform dashboard launcher:

```bash
cd ~/pidex
node dashboard/start.mjs
```

Linux / WSL2 can also use the compatibility shell launcher:

```bash
cd ~/pidex/dashboard
./start.sh
```

Windows has an experimental PowerShell install/uninstall bootstrap plus the cross-platform Node dashboard launcher:

```powershell
.\install.windows.ps1
cd $HOME\pidex
node dashboard/start.mjs
.\uninstall.windows.ps1
```

On native Windows, `node dashboard/start.mjs` runs the dashboard in the current terminal by default to avoid flashing helper console windows; stop it with `Ctrl+C`. See [Windows status](readme/windows.md). The Linux shell launchers are not required for the dashboard on native Windows.

The dashboard provides Overview, Live, Runs, Quality, Usage, Wiki, Context, and Settings sections. See [Dashboard](readme/dashboard.md).

## Provider limits and profiles

PIDEX tracks provider-native Codex quota windows, including Spark/no-Spark profile behavior and automatic no-Spark fallback when Spark is exhausted.

The current GPT-5.6 presets are:

| Profile | Routing | Recommended use |
| --- | --- | --- |
| `5.6-hybrid-balanced` | Evidence-selected GPT-5.6 routing: Sol for quality-critical reasoning/review/design/QA/security, Terra for implementation/operations/UAT/Pi, Luna for retrospectives | General daily default |
| `5.6-hybrid-lowcost` | Same critical routes, with Terra medium for bounded code review and QA | Explicit token-efficient mode |
| `5.6-sol-quality` | GPT-5.6 Sol for every PIDEX role | Selective quality-focused experiments; not the general default |

Switch profiles from the canonical PIDEX checkout:

```bash
node scripts/modules/run-check.mjs --capability provider-governance.probe --agent orchestrator --phase maintenance --project . -- use 5.6-hybrid-balanced
```

The original five-fixture benchmark selected Hybrid as the general default. Initiative 038 then added all-role C1 screening and independent H2 holdouts: Balanced now uses Sol medium for Critic, Sol high for Designer and QA, and Sol high instead of xhigh for Security. Lowcost preserves those critical routes but uses Terra medium for Code Reviewer and QA, where repeated H2 runs showed large token reductions with correct core outcomes. Neither prepared profile uses Spark. See [Provider limits and profiles](readme/provider-limits-and-profiles.md) for the public routing summary and selection guidance.

## Global Git security hook

PIDEX can optionally install a global Git pre-commit security hook for this Linux user. The hook saves/restores any previous global `core.hooksPath` and does not chain old hooks. See [Global Git security hook](readme/security-hooks.md).

## Wiki hygiene

Run a read-only wiki hygiene audit with `/pdwiki` after `/reload`, or directly with `node scripts/modules/run-check.mjs --capability memory-wiki-hygiene.check --agent pidex-wiki-hygienist --phase maintenance --project <project-root>`. Reports are written to `agents.output/wiki-hygiene/`; cadence state is tracked in `pidex/state/wiki-hygiene.json`. Project-specific PIDEX rules live under `pidex/rules/`. See [Wiki hygiene](readme/wiki-hygiene.md).

## Project context

PIDEX stores project domain context in `<project-root>/pidex/context/`. The dashboard Context page lets users review and edit `CONTEXT.md` glossary entries produced by agents. For existing projects, `/pidex` may use `grill-with-docs` to challenge plans against code/docs/context before planner handoff. See [Project context](readme/project-context.md).

## Optional parallel agents

PIDEX can define optional secondary lanes in `config/parallel-agents.json`. They are disabled by default, editable in Settings, and non-blocking. When enabled, configured critic/reviewer lanes run automatically at matching pipeline triggers unless the user requests a minimal single-lane run. Runtime warnings live in `state/parallel-agents/status.json`. See [Optional parallel agents](readme/parallel-agents.md).

## Automatic quality reports

Terminal pipeline lifecycle events can trigger automatic PDQ quality reports. Disable with:

```bash
PIDEX_AUTO_PDQ=0
```

See [Automatic quality reports](readme/automatic-quality-reports.md) and [Quality governance](readme/quality-governance.md).

