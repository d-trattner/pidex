---
name: dapper-data-access
description: Design, implement, review, and test explicit SQL data access with Dapper and Microsoft.Data.SqlClient in .NET backends. Use for queries, commands, mappings, transactions, connection ownership, cancellation, batching, and database boundaries. Prefer Dapper over introducing EF Core when explicit separation and readable SQL are desired.
license: MIT
metadata:
  dapper-snapshot: '2.1.79'
  pidex-module: pidex.dapper
---

# Dapper Data Access

Inspect provider, Dapper version, schema authority, connection/transaction ownership, SQL location, mapping conventions, retry policy, and integration tests first.

## Boundary

Keep Dapper, `DbConnection`, provider types, SQL, and row models in database/infrastructure layer. Application defines use-case-specific ports and outcomes; domain never depends on Dapper. Prefer explicit query/command objects or focused stores over generic repositories and hidden expression translators.

Dapper is default here because SQL and mapping stay visible. Do not add EF Core as parallel abstraction unless user explicitly chooses mixed persistence and ownership is clear.

## Query and command rules

- Parameterize every value. Never concatenate user input, identifiers, sort clauses, or predicates. Map dynamic identifiers/orderings through a closed allowlist.
- Name columns explicitly; avoid `SELECT *`. Keep projection and row mapping aligned.
- Use async APIs and pass `CancellationToken` through `CommandDefinition` where supported.
- Open connection near operation; dispose deterministically. Let pooling handle physical reuse. Never share mutable connection/transaction across concurrent requests.
- Pass transaction explicitly to every participating command. Commit only after all work succeeds; rollback/dispose on failure. Do not mix ambient and explicit ownership accidentally.
- Use one round trip or batching only when semantics remain clear. Avoid N+1 queries and unbounded `IN` lists; respect SQL Server parameter limits and payload size.
- Use `QuerySingle*`, `QueryFirst*`, or sequence methods according to cardinality invariant. Do not silently accept duplicate rows when uniqueness matters.
- Handle nullability, enums, value objects, decimals, dates, GUIDs, and multi-mapping deliberately. Database row types are not domain entities by default.
- Stored procedures and raw SQL remain versioned database contracts. Specify command type and parameters explicitly.

## Reliability and tests

Do not retry inside an active transaction blindly. Classify transient provider failures, idempotency, timeout, and commit ambiguity at application boundary. Log operation/template identity and duration, never secret parameter values.

Unit-test mapping-independent application logic. Use a disposable real SQL Server-compatible integration database for SQL syntax, collation, constraints, isolation, plans, and transaction behavior; mocks cannot prove these.

Review [patterns](references/patterns.md) and [sources](references/sources.md). Guidance only: no package installation, migration execution, or database connection.
