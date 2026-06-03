# Rule: Fallow Evidence for JS/TS Review

PROC-NEW-FALLOW-CODE-REVIEW

## Trigger

Apply when code review scope includes JavaScript/TypeScript source (`*.js`, `*.jsx`, `*.ts`, `*.tsx`) or when plan explicitly requests static architecture hygiene.

For non-JS/TS plans, record an explicit skip line:

```text
FALLOW-SKIP: non-JS/TS scope
```

## Requirement

Run one lightweight Fallow signal or document why it was skipped. This supports review; it does not replace human code review.

## Preferred command

Use detected package-manager equivalent per [Package Manager Equivalence](../shared/package-manager-equivalence.md):

```bash
pnpm exec fallow audit --format json --quiet --explain 2>/dev/null || true
# npm compatibility path:
npm exec -- fallow audit --format json --quiet --explain 2>/dev/null || true
```

## Evidence section

```markdown
## Fallow Evidence

- Command: `<command>` or `FALLOW-SKIP: <reason>`
- Outcome: PASS_WITH_FINDINGS / FALLOW-SKIP
- Review impact: `<blocking? follow-up?>`
```

## Gate

No final approval for JS/TS scope without either Fallow evidence or explicit `FALLOW-SKIP: <reason>`.
