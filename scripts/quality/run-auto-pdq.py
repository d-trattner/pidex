#!/usr/bin/env python3
"""Run PIDEX quality cadence automatically after terminal pipeline events.

Fail-soft helper for scripts/pipeline/event.sh. It writes a PDQ report for the
completed plan, updates review-state, and appends an OpQualityReview event.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "state"


def slug(value: str) -> str:
    return (re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unknown")[:100]


def normalize_plan(value: str) -> str:
    raw = (value or "unknown-plan").strip() or "unknown-plan"
    m = re.fullmatch(r"(?:plan-)?(\d{1,3})", raw, re.I)
    if m:
        return f"plan-{m.group(1).zfill(3)}"
    m = re.match(r"(?:plan-)?(\d{1,3})[-_]", raw, re.I)
    if m:
        return f"plan-{m.group(1).zfill(3)}"
    return raw


def append_quality_operator_event(project: Path, plan_key: str, pipeline_id: str, report_payload: dict[str, Any], terminal_event: str) -> Path:
    project_path = str(project.expanduser().resolve())
    out_dir = STATE / "orchestrator-events" / slug(project_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{slug(pipeline_id)}.jsonl"
    rec = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "project_path": project_path,
        "project_slug": project.name or slug(project_path),
        "pipeline_id": slug(pipeline_id),
        "plan_key": plan_key,
        "operator_type": "OpQualityReview",
        "actor": "orchestrator",
        "source": "auto-pdq",
        "logical_decision": {
            "trigger": terminal_event,
            "review_scope": "plan",
            "update_review_state": True,
        },
        "physical_action": {
            "json_report": report_payload.get("json"),
            "markdown_report": report_payload.get("markdown"),
            "review_state": report_payload.get("review_state"),
        },
        "confidence": report_payload.get("confidence"),
        "trace_gaps": report_payload.get("trace_gaps"),
        "plans_reviewed": report_payload.get("plans", []),
    }
    with out_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, separators=(",", ":"), sort_keys=True) + "\n")
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser(description="Run automatic PDQ for a terminal pipeline event")
    ap.add_argument("--project", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--pipeline-id", required=True)
    ap.add_argument("--terminal-event", required=True)
    args = ap.parse_args()

    project = Path(args.project).expanduser().resolve()
    plan_key = normalize_plan(args.plan)
    script = ROOT / "scripts" / "quality" / "report.py"
    proc = subprocess.run(
        [sys.executable, str(script), "--project", str(project), "--plan", plan_key, "--update-review-state"],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr or proc.stdout)
        return proc.returncode or 1
    try:
        payload = json.loads(proc.stdout)
    except Exception as exc:
        sys.stderr.write(f"failed to parse PDQ output: {exc}\n{proc.stdout}\n")
        return 1
    event_path = append_quality_operator_event(project, plan_key, args.pipeline_id, payload, args.terminal_event)
    print(json.dumps({
        "auto_pdq": True,
        "json": payload.get("json"),
        "markdown": payload.get("markdown"),
        "review_state": payload.get("review_state"),
        "operator_event": str(event_path),
        "confidence": payload.get("confidence"),
        "trace_gaps": payload.get("trace_gaps"),
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
