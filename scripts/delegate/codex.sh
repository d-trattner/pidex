#!/usr/bin/env bash
# pidex — Codex CLI delegate
#
# Simplified adaption of forge.ng's codex.sh for the pidex-* pipeline.
# Invoked by dispatch.sh after prompt has been assembled + templated.
#
# Input env vars:
#   PROMPT_FILE — path to fully-assembled prompt (stdin-redirected into codex)
#   OUTPUT_FILE — path where codex writes the result (via -o flag)
#   MODEL       — codex model (default: gpt-5.3-codex)
#   EFFORT      — optional reasoning effort: low, medium, high, xhigh
#
# Exit codes:
#   0  success, OUTPUT_FILE has content
#   1  auth error (no ~/.codex/auth.json tokens + no OPENAI_API_KEY)
#   2  codex exec failed (non-zero exit)
#   3  empty output
#
# Usage:
#   PROMPT_FILE=/tmp/p.md OUTPUT_FILE=/tmp/out.md MODEL=gpt-5.3-codex \
#     bash <pidex-root>/scripts/delegate/codex.sh

set -euo pipefail

: "${PROMPT_FILE:?PROMPT_FILE is required}"
: "${OUTPUT_FILE:?OUTPUT_FILE is required}"
MODEL="${MODEL:-gpt-5.3-codex}"
EFFORT="${EFFORT:-}"

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: Codex CLI not found: codex" >&2
  exit 1
fi

# Auth check — mirrors forge.ng runners.service.ts
if [ -z "${OPENAI_API_KEY:-}" ]; then
  AUTH_FILE="$HOME/.codex/auth.json"
  if [ ! -f "$AUTH_FILE" ]; then
    echo "ERROR: Codex not authenticated — no OPENAI_API_KEY + no $AUTH_FILE" >&2
    exit 1
  fi
  AUTH_OK=$(python3 -c "
import json, sys
try:
    a = json.load(open(sys.argv[1]))
    sys.exit(0 if a.get('tokens') or a.get('OPENAI_API_KEY') else 1)
except Exception:
    sys.exit(1)
" "$AUTH_FILE" 2>/dev/null && echo 1 || echo 0)
  if [ "$AUTH_OK" = "0" ]; then
    echo "ERROR: ~/.codex/auth.json has no tokens — run 'codex login'" >&2
    exit 1
  fi
fi

# Run codex exec in non-interactive mode with output-file capture.
# --full-auto: workspace-write sandbox (won't touch files outside cwd)
# --ephemeral: no session persistence
# -o FILE:    write final assistant output to FILE
# --json:     JSONL event stream on stdout (ignored here — we read OUTPUT_FILE)
#
# Prompt via stdin to avoid ARG_MAX on large diffs.
CODEX_REASONING_EFFORT=""
if [ -n "$EFFORT" ]; then
  case "$EFFORT" in
    xhigh)
      CODEX_REASONING_EFFORT="high"
      ;;
    low|medium|high)
      CODEX_REASONING_EFFORT="$EFFORT"
      ;;
    *)
      echo "ERROR: invalid Codex effort '$EFFORT' (expected low|medium|high|xhigh)" >&2
      exit 2
      ;;
  esac
fi

CODEX_ARGS=(
  --full-auto
  --ephemeral
  -m "$MODEL"
  -o "$OUTPUT_FILE"
  --json
)

if [ -n "$CODEX_REASONING_EFFORT" ]; then
  CODEX_ARGS+=(--config "reasoning_effort=$CODEX_REASONING_EFFORT")
fi

CODEX_EXIT=0
codex exec "${CODEX_ARGS[@]}" < "$PROMPT_FILE" > /dev/null 2>&1 || CODEX_EXIT=$?

if [ "$CODEX_EXIT" -ne 0 ]; then
  echo "ERROR: codex exec failed with exit $CODEX_EXIT" >&2
  exit 2
fi

if [ ! -s "$OUTPUT_FILE" ]; then
  echo "ERROR: codex produced empty output at $OUTPUT_FILE" >&2
  exit 3
fi

exit 0
