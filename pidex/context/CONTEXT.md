# PIDEX Project Context

Domain language for PIDEX project-local agent orchestration, dashboard tooling, project memory, and durable metadata.

## Language

**PIDEX**:
A Codex-first pipeline/orchestration framework that runs `pidex-*` specialist agents through Pi.
_Avoid_: Running Pi, RP, generic agent runner

**Project wiki**:
Durable human/project knowledge stored at `<project-root>/wiki/`.
_Avoid_: agents.output, generated report folder

**PIDEX metadata**:
Operational PIDEX data stored at `<project-root>/pidex/`.
_Avoid_: wiki metadata, hidden agent state

**Project context**:
Domain language stored under `<project-root>/pidex/context/`, especially `CONTEXT.md`.
_Avoid_: auto memory, unreviewed agent truth, task spec

**Generated artifact**:
Runtime/operator output under `agents.output/**` that must not be committed.
_Avoid_: commit artifact, source document

**Pipeline**:
A structured PIDEX run that routes work through planner, implementer, reviewer, QA/UAT, DevOps, retrospective, or other specialist agents.
_Avoid_: single chat, ad hoc task

**Orcha**:
Alias for the PIDEX orchestrator: the host Pi session that coordinates `pidex-*` agents, ROUTING blocks, gates, and next routes.
_Avoid_: separate specialist agent, Forge-only term

**Parallel lane**:
An optional secondary review run resolved from `PIDEX_PARALLEL_AGENTS_CONFIG`, local operator config, then the disabled public `config/parallel-agents.json` default. In Project Pipeline it runs sequentially inside `/workspace`; ordinary provider failure is advisory, while write-fence/adjudication failure blocks continuation.
_Avoid_: host fallback, unadjudicated reviewer, primary reviewer

**Agent balance tracker**:
A provider-wide estimate feature that combines user-entered balance snapshots with provider token metrics.
_Avoid_: exact billing truth, provider API balance, per-model balance

**Provider profile**:
A routing preset in `config/profiles/*.json` that applies to `config/agents.json`.
_Avoid_: display-only profile, quota label

**G9 evidence**:
Browser-level UI evidence required before asking the user to re-preview a previously rejected UI/G9 flow.
_Avoid_: screenshot guess, static claim

**Wiki hygiene**:
Read-only audit work owned by `pidex-wiki-hygienist` in the `/pd` flow or explicit `/pdwiki`.
_Avoid_: orchestrator cleanup, automatic wiki rewrite

## Relationships

- The **Project wiki** stores durable human/project knowledge.
- **PIDEX metadata** stores operational PIDEX data and **Project context**.
- **Generated artifacts** are runtime outputs and must not be committed.
- A **Pipeline** is coordinated by **Orcha**.
- A **Parallel lane** can add evidence, but primary agents or **Orcha** must adjudicate conflicts.
- **Provider profile** changes must update `config/agents.json` so future runs use the selected routing.
- The dashboard edits **Project context** conservatively with raw Markdown fallback and stale-write protection.

## Example Dialogue

> **User:** "Can you add a dashboard editor for context?"
> **Agent:** "Yes — I will edit the dashboard for **Project context**, preserve raw Markdown fallback, and avoid committing **Generated artifacts**."

> **User:** "Should this go in the wiki?"
> **Agent:** "Human-facing durable knowledge belongs in the **Project wiki**; PIDEX operational language belongs in **Project context**."

## Flagged Ambiguities

- Future `CONTEXT-MAP.md` dashboard support could be exposed as tabs, a tree, or separate route pages.
- Context saves might offer an optional one-click Git commit only after explicit user approval.
- Agent-written context should stay conservative because the user/domain expert owns truth.
