#!/usr/bin/env bash
# Uninstall PIDEX global Git hooks and restore previous global hooksPath.
set -euo pipefail

PIDEX_ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
HOOKS_PATH="$PIDEX_ROOT/scripts/git-hooks/global"
STATE_FILE="$PIDEX_ROOT/state/git-hooks/global-state.json"
FORCE=0
DRY_RUN=0

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  uninstall-global.sh [--force] [--dry-run] [--help]

Options:
  --force    restore/unset even if current core.hooksPath no longer points to PIDEX
  --dry-run  print planned changes only
  --help     show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

command -v git >/dev/null 2>&1 || fail "missing prerequisite: git"
command -v python3 >/dev/null 2>&1 || fail "missing prerequisite: python3"
[ -f "$STATE_FILE" ] || fail "state file missing: $STATE_FILE"

STATE_INFO=$(python3 - "$STATE_FILE" <<'PY'
import json, sys
try:
    d=json.load(open(sys.argv[1], encoding='utf-8'))
except Exception as e:
    raise SystemExit(f'failed to read state: {e}')
print('1' if d.get('previous_global_hooks_path_existed') else '0')
print(d.get('previous_global_hooks_path') or '')
print(d.get('pidex_hooks_path') or '')
PY
)
PREVIOUS_EXISTS=$(printf '%s\n' "$STATE_INFO" | sed -n '1p')
PREVIOUS_PATH=$(printf '%s\n' "$STATE_INFO" | sed -n '2p')
STATE_HOOKS_PATH=$(printf '%s\n' "$STATE_INFO" | sed -n '3p')
[ -n "$STATE_HOOKS_PATH" ] && HOOKS_PATH="$STATE_HOOKS_PATH"

CURRENT=$(git config --global --get core.hooksPath || true)
if [ "$CURRENT" != "$HOOKS_PATH" ] && [ "$FORCE" != 1 ]; then
  warn "Current global core.hooksPath does not point to PIDEX."
  warn "Current: ${CURRENT:-<unset>}"
  warn "PIDEX:   $HOOKS_PATH"
  warn "Use --force to restore previous saved value anyway."
  exit 1
fi

if [ "$DRY_RUN" = 1 ]; then
  if [ "$PREVIOUS_EXISTS" = 1 ]; then
    say "DRY-RUN: would run: git config --global core.hooksPath $PREVIOUS_PATH"
  else
    say "DRY-RUN: would run: git config --global --unset core.hooksPath"
  fi
  say "DRY-RUN: would mark $STATE_FILE uninstalled"
  exit 0
fi

if [ "$PREVIOUS_EXISTS" = 1 ]; then
  git config --global core.hooksPath "$PREVIOUS_PATH"
  say "restored previous global core.hooksPath: $PREVIOUS_PATH"
else
  git config --global --unset core.hooksPath || true
  say "unset global core.hooksPath"
fi

python3 - "$STATE_FILE" <<'PY'
import json, os, sys, tempfile
from datetime import datetime, timezone
state_file=sys.argv[1]
with open(state_file, encoding='utf-8') as f:
    d=json.load(f)
d['installed']=False
d['uninstalled_at']=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
fd,tmp=tempfile.mkstemp(prefix='.global-state.', dir=os.path.dirname(state_file), text=True)
with os.fdopen(fd,'w',encoding='utf-8') as f:
    json.dump(d,f,indent=2)
    f.write('\n')
os.replace(tmp,state_file)
PY

say "PIDEX global Git hook uninstalled"
