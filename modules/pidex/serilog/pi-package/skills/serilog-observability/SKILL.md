---
name: serilog-observability
description: Configure, implement, review, and test structured Serilog observability for ASP.NET Core and .NET services. Use for bootstrap logging, message templates, request correlation, enrichment, levels, redaction, sinks, failure handling, and shutdown. Keep domain/application code dependent on logging abstractions rather than Serilog sinks.
license: MIT
metadata:
  serilog-aspnetcore-snapshot: '10.0.0'
  pidex-module: pidex.serilog
---

# Serilog Observability

Inspect target framework, hosting model, current `ILogger` use, configuration ownership, sinks, retention, deployment environment, privacy policy, and operational queries before changing logging.

## Ownership

Configure Serilog in host/composition root. Application code normally uses `Microsoft.Extensions.Logging.ILogger<T>`; domain logic should not depend on logging infrastructure. Keep one logger lifecycle and avoid duplicate providers/events.

## Structured events

- Use stable message templates and named properties: `"Processed {OrderCount} orders for {TenantId}"`, not interpolated strings.
- Events describe outcomes; property names form queryable schema. Keep names/types stable.
- Add correlation/trace/request identifiers through context/enrichers at boundaries, not repeated parameters everywhere.
- Select levels by operational meaning. Expected validation failure is not an error; unavailable dependency may be warning/error according to handling and SLO.
- Record exception object with context once at owning boundary. Avoid catch-log-rethrow duplication.
- Bound collections, bodies, headers, and destructuring. Never log passwords, tokens, connection strings, keys, raw authorization headers, personal data, or unrestricted request/response payloads.

## ASP.NET Core

Use request logging once with correlation and useful completion properties. Place middleware so timing/status ownership is correct and health/static noise can be controlled. Trust proxy headers only from configured proxies. Enrich identity/tenant only after validated authentication and privacy review.

## Sinks and lifecycle

Choose sinks by operations need, delivery semantics, backpressure, failure behavior, retention, and cost. Do not make request success depend on an unavailable remote sink unless explicitly required. Bound async queues and define loss behavior. Environment configuration selects endpoints/credentials; source contains none.

Initialize bootstrap logging only when early startup diagnostics are needed, replace it with final host configuration, and flush/dispose during controlled shutdown. Never claim delivery after abrupt process termination.

Test event level, template/property presence, correlation and redaction using controlled in-memory capture; avoid assertions on rendered prose alone. Review [operations](references/operations.md) and [sources](references/sources.md). Guidance only: no sink activation or secret access.
