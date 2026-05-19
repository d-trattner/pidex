# Schema Integrity Checklist for Lineage Links

PROC-NEW-004-2 | pidex-security

## Trigger

Apply during security review when a slice adds or changes persistent lineage links, ownership links, parent/child attempt links, audit-trail links, or any field used as a security/traceability signal.

Examples:

- `stage_attempt_id` on provider attempts
- run/stage transition lineage
- gate decision source attempt links
- artifact provenance links
- project/user ownership joins

## Rule

A service-level assignment is not enough for security-sensitive lineage. Require evidence for DB-enforced integrity or a documented, accepted limitation.

For each new lineage link, check:

1. **Non-nullability**: required lineage fields are `NOT NULL` unless explicitly optional by design.
2. **Foreign key**: link references the authoritative parent table with FK semantics where supported.
3. **Mismatch guard**: cross-run, cross-project, cross-stage, or cross-owner mismatches are rejected by DB constraint/trigger or a tested transactional guard.
4. **Negative tests**: orphan, null, and mismatch cases are covered.
5. **Migration behavior**: legacy invalid rows are either blocked, repaired, or explicitly dropped under an approved reset/reseed policy.
6. **Index/performance note**: FK columns expected to scale have an index or a documented non-blocking follow-up.

## Security report evidence

Record a concise table:

| Link | NOT NULL | FK | Mismatch guard | Negative tests | Migration behavior | Verdict |
|---|---|---|---|---|---|---|

If any required control is absent, classify severity based on whether the lineage is used for authorization/security decisions, audit trust, or only diagnostics.

## Rationale

A provider-attempt lineage field was initially populated by application logic but nullable and unconstrained in SQLite. The security gate caught the gap before release. DB-enforced lineage (`NOT NULL` + FK + mismatch trigger/tests) made the execution trace trustworthy.
