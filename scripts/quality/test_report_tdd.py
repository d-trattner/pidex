#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "scripts" / "quality" / "report.py"
spec = importlib.util.spec_from_file_location("pdq_report", REPORT)
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def test_normalize_plan():
    assert mod.normalize_plan("4") == "plan-004"
    assert mod.normalize_plan("plan-4") == "plan-004"
    assert mod.normalize_plan("004-dashboard") == "plan-004"
    assert mod.normalize_plan("provider-limits-native") == "provider-limits-native"


def test_expected_trace_detects_unlogged_spawn_route_gate():
    data = {
        "metrics": [
            {
                "plan": "4",
                "timestamp": "2026-01-01T00:00:00Z",
                "agent": "pidex-planner",
                "route_to": "pidex-critic",
                "gate": "G9",
                "_source_path": "state/metrics/x/plan-4.jsonl",
                "context_file": "agents.output/planning/4-plan.md",
            },
            {
                "plan": "4",
                "timestamp": "2026-01-01T00:01:00Z",
                "agent": "pidex-critic",
                "_source_path": "state/metrics/x/plan-4.jsonl",
            },
        ],
        "orchestrator_events": [],
    }
    trace = mod.build_expected_observed(data, ["plan-004"])
    assert trace["expected_required"] == 4
    assert trace["observed_required"] == 0
    assert trace["gap_count"] == 4
    assert any(f["operator_type"] == "OpGate" and f["type"] == "missing_operator" for f in trace["findings"])


def test_review_state_selects_unreviewed_plans():
    state = {"reviewed_plans": ["plan-001", "plan-003"]}
    assert mod.select_since_last_review(["plan-003", "plan-002", "plan-001"], state) == ["plan-002"]


def test_markdown_and_json_report_shape():
    data = {
        "metrics": [],
        "pipeline_events": [],
        "orchestrator_events": [],
        "rule_actions": [
            {
                "timestamp": "2026-01-01T00:00:00Z",
                "action": "monitor",
                "status": "monitoring",
                "owning_agent": "orchestrator",
                "expected_impact_dimension": "routing-correctness",
                "expected_direction": "increase",
            }
        ],
        "routing_artifacts": [],
        "rules": [],
    }
    summary = mod.summarize(data, [])
    assert summary["confidence"] == "medium"
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "report.md"
        mod.write_markdown({"generated_at": "now", "project_path": "/tmp/project", "summary": summary}, out)
        text = out.read_text()
        assert "PIDEX Quality Report" in text
        assert "Expected-vs-Observed Operator Trace" in text
        assert "Rule-Action Ledger" in text
        assert "routing-correctness" in text


if __name__ == "__main__":
    test_normalize_plan()
    test_expected_trace_detects_unlogged_spawn_route_gate()
    test_review_state_selects_unreviewed_plans()
    test_markdown_and_json_report_shape()
    print("ok")
