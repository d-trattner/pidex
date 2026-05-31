#!/usr/bin/env bash
# Compatibility shim. Canonical public release authority is scripts/release/public-readiness.sh.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd -P)
exec bash "$ROOT/scripts/release/public-readiness.sh" "$@"
