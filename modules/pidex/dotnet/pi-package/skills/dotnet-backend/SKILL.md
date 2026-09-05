---
name: dotnet-backend
description: Design, implement, modernize, review, and test .NET 10 and ASP.NET Core backends, including multi-project solutions, APIs, dependency injection, configuration, security, async code, and architecture boundaries. Use for general .NET backend work; load Dapper, Serilog, or SQL Server skills only when those technologies are involved.
license: MIT
metadata:
  target-dotnet: '10'
  pidex-module: pidex.dotnet
---

# .NET Backend

Inspect `global.json`, target frameworks, solution/project files, package versions, analyzers, nullable settings, tests, deployment model, and existing conventions before changing architecture.

## Solution boundaries

Choose projects by dependency direction, independent change pressure, and deployability—not one project per folder.

Typical larger solution:

- `*.Api`: HTTP host and composition root; endpoint/auth/middleware wiring only.
- `*.Application`: use cases, ports, validation, authorization decisions, transaction orchestration.
- `*.Domain`: business invariants and domain types; no ASP.NET, SQL, logging sink, or infrastructure dependencies.
- `*.Contracts`: deliberately stable external DTOs when consumers require a separate contract.
- `*.Infrastructure`: adapters for external services, clock/files/messages and other technical concerns.
- `*.Database`: Dapper queries/commands, connection factory, mappings, SQL scripts and migration integration.
- feature projects when domain size and ownership justify them.
- unit, integration, architecture, and end-to-end test projects with matching scope.

Keep references inward: hosts depend on application and adapters; adapters implement application ports; domain depends on neither host nor infrastructure. Avoid `Common`, `Shared`, and generic repository dumping grounds. Small services may collapse layers when boundaries remain explicit.

## Implementation defaults

- Target supported LTS .NET; pin SDK with `global.json` when reproducibility matters.
- Enable nullable reference types, implicit usings as appropriate, analyzers, warnings, and deterministic builds. Do not suppress broad warning sets to pass CI.
- Prefer constructor injection and narrow interfaces at real substitution boundaries. Avoid service locator and static mutable state.
- Bind configuration with options; validate required settings at startup. Never commit secrets or log configuration values blindly.
- Propagate `CancellationToken` through I/O and request paths. Avoid sync-over-async, fire-and-forget request work, and unbounded concurrency.
- Keep transport DTOs separate from domain/database models when their contracts differ. Validate at system boundary; enforce invariants in domain/application code.
- Return consistent problem details without exposing stack traces, SQL, credentials, or internal identifiers.
- Use authentication middleware plus policy/resource authorization. Treat CORS, forwarded headers, proxy trust, rate limits, upload limits, and antiforgery according to deployment.
- Measure before caching or pooling custom state. Bound queues, payloads, retries, timeouts, and allocations on hot paths.

## Change workflow

1. Map projects and references; identify composition root and test layers.
2. State invariant and ownership before adding abstractions.
3. Make smallest coherent change; preserve public contracts unless migration is explicit.
4. Add focused tests at owning layer. Use integration tests for framework/database boundaries.
5. Run restore, format/analyzers, build and relevant tests using repository-local commands.
6. For architecture changes, verify project-reference direction and absence of cycles.

Consult [architecture](references/architecture.md), [application practices](references/application-practices.md), and [sources](references/sources.md). This skill gives guidance only; it does not install SDKs, packages, services, or databases.
