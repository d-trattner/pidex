#!/usr/bin/env bash
# Output active pidex profile (fallback codex-optimized).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
PROBE="$ROOT/scripts/provider-limits/probe.mjs"
STATE="$ROOT/state/provider-limits/latest.json"

if [ -x "$PROBE" ] && [ -f "$STATE" ]; then
  node "$PROBE" latest \
    | node -e 'let s=""; process.stdin.on("data", d => s += d).on("end", () => { const data = JSON.parse(s || "{}"); console.log(data.active_profile || "codex-optimized"); })' \
    || echo "codex-optimized"
  exit 0
fi

if [ -f "$STATE" ]; then
  python3 - "$STATE" <<'PY'
import json, sys
path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(data.get('active_profile', 'codex-optimized'))
except Exception:
    print('codex-optimized')
PY
  exit 0
fi

echo "codex-optimized"
