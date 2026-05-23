#!/usr/bin/env bash
# Output the active pidex provider profile (best-effort if provider-limits tooling is unavailable).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
PROBE="$ROOT/scripts/provider-limits/probe.mjs"
STATE="$ROOT/state/provider-limits/latest.json"

if [ -x "$PROBE" ] && [ -f "$STATE" ]; then
  node "$PROBE" latest \
    | node -e 'let s=""; process.stdin.on("data", d => s += d).on("end", () => { const data = JSON.parse(s || "{}"); console.log(data.active_profile || "custom"); })' \
    || echo "custom"
  exit 0
fi

if [ -f "$STATE" ]; then
  python3 - "$STATE" <<'PY'
import json, sys
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(data.get('active_profile', 'custom'))
except Exception:
    print('custom')
PY
  exit 0
fi

echo "custom"
