# Rule: Execution Profile Diff Guard

PROC-NEW-EXECUTION-PROFILE-DIFF | pidex-code-reviewer

## Trigger

Load for every code review when plan includes `Execution Profile` or `Skipped Agents`.

## Rule

Code review must compare actual changed files/surfaces against the approved Execution Profile and skipped-agent assumptions. If implementation exceeds the profile, previously approved skips may be invalid.

## Required checks

1. Read plan `Execution Profile` and `Skipped Agents`.
2. Read implementation doc file list and/or inspect git diff for changed paths.
3. Classify actual changes:
   - docs-only
   - test-only
   - product code
   - UI/frontend
   - API/user input/auth/storage/filesystem/dependency/secrets
   - build/runtime/structural
4. Compare actual class against profile and skipped agents.
5. If actual diff exceeds profile, add finding and route to missing gate(s).

## Mismatch examples

| Approved profile/skip | Actual diff | Required action |
|---|---|---|
| `xs-docs`, QA skipped | product code changed | REJECT or BLOCK; route to QA/code-review full path |
| designer skipped | UI-heavy files/states added | REJECT; route to pidex-designer or pidex-implementer to narrow scope |
| security skipped | API/user input/auth/storage/dependency changed | route to pidex-security |
| standard-feature | runtime/build/architecture changed | route to pidex-architect or pidex-planner |
| retro mini/none | G9/security/process trigger marker present | ensure devops runs full retro |

## Required doc section

Add to code review doc:

```markdown
## Execution Profile Diff Guard

| Approved profile | Actual diff class | Skips affected | Verdict |
|---|---|---|---|
```

## Routing impact

- Profile mismatch that invalidates skipped gate → `REJECTED` or `BLOCKED`; route to missing/appropriate agent.
- Minor docs/test expansion inside same risk class → note only.

## Empirical basis

Fast paths are safe only if actual implementation stays within approved risk profile. Post-plan scope creep must restore missing gates before QA/UAT/release.
