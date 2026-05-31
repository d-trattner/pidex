#!/usr/bin/env bash
# Append a single event to the pidex history log.
# File: $PIDEX_STATE_DIR/history.jsonl (default: <pidex-root>/state/history.jsonl)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../../.." && pwd -P)
STATE_DIR="${PIDEX_STATE_DIR:-$ROOT/state}"
HISTORY_FILE="$STATE_DIR/history.jsonl"
EVENT=""
declare -A KV

while [ $# -gt 0 ]; do
  case "$1" in
    --event) EVENT="$2"; shift 2 ;;
    --*)
      key="${1#--}"
      key="${key//-/_}"
      KV[$key]="$2"
      shift 2 ;;
    *) echo "pidex history append: unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$EVENT" ]; then
  echo "pidex history append: missing --event" >&2
  exit 2
fi
mkdir -p "$STATE_DIR"
TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
JQ_ARGS=(-n --arg ts "$TS" --arg event "$EVENT")
JQ_FILTER='{ts:$ts,event:$event'
for key in "${!KV[@]}"; do
  JQ_ARGS+=(--arg "$key" "${KV[$key]}")
  JQ_FILTER="${JQ_FILTER},${key}:\$${key}"
done
JQ_FILTER="${JQ_FILTER}}"
jq -c "${JQ_ARGS[@]}" "$JQ_FILTER" >> "$HISTORY_FILE"
