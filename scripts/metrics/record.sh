#!/usr/bin/env bash
# Append one Running Pi agent metric record as JSONL.
# No prompts, task text, secrets, or model credentials are recorded.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
STATE_DIR="${RUNNING_PI_STATE_DIR:-$ROOT/state}"
PRICING_FILE="${RUNNING_PI_PRICING_FILE:-$ROOT/config/pricing.json}"

PROJECT="unknown"
PLAN="unknown-plan"
AGENT="unknown"
PROVIDER="unknown"
MODEL=""
INPUT_TOKENS="0"
OUTPUT_TOKENS="0"
DURATION_MS="0"
EXIT_CODE="0"
SOURCE="manual"
FALLBACK_FROM=""
LOG_FILE=""
FINAL_TEXT_CHARS="0"

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    --agent) AGENT="$2"; shift 2 ;;
    --provider) PROVIDER="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --input-tokens) INPUT_TOKENS="$2"; shift 2 ;;
    --output-tokens) OUTPUT_TOKENS="$2"; shift 2 ;;
    --duration-ms) DURATION_MS="$2"; shift 2 ;;
    --exit|--exit-code) EXIT_CODE="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --fallback-from) FALLBACK_FROM="$2"; shift 2 ;;
    --log-file) LOG_FILE="$2"; shift 2 ;;
    --final-text-chars) FINAL_TEXT_CHARS="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

python3 - "$STATE_DIR" "$PRICING_FILE" "$PROJECT" "$PLAN" "$AGENT" "$PROVIDER" "$MODEL" "$INPUT_TOKENS" "$OUTPUT_TOKENS" "$DURATION_MS" "$EXIT_CODE" "$SOURCE" "$FALLBACK_FROM" "$LOG_FILE" "$FINAL_TEXT_CHARS" <<'PY'
import json, os, re, sys, datetime
state_dir, pricing_file = sys.argv[1], sys.argv[2]
(project, plan, agent, provider, model, input_tokens, output_tokens, duration_ms,
 exit_code, source, fallback_from, log_file, final_text_chars) = sys.argv[3:16]

def slug(value):
    value = re.sub(r'[^a-zA-Z0-9._-]+', '-', value).strip('-')
    return (value or 'unknown')[:80]

def as_int(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return default

in_tok = as_int(input_tokens)
out_tok = as_int(output_tokens)
pricing = {}
try:
    with open(pricing_file, 'r', encoding='utf-8') as f:
        pricing = json.load(f)
except Exception:
    pass
normalized_model = model.strip()
if normalized_model.startswith('-m '):
    normalized_model = normalized_model[3:].strip()
if normalized_model.startswith('--model '):
    normalized_model = normalized_model[8:].strip()
aliases = {'opus': 'claude-opus', 'sonnet': 'claude-sonnet', 'haiku': 'claude-haiku'}
price = pricing.get(normalized_model) or pricing.get(aliases.get(normalized_model, normalized_model))
cost = None
if price:
    cost = (in_tok / 1_000_000) * float(price.get('input', 0)) + (out_tok / 1_000_000) * float(price.get('output', 0))
record = {
    'timestamp': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'project': project,
    'plan': plan,
    'agent': agent,
    'provider': provider,
    'model': normalized_model or None,
    'duration_ms': as_int(duration_ms),
    'exit_code': as_int(exit_code),
    'fallback_from': fallback_from or None,
    'input_tokens_estimate': in_tok,
    'output_tokens_estimate': out_tok,
    'cost_usd_estimate': cost,
    'final_text_chars': as_int(final_text_chars),
    'log_file': log_file or None,
    'source': source,
}
out_dir = os.path.join(state_dir, 'metrics', slug(project))
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, f'{slug(plan)}.jsonl')
with open(out_path, 'a', encoding='utf-8') as f:
    f.write(json.dumps(record, separators=(',', ':')) + '\n')
print(out_path)
PY
