# Rule: Global Hook Mutation Full-Suite Smoke

PROC-NEW-2 | pidex-qa

## Goal

Catch parallel-suite race risk immediately after global lifecycle hook edits.

## Trigger

Any mutation to global test lifecycle hooks or shared harness hooks (`beforeAll`, `beforeEach`, `afterEach`, `afterAll`, equivalent helper wrappers).

## Requirement

After hook mutation lands, run full-suite smoke gate immediately (project root validation command set). Targeted-file pass alone is insufficient.

## Decision

- No race signal: continue normal QA flow.
- Race/flaky signal: mark gate blocked, require remediation + rerun before QA COMPLETE.

## Evidence

Record command, result token (PASS/FAIL/BLOCKED), and short failure signal when present.