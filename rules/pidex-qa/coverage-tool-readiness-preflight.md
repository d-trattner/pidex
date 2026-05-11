# Coverage Tool Readiness Preflight

PROC-NEW: 020-3

## Trigger
QA run requires coverage output for decision or release gate.

## Rule
Before executing coverage-dependent checks, run readiness preflight for coverage tooling/config.

## Preflight checks
1. Coverage command exists.
2. Required config files present.
3. Reporter/output path writable.

## Canonical status tokens
Use only: `PASS` `FAIL` `SKIPPED` `NOT_CONFIGURED` `BLOCKED`.

## Outcome contract
- `PASS`: proceed with coverage checks.
- `NOT_CONFIGURED`: record missing setup; skip coverage assertions; no false pass.
- `FAIL`: tool/config broken; stop and escalate.
- `BLOCKED`: external dependency prevents run.
- `SKIPPED`: only when plan explicitly marks coverage optional.

## NOT_CONFIGURED follow-up contract
When status is `NOT_CONFIGURED`, QA must record:

1. Missing dependency/config/reporter/output path by exact name.
2. Owner and follow-up location (`open-items.md`, roadmap item, ticket, or explicit `release-stage dependency task`).
3. Blocking decision: `blocks release` or `accepted without coverage for this scope`, with reason.
4. Alternative validation used instead of coverage, if release continues.

QA MUST NOT emit `QA Complete` for coverage-dependent work with bare `NOT_CONFIGURED` and no follow-up/decision record.

## Failure mode prevented
Late QA ambiguity from missing coverage tooling discovered after execution.
