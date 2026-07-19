# Rule: Conversation-to-Roadmap Promotion

PROC-NEW-CONVERSATION-ROADMAP | orchestrator

## Purpose

Prevent multi-increment product direction from bypassing the canonical roadmap and turning one conversational item into implementation while dependent sibling work remains unstructured.

## Ordering

Run this check after task clarification and before task classification, `pidex-architect`, `pidex-planner`, or any implementation route.

## Trigger

Trigger when a user discussion, analysis artifact, parity matrix, audit, or design session produces two or more confirmed or credible future delivery increments with dependencies, a shared target, or an explicit/implied delivery order.

Examples:

- `Phase 1 / Phase 2 / Phase 3`;
- multiple proposed increments or packages;
- a parity matrix containing prioritized delivery increments;
- an audit producing several product capabilities;
- `first we do X, then Y`;
- a confirmed long-term target spanning multiple domains.

Do not count rejected alternatives, comparison-only options, duplicate wording, or incidental follow-ups as delivery increments. A single small follow-up does not trigger this rule.

## Canonical roadmap check

Read `<project-root>/agents.output/roadmap/product-roadmap.md` with targeted snippets and reconcile semantically equivalent entries before proposing changes. Also apply the normal roadmap-first reconciliation for newer roadmap/planning artifacts.

If all increments already exist, identify their current roadmap statuses and continue without duplication. Entries with `Interview`, candidate/backlog, or unresolved dependency status are not implementation-ready.

If one or more increments are absent:

1. State clearly that they are analysis/planning candidates, not canonical roadmap commitments.
2. Recommend a candidate roadmap update before selecting an implementation epic.
3. Recommend a likely first epic and briefly explain dependency order.
4. Ask once for approval to invoke `pidex-roadmap`.
5. Do not invoke `pidex-architect`, `pidex-planner`, or `pidex-implementer` before this roadmap decision is resolved.

Expected phrasing:

```text
This discussion produced multiple dependent delivery increments. They are not yet represented in the canonical roadmap. I recommend invoking pidex-roadmap now, with <X> as the first candidate epic because <reason>. Shall I do that?
```

## Roadmap ownership

The orchestrator may inspect and summarize the canonical roadmap, detect missing increments, recommend sequencing, and ask for promotion approval.

The orchestrator must never create, edit, rewrite, or append to the canonical roadmap. It must not produce a substitute roadmap draft. `pidex-roadmap` is the sole roadmap-writing authority.

After user approval:

1. Build a compact `CONTEXT-PACK-MANUAL` containing confirmed decisions, candidate increments, dependencies, and mandatory source artifact paths.
2. Invoke `pidex-roadmap` through `pidex_agent` with the project boundary block and exact canonical output path `agents.output/roadmap/product-roadmap.md`.
3. Require candidate entries to remain `Interview` or backlog/candidate status until user review unless they were already explicitly accepted and fully defined.
4. Present the `pidex-roadmap`-produced update to the user for review.
5. Route a relevant entry to architect/planner only after user acceptance and when its canonical status permits implementation planning.

If `pidex-roadmap` fails, stalls, or produces no valid canonical update, retry the specialist or route to the user. The orchestrator must not take over roadmap writing as fallback.

## TBR selection

A TBR promotion requires explicit user selection of exact `TBR-<id>` values. Create roadmap candidate/Interview entry first; retain source item as promoted tombstone. Never auto-analyze, promote, plan, or start work from archive presence.

## Guardrails

- Do not wait for the user to ask whether a roadmap exists.
- Do not silently treat an analysis matrix or conversational list as canonical roadmap authority.
- Do not start one increment while dependent sibling increments remain unstructured.
- Do not promote `Interview`, backlog, or candidate entries to `Planned` without user review.

Exception: an explicitly requested standalone urgent task may proceed when it has no dependency impact on sibling candidates. State the exception and preserve the remaining candidates for later roadmap review. This exception cannot be used when the current task determines or constrains sibling sequencing.
