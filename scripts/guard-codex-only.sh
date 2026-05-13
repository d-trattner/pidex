#!/usr/bin/env bash
# Guard script for pidex Codex-only constraints.
# Scans selected core modules for forbidden provider/role references.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
EXIT_CODE=0

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) required for this guard." >&2
  exit 2
fi

TARGET_PATHS=(
  "$ROOT/config"
  "$ROOT/scripts/metrics"
  "$ROOT/scripts/pipeline"
  "$ROOT/scripts/provider-limits"
  "$ROOT/dashboard/scripts"
  "$ROOT/dashboard/public"
  "$ROOT/extensions/pidex"
)

ALLOW_PATHS=(
  "$ROOT/.git"
  "$ROOT/node_modules"
  "$ROOT/dashboard/node_modules"
  "$ROOT/dashboard/data"
)

# Optional allow patterns (exact text match on full line) for backward-compatible legacy notes.
ALLOW_LINE_PATTERNS=(
  # keep empty by default
)

print_help() {
  cat <<'EOF'
Usage:
  scripts/guard-codex-only.sh [--root <path>] [--allow-path <regex>] [--allow-line <regex>]

Defaults:
  root        = directory containing this script's parent (../)

Examples:
  ./scripts/guard-codex-only.sh
  ./scripts/guard-codex-only.sh --root <pidex-root>
  ./scripts/guard-codex-only.sh --allow-line "Legacy:.*running-pi" \
    --allow-line "Historical profile:"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT="${2:-}"
      if [[ -z "${ROOT}" ]]; then
        echo "ERROR: --root requires a value" >&2
        print_help
        exit 2
      fi
      ROOT="$(cd "$ROOT" && pwd -P)"
      shift 2
      ;;
    --allow-path)
      ALLOW_PATHS+=("$ROOT/$2")
      shift 2
      ;;
    --allow-line)
      ALLOW_LINE_PATTERNS+=("$2")
      shift 2
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "ERROR: unknown arg: $1" >&2
      print_help
      exit 2
      ;;
  esac
done

FORBIDDEN_PATTERNS=(
  # forbidden role/file prefix copied from running-pi
  '\brp-[a-z]'
  # old project names / paths
  'running-pi'
  'runningpi'
  # codex legacy model aliases that should not be default anymore
  'gpt-5\\.3-codex-spark'
  'gpt-5\\.4-mini'
  # forbidden providers
  '\bclaude\b'
  '\bgemini\b'
  '\bopenrouter\b'
)

file_allowed() {
  local path="$1"
  for allow in "${ALLOW_PATHS[@]}"; do
    if [[ "$path" == "$allow" || "$path" == "$allow"/* ]]; then
      return 0
    fi
  done
  return 1
}

line_allowed() {
  local line="$1"
  for allow in "${ALLOW_LINE_PATTERNS[@]}"; do
    if [[ -n "$allow" ]] && [[ "$line" =~ $allow ]]; then
      return 0
    fi
  done
  return 1
}

collect_targets() {
  local files=()
  for path in "${TARGET_PATHS[@]}"; do
    if [[ -d "$path" ]]; then
      while IFS= read -r f; do
        files+=("$f")
      done < <(rg --files "$path")
    elif [[ -f "$path" ]]; then
      files+=("$path")
    fi
  done

  # explicit root-level config entries likely to define provider/model behavior
  for f in "$ROOT/config/agents.json" "$ROOT/config/package.json" "$ROOT/package.json"; do
    [[ -f "$f" ]] && files+=("$f")
  done

  printf '%s\n' "${files[@]}"
}

findings=0

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if file_allowed "$file"; then
    continue
  fi
  for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      if [[ "$line" =~ :[0-9]+: ]]; then
        line_no="${line%%:*}"
        line_text="${line#*:*:}"
      else
        continue
      fi
      line_text_lc="${line_text,,}"
      pattern_lc="${pattern,,}"
      if [[ "$line_text_lc" =~ $pattern_lc ]]; then
        if line_allowed "$line_text"; then
          continue
        fi
        echo "FORBID: $file:$line"
        findings=$((findings + 1))
        EXIT_CODE=1
      fi
    done < <(rg -n --pcre2 -e "$pattern" "$file" 2>/dev/null || true)
  done

done < <(collect_targets)

if (( findings > 0 )); then
  echo ""
  echo "Guard failed: found $findings forbidden pattern(s). Allowed files/lines are respected via --allow-path/--allow-line." >&2
  echo "Allowed checks: rg patterns (rp-, runningpi, running-pi, gpt-5.3-codex-spark, gpt-5.4-mini, claude, gemini, openrouter)." >&2
  echo "Exit with non-zero." >&2
  exit 1
fi

echo "Codex-only guard: OK (no forbidden provider/role references in scanned core modules)."
exit 0
