# Performance and deployment

## Evidence loop

1. Capture representative query, parameters/cardinality class, duration, CPU, logical reads, waits/blocking, and actual plan.
2. Verify correctness and transaction semantics first.
3. Fix non-sargable predicates, avoid accidental conversions, reduce rows/columns, then consider index/schema change.
4. Re-measure representative and control workloads. Check write regression and plan stability.

## Safe schema evolution

- Add nullable/default-compatible shape first.
- Deploy readers/writers compatible with old and new shape.
- Backfill in bounded resumable batches with progress evidence.
- Add/validate constraints when data is ready.
- Remove old shape only after all deployed consumers stop using it and rollback window closes.

Use online/resumable operations only when edition/version supports them and operational impact is understood. A syntactically online operation may still consume substantial log, CPU, tempdb, and locks.

## Operations

Monitor backups/restores, integrity checks, capacity, transaction log, tempdb, failed jobs, blocking/deadlocks, query regressions, permissions, encryption and patch state. Recovery proof requires tested restore, not successful backup job alone.
