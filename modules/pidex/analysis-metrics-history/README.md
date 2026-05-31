# PIDEX Analysis, Metrics, and History Module

Owns small observability/history surfaces as one module to avoid tiny-module fragmentation.

## Module-owned implementation

- `modules/pidex/analysis-metrics-history/scripts/analysis/**`
- `modules/pidex/analysis-metrics-history/scripts/metrics/**`
- `modules/pidex/analysis-metrics-history/scripts/history/**`
- `modules/pidex/analysis-metrics-history/scripts/pipeline/**`

## Compatibility wrappers

- `scripts/analysis/run-pipeline-analysis.sh`
- `scripts/metrics/*`
- `scripts/history/*`
- `scripts/pipeline/*`

Dashboard ingestion remains dashboard host/core until dashboard contribution loader design exists.
