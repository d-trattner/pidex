#!/usr/bin/env bash
# Compatibility entrypoint; paths are argv for native shell path conversion.
set -euo pipefail
DIR=$(cd "$(dirname "$0")" && pwd -P)
exec node "$DIR/shell.mjs" append "${PIDEX_STATE_DIR:-}" "${RUNNING_PI_STATE_DIR:-}" "${TMPDIR:-}" "$@"
