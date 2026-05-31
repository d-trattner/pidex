#!/usr/bin/env bash
# Attempt to activate a pidex provider profile.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd -P)"
PROBE="$ROOT/scripts/provider-limits/probe.mjs"
PROFILE="${1:-}"

if [ -z "$PROFILE" ] || [ "$PROFILE" = "-h" ] || [ "$PROFILE" = "--help" ]; then
  echo "Usage: $0 <codex-optimized|codex-high>"
  exit 2
fi

if [ -x "$PROBE" ]; then
  node "$PROBE" use "$PROFILE"
  exit 0
fi

echo "provider profile switch is a no-op in this pidex checkout (provider-limits probe not installed)."
exit 0
