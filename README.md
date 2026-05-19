# PIDEX

PIDEX is my personal LLM exploration project: a place where I try to understand how to use Codex-oriented LLMs effectively in a software-delivery pipeline. It is in constant development and refinement, keeps evolving over time, and now includes many principles I learned along the way. The LLM world moves so fast that trying to follow every “new” and “best” approach can be overwhelming and exhausting. At some point, you just have to try things, measure what happens, and see where it goes.

Metrics are a useful way to test what works and what does not, so PIDEX includes a local dashboard for pipeline state, quality signals, provider usage, and project context. PIDEX also follows the LLM Wiki direction: durable project knowledge should be explicit, reviewable, and close to the source instead of hidden behind opaque retrieval machinery. I tried RAG too, but for this project I prefer fewer dependencies and more explicit context.

The pipeline is self-improving through rules. Every project can split refinements into global PIDEX rules and project-specific rules. If you have refinements you think would help, feel free to add them in a PR.

Like many devs, I was initially driven by the excitement of creating things with little effort. Over time, that feeling had to give way to a more disciplined process, so most of the refinement now happens at the user-llm level. Having an orchestrator question you in detail is the most important step. You can use the `grill-me` or `grill-with-docs` skill for that, or rely on the predefined orchestrator instructions.

Status: **experimental direct-mode MVP**. Direct mode is the supported path today.

## Detailed feature docs

More detailed documentation for complex features lives in [`readme/`](readme/):

- [Dashboard](readme/dashboard.md)
- [Provider limits and profiles](readme/provider-limits-and-profiles.md)
- [Global Git security hook](readme/security-hooks.md)
- [Wiki hygiene](readme/wiki-hygiene.md)
- [Optional parallel agents](readme/parallel-agents.md)
- [Automatic quality reports](readme/automatic-quality-reports.md)
- [Project session memory](readme/project-memory.md)
- [Project context](readme/project-context.md)
- [Future briefs](readme/future-briefs.md)

Project/process docs:

- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Install

PIDEX v0.1 expects the checkout at exactly `~/pidex`. Other checkout paths are not supported yet.

```bash
git clone <pidex-repo-url> ~/pidex
cd ~/pidex
./install.sh
# simulate without changing Pi settings:
./install.sh --dry-run
```

`install.sh` runs `pi install ~/pidex` and may optionally install the global Git security hook after an interactive prompt. Non-interactive installs skip the hook unless `PIDEX_INSTALL_GLOBAL_GIT_HOOK=1` is set.

In the detailed docs, `<pidex-root>` means `~/pidex` for v0.1.

Uninstall:

```bash
cd ~/pidex
./uninstall.sh
# simulate without changing Pi settings:
./uninstall.sh --dry-run
```

## Quick start

In Pi:

```text
/pidex Add a small helper in ~/my-project
```

`/pd` is available as a short alias. The orchestrator routes work through Codex-oriented `pidex-*` specialist agents.

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
- `config/agents.json` – Codex-only routing
- `config/profiles/*.json` – provider/profile presets, including Spark/no-Spark variants
- `scripts/delegate/` – `codex` delegate/auth wrapper
- `scripts/metrics/` + `scripts/pipeline/` – analytics helpers
- `scripts/analysis/` – pipeline analysis scaffold
- `scripts/wiki/` – wiki hygiene audit/cadence helpers
- `dashboard/` – local analytics UI
- `readme/` – detailed feature docs

## Smoke checks

```bash
cd ~/pidex
bash scripts/doctor.sh
npm run check
bash scripts/smoke-test.sh
python3 scripts/wiki/hygiene.py audit --project ~/pidex
```

## Dashboard

```bash
cd ~/pidex/dashboard
./start.sh
```

The dashboard provides Overview, Live, Runs, Quality, Usage, Wiki, Context, and Settings sections. See [Dashboard](readme/dashboard.md).

## Provider limits and profiles

PIDEX tracks provider-native Codex quota windows, including Spark/no-Spark profile behavior and automatic no-Spark fallback when Spark is exhausted. See [Provider limits and profiles](readme/provider-limits-and-profiles.md).

## Global Git security hook

PIDEX can optionally install a global Git pre-commit security hook for this Linux user. The hook saves/restores any previous global `core.hooksPath` and does not chain old hooks. See [Global Git security hook](readme/security-hooks.md).

## Wiki hygiene

Run a read-only wiki hygiene audit with `/pdwiki` after `/reload`, or directly with `python3 scripts/wiki/hygiene.py audit --project <project-root>`. Reports are written to `agents.output/wiki-hygiene/`; cadence state is tracked in `pidex/state/wiki-hygiene.json`. Project-specific PIDEX rules live under `pidex/rules/`. See [Wiki hygiene](readme/wiki-hygiene.md).

## Project context

PIDEX stores project domain context in `<project-root>/pidex/context/`. The dashboard Context page lets users review and edit `CONTEXT.md` glossary entries produced by agents. For existing projects, `/pidex` may use `grill-with-docs` to challenge plans against code/docs/context before planner handoff. See [Project context](readme/project-context.md).

## Optional parallel agents

PIDEX can define optional secondary lanes in `config/parallel-agents.json`. They are disabled by default, editable in Settings, and non-blocking. When enabled, configured critic/reviewer lanes run automatically at matching pipeline triggers unless the user requests a minimal single-lane run. Runtime warnings live in `state/parallel-agents/status.json`. See [Optional parallel agents](readme/parallel-agents.md).

## Automatic quality reports

Terminal pipeline lifecycle events can trigger automatic PDQ quality reports. Disable with:

```bash
PIDEX_AUTO_PDQ=0
```

See [Automatic quality reports](readme/automatic-quality-reports.md).

## Future briefs

Notable future-epic briefs live under `agents.output/briefs/`. See [Future briefs](readme/future-briefs.md).
