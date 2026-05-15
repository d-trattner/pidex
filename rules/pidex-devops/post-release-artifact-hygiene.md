# Post-release Artifact Hygiene

## Trigger

When release staging used selective staging and `git status --short` remains dirty after tag/push/final artifact commit, DevOps must perform a post-release artifact hygiene reconciliation before declaring the run complete.

This is a narrow repository hygiene step, not a new feature epic.

## Required classification

Classify every remaining dirty path into exactly one bucket:

| Bucket | Meaning | Allowed action |
|---|---|---|
| `COMMIT_NOW` | Legitimate non-`agents.output` docs/bookkeeping from completed pipeline work | Stage and commit in a separate hygiene commit |
| `DELETE_NOW` | Temporary, malformed, stub, duplicate, or spillover artifact with no durable value | Remove before final status |
| `LEAVE_DIRTY` | Intentionally retained dirty state | Must name owner, reason, and next action |
| `ASK_USER` | Ambiguous or outside automatic cleanup scope | Stop and ask user |

## Automatic cleanup scope

DevOps may automatically reconcile only non-generated docs/bookkeeping:

- `wiki/**` docs
- `pidex/state/**` project metadata state when explicitly intended
- roadmap/docs artifacts outside `agents.output/**`
- identical moves into `closed/` directories outside `agents.output/**` after confirming content parity

`agents.output/**` is generated runtime/operator output and must never be committed.

## Forbidden automatic cleanup scope

If any remaining dirty path touches the following, classify as `ASK_USER` and stop:

- product source
- tests
- package/version files
- migrations
- runtime config
- scripts
- lockfiles
- dependency manifests

Do not hide these under artifact hygiene.

## Required evidence table

Record a table in the deployment/devops artifact:

```md
| Path | Git status | Classification | Action | Rationale |
|------|------------|----------------|--------|-----------|
| pidex/state/wiki-hygiene.json | M | COMMIT_NOW | stage | durable hygiene cadence state |
| agents.output/architecture/1-architect-findings.md | ?? | LEAVE_DIRTY | ignore | generated runtime artifact; never commit |
```

## Hygiene commit

If only `COMMIT_NOW` non-`agents.output` docs/state paths and `DELETE_NOW` temporary paths remain, DevOps may create a separate commit. Never stage `agents.output/**`:

```text
chore(artifacts): reconcile post-release spillover
```

Before committing, show:

```bash
git diff --cached --name-status
```

After committing, require:

```bash
git status --short
```

to be clean, or document every remaining dirty path with `LEAVE_DIRTY` owner/reason/next action.

## Anti-recursion rule

Do not start a full new pipeline solely for docs/artifact hygiene. If product/runtime files are involved, stop and ask the user whether to create a real follow-up epic.
