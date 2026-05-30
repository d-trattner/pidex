#!/usr/bin/env bash
# pidex installer removal helper.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
TARGET_DIR="$HOME/pidex"
DRY_RUN="0"
UNINSTALL_GLOBAL_GIT_HOOK="${PIDEX_UNINSTALL_GLOBAL_GIT_HOOK:-ask}"
STATE_DIR="$TARGET_DIR/state/skills"
AST_GREP_CLI_MARKER="$STATE_DIR/ast-grep-cli-installed-by-pidex"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  uninstall.sh [--dry-run] [--help]

Options:
  --dry-run   show command without executing
  --help      show this help

Environment:
  PIDEX_UNINSTALL_GLOBAL_GIT_HOOK=1  restore previous global Git hook path
  PIDEX_UNINSTALL_GLOBAL_GIT_HOOK=0  leave global Git hook config unchanged

Notes:
  Removes ast-grep CLI only when PIDEX installed it during install.sh.
  PIDEX does not copy bundled skills into global skill dirs.
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

if [ "$SCRIPT_DIR" != "$TARGET_DIR" ]; then
  fail "pidex v0.1 must be uninstalled from exactly $TARGET_DIR; this script is at $SCRIPT_DIR"
fi

if [ ! -d "$TARGET_DIR" ]; then
  fail "target path does not exist: $TARGET_DIR"
fi

if [ -f "$TARGET_DIR/package.json" ] && ! grep -Eq '"name"[[:space:]]*:[[:space:]]*"(@d-trattner/)?pidex"' "$TARGET_DIR/package.json"; then
  fail "target path does not look like a pidex checkout: missing package name @d-trattner/pidex"
fi

command -v pi >/dev/null 2>&1 || fail "missing prerequisite: pi"

remove_pidex_ast_grep_cli() {
  if [ ! -f "$AST_GREP_CLI_MARKER" ]; then
    say "preserving ast-grep CLI (not installed by PIDEX)"
    return
  fi
  if command -v npm >/dev/null 2>&1; then
    say "removing PIDEX-installed ast-grep CLI (@ast-grep/cli)"
    npm uninstall --global @ast-grep/cli || say "npm uninstall @ast-grep/cli failed; leaving CLI in place"
  else
    say "npm unavailable; leaving PIDEX-installed ast-grep CLI in place"
  fi
  rm -f "$AST_GREP_CLI_MARKER"
}

CMD=(pi uninstall "$TARGET_DIR")

say "uninstall target: $TARGET_DIR"
if [ "$DRY_RUN" = "1" ]; then
  printf 'DRY-RUN: '
  printf '%q ' "${CMD[@]}"
  printf '\n'
  exit 0
fi

"${CMD[@]}"

remove_pidex_ast_grep_cli

if [ -x "$TARGET_DIR/scripts/git-hooks/uninstall-global.sh" ] && [ -f "$TARGET_DIR/state/git-hooks/global-state.json" ]; then
  case "$UNINSTALL_GLOBAL_GIT_HOOK" in
    1|yes|true|on)
      "$TARGET_DIR/scripts/git-hooks/uninstall-global.sh"
      ;;
    0|no|false|off)
      say "leaving global Git hook config unchanged"
      ;;
    ask|*)
      if [ -t 0 ]; then
        printf '\nRestore previous global Git hook path saved by PIDEX? [Y/n] '
        read -r REPLY
        case "$REPLY" in
          n|N|no|NO) say "leaving global Git hook config unchanged" ;;
          *) "$TARGET_DIR/scripts/git-hooks/uninstall-global.sh" ;;
        esac
      else
        say "non-interactive uninstall; leaving global Git hook config unchanged (set PIDEX_UNINSTALL_GLOBAL_GIT_HOOK=1 to restore)"
      fi
      ;;
  esac
fi

say "uninstall complete"
say "Run in Pi: /reload"
