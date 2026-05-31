#!/usr/bin/env bash
# Output active pidex profile (fallback codex-optimized).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd -P)"
PROBE="$ROOT/scripts/provider-limits/probe.mjs"
STATE="$ROOT/state/provider-limits/latest.json"

if [ -x "$PROBE" ] && [ -f "$STATE" ]; then
  node "$PROBE" latest \
    | node -e 'let s=""; process.stdin.on("data", d => s += d).on("end", () => { const data = JSON.parse(s || "{}"); console.log(data.active_profile || "codex-optimized"); })' \
    || echo "codex-optimized"
  exit 0
fi

if [ -f "$STATE" ]; then
  node -e 'const fs = require("fs"); try { const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(data.active_profile || "codex-optimized"); } catch { console.log("codex-optimized"); }' "$STATE"
  exit 0
fi

echo "codex-optimized"
