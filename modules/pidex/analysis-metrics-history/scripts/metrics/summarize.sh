#!/usr/bin/env bash
# Summarize Running Pi metrics for a plan.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../../.." && pwd -P)
exec node "$ROOT/scripts/metrics/summarize.mjs" "$@"
