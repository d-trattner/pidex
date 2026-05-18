#!/usr/bin/env python3
"""PIDEX rule-action ledger helper.

Records approved/deferred/monitored rule/process changes so /pdq can later
check whether a supposed improvement helped or hurt. Does not edit rules.
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
ACTIONS = {"add", "remove", "move", "merge", "split", "compress", "pin", "monitor", "rollback", "downgrade", "narrow", "no-op"}
STATUSES = {"accepted", "rejected", "deferred", "monitoring", "rolled-back"}
DIRECTIONS = {"increase", "decrease", "maintain", "avoid", "unknown"}


def slug(value: str) -> str:
    return (re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-") or "unknown")[:100]


def normalize_plan(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    m = re.fullmatch(r"(?:plan-)?(\d{1,3})", raw, re.I)
    if m:
        return f"plan-{m.group(1).zfill(3)}"
    return raw


def load_rows(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not path.exists():
        return out
    for line_no, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if isinstance(row, dict):
            row["_source_path"] = str(path)
            row["_source_line"] = line_no
            out.append(row)
    return out


def validate(row: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for key in ["timestamp", "action", "status", "owning_agent", "approval_source", "expected_impact_dimension"]:
        if not row.get(key):
            errors.append(f"missing required field: {key}")
    if row.get("action") not in ACTIONS:
        errors.append(f"action must be one of {sorted(ACTIONS)}")
    if row.get("status") not in STATUSES:
        errors.append(f"status must be one of {sorted(STATUSES)}")
    if row.get("expected_direction") not in DIRECTIONS:
        errors.append(f"expected_direction must be one of {sorted(DIRECTIONS)}")
    if row.get("action") not in {"no-op", "monitor"} and not row.get("rule_path"):
        errors.append("rule_path required except for no-op/monitor actions")
    return errors


def ledger_path(project: Path) -> Path:
    return STATE / "rule-actions" / f"{slug(str(project))}.jsonl"


def append_row(project: Path, row: dict[str, Any], dry_run: bool = False) -> Path | None:
    errors = validate(row)
    if errors:
        for e in errors:
            print(f"error: {e}", file=sys.stderr)
        raise ValueError("invalid rule-action row")
    if dry_run:
        print(json.dumps(row, indent=2, sort_keys=True))
        return None
    path = ledger_path(project)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n")
    return path


def cmd_add(args: argparse.Namespace) -> int:
    project = Path(args.project).expanduser().resolve()
    row: dict[str, Any] = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "project_path": str(project),
        "action": args.action,
        "status": args.status,
        "rule_path": args.rule_path,
        "owning_agent": args.owning_agent,
        "approval_source": args.approval_source,
        "expected_impact_dimension": args.expected_impact_dimension,
        "expected_direction": args.expected_direction,
        "token_delta_estimate": args.token_delta_estimate,
        "linked_pipeline_id": args.linked_pipeline_id,
        "plan_key": normalize_plan(args.plan),
        "reason": args.reason,
        "evidence": args.evidence or [],
        "source": "rule-actions.py",
    }
    if args.extra_json:
        try:
            extra = json.loads(args.extra_json)
        except Exception as exc:
            raise SystemExit(f"invalid --extra-json: {exc}")
        if not isinstance(extra, dict):
            raise SystemExit("--extra-json must be a JSON object")
        row.update(extra)
    try:
        path = append_row(project, row, args.dry_run)
    except ValueError:
        return 2
    if path:
        print(str(path))
    return 0


def normalize_rule_path(value: Any, project: Path | None = None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    path = Path(raw)
    if path.is_absolute() and project:
        try:
            raw = str(path.resolve().relative_to(project.resolve()))
        except Exception:
            raw = str(path)
    return raw.removeprefix("./")


def parse_git_status_rules(status_text: str, project: Path, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ledger_paths = {normalize_rule_path(row.get("rule_path"), project) for row in rows if row.get("rule_path")}
    changes: list[dict[str, Any]] = []
    for line in status_text.splitlines():
        if not line.strip() or len(line) < 4:
            continue
        status = line[:2]
        path_text = line[3:].strip()
        if " -> " in path_text:
            path_text = path_text.split(" -> ", 1)[1].strip()
        rel = normalize_rule_path(path_text, project)
        if not rel.startswith("rules/") or not rel.endswith(".md"):
            continue
        parts = rel.split("/")
        owner = parts[1] if len(parts) > 1 else "unknown"
        if rel in ledger_paths:
            continue
        changes.append({"path": rel, "git_status": status.strip() or "modified", "owning_agent": owner, "ledger_status": "untracked"})
    return changes


def scan_untracked(project: Path) -> list[dict[str, Any]]:
    rows = load_rows(ledger_path(project))
    try:
        proc = subprocess.run(
            ["git", "-C", str(project), "status", "--porcelain", "--", "rules"],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return []
    if proc.returncode != 0:
        return []
    return parse_git_status_rules(proc.stdout, project, rows)


def cmd_scan_untracked(args: argparse.Namespace) -> int:
    project = Path(args.project).expanduser().resolve()
    changes = scan_untracked(project)
    if args.json:
        print(json.dumps(changes, indent=2, sort_keys=True))
        return 0
    print(f"# Untracked rule changes — {project}")
    if not changes:
        print("No untracked rule changes detected.")
        return 0
    for row in changes:
        print(f"- {row.get('git_status')} {row.get('path')} owner={row.get('owning_agent')}")
    return 0


def cmd_bulk_add_from_git_status(args: argparse.Namespace) -> int:
    project = Path(args.project).expanduser().resolve()
    changes = scan_untracked(project)
    if not changes:
        print("No untracked rule changes detected.")
        return 0
    written: Path | None = None
    for change in changes:
        git_status = str(change.get("git_status") or "")
        action = "add" if "??" in git_status or "A" in git_status else "monitor"
        row: dict[str, Any] = {
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "project_path": str(project),
            "action": action,
            "status": args.status,
            "rule_path": change["path"],
            "owning_agent": change["owning_agent"],
            "approval_source": args.approval_source,
            "expected_impact_dimension": args.expected_impact_dimension,
            "expected_direction": args.expected_direction,
            "token_delta_estimate": None,
            "linked_pipeline_id": args.linked_pipeline_id,
            "plan_key": normalize_plan(args.plan),
            "reason": args.reason,
            "evidence": args.evidence or [],
            "source": "rule-actions.py bulk-add-from-git-status",
            "git_status_at_registration": git_status,
        }
        try:
            path = append_row(project, row, args.dry_run)
        except ValueError:
            return 2
        written = path or written
    if args.dry_run:
        print(f"Would register {len(changes)} rule changes.")
    else:
        print(f"Registered {len(changes)} rule changes in {written}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    project = Path(args.project).expanduser().resolve()
    rows = load_rows(ledger_path(project))
    if args.json:
        print(json.dumps(rows, indent=2, sort_keys=True))
        return 0
    print(f"# Rule actions — {project}")
    if not rows:
        print("No rule actions recorded.")
        return 0
    for row in rows[-args.last:]:
        print(f"- {row.get('timestamp')} {row.get('action')} {row.get('status')} {row.get('rule_path') or '—'} owner={row.get('owning_agent')} impact={row.get('expected_impact_dimension')} direction={row.get('expected_direction')} plan={row.get('plan_key') or '—'}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="PIDEX rule-action ledger")
    sub = ap.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add")
    add.add_argument("--project", default=str(ROOT))
    add.add_argument("--action", required=True, choices=sorted(ACTIONS))
    add.add_argument("--status", default="accepted", choices=sorted(STATUSES))
    add.add_argument("--rule-path")
    add.add_argument("--owning-agent", required=True)
    add.add_argument("--approval-source", required=True)
    add.add_argument("--expected-impact-dimension", required=True)
    add.add_argument("--expected-direction", default="unknown", choices=sorted(DIRECTIONS))
    add.add_argument("--token-delta-estimate", type=int)
    add.add_argument("--linked-pipeline-id")
    add.add_argument("--plan")
    add.add_argument("--reason")
    add.add_argument("--evidence", action="append")
    add.add_argument("--extra-json")
    add.add_argument("--dry-run", action="store_true")
    add.set_defaults(func=cmd_add)

    ls = sub.add_parser("list")
    ls.add_argument("--project", default=str(ROOT))
    ls.add_argument("--last", type=int, default=20)
    ls.add_argument("--json", action="store_true")
    ls.set_defaults(func=cmd_list)

    scan = sub.add_parser("scan-untracked")
    scan.add_argument("--project", default=str(ROOT))
    scan.add_argument("--json", action="store_true")
    scan.set_defaults(func=cmd_scan_untracked)

    bulk = sub.add_parser("bulk-add-from-git-status")
    bulk.add_argument("--project", default=str(ROOT))
    bulk.add_argument("--status", default="monitoring", choices=sorted(STATUSES))
    bulk.add_argument("--approval-source", required=True)
    bulk.add_argument("--expected-impact-dimension", required=True)
    bulk.add_argument("--expected-direction", default="unknown", choices=sorted(DIRECTIONS))
    bulk.add_argument("--linked-pipeline-id")
    bulk.add_argument("--plan")
    bulk.add_argument("--reason", required=True)
    bulk.add_argument("--evidence", action="append")
    bulk.add_argument("--dry-run", action="store_true")
    bulk.set_defaults(func=cmd_bulk_add_from_git_status)
    return ap


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
