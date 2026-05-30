# pidex.release-safety

Internal PIDEX module for release/publication guardrails.

First-slice ownership is manifest-only. Existing implementation files stay at their current paths:

- `scripts/release/public-readiness.sh`
- `scripts/release/public-readiness-check.mjs`
- `scripts/release/reference-integrity.mjs`

Capabilities are exposed through `scripts/modules/discover.mjs` and executed through `scripts/modules/run-check.mjs`.
