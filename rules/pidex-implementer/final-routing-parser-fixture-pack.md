# Final ROUTING Parser Fixture Pack

PROC-NEW: 029-PI-3

## Trigger
Prompt-contract or parser work touching final `<!-- ROUTING -->` semantics.

## Rule
Implementer MUST reuse shared fixture pack covering:
- positive: final block present, required fields parse
- negative: missing required field
- negative: trailing content after final ROUTING block
- negative: non-final/duplicate ROUTING handling per contract

## Evidence
Implementation doc `Validation` section lists fixture names + pass/fail results.

## Why
Locks machine-parse reliability for final routing contract.