# pidex.release-safety

Internal PIDEX module for release/publication guardrails.

The release-safety implementation is physically owned by this module:

- `modules/pidex/release-safety/scripts/public-readiness.sh`
- `modules/pidex/release-safety/scripts/public-readiness-check.mjs`
- `modules/pidex/release-safety/scripts/reference-integrity.mjs`

Compatibility wrappers remain at the historical public entrypoints:

- `scripts/release/public-readiness.sh`
- `scripts/release/public-readiness-check.mjs`
- `scripts/release/reference-integrity.mjs`

The wrappers preserve existing CLI behavior while module capabilities execute the module-owned implementation paths through `scripts/modules/run-check.mjs`.
