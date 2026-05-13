#!/usr/bin/env bash
# Append one Running Pi pipeline lifecycle event as JSONL for analytics.
# This is analytics-only: no backend scheduler/state machine is driven by these events.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd -P)
STATE_DIR="${RUNNING_PI_STATE_DIR:-$ROOT/state}"

PROJECT=""
PROJECT_SLUG=""
PIPELINE_ID="${RUNNING_PI_PIPELINE_ID:-}"
PLAN="unknown-plan"
EVENT=""
STATUS=""
ACTOR="orchestrator"
MESSAGE=""
SOURCE="manual"
METADATA_JSON=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --project-slug|--slug) PROJECT_SLUG="$2"; shift 2 ;;
    --pipeline-id) PIPELINE_ID="$2"; shift 2 ;;
    --plan) PLAN="$2"; shift 2 ;;
    --event|--event-type) EVENT="$2"; shift 2 ;;
    --status) STATUS="$2"; shift 2 ;;
    --actor) ACTOR="$2"; shift 2 ;;
    --message) MESSAGE="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --metadata-json) METADATA_JSON="$2"; shift 2 ;;
    -h|--help)
      cat <<'EOF'
Usage: event.sh --plan PLAN --event EVENT [options]

Analytics-only Running Pi pipeline lifecycle event writer.

Options:
  --project PATH          Project path. Defaults to current directory.
  --project-slug SLUG     Display slug. Defaults to basename(project path).
  --pipeline-id ID        Pipeline id. Defaults to RUNNING_PI_PIPELINE_ID or an active id for project+plan.
  --plan PLAN             Plan key, e.g. plan-030.
  --event EVENT           Event type, e.g. pipeline_started, pipeline_stage_completed.
  --status STATUS         running, waiting, blocked, completed, failed, aborted.
  --actor ACTOR           orchestrator, lead, pidex-planner, etc. Defaults to orchestrator.
  --message TEXT          Short human-readable note.
  --source SOURCE         Source label. Defaults to manual.
  --metadata-json JSON    Optional JSON object with extra analytics fields.

For pipeline_started without --pipeline-id, a new id is generated and stored as
current for project+plan. Later events reuse it until a terminal event removes it.
EOF
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$PROJECT" ]; then
  PROJECT=$(pwd -P)
fi
if [ -z "$EVENT" ]; then
  echo "Missing required --event" >&2
  exit 2
fi

python3 - "$ROOT" "$STATE_DIR" "$PROJECT" "$PROJECT_SLUG" "$PIPELINE_ID" "$PLAN" "$EVENT" "$STATUS" "$ACTOR" "$MESSAGE" "$SOURCE" "$METADATA_JSON" <<'PY'
import datetime, json, os, re, subprocess, sys
from pathlib import Path

(root, state_dir, project, project_slug, pipeline_id, plan, event, status, actor, message, source, metadata_json) = sys.argv[1:13]

def slug(value: str) -> str:
    value = re.sub(r'[^a-zA-Z0-9._-]+', '-', value).strip('-')
    return (value or 'unknown')[:80]

project_path = str(Path(project).expanduser().resolve())
project_slug = project_slug or Path(project_path).name or slug(project_path)
project_slug_safe = slug(project_slug)
plan = plan or 'unknown-plan'

def normalize_plan(value: str) -> str:
    value = value.strip()
    m = re.fullmatch(r'(?:plan-)?(\d{1,3})', value, re.I)
    if m:
        return f'plan-{m.group(1).zfill(3)}'
    m = re.match(r'(?:plan-)?(\d{1,3})[-_]', value, re.I)
    if m:
        return f'plan-{m.group(1).zfill(3)}'
    return value or 'unknown-plan'

plan_key = normalize_plan(plan)
plan_safe = slug(plan_key)
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
base = Path(state_dir) / 'pipeline-events' / project_slug_safe
base.mkdir(parents=True, exist_ok=True)
current_file = base / f'{plan_safe}.current'
terminal_events = {'pipeline_completed', 'pipeline_failed', 'pipeline_aborted', 'pipeline_cancelled'}

if not pipeline_id:
    if event == 'pipeline_started':
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        pipeline_id = slug(f'{project_slug_safe}-{plan_safe}-{stamp}')
        current_file.write_text(pipeline_id, encoding='utf-8')
    elif current_file.exists():
        pipeline_id = current_file.read_text(encoding='utf-8', errors='ignore').strip()
        if not pipeline_id:
            raise SystemExit(f'Active pipeline id file is empty for project={project_slug_safe} plan={plan_key}: {current_file}')
    elif event in terminal_events:
        raise SystemExit(
            f'Terminal event {event} for project={project_slug_safe} plan={plan_key} has no active pipeline id. '
            f'Pass --pipeline-id explicitly or emit pipeline_started first; refusing to create an orphan terminal pipeline.'
        )
    else:
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        pipeline_id = slug(f'{project_slug_safe}-{plan_safe}-{stamp}')
        current_file.write_text(pipeline_id, encoding='utf-8')
else:
    pipeline_id = slug(pipeline_id)
    if event == 'pipeline_started':
        current_file.write_text(pipeline_id, encoding='utf-8')

metadata = None
if metadata_json:
    try:
        metadata = json.loads(metadata_json)
    except Exception as exc:
        raise SystemExit(f'Invalid --metadata-json: {exc}')
    if not isinstance(metadata, dict):
        raise SystemExit('--metadata-json must be a JSON object')

record = {
    'timestamp': now,
    'project_path': project_path,
    'project_slug': project_slug,
    'pipeline_id': pipeline_id,
    'plan_key': plan_key,
    'event_type': event,
    'status': status or None,
    'actor': actor or None,
    'message': message or None,
    'metadata': metadata,
    'source': source or None,
}
out_path = base / f'{pipeline_id}.jsonl'
with out_path.open('a', encoding='utf-8') as f:
    f.write(json.dumps(record, separators=(',', ':')) + '\n')

if event in terminal_events and current_file.exists():
    try:
        if current_file.read_text(encoding='utf-8', errors='ignore').strip() == pipeline_id:
            current_file.unlink()
    except Exception:
        pass

print(f'{out_path} pipeline_id={pipeline_id}')

auto_pdq_disabled = os.environ.get('PIDEX_AUTO_PDQ', '1').lower() in {'0', 'false', 'no', 'off'}
if event in terminal_events and not auto_pdq_disabled:
    script = Path(root) / 'scripts' / 'quality' / 'run-auto-pdq.py'
    if script.exists():
        try:
            proc = subprocess.run(
                [sys.executable, str(script), '--project', project_path, '--plan', plan_key, '--pipeline-id', pipeline_id, '--terminal-event', event],
                cwd=str(root),
                text=True,
                capture_output=True,
                timeout=int(os.environ.get('PIDEX_AUTO_PDQ_TIMEOUT_SECONDS', '120')),
            )
            if proc.returncode == 0 and proc.stdout.strip():
                print(proc.stdout.strip())
            elif proc.returncode != 0:
                print(f'auto_pdq failed exit={proc.returncode}: {(proc.stderr or proc.stdout).strip()}', file=sys.stderr)
        except Exception as exc:
            print(f'auto_pdq failed: {exc}', file=sys.stderr)
PY
