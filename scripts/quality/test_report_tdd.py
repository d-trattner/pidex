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


def test_gate_none_does_not_create_missing_opgate():
    data = {
        "metrics": [
            {
                "plan": "4",
                "timestamp": "2026-01-01T00:00:00Z",
                "agent": "pidex-security",
                "route_to": "pidex-implementer",
                "gate": "none",
                "_source_path": "state/metrics/x/plan-4.jsonl",
            }
        ],
        "orchestrator_events": [],
    }
    trace = mod.build_expected_observed(data, ["plan-004"])
    assert trace["expected_required"] == 2
    assert not any(f["operator_type"] == "OpGate" for f in trace["findings"])


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


def test_real_gate_with_matching_event_is_observed():
    data = {
        "metrics": [
            {
                "plan": "4",
                "timestamp": "2026-01-01T00:00:00Z",
                "agent": "pidex-uat",
                "gate": "G9",
                "_source_path": "state/metrics/x/plan-4.jsonl",
            }
        ],
        "orchestrator_events": [{"operator_type": "OpGate", "plan_key": "plan-004", "gate": "g9"}],
    }
    trace = mod.build_expected_observed(data, ["plan-004"])
    assert trace["expected_required"] == 2
    assert trace["observed_required"] == 1
    assert not any(f["operator_type"] == "OpGate" for f in trace["findings"])


def test_untracked_rule_change_parser_ignores_ledgered_paths():
    rows = [{"rule_path": "rules/pidex-qa/ledgered.md"}]
    status = " M rules/pidex-qa/index.md\n?? rules/pidex-qa/new-rule.md\n M rules/pidex-qa/ledgered.md\n M README.md\n"
    changes = mod.parse_git_status_rules(status, Path("/tmp/project"), rows)
    assert [c["path"] for c in changes] == ["rules/pidex-qa/index.md", "rules/pidex-qa/new-rule.md"]
    assert all(c["ledger_status"] == "untracked" for c in changes)


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
        "untracked_rule_changes": [{"path": "rules/pidex-qa/new.md", "git_status": "??", "owning_agent": "pidex-qa"}],
        "pidex_root_rule_actions": [{"action": "add", "rule_path": "rules/pidex-planner/root.md"}],
        "pidex_root_untracked_rule_changes": [{"path": "rules/pidex-planner/root-new.md", "git_status": "??", "owning_agent": "pidex-planner"}],
    }
    summary = mod.summarize(data, [])
    assert summary["confidence"] == "medium"
    assert summary["sample_size"]["pidex_root_rule_actions"] == 1
    assert summary["sample_size"]["pidex_root_untracked_rule_changes"] == 1
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "report.md"
        mod.write_markdown({"generated_at": "now", "project_path": "/tmp/project", "summary": summary}, out)
        text = out.read_text()
        assert "PIDEX Quality Report" in text
        assert "Expected-vs-Observed Operator Trace" in text
        assert "Rule-Action Ledger" in text
        assert "Untracked Rule Changes" in text
        assert "PIDEX Root Rule Hygiene" in text
        assert "rules/pidex-qa/new.md" in text
        assert "rules/pidex-planner/root-new.md" in text
        assert "routing-correctness" in text


if __name__ == "__main__":
    test_normalize_plan()
    test_gate_none_does_not_create_missing_opgate()
    test_expected_trace_detects_unlogged_spawn_route_gate()
    test_real_gate_with_matching_event_is_observed()
    test_untracked_rule_change_parser_ignores_ledgered_paths()
    test_review_state_selects_unreviewed_plans()
    test_markdown_and_json_report_shape()
    print("ok")
