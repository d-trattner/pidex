# Validation Taxonomy Standard (PROC-NEW-3)

Use consistent validation result terms across PI, deployment, and retrospective artifacts.

## Canonical statuses

- `PASS` — check executed, expectation met.
- `FAIL` — check executed, expectation unmet.
- `SKIPPED` — intentionally not run; reason documented.
- `NOT_CONFIGURED` — required system/tool unavailable by design/environment.
- `BLOCKED` — could not execute due to external blocker needing action/decision.

## Usage rules

1. Use only canonical status tokens above in validation tables/checklists.
2. Add one-line evidence or reason next to each token.
3. Do not replace canonical tokens with synonyms (`OK`, `DONE`, `N/A`, `PENDING`) in validation sections.
