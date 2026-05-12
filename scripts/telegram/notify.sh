#!/usr/bin/env bash
# Send a plain PIDEX Telegram notification. No buttons, no reply handling.
set -euo pipefail

PROJECT="${PIDEX_PROJECT_DIR:-$PWD}"
NEEDS=""
CONTEXT=""
CHAT="${TELEGRAM_CHAT_ID:-}"
OPTIONAL=0
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --needs) NEEDS="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --chat-id) CHAT="$2"; shift 2 ;;
    --optional) OPTIONAL=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -n "$NEEDS" ] || { echo "missing --needs" >&2; exit 2; }

PROJECT_NAME="$(basename "$PROJECT")"
PROJECT_PATH="$PROJECT"
if [ -d "$PROJECT" ]; then
  PROJECT_PATH="$(cd "$PROJECT" && pwd)"
fi

if [ ${#CONTEXT} -gt 2400 ]; then
  CONTEXT="${CONTEXT:0:2400}…"
fi

TEXT="🔔 PIDEX needs you

Project: ${PROJECT_NAME}
Path: ${PROJECT_PATH}
Needs: ${NEEDS}"

if [ -n "$CONTEXT" ]; then
  TEXT="${TEXT}

Context:
${CONTEXT}"
fi

TEXT="${TEXT}

Action: return to Pi session and answer there. No Telegram reply needed."

if [ "$DRY_RUN" = "1" ]; then
  printf '%s\n' "$TEXT"
  exit 0
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "$CHAT" ]; then
  if [ "$OPTIONAL" = "1" ]; then
    exit 0
  fi
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] || { echo "TELEGRAM_BOT_TOKEN is not set" >&2; exit 1; }
  [ -n "$CHAT" ] || { echo "TELEGRAM_CHAT_ID is not set" >&2; exit 1; }
fi

curl -fsS \
  --data-urlencode "chat_id=$CHAT" \
  --data-urlencode "text=$TEXT" \
  --data-urlencode "reply_markup={\"remove_keyboard\":true}" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result",{}).get("message_id",""))'
