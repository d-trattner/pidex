# Pre-Hold Sync Gate

PROC-NEW-89-3 | pidex-devops

## Trigger
Before any route handoff or Stage-1/Stage-2 release action while target release status is `HOLD`, or when user asks for local sync while known deferred artifacts remain.

## Rule
DevOps MUST block release/closure handoff when the worktree is dirty with unknown or unrelated artifacts. In hold mode, route cannot proceed until the following manifest is present in deployment or stage doc:

### Required Handoff Manifest

| Field | Required value |
|---|---|
| `owner_map` | per-path owner (plan, prior-plan docs, infra, generated artifacts, unrelated) |
| `include_list` | files tied to target plan/scope |
| `exclude_list` | unrelated artifacts kept for manual follow-up |
| `reconcile_plan` | `git add`/`git restore` steps to reach expected state |
| `decision_note` | explicit decision on excluded artifacts and why they are not part of target handoff |

## Blocking Conditions

- Unknown dirty file exists and owner unresolved.
- Unrelated artifact would be committed in release scope.
- Owner map/decision missing.

## Minimum evidence

- `git status --short` before action.
- `owner_map` rows for each dirty path.
- Explicit signature: `Pre-hold sync gate: PASS/FAIL`.

If `PASS`, route continues with normal handoff; if `FAIL`, route to `user` for triage decision before any sync/push/release operation.

## Acceptance checks

- Manifest exists and is complete.
- Dirty/unrelated files are explicitly excluded or justified.
- No undocumented unrelated path is auto-included in handoff commit/sync.

## Fail criteria

- Missing manifest.
- `PASS/FAIL` gate result omitted.
- Route attempted with unresolved unrelated artifacts.