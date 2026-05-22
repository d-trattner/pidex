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
- no high-confidence secret tokens or local operator path leaks in tracked text
- public default configs do not include local balances or enabled optional secondary lanes
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
import json
import pathlib
import re
import subprocess
import sys

paths = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
bad = []
for path in paths:
    parts = pathlib.PurePosixPath(path).parts
    if path == 'pidex/state/.gitkeep':
        continue
    if (
        'agents.output' in parts
        or 'logs' in parts
        or 'node_modules' in parts
        or '__pycache__' in parts
        or '.playwright' in parts
        or '.fallow' in parts
        or 'test-results' in parts
        or (('state' in parts) and path != 'pidex/state/.gitkeep')
        or path == 'dashboard/data'
        or '/.env' in path or path.startswith('.env')
        or path == 'config.env' or path.startswith('secrets/') or 'secrets' in parts
        or path.endswith(('.db', '.sqlite', '.sqlite3', '.pem', '.key', '.crt', '.p12', '.pfx', '.jks', '.keystore', '.kubeconfig', '.pid'))
    ):
        bad.append(path)
if bad:
    print('\n'.join(sorted(set(bad))), file=sys.stderr)
    raise SystemExit(1)

# Structural secret scan over tracked text files. Keep this focused on high-confidence
# token formats so public release checks do not fail on documentation examples.
skip_suffixes = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.woff', '.woff2', '.ttf', '.ico', '.lock', '.svg'}
allow_files = {
    'scripts/git-hooks/lib/security-scan.sh',
    'scripts/doctor.sh',
    'scripts/wiki/hygiene.py',
}
patterns = [
    ('AWS key', re.compile(r'\b(AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b')),
    ('Google API key', re.compile(r'AIza[A-Za-z0-9_-]{35}')),
    ('GitHub token', re.compile(r'\b(ghp|gho|ghs)_[A-Za-z0-9]{36}\b|github_pat_[A-Za-z0-9_]{82}')),
    ('OpenAI key', re.compile(r'\bsk-(proj-)?[A-Za-z0-9_-]{40,}\b')),
    ('Anthropic key', re.compile(r'sk-ant-api03-[A-Za-z0-9_-]{80,}')),
    ('Slack token/webhook', re.compile(r'xox[baprs]-[0-9A-Za-z-]{20,}|hooks\.slack\.com/services/[A-Za-z0-9/]{30,}')),
    ('Telegram bot token', re.compile(r'\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b')),
    ('Private key', re.compile(r'-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----')),
    ('Credentialed URL', re.compile(r'\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?)://[^\s:@]+:[^\s@]+@')),
]
findings = []
for path in paths:
    if path in allow_files:
        continue
    if pathlib.PurePosixPath(path).suffix in skip_suffixes:
        continue
    try:
        text = pathlib.Path(path).read_text(encoding='utf-8')
    except Exception:
        continue
    for label, pattern in patterns:
        for match in pattern.finditer(text):
            line = text.count('\n', 0, match.start()) + 1
            findings.append(f'{path}:{line}: {label}')
if findings:
    print('High-confidence secret-like values found:', file=sys.stderr)
    print('\n'.join(findings[:100]), file=sys.stderr)
    raise SystemExit(1)

# Local operator paths/IPs are useful in private artifacts but should not ship in public docs/rules.
local_leak_patterns = [
    ('operator home path', re.compile(r'/home/daniel')),
    ('specific private LAN address', re.compile(r'\b10\.0\.0\.[0-9]+\b')),
]
local_findings = []
for path in paths:
    if path == 'scripts/release/public-readiness.sh':
        continue
    if pathlib.PurePosixPath(path).suffix in skip_suffixes:
        continue
    try:
        text = pathlib.Path(path).read_text(encoding='utf-8')
    except Exception:
        continue
    for label, pattern in local_leak_patterns:
        for match in pattern.finditer(text):
            line = text.count('\n', 0, match.start()) + 1
            local_findings.append(f'{path}:{line}: {label}')
if local_findings:
    print('Local operator path/address leaks found:', file=sys.stderr)
    print('\n'.join(local_findings[:100]), file=sys.stderr)
    raise SystemExit(1)

# Local balance snapshots are useful operational state but should not be published.
balance_path = pathlib.Path('config/balance.json')
if balance_path.exists():
    data = json.loads(balance_path.read_text(encoding='utf-8'))
    snapshots = [s for provider in data.get('providers', []) for s in provider.get('snapshots', [])]
    if snapshots:
        print('config/balance.json contains local balance snapshots', file=sys.stderr)
        raise SystemExit(1)
PY
ok "no forbidden tracked runtime/private files or high-confidence secrets"

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

python3 - <<'PY'
import json
import sys
from pathlib import Path

path = Path('config/parallel-agents.json')
if path.exists():
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('enabled') is not False:
        print('config/parallel-agents.json must be disabled by default for public release', file=sys.stderr)
        raise SystemExit(1)
    for name, cfg in (data.get('agents') or {}).items():
        if cfg.get('enabled') is not False:
            print(f'parallel agent {name} must be disabled by default for public release', file=sys.stderr)
            raise SystemExit(1)
        for lane in cfg.get('provider_models') or []:
            if lane.get('enabled') is not False:
                print(f'parallel lane {name}:{lane.get("provider")}:{lane.get("model")} must be disabled by default', file=sys.stderr)
                raise SystemExit(1)
PY
ok "public default optional parallel agents are disabled"

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
