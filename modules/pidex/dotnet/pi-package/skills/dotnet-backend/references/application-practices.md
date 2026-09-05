# Application practices

- Prefer explicit use-case handlers/services over controllers containing business workflows.
- Keep validation ownership clear: syntax/shape at transport boundary, business invariants in owning domain/application layer, database constraints as final integrity guard.
- Translate expected failures to typed outcomes; reserve exceptions for exceptional paths.
- Use `TimeProvider` and injectable external boundaries for deterministic tests.
- Use `IHttpClientFactory`; set explicit timeout/resilience policy according to idempotency. Never retry non-idempotent work blindly.
- Use hosted services with bounded channels, scoped dependency creation, cancellation, and observable shutdown.
- Health checks distinguish liveness from readiness; do not leak sensitive dependency details publicly.
- Prefer framework logging abstraction in application code. Configure concrete Serilog ownership at host boundary.
- Benchmark hot paths before optimization. Avoid unnecessary reflection, allocations, serialization copies, and broad in-memory materialization.
