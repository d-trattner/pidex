# Multi-project architecture

## Selection

Start minimal. Split project when boundary needs independent dependency policy, reusable contract, separate deployment, isolated ownership, or enforceable test seam. Folder is enough when none applies.

## Dependency rules

- Domain: business language/invariants only.
- Application: use cases and ports; may depend on Domain.
- Infrastructure/Database: implements ports; may depend inward.
- API/Worker: composition root; references implementations to wire DI.
- Contracts: external compatibility surface, versioned deliberately.

Never let Domain/Application reference ASP.NET hosts, Dapper, SQL client, Serilog sinks, or deployment adapters. Avoid interface-per-class ceremony; interface marks behavior consumed across boundary.

Feature-oriented solutions may repeat application/domain slices per bounded context. Share only stable primitives. Cross-feature work goes through contracts or orchestration, not internal table/model imports.

## Tests

- Domain/application unit tests: no network/database.
- Database integration tests: real disposable compatible database where semantics matter.
- API integration tests: real middleware/routing/auth composition with controlled dependencies.
- Architecture tests: project/namespace dependency rules.
- End-to-end tests: few critical journeys.
