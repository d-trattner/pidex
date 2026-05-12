#!/usr/bin/env bash
# Output active pidex profile (fallback codex-optimized).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
PROBE="$ROOT/scripts/provider-limits/probe.py"
STATE="$ROOT/state/provider-limits/latest.json"

if [ -x "$PROBE" ] && [ -f "$STATE" ]; then
  python3 "$PROBE" latest \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("active_profile","codex-optimized"))' \
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
