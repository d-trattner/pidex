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


def test_rule_actions_are_operator_facts():
    data = {
        "metrics": [],
        "pipeline_events": [],
        "orchestrator_events": [],
        "rule_actions": [
            {
                "plan_key": "plan-004",
                "action": "add",
                "status": "monitoring",
                "rule_path": "rules/pidex-qa/example.md",
                "owning_agent": "pidex-qa",
                "approval_source": "user",
                "expected_impact_dimension": "gate-clarity",
                "expected_direction": "increase",
            }
        ],
        "routing_artifacts": [],
        "rules": [],
        "untracked_rule_changes": [],
        "pidex_root_rule_actions": [],
        "pidex_root_untracked_rule_changes": [],
    }
    summary = mod.summarize(data, ["plan-004"])
    assert summary["operator_trace"]["observed_operator_events"]["OpRuleAction"] == 1
    assert summary["rule_actions_as_operators"][0]["operator_type"] == "OpRuleAction"


def test_terminal_event_expects_quality_review():
    data = {
        "metrics": [],
        "pipeline_events": [{"plan": "4", "event_type": "pipeline_completed", "_source_path": "state/pipeline-events/x.jsonl"}],
        "orchestrator_events": [],
        "rule_actions": [],
    }
    trace = mod.build_expected_observed(data, ["plan-004"])
    assert trace["expected_required"] == 1
    assert any(f["operator_type"] == "OpQualityReview" for f in trace["findings"])


def test_terminal_event_with_quality_review_is_observed():
    data = {
        "metrics": [],
        "pipeline_events": [{"plan": "4", "event_type": "pipeline_completed"}],
        "orchestrator_events": [{"operator_type": "OpQualityReview", "plan_key": "plan-004"}],
        "rule_actions": [],
    }
    trace = mod.build_expected_observed(data, ["plan-004"])
    assert trace["expected_required"] == 1
    assert trace["observed_required"] == 1
    assert not trace["findings"]


def test_user_corrections_are_summarized():
    data = {
        "metrics": [],
        "pipeline_events": [],
        "orchestrator_events": [
            {
                "operator_type": "OpUserCorrection",
                "plan_key": "plan-004",
                "severity": "medium",
                "logical_decision": {"correction_type": "routing", "summary": "wrong next agent"},
            }
        ],
        "rule_actions": [],
        "routing_artifacts": [],
        "rules": [],
        "untracked_rule_changes": [],
        "pidex_root_rule_actions": [],
        "pidex_root_untracked_rule_changes": [],
    }
    summary = mod.summarize(data, ["plan-004"])
    assert summary["user_corrections_by_type"] == {"routing": 1}
    assert summary["user_corrections_by_severity"] == {"medium": 1}


def test_release_decisions_are_summarized():
    data = {
        "metrics": [],
        "pipeline_events": [],
        "orchestrator_events": [
            {
                "operator_type": "OpReleaseDecision",
                "plan_key": "plan-004",
                "source_artifact": "agents.output/devops/4-devops.md",
                "reason": "approved release",
                "logical_decision": {"release_action": "push-tag", "approved_by": "user"},
                "physical_action": {"release_action": "push-tag", "outcome": "completed"},
            }
        ],
        "rule_actions": [],
        "routing_artifacts": [],
        "rules": [],
        "untracked_rule_changes": [],
        "pidex_root_rule_actions": [],
        "pidex_root_untracked_rule_changes": [],
    }
    summary = mod.summarize(data, ["plan-004"])
    assert summary["release_decisions_by_action"] == {"push-tag": 1}
    assert summary["release_decisions_by_outcome"] == {"completed": 1}


def test_context_packs_are_summarized():
    data = {
        "metrics": [],
        "pipeline_events": [],
        "orchestrator_events": [
            {
                "operator_type": "OpContextPack",
                "plan_key": "plan-004",
                "agent": "pidex-implementer",
                "confidence": "medium",
                "logical_decision": {"context_paths_detected": 2},
                "physical_action": {"estimated_token_class": "medium", "budget_warning": False, "context_paths": ["agents.output/planning/4-plan.md", "rules/pidex-implementer/index.md"]},
            },
            {
                "operator_type": "OpContextPack",
                "plan_key": "plan-004",
                "agent": "pidex-qa",
                "physical_action": {"estimated_token_class": "large", "budget_warning": True, "context_paths": []},
            },
        ],
        "rule_actions": [],
        "routing_artifacts": [],
        "rules": [],
        "untracked_rule_changes": [],
        "pidex_root_rule_actions": [],
        "pidex_root_untracked_rule_changes": [],
    }
    summary = mod.summarize(data, ["plan-004"])
    assert summary["context_packs_by_size"] == {"medium": 1, "large": 1}
    assert summary["context_pack_budget_warnings"] == 1


def test_preflights_are_summarized():
    data = {
        "metrics": [],
        "pipeline_events": [],
        "orchestrator_events": [
            {
                "operator_type": "OpPreflight",
                "plan_key": "unknown-plan",
                "confidence": "low",
                "logical_decision": {"task_class": "bugfix", "initial_task_provided": True, "existing_project": True},
                "physical_action": {"grill_decision_pending": True, "delegate_auth_ok": True},
            }
        ],
        "rule_actions": [],
        "routing_artifacts": [],
        "rules": [],
        "untracked_rule_changes": [],
        "pidex_root_rule_actions": [],
        "pidex_root_untracked_rule_changes": [],
    }
    summary = mod.summarize(data, ["plan-004"])
    assert summary["preflights_by_task_class"] == {"bugfix": 1}
    assert summary["preflight_grill_pending"] == 1


def test_reviews_are_summarized():
    data = {
        "metrics": [],
        "pipeline_events": [],
        "orchestrator_events": [
            {
                "operator_type": "OpReview",
                "plan_key": "plan-004",
                "agent": "pidex-qa",
                "confidence": "medium",
                "physical_action": {"verdict": "APPROVED", "gate": "G9", "finding_counts": {"critical": 1, "minor": 2}},
            },
            {
                "operator_type": "OpReview",
                "plan_key": "plan-004",
                "agent": "pidex-security",
                "physical_action": {"verdict": "REJECTED", "finding_counts": {"critical": 2}},
            },
        ],
        "rule_actions": [],
        "routing_artifacts": [],
        "rules": [],
        "untracked_rule_changes": [],
        "pidex_root_rule_actions": [],
        "pidex_root_untracked_rule_changes": [],
    }
    summary = mod.summarize(data, ["plan-004"])
    assert summary["reviews_by_agent"] == {"pidex-qa": 1, "pidex-security": 1}
    assert summary["reviews_by_verdict"] == {"APPROVED": 1, "REJECTED": 1}
    assert summary["review_finding_counts"] == {"critical": 3, "minor": 2}


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
    test_rule_actions_are_operator_facts()
    test_terminal_event_expects_quality_review()
    test_terminal_event_with_quality_review_is_observed()
    test_user_corrections_are_summarized()
    test_release_decisions_are_summarized()
    test_context_packs_are_summarized()
    test_preflights_are_summarized()
    test_reviews_are_summarized()
    test_markdown_and_json_report_shape()
    print("ok")
