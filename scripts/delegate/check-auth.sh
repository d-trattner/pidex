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
  mapfile -t PROVIDERS < <(python3 - "$CONFIG_FILE" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
providers = set()

def add(p):
    p = (p or '').strip().lower()
    if p and p not in {'pi', 'subagent', 'pidex_agent', 'rp_agent'}:
        providers.add(p)

add((cfg.get('defaults') or {}).get('provider'))
for route in (cfg.get('agents') or {}).values():
    add(route.get('provider') or (cfg.get('defaults') or {}).get('provider'))

for provider in sorted(providers):
    print(provider)
PY
)
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
  if python3 - "$auth_file" <<'PY' >/dev/null 2>&1
import json, sys
try:
    a = json.load(open(sys.argv[1], 'r', encoding='utf-8'))
    raise SystemExit(0 if a.get('tokens') or a.get('OPENAI_API_KEY') else 1)
except Exception:
    raise SystemExit(1)
PY
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
