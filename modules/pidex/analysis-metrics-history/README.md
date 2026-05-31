# PIDEX Analysis, Metrics, and History Module

Owns small observability/history surfaces as one module to avoid tiny-module fragmentation.

## Module-owned implementation

- `modules/pidex/analysis-metrics-history/scripts/analysis/**`
- `modules/pidex/analysis-metrics-history/scripts/metrics/**`
- `modules/pidex/analysis-metrics-history/scripts/history/**`
- `modules/pidex/analysis-metrics-history/scripts/pipeline/**`

## Compatibility wrappers

- `scripts/history/*` and `scripts/pipeline/*` remain while active PIDEX lifecycle callers migrate.
- `scripts/metrics/*.sh` remain for shell compatibility and now call module-local Node entrypoints directly.
- The former root analysis wrapper and root metrics Node wrappers have been retired; use module-owned implementations.

Dashboard ingestion remains dashboard host/core until dashboard contribution loader design exists.
