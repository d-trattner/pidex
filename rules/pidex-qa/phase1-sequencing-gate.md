# Rule: Phase 1 Sequencing Gate

PROC-NEW-3 | pidex-qa

## Rule

**Do NOT invoke any `mcp__playwright__*` tool until Phase 1 (unit test suite run + coverage check) is complete AND those results are written to the QA doc.**

Phase 1 completion = test run command executed, pass/fail count recorded, coverage percentage written to doc. Only then proceed to Phase 2 (Runtime Smoke / Browser-Level Smoke).

## Why

Playwright calls consume 5-7 tool_uses each. Entering Phase 2 before Phase 1 is written = budget waste with no Phase 1 evidence surviving if agent stalls.

## Anti-pattern

Plan 32: pidex-qa entered Playwright before Phase 1 doc was complete — minor budget waste, recoverable only because QA completed. Treat Phase 1 doc write as a hard gate, not a soft preference.

## Enforcement

Phase 1 done checklist (all must be true before first Playwright call):
- [ ] Test run command executed (`npx vitest run` / `pytest` / equivalent)
- [ ] Pass/fail count written to QA doc
- [ ] Coverage percentage written to QA doc
- [ ] Phase 1 section in QA doc marked complete
