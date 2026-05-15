#!/usr/bin/env bash
# pidex installer helper.
set -euo pipefail

TARGET_DIR="$HOME/pidex"
DRY_RUN="0"
INSTALL_GLOBAL_GIT_HOOK="${PIDEX_INSTALL_GLOBAL_GIT_HOOK:-ask}"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  install.sh [--dry-run] [--help]

Options:
  --dry-run   print pi install command without executing
  --help      show this help

Environment:
  PIDEX_INSTALL_GLOBAL_GIT_HOOK=1  install PIDEX global Git hook non-interactively
  PIDEX_INSTALL_GLOBAL_GIT_HOOK=0  skip PIDEX global Git hook prompt
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN="1"
      shift
      ;;
    --*)
      fail "Unknown option: $1"
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [ ! -d "$TARGET_DIR" ]; then
  fail "target path does not exist: $TARGET_DIR"
fi

if [ -f "$TARGET_DIR/package.json" ] && ! grep -Eq '"name"[[:space:]]*:[[:space:]]*"pidex"' "$TARGET_DIR/package.json"; then
  fail "target path does not look like a pidex checkout: missing package name pidex"
fi

command -v pi >/dev/null 2>&1 || fail "missing prerequisite: pi"
command -v node >/dev/null 2>&1 || fail "missing prerequisite: node"

say "checking extension TypeScript/runtime checks"
if command -v npm >/dev/null 2>&1; then
  if [ -f "$TARGET_DIR/package.json" ]; then
    (cd "$TARGET_DIR" && npm run check >/dev/null)
  else
    say "package.json missing; skipping npm check"
  fi
else
  say "npm not found; skipping check"
fi

CMD=(pi install "$TARGET_DIR")

if [ "$DRY_RUN" = "1" ]; then
  printf 'DRY-RUN: '
  printf '%q ' "${CMD[@]}"
  printf '\n'
  exit 0
fi

say "installing package into Pi settings"
"${CMD[@]}"

if [ -x "$TARGET_DIR/scripts/git-hooks/install-global.sh" ]; then
  case "$INSTALL_GLOBAL_GIT_HOOK" in
    1|yes|true|on)
      "$TARGET_DIR/scripts/git-hooks/install-global.sh" --yes
      ;;
    0|no|false|off)
      say "skipping PIDEX global Git hook install"
      ;;
    ask|*)
      if [ -t 0 ]; then
        printf '\nInstall PIDEX global Git security hook? This sets git config --global core.hooksPath to PIDEX hooks while installed. Previous value will be saved and restored on uninstall. [y/N] '
        read -r REPLY
        case "$REPLY" in
          y|Y|yes|YES) "$TARGET_DIR/scripts/git-hooks/install-global.sh" --yes ;;
          *) say "skipping PIDEX global Git hook install" ;;
        esac
      else
        say "non-interactive install; skipping PIDEX global Git hook (set PIDEX_INSTALL_GLOBAL_GIT_HOOK=1 to enable)"
      fi
      ;;
  esac
fi

say "install complete"
printf '\nRun in Pi:\n  /reload\n  /pidex <your task>\n\nShortcut:\n  /pd <your task>\n'
