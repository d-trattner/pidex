#!/usr/bin/env python3
"""PIDEX quality report bootstrap.

Read-only collector/report for /pdq Phase 0. It intentionally reports
facts, indicators, trace gaps, and confidence labels instead of one global
quality score.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "state"

TERMINAL_EVENTS = {"pipeline_completed", "pipeline_failed", "pipeline_aborted", "pipeline_cancelled"}
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


def utc_now_slug() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def safe_slug(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")
    return (value or "unknown")[:100]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line_no, line in enumerate(f, 1):
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
                rows.append(row)
    return rows


def iter_jsonl(root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not root.exists():
        return rows
    for path in sorted(root.rglob("*.jsonl")):
        rows.extend(read_jsonl(path))
    return rows


def parse_routing(text: str) -> dict[str, str]:
    m = re.search(r"<!--\s*ROUTING(?P<body>.*?)-->", text, re.I | re.S)
    if not m:
        return {}
    out: dict[str, str] = {}
    for line in m.group("body").splitlines():
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        out[k.strip().lower()] = v.strip()
    return out


def discover_artifact_routing(project: Path, limit: int = 5000) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    root = project / "agents.output"
    if not root.exists():
        return out
    for path in sorted(root.rglob("*.md"))[:limit]:
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        routing = parse_routing(text)
        if not routing:
            continue
        rel = path.relative_to(project)
        role = path.parts[path.parts.index("agents.output") + 1] if "agents.output" in path.parts else "unknown"
        out.append(
            {
                "path": str(rel),
                "role": role,
                "verdict": routing.get("verdict"),
                "route_to": routing.get("route_to"),
                "gate": routing.get("gate"),
                "context_file": routing.get("context_file"),
            }
        )
    return out


def normalize_plan(value: str | None) -> str:
    raw = str(value or "unknown-plan").strip() or "unknown-plan"
    m = re.fullmatch(r"(?:plan-)?(\d{1,3})", raw, re.I)
    if m:
        return f"plan-{m.group(1).zfill(3)}"
    m = re.match(r"(?:plan-)?(\d{1,3})[-_]", raw, re.I)
    if m:
        return f"plan-{m.group(1).zfill(3)}"
    return raw


def infer_plan_from_record(row: dict[str, Any]) -> str:
    return normalize_plan(row.get("plan") or row.get("plan_key") or "unknown-plan")


def metric_project_matches(row: dict[str, Any], project: Path) -> bool:
    rec_project = row.get("project")
    if not rec_project:
        return True
    try:
        return Path(str(rec_project)).expanduser().resolve() == project.resolve()
    except Exception:
        return False


def load_quality_data(project: Path) -> dict[str, Any]:
    metrics = [r for r in iter_jsonl(STATE / "metrics") if metric_project_matches(r, project)]
    events = [r for r in iter_jsonl(STATE / "pipeline-events") if str(r.get("project_path") or r.get("project") or "") in {str(project), str(project.resolve())} or not r.get("project_path")]
    orchestrator_events = [r for r in iter_jsonl(STATE / "orchestrator-events") if str(r.get("project_path") or "") in {str(project), str(project.resolve()), ""}]
    rule_actions = [r for r in iter_jsonl(STATE / "rule-actions") if str(r.get("project_path") or "") in {str(project), str(project.resolve()), ""}]
    routing_artifacts = discover_artifact_routing(project)
    rules = discover_rules(project)
    return {
        "metrics": metrics,
        "pipeline_events": events,
        "orchestrator_events": orchestrator_events,
        "rule_actions": rule_actions,
        "routing_artifacts": routing_artifacts,
        "rules": rules,
    }


def discover_rules(project: Path) -> list[dict[str, Any]]:
    rules_root = project / "rules"
    out: list[dict[str, Any]] = []
    if not rules_root.exists():
        return out
    for path in sorted(rules_root.rglob("*.md")):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            text = ""
        rel = path.relative_to(project)
        agent = rel.parts[1] if len(rel.parts) > 2 else rel.parent.name
        out.append({"path": str(rel), "agent": agent, "bytes": path.stat().st_size, "lines": text.count("\n") + 1})
    return out


def select_plans(metrics: list[dict[str, Any]], events: list[dict[str, Any]], plan: str | None, last: int) -> list[str]:
    if plan:
        return [normalize_plan(plan)]
    seen: dict[str, str] = {}
    for row in metrics:
        key = infer_plan_from_record(row)
        ts = str(row.get("timestamp") or "")
        seen[key] = max(seen.get(key, ""), ts)
    for row in events:
        key = infer_plan_from_record(row)
        ts = str(row.get("timestamp") or "")
        seen[key] = max(seen.get(key, ""), ts)
    ordered = [k for k, _ in sorted(seen.items(), key=lambda kv: kv[1], reverse=True)]
    return ordered[:last] if last > 0 else ordered


def build_expected_observed(data: dict[str, Any], plans: list[str]) -> dict[str, Any]:
    metrics_by_plan: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in data["metrics"]:
        key = infer_plan_from_record(row)
        if key in plans:
            metrics_by_plan[key].append(row)
    for rows in metrics_by_plan.values():
        rows.sort(key=lambda r: str(r.get("timestamp") or ""))

    orch = data["orchestrator_events"]
    observed_ops = Counter(str(r.get("operator_type") or r.get("event_type") or "unknown") for r in orch)
    findings: list[dict[str, Any]] = []
    expected_count = observed_required = 0

    for plan, rows in sorted(metrics_by_plan.items()):
        for idx, row in enumerate(rows):
            agent = row.get("agent") or "unknown-agent"
            expected_count += 1
            # Agent metrics prove the spawn occurred, but structured orchestrator event may be missing.
            matching_spawn = [e for e in orch if e.get("operator_type") == "OpSpawn" and e.get("agent") == agent and (e.get("plan_key") in {plan, None, ""})]
            if matching_spawn:
                observed_required += 1
            else:
                findings.append({
                    "type": "unlogged_operator",
                    "operator_type": "OpSpawn",
                    "plan_key": plan,
                    "agent": agent,
                    "confidence": "probably-unlogged",
                    "severity": "low",
                    "reason": "Agent metrics prove the agent ran, but no structured OpSpawn event exists.",
                    "evidence": row.get("_source_path"),
                })
            route_to = row.get("route_to")
            gate = row.get("gate")
            if route_to:
                expected_count += 1
                next_agent = rows[idx + 1].get("agent") if idx + 1 < len(rows) else None
                matching_route = [e for e in orch if e.get("operator_type") == "OpRoute" and (e.get("plan_key") in {plan, None, ""})]
                if matching_route:
                    observed_required += 1
                else:
                    findings.append({
                        "type": "unlogged_operator",
                        "operator_type": "OpRoute",
                        "plan_key": plan,
                        "agent": agent,
                        "expected_route_to": route_to,
                        "actual_next_agent": next_agent,
                        "confidence": "probably-unlogged",
                        "severity": "medium" if route_to not in {next_agent, "orchestrator", "user"} else "low",
                        "reason": "Metric ROUTING fields imply a route decision, but no structured OpRoute event exists.",
                        "evidence": row.get("context_file") or row.get("_source_path"),
                    })
            if gate:
                expected_count += 1
                matching_gate = [e for e in orch if e.get("operator_type") == "OpGate" and (e.get("plan_key") in {plan, None, ""}) and (e.get("gate") in {gate, None, ""})]
                if matching_gate:
                    observed_required += 1
                else:
                    findings.append({
                        "type": "missing_operator",
                        "operator_type": "OpGate",
                        "plan_key": plan,
                        "agent": agent,
                        "gate": gate,
                        "confidence": "confirmed-missing" if gate else "insufficient-data",
                        "severity": "high",
                        "reason": "A metric row contains a gate, but no structured OpGate event exists.",
                        "evidence": row.get("context_file") or row.get("_source_path"),
                    })

    return {
        "expected_required": expected_count,
        "observed_required": observed_required,
        "observed_operator_events": dict(observed_ops),
        "gap_count": len(findings),
        "critical_missing_operators": sum(1 for f in findings if f.get("severity") == "high"),
        "findings": findings,
    }


def summarize(data: dict[str, Any], plans: list[str]) -> dict[str, Any]:
    metrics = [r for r in data["metrics"] if infer_plan_from_record(r) in plans]
    events = [r for r in data["pipeline_events"] if infer_plan_from_record(r) in plans]
    trace = build_expected_observed(data, plans)
    by_agent = Counter(str(r.get("agent") or "unknown") for r in metrics)
    by_verdict = Counter(str(r.get("agent_verdict") or "unknown") for r in metrics)
    by_gate = Counter(str(r.get("gate") or "none") for r in metrics)
    by_event = Counter(str(r.get("event_type") or "unknown") for r in events)
    by_rule_agent = Counter(str(r.get("agent") or "unknown") for r in data["rules"])
    rule_actions = data.get("rule_actions", [])
    by_rule_action = Counter(str(r.get("action") or "unknown") for r in rule_actions)
    total_tokens = sum(int(r.get("input_tokens_estimate") or 0) + int(r.get("output_tokens_estimate") or 0) for r in metrics)
    total_cost = sum(float(r.get("cost_usd_estimate") or 0.0) for r in metrics)
    return {
        "plans_reviewed": plans,
        "sample_size": {"agent_runs": len(metrics), "pipeline_events": len(events), "orchestrator_events": len(data["orchestrator_events"]), "rule_actions": len(rule_actions), "routing_artifacts": len(data["routing_artifacts"]), "rules": len(data["rules"])},
        "agent_runs_by_agent": dict(by_agent),
        "agent_verdicts": dict(by_verdict),
        "gates": dict(by_gate),
        "pipeline_event_types": dict(by_event),
        "rules_by_owner": dict(by_rule_agent),
        "rule_actions_by_action": dict(by_rule_action),
        "recent_rule_actions": rule_actions[-20:],
        "cost_tokens": {"estimated_tokens": total_tokens, "estimated_cost_usd": round(total_cost, 6)},
        "operator_trace": trace,
        "confidence": "descriptive-only" if trace["gap_count"] else "medium",
    }


def review_state_path(project: Path) -> Path:
    return STATE / "quality" / "review-state.json"


def load_review_state(project: Path) -> dict[str, Any]:
    path = review_state_path(project)
    if not path.exists():
        return {"reviewed_plans": [], "reviews": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"reviewed_plans": [], "reviews": [], "load_error": "invalid-json"}
    if not isinstance(data, dict):
        return {"reviewed_plans": [], "reviews": [], "load_error": "not-object"}
    data.setdefault("reviewed_plans", [])
    data.setdefault("reviews", [])
    return data


def select_since_last_review(all_plans: list[str], state: dict[str, Any]) -> list[str]:
    reviewed = set(str(p) for p in state.get("reviewed_plans", []))
    return [p for p in all_plans if p not in reviewed]


def update_review_state(project: Path, report: dict[str, Any], json_out: Path, md_out: Path) -> Path:
    path = review_state_path(project)
    state = load_review_state(project)
    plans = report["summary"].get("plans_reviewed", [])
    reviewed = list(dict.fromkeys([*state.get("reviewed_plans", []), *plans]))
    review = {
        "timestamp": report["generated_at"],
        "plans_reviewed": plans,
        "json_report": str(json_out),
        "markdown_report": str(md_out),
        "confidence": report["summary"].get("confidence"),
        "trace_gaps": report["summary"].get("operator_trace", {}).get("gap_count"),
        "rule_actions": report["summary"].get("sample_size", {}).get("rule_actions"),
    }
    state.update({
        "updated_at": report["generated_at"],
        "reviewed_plans": reviewed,
        "last_review": review,
        "reviews": [*state.get("reviews", []), review][-100:],
    })
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    return path


def write_markdown(report: dict[str, Any], path: Path) -> None:
    s = report["summary"]
    trace = s["operator_trace"]
    lines = [
        "# PIDEX Quality Report",
        "",
        f"Generated: `{report['generated_at']}`",
        f"Project: `{report['project_path']}`",
        f"Confidence: `{s['confidence']}`",
        "",
        "## Scope",
        "",
        "Plans reviewed: " + (", ".join(f"`{p}`" for p in s["plans_reviewed"]) or "none"),
        f"Review mode: `{report.get('review_mode', 'manual')}`",
        "",
        "## Sample Size",
        "",
    ]
    for k, v in s["sample_size"].items():
        lines.append(f"- {k}: {v}")
    lines += ["", "## Agent Runs by Agent", ""]
    for k, v in sorted(s["agent_runs_by_agent"].items()):
        lines.append(f"- {k}: {v}")
    lines += ["", "## Verdicts / Gates", ""]
    lines.append("- verdicts: " + ", ".join(f"{k}={v}" for k, v in sorted(s["agent_verdicts"].items())))
    lines.append("- gates: " + ", ".join(f"{k}={v}" for k, v in sorted(s["gates"].items())))
    lines += ["", "## Cost / Tokens", ""]
    lines.append(f"- estimated_tokens: {s['cost_tokens']['estimated_tokens']}")
    lines.append(f"- estimated_cost_usd: {s['cost_tokens']['estimated_cost_usd']}")
    lines += ["", "## Expected-vs-Observed Operator Trace", ""]
    lines.append(f"- required operators expected: {trace['expected_required']}")
    lines.append(f"- required operators observed as structured events: {trace['observed_required']}")
    lines.append(f"- trace gaps: {trace['gap_count']}")
    lines.append(f"- critical missing operators: {trace['critical_missing_operators']}")
    lines += ["", "### Top Trace Findings", ""]
    for f in trace["findings"][:25]:
        lines.append(f"- **{f.get('type')}** `{f.get('operator_type')}` plan `{f.get('plan_key')}` severity `{f.get('severity')}` confidence `{f.get('confidence')}` — {f.get('reason')} Evidence: `{f.get('evidence')}`")
    if not trace["findings"]:
        lines.append("- No trace gaps detected from available evidence.")
    lines += ["", "## Rule Inventory", ""]
    for k, v in sorted(s["rules_by_owner"].items()):
        lines.append(f"- {k}: {v} rule docs")
    lines += ["", "## Rule-Action Ledger", ""]
    if s.get("recent_rule_actions"):
        lines.append("Action counts: " + ", ".join(f"{k}={v}" for k, v in sorted(s.get("rule_actions_by_action", {}).items())))
        for row in s.get("recent_rule_actions", [])[-10:]:
            lines.append(f"- {row.get('timestamp')} `{row.get('action')}` `{row.get('status')}` {row.get('rule_path') or '—'} owner `{row.get('owning_agent')}` impact `{row.get('expected_impact_dimension')}` direction `{row.get('expected_direction')}`")
    else:
        lines.append("- No rule actions recorded yet.")
    lines += ["", "## Recommendation", "", "Phase 0 report is descriptive-only. Add/maintain typed operator events and rule-action ledger entries before causal self-improvement claims.", ""]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate read-only PIDEX quality report")
    ap.add_argument("--project", default=str(ROOT))
    ap.add_argument("--last", type=int, default=10)
    ap.add_argument("--plan")
    ap.add_argument("--since-last-review", action="store_true", help="Review plans not yet present in state/quality/review-state.json")
    ap.add_argument("--update-review-state", action="store_true", help="After writing reports, mark reviewed plans in state/quality/review-state.json")
    ap.add_argument("--json-out")
    ap.add_argument("--md-out")
    args = ap.parse_args()

    project = Path(args.project).expanduser().resolve()
    data = load_quality_data(project)
    all_plans = select_plans(data["metrics"], data["pipeline_events"], args.plan, 0 if args.since_last_review else args.last)
    review_state = load_review_state(project)
    plans = select_since_last_review(all_plans, review_state) if args.since_last_review and not args.plan else all_plans
    if args.since_last_review and args.last > 0:
        plans = plans[:args.last]
    summary = summarize(data, plans)
    generated = dt.datetime.now(dt.timezone.utc).isoformat()
    report = {"generated_at": generated, "project_path": str(project), "review_mode": "since-last-review" if args.since_last_review else "manual", "summary": summary}

    stamp = utc_now_slug()
    json_out = Path(args.json_out) if args.json_out else ROOT / "state" / "quality" / f"pdq-{stamp}.json"
    md_out = Path(args.md_out) if args.md_out else ROOT / "agents.output" / "quality" / f"pdq-{stamp}.md"
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    write_markdown(report, md_out)
    review_state_out = update_review_state(project, report, json_out, md_out) if args.update_review_state else None
    print(json.dumps({"json": str(json_out), "markdown": str(md_out), "review_state": str(review_state_out) if review_state_out else None, "plans": plans, "confidence": summary["confidence"], "trace_gaps": summary["operator_trace"]["gap_count"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
