# Rule: Screenshot Artifact Directory Contract

PROC-NEW-54-3 | pidex-planner

## Rule

If a plan includes any screenshot/snapshot/browser-capture evidence, the plan MUST define one project-local artifact directory and require git-ignore coverage.

Default directory: `<project>/.playwright/`

## Mandatory plan bindings

1. Add a "Screenshot Artifact Directory" line in plan assumptions/constraints.
2. Add a V/AC row that verifies screenshot files are written only under that directory.
3. Add a `.gitignore` check sub-task:
   - If `.playwright/` missing, add it.
   - Never stage screenshot binaries outside the bound directory.

## Why

Prevents screenshot clutter in tracked source trees and keeps QA/browser evidence reproducible without polluting commits.
