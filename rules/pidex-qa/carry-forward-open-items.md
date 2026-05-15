# Carry-Forward Open Items Filing

**PROC-NEW-41c** | Added: 2026-04-26 | Plan 41 evidence

## Rule

During QA, review the implementation doc for any items marked as "carry-forward", "deferred", "out of scope for this plan", or similar language. For each such item:

1. Check whether an entry already exists in `wiki/open-items.md`
2. If NOT present: add an entry under the current plan's section
3. Format: `- [OPEN] **<finding-id>** — <one-line summary> Carry-forward from Plan <N>; recommended for Plan <M> or next available. (pidex-qa, Plan <N>)`

## What counts as a carry-forward item

- Pre-existing test flakes confirmed on prior baseline (not introduced by this plan)
- TODO items in code that the plan explicitly deferred (e.g. "no TODO comment added; deferred per design intent")
- Type/interface duplication accepted as consistent with peer pattern but flagged for future DRY refactor
- Live data available but wiring explicitly deferred to a future plan

## What does NOT need filing

- Items already in open-items.md (check before filing to avoid duplicates)
- Items the implementation doc resolves (ADDRESSED/RESOLVED status)
- Items so low priority that "never" is a legitimate disposition (add a note in the entry if so)

## Why

Without open-items entries, carry-forward items exist only in the pipeline doc where they were found. Future planners cannot discover them without reading every past implementation/QA doc. open-items.md is the single canonical list for deferred findings.
