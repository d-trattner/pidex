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
- npm run check passes unless --skip-check
- no forbidden tracked runtime/private paths
- npm pack does not include excluded paths
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

python3 - <<'PY'
import subprocess, sys
paths = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
bad = []
for path in paths:
    if path == 'pidex/state/.gitkeep':
        continue
    if (
        path.startswith(('state/', 'agents.output/', 'logs/', 'pidex/state/'))
        or path == 'dashboard/data'
        or '/.env' in path or path.startswith('.env')
        or path == 'config.env' or path.startswith('secrets/')
        or path.endswith(('.db', '.sqlite', '.pem', '.key', '.crt', '.p12'))
    ):
        bad.append(path)
if bad:
    print('\n'.join(bad), file=sys.stderr)
    raise SystemExit(1)
PY
ok "no forbidden tracked runtime/private files"

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

if rg -n '@mariozechner/pi-' package.json extensions >/tmp/pidex-public-readiness-namespace.txt 2>/dev/null; then
  cat /tmp/pidex-public-readiness-namespace.txt >&2
  fail "old @mariozechner Pi SDK namespace remains"
fi
if ! rg -q '@earendil-works/pi-coding-agent' package.json extensions; then
  fail "@earendil-works/pi-coding-agent dependency/import not found"
fi
ok "Pi SDK namespace uses @earendil-works"

if [ "$SKIP_CHECK" != "1" ]; then
  npm run check
  ok "npm run check passed"
else
  ok "npm run check skipped"
fi

PACK_JSON=$(mktemp)
trap 'rm -f "$PACK_JSON"' EXIT
npm pack --dry-run --json >"$PACK_JSON"
python3 - "$PACK_JSON" <<'PY'
import json, sys
pkg = json.load(open(sys.argv[1], encoding='utf-8'))[0]
bad = []
for f in pkg.get('files', []):
    path = f.get('path', '')
    if (
        path.startswith((
            'dashboard-old/', 'analysis/', 'wiki/', 'state/', 'agents.output/', 'logs/',
            'dashboard/node_modules/', 'dashboard/.playwright/', 'dashboard/.fallow/',
            'dashboard/agents.output/', 'dashboard/dist/', 'dashboard/test-results/'
        ))
        or path == 'dashboard/data'
        or (path.startswith('pidex/state/') and path != 'pidex/state/.gitkeep')
    ):
        bad.append(path)
if bad:
    print('Forbidden package paths:', file=sys.stderr)
    for path in bad[:100]:
        print(path, file=sys.stderr)
    raise SystemExit(1)
print(f"pack ok: files={len(pkg.get('files', []))} unpacked={pkg.get('unpackedSize')}")
PY
ok "npm package contents clean"

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || true)
case "$CURRENT_BRANCH" in
  quarantine/*) fail "current branch is quarantine/*; do not publish this branch" ;;
esac
ok "current branch is not quarantine/*"

echo "Public readiness gate passed."
