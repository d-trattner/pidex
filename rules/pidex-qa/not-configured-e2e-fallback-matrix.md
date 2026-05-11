# NOT_CONFIGURED e2e Fallback Matrix + Artifact Existence Gate

PROC-NEW: 019-3

## Trigger
QA cannot execute required e2e/browser flow because environment/tooling intentionally not configured in current project slice.

## Requirement
`NOT_CONFIGURED` allowed only when QA records fallback matrix row set:
- required e2e check
- why not configured (concrete)
- fallback check executed
- fallback result token
- missing artifact name/path

QA must also run artifact existence gate:
- verify required artifact paths exist for executed fallback checks
- if artifact missing, do not mark COMPLETE

## Outcome Rules
- Use `NOT_CONFIGURED` for bounded infra absence with fallback evidence.
- Use `BLOCKED` when neither e2e nor valid fallback evidence possible.
- `COMPLETE` allowed only if matrix present + artifact existence checks pass.
