#!/usr/bin/env bash
# pidex: advisory pipeline analysis stub for completed runs.
# Usage:
#   modules/pidex/analysis-metrics-history/scripts/analysis/run-pipeline-analysis.sh --project /path/to/project --plan plan-123 [--out /path/out.md]
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../../../../.." && pwd -P)
PROJECT=""
PLAN=""
OUT=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      echo "Usage: $0 --project /path/to/project --plan plan-xxx [--out file] [--dry-run]"
      exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

: "${PROJECT:?missing --project}"
: "${PLAN:?missing --plan}"
[ -d "$PROJECT" ] || { echo "project not found: $PROJECT" >&2; exit 2; }

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SLUG_DIR="$(printf '%s' "$PLAN" | tr '/' '-')"
ART_DIR="$PROJECT/analysis/$STAMP-$SLUG_DIR"
mkdir -p "$ART_DIR"
PROMPT="$ART_DIR/$PLAN-pipeline-analysis.prompt.md"
OUT_FILE="${OUT:-$ART_DIR/$PLAN-pipeline-analysis.md}"

cat > "$PROMPT" <<EOF
# Plan analysis prompt

Project: $PROJECT
Plan: $PLAN

Use this analysis file to review:
- routing/completion path
- gate outcomes
- repeated loops
- quality evidence
- practical follow-up candidates
EOF

if [ "$DRY_RUN" -eq 1 ]; then
  cat "$PROMPT"
  exit 0
fi

cat > "$OUT_FILE" <<'EOF'
# Pipeline Analysis

## Executive Summary
- Not run automatically by smoke.

## Pipeline Health Verdict
- Verdict: UNKNOWN
- Confidence: low

## What Went Well
- Noted by future analysts.

## Friction / Waste
- Identify avoidable loops / missing gate value.

## Follow-up Recommendation
- none

EOF

cat >> "$OUT_FILE" <<EOF
<!-- ROUTING
verdict: COMPLETE
route_to: pidex-pi
reason: Placeholder analysis scaffold created for pidex.
context_file: $OUT_FILE
-->
EOF

printf '%s\n' "$OUT_FILE"
