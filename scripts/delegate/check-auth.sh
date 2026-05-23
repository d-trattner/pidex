#!/usr/bin/env bash
# Validate Codex delegate auth/tooling without printing secrets.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
CONFIG_FILE="$ROOT/config/agents.json"
PROVIDERS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG_FILE="$2"; shift 2 ;;
    --provider) PROVIDERS+=("${2,,}"); shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--config config/agents.json] [--provider codex]"
      exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2 ;;
  esac
done

if [ "${#PROVIDERS[@]}" -eq 0 ]; then
  if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: config file not found: $CONFIG_FILE" >&2
    exit 1
  fi
  mapfile -t PROVIDERS < <(node -e '
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const providers = new Set();
function add(p) {
  p = String(p || "").trim().toLowerCase();
  if (p && !["pi", "subagent", "pidex_agent", "rp_agent"].includes(p)) providers.add(p);
}
add((cfg.defaults || {}).provider);
for (const route of Object.values(cfg.agents || {})) add(route.provider || (cfg.defaults || {}).provider);
for (const provider of [...providers].sort()) console.log(provider);
' "$CONFIG_FILE")
fi

if [ "${#PROVIDERS[@]}" -eq 0 ]; then
  echo "OK: no non-Pi delegate providers configured"
  exit 0
fi

STATUS=0

check_codex() {
  if ! command -v codex >/dev/null 2>&1; then
    echo "FAIL codex: CLI not found" >&2
    return 1
  fi
  if [ -n "${OPENAI_API_KEY:-}" ]; then
    echo "OK codex: OPENAI_API_KEY present"
    return 0
  fi
  local auth_file="$HOME/.codex/auth.json"
  if [ ! -f "$auth_file" ]; then
    echo "FAIL codex: no OPENAI_API_KEY and no $auth_file" >&2
    return 1
  fi
  if node -e 'const fs = require("fs"); try { const a = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.exit(a.tokens || a.OPENAI_API_KEY ? 0 : 1); } catch { process.exit(1); }' "$auth_file" >/dev/null 2>&1
  then
    echo "OK codex: auth file has tokens"
    return 0
  fi
  echo "FAIL codex: $auth_file has no usable tokens (run 'codex login')" >&2
  return 1
}

for provider in "${PROVIDERS[@]}"; do
  case "$provider" in
    codex) check_codex || STATUS=1 ;;
    *) echo "FAIL $provider: codex-only pipeline does not support provider '$provider'" >&2; STATUS=1 ;;
  esac
done

if [ "$STATUS" -ne 0 ]; then
  exit 1
fi

echo "OK codex-only delegate auth/tooling checks passed."
exit 0
