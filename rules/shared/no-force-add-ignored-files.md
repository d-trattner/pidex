# Rule: No Force-Adding Ignored Files

PROC-GIT-IGNORE-1 | shared

## Rule

Do not commit files that match `.gitignore`/Git excludes.

Ignored paths are runtime/operator/local artifacts by default. `agents.output/**`, `state/**`, and `pidex/state/**` are always runtime state and must never be committed. If another ignored path must become durable source, first change the ignore policy narrowly, then stage it normally. Do not bypass ignore policy with `git add -f` or broad pathspecs that force ignored files into the index.

## Mandatory pre-commit check

Before any manual/agent commit that stages non-trivial changes, run:

```bash
git status --short --ignored
node scripts/git/ignored-tracked-guard.mjs
```

If any ignored file is staged/tracked, stop and classify:

| Case | Action |
|---|---|
| generated/runtime/operator artifact (for example `agents.output/**`, logs, caches, local state) | unstage/remove from index: `git rm --cached -- <path>` or `git restore --staged -- <path>` |
| durable source/docs/tests accidentally matched by broad ignore pattern | fix `.gitignore` first, then stage normally without `-f` |
| intentional ignored operational state requested by user | refuse staging; preserve durable conclusions under `wiki/**` or another source-controlled documentation path instead |

## Hard prohibitions

- Never commit `agents.output/**`, `state/**`, or `pidex/state/**` (apart from a package-owned placeholder such as an already tracked `.gitkeep`).
- Never use `git add -f` or `git add --force`; PIDEX blocks forced staging across platforms.
- Never commit ignored files as part of a convenience/bulk `git add`.
- Never hide a public-readiness/private-data finding by committing ignored artifacts.
- Commit only in the active user project's Git worktree. While working on another project, never create a commit in the PIDEX runtime checkout.

## Evidence in handoff

Implementation/devops handoffs that include commits must state either:

```text
Ignored-file guard: PASS (`node scripts/git/ignored-tracked-guard.mjs`)
```

or, if blocked:

```text
Ignored-file guard: BLOCKED — <paths and action needed>
```

## Empirical basis

Browser-smoke QA artifacts under `agents.output/**` were force-added after `agents.output/` was already in `.gitignore`, causing public-readiness failures from private LAN evidence. The correct fix was `git rm --cached -r agents.output` plus a guard to prevent recurrence.
