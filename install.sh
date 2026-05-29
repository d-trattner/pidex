#!/usr/bin/env bash
# pidex installer helper.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
TARGET_DIR="$HOME/pidex"
DRY_RUN="0"
INSTALL_GLOBAL_GIT_HOOK="${PIDEX_INSTALL_GLOBAL_GIT_HOOK:-ask}"
SKIP_DASHBOARD_DEPS="${PIDEX_SKIP_DASHBOARD_DEPS:-0}"
STATE_DIR="$TARGET_DIR/state/skills"
AST_GREP_CLI_MARKER="$STATE_DIR/ast-grep-cli-installed-by-pidex"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Usage:
  install.sh [options]

Options:
  --dry-run                  print pi install command without executing
  --skip-dashboard-deps      skip dashboard npm dependency install
  --install-global-git-hook  install PIDEX global Git hook non-interactively
  --skip-global-git-hook     skip PIDEX global Git hook prompt
  --help                     show this help

Environment equivalents:
  PIDEX_INSTALL_GLOBAL_GIT_HOOK=1  same as --install-global-git-hook
  PIDEX_INSTALL_GLOBAL_GIT_HOOK=0  same as --skip-global-git-hook
  PIDEX_SKIP_DASHBOARD_DEPS=1      same as --skip-dashboard-deps

Notes:
  Installs ast-grep CLI if missing. PIDEX exposes bundled skills through
  the pi package install; it does not copy bundled skills into global skill dirs.
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
    --skip-dashboard-deps)
      SKIP_DASHBOARD_DEPS="1"
      shift
      ;;
    --install-global-git-hook)
      INSTALL_GLOBAL_GIT_HOOK="1"
      shift
      ;;
    --skip-global-git-hook)
      INSTALL_GLOBAL_GIT_HOOK="0"
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
  fail "pidex v0.1 must be installed from exactly $TARGET_DIR; this script is at $SCRIPT_DIR"
fi

if [ ! -d "$TARGET_DIR" ]; then
  fail "target path does not exist: $TARGET_DIR"
fi

if [ -f "$TARGET_DIR/package.json" ] && ! grep -Eq '"name"[[:space:]]*:[[:space:]]*"pidex"' "$TARGET_DIR/package.json"; then
  fail "target path does not look like a pidex checkout: missing package name pidex"
fi

command -v pi >/dev/null 2>&1 || fail "missing prerequisite: pi"
command -v node >/dev/null 2>&1 || fail "missing prerequisite: node"
command -v npm >/dev/null 2>&1 || fail "missing prerequisite: npm"

ensure_dashboard_deps() {
  if [[ "$SKIP_DASHBOARD_DEPS" =~ ^(1|yes|true|on)$ ]]; then
    say "skipping dashboard dependency install"
    return
  fi
  local dashboard_dir="$TARGET_DIR/dashboard"
  if [ ! -f "$dashboard_dir/package.json" ]; then
    say "dashboard package.json missing; skipping dashboard dependencies"
    return
  fi
  if [ -d "$dashboard_dir/node_modules" ]; then
    say "dashboard dependencies already present"
    return
  fi
  if [ -f "$dashboard_dir/package-lock.json" ]; then
    say "installing dashboard dependencies (npm ci)"
    npm --prefix "$dashboard_dir" ci
  else
    say "installing dashboard dependencies (npm install)"
    npm --prefix "$dashboard_dir" install
  fi
}

ensure_ast_grep_cli() {
  if command -v ast-grep >/dev/null 2>&1; then
    say "ast-grep CLI already installed: $(ast-grep --version 2>/dev/null || printf 'version unavailable')"
    return
  fi
  command -v npm >/dev/null 2>&1 || fail "missing prerequisite: npm (required to install @ast-grep/cli)"
  say "installing ast-grep CLI (@ast-grep/cli)"
  npm install --global @ast-grep/cli
  mkdir -p "$STATE_DIR"
  printf 'installed_at=%s\nsource=@ast-grep/cli\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$AST_GREP_CLI_MARKER"
}

ensure_dashboard_deps

say "checking extension TypeScript/runtime checks"
if [ -f "$TARGET_DIR/package.json" ]; then
  (cd "$TARGET_DIR" && npm run check >/dev/null)
else
  say "package.json missing; skipping npm check"
fi

CMD=(pi install "$TARGET_DIR")

if [ "$DRY_RUN" = "1" ]; then
  printf 'DRY-RUN: '
  printf '%q ' "${CMD[@]}"
  printf '\n'
  exit 0
fi

ensure_ast_grep_cli

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
