# Rule: Design Review Must-Fix Check

PROC-NEW-11 | pidex-implementer

## Rule

**Read design review from `agents.output/design/<id>-<slug>-design-review.md` if it exists. Check "Must-Fix Before Commit" section FIRST.**

Each item in that section = mandatory TDD requirement. Write failing test before implementing that component.

No "Must-Fix Before Commit" section = no Medium+ design findings.

## Where to check

In the Workflow section, after reading the plan:
```
Read design review (if exists) → check "Must-Fix Before Commit" FIRST
```

## Why

Plan 25 aria finding buried mid-doc, skipped, required extra Spawn B (~20 tool_uses + 1 extra commit). Must-Fix callout at top of design review doc eliminates this class of missed finding.
