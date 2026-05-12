---
ID: 4
Origin: 4
UUID: 70d50d80
Status: Complete
---

# Provider Limits Native Post-retro Architecture Patterns

## Inputs
- Brief: `agents.output/briefs/4-provider-limits-native-postretro-architect-brief.md`
- Retro: `agents.output/retrospective/4-provider-limits-native-retrospective.md`
- Security: `agents.output/security/4-provider-limits-native-security-v5.md`

## Pattern 1: Secure-by-default Provider Limits API

Decision:
- Dashboard scripts bind loopback by default.
- Public bind must be explicit.
- Public bind requires bearer token for provider-limits endpoints.
- Non-loopback access requires token even when Host header claims loopback.
- Cross-origin writes denied.

Reason:
- `request.url` / Host header trust proved unsafe.
- Bind mode + origin + token matrix catches bypass paths.

Architecture requirement:
- Route protection tests cover: loopback, non-loopback, public-bind, spoofed Host, token present/missing, cross-origin write.
- Auth runs before provider-limit read/write work on all hyphen/underscore route aliases.

## Pattern 2: Canonical Provider-limit State Flow

Flow:
```text
state/provider-limits/native-records.json (source/fallback)
  -> probe/collection
  -> state/provider-limits/latest.json (canonical payload)
  -> API records
  -> /limits UI
```

Decision:
- `latest.json` is canonical API/UI contract.
- `native-records.json` seeds/falls back when live records absent.
- API returns canonical `records` directly.
- UI consumes records without recomputing source truth.

Reason:
- Single canonical payload reduces drift between probe, API, and UI.
- Local PIDEX state remains available when provider probe cannot produce fresh data.

Architecture requirement:
- Fixture-backed assertions must prove `codex` and `codex-spark` pass from native source through API/UI.
- Record freshness/source metadata should stay observable enough to explain fallback vs probe path.

## Pattern 3: Active Profile Only, No Recommendation Behavior

Decision:
- Provider-limits surface current active profile state only.
- Do not compute or display recommendations in this pipeline.

Reason:
- Recommendations create product semantics outside provider-limit collection scope.
- Active-profile-only UI keeps contract factual and testable.

Architecture requirement:
- API schema and UI copy avoid recommendation fields.
- Future recommendation feature needs separate contract, ownership, and validation plan.

## Observability Requirements

Minimum telemetry for this pipeline:
- Correlation ID for probe/API request when available.
- State transitions: source read, probe start/success/fail, canonical write, API read.
- Dependency signals: provider command/name, duration, attempts, result category.
- Error taxonomy: source-missing, probe-failed, malformed-record, auth-denied, cross-origin-denied.
- No secrets in logs; token values never logged.

## Open Architecture Debt

| Area | Debt | Priority | Action |
|---|---|---:|---|
| Auth matrix | Security tests arrived after bypass existed | High | Make bind/origin/token matrix pre-patch acceptance for exposed routes |
| Temp QA deps | Playwright temp script unlisted in dashboard manifest | Medium | Move QA smoke tooling to isolated tooling manifest or documented dev profile |
| Operator public bind | Manual public Vite bind without explicit env remains unsupported footgun | Medium | Document supported public dashboard mode if product needs it |
| Source freshness | Fallback/probe provenance can become ambiguous | Medium | Preserve source + timestamp metadata in canonical payload |

## Wiki Update

Deferred. No architecture wiki/decision index exists under `agents.wiki.dashboard`; only retro/open-items structure present. No ADR requested. If future PI wants durable ADR, candidate: provider-limits API secure-by-default public-bind token requirement.

<!-- ROUTING -->
verdict: COMPLETE
route_to: orchestrator
context_file: agents.output/architecture/4-provider-limits-native-postretro-architecture.md
gate: none
reason: Provider-limits native security/state/profile architecture patterns captured from retro and security review.
<!-- /ROUTING -->
