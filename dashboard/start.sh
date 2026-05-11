#!/usr/bin/env bash
# Start/restart the Running Pi dashboard and print local/LAN URLs.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
DASHBOARD="$ROOT/dashboard"
HOST="0.0.0.0"
PORT="18777"
INGEST=1
FOREGROUND=0

usage() {
  cat <<'EOF'
Usage: dashboard/start.sh [options]

Options:
  --host HOST       Bind host. Default: 0.0.0.0
  --port PORT       Bind port. Default: 18777
  --no-ingest       Skip ingest before start
  --foreground      Run server in foreground instead of nohup background
  -h, --help        Show help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --no-ingest) INGEST=0; shift ;;
    --foreground) FOREGROUND=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

cd "$DASHBOARD"
LOG="/tmp/running-pi-dashboard-$PORT.log"
PID_FILE="$DASHBOARD/.dashboard-$PORT.pid"

stop_pid() {
  local pid="$1"
  [ -n "$pid" ] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
}

# Stop previously recorded process and any process currently listening on PORT.
if [ -f "$PID_FILE" ]; then
  stop_pid "$(cat "$PID_FILE" 2>/dev/null || true)"
  rm -f "$PID_FILE"
fi
if command -v ss >/dev/null 2>&1; then
  while read -r pid; do
    stop_pid "$pid"
  done < <(ss -ltnp 2>/dev/null | awk -v port=":$PORT" '$4 ~ port { if (match($0, /pid=[0-9]+/)) { print substr($0, RSTART+4, RLENGTH-4) } }' | sort -u)
fi
sleep 0.5

if [ "$INGEST" = "1" ]; then
  echo "==> Ingesting dashboard data"
  npm run ingest --silent >/tmp/running-pi-dashboard-ingest.json
fi

if [ "$FOREGROUND" = "1" ]; then
  echo "==> Starting dashboard in foreground"
  echo "Local: http://127.0.0.1:$PORT"
  exec npm run dev -- --host "$HOST" --port "$PORT"
fi

echo "==> Starting dashboard on $HOST:$PORT"
nohup npm run dev -- --host "$HOST" --port "$PORT" >"$LOG" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
sleep 1

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Dashboard failed to start. Log:" >&2
  tail -80 "$LOG" >&2 || true
  exit 1
fi

LAN_IP=""
if command -v hostname >/dev/null 2>&1; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi

cat <<EOF
Running Pi dashboard started.
PID:   $PID
Log:   $LOG
Local: http://127.0.0.1:$PORT
EOF
if [ -n "$LAN_IP" ] && [ "$HOST" = "0.0.0.0" ]; then
  echo "LAN:   http://$LAN_IP:$PORT"
fi
