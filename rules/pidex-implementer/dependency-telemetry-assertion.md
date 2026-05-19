# Dependency-Telemetry Assertion for External/Runtime Scenario Tests (PROC-NEW-94-3)

When execution-scenario test touches external dependency or runtime branch, implementer must assert dependency telemetry path.

## Required assertion

At least one test assertion must prove telemetry/trace branch executed, via one of:
- mock/spyon call count + payload
- emitted event/log record
- branch marker persisted in test-visible state

## Scope trigger

Apply when scenario includes external service adapter, CLI spawn, network call, or runtime-fallback branch.

## Fail condition

Scenario test without dependency-telemetry assertion is incomplete. Do not request first review.
