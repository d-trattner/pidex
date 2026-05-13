#!/usr/bin/env bash
# Start/restart the PIDEX TanStack dashboard and print local/LAN URLs.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd -P)
HOST="127.0.0.1"
PORT="18777"
FOREGROUND=0
BUILD=1
INGEST=1
DEV=0
PUBLIC_READ="${PIDEX_PROVIDER_LIMITS_PUBLIC_READ:-0}"
PUBLIC_WRITE="${PIDEX_PROVIDER_LIMITS_PUBLIC_WRITE:-0}"
DOMAIN="${PIDEX_DASHBOARD_DOMAIN:-pi.lan}"

usage() {
  cat <<'EOF'
Usage: dashboard/start.sh [options]

Options:
  --host HOST       Bind host. Default: 127.0.0.1
  --port PORT       Bind port. Default: 18777
  --domain NAME     Print friendly domain URL. Default: pi.lan
  --public-read     Allow unauthenticated provider-limits GETs on public bind
  --public-write    Allow same-origin provider-limits writes on public bind (profile buttons)
  --no-build        Skip production build before start
  --no-ingest       Skip SQLite ingest before start
  --dev             Run Vite dev server instead of production preview
  --foreground      Run server in foreground instead of nohup background
  -h, --help        Show help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --no-build) BUILD=0; shift ;;
    --no-ingest) INGEST=0; shift ;;
    --dev) DEV=1; shift ;;
    --public-read) PUBLIC_READ=1; shift ;;
    --public-write) PUBLIC_WRITE=1; shift ;;
    --foreground) FOREGROUND=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

cd "$ROOT"
LOG="/tmp/pidex-dashboard-$PORT.log"
PID_FILE="$ROOT/.dashboard-$PORT.pid"

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
  INGEST_SCRIPT="$ROOT/../dashboard-old/scripts/ingest.py"
  if [ -f "$INGEST_SCRIPT" ]; then
    echo "==> Ingesting dashboard data"
    python3 "$INGEST_SCRIPT" --db "$ROOT/data/pidex.sqlite" --project "$ROOT" >/tmp/pidex-dashboard-ingest.json
  else
    echo "==> Ingest script missing; skipping ingest"
  fi
fi

if [ "$DEV" = "0" ] && [ "$BUILD" = "1" ]; then
  echo "==> Building dashboard"
  npm run build --silent
fi

export PIDEX_DASHBOARD_ROOT="$ROOT"
export PIDEX_DASHBOARD_DB="$ROOT/data/pidex.sqlite"
export PIDEX_PROVIDER_LIMITS_PUBLIC_READ="$PUBLIC_READ"
export PIDEX_PROVIDER_LIMITS_PUBLIC_WRITE="$PUBLIC_WRITE"

if [ "$HOST" = "127.0.0.1" ] || [ "$HOST" = "localhost" ] || [ "$HOST" = "::1" ]; then
  export PIDEX_DASHBOARD_PUBLIC_BIND=0
else
  export PIDEX_DASHBOARD_PUBLIC_BIND=1
fi

LAN_IP=""
if command -v hostname >/dev/null 2>&1; then
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
fi

print_urls() {
  cat <<EOF
PIDEX dashboard started.
PID:    $1
Log:    $LOG
Local:  http://127.0.0.1:$PORT/dashboard
EOF
  if [ -n "$LAN_IP" ] && [ "$HOST" = "0.0.0.0" ]; then
    echo "LAN:    http://$LAN_IP:$PORT/dashboard"
  fi
  if [ -n "$DOMAIN" ] && [ "$HOST" = "0.0.0.0" ]; then
    echo "Domain: http://$DOMAIN:$PORT/dashboard"
  fi
}

if [ "$DEV" = "1" ]; then
  CMD=("$ROOT/node_modules/.bin/vite" --host "$HOST" --port "$PORT" --strictPort)
else
  CMD=("$ROOT/node_modules/.bin/vite" preview --host "$HOST" --port "$PORT" --strictPort)
fi

if [ "$FOREGROUND" = "1" ]; then
  echo "==> Starting dashboard in foreground on $HOST:$PORT"
  echo "Local: http://127.0.0.1:$PORT/dashboard"
  exec "${CMD[@]}"
fi

echo "==> Starting dashboard on $HOST:$PORT"
nohup "${CMD[@]}" >"$LOG" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
sleep 1

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Dashboard failed to start. Log:" >&2
  tail -80 "$LOG" >&2 || true
  exit 1
fi

print_urls "$PID"
