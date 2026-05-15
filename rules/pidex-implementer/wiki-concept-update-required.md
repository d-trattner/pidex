# Rule: Wiki Concept Update Required in Same Slice (PROC-NEW-42a)

## Trigger

The plan's Files in Scope table includes a row for a file under `wiki/concepts/`.

## Rule

A wiki concept update listed in the plan's Files in Scope table is a **required deliverable** — not optional, not deferrable, and not conditional on the retrospective or PI.

Execute the wiki concept update in the **same slice as the code that motivates it**. Typical placement: the final slice (after the primary implementation commits), but before writing the implementation doc summary.

**This is a slice-completion blocker.** A slice is not complete if its associated wiki concept update is not committed.

## Rationale

Plans 40, 41, and 42 all contained explicit wiki concept update instructions (one-line entries in `wiki/concepts/`). All three were deferred to "pidex-retrospective or pidex-pi will handle it." The cumulative effect is that the wiki diverges from the implementation: the concept doc documents Pattern V1 (first use) while the codebase has Pattern V1+V2+V3. The implementer has full context at implementation time; the retro/PI agent must reconstruct it afterward.

## How to apply

1. At task start, scan the plan's Files in Scope table for any row referencing `wiki/`.
2. If such a row exists, note the target file and the expected content (usually a one-line note).
3. Commit the wiki update in the appropriate slice (commonly the final slice or alongside the code it documents).
4. Include the wiki file path in the implementation doc's "Files Modified" list.
5. Do NOT leave the row as "DEFERRED" in the implementation doc.

## Validation

The next plan that reuses a documented pattern should have the concept doc update committed within the implementation — verifiable by checking the implementation doc's Files Modified list for the wiki path.

## Origin

PROC-NEW-42a — Plan 42 (network-audit-persistence), third consecutive deferral of wiki concept update.
