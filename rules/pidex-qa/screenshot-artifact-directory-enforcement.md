# Rule: Screenshot Artifact Directory Enforcement

PROC-NEW-54-4 | pidex-qa

## Rule

When pidex-qa captures screenshots/snapshots/browser evidence, files MUST be written only to the project artifact directory:

- default: `<project>/.playwright/`
- if plan declares a different path, use that exact path

## Mandatory checks

1. Before writing evidence, verify the directory exists (create if needed).
2. Verify `.gitignore` contains the directory pattern.
3. Do not write image artifacts into `agents.output/`, `src/`, or repo root.
4. QA doc should reference artifact paths, not inline binary payloads.

## Failure handling

If the directory is not ignored and cannot be safely updated in-scope, report `BLOCKED` with exact `.gitignore` diff required.
