#!/usr/bin/env python3
"""Write/validate PIDEX operator events.

Phase 0 helper: low-volume JSONL event writer for future orchestrator use.
It is not wired into /pd yet.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "state"
OPERATOR_TYPES = {
    "OpPreflight",
    "OpContextPack",
    "OpSpawn",
    "OpRoute",
    "OpGate",
    "OpReview",
    "OpUserCorrection",
    "OpRuleAction",
    "OpQualityReview",
    "OpReleaseDecision",
}


def slug(value: str) -> str:
    return (re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unknown")[:100]


def normalize_plan(value: str) -> str:
    raw = (value or "unknown-plan").strip() or "unknown-plan"
    m = re.fullmatch(r"(?:plan-)?(\d{1,3})", raw, re.I)
    if m:
        return f"plan-{m.group(1).zfill(3)}"
    return raw


def validate_event(rec: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if rec.get("operator_type") not in OPERATOR_TYPES:
        errors.append(f"operator_type must be one of {sorted(OPERATOR_TYPES)}")
    for key in ["timestamp", "project_path", "pipeline_id", "plan_key", "operator_type"]:
        if not rec.get(key):
            errors.append(f"missing required field: {key}")
    if rec.get("operator_type") == "OpRoute":
        if not rec.get("logical_decision"):
            errors.append("OpRoute requires logical_decision")
        if not rec.get("physical_action"):
            errors.append("OpRoute requires physical_action")
    if rec.get("operator_type") == "OpRuleAction":
        for key in ["rule_path", "action", "approval_source", "expected_impact_dimension"]:
            if not rec.get(key):
                errors.append(f"OpRuleAction missing {key}")
    if rec.get("operator_type") == "OpUserCorrection":
        if not (rec.get("reason") or (rec.get("logical_decision") or {}).get("summary")):
            errors.append("OpUserCorrection requires --reason or logical_json.summary")
    if rec.get("operator_type") == "OpReleaseDecision":
        if not (rec.get("reason") or rec.get("source_artifact") or rec.get("physical_action")):
            errors.append("OpReleaseDecision requires --reason, --source-artifact, or --physical-json")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser(description="Append a PIDEX operator/orchestrator event JSONL row")
    ap.add_argument("--project", default=str(ROOT))
    ap.add_argument("--pipeline-id", required=True)
    ap.add_argument("--plan", default="unknown-plan")
    ap.add_argument("--operator-type", required=True, choices=sorted(OPERATOR_TYPES))
    ap.add_argument("--actor", default="orchestrator")
    ap.add_argument("--agent")
    ap.add_argument("--source-artifact")
    ap.add_argument("--gate")
    ap.add_argument("--severity")
    ap.add_argument("--confidence")
    ap.add_argument("--reason")
    ap.add_argument("--logical-json", help="JSON object for expected/logical decision")
    ap.add_argument("--physical-json", help="JSON object for actual/physical action")
    ap.add_argument("--extra-json", help="Additional JSON object fields")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    project = Path(args.project).expanduser().resolve()
    rec: dict[str, Any] = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "project_path": str(project),
        "project_slug": project.name,
        "pipeline_id": slug(args.pipeline_id),
        "plan_key": normalize_plan(args.plan),
        "operator_type": args.operator_type,
        "actor": args.actor,
    }
    for key, value in {
        "agent": args.agent,
        "source_artifact": args.source_artifact,
        "gate": args.gate,
        "severity": args.severity,
        "confidence": args.confidence,
        "reason": args.reason,
    }.items():
        if value:
            rec[key] = value
    for dest, raw in [("logical_decision", args.logical_json), ("physical_action", args.physical_json)]:
        if raw:
            try:
                obj = json.loads(raw)
            except Exception as exc:
                raise SystemExit(f"invalid {dest} JSON: {exc}")
            if not isinstance(obj, dict):
                raise SystemExit(f"{dest} must be JSON object")
            rec[dest] = obj
    if args.extra_json:
        try:
            extra = json.loads(args.extra_json)
        except Exception as exc:
            raise SystemExit(f"invalid extra JSON: {exc}")
        if not isinstance(extra, dict):
            raise SystemExit("extra-json must be JSON object")
        rec.update(extra)

    errors = validate_event(rec)
    if errors:
        print("Invalid operator event:", file=sys.stderr)
        for e in errors:
            print(f"- {e}", file=sys.stderr)
        return 2

    if args.dry_run:
        print(json.dumps(rec, indent=2, sort_keys=True))
        return 0

    out_dir = STATE / "orchestrator-events" / slug(project.name)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{rec['pipeline_id']}.jsonl"
    with out_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(rec, separators=(",", ":"), sort_keys=True) + "\n")
    print(str(out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
