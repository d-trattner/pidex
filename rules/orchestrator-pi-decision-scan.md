# Rule: Orchestrator PI Decision Scan

PROC-NEW-ORCH-PI-DECISION | orchestrator

## Rule

After every `pidex-pi` handoff, before following ROUTING, orchestrator must read the returned `context_file` and scan for unresolved PI decision markers:

- `User Decision Required`
- `Gate G7`
- `approve-all`
- `Suggested Agent Instruction Updates`
- proposed edits to `agents/*.md`, `rules/**`, workflow docs, or project rule files

If found, pause and ask user for decision even if PI ROUTING says `route_to: pidex-roadmap`.

## Required action

Ask:

```text
PI proposes process/rule changes. Choose:
- approve-all
- approve selected: <list>
- defer
- reject
```

Do not run roadmap or mark pipeline complete until decision is recorded and applied/deferred/rejected.

## Why

ROUTING is generally authoritative, but PI approval semantics are a higher-level gate. A PI artifact can contain approval-required rule changes while accidentally routing to roadmap. This rule prevents unattended completion with unresolved governance decisions.
