---
name: sql-server
description: Design, review, tune, secure, migrate, and test Microsoft SQL Server schemas and T-SQL for .NET backends. Use for data types, keys, constraints, indexing, execution plans, transactions, isolation, concurrency, pagination, deployment, permissions, and diagnostics. Pair with Dapper guidance when explicit .NET data access is involved.
license: MIT
metadata:
  sql-server-target: '2025'
  pidex-module: pidex.sqlserver
---

# SQL Server

Inspect supported SQL Server/compatibility level, schema authority, workload/cardinality, collation, recovery/HA model, security boundary, migration tool, and representative plans before advising.

## Schema and queries

- Model keys, nullability, uniqueness, foreign keys, and check constraints as database invariants. Do not rely only on application validation.
- Choose smallest correct types. Keep lengths/precision explicit; avoid `nvarchar(max)` and approximate numerics by default. Define UTC/time-zone semantics deliberately.
- Parameterize values. Dynamic identifiers and sort directions require closed allowlists.
- Avoid `SELECT *`; return needed columns. Make ordering deterministic, especially pagination.
- Prefer keyset pagination for deep ordered traversal; offset pagination is acceptable when bounded and semantics understood.
- Design indexes from workload and plans. Account for selectivity, key order, included columns, write cost, storage, filtered predicates, and existing overlap. Do not add an index per query mechanically.
- Investigate actual execution plans, estimates versus actual rows, logical reads, spills, blocking, parameter sensitivity, and statistics before tuning.
- Keep set-based operations readable; batch large writes/deletes to bound locks, log growth, and latency.

## Transactions and concurrency

Choose isolation from invariant and conflict model. Keep transactions short and connection-scoped. Access resources in consistent order. Handle deadlocks as retriable only when operation is safe/idempotent. Use optimistic concurrency token/version checks where lost updates matter. Distinguish timeout, cancellation, deadlock, unique conflict, and unknown commit outcome.

Do not use `NOLOCK` as generic performance fix. It permits inconsistent reads and does not mean no locking. Evaluate read-committed snapshot/snapshot isolation operationally before enabling.

## Security and deployment

Grant least privilege to dedicated identities; separate migration authority from runtime access. Prefer managed/Windows identity when deployment supports it. Encrypt transport and validate certificates. Keep connection strings and credentials outside source/logs.

Migrations must be versioned, reviewable, backward-compatible across deployment window, observable, and recoverable. Split destructive changes into expand/migrate/contract phases. Estimate locks/log growth and test with realistic volume. Never auto-run destructive production migration from ordinary application startup without explicit operational authority.

Use disposable SQL Server for integration evidence; mocks cannot prove collation, locking, constraints, plans, or T-SQL. Review [performance and deployment](references/performance-deployment.md) and [sources](references/sources.md). Guidance only: no live connection or schema mutation.
