#!/usr/bin/env bash
# pidex public install doctor.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
EXPECTED="$HOME/pidex"
FAIL=0
WARN=0

ok() { printf '✓ %s\n' "$*"; }
warn() { WARN=$((WARN+1)); printf '⚠ %s\n' "$*"; }
fail() { FAIL=$((FAIL+1)); printf '✗ %s\n' "$*"; }

if [ "$ROOT" = "$EXPECTED" ]; then
  ok "installed at ~/pidex"
else
  fail "repo is at $ROOT, but pidex expects $EXPECTED"
  printf '  Fix: git clone <pidex-repo-url> ~/pidex && cd ~/pidex && ./install.sh\n'
fi

if command -v node >/dev/null 2>&1; then ok "node found: $(node --version)"; else fail "node not found"; fi
if command -v npm >/dev/null 2>&1; then ok "npm found: $(npm --version)"; else fail "npm not found"; fi
if command -v pi >/dev/null 2>&1; then ok "pi found: $(command -v pi)"; else fail "pi command not found"; fi

if [ -f "$ROOT/config/agents.json" ]; then ok "config/agents.json present"; else fail "config/agents.json missing"; fi
if compgen -G "$ROOT/config/profiles/*.json" >/dev/null; then ok "codex profiles present"; else fail "config/profiles/*.json missing"; fi
if [ -f "$ROOT/package.json" ]; then ok "package.json present"; else fail "package.json missing"; fi

if command -v npm >/dev/null 2>&1 && [ -f "$ROOT/package.json" ]; then
  if (cd "$ROOT" && npm run check >/tmp/pidex-doctor-check.log 2>&1); then
    ok "npm run check passed"
  else
    fail "npm run check failed; see /tmp/pidex-doctor-check.log"
  fi
fi

if command -v pi >/dev/null 2>&1; then
  if pi -e "$ROOT" --list-models __pidex_doctor_probe__ >/tmp/pidex-doctor-pi.log 2>/tmp/pidex-doctor-pi.err; then
    ok "Pi package load probe passed"
  else
    warn "Pi package load probe failed; see /tmp/pidex-doctor-pi.err"
  fi
fi

if command -v node >/dev/null 2>&1 && [ -f "$ROOT/config/agents.json" ]; then
  MODELS=$(node -e '
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const models = [];
function add(v) { if (v && !models.includes(v)) models.push(v); }
add((cfg.defaults || {}).model);
for (const route of Object.values(cfg.agents || {})) add((route || {}).model);
console.log(models.join(" "));
' "$ROOT/config/agents.json")
  if [ -n "$MODELS" ]; then
    ok "configured models: $MODELS"
  fi
fi

printf '\n==> Global Git Hook Health\n'
HOOKS_PATH="$ROOT/scripts/git-hooks/global"
STATE_FILE="$ROOT/state/git-hooks/global-state.json"
SCANNER="$ROOT/scripts/git-hooks/lib/security-scan.sh"
if command -v git >/dev/null 2>&1; then
  CURRENT_HOOKS=$(git config --global --get core.hooksPath || true)
  if [ "$CURRENT_HOOKS" = "$HOOKS_PATH" ]; then
    ok "global core.hooksPath points to PIDEX hooks"
  elif [ -z "$CURRENT_HOOKS" ]; then
    warn "global PIDEX Git hook not installed; core.hooksPath is unset"
  else
    warn "global PIDEX Git hook not active; core.hooksPath=$CURRENT_HOOKS"
  fi
else
  fail "git not found"
fi

if [ -r "$STATE_FILE" ]; then
  ok "global hook state file readable"
  if command -v node >/dev/null 2>&1; then
    if node -e '
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (d.schema_version !== 1) process.exit(1);
if (!("previous_global_hooks_path_existed" in d)) process.exit(1);
if (d.previous_global_hooks_path_existed) {
  if (typeof d.previous_global_hooks_path !== "string" || !d.previous_global_hooks_path) process.exit(1);
} else if (!(d.previous_global_hooks_path == null || d.previous_global_hooks_path === "")) process.exit(1);
' "$STATE_FILE" >/tmp/pidex-doctor-hook-state.log 2>&1
    then
      ok "global hook state restore metadata valid"
    else
      fail "global hook state invalid; see /tmp/pidex-doctor-hook-state.log"
    fi
  fi
else
  warn "global hook state file missing: $STATE_FILE"
fi

[ -x "$HOOKS_PATH/pre-commit" ] && ok "pre-commit hook executable" || fail "pre-commit hook missing or not executable"
[ -x "$HOOKS_PATH/commit-msg" ] && ok "commit-msg hook executable" || fail "commit-msg hook missing or not executable"
[ -x "$SCANNER" ] && ok "security scanner executable" || fail "security scanner missing or not executable"

if command -v git >/dev/null 2>&1 && [ -x "$SCANNER" ]; then
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  if git -C "$TMP" init >/dev/null 2>&1; then
    git -C "$TMP" config core.hooksPath "$HOOKS_PATH"
    printf '%s\n' 'token="ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' > "$TMP/secret.txt"
    git -C "$TMP" add secret.txt
    if (cd "$TMP" && "$SCANNER" --staged >/tmp/pidex-doctor-secret-scan.log 2>&1); then
      fail "security scanner did not block fake GitHub token"
    elif grep -q "Possible secrets found" /tmp/pidex-doctor-secret-scan.log; then
      ok "security scanner blocks fake GitHub token"
    else
      fail "security scanner fake secret test failed unexpectedly; see /tmp/pidex-doctor-secret-scan.log"
    fi
    git -C "$TMP" reset --hard >/dev/null 2>&1 || true
    printf '%s\n' 'hello' > "$TMP/ok.txt"
    git -C "$TMP" add ok.txt
    if (cd "$TMP" && "$SCANNER" --staged >/tmp/pidex-doctor-benign-scan.log 2>&1); then
      ok "security scanner passes benign staged file"
    else
      fail "security scanner blocked benign staged file; see /tmp/pidex-doctor-benign-scan.log"
    fi
  else
    warn "could not initialize temp repo for hook scanner smoke test"
  fi
fi

printf '\n'
if [ "$FAIL" -gt 0 ]; then
  printf 'Doctor result: %d failure(s), %d warning(s).\n' "$FAIL" "$WARN"
  exit 1
fi
printf 'Doctor result: ok with %d warning(s).\n' "$WARN"
