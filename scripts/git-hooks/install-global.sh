#!/usr/bin/env bash
# Install PIDEX global Git hooks for the current Linux user.
set -euo pipefail

PIDEX_ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
HOOKS_PATH="$PIDEX_ROOT/scripts/git-hooks/global"
STATE_DIR="$PIDEX_ROOT/state/git-hooks"
STATE_FILE="$STATE_DIR/global-state.json"
YES=0
FORCE=0
DRY_RUN=0

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  install-global.sh [--yes] [--force] [--dry-run] [--help]

Options:
  --yes      non-interactive accept
  --force    overwrite current global core.hooksPath even if changed since PIDEX install
  --dry-run  print planned changes only
  --help     show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) YES=1; shift ;;
    --force) FORCE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

command -v git >/dev/null 2>&1 || fail "missing prerequisite: git"
command -v python3 >/dev/null 2>&1 || fail "missing prerequisite: python3"

[ -x "$HOOKS_PATH/pre-commit" ] || fail "missing or non-executable hook: $HOOKS_PATH/pre-commit"
[ -x "$HOOKS_PATH/commit-msg" ] || fail "missing or non-executable hook: $HOOKS_PATH/commit-msg"
[ -x "$PIDEX_ROOT/scripts/git-hooks/lib/security-scan.sh" ] || fail "missing or non-executable scanner: $PIDEX_ROOT/scripts/git-hooks/lib/security-scan.sh"

CURRENT=$(git config --global --get core.hooksPath || true)
STATE_INSTALLED=0
STATE_PREVIOUS=""
STATE_PREVIOUS_EXISTS=false
if [ -f "$STATE_FILE" ]; then
  STATE_INFO=$(python3 - "$STATE_FILE" <<'PY' || true
import json, sys
try:
    d=json.load(open(sys.argv[1], encoding='utf-8'))
    print('1' if d.get('installed') else '0')
    print(d.get('previous_global_hooks_path') or '')
    print('true' if d.get('previous_global_hooks_path_existed') else 'false')
except Exception:
    print('0')
    print('')
    print('false')
PY
)
  STATE_INSTALLED=$(printf '%s\n' "$STATE_INFO" | sed -n '1p')
  STATE_PREVIOUS=$(printf '%s\n' "$STATE_INFO" | sed -n '2p')
  STATE_PREVIOUS_EXISTS=$(printf '%s\n' "$STATE_INFO" | sed -n '3p')
fi

if [ "$CURRENT" = "$HOOKS_PATH" ]; then
  say "PIDEX global Git hook already active: $HOOKS_PATH"
  if [ ! -f "$STATE_FILE" ]; then
    if [ "$DRY_RUN" = 1 ]; then
      say "DRY-RUN: would create state file $STATE_FILE"
      exit 0
    fi
    mkdir -p "$STATE_DIR"
    python3 - "$STATE_FILE" "$PIDEX_ROOT" "$HOOKS_PATH" <<'PY'
import json, os, sys, tempfile
from datetime import datetime, timezone
state_file, root, hooks = sys.argv[1:4]
d={
  'schema_version': 1,
  'installed': True,
  'installed_at': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
  'pidex_root': root,
  'pidex_hooks_path': hooks,
  'previous_global_hooks_path': None,
  'previous_global_hooks_path_existed': False,
  'mode': 'global',
  'version': 1,
}
os.makedirs(os.path.dirname(state_file), exist_ok=True)
fd,tmp=tempfile.mkstemp(prefix='.global-state.', dir=os.path.dirname(state_file), text=True)
with os.fdopen(fd,'w',encoding='utf-8') as f:
    json.dump(d,f,indent=2)
    f.write('\n')
os.replace(tmp,state_file)
PY
    say "created missing state file"
  fi
  exit 0
fi

if [ "$STATE_INSTALLED" = "1" ] && [ "$FORCE" != 1 ]; then
  warn "PIDEX state says global hook is installed, but core.hooksPath now points elsewhere: ${CURRENT:-<unset>}"
  warn "Use --force to replace the current value with PIDEX hooks."
  exit 1
fi

if [ "$YES" != 1 ]; then
  cat <<EOF
Install PIDEX global Git security hook?
This replaces your current global core.hooksPath while PIDEX is installed.
Previous value will be saved and restored on uninstall.

Current: ${CURRENT:-<unset>}
PIDEX:   $HOOKS_PATH
EOF
  read -r -p "Continue? [y/N] " REPLY
  case "$REPLY" in
    y|Y|yes|YES) ;;
    *) say "aborted"; exit 0 ;;
  esac
fi

if [ "$DRY_RUN" = 1 ]; then
  say "DRY-RUN: would write state file $STATE_FILE"
  say "DRY-RUN: would run: git config --global core.hooksPath $HOOKS_PATH"
  exit 0
fi

mkdir -p "$STATE_DIR"
PREVIOUS_PATH="$CURRENT"
PREVIOUS_EXISTS=false
if [ "$STATE_INSTALLED" = "1" ]; then
  PREVIOUS_PATH="$STATE_PREVIOUS"
  PREVIOUS_EXISTS="$STATE_PREVIOUS_EXISTS"
elif [ -n "$PREVIOUS_PATH" ]; then
  PREVIOUS_EXISTS=true
fi

python3 - "$STATE_FILE" "$PIDEX_ROOT" "$HOOKS_PATH" "$PREVIOUS_PATH" "$PREVIOUS_EXISTS" <<'PY'
import json, os, sys, tempfile
from datetime import datetime, timezone
state_file, root, hooks, previous, previous_exists = sys.argv[1:6]
prev_exists = previous_exists == 'true'
d={
  'schema_version': 1,
  'installed': True,
  'installed_at': datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
  'pidex_root': root,
  'pidex_hooks_path': hooks,
  'previous_global_hooks_path': previous if prev_exists else None,
  'previous_global_hooks_path_existed': prev_exists,
  'mode': 'global',
  'version': 1,
}
os.makedirs(os.path.dirname(state_file), exist_ok=True)
fd,tmp=tempfile.mkstemp(prefix='.global-state.', dir=os.path.dirname(state_file), text=True)
with os.fdopen(fd,'w',encoding='utf-8') as f:
    json.dump(d,f,indent=2)
    f.write('\n')
os.replace(tmp,state_file)
PY

git config --global core.hooksPath "$HOOKS_PATH"
say "PIDEX global Git hook installed: $HOOKS_PATH"
say "Previous global hook path saved in: $STATE_FILE"
say "Uninstall/restore with: $PIDEX_ROOT/scripts/git-hooks/uninstall-global.sh"
