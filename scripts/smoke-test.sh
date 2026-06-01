#!/usr/bin/env bash
# pidex smoke checks (no external LLM calls).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd -P)
TMP=${TMPDIR:-/tmp}/pidex-smoke-$$
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

echo ">> bash syntax checks"
find "$ROOT/scripts" -type f -name '*.sh' -print0 | xargs -0 -n1 bash -n
bash -n "$ROOT/install.sh"
bash -n "$ROOT/dashboard/start.sh"

if command -v jq >/dev/null 2>&1; then
  jq empty "$ROOT/config/agents.json"
fi

if command -v npm >/dev/null 2>&1; then
  (cd "$ROOT" && npm run check)
else
  echo "WARN: npm not found; skipping npm run check"
fi

if command -v pi >/dev/null 2>&1; then
  pi -e "$ROOT" --list-models __pidex_smoke_probe__ >/tmp/pidex-smoke-pi.out 2>/tmp/pidex-smoke-pi.err || true
fi

printf 'smoke prompt' > "$TMP/prompt.md"
export OUTPUT_FILE="$TMP/delegate-out.md"
export PROMPT_FILE="$TMP/prompt.md"
if command -v codex >/dev/null 2>&1; then
  (cd "$ROOT/scripts" && codex --version >/dev/null 2>&1) || true
  :
else
  echo "WARN: codex binary missing; delegate runtime smoke skipped"
fi
bash "$ROOT/scripts/delegate/check-auth.sh"
node "$ROOT/scripts/modules/run-check.mjs" --capability provider-governance.profile-current --agent pidex-devops --phase maintenance --project "$ROOT"
node "$ROOT/scripts/modules/run-check.mjs" --capability provider-governance.profile-recommend --agent pidex-devops --phase maintenance --project "$ROOT"

echo 'smoke metric' > "$TMP/pipeline-record.txt"
PLAN_SMOKE="plan-000"
SMOKE_PROJECT="$TMP/project-smoke"
mkdir -p "$SMOKE_PROJECT"
RUNNING_PI_STATE_DIR="$TMP/state" node "$ROOT/scripts/modules/run-check.mjs" --capability analysis-metrics-history.metrics-record --agent pidex-devops --phase maintenance --project "$SMOKE_PROJECT" -- \
  --project "$SMOKE_PROJECT" \
  --plan "$PLAN_SMOKE" \
  --agent pidex-smoke \
  --provider codex \
  --model gpt-5.3-codex \
  --input-tokens 10 \
  --output-tokens 4 \
  --duration-ms 111 \
  --exit 0 \
  --source smoke >/dev/null
RUNNING_PI_STATE_DIR="$TMP/state" node "$ROOT/scripts/modules/run-check.mjs" --capability analysis-metrics-history.metrics-summarize --agent pidex-devops --phase maintenance --project "$SMOKE_PROJECT" -- "$PLAN_SMOKE" --project "$SMOKE_PROJECT" | grep -q 'pidex-smoke'

node --no-warnings scripts/dashboard/ingest.tdd.test.mjs

printf 'OK\n'
