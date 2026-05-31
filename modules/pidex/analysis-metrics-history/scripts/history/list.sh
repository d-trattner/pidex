#!/usr/bin/env bash
# List recent projects from pidex history.jsonl, grouped by cwd, newest first.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../../.." && pwd -P)
STATE_DIR="${PIDEX_STATE_DIR:-$ROOT/state}"
HISTORY_FILE="$STATE_DIR/history.jsonl"
LIMIT=5
AS_JSON=0

while [ $# -gt 0 ]; do
  case "$1" in
    --limit) LIMIT="$2"; shift 2 ;;
    --json) AS_JSON=1; shift ;;
    *) echo "pidex history list: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -s "$HISTORY_FILE" ] || exit 0
PROJECTS=$(jq -s --argjson limit "$LIMIT" '
  map(select(.cwd != null and .cwd != ""))
  | sort_by(.cwd)
  | group_by(.cwd)
  | map((max_by(.ts)) as $last | {
      cwd:$last.cwd,
      last_event:$last.event,
      last_ts:$last.ts,
      last_epic:($last.epic // "" | tostring),
      last_mode:$last.mode
    })
  | sort_by(.last_ts) | reverse | .[0:$limit]
' "$HISTORY_FILE")

if [ "$AS_JSON" = "1" ]; then
  printf '%s\n' "$PROJECTS"
  exit 0
fi
COUNT=$(printf '%s' "$PROJECTS" | jq 'length')
[ "$COUNT" -eq 0 ] && exit 0
LETTERS=(A B C D E F G H I J)
i=0
printf '%s' "$PROJECTS" | jq -c '.[]' | while read -r row; do
  cwd=$(printf '%s' "$row" | jq -r '.cwd')
  ev=$(printf '%s' "$row" | jq -r '.last_event')
  ts=$(printf '%s' "$row" | jq -r '.last_ts')
  mode=$(printf '%s' "$row" | jq -r '.last_mode // "—"')
  epic=$(printf '%s' "$row" | jq -r '.last_epic // ""')
  printf '%s) %s\n' "${LETTERS[$i]}" "$cwd"
  printf '   last touched: %s (%s, %s)\n' "$ts" "$mode" "$ev"
  [ -n "$epic" ] && printf '   epic: %s\n' "$epic"
  i=$((i + 1))
done
