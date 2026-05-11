#!/usr/bin/env bash
# Summarize Running Pi metrics for a plan.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
STATE_DIR="${RUNNING_PI_STATE_DIR:-$ROOT/state}"
PROJECT_FILTER=""
PLAN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT_FILTER="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 <plan-id> [--project PROJECT]"
      echo "       $0 --plan <plan-id> [--project PROJECT]"
      exit 0 ;;
    *)
      if [ -z "$PLAN" ]; then PLAN="$1"; shift; else echo "Unknown arg: $1" >&2; exit 2; fi ;;
  esac
done

: "${PLAN:?plan id required}"

python3 - "$STATE_DIR" "$PLAN" "$PROJECT_FILTER" <<'PY'
import glob, json, os, re, sys
state_dir, plan, project_filter = sys.argv[1:4]

def slug(value):
    value = re.sub(r'[^a-zA-Z0-9._-]+', '-', value).strip('-')
    return (value or 'unknown')[:80]

plan_slug = slug(plan)
base = os.path.join(state_dir, 'metrics')
if project_filter:
    files = [os.path.join(base, slug(project_filter), f'{plan_slug}.jsonl')]
else:
    files = glob.glob(os.path.join(base, '*', f'{plan_slug}.jsonl'))

records = []
for path in files:
    if not os.path.exists(path):
        continue
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                rec['_file'] = path
                records.append(rec)
            except Exception:
                pass

if not records:
    print(f'No metrics found for {plan_slug}')
    sys.exit(0)

print(f'# Running Pi metrics — {plan_slug}')
print('')
print('| Agent | Verdict | Route To | Gate | Provider | Model | Exit | Duration | Input tok | Output tok | Cost | Fallback | Context file |')
print('|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|')
total_cost = 0.0
has_cost = False
total_in = total_out = total_duration = 0
for r in records:
    cost = r.get('cost_usd_estimate')
    if isinstance(cost, (int, float)):
        total_cost += cost
        has_cost = True
        cost_str = f'${cost:.4f}'
    else:
        cost_str = 'n/a'
    duration = int(r.get('duration_ms') or 0)
    in_tok = int(r.get('input_tokens_estimate') or 0)
    out_tok = int(r.get('output_tokens_estimate') or 0)
    total_duration += duration
    total_in += in_tok
    total_out += out_tok
    context = r.get('context_file') or ''
    print(f"| {r.get('agent') or ''} | {r.get('agent_verdict') or ''} | {r.get('route_to') or ''} | {r.get('gate') or ''} | {r.get('provider') or ''} | {r.get('model') or ''} | {r.get('exit_code') if r.get('exit_code') is not None else ''} | {duration/1000:.1f}s | {in_tok} | {out_tok} | {cost_str} | {r.get('fallback_from') or ''} | {context} |")
print('')
print(f'- Total duration: {total_duration/1000:.1f}s')
print(f'- Total estimated tokens: input {total_in}, output {total_out}')
verdicts = {}
routes = {}
for r in records:
    verdict = r.get('agent_verdict') or 'unknown'
    route = r.get('route_to') or 'unknown'
    verdicts[verdict] = verdicts.get(verdict, 0) + 1
    routes[route] = routes.get(route, 0) + 1
print('- Verdict counts: ' + ', '.join(f'{k}={v}' for k, v in sorted(verdicts.items())))
print('- Route counts: ' + ', '.join(f'{k}={v}' for k, v in sorted(routes.items())))
if has_cost:
    print(f'- Total estimated cost: ${total_cost:.4f}')
else:
    print('- Total estimated cost: n/a')
print('')
print('Metric files:')
for path in sorted({r['_file'] for r in records}):
    print(f'- {path}')
PY
