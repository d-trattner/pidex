# Project Pipeline problem reports — schema v1

Problem reports are diagnostic events, **not** execution receipts, review verdicts,
retry grants or resume requests. Importing `resolved` never resumes a pipeline,
clears a HOLD, repairs a run, changes budgets or authorizes another model call.

## Producer contract

Write one UTF-8 JSON object to
`agents.output/pipeline-problems/<event_id>.json` in the container workspace.
Use a fresh lowercase UUID for every event. Updates retain `incident_id` but get
new `event_id` values and new files; never edit an already transferred event.
Finish writing before transfer (temporary file + rename is recommended).

Use the actual `PIDEX_PROJECT_ID` and `PIDEX_PROJECT_RUN_ID` supplied to the child.
Do not guess a run ID. Assigned-output-only and reviewer write fences still apply:
this convention does **not** grant permission to write another artifact. Where
that contract forbids an extra report, let the host record the execution failure.
Do not use a problem report as the primary ROUTING/context artifact.

```json
{
  "schema_version": 1,
  "event_id": "11111111-1111-4111-8111-111111111111",
  "incident_id": "22222222-2222-4222-8222-222222222222",
  "occurred_at": "2026-09-14T12:00:00.000Z",
  "project_id": "pp-example",
  "run_id": "pprun-20260914120000-example",
  "phase": "run",
  "agent": "pidex-planner",
  "event_type": "opened",
  "category": "runtime",
  "status": "blocked",
  "summary": "Requested model was unavailable",
  "cause": "Runtime catalog did not contain the requested model; underlying cause unknown",
  "action": "No retry performed",
  "outcome": "Agent run did not complete",
  "next_step": "Ask the operator to inspect the selected runtime",
  "evidence": ["agents.output/planning/runtime-check.md"],
  "runtime": {
    "pi_version": null,
    "provider": null,
    "model": null,
    "pidex_commit": null
  }
}
```

Replace the example IDs/timestamp with real values. `occurred_at` is UTC with
millisecond precision. The host checks that the project matches its registry,
that the run exists in that project, and that `agent` matches the registered run.
It does not infer authorship or attest runtime claims from a file alone.

| Field | Contract |
| --- | --- |
| `schema_version` | Integer `1`; unsupported versions rejected |
| `event_id`, `incident_id` | Lowercase UUID strings; filename must match event ID |
| `event_type` | `opened`, `updated`, `resolved` |
| `status` | `open`, `investigating`, `blocked`, `resolved`; resolved type/status must agree |
| `phase` | `start`, `run`, `transfer`, `planning`, `implementation`, `review`, `qa`, `security`, `uat`, `closeout`, `maintenance` |
| `category` | `runtime`, `provider`, `authentication`, `artifact`, `transfer`, `configuration`, `execution`, `unknown` |
| `summary` | Single-line text, maximum 280 characters |
| `cause`, `action`, `outcome`, `next_step` | Single-line text, maximum 1000 characters each; use unknown when not established |
| `evidence` | At most 16 relative `agents.output/**` references ending in `.md` or `.json`; no traversal, URLs, absolute paths or log files |
| `runtime` | Optional object; absent values become null. Pi version is numeric `x.y.z`, PIDEX commit is a full lowercase 40-hex Git SHA; provider/model text max160 characters |

`action` describes what actually happened; proposals belong in `next_step`.
Runtime data must describe observed runtime values, not merely selected profile,
checkout HEAD or desired version. Unknown values stay null. Runtime data on
artifact events is producer-reported, not runtime acceptance or attestation.
Evidence references are not dereferenced and are not proof of existence.

## Host journal and transport

The existing Docker artifact copy supplies the files. The host appends sanitized
accepted events to:

```text
<registered host project>/pidex/state/pipeline-projects/journal.jsonl
```

The host alone adds `recorded_at`, `origin` (`artifact` or `host`) and `run_scope`
(`run` or `attempt`). Producer-supplied versions of these fields are ignored.
Unknown fields are discarded, not serialized as arbitrary metadata. Normal runs
are validated against the project registry. Host failures before a registered
child run get an `attempt-<UUID>` reference with `run_scope: attempt`; this must not
be counted as a physical Specialist start. A registered `run` reference also does
not prove a provider call: execution receipts/budgets remain authoritative. The
result exposes the attempt link.
Missing/conflicting/unsafe registered host roots give `unavailable`; there is no
fallback journal in the PIDEX installation or another project.

Normal archive sync imports these events before publishing the normal archive.
The reserved `pipeline-problems` subtree is **not copied verbatim** into the host
archive/mirror: only sanitized journal rows survive transport. Failed child runs
can collect only the report subtree via the same copy helper without publishing failed outputs
as successful context artifacts. Start, run and transfer failures also emit
host-generated events without needing an artifact. Host-generated causes use a
fixed error-code allowlist, otherwise `unknown`. Known child stderr signatures
can produce `model-unavailable`, `provider-authentication-failed`,
`provider-rate-limited` or `provider-context-limit` without retaining their text;
these classifications are not proof of the ultimate root cause. Raw exceptions/stdout/stderr,
commands, payloads and credentials never become journal fields.

Journal rows are append-only. An identical project/event pair is a no-op; changing
its payload is a conflict, not a replacement. An incident update is another row.
Host failure timestamps describe host observation, not an invented child end time.
Repeated host observation of the same run/phase/cause preserves the first timestamp;
artifact event timestamps remain immutable parts of their payload.
An exclusive owned journal lock serializes writers. Busy/unknown owners are not
stolen. Partial/corrupt tails and unsafe links are not repaired automatically.
Writes are fsynced; no cross-platform directory-durability guarantee is claimed.
Journal failures are exposed as bounded `problem_journal` dispositions in helper
results, never converted into fabricated successful writes or execution grants.
`rejected` counts reports not accepted (including conflicts or write failures).
This is separate from archive success and pipeline success.

Limits:100 directory entries per batch,32KiB per report,16MiB per journal. A limit
or lock failure requires inspection; there is no automatic cleanup, rotation or
pipeline retry. Source reports may be replayed by a later authorized transfer;
deduplication is based on journal contents, not a separately committed index.
Existing Git ignore/security policy is unchanged. Never force-add this journal.

## Privacy

Producers must never include credentials, raw logs, prompts, environment dumps or
absolute host paths. The receiver uses a strict field projection and redacts whole
suspicious text fields (credential labels, common token/key forms, URLs, absolute
paths, multiline/control characters, long opaque strings). Evidence paths are
validated independently. This is defense in depth, **not a guarantee that arbitrary
unlabelled secrets can be recognized**. Write diagnostic descriptions, not copied
logs. Temporary transport staging is removed on normal/failure return paths;
existing project data and historical receipts are not cleaned up.

## Model-free validation

`pnpm test:project-problems` covers replay, incident updates, conflicts, foreign
projects/runs/agents, redaction, reserved-subtree filtering, bounds, links,
corrupt tails, held locks, independent-process deduplication, actual run/transfer
integration and artifact-free start/run failures. No Docker or model/provider
execution is required by these tests. Real Windows/container acceptance remains
separate.
