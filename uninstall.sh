#!/usr/bin/env bash
# pidex installer removal helper.
set -euo pipefail

TARGET_DIR="$HOME/pidex"
DRY_RUN="0"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  uninstall.sh [--dry-run] [--help]

Options:
  --dry-run   show command without executing
  --help      show this help
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

CMD=(pi uninstall "$TARGET_DIR")

say "uninstall target: $TARGET_DIR"
if [ "$DRY_RUN" = "1" ]; then
  printf 'DRY-RUN: '
  printf '%q ' "${CMD[@]}"
  printf '\n'
  exit 0
fi

"${CMD[@]}"

say "uninstall complete"
say "Run in Pi: /reload"
