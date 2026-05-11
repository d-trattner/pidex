# Atomic Transition + Artifact-Gate Acceptance Tests

PROC-NEW: 020-1

## Trigger
Plan defines route/agent transition where next step consumes artifact (`context_file`) from prior step.

## Rule
Planner must declare transition atomicity and artifact-gate acceptance tests.

Required in plan:
1. Atomic transition statement: next route executes only after artifact write success and path validation.
2. Acceptance tests include:
   - valid artifact path -> transition allowed.
   - missing artifact -> transition blocked.
   - malformed/foreign artifact path -> transition blocked.
3. Evidence row mapped in V-matrix or equivalent AC table.

## Failure mode prevented
Orchestrator advances on partial/invalid artifact state.
