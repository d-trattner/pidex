# Lifecycle-vs-Legacy Assertion Vocabulary Scan (PROC-NEW-93-3)

Trigger: review includes lifecycle route tests, contract assertions, or parser status mapping.

## Required scan

1. Check assertions for mixed vocabulary in same expectation (example: lifecycle `ok/conflict` plus legacy HTTP fallback semantics).
2. Check success and conflict cases separated into distinct assertions/tests.
3. Check route/version strings match declared lane (`lifecycle` vs `legacy`) across test names, fixtures, and assertions.

## Reject condition

If mixed vocabulary or lane drift can mask behavior contract, raise Major finding and REJECT until fixed.

## Evidence

Record grep/read proof in review doc under Findings or Positive Observations.
