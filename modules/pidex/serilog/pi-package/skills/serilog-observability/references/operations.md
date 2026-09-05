# Operational logging

## Event contract

Define key operational questions first. Use stable event names/templates and low-cardinality dimensions. IDs useful for tracing may be high-cardinality; do not turn them into metric labels blindly.

## Failure policy

- Console/file/remote sink ownership belongs to host/deployment.
- Bound buffering and disk use.
- Surface internal logging failures through approved self-log diagnostics without recursion or secret leakage.
- Decide whether loss, local fallback, backpressure, or process failure is acceptable per workload.
- Keep audit records separate when tamper evidence, strict delivery, retention, or access control differs from diagnostics.

## Redaction

Prefer allowlisted properties over after-the-fact regex redaction. Masking is defense in depth, not permission to ingest secrets. Test nested/destructured values and exception messages.
