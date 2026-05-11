# Draft ROUTING Block Cleanup

**PROC-NEW-41b** | Added: 2026-04-26 | Plan 41 evidence

## Rule

When emitting the final `<!-- ROUTING -->` block, the agent MUST overwrite (not append alongside) the IN_PROGRESS draft block.

**Correct:** single `<!-- ROUTING ... verdict: APPROVED ... -->` in the committed doc
**Incorrect:** both `<!-- ROUTING ... verdict: IN_PROGRESS ... -->` AND `<!-- ROUTING ... verdict: APPROVED ... -->` in the same file

## How to overwrite

Use Edit tool to replace the IN_PROGRESS block:
- old_string: the entire `<!-- ROUTING ... verdict: IN_PROGRESS ... -->` block
- new_string: the final `<!-- ROUTING ... verdict: APPROVED ... -->` block

Do NOT append the final block as a separate HTML comment after the draft.

## Why

The orchestrator reads the LAST `<!-- ROUTING -->` block, so functionally both patterns route correctly. However, human readers of closed docs see a confusing `IN_PROGRESS` verdict in a file that is clearly finalized. Single authoritative verdict = unambiguous doc state.

## Applies to

All agents using two-phase ROUTING (Rule 9c): pidex-designer, pidex-implementer, any agent emitting an IN_PROGRESS draft.
