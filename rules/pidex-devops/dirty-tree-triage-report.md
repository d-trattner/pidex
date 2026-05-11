# Dirty Tree Triage Report

When the workspace is dirty before DevOps Stage 1 or Stage 2, DevOps MUST classify dirty files before commit/tag/push. Selective staging is allowed only with explicit triage evidence.

## Trigger

Run when `git status --short` is non-empty before Stage 1 commit or Stage 2 release.

## Required deployment section

```markdown
# Dirty Tree Triage

| Path/pattern | State | Likely owner/plan | Include in release? | Rationale |
|---|---|---|---|---|

- Release confidence: HIGH/MEDIUM/LOW
- Selective staging mode: YES/NO
- Status before release op: `<summary or artifact path>`
- Status after release op: `<summary or artifact path>`
```

## Classification guidance

Group dirty files as:

- release-owned code/docs/artifacts;
- unrelated prior-plan docs/artifacts;
- generated browser/test artifacts;
- wiki/log/open-items updates;
- unknown files requiring user clarification.

## Blocking rule

Do not tag/push when dirty files are present and no triage table exists. If unknown dirty files could affect release behavior, route to `user` for include/exclude decision or to missing review gates.

## Selective staging evidence

Record:

- exact commit/range or changed-file baseline used;
- excluded dirty file summary;
- `git status --short` before and after release operation;
- whether `reconcile_commits` is empty or contains commit hashes.
