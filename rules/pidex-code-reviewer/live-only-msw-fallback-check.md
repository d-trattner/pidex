# Rule: Live-Only MSW Fallback Check

PROC-NEW-61-2 | pidex-code-reviewer

## Trigger
Apply only when plan/implementation claims live-only endpoint behavior.

## Rule
Reviewer MUST verify no global MSW fallback handler covers target endpoint.

## Required evidence
1. Handler registry evidence: target endpoint absent from global handlers.
2. Test-local scope evidence (if mock needed): handler defined only in test file/server.use scope.
3. Review note states fallback masking risk checked.

## Gate
If evidence missing, raise blocking finding.

## Why
Prevents false-green tests where global handlers mask live-only regressions.
