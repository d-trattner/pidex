# Astra optimization — unreleased development status

Status as of 2026-09-13: **implemented and integrated into `master`, not published as a release**. The stabilization/profile validation snapshot is `96065c6`. Package version remains `0.5.0`; this work adds no version bump, release tag or npm publication. Git pushes distribute this development source to other checkouts; they are not package releases. See [Unreleased changes](../CHANGELOG.md#unreleased).

## What changed

- **Working baseline and execution identity:** explicit source/configuration/evidence identities and controlled baseline acceptance/rollback, without inferring operational adoption from a Git checkout.
- **Review continuity:** canonical project/plan authority and authenticated owner-loss recovery for the supported Linux host-direct Primary-Pi path. Abort, uncertain ownership and conflicting scope remain holds; this is not general retry permission.
- **Closeout:** opt-in v3 captures real returns before postprocessing, supports receipt-only replay, retains mandatory Retro/PI and actual downstream obligations, and requires the normal terminal acknowledgment. One physical closeout call per actor/pipeline, zero automatic retries; automatic rule learning is deferred in this path.
- **PI instructions:** consistent bound/unbound routing, evidence-backed decision states, targeted retrospective reads and artifact-only analysis. Genuine missing approval remains G7. No implicit cleanup, rule adoption, Runtime-State commits or additional calls after a held capture.
- **Status:** shared decision-oriented Pi/CLI/dashboard reporting distinguishes actual progress, holds and incomplete evidence instead of inferring success from stale state or agent settlement.
- **Profiles:** `astra-balanced` is the development default; `astra-quality` is an explicit option. Active-profile reporting matches the actual configuration rather than a cached label. Original GPT-5.6 presets remain available for rollback.

See [Working baseline](working-baseline.md), [review budgets](review-budgets.md), [closeout recovery](closeout-recovery.md), [decision status](decision-status.md) and [profile assignments](provider-limits-and-profiles.md#astra-profiles).

## Profiles and model scope

Astra is **`openai-codex/gpt-6-astra`**, not a GPT-5.6 alias. Profile changes select Specialist routes; they do not switch the main Pi session model or enable secondary lanes. Efforts, timeouts, principals and existing retry limits remain unchanged.

| Profile | Development status |
| --- | --- |
| `astra-balanced` | Selected default; bounded real Medium acceptance completed in the scope below |
| `astra-quality` | Manual opt-in; no independent live acceptance |
| `5.6-hybrid-balanced` | Retained previous default and explicit rollback |
| `5.6-hybrid-lowcost` | Retained explicit token-efficient option |
| `5.6-sol-quality` | Retained selective comparison profile, not the general default |

These choices are not evidence of universal Astra superiority or a new cross-profile performance benchmark.

## Sandbox runtime follow-up

Separate from the validation snapshot below, the Project Pipeline Docker build now pins Pi to **0.85.1** and asserts the installed version instead of using floating `latest`. An existing Windows sandbox was reported to run Pi 0.80.3 with no available Astra match and two failed child-Pi runs. This pin addresses runtime drift; it does not prove that authentication/model availability or the original failure is resolved.

Existing images and containers are not automatically upgraded. The separately confirmed `/pdproject upgrade-pi <project-id> --confirm <project-id>` action can now update only Pi in an idle existing container through native Node/Docker, without WSL or container replacement. It stages the pinned package, verifies versions, excludes concurrent managed work and preserves uncertainty as HOLD. The main agent can request the same operation through the separate `pidex_project_maintenance` tool, but only a real interactive user confirmation authorizes its execution; headless/child use and model-supplied approval flags are refused. See [Pi-only maintenance and the separate image rebuild procedure](project-pipeline.md#updating-the-sandbox-pi-runtime). These follow-ups have model-free regression coverage only, not a real Docker-build, Windows upgrade or Windows pipeline acceptance claim.

## Validation and qualification

Evidence for the code snapshot above, before this documentation-only status update:

- Full local check: **1,177 tests passed, one platform-specific skip, zero failures**. Ten additional profile tests passed.
- Actual **Linux, unsandboxed host-direct, Primary Pi, Astra-balanced** Medium pipeline completed planning, authenticated same-identity Critic recovery, implementation, all four review gates, UAT, local fixture DevOps, full Retro and PI.
- Independent functionality checks passed, including seven exact-byte CLI cases. All actual closeout obligations were fulfilled and the normal `pipeline_completed` acknowledgment was confirmed.
- Run duration to terminal: **31 minutes 33 seconds**, **11 additional Specialist starts** within the original 60-minute/15-start envelope. This is a start/time bound, not a token or currency cap.
- **Qualification: `PASS_WITH_ORCHESTRATOR_CLARIFICATION`.** After the injected interruption, one outer session echoed the resume request instead of invoking the tool. One clarification continued the same pipeline, identity, grant and deadline after fresh owner-loss/no-hold checks. No new test, reset, receipt repair or additional Specialist retry was used. Outer-session usage is separate from Specialist counts; fully unassisted execution is not claimed.
- The run's rule context remained **`non_attested`**. No operational WorkingBaseline adoption is inferred.

Earlier failed attempts remain failed evidence; this successful run does not rewrite their holds. This does **not** independently accept Astra-quality, all configured roles in every scenario, Windows, hardened mode, Project Pipeline, secondary lanes, or the separate automatic learning/adoption workflow. Private run logs and fixture details are intentionally not part of public documentation.

## Local development versus installation

A Git merge, runtime reload, operational baseline acceptance and release are separate actions.

If Pi is already configured to load PIDEX directly from a local checkout, updating that checkout does not require republishing or reinstalling the package. Start a fresh Pi session and verify the loaded PIDEX root/stand before the next development task; an existing session may retain older modules. A separately installed package is not updated merely by merging a different source checkout.

No new release or installation is implied by this status. Further paid tests and any deployment/publication require their own authorization.
