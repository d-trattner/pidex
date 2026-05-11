# Open Implementation Choice Pre-Selection (PROC-NEW-51-3)

**Applies to:** pidex-implementer (governs acceptance of briefing-note choices)
**Load when:** briefing note references a critic finding about an open implementation choice.

---

## Rule

When the orchestrator's briefing note states a **canonical implementation choice** (e.g.,
"use lazy-cached session, invalidated on 401" or "use Option A from the critic's M-2 finding"),
the implementer MUST treat that choice as **binding** — do not re-open the decision, do not
implement a variant, do not note alternatives in the impl doc.

**Why**: When a critic finding flags an open implementation choice as a "process cost risk,"
the orchestrator resolves it before spawn to prevent a code-review backward loop. If the
implementer overrides or ignores this choice, the loop the orchestrator tried to prevent will
occur.

## Pre-spawn orchestrator responsibility (reflected here for implementer awareness)

Before spawning pidex-implementer, the orchestrator should scan critic findings for any finding
containing language like:
- "open implementation choice"
- "process cost risk"
- "three approaches / two options / N alternatives"
- "code-review loop likely without pre-selection"

For each such finding, the orchestrator resolves the choice and states it in the briefing note
as: "Canonical choice (critic M-N): <choice>. Treat as binding."

## Implementer action

When the briefing note contains a "Canonical choice" line:
1. Note the choice at the top of the implementation doc under "Pre-decided by orchestrator"
2. Implement that choice without deviation
3. In the critic resolution table, mark the relevant finding as: "RESOLVED — canonical choice
   applied per orchestrator briefing (lazy-cached session / Option A / etc.)"

## Empirical basis

- Plan 51 (pihole-fanout-writes, 2026-04-29): Critic M-2 flagged three open auth approaches.
  Orchestrator chose "lazy-cached, invalidated on 401" before implementer spawn. Implementer
  applied it. Code reviewer had no dispute. Zero backward loop. Critic had predicted a loop
  without pre-selection.
- Plan 50: Similar open-choice scenario in a prior adapter plan; loop occurred because no
  pre-selection was made before spawn.
