# Claude subscription opportunistic secondary lanes

## Summary

If Pi/PIDEX can legally and reliably use Claude subscriptions again through third-party agent usage, add Claude as an opportunistic secondary lane in PIDEX pipelines. Claude should provide second-opinion value while Codex remains the primary guaranteed execution path.

## Motivation

Anthropic appears to be revisiting third-party agent usage on Claude subscriptions. The referenced online coverage / Claude developer post says the change is expected to launch on **June 15, 2026**. If Pi supports this again after that date, unused Claude subscription credits can improve PIDEX quality without making pipelines depend on Claude quota availability.

## Recommended posture

Claude should be optional, best-effort, and non-blocking.

```text
Primary lane: Codex / Codex Spark
Secondary lane: Claude subscription, when credits/quota are available
```

Claude output should improve confidence, not become required for release-critical progress unless quota health is explicitly known.

## Good Claude roles

Best fit for Claude as a secondary lane:

- `pidex-critic` second opinion
- `pidex-code-reviewer` additional review
- `pidex-uat` product/readability perspective
- `pidex-architect` architecture sanity check
- `pidex-retrospective` synthesis / lessons learned
- `pidex-planner` alternative plan critique, not primary plan owner

Avoid Claude for:

- required implementation path
- release-critical gates by default
- long autonomous nightly cron jobs
- any required step where quota exhaustion would block progress

## Proposed config shape

Example profile/config concept:

```json
{
  "parallel_secondary": {
    "enabled": true,
    "provider": "claude",
    "mode": "opportunistic",
    "skip_on_quota_error": true,
    "roles": ["critic", "code-reviewer", "uat", "architect", "retrospective"]
  }
}
```

Important: `parallel_secondary` should remain orchestrator-owned. Specialist agents should not spawn nested parallel lanes themselves.

## Runtime behavior

1. Orchestrator checks whether Claude subscription/provider is available.
2. If available, spawn selected Claude secondary lane(s) with explicit provider/model overrides.
3. If Claude quota/auth fails, record a neutral skip event and continue primary pipeline.
4. Merge Claude output as advisory context.
5. Do not fail the pipeline because Claude was unavailable.

## Dashboard / telemetry ideas

Show Claude secondary lane state in dashboard:

- enabled/disabled
- provider available/unavailable
- quota/auth error if detected
- skipped reason
- secondary verdict summary
- disagreement with primary lane
- whether secondary output affected final plan/review

Possible labels:

- `Claude secondary: used`
- `Claude secondary: skipped — quota unavailable`
- `Claude secondary: skipped — disabled`
- `Claude secondary: advisory only`

## Safety / policy guardrails

- Do not re-enable nightly autonomous Claude crons by default.
- Keep Claude subscription use tied to explicit pipeline/user work.
- Disable or skip on auth/quota/provider-policy errors.
- Prefer short bounded prompts for secondary review roles.
- Keep release gating Codex-native unless user explicitly opts into Claude as a required gate.

## Timing / reminder

Revisit after **June 15, 2026**, when the reported third-party/subscription-agent policy change is expected to launch. At that point, verify actual Pi support, Anthropic terms, quota behavior, and authentication flow before implementing.

## Future epic acceptance criteria

- PIDEX profile supports opportunistic Claude secondary lanes.
- Orchestrator can spawn Claude secondary roles explicitly.
- Quota/auth failure is non-blocking and visible.
- Dashboard exposes secondary lane usage/skips.
- Release gates remain deterministic when Claude is unavailable.
- Documentation explains policy-sensitive nature and how to disable.
