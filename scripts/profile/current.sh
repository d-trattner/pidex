#!/usr/bin/env bash
# Output the active pidex provider profile (best-effort if provider-limits tooling is unavailable).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
PROBE="$ROOT/scripts/provider-limits/probe.py"
STATE="$ROOT/state/provider-limits/latest.json"

if [ -x "$PROBE" ] && [ -f "$STATE" ]; then
  python3 "$PROBE" latest \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("active_profile","custom"))' \
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
