# Rule: DevOps Execution Profile Diff Guard

PROC-NEW-DEVOPS-EXECUTION-PROFILE-DIFF | pidex-devops

## Trigger

Run during DevOps Stage 1 before local commit, whenever plan has `Execution Profile` or `Skipped Agents`.

## Rule

DevOps is the final safety net for fast paths. Before committing/releasing, compare actual changed files/surfaces against approved Execution Profile and skipped-agent assumptions. If actual diff exceeds profile, do not commit as-is.

## Required checks

1. Read plan `Execution Profile` and `Skipped Agents`.
2. Determine and record the comparison baseline/range before checking files:
   - Prefer explicit plan start commit / implementation base commit recorded in plan or implementation doc.
   - Else use implementation commit list from implementation/code-review docs and inspect exactly those commits.
   - Else use the merge-base with target branch named in plan.
   - Else use `git merge-base HEAD @{upstream}` when upstream exists.
   - Else use an explicit recent commit range and mark confidence `LOW`.

## Baseline confidence gate

For profiles with skipped gates (`xs-docs`, docs-only/test-only fast paths, security/QA/designer skips), baseline confidence must be HIGH before invalidating or approving skips.

HIGH confidence sources:
- explicit plan start commit
- implementation base commit
- explicit implementation commit list
- target branch merge-base when target branch is named in plan and range is small/coherent

LOW confidence sources:
- upstream merge-base in a long-lived branch ahead of upstream by many commits
- broad/mixed range spanning unrelated files or multiple plan IDs
- guessed recent commit range
- missing base with clean working tree

If confidence is LOW and range is broad/mixed, do not decide from that range. Record `LOW-CONFIDENCE-DIFF-BASE`, ask orchestrator for plan start commit/implementation commit list, and block release until resolved.
3. Inspect both uncommitted and committed implementation changes:
   - `git status --short`
   - `git diff --name-only <base>...HEAD`
   - `git diff --name-only` for unstaged/staged work
4. Classify actual changes:
   - docs-only
   - test-only
   - product code
   - UI/frontend
   - API/user input/auth/storage/filesystem/dependency/secrets
   - build/runtime/structural
5. Compare actual class against approved profile/skips.
6. If mismatch invalidates skipped gates, block and route to missing gates.

## Mismatch routing

| Mismatch | Route |
|---|---|
| `xs-docs`/docs-only profile but product code changed | `pidex-code-reviewer` then `pidex-qa` |
| security skipped but API/user input/auth/storage/dependency/secrets changed | `pidex-security` |
| designer skipped but UI-heavy files/states changed | `pidex-designer` |
| QA skipped/downgraded but product behavior changed | `pidex-qa` |
| structural/runtime/build migration appears but no architect path | `pidex-architect` or `pidex-planner` |

## Required deployment doc section

```markdown
## Execution Profile Diff Guard

- Baseline/range: `<base>...HEAD` plus working tree
- Baseline source: plan-start / implementation-doc / implementation-commit-list / target-merge-base / upstream-merge-base / explicit-low-confidence
- Baseline confidence: HIGH / LOW (`LOW-CONFIDENCE-DIFF-BASE` if unresolved)
- Changed files reviewed:
  - `<path>`

| Approved profile | Actual diff class | Skips invalidated? | Action |
|---|---|---|---|
```

## Safe pass

If actual diff matches profile, record `PASS — actual diff matches approved Execution Profile`.

## Empirical basis

Fast paths may skip code-review. DevOps must catch accidental product-code/API/UI changes before local commit/release when skipped gates were approved for a narrower profile.
