# Rule: Screenshot Artifact Path Guard

PROC-NEW-54-5 | pidex-implementer

## Rule

If pidex-implementer uses Playwright screenshots/snapshots for debugging or evidence, write artifacts only to the plan-bound artifact directory.

Default: `<project>/.playwright/`

## Required behavior

1. Never write screenshots to tracked code paths (`src/`, `apps/`, repo root).
2. Ensure `.playwright/` is ignored in `.gitignore` before finalizing.
3. If artifacts were created outside the allowed directory, move/delete them before final ROUTING.
4. Reference paths in impl doc; do not stage image binaries unless plan explicitly requires it.
