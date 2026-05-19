# Touched-Suite Contract Gate

PROC-NEW-004-1 | pidex-implementer

## Trigger

Apply before first code-review handoff when a slice changes any execution/runtime contract fixture or runtime contract surface, including:

- artifact path existence/validation behavior
- provider/stage attempt linkage
- ROUTING parser or route-transition contracts
- scheduler/orchestrator lifecycle state contracts
- test fixtures that stand in for provider/runtime artifacts

## Rule

Targeted tests are not enough when the changed behavior affects fixture/runtime contract realism. Before routing to code review, run the full touched test file or touched suite that owns the changed contract, not only a focused `-t` subset.

If the touched suite is too expensive or flaky, document:

1. exact command skipped,
2. why it was skipped,
3. narrower command that was run,
4. residual risk and defer owner.

## Required implementation evidence

In the implementation artifact, include a `Touched-Suite Contract Gate` section with:

- changed contract surface,
- full touched-suite command,
- result summary,
- failure reason and fix if it failed,
- explicit statement that returned artifact paths / runtime fixture paths resolve on disk when artifact validation is in scope.

## Rationale

A focused provider-execution test passed while the full touched suite failed because one fixture returned an artifact path that did not exist on disk. The canonical artifact existence guard was correct; the fixture realism gap escaped because only a targeted test was run before first code review.
