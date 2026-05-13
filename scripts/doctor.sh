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
  ok "installed at <pidex-root>"
else
  fail "repo is at $ROOT, but pidex expects $EXPECTED"
  printf '  Fix: git clone <pidex-repo-url> <pidex-root> && cd <pidex-root> && pi install .\n'
fi

if command -v node >/dev/null 2>&1; then ok "node found: $(node --version)"; else fail "node not found"; fi
if command -v npm >/dev/null 2>&1; then ok "npm found: $(npm --version)"; else fail "npm not found"; fi
if command -v python3 >/dev/null 2>&1; then ok "python3 found: $(python3 --version 2>&1)"; else fail "python3 not found"; fi
if command -v pi >/dev/null 2>&1; then ok "pi found: $(command -v pi)"; else fail "pi command not found"; fi

if [ -f "$ROOT/config/agents.json" ]; then ok "config/agents.json present"; else fail "config/agents.json missing"; fi
if [ -f "$ROOT/config/profiles/codex-optimized.json" ]; then ok "codex profile present"; else fail "config/profiles/codex-optimized.json missing"; fi
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

if command -v python3 >/dev/null 2>&1 && [ -f "$ROOT/config/agents.json" ]; then
  MODELS=$(python3 - "$ROOT/config/agents.json" <<'PY'
import json, sys
cfg=json.load(open(sys.argv[1], encoding='utf-8'))
models=[]

def add(v):
    if v and v not in models:
        models.append(v)

def gather(route):
    add((route or {}).get('model'))

add((cfg.get('defaults') or {}).get('model'))
for r in (cfg.get('agents') or {}).values():
    gather(r)
print(' '.join(models))
PY
)
  if [ -n "$MODELS" ]; then
    ok "configured models: $MODELS"
  fi
fi

printf '\n'
if [ "$FAIL" -gt 0 ]; then
  printf 'Doctor result: %d failure(s), %d warning(s).\n' "$FAIL" "$WARN"
  exit 1
fi
printf 'Doctor result: ok with %d warning(s).\n' "$WARN"
