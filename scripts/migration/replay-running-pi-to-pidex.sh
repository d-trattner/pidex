#!/usr/bin/env bash
# Deterministic one-shot helpers for pidex bootstrap/migration.
# Modes:
#   baseline — run source inventory scan and write analysis/scope-baseline.md
#   sync    — copy/normalize selected running-pi assets into pidex
#
# This tool is intentionally conservative and idempotent for repeated runs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
MODE=""
SOURCE="${RUNNING_PI_SOURCE:-$HOME/running-pi}"
TARGET="${RUNNING_PI_TARGET:-$ROOT}"
REPORT="${RUNNING_PI_SCOPE_REPORT:-$TARGET/analysis/scope-baseline.md}"
DRY_RUN=0
FORCE=0

usage() {
  cat <<'EOF'
Usage:
  scripts/migration/replay-running-pi-to-pidex.sh baseline [--source DIR] [--target DIR] [--report FILE]
  scripts/migration/replay-running-pi-to-pidex.sh sync [--source DIR] [--target DIR] [--dry-run] [--force]

Modes:
  baseline   capture legacy scan into analysis/scope-baseline.md
  sync       deterministic copy + rp-/running-pi normalization from running-pi into pidex

Environment:
  RUNNING_PI_SOURCE, RUNNING_PI_TARGET, RUNNING_PI_SCOPE_REPORT
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    baseline|sync)
      MODE="$1"
      shift
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    --report)
      REPORT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown arg '$1'" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  echo "ERROR: mode is required (baseline|sync)" >&2
  usage
  exit 2
fi

if [[ ! -d "$SOURCE" ]]; then
  echo "ERROR: source missing: $SOURCE" >&2
  exit 2
fi
if [[ ! -d "$TARGET" ]]; then
  echo "ERROR: target missing: $TARGET" >&2
  exit 2
fi

normalize_path() {
  local rel="$1"
  rel="${rel//runningpi/pidex}"
  rel="${rel//running-pi/pidex}"
  rel="${rel//rp-/pidex-}"
  rel="${rel//rp_agent/pidex_agent}"
  rel="${rel//running-pi-instructions/pidex-instructions}"
  rel="${rel//~\/\.claude\/runningpi/~/.claude/pidex}"
  rel="${rel//~\/\.claude\/running-pi/~/.claude/pidex}"
  rel="${rel//\/runningpi\//\/pidex\/}"
  printf '%s' "$rel"
}

normalize_content() {
  python3 - "$1" "$2" <<'PY'
from pathlib import Path
import sys
src, dst = sys.argv[1], sys.argv[2]
text = Path(src).read_text(encoding='utf-8')
replacements = [
    ('running-pi', 'pidex'),
    ('runningpi', 'pidex'),
    ('rp-', 'pidex-'),
    ('rp_agent', 'pidex_agent'),
    ('running-pi-instructions', 'pidex-instructions'),
    ('/runningpi/', '/pidex/'),
    ('~/running-pi', '~/pidex'),
    ('~/runningpi', '~/pidex'),
    ('https://running-pi.dev', 'https://pidex.dev'),
]
for old, new in replacements:
    text = text.replace(old, new)
Path(dst).write_text(text, encoding='utf-8')
PY
}

copy_text_file() {
  local src="$1" dst="$2"
  local dst_dir
  dst_dir=$(dirname "$dst")
  mkdir -p "$dst_dir"

  local do_copy=1
  if [[ -e "$dst" && "$FORCE" -eq 0 ]]; then
    do_copy=0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    if [[ "$do_copy" -eq 1 ]]; then
      echo "[dry-run] copy/text   $src -> $dst"
    else
      echo "[dry-run] keep       $dst"
    fi
    return 0
  fi

  if [[ "$do_copy" -eq 0 ]]; then
    return 0
  fi

  # Avoid rewriting binaries in a text replacement pipeline.
  if file -b --mime-type "$src" | grep -q '^text/\|application/json\|application/x-\(json\|python\|shellscript\)'; then
    normalize_content "$src" "$dst"
  else
    cp -f "$src" "$dst"
  fi
}

copy_tree_normalized() {
  local src_dir="$1" dst_dir="$2"
  if [[ ! -d "$src_dir" ]]; then
    return 0
  fi

  local src_prefix
  src_prefix="$(cd "$src_dir" && pwd -P)"

  while IFS= read -r -d '' src_file; do
    local rel
    rel="${src_file#$src_prefix/}"
    local norm_rel
    norm_rel="$(normalize_path "$rel")"
    local dst_file="$dst_dir/$norm_rel"
    copy_text_file "$src_file" "$dst_file"
  done < <(find "$src_dir" -type f -print0)
}

copy_legacy_tree() {
  local rel_src="$1" rel_dst="$2"
  copy_tree_normalized "$SOURCE/$rel_src" "$TARGET/$rel_dst"
}

run_baseline_scan() {
  mkdir -p "$(dirname "$REPORT")"

  local tmp
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' RETURN

  {
    echo "# PIDEX baseline scan"
    echo "source: $SOURCE"
    echo "target: $TARGET"
    echo "timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
    echo "## Scope commands run"
    echo
    echo '```bash'
    echo "rg -n \"rp-|runningpi|running-pi|spark|claude|gemini|openrouter\" $SOURCE"
    echo "find $SOURCE -maxdepth 2 -type d -name '.git'"
    echo 'rg -n "\brp-[a-z]|gpt-5\\.3-codex-spark|gpt-5\\.4-mini|provider:\\s*\"(claude|gemini)\"" '$SOURCE
    echo '```'
    echo

    echo "## legacy-pattern scan"
    for pattern in 'rp-' 'runningpi' 'running-pi' 'spark' 'claude' 'gemini' 'openrouter'; do
      echo
      echo "### rg pattern: $pattern"
      if rg -n "$pattern" "$SOURCE" > "$tmp"; then
        echo "count: $(wc -l < "$tmp")"
        cat "$tmp"
      else
        echo "count: 0"
      fi
    done

    echo "\n## stateful path inventory (maxdepth 2 .git dirs)"
    if find "$SOURCE" -maxdepth 2 -type d -name '.git' > "$tmp"; then
      if [[ -s "$tmp" ]]; then
        cat "$tmp"
      else
        echo "none"
      fi
    else
      echo "find failed"
    fi

    echo
    echo "## rp/provider scans in source"
    if rg -n '\\brp-[a-z]|gpt-5\\.3-codex-spark|gpt-5\\.4-mini|provider:\\s*\"(claude|gemini)\"' "$SOURCE" > "$tmp"; then
      echo "matches: $(wc -l < "$tmp")"
      cat "$tmp"
    else
      echo "matches: 0"
    fi

    echo
    echo "## Baseline notes"
    echo
    echo "- This report is generated for migration planning."
    echo "- Historically noisy matches are expected in policy/docs/examples where explicit legacy behavior is documented."
    echo "- Idempotent migration copy should skip/rewrite known legacy namespaces in pidex target runtime files only."
  } > "$REPORT"

  echo "Scope baseline written to $REPORT"
}

run_sync() {
  echo "Running pidex sync from $SOURCE -> $TARGET"

  # Core role assets
  mkdir -p "$TARGET/agents" "$TARGET/rules" "$TARGET/skills" "$TARGET/extensions" "$TARGET/templates"

  # agents: rp-*.md -> pidex-*.md with text normalization
  if [[ -d "$SOURCE/agents" ]]; then
    while IFS= read -r -d '' src_file; do
      src_base=$(basename "$src_file")
      dst_base=$(normalize_path "$src_base")
      copy_text_file "$src_file" "$TARGET/agents/$dst_base"
    done < <(find "$SOURCE/agents" -maxdepth 1 -type f -name 'rp-*.md' -print0)
  fi

  # rules: rp-<agent>/* -> rules/pidex-<agent>/*
  if [[ -d "$SOURCE/rules" ]]; then
    while IFS= read -r -d '' rule_dir; do
      rule_base=$(basename "$rule_dir")
      dst_rule_dir="$TARGET/rules/$(normalize_path "$rule_base")"
      copy_tree_normalized "$rule_dir" "$dst_rule_dir"
    done < <(find "$SOURCE/rules" -maxdepth 1 -type d -name 'rp-*' -print0)
  fi

  # selected first-class source trees
  copy_legacy_tree "extensions/running-pi" "extensions/pidex"
  copy_legacy_tree "skills/runningpi" "skills/pidex"
  copy_legacy_tree "dashboard" "dashboard"
  copy_legacy_tree "scripts/delegate" "scripts/delegate"
  copy_legacy_tree "scripts/metrics" "scripts/metrics"
  copy_legacy_tree "scripts/pipeline" "scripts/pipeline"
  copy_legacy_tree "scripts/provider-limits" "scripts/provider-limits"

  # keep lightweight bootstrap files synchronized only when missing unless --force
  copy_text_file "$SOURCE/install.sh" "$TARGET/install.sh"
  copy_text_file "$SOURCE/README.md" "$TARGET/README.md"
  copy_text_file "$SOURCE/NOTICE" "$TARGET/NOTICE"
  copy_text_file "$SOURCE/LICENSE" "$TARGET/LICENSE"
  copy_text_file "$SOURCE/package.json" "$TARGET/package.json"
  copy_text_file "$SOURCE/config/agents.json" "$TARGET/config/agents.json"
  copy_text_file "$SOURCE/config/agents.template.json" "$TARGET/config/agents.template.json"
  copy_text_file "$SOURCE/config/profile" "$TARGET/config/profile" 2>/dev/null || true
  copy_tree_normalized "$SOURCE/config/profiles" "$TARGET/config/profiles"
  copy_tree_normalized "$SOURCE/templates" "$TARGET/templates"

  echo "pidex sync complete (dry-run=$DRY_RUN, force=$FORCE)"
}

if [[ "$MODE" == "baseline" ]]; then
  run_baseline_scan
  exit 0
fi

run_sync
