#!/usr/bin/env bash
# PIDEX staged-file security scanner.
set -euo pipefail

MODE=""
QUIET="0"

usage() {
  cat <<'EOF'
Usage:
  security-scan.sh --staged [--quiet]

Exit codes:
  0  no blocking findings
  1  blocking findings found
  2  scanner error/misuse
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged)
      MODE="staged"
      shift
      ;;
    --quiet)
      QUIET="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'security-scan.sh: unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ "$MODE" != "staged" ]; then
  printf 'security-scan.sh: --staged is required\n' >&2
  usage >&2
  exit 2
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf 'security-scan.sh: current directory is not inside a Git repository\n' >&2
  exit 2
fi

FOUND=0

print_header() {
  if [ "$FOUND" -eq 0 ]; then
    if [ "$QUIET" != "1" ]; then
      echo ""
      echo "COMMIT BLOCKED: Possible secrets found"
      echo "================================================"
    fi
    FOUND=1
  fi
}

report() {
  local file="$1" reason="$2" detail="${3:-}"
  print_header
  if [ "$QUIET" = "1" ]; then
    return
  fi
  echo ""
  echo "  File: $file"
  echo "  Reason: $reason"
  if [ -n "$detail" ]; then
    echo "$detail" | head -3 | while IFS= read -r line; do
      echo "    $line"
    done
  fi
}

STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
[ -z "$STAGED" ] && exit 0

SKIP_CONTENT='(\.lock|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)|\.svg|\.png|\.jpg|\.jpeg|\.gif|\.ico|\.woff2?|\.ttf|\.eot|\.pdf|\.zip|\.tar|\.gz|\.wasm)$'

DANGEROUS_FILES='(^|/)(\.env(\.local|\.production|\.staging|\.development|\.test)?|\.netrc|\.npmrc|\.pypirc|htpasswd|shadow|\.docker/config\.json|auth\.json)$'
DANGEROUS_EXT='\.(pem|key|p12|pfx|jks|keystore|kubeconfig)$'
SSH_KEYS='(^|/)id_(rsa|dsa|ecdsa|ed25519)$'
TF_STATE='terraform\.tfstate(\.backup)?$'

while IFS= read -r FILE; do
  [ -z "$FILE" ] && continue
  if echo "$FILE" | grep -qE "$DANGEROUS_FILES"; then
    report "$FILE" "Dangerous credential file"
  elif echo "$FILE" | grep -qE "$DANGEROUS_EXT"; then
    report "$FILE" "Dangerous key/cert/keystore extension"
  elif echo "$FILE" | grep -qE "$SSH_KEYS"; then
    report "$FILE" "SSH private key"
  elif echo "$FILE" | grep -qE "$TF_STATE"; then
    report "$FILE" "Terraform state may contain sensitive infrastructure data"
  fi
done <<< "$STAGED"

STRUCTURAL_PATTERNS=(
  '(AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}'
  'amzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  'AIza[A-Za-z0-9_-]{35}'
  'AccountKey=[A-Za-z0-9/+=]{88}'
  '[sr]k_(live|test)_[a-zA-Z0-9]{24,99}'
  'whsec_[a-zA-Z0-9]{32,64}'
  'ghp_[A-Za-z0-9]{36}'
  'gho_[A-Za-z0-9]{36}'
  'ghs_[A-Za-z0-9]{36}'
  'ghr_[A-Za-z0-9]{76}'
  'github_pat_[A-Za-z0-9_]{82}'
  'glpat-[A-Za-z0-9_-]{20}'
  'glptt-[a-f0-9]{40}'
  'gldt-[A-Za-z0-9_-]{20}'
  'xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}'
  'xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[a-f0-9]{32}'
  'xapp-[0-9]-[A-Z0-9]{10,13}-[0-9]{13}-[a-f0-9]{64}'
  'hooks\.slack\.com/services/T[A-Z0-9]{8,10}/B[A-Z0-9]{8,10}/[A-Za-z0-9]{24}'
  '[0-9]{8,10}:[A-Za-z0-9_-]{35}'
  'discord(app)?\.com/api/webhooks/[0-9]{17,19}/[A-Za-z0-9_-]{68}'
  'sk-proj-[A-Za-z0-9_-]{48,}'
  'sk-ant-api03-[A-Za-z0-9_-]{93}'
  'SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}'
  'AC[a-f0-9]{32}'
  'do[prt]_v1_[a-f0-9]{64}'
  'shp(pa|ss|at)_[a-fA-F0-9]{32}'
  'npm_[A-Za-z0-9]{36}'
  'pypi-[A-Za-z0-9_-]{50,}'
  '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' # PIDEX_SECRET_PATTERN_LITERAL
  '-----BEGIN PGP PRIVATE KEY BLOCK-----' # PIDEX_SECRET_PATTERN_LITERAL
  'v1\.0-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
  'ya29\.[A-Za-z0-9_-]{20,}'
)

CONNSTRING_PATTERNS=(
  'postgres(ql)?://[^:]+:[^@]+@[^/[:space:]]+' # PIDEX_SECRET_PATTERN_LITERAL
  'mysql://[^:]+:[^@]+@[^/[:space:]]+' # PIDEX_SECRET_PATTERN_LITERAL
  'mongodb(\+srv)?://[^:]+:[^@]+@[^[:space:]"'"'"']+' # PIDEX_SECRET_PATTERN_LITERAL
  'redis://[^:]*:[^@]+@[^[:space:]]+' # PIDEX_SECRET_PATTERN_LITERAL
  'amqps?://[^:]+:[^@]+@[^[:space:]]+' # PIDEX_SECRET_PATTERN_LITERAL
)

KEYWORD_PATTERNS=(
  '(password|passwd|pwd)[[:space:]]*[=:][[:space:]]*["'"'"'][^"'"'"']{4,}["'"'"']'
  '(secret|api_?secret|client_?secret)[[:space:]]*[=:][[:space:]]*["'"'"'][^"'"'"']{8,}["'"'"']'
  '(api_?key|apikey|auth_?key|secret_?key)[[:space:]]*[=:][[:space:]]*["'"'"'][A-Za-z0-9_/+=.-]{16,}["'"'"']'
  '(access_?token|auth_?token)[[:space:]]*[=:][[:space:]]*["'"'"'][A-Za-z0-9_/+=.-]{20,}["'"'"']'
  'Authorization[[:space:]]*[=:][[:space:]]*["'"'"']?(Basic|Bearer)[[:space:]]+[A-Za-z0-9_/+=]{20,}'
)

ALLOWLIST='(\$\{|\$\(|\$[A-Z_]|environ|getenv|os\.env|process\.env|config\.|YOUR_|CHANGE_?ME|PLACEHOLDER|EXAMPLE|changeme|xxxxxxx|0{8,}|1{8,}|dummy|fake[_-]|test[_-]|sample|<YOUR|<%=|\{\{|\{%)'
PATTERN_COMMENT='^[[:space:]]*#.*([Pp]attern|[Ee]xample|[Rr]egex|PATTERN)'
LAYER4_SKIP='(\.(md|mdx)$|\.test\.(ts|tsx|js|jsx|py|rb|go|java|kt)$|\.spec\.(ts|tsx|js|jsx|py)$|(^|/)__tests__/|(^|/)tests?/fixtures?/)'

while IFS= read -r FILE; do
  [ -z "$FILE" ] && continue
  echo "$FILE" | grep -qE "$SKIP_CONTENT" && continue

  CONTENT=$(git show ":$FILE" 2>/dev/null || true)
  [ -z "$CONTENT" ] && continue

  for PATTERN in "${STRUCTURAL_PATTERNS[@]}"; do
    MATCHES=$(echo "$CONTENT" | grep -nE -- "$PATTERN" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      REAL=$(echo "$MATCHES" | grep -vE "$ALLOWLIST" | grep -vE "$PATTERN_COMMENT" | grep -vF "PIDEX_SECRET_PATTERN_LITERAL" || true)
      if [ -n "$REAL" ]; then
        report "$FILE" "Structural secret pattern" "$REAL"
      fi
    fi
  done

  for PATTERN in "${CONNSTRING_PATTERNS[@]}"; do
    MATCHES=$(echo "$CONTENT" | grep -nE -- "$PATTERN" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      REAL=$(echo "$MATCHES" | grep -vE "$ALLOWLIST" | grep -vF "PIDEX_SECRET_PATTERN_LITERAL" || true)
      if [ -n "$REAL" ]; then
        report "$FILE" "Connection string with credentials" "$REAL"
      fi
    fi
  done

  if ! echo "$FILE" | grep -qE "$LAYER4_SKIP"; then
    for PATTERN in "${KEYWORD_PATTERNS[@]}"; do
      MATCHES=$(echo "$CONTENT" | grep -niE -- "$PATTERN" 2>/dev/null || true)
      if [ -n "$MATCHES" ]; then
        REAL=$(echo "$MATCHES" | grep -vE "$ALLOWLIST" || true)
        if [ -n "$REAL" ]; then
          report "$FILE" "Keyword-based secret" "$REAL"
        fi
      fi
    done
  fi
done <<< "$STAGED"

if [ "$FOUND" -eq 1 ]; then
  if [ "$QUIET" != "1" ]; then
    echo ""
    echo "================================================"
    echo "If this is a false positive, remove or replace the staged value intentionally. Do not use --no-verify inside PIDEX."
    echo ""
  fi
  exit 1
fi

exit 0
