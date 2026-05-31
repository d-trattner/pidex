#!/usr/bin/env bash
# Summarize Running Pi metrics for a plan.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
exec node "$SCRIPT_DIR/summarize.mjs" "$@"
