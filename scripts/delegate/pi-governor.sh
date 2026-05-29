#!/usr/bin/env bash
# PIDEX background Pi delegate for contract-governor decisions.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
exec node "$ROOT/scripts/delegate/pi-governor.mjs" "$@"
