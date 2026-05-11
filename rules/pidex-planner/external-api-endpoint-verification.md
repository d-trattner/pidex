# Rule: External API Endpoint Verification Sub-Task

PROC-NEW-50-4 | pidex-planner

## Rule

When a plan's implementation calls a real external API (not a mock), the plan MUST include
an explicit "Endpoint Verification" sub-task in the earliest implementation slice (S0 or S1):

  Sub-task EV-X — Verify [ServiceName] [action] endpoint:
    Run: curl -X [METHOD] [URL] [auth headers if needed]
    Confirm: HTTP [expected status], response shape matches plan assumption
    If mismatch: update plan and all dependent slices BEFORE proceeding

This sub-task must gate the slices that use the verified endpoint.

## Risk-item demotion

If a risk item in the plan says "[endpoint] may differ — implementer must verify", it must
be converted to a concrete EV-X sub-task. Risk items that defer endpoint verification to
implementation time are disallowed for real (non-mocked) external services.

## Trigger condition

Apply when the plan contains ALL of:
1. A new adapter to a real external service (Pi-hole, nginx-pm, UniFi, HA, etc.)
2. The plan specifies an endpoint URL or HTTP method that has NOT been confirmed via
   a live curl test in the current session or the Analysis phase

Does NOT apply to:
- Mocked services (no real HTTP traffic)
- Endpoints already confirmed in a prior plan's analysis/implementation
- Public APIs with stable, versioned, well-tested SDKs

## Why this matters

Plan 50 (execute-plan, 2026-04-29): Pi-hole custom DNS endpoint was wrong in the plan
(/api/dns/custom POST assumed; PUT /api/config/dns/hosts/<encoded> actual). Risk R-2
deferred verification to the implementer. The error cost a full implementation-review-test
round-trip. A 60-second curl test during planning eliminates this class of rework.
