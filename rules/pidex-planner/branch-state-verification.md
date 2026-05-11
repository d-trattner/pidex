# Rule: Branch State Verification for Follow-On Plans

PROC-NEW-35b | pidex-planner

## Rule

When a plan specifies "continue on branch `X`" where `X` is the development branch from the preceding plan (e.g., a feature branch that was the subject of the prior epic), run:

```bash
git branch --list X
git branch -r --list "origin/X"
```

**If the branch does NOT exist (locally or remotely):**

- The plan MUST NOT name the dead branch in the Branch row of the Plan Metadata table.
- Default to `master` (or `main`) and document the reason:
  ```
  Branch: master (tanstack-migration was merged at v0.9.0 and deleted)
  ```

**If the branch DOES exist:** confirm it is at the expected base commit (i.e., it was not force-reset or rebased since the preceding plan referenced it).

## Trigger condition

Apply this check whenever the plan doc would otherwise contain any of:
- "branch: `<name-from-prior-plan>`"
- "continue on `<prior-branch>`"
- "pick up from `<prior-branch>`"
- A branch name that includes a feature slug from a previous plan

## Why this matters

After a major merge + release cycle (e.g., a long-running feature branch merged and tagged), the feature branch is typically deleted. Follow-on cleanup or patch plans that inherit the previous plan's branch name send the implementer to a branch that no longer exists — or, worse, the implementer creates it fresh at the wrong base and commits there.

The critique can flag this (R-4 pattern), but the check costs one Bash call at planning time and eliminates the misfire entirely.

## Empirical basis

Plan 35 (post-migration-cleanup, 2026-04-25): Plan specified "continue on `tanstack-migration`" but that branch was merged and deleted at v0.9.0. pidex-critic flagged it as R-4. The implementer correctly worked on `master` — but only because the critique caught the stale branch name. One `git branch --list` at plan-write time prevents this class of finding.
