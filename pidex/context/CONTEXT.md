# PIDEX Project Context

PIDEX is a project-local agent orchestration system forked from Running Pi. It coordinates specialist `pidex-*` agents, dashboard tooling, quality gates, project memory, and durable project metadata while keeping generated runtime artifacts out of Git.

## Language

**PIDEX**:
A Codex-first pipeline/orchestration framework that runs `pidex-*` specialist agents through Pi. PIDEX owns agent prompts, rules, provider profiles, dashboard features, project-local metadata conventions, and pipeline closeout behavior.
_Avoid_: Running Pi, RP, generic agent runner

**Project wiki**:
Durable human/project knowledge stored at `<project-root>/wiki/`. This is for decisions, domain context, session memories, and knowledge the user may want to read or sync to Obsidian.
_Avoid_: agents.output, generated report folder

**PIDEX metadata**:
Operational PIDEX data stored at `<project-root>/pidex/`. This includes context, project-local rules, project-local config, and PIDEX state. It is separate from the human-facing project wiki.
_Avoid_: wiki metadata, hidden agent state

**Project context**:
Domain language and decisions stored under `<project-root>/pidex/context/`, especially `CONTEXT.md`. The user/domain expert owns the truth; agents may propose updates, but the dashboard should make review and correction easy.
_Avoid_: auto memory, unreviewed agent truth

**Generated artifact**:
Runtime/operator output under `agents.output/**`. These files can contain useful intermediate work, but must not be committed. Durable conclusions should be copied or distilled into `wiki/` or `pidex/state/` when appropriate.
_Avoid_: commit artifact, source document

**Pipeline**:
A structured PIDEX run that routes work through planner, implementer, critic/code-reviewer, QA/UAT, DevOps, retrospective, or other specialist agents as needed.
_Avoid_: single chat, ad hoc task

**Orcha**:
Alias for the PIDEX orchestrator: the host Pi session that coordinates the `pidex-*` agents, reads ROUTING blocks, handles gates, and decides next route.
_Avoid_: separate specialist agent, Forge-only term

**Parallel lane**:
An optional non-blocking secondary agent run configured in `config/parallel-agents.json`. Parallel lanes provide extra review signals and must be merged/adjudicated before their findings are treated as accepted.
_Avoid_: required gate, primary reviewer

**Provider profile**:
A routing preset in `config/profiles/*.json` that is applied to `config/agents.json`. Switching a profile should change actual agent routing, not just dashboard state.
_Avoid_: display-only profile, quota label

**G9 evidence**:
Browser-level UI evidence required before asking the user to re-preview a previously rejected UI/G9 flow. After rejection, agents need live Playwright evidence for the exact flow before returning to the user.
_Avoid_: screenshot guess, static claim

**Wiki hygiene**:
Read-only audit work owned by `pidex-wiki-hygienist` in the `/pd` flow or explicit `/pdwiki`. Reports are generated under `agents.output/wiki-hygiene/`; durable state may be tracked in `pidex/state/wiki-hygiene.json`.
_Avoid_: orchestrator cleanup, automatic wiki rewrite

## Relationships

- `wiki/` is for durable human/project knowledge.
- `pidex/` is for PIDEX operational metadata and context.
- `agents.output/` is generated runtime output and must not be committed.
- The dashboard reads project selection from the shared `project` query parameter.
- The Context dashboard edits `pidex/context/CONTEXT.md` conservatively, with raw Markdown fallback and stale-write protection.
- Optional parallel lanes can add evidence, but primary agents/orchestrator must adjudicate conflicts.
- Provider-profile changes must update `config/agents.json` so future runs use the selected routing.

## Example dialogue

User: "Can you add a dashboard editor for context?"

Agent: "I will edit the dashboard, add an API for `<project-root>/pidex/context/CONTEXT.md`, preserve raw Markdown fallback, validate glossary entries, and avoid committing `agents.output/**`."

User: "Should this go in the wiki?"

Agent: "Human-facing durable knowledge belongs in `wiki/`; PIDEX operational context belongs in `pidex/context/`. For this dashboard feature, `pidex/context/CONTEXT.md` is the correct target."

## Flagged ambiguities

- Whether future `CONTEXT-MAP.md` support should be exposed in the dashboard as tabs, a tree, or separate route pages.
- Whether context saves should offer an optional one-click Git commit after explicit user approval.
- How much agent-written context should be auto-suggested versus requiring a user review queue.

## Open Questions / Needs User Review



