# Rule: Collection Completeness AC for Parser-Heavy Plans

PROC-NEW-92-2 | pidex-planner

## Trigger

Plans that parse, normalize, or validate collections/arrays from API or file payloads.

## Rule

Planner MUST add explicit acceptance criteria proving collection completeness, not first-item-only success.

Required additions:

- AC row requiring per-item validation across full collection.
- Validation matrix row with fixture containing mixed-validity items and expected per-index outcomes.
- Negative row for extra/unknown key rejection at item level.

## Template

```md
| AC-ID | Requirement | Evidence |
|---|---|---|
| AC-COLLECT-1 | Parser validates every item in collection; failures identify exact index/path | test: `parser.collection.spec.ts` with mixed fixture; output shows index-specific failures |
```

## Fail Criteria

Plan blocked for critic handoff when parser-heavy scope lacks collection-completeness AC row(s).