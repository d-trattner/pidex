---
name: grill-with-docs
description: PIDEX grilling session for existing projects. Challenges a plan against code/docs/domain context, sharpens terminology, and updates PIDEX project context under <project-root>/pidex/context/ when decisions crystallise. Use for existing codebases during /pidex pre-flight; use grill-me for new/non-existing projects.
---

# PIDEX grill-with-docs

Adapted from Matt Pocock's `grill-with-docs` skill for PIDEX project-local context paths and pipeline pre-flight.

<what-to-do>

Interview the user relentlessly about every aspect of the plan until we reach shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. For each question, provide your recommended answer.

Ask questions one at a time, waiting for feedback on each question before continuing.

If a question can be answered by exploring the codebase or existing docs, inspect those instead of asking.

Stop once you can write a crisp 3-5 sentence epic statement with explicit acceptance criteria, constraints, and out-of-scope items for the PIDEX planner.

</what-to-do>

<supporting-info>

## When PIDEX should use this skill

Use this skill for **existing projects** where code, docs, or durable project context can be inspected.

Do **not** use this skill for non-existing/new projects. Use `grill-me` for new project onboarding.

## PIDEX context paths

PIDEX does not use root `CONTEXT.md` or root `docs/adr/` by default.

Single-context project:

```text
<project-root>/pidex/context/CONTEXT.md
<project-root>/pidex/context/adr/*.md
```

Multi-context project:

```text
<project-root>/pidex/context/CONTEXT-MAP.md
<project-root>/pidex/context/contexts/<name>/CONTEXT.md
<project-root>/pidex/context/contexts/<name>/adr/*.md
```

Create files lazily — only when there is durable context to write. If no `CONTEXT.md` exists, create it when the first domain term is resolved. If no `adr/` directory exists, create it when the first ADR is needed.

## Domain awareness

During codebase exploration, also look for existing PIDEX context and project docs:

1. Read `<project-root>/pidex/context/CONTEXT-MAP.md` if present.
2. Read the relevant `<project-root>/pidex/context/**/CONTEXT.md` file(s).
3. Check `<project-root>/wiki/` for durable project knowledge when it helps clarify user intent.
4. Inspect code with targeted searches/snippets when claims can be verified from source.

Keep context lean: prefer `rg`, `find`, and narrow file reads over loading large generated artifacts.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with existing language in `pidex/context/CONTEXT.md`, call it out immediately:

> Your glossary defines "cancellation" as X, but you seem to mean Y — which is it?

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term:

> You're saying "account" — do you mean the Customer or the User? Those are different things.

### Discuss concrete scenarios

When domain relationships are discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force precision about concept boundaries.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it:

> Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?

### Update PIDEX context inline

When a term is resolved, update the relevant `pidex/context/**/CONTEXT.md` immediately. Do not batch these up. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` is a glossary and relationship map. It must not become a scratch pad, a task spec, or an implementation design doc.

Before adding a term, ask: is this a concept specific to this project's domain/context, or a general programming concept? Only project/domain concepts belong.

### User owns truth

The user/domain expert owns context truth. Agents may update context only from confirmed user statements or clear code evidence. If unsure, ask or record the ambiguity explicitly under `## Flagged ambiguities`.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — changing later has meaningful cost.
2. **Surprising without context** — a future reader will wonder why.
3. **Real trade-off** — there were genuine alternatives and one was chosen for specific reasons.

If any condition is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

## Output expected by `/pidex`

Return or produce enough information for the orchestrator to continue with `pidex-planner`:

- epic statement, 3-5 sentences
- acceptance criteria
- constraints
- explicit out-of-scope items
- relevant context files touched/read
- any ADRs created or proposed

</supporting-info>
