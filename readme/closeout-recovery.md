# Bounded closeout recovery (opt-in)

This is a local Linux, unsandboxed **host-direct primary Pi** increment, not operational or cross-platform acceptance. Existing ordinary v1/v2 dispatches remain unchanged. Historical logs cannot be promoted into new receipts.

A successful standard v2 producer closeout, like a v3 receipt completion, is authoritative for the outer tool's ROUTING/artifact check. The tool does not reparse that validated return using the ordinary line-only/file-existence check. Invalid identities, duplicate fields, missing artifacts and failed closeouts are not exempted. Ordinary calls without a successful closeout retain their existing check. This alignment does **not** add v3 capture/replay or deferred learning to v2, migrate old journals, or waive any handoff.

## Start and replay

For a retrospective, PI or required post-retro planner/roadmap/architect consumer, the parent may explicitly supply this additional `pidex_agent` argument:

```json
{
  "closeout": {
    "action": "start",
    "planId": "plan-001",
    "pipelineId": "exact-existing-pipeline-id",
    "artifactPath": "agents.output/retrospectives/plan-001-example-retro.md"
  }
}
```

Use the actual canonical opening identity and the exact assigned relative artifact path. Do not combine this request with review identities, secondary lanes, Primary holds, Project Pipeline arguments or sandbox execution. The child must echo its assigned dispatch/obligation IDs in both its artifact and final ROUTING. The structured plan takes precedence over historical plan references in task prose.

On an interrupted logical return, preserve that dispatch ID and use the same agent, plan, pipeline and artifact with `action: "resume"` plus `dispatchId`. The host recomputes the supported scope and uses only its captured receipt. **Resume does not invoke a model, capture a replacement return, rerun metrics or run provider fallback.** Repeated completed resumes return the same dispatch outcome and current pending obligations. Completing a dispatch is not a terminal pipeline ACK.

There is **one physical closeout execution per actor/pipeline in this v3 slice, zero automatic retries**. A new nonce, legacy entry point or publisher round cannot reset it. The proposed additional physical attempt is not implemented. Existing review attempt limits are unchanged.

## Role-consistent handoffs

The orchestrator checks role/output/read consistency before dispatch, together with `<pidex-root>/rules/pidex-pi/user-decision-routing-consistency.md` and its mode/decision/side-effect matrix. Ordinary producer-bound v2 and recoverable v3 both return settled PI analysis to orchestrator, not automatically to roadmap. A rejected adoption proposal uses DEFERRED with a rejected disposition, not a successful REJECTED producer verdict. Actual pending/unknown approval remains G7; headings alone are not pending decisions. Analysis-only PI writes only its assigned artifact, without implicit cleanup, adoption or Git operations. A captured G7/invalid v3 return cannot implement a later user answer through replay. This is an instruction contract, not a new runtime validator. For PI, use the role-owned directory and narrowly scoped input:

```json
{
  "agent": "pidex-pi",
  "cwd": "/absolute/project",
  "task": "Plan: 001. Write agents.output/process-improvement/plan-001-example-pi.md. Read only ## Findings and ## Process Improvement Recommendations from agents.output/retrospectives/plan-001-example-retro.md with targeted reads; no full-file Read. Inherited source metadata: ID=<actual ID>, Origin=<actual Origin>, UUID=<actual UUID>, post_retro_handoffs=<exact final ROUTING value>. Follow the assigned closeout IDs and echo context_file in final ROUTING. Configuration adoption is not authorized.",
  "closeout": {
    "action": "start",
    "planId": "plan-001",
    "pipelineId": "exact-existing-pipeline-id",
    "artifactPath": "agents.output/process-improvement/plan-001-example-pi.md"
  }
}
```

Replace all example identities, paths and metadata with actual source-bound values before calling. Copy metadata verbatim; never generate replacement IDs. Do not assign `agents.output/pi/`, ask PI to read the entire retrospective, or make PI rediscover other categories. The orchestrator inspects those categories and retains every producer-derived pending obligation, independently of the copied declaration.

Retrospective's canonical output directory is `agents.output/retrospectives/`. Use the producer-recognized ATX headings **Planning Insights**, **Roadmap Updates** (project improvement findings), and **Architecture Patterns**. Omit an inapplicable section or use only `None.` / `N/A.` / `Not applicable.` as its body. `None. No new follow-up identified.` is nonempty content and still requires a consumer. Never hide genuine findings by replacing them with an empty sentinel. Always declare `post_retro_handoffs: none` or the actual targets in both ROUTING blocks.

These instructions apply to fresh handoffs only. Do not edit a captured artifact, copy a differently located output into its place, waive pending obligations, reset a budget, or retry a `returned_invalid` dispatch. Historical receipts and parser/hold semantics are unchanged.

## Read-only diagnosis

```sh
node <pidex-root>/scripts/runtime/closeout-status.mjs \
  --project /absolute/project --plan plan-001 \
  --pipeline-id exact-existing-pipeline-id --dispatch-id original-uuid
```

The shared state-root resolver is used; `--state-dir /absolute/state` explicitly overrides it. Diagnosis does not create an authority, capture a return, delete locks or change the journal. It reports receipt/continuation status, pending obligations, zero automatic retry budget and a separate cleanup observation. `scopeCheck: not_evaluated` means the CLI did **not** validate the currently loaded host route/rules; mutating host resume performs that check. `quiescence_verified_at_capture` is historical evidence, not a fresh process scan.

## Durable boundary

`pidex-closeout-v3` binds the exact project/plan/pipeline/actor/dispatch, assigned artifact, consumed obligations and narrow runtime scope. The existing supervisor/subreaper receives a **closeout-specific binding** and uses `closeout-executions/`, not fabricated review gates or ordinals.

The real Pi runner captures a reduced return before metadata/metrics, ROUTING parsing or hooks. A pinned authenticated start, authenticated end and quiescence are required. Final text and artifact are bounded to 128 KiB each; expected artifact absence, invalid UTF-8 or excess size is recorded as unavailable, not replaced by a directory search. An oversized/unusable return is refused, not silently truncated into an accepted receipt. Environment, credentials, stderr and complete provider transcripts are not copied into the new receipt. Normal existing runner logs are unchanged.

The receipt and digest are stored **inline in the existing locked, fsynced append-only journal**, avoiding a separate orphan sidecar authority. This does not promise atomic multi-file/power-loss recovery: interrupted writes/locks remain fail-closed. An intact captured return can survive owner exit and artifact removal; a crash before accepted capture remains uncertain even if the supervisor proves process quiescence.

Both initial completion and replay validate the captured final text against the captured artifact. Existing section-derived handoffs, mandatory PI, exact consumed obligations and terminal barriers remain in force. No reread of a subsequently changed artifact can waive an obligation.

## Learning and holds

**Automatic rule learning is explicitly deferred in this opt-in path.** It is not silently rerun on replay. Durable hook-start/hook-finish markers record the `deferred` disposition and bind it to the receipt. Required PI and project-knowledge consumers are **not** deferred or waived by this policy. Legacy dispatches keep their existing automatic-learning path.

The core continuation adapter also refuses to repeat a hook with a started-but-unconfirmed marker. It does not claim exactly-once execution for arbitrary external effects. Returning a blocked/unknown disposition cannot produce a successful hook ACK.

Abort, invalid return, missing receipt, unconfirmed hook, conflicting authority, source/scope change or uncertain physical execution remains a hold/refusal. Source or validator changes require an explicit future compatibility policy; none is implemented. Narrow protocol pinning is not a substitute for a fully accepted WorkingBaseline.

Cleanup uses the existing exact-owned supervisor controls. Diagnosis/replay never kill an arbitrary PID, take over a lock, sweep project artifacts or manufacture missing receipts. A new-session resume is not a general remote process-cancellation API. No Windows, hardened, secondary-lane or Project Pipeline support is inferred.
