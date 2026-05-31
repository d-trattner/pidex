#!/usr/bin/env bash
# Append one Running Pi agent metric record as JSONL.
# No prompts, task text, secrets, or model credentials are recorded.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
exec node "$SCRIPT_DIR/record.mjs" "$@"
