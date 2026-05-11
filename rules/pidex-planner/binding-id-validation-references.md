# Binding-ID Validation References

PROC-NEW: PIPELINE-ANALYST-1B

## Trigger

Plans with load-bearing binding tables or named invariant rows, including status/badge/degraded contracts, route contracts, taxonomy tables, UI label source contracts, source-of-truth parity tables, or security/error contracts.

## Rule

Validation/acceptance rows must cite binding IDs verbatim instead of paraphrasing only.

Good:

```md
| AC-BD-1 | Verify BD-1 missing data renders `?` badge and aria text from BD-1 |
```

Bad:

```md
| AC | Verify the missing state shows some fallback if chosen |
```

If a contract table has no row IDs, add them before critic handoff.

## Enforcement

- Missing IDs on load-bearing contract rows: revise plan.
- Validation prose contradicting or weakening binding rows: revise plan.
- Critic should reject if AC/validation rows paraphrase a binding table in a way that changes meaning.

## Why

Prevents drift between binding tables and validation prose across planner → implementer → reviewer.
