#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
exec bash "$ROOT/modules/pidex/provider-governance/scripts/profile/use.sh" "$@"
