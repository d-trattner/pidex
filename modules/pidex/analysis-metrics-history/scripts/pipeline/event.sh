#!/usr/bin/env bash
# Append one Running Pi pipeline lifecycle event as JSONL for analytics.
# This is analytics-only: no backend scheduler/state machine is driven by these events.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../../.." && pwd -P)
exec node "$ROOT/scripts/pipeline/event.mjs" "$@"
