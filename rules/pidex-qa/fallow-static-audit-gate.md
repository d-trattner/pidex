# Rule: Fallow Static Audit Gate (JS/TS Plans)

PROC-NEW-61-QA

## Trigger
Apply when plan modifies JavaScript/TypeScript source (`*.js`, `*.jsx`, `*.ts`, `*.tsx`).

For non-JS/TS plans, record an explicit skip line instead of silently omitting this gate:

```text
FALLOW-SKIP: non-JS/TS scope
```

## Requirement
Before final QA verdict, run a fallow static audit and record result in QA doc.

## Command (preferred)
```bash
npx fallow audit --format json --quiet --explain 2>/dev/null || true
```

## Fallback
If `npx fallow` unavailable (offline/tooling issue):
1. Mark `FALLOW-SKIP` in QA doc with reason.
2. Continue QA (non-blocking), but include follow-up note.

## QA Doc Evidence (minimum)
- Command executed
- Outcome: `PASS_WITH_FINDINGS` or `FALLOW-SKIP`
- Top 3 findings summary (if present)
- Statement whether findings block this plan (default: non-blocking unless they violate explicit plan AC/security contract)

## Gate
No `QA COMPLETE` without either:
- fallow evidence section, or
- explicit `FALLOW-SKIP` rationale.
