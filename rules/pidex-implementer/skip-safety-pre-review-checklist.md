# Rule: Skip-Safety Pre-Review Checklist

PROC-NEW-021-2 | pidex-implementer

## Trigger

Spawn touches execution profile expansion, skipped-agent validation, skip persistence, or route transitions that can mark stages `skipped`.

## Rule

Before first review handoff, implementer MUST complete checklist:

1. Safety reject checks
   - Mandatory/unsafe skip attempts rejected with explicit safe validation error.
   - Invalid agent names rejected.
2. Persistence checks
   - Each skipped agent persisted as first-class stage with `status=skipped` and skip reason.
   - Route transition/audit trail records skip path.
3. Negative tests
   - Add/update tests for invalid skip + unsafe skip + silent omission prevention.
4. Handoff evidence
   - Impl doc lists checklist results and test proof before review request.

## Why

Epic 021 retro showed late skip-safety hardening loop and review churn. Early checklist + negative tests prevent repeat.