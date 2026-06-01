#!/usr/bin/env bash
# pidex installer helper.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
TARGET_DIR="$HOME/pidex"
DRY_RUN="0"
INSTALL_GLOBAL_GIT_HOOK="${PIDEX_INSTALL_GLOBAL_GIT_HOOK:-ask}"
INSTALL_BROWSER_SMOKE="${PIDEX_INSTALL_BROWSER_SMOKE:-ask}"
INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="${PIDEX_INSTALL_BROWSER_SMOKE_SYSTEM_DEPS:-ask}"
if [[ "${PIDEX_WITH_BROWSER_SMOKE:-}" =~ ^(1|yes|true|on)$ ]]; then INSTALL_BROWSER_SMOKE="1"; fi
if [[ "${PIDEX_SKIP_BROWSER_SMOKE:-}" =~ ^(1|yes|true|on)$ ]]; then INSTALL_BROWSER_SMOKE="0"; fi
if [[ "${PIDEX_WITH_BROWSER_SMOKE_SYSTEM_DEPS:-}" =~ ^(1|yes|true|on)$ ]]; then INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="1"; fi
if [[ "${PIDEX_SKIP_BROWSER_SMOKE_SYSTEM_DEPS:-}" =~ ^(1|yes|true|on)$ ]]; then INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="0"; fi
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
  --with-browser-smoke       install optional PIDEX browser-smoke support
  --skip-browser-smoke       skip optional browser-smoke prompt/install
  --with-browser-smoke-system-deps
                              also install Linux host packages required by Chromium (requires root/sudo)
  --skip-browser-smoke-system-deps
                              skip browser-smoke Linux system dependency prompt
  --help                     show this help

Environment equivalents:
  PIDEX_INSTALL_GLOBAL_GIT_HOOK=1  same as --install-global-git-hook
  PIDEX_INSTALL_GLOBAL_GIT_HOOK=0  same as --skip-global-git-hook
  PIDEX_INSTALL_BROWSER_SMOKE=1    same as --with-browser-smoke
  PIDEX_INSTALL_BROWSER_SMOKE=0    same as --skip-browser-smoke
  PIDEX_WITH_BROWSER_SMOKE=1       same as --with-browser-smoke
  PIDEX_SKIP_BROWSER_SMOKE=1       same as --skip-browser-smoke
  PIDEX_INSTALL_BROWSER_SMOKE_SYSTEM_DEPS=1  same as --with-browser-smoke-system-deps
  PIDEX_INSTALL_BROWSER_SMOKE_SYSTEM_DEPS=0  same as --skip-browser-smoke-system-deps
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
    --with-browser-smoke)
      INSTALL_BROWSER_SMOKE="1"
      shift
      ;;
    --skip-browser-smoke)
      INSTALL_BROWSER_SMOKE="0"
      shift
      ;;
    --with-browser-smoke-system-deps)
      INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="1"
      shift
      ;;
    --skip-browser-smoke-system-deps)
      INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="0"
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

if [ -f "$TARGET_DIR/package.json" ] && ! grep -Eq '"name"[[:space:]]*:[[:space:]]*"(@d-trattner/)?pidex"' "$TARGET_DIR/package.json"; then
  fail "target path does not look like a pidex checkout: missing package name @d-trattner/pidex"
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

run_module_capability() {
  local capability="$1"
  node "$TARGET_DIR/scripts/modules/run-check.mjs" \
    --capability "$capability" \
    --agent orchestrator \
    --phase maintenance \
    --project "$TARGET_DIR"
}

browser_smoke_install_args() {
  local -n out_ref=$1
  out_ref=(--yes)
  case "$INSTALL_BROWSER_SMOKE_SYSTEM_DEPS" in
    1|yes|true|on) out_ref+=(--with-system-deps) ;;
  esac
}

maybe_prompt_browser_smoke_system_deps() {
  case "$INSTALL_BROWSER_SMOKE_SYSTEM_DEPS" in
    1|yes|true|on|0|no|false|off) return ;;
  esac
  if [ "$(uname -s 2>/dev/null || printf unknown)" != "Linux" ]; then
    INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="0"
    return
  fi
  printf '\nAlso install Linux system packages required by headless Chromium? This may run apt via Playwright install-deps, requires root/passwordless sudo, modifies host packages, and may install fonts/X11 libraries. Recommended for minimal servers that should actually launch browser smoke. [y/N] '
  read -r REPLY
  case "$REPLY" in
    y|Y|yes|YES) INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="1" ;;
    *) INSTALL_BROWSER_SMOKE_SYSTEM_DEPS="0" ;;
  esac
}

if [ "$DRY_RUN" = "1" ]; then
  printf 'DRY-RUN: '
  printf '%q ' "${CMD[@]}"
  printf '\n'
  case "$INSTALL_GLOBAL_GIT_HOOK" in
    0|no|false|off)
      say "DRY-RUN: would skip PIDEX global Git hook install"
      ;;
    *)
      run_module_capability git-security-hooks.install-dry-run
      ;;
  esac
  case "$INSTALL_BROWSER_SMOKE" in
    1|yes|true|on)
      BROWSER_SMOKE_ARGS=()
      browser_smoke_install_args BROWSER_SMOKE_ARGS
      node "$TARGET_DIR/scripts/modules/run-check.mjs" --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$TARGET_DIR" -- --dry-run "${BROWSER_SMOKE_ARGS[@]}"
      ;;
    0|no|false|off)
      say "DRY-RUN: would skip PIDEX browser-smoke support install"
      ;;
    ask|*)
      if [ -t 0 ]; then
        say "DRY-RUN: would ask about optional browser-smoke support"
        say "DRY-RUN: if accepted on Linux, would also ask whether to install host-level Chromium system packages (requires root/sudo)"
      else
        say "DRY-RUN: non-interactive install; would skip PIDEX browser-smoke support"
      fi
      ;;
  esac
  exit 0
fi

ensure_ast_grep_cli

say "installing package into Pi settings"
"${CMD[@]}"

case "$INSTALL_GLOBAL_GIT_HOOK" in
  1|yes|true|on)
    run_module_capability git-security-hooks.install
    ;;
  0|no|false|off)
    say "skipping PIDEX global Git hook install"
    ;;
  ask|*)
    if [ -t 0 ]; then
      printf '\nInstall PIDEX global Git security hook? This sets git config --global core.hooksPath to PIDEX hooks while installed. Previous value will be saved and restored on uninstall. [y/N] '
      read -r REPLY
      case "$REPLY" in
        y|Y|yes|YES) run_module_capability git-security-hooks.install ;;
        *) say "skipping PIDEX global Git hook install" ;;
      esac
    else
      say "non-interactive install; skipping PIDEX global Git hook (set PIDEX_INSTALL_GLOBAL_GIT_HOOK=1 to enable)"
    fi
    ;;
esac

case "$INSTALL_BROWSER_SMOKE" in
  1|yes|true|on)
    BROWSER_SMOKE_ARGS=()
    browser_smoke_install_args BROWSER_SMOKE_ARGS
    node "$TARGET_DIR/scripts/modules/run-check.mjs" --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$TARGET_DIR" -- "${BROWSER_SMOKE_ARGS[@]}"
    ;;
  0|no|false|off)
    say "skipping PIDEX browser-smoke support install"
    ;;
  ask|*)
    if [ -t 0 ]; then
      printf '\nInstall optional PIDEX browser-smoke support now? This installs PIDEX-local Playwright/Chromium support for real-browser QA checks (page render, styles, console errors, basic interactions). Useful for web/UI/SSR/responsive work; unnecessary for CLI/API/docs/backend-only work. This may download a large browser (~150-250MB), can be platform-sensitive, and can be installed later. [y/N] '
      read -r REPLY
      case "$REPLY" in
        y|Y|yes|YES)
          maybe_prompt_browser_smoke_system_deps
          BROWSER_SMOKE_ARGS=()
          browser_smoke_install_args BROWSER_SMOKE_ARGS
          node "$TARGET_DIR/scripts/modules/run-check.mjs" --capability browser-smoke.install --agent orchestrator --phase maintenance --project "$TARGET_DIR" -- "${BROWSER_SMOKE_ARGS[@]}"
          ;;
        *) say "skipping PIDEX browser-smoke support install" ;;
      esac
    else
      say "non-interactive install; skipping PIDEX browser-smoke support (set PIDEX_INSTALL_BROWSER_SMOKE=1 to enable)"
    fi
    ;;
esac

say "install complete"
printf '\nRun in Pi:\n  /reload\n  /pidex <your task>\n\nShortcut:\n  /pd <your task>\n'
