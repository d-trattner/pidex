#!/usr/bin/env bash
# Public-readiness gate for PIDEX. No network, no LLM calls.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
EXPECTED="$HOME/pidex"
DIRTY_OK=0
SKIP_CHECK=0

usage() {
  cat <<'EOF'
Usage: scripts/release/public-readiness.sh [--dirty-ok] [--skip-check]

Checks the PIDEX public-release invariants:
- checkout path is exactly ~/pidex
- pnpm run check passes unless --skip-check
- module manifests/config validate even when --skip-check is used
- no forbidden tracked runtime/private paths
- no high-confidence secret tokens or local operator path leaks in tracked text
- public default configs do not include local balances or enabled optional secondary lanes
- pnpm pack does not include excluded paths
- no legacy dashboard archive
- README documents the ~/pidex install contract
- Pi SDK dependencies use @earendil-works namespace
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dirty-ok) DIRTY_OK=1; shift ;;
    --skip-check) SKIP_CHECK=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

fail() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

cd "$ROOT"

[ "$ROOT" = "$EXPECTED" ] || fail "PIDEX must be checked out at ~/pidex for v0.1 (got $ROOT)"
ok "checkout path is ~/pidex"

if [ "$DIRTY_OK" != "1" ]; then
  if [ -n "$(git status --short)" ]; then
    git status --short >&2
    fail "working tree is dirty; use --dirty-ok for local preflight only"
  fi
else
  ok "dirty tree allowed for local preflight"
fi

node scripts/release/public-readiness-check.mjs tracked-clean
ok "no forbidden tracked runtime/private files or high-confidence secrets"

node scripts/release/reference-integrity.mjs
ok "package-facing references resolve"

if git ls-files | grep -q '^dashboard-old/'; then
  git ls-files | grep '^dashboard-old/' >&2
  fail "legacy dashboard-old files are still tracked"
fi
[ ! -e "$ROOT/dashboard-old" ] || fail "legacy dashboard-old directory still exists"
ok "legacy dashboard-old removed"

if ! grep -q 'exactly `~/pidex`' README.md; then
  fail "README.md must document the exact ~/pidex install contract"
fi
ok "README documents exact install path"

NAMESPACE_TMP=$(mktemp "${TMPDIR:-/tmp}/pidex-public-readiness-namespace.XXXXXX")
trap 'rm -f "$NAMESPACE_TMP"' EXIT
if command -v rg >/dev/null 2>&1; then
  if rg -n '@mariozechner/pi-' package.json extensions >"$NAMESPACE_TMP" 2>/dev/null; then
    cat "$NAMESPACE_TMP" >&2
    fail "old @mariozechner Pi SDK namespace remains"
  fi
  if ! rg -q '@earendil-works/pi-coding-agent' package.json extensions; then
    fail "@earendil-works/pi-coding-agent dependency/import not found"
  fi
else
  if grep -R -n '@mariozechner/pi-' package.json extensions >"$NAMESPACE_TMP" 2>/dev/null; then
    cat "$NAMESPACE_TMP" >&2
    fail "old @mariozechner Pi SDK namespace remains"
  fi
  if ! grep -R -q '@earendil-works/pi-coding-agent' package.json extensions; then
    fail "@earendil-works/pi-coding-agent dependency/import not found"
  fi
fi
ok "Pi SDK namespace uses @earendil-works"

node scripts/release/public-readiness-check.mjs parallel-defaults
ok "public default optional parallel agents are disabled"

if [ "$SKIP_CHECK" != "1" ]; then
  corepack pnpm run check
  ok "pnpm run check passed"
else
  ok "pnpm run check skipped"
  node scripts/modules/validate.mjs --project "$PWD" >/dev/null
  ok "module manifests/config validate"
fi

PACK_JSON=$(mktemp)
trap 'rm -f "$PACK_JSON"' EXIT
corepack pnpm pack --dry-run --json >"$PACK_JSON"
node scripts/release/public-readiness-check.mjs pack-clean "$PACK_JSON"
ok "pnpm package contents clean"

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || true)
case "$CURRENT_BRANCH" in
  quarantine/*) fail "current branch is quarantine/*; do not publish this branch" ;;
esac
ok "current branch is not quarantine/*"

echo "Public readiness gate passed."
