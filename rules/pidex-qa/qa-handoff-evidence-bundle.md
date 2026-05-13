# QA Handoff Evidence Bundle

PROC-NEW-88-3 | pidex-qa

## Trigger
Any QA handoff in which implementation required rerun, retry, or multi-step validation across command output, artifacts, or runtime checks.

## Rule
QA handoff MUST include one consolidated `Evidence Bundle` section with:

1. `test outputs` — command list + transcript IDs or raw captured output locations.
2. `evidence sha256` — hashes for relevant output files (`.json`, logs, snapshots, bundles).
3. `version checks` — explicit version coherence evidence before QA COMPLETE.
4. `failing artifact list` — concrete list of still-failing tests/files and reason.
5. `retry boundary` — exact conditions under which rerun is allowed and what remains unchanged.

`NOT_CONFIGURED` is allowed only when hash or artifact path is unavailable, with explicit reason.

## Example

**Before**

```md
## QA Notes
- Rerun needed after latest slice.
- see previous logs above.
```

**After**

```md
## QA Handoff Evidence Bundle
- Command transcript IDs:
  - `qa-smoke-01`: `npm run test -- network`
  - `qa-smoke-02`: `npm run qa:runtime`
- test outputs:
  - `/tmp/qa-smoke-01.log`
  - `/tmp/qa-smoke-02.log`
- evidence sha256:
  - `routes-summary.json` → `d41d8cd98f00b204e980...`
  - `validation-run.log` → `9fce...`
- version checks:
  - target: `v0.10.26`
  - source plan: `88-p0-workflow-contract-reconciliation-plan.md`
- failing artifact list:
  - `/tests/network/contract.spec.ts` (malformed payload assertion)
- retry boundary:
  - Retry only if `target version` or artifact hashes change; keep endpoint list and validation criteria unchanged.
```

## Acceptance checks

- Bundle exists in QA artifact before route COMPLETE.
- At least one deterministic command/output reference per test output.
- Each listed file has a hash entry, or explicit `NOT_CONFIGURED` reason.
- Version evidence ties to plan target/version.
- Retry boundary is explicit and testable.

## Fail criteria
- Evidence bundle absent.
- Missing command evidence IDs or file paths.
- Missing version check.
- Missing failing-artifact list on reruns.
- Retry boundary omitted or vague (“rerun if needed”).
