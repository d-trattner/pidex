#!/usr/bin/env bash
# Compatibility wrapper. Implementation lives in modules/pidex/release-safety/scripts/public-readiness.sh.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
exec bash "$ROOT/modules/pidex/release-safety/scripts/public-readiness.sh" "$@"
