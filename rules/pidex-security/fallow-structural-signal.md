# Rule: Fallow Structural Signal (JS/TS Security Reviews)

PROC-NEW-61-SEC

## Trigger
Apply in targeted/full security reviews when changed surface includes JavaScript/TypeScript.

For non-JS/TS plans, record an explicit skip line instead of silently omitting this gate:

```text
FALLOW-SKIP: non-JS/TS scope
```

## Requirement
Run fallow once as structural signal to complement security scans.

## Command (preferred)
Use detected package-manager equivalent per [Package Manager Equivalence](../shared/package-manager-equivalence.md):

```bash
pnpm exec fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations 2>/dev/null || true
# npm compatibility path:
npm exec -- fallow dead-code --format json --quiet --explain --unused-deps --unlisted-deps --circular-deps --boundary-violations 2>/dev/null || true
```

## Interpretation
- Fallow output is **supporting signal**, not standalone security verdict.
- Treat as security-relevant when findings imply hidden attack surface or dependency drift risk (e.g., unlisted deps, circular boundary violations around auth/network modules).

## Fallback
If fallow unavailable, mark `FALLOW-SKIP` with reason in security doc (non-blocking by itself).

## Security Doc Evidence (minimum)
- Command executed
- Whether findings influenced severity/risk
- Any follow-up item created from fallow signal
