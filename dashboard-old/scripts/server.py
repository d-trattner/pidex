#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import subprocess
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from ingest import db_connect, ingest_metrics, ingest_pipeline_events
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
ANALYTICS = ROOT / "dashboard"
DB = ANALYTICS / "data" / "pidex.sqlite"
HISTORICAL_PROVIDER_MARKERS = ("claude", "gemini", "openrouter", "spark")
PROVIDER_SORT_ORDER = ("codex", "openai-codex", "gpt-5.3-codex", "gpt-5.3-codex-spark", "pi", "unknown")
PUBLIC = ANALYTICS / "public"
STATE = ROOT / "state"
ANALYSIS_DIR = ROOT / "analysis"
PROVIDER_LIMITS_SCRIPT = ROOT / "scripts" / "provider-limits" / "probe.py"


def rows(sql: str, params=()):
    if not DB.exists():
        return []
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, params).fetchall()]
    finally:
        con.close()


def one(sql: str, params=()):
    rs = rows(sql, params)
    return rs[0] if rs else {}


def project_filter(parsed):
    q = parse_qs(parsed.query)
    project = q.get("project", [""])[0]
    if not project:
        return "", ()
    return " AND (p.name = ? OR p.path = ?)", (project, project)


def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def is_historical_provider(value: str) -> bool:
    val = (value or "").strip().lower()
    if not val:
        return False
    if "codex" in val:
        return False
    return any(marker in val for marker in HISTORICAL_PROVIDER_MARKERS)


def provider_sort_key(provider: str) -> tuple[int, str]:
    value = (provider or "").strip().lower()
    for i, prefix in enumerate(PROVIDER_SORT_ORDER):
        if value.startswith(prefix):
            return (i, value)
    if value == "":
        return (len(PROVIDER_SORT_ORDER), "")
    return (len(PROVIDER_SORT_ORDER), value)


def provider_sql_filter(include_historical: bool, param_name: str = "ar.provider", provider: str | None = None) -> tuple[str, list[str]]:
    clauses: list[str] = []
    params: list[str] = []
    if provider:
        clauses.append(f"lower(coalesce({param_name}, '')) = ?")
        params.append(provider.lower())
    if not include_historical:
        for marker in HISTORICAL_PROVIDER_MARKERS:
            clauses.append(f"lower(coalesce({param_name}, '')) NOT LIKE ?")
            params.append(f"%{marker}%")
    return ("".join(f" AND {c}" for c in clauses), params)


def project_root(project: str) -> Path | None:
    row = one("SELECT path FROM projects WHERE name = ? OR path = ? LIMIT 1", (project, project))
    if not row.get("path"):
        return None
    return Path(row["path"]).resolve()


def safe_project_file(root: Path, rel: str) -> Path | None:
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return None
    path = (root / rel).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        return None
    return path if path.is_file() else None


def plan_document_path(root: Path, plan_key: str) -> Path | None:
    n = plan_key.replace("plan-", "")
    candidates = sorted((root / "agents.output" / "planning").glob(f"*{n}*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def git_infra_markers():
    manual = []
    marker_file = ROOT / "config" / "infra-markers.json"
    if marker_file.exists():
        try:
            manual = json.loads(marker_file.read_text(encoding="utf-8"))
        except Exception:
            manual = []
    try:
        proc = subprocess.run(
            [
                "git", "-C", str(ROOT), "log", "--date=short",
                "--pretty=format:%ad%x09%h%x09%s", "--",
                "agents", "rules", "skills/pidex", "pidex-instructions.md",
                "config/agents.json", "extensions", "scripts/evals", "package.json",
            ],
            check=False,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=3,
        )
        markers = []
        for line in proc.stdout.splitlines()[:80]:
            parts = line.split("\t", 2)
            if len(parts) == 3:
                markers.append({"date": parts[0], "commit": parts[1], "label": parts[2]})
        status = subprocess.run(["git", "-C", str(ROOT), "status", "--short"], check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3).stdout.strip()
        if status:
            markers.insert(0, {"date": "working-tree", "commit": "dirty", "label": "Uncommitted pidex infra changes", "kind": "proc"})
        return manual + markers
    except Exception:
        return manual


def refresh_metrics_only():
    try:
        conn = db_connect(DB)
        ingest_metrics(conn)
        ingest_pipeline_events(conn)
        conn.commit()
        conn.close()
    except Exception:
        pass


def provider_limits(cmd: list[str]) -> dict:
    proc = subprocess.run(
        ["python3", str(PROVIDER_LIMITS_SCRIPT), *cmd],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=20,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "provider limits command failed").strip())
    return json.loads(proc.stdout or "{}")


def safe_analysis_file(rel: str) -> Path | None:
    if not rel or rel.startswith("/") or ".." in Path(rel).parts:
        return None
    path = (ANALYSIS_DIR / rel).resolve()
    try:
        path.relative_to(ANALYSIS_DIR.resolve())
    except ValueError:
        return None
    return path if path.is_file() and path.suffix == ".md" else None


def analysis_docs(pattern: str, base: Path = ANALYSIS_DIR):
    if not base.exists():
        return []
    out = []
    for path in sorted(base.rglob(pattern), key=lambda p: p.stat().st_mtime, reverse=True):
        rel = str(path.relative_to(ANALYSIS_DIR))
        text = path.read_text(encoding="utf-8", errors="replace")[:20000]
        verdict = ""
        confidence = ""
        for line in text.splitlines():
            if line.lower().startswith("- verdict:"):
                verdict = line.split(":", 1)[1].strip()
            if line.lower().startswith("- confidence:"):
                confidence = line.split(":", 1)[1].strip()
        parts = path.name.split("-")
        plan = "-".join(parts[:2]) if len(parts) > 1 else path.stem
        out.append({
            "mtime": path.stat().st_mtime,
            "updated": __import__("datetime").datetime.fromtimestamp(path.stat().st_mtime, __import__("datetime").timezone.utc).isoformat(),
            "project_slug": path.parent.name,
            "plan_key": plan,
            "title": path.stem,
            "verdict": verdict,
            "confidence": confidence,
            "path": rel,
        })
    return out


def analysis_reports():
    return analysis_docs("*-pipeline-analysis.md", ANALYSIS_DIR)


def analysis_plans():
    return analysis_docs("*.md", ANALYSIS_DIR / "plans")


def parse_event_time(value: str | None):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _align_week_start(dt: datetime) -> datetime:
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(timezone.utc)
    return datetime(local.year, local.month, local.day, tzinfo=timezone.utc) - timedelta(days=local.isoweekday() - 1)


def _align_month_start(dt: datetime) -> datetime:
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=timezone.utc)
    local = dt.astimezone(timezone.utc)
    return datetime(local.year, local.month, 1, tzinfo=timezone.utc)


def _add_months(dt: datetime, months: int) -> datetime:
    y = dt.year
    m = dt.month + months
    y += (m - 1) // 12
    m = ((m - 1) % 12) + 1
    return datetime(y, m, 1, tzinfo=timezone.utc)


def _dt_to_ts_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _range_months(start: datetime, count: int):
    cur = _align_month_start(start)
    for _ in range(count):
        yield cur
        cur = _add_months(cur, 1)


def stale_pending_gate(data: dict, active_lead: dict | None) -> bool:
    if active_lead:
        return False
    sent = parse_event_time(data.get("sent_at"))
    if not sent:
        return False
    return (datetime.now(timezone.utc) - sent.astimezone(timezone.utc)).total_seconds() > 2 * 3600


def token_consumption_data(where="", params=(), granularity="week", page=0):
    if page < 0:
        page = 0
    window = int((granularity == "month") and 12 or 1)
    if window <= 0:
        window = 12 if granularity == "month" else 1

    base = one(f"""
      SELECT MAX(ar.timestamp) AS max_ts, MIN(ar.timestamp) AS min_ts
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE 1=1 {where}
    """, params)
    if not base.get("max_ts"):
        return {
            "agent_stats": [],
            "chart_agents": [],
            "weekly": {"rows": [], "agent_stats": [], "days": [], "has_older": False, "has_newer": False, "page": page, "start": None, "end": None},
            "monthly": {"rows": [], "agent_stats": [], "months": [], "has_older": False, "has_newer": False, "page": page, "window": window},
        }

    max_ts = parse_event_time(base["max_ts"])
    min_ts = parse_event_time(base["min_ts"])
    if not max_ts:
        max_ts = datetime.now(timezone.utc)
    if not min_ts:
        min_ts = max_ts

    agent_stats_rows = rows(f"""
      SELECT COALESCE(ar.agent, 'unknown') AS agent,
             COUNT(*) AS calls,
             SUM(COALESCE(ar.input_tokens, 0)) AS total_input_tokens,
             SUM(COALESCE(ar.output_tokens, 0)) AS total_output_tokens,
             SUM(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)) AS total_tokens,
             ROUND(AVG(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)), 1) AS avg_tokens
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE 1=1 {where}
      GROUP BY COALESCE(ar.agent, 'unknown')
      ORDER BY total_tokens DESC
    """, params)
    for row in agent_stats_rows:
        row["total_tokens"] = int(row.get("total_tokens") or 0)
        row["total_input_tokens"] = int(row.get("total_input_tokens") or 0)
        row["total_output_tokens"] = int(row.get("total_output_tokens") or 0)
        row["avg_tokens"] = int(round(float(row.get("avg_tokens") or 0)))
        row["calls"] = int(row.get("calls") or 0)

    chart_agents = [r["agent"] for r in agent_stats_rows[:8]]

    if granularity == "week":
        week_start = _align_week_start(max_ts) - timedelta(days=7 * page)
        week_end_exclusive = week_start + timedelta(days=7)
        week_rows = rows(f"""
          SELECT date(ar.timestamp) AS day, COALESCE(ar.agent, 'unknown') AS agent,
            SUM(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)) AS total_tokens
          FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
          WHERE ar.timestamp >= ? AND ar.timestamp < ? {where}
          GROUP BY day, COALESCE(ar.agent, 'unknown')
        """, (_dt_to_ts_iso(week_start), _dt_to_ts_iso(week_end_exclusive), *params))
        day_values = {}
        for row in week_rows:
            day = row.get("day")
            agent = row.get("agent")
            if not day or not agent:
                continue
            day_values.setdefault(day, {})[agent] = int(row.get("total_tokens") or 0)

        days = [(week_start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        out_rows = []
        weekday_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        for idx, day in enumerate(days):
            record = {"day": day, "label": weekday_labels[idx] if idx < 7 else datetime.strptime(day, "%Y-%m-%d").strftime("%a")}

            for agent in chart_agents:
                record[agent] = int(day_values.get(day, {}).get(agent, 0) or 0)
            record["total_tokens"] = sum(record.get(agent, 0) for agent in chart_agents)
            out_rows.append(record)
        oldest_week = _align_week_start(min_ts)
        return {
            "agent_stats": agent_stats_rows,
            "chart_agents": chart_agents,
            "weekly": {
                "start": week_start.date().isoformat(),
                "end": week_end_exclusive.date().isoformat(),
                "rows": out_rows,
                "days": days,
                "has_newer": page > 0,
                "has_older": week_start > oldest_week,
                "page": page,
                "agent_stats": chart_agents,
            },
            "monthly": {"rows": [], "months": [], "has_older": False, "has_newer": False, "page": 0, "window": 12},
        }

    month_start = _align_month_start(max_ts) - timedelta(days=0)
    target_month_start = _add_months(month_start, -page)
    month_window = max(3, min(18, int(window)))
    month_end = _add_months(target_month_start, month_window)

    monthly_rows = rows(f"""
      SELECT substr(ar.timestamp, 1, 7) AS month, COALESCE(ar.agent, 'unknown') AS agent,
        SUM(COALESCE(ar.input_tokens, 0) + COALESCE(ar.output_tokens, 0)) AS total_tokens
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE ar.timestamp >= ? AND ar.timestamp < ? {where}
      GROUP BY month, COALESCE(ar.agent, 'unknown')
      ORDER BY month
    """, (_dt_to_ts_iso(target_month_start), _dt_to_ts_iso(month_end), *params))

    month_labels = []
    for month in _range_months(target_month_start, month_window):
        month_labels.append(month.strftime("%Y-%m"))

    by_month_agent = {}
    for row in monthly_rows:
        key = row["month"]
        agent = row["agent"]
        by_month_agent.setdefault(key, {})[agent] = int(row["total_tokens"] or 0)

    monthly_chart_rows = []
    for m in month_labels:
        rec = {"month": m}
        for agent in chart_agents:
            rec[agent] = by_month_agent.get(m, {}).get(agent, 0)
        rec["total_tokens"] = sum(rec.get(agent, 0) for agent in chart_agents)
        monthly_chart_rows.append(rec)

    oldest_month = _align_month_start(min_ts)
    has_older = target_month_start > oldest_month
    return {
        "agent_stats": agent_stats_rows,
        "chart_agents": chart_agents,
        "weekly": {"rows": [], "days": [], "has_older": False, "has_newer": False, "page": 0, "start": None, "end": None},
        "monthly": {
            "start": target_month_start.date().isoformat(),
            "months": month_labels,
            "rows": monthly_chart_rows,
            "window": month_window,
            "has_newer": page > 0,
            "has_older": has_older,
            "page": page,
        },
    }


def live_state(where="", params=()):
    refresh_metrics_only()
    out = {"active_lead": None, "pending_gate": None, "latest_runs": [], "open_pipelines": [], "latest_by_agent": [], "recent_secondary": [], "summary": {}}
    active = STATE / "active-lead.id"
    if active.exists():
        lead = active.read_text(errors="ignore").strip()
        out["active_lead"] = {"id": lead}
        cwd = STATE / f"lead-{lead}.cwd"
        if cwd.exists():
            out["active_lead"]["cwd"] = cwd.read_text(errors="ignore").strip()
    pending = STATE / "pending-gate.json"
    if pending.exists():
        try:
            pending_data = json.loads(pending.read_text(errors="ignore"))
            if stale_pending_gate(pending_data, out["active_lead"]):
                out["stale_pending_gate"] = pending_data
            else:
                out["pending_gate"] = pending_data
        except Exception:
            out["pending_gate"] = {"error": "pending-gate.json unreadable"}
    out["latest_runs"] = rows(f"""
      SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.agent, ar.provider, ar.model, ar.verdict, ar.route_to, ar.gate, ar.duration_ms, ar.exit_code, ar.context_file
      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
      WHERE 1=1 {where}
      ORDER BY ar.timestamp DESC LIMIT 25
    """, params)
    event_open = rows(f"""
      WITH ranked AS (
        SELECT pe.*, p.name AS project,
          MIN(pe.timestamp) OVER (PARTITION BY pe.pipeline_id) AS started_at,
          ROW_NUMBER() OVER (PARTITION BY pe.pipeline_id ORDER BY pe.timestamp DESC, pe.id DESC) AS rn
        FROM pipeline_events pe JOIN projects p ON p.id = pe.project_id
        WHERE 1=1 {where}
      )
      SELECT project, plan_key, pipeline_id, started_at, timestamp AS last_at, event_type, status,
        actor, message, 'pipeline_events' AS source, 0 AS agent_runs, 0 AS distinct_agents, 0 AS failures, actor AS last_agent,
        CAST((julianday(COALESCE(timestamp, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400000 AS INTEGER) AS age_ms
      FROM ranked
      WHERE rn = 1
        AND event_type NOT IN ('pipeline_completed','pipeline_failed','pipeline_aborted','pipeline_cancelled')
      ORDER BY last_at DESC LIMIT 24
    """, params)
    inferred_open = rows(f"""
      WITH grouped AS (
        SELECT ar.project_id, p.name AS project, ar.plan_key,
          MIN(ar.timestamp) AS started_at,
          MAX(ar.timestamp) AS last_at,
          MAX(CASE WHEN ar.route_to IN ('pidex-roadmap','user') OR ar.verdict = 'Released' OR (ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') AND ar.verdict IN ('COMPLETE','APPROVED')) THEN ar.timestamp END) AS completed_at,
          COUNT(*) AS agent_runs,
          COUNT(DISTINCT ar.agent) AS distinct_agents,
          SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures,
          MAX(ar.agent) AS last_agent
        FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
        WHERE ar.plan_key IS NOT NULL {where}
          AND NOT EXISTS (SELECT 1 FROM pipeline_events pe WHERE pe.project_id = ar.project_id AND pe.plan_key = ar.plan_key)
        GROUP BY ar.project_id, p.name, ar.plan_key
      )
      SELECT project, plan_key, '' AS pipeline_id, started_at, last_at, '' AS event_type, 'inferred_unresolved' AS status,
        '' AS actor, 'Legacy inference from agent_runs; no pipeline lifecycle event exists.' AS message,
        'agent_runs_inferred' AS source, agent_runs, distinct_agents, failures, last_agent,
        CAST((julianday(COALESCE(last_at, CURRENT_TIMESTAMP)) - julianday(started_at)) * 86400000 AS INTEGER) AS age_ms
      FROM grouped
      WHERE completed_at IS NULL AND last_at >= datetime('now', '-12 hours')
      ORDER BY last_at DESC LIMIT 12
    """, params)
    out["open_pipelines"] = (event_open + inferred_open)[:24]
    out["latest_by_agent"] = rows(f"""
      WITH ranked AS (
        SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.agent, ar.provider, ar.model, ar.verdict, ar.route_to, ar.gate, ar.duration_ms, ar.context_file,
          ROW_NUMBER() OVER (PARTITION BY ar.agent ORDER BY ar.timestamp DESC) AS rn
        FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
        WHERE ar.agent IS NOT NULL {where}
      )
      SELECT timestamp, project, plan_key, agent, provider, model, verdict, route_to, gate, duration_ms, context_file
      FROM ranked WHERE rn = 1 ORDER BY timestamp DESC LIMIT 20
    """, params)
    out["recent_secondary"] = rows(f"""
      SELECT a.mtime, p.name AS project, a.plan_key, a.role, a.model_label, a.verdict, a.route_to, a.gate, a.has_routing, a.path
      FROM artifacts a JOIN projects p ON p.id = a.project_id
      WHERE a.is_secondary = 1 {where}
      ORDER BY a.mtime DESC LIMIT 12
    """, params)
    latest = out["latest_runs"][0] if out["latest_runs"] else {}
    out["summary"] = {
        "last_event_at": latest.get("timestamp"),
        "last_agent": latest.get("agent"),
        "last_route": latest.get("route_to"),
        "open_pipelines": len(out["open_pipelines"]),
        "running_pipelines": sum(1 for r in out["open_pipelines"] if r.get("source") == "pipeline_events" and r.get("status") == "running"),
        "unresolved_inferred": sum(1 for r in out["open_pipelines"] if r.get("source") == "agent_runs_inferred"),
        "pending_gate": bool(out["pending_gate"]),
        "active_lead": bool(out["active_lead"]),
    }
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def send_json(self, data, status=200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(min(length, 1024 * 1024)).decode("utf-8"))

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        try:
            if path in {"/api/provider-limits/profile", "/api/provider_limits/profile"}:
                data = self.read_json_body()
                profile = str(data.get("profile", ""))
                allowed_profiles = {p.stem for p in (ROOT / "config" / "profiles").glob("*.json")}
                if profile not in allowed_profiles:
                    return self.send_json({"error": "invalid profile"}, 400)
                return self.send_json(provider_limits(["use", profile]))
            return self.send_json({"error": "not found"}, 404)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        if not path.startswith("/api/"):
            return super().do_GET()
        try:
            if parsed.path == "/api/projects":
                return self.send_json(rows("SELECT name, path FROM projects ORDER BY name"))
            if parsed.path == "/api/provider-limits":
                q = parse_qs(parsed.query)
                include_historical = parse_bool(q.get("show_historical", [""])[0], default=False)
                payload = provider_limits(["refresh"] if q.get("refresh", [""])[0] == "1" else ["latest"])
                records = payload.get("records") if isinstance(payload, dict) else None
                if isinstance(records, list):
                    if not include_historical:
                        records = [r for r in records if not is_historical_provider(r.get("provider", ""))]
                    payload["records"] = sorted(
                        records,
                        key=lambda r: provider_sort_key(r.get("provider", "")),
                    )
                return self.send_json(payload)
            if parsed.path == "/api/summary":
                refresh_metrics_only()
                where, params = project_filter(parsed)
                pipeline = one(f"""
                  WITH started AS (
                    SELECT DISTINCT ar.project_id, ar.plan_key
                    FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                    WHERE ar.plan_key IS NOT NULL {where}
                  ), completed AS (
                    SELECT DISTINCT ar.project_id, ar.plan_key
                    FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                    WHERE ar.plan_key IS NOT NULL {where}
                      AND (ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') OR ar.route_to IN ('pidex-roadmap','user') OR ar.verdict IN ('Released','COMPLETE'))
                  )
                  SELECT (SELECT COUNT(*) FROM started) AS started, (SELECT COUNT(*) FROM completed) AS completed
                """, params + params)
                data = {
                    "projects": one(f"SELECT COUNT(DISTINCT p.id) AS count FROM projects p WHERE 1=1 {where}", params).get("count", 0),
                    "pipeline_runs": f"{pipeline.get('started', 0)} / {pipeline.get('completed', 0)}",
                    "pipeline_runs_started": pipeline.get("started", 0),
                    "pipeline_runs_completed": pipeline.get("completed", 0),
                    "pipeline_events": one(f"SELECT COUNT(*) AS count FROM pipeline_events pe JOIN projects p ON p.id = pe.project_id WHERE 1=1 {where}", params).get("count", 0),
                    "agent_runs": one(f"SELECT COUNT(*) AS count FROM agent_runs ar JOIN projects p ON p.id = ar.project_id WHERE 1=1 {where}", params).get("count", 0),
                    "secondary_artifacts": one(f"SELECT COUNT(*) AS count FROM artifacts a JOIN projects p ON p.id = a.project_id WHERE a.is_secondary = 1 {where}", params).get("count", 0),
                    "merge_artifacts": one(f"SELECT COUNT(DISTINCT mf.artifact_path) AS count FROM merge_findings mf JOIN projects p ON p.id = mf.project_id WHERE 1=1 {where}", params).get("count", 0),
                    "malformed_secondary": one(f"SELECT COUNT(*) AS count FROM artifacts a JOIN projects p ON p.id = a.project_id WHERE a.is_secondary = 1 AND a.has_routing = 0 {where}", params).get("count", 0),
                    "estimated_cost": one(f"SELECT ROUND(SUM(ar.cost_usd), 4) AS cost FROM agent_runs ar JOIN projects p ON p.id = ar.project_id WHERE 1=1 {where}", params).get("cost"),
                    "by_model": rows(f"SELECT COALESCE(model, model_label, 'unknown') AS model, COUNT(*) AS count FROM (SELECT ar.model, NULL AS model_label FROM agent_runs ar JOIN projects p ON p.id = ar.project_id WHERE 1=1 {where} UNION ALL SELECT NULL, a.model_label FROM artifacts a JOIN projects p ON p.id = a.project_id WHERE a.is_secondary = 1 {where}) GROUP BY 1 ORDER BY count DESC LIMIT 20", params + params),
                    "by_agent": rows(f"SELECT COALESCE(ar.agent, 'unknown') AS agent, COUNT(*) AS count FROM agent_runs ar JOIN projects p ON p.id = ar.project_id WHERE 1=1 {where} GROUP BY 1 ORDER BY count DESC", params),
                }
                return self.send_json(data)
            if parsed.path == "/api/runs":
                q = parse_qs(parsed.query)
                limit = min(int(q.get("limit", [500])[0]), 1000)
                include_historical = parse_bool(q.get("show_historical", [""])[0], default=False)
                provider_filter = q.get("provider", [""])[0].strip()
                where, params = project_filter(parsed)
                provider_where, provider_params = provider_sql_filter(include_historical, provider=provider_filter)
                return self.send_json(rows(f"""
                  SELECT ar.timestamp, p.name AS project, ar.plan_key, ar.agent, ar.provider, ar.model, ar.verdict, ar.route_to, ar.gate,
                         ar.duration_ms, ar.input_tokens, ar.output_tokens, ROUND(ar.cost_usd, 5) AS cost_usd, ar.context_file
                  FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                  WHERE 1=1 {where}{provider_where}
                  ORDER BY ar.timestamp DESC LIMIT ?
                """, params + tuple(provider_params) + (limit,)))
            if parsed.path == "/api/pipelines":
                where, params = project_filter(parsed)
                return self.send_json(rows(f"""
                  WITH grouped AS (
                    SELECT
                      ar.project_id,
                      p.name AS project,
                      ar.plan_key,
                      MIN(ar.timestamp) AS started_at,
                      MAX(CASE WHEN ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') OR ar.route_to IN ('pidex-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
                      COUNT(*) AS agent_runs,
                      COUNT(DISTINCT ar.agent) AS distinct_agents,
                      SUM(COALESCE(ar.duration_ms, 0)) AS total_runtime_ms,
                      SUM(COALESCE(ar.input_tokens, 0)) AS input_tokens,
                      SUM(COALESCE(ar.output_tokens, 0)) AS output_tokens,
                      ROUND(SUM(COALESCE(ar.cost_usd, 0)), 5) AS cost_usd,
                      SUM(CASE WHEN ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none' THEN 1 ELSE 0 END) AS gates,
                      SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures
                    FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                    WHERE ar.plan_key IS NOT NULL {where}
                    GROUP BY ar.project_id, p.name, ar.plan_key
                  )
                  SELECT *,
                    CAST((julianday(completed_at) - julianday(started_at)) * 86400000 AS INTEGER) AS wall_runtime_ms
                  FROM grouped
                  WHERE completed_at IS NOT NULL
                  ORDER BY completed_at DESC
                """, params))
            if parsed.path == "/api/charts/quality":
                where, params = project_filter(parsed)
                completed_cte = f"""
                  WITH grouped AS (
                    SELECT ar.project_id, p.name AS project, ar.plan_key,
                      MIN(ar.timestamp) AS started_at,
                      MAX(CASE WHEN ar.agent IN ('pidex-devops','pidex-roadmap','pidex-pi') OR ar.route_to IN ('pidex-roadmap','user') OR ar.verdict IN ('Released','COMPLETE') THEN ar.timestamp END) AS completed_at,
                      COUNT(*) AS agent_runs,
                      SUM(COALESCE(ar.duration_ms, 0)) AS total_runtime_ms,
                      SUM(COALESCE(ar.cost_usd, 0)) AS cost_usd,
                      SUM(CASE WHEN ar.gate IS NOT NULL AND ar.gate != '' AND ar.gate != 'none' THEN 1 ELSE 0 END) AS gates,
                      SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures
                    FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                    WHERE ar.plan_key IS NOT NULL {where}
                    GROUP BY ar.project_id, p.name, ar.plan_key
                  )
                """
                return self.send_json({
                    "completionByDay": rows(completed_cte + """
                      SELECT substr(started_at, 1, 10) AS day,
                        COUNT(*) AS started,
                        SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
                        ROUND(100.0 * SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS completion_rate
                      FROM grouped WHERE started_at IS NOT NULL GROUP BY day ORDER BY day
                    """, params),
                    "agentVerdicts": rows(f"""
                      SELECT COALESCE(ar.agent, 'unknown') AS agent, COALESCE(ar.verdict, 'unknown') AS verdict, COUNT(*) AS count
                      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                      WHERE 1=1 {where} GROUP BY ar.agent, ar.verdict ORDER BY ar.agent, count DESC
                    """, params),
                    "secondaryHealth": rows(f"""
                      SELECT a.model_label AS model, COUNT(*) AS total,
                        SUM(CASE WHEN a.has_routing = 1 THEN 1 ELSE 0 END) AS clean,
                        SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) AS malformed
                      FROM artifacts a JOIN projects p ON p.id = a.project_id
                      WHERE a.is_secondary = 1 {where} GROUP BY a.model_label ORDER BY a.model_label
                    """, params),
                    "mergeDisposition": rows(f"""
                      SELECT COALESCE(NULLIF(mf.disposition, ''), 'unknown') AS disposition, COUNT(*) AS count
                      FROM merge_findings mf JOIN projects p ON p.id = mf.project_id
                      WHERE 1=1 {where} GROUP BY 1 ORDER BY count DESC
                    """, params),
                    "mergeClassification": rows(f"""
                      SELECT COALESCE(NULLIF(mf.classification, ''), 'unknown') AS classification, COUNT(*) AS count
                      FROM merge_findings mf JOIN projects p ON p.id = mf.project_id
                      WHERE 1=1 {where} GROUP BY 1 ORDER BY count DESC
                    """, params),
                    "runtimeByAgent": rows(f"""
                      SELECT COALESCE(ar.agent, 'unknown') AS agent, ROUND(AVG(COALESCE(ar.duration_ms, 0)), 0) AS avg_ms, MAX(COALESCE(ar.duration_ms, 0)) AS max_ms, COUNT(*) AS count
                      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                      WHERE 1=1 {where} GROUP BY ar.agent ORDER BY avg_ms DESC LIMIT 14
                    """, params),
                    "costByModel": rows(f"""
                      SELECT COALESCE(ar.model, 'unknown') AS model, ROUND(SUM(COALESCE(ar.cost_usd, 0)), 4) AS cost, COUNT(*) AS count
                      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                      WHERE 1=1 {where} GROUP BY ar.model HAVING cost > 0 ORDER BY cost DESC LIMIT 12
                    """, params),
                    "gatesByPipeline": rows(completed_cte + """
                      SELECT project, plan_key, gates, failures, total_runtime_ms, cost_usd
                      FROM grouped WHERE completed_at IS NOT NULL ORDER BY gates DESC, completed_at DESC LIMIT 15
                    """, params),
                    "malformedByDay": rows(f"""
                      SELECT substr(a.mtime, 1, 10) AS day, COUNT(*) AS malformed
                      FROM artifacts a JOIN projects p ON p.id = a.project_id
                      WHERE a.is_secondary = 1 AND a.has_routing = 0 {where} GROUP BY day ORDER BY day
                    """, params),
                    "reworkByPipeline": rows(completed_cte + """
                      SELECT project, plan_key, agent_runs, gates, failures, ROUND(cost_usd, 4) AS cost_usd
                      FROM grouped WHERE completed_at IS NOT NULL ORDER BY agent_runs DESC LIMIT 15
                    """, params),
                    "plannerRevisionsByPlan": rows(f"""
                      SELECT p.name AS project, ar.plan_key, COUNT(*) AS planner_runs
                      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                      WHERE ar.agent = 'pidex-planner' {where}
                      GROUP BY p.name, ar.plan_key ORDER BY planner_runs DESC LIMIT 15
                    """, params),
                    "g9ByDay": rows(f"""
                      SELECT substr(ar.timestamp, 1, 10) AS day, COUNT(*) AS g9_events,
                        SUM(CASE WHEN lower(COALESCE(ar.verdict, '') || ' ' || COALESCE(ar.routing_reason, '')) LIKE '%reject%' THEN 1 ELSE 0 END) AS g9_rejections
                      FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                      WHERE ar.gate = 'G9' {where} GROUP BY day ORDER BY day
                    """, params),
                    "analystVerdicts": analysis_reports(),
                    "qualityImpactByDay": rows(f"""
                      WITH pipeline_day AS (
                        SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS started,
                          SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed,
                          ROUND(100.0 * SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS completion_rate,
                          ROUND(AVG(agent_runs), 2) AS avg_agent_runs,
                          ROUND(AVG(gates), 2) AS avg_gates
                        FROM ({completed_cte} SELECT * FROM grouped WHERE started_at IS NOT NULL)
                        GROUP BY day
                      ), agent_day AS (
                        SELECT substr(ar.timestamp, 1, 10) AS day, COUNT(*) AS runs,
                          SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END) AS failures,
                          ROUND(100.0 * (COUNT(*) - SUM(CASE WHEN ar.exit_code IS NOT NULL AND ar.exit_code != 0 THEN 1 ELSE 0 END)) / COUNT(*), 1) AS success_rate
                        FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                        WHERE ar.timestamp IS NOT NULL {where} GROUP BY day
                      ), secondary_day AS (
                        SELECT substr(a.mtime, 1, 10) AS day, COUNT(*) AS total,
                          SUM(CASE WHEN a.has_routing = 1 THEN 1 ELSE 0 END) AS clean,
                          SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) AS malformed,
                          ROUND(100.0 * SUM(CASE WHEN a.has_routing = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS routing_health_rate,
                          ROUND(100.0 * SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS malformed_rate
                        FROM artifacts a JOIN projects p ON p.id = a.project_id
                        WHERE a.is_secondary = 1 AND a.mtime IS NOT NULL {where} GROUP BY day
                      ), finding_day AS (
                        SELECT substr(a.mtime, 1, 10) AS day, COUNT(*) AS findings,
                          SUM(CASE WHEN lower(COALESCE(mf.disposition, '')) LIKE '%accept%' OR lower(COALESCE(mf.disposition, '')) LIKE '%defer%' OR lower(COALESCE(mf.classification, '')) LIKE '%confirm%' THEN 1 ELSE 0 END) AS useful,
                          ROUND(100.0 * SUM(CASE WHEN lower(COALESCE(mf.disposition, '')) LIKE '%accept%' OR lower(COALESCE(mf.disposition, '')) LIKE '%defer%' OR lower(COALESCE(mf.classification, '')) LIKE '%confirm%' THEN 1 ELSE 0 END) / COUNT(*), 1) AS useful_finding_rate
                        FROM merge_findings mf JOIN artifacts a ON a.path = mf.artifact_path JOIN projects p ON p.id = mf.project_id
                        WHERE a.mtime IS NOT NULL {where} GROUP BY day
                      ), dates AS (
                        SELECT day FROM pipeline_day UNION SELECT day FROM agent_day UNION SELECT day FROM secondary_day UNION SELECT day FROM finding_day
                      )
                      SELECT d.day, pd.completion_rate, ad.success_rate, sd.routing_health_rate, sd.malformed_rate,
                        fd.useful_finding_rate, pd.avg_agent_runs, pd.avg_gates,
                        pd.started, pd.completed, ad.runs AS agent_runs, ad.failures, sd.total AS secondary_artifacts, fd.findings AS merge_findings
                      FROM dates d
                      LEFT JOIN pipeline_day pd ON pd.day = d.day
                      LEFT JOIN agent_day ad ON ad.day = d.day
                      LEFT JOIN secondary_day sd ON sd.day = d.day
                      LEFT JOIN finding_day fd ON fd.day = d.day
                      ORDER BY d.day
                    """, params + params + params + params),
                    "infraMarkers": git_infra_markers(),
                })
            if path in {"/api/token-consumption", "/api/token_consumption"}:
                refresh_metrics_only()
                where, params = project_filter(parsed)
                q = parse_qs(parsed.query)
                granularity = q.get("granularity", ["week"])[0]
                if granularity not in {"week", "month"}:
                    return self.send_json({"error": "invalid granularity"}, 400)
                try:
                    page = int(q.get("page", ["0"])[0])
                except ValueError:
                    page = 0
                return self.send_json(token_consumption_data(where, params, granularity=granularity, page=page))

            if parsed.path == "/api/charts/model-quality":
                where, params = project_filter(parsed)
                import re
                # Normalize model name: strip common routing prefixes so
                # 'openai-codex/gpt-5.3-codex' and 'gpt-5.3-codex' merge as one model.
                _norm_model = lambda m: re.sub(r'^(?:openai-codex|openrouter)/', '', m) if m else m
                raw = rows(f"""
                  SELECT
                    ar.model,
                    ar.exit_code,
                    ar.agent,
                    COALESCE(ar.verdict, '') AS verdict,
                    COALESCE(ar.gate, '') AS gate,
                    COALESCE(ar.input_tokens, 0) AS input_tokens,
                    COALESCE(ar.output_tokens, 0) AS output_tokens,
                    COALESCE(ar.cost_usd, 0) AS cost_usd
                  FROM agent_runs ar JOIN projects p ON p.id = ar.project_id
                  WHERE ar.model IS NOT NULL AND ar.model != '' {where}
                  ORDER BY ar.timestamp
                """, params)
                # Group by normalized model name
                groups: dict[str, dict] = {}
                for r in raw:
                    raw_model = r.get('model') or 'unknown'
                    norm = _norm_model(raw_model)
                    if norm not in groups:
                        groups[norm] = {
                            'raw_models': set(),
                            'total': 0, 'success': 0, 'continuation': 0, 'rejection': 0, 'sigterm': 0,
                            'sum_tokens': 0, 'sum_cost': 0.0,
                        }
                    g = groups[norm]
                    g['raw_models'].add(raw_model)
                    g['total'] += 1
                    ec = r.get('exit_code')
                    v = r.get('verdict', '')
                    gate = r.get('gate', '')
                    is_ok = (ec is None or ec == 0) and v in ('APPROVED','APPROVED_WITH_COMMENTS','APPROVED_WITH_CONTROLS','COMPLETE')
                    is_continuation = r.get('agent') == 'pidex-implementer' and v in ('BLOCKED','IN_PROGRESS')
                    is_rejection = v == 'REJECTED' or gate in ('G1','G3','G5')
                    is_sigterm = ec is not None and ec != 0
                    g['success'] += 1 if is_ok else 0
                    g['continuation'] += 1 if is_continuation else 0
                    g['rejection'] += 1 if is_rejection else 0
                    g['sigterm'] += 1 if is_sigterm else 0
                    g['sum_tokens'] += int(r.get('input_tokens', 0)) + int(r.get('output_tokens', 0))
                    g['sum_cost'] += float(r.get('cost_usd', 0))
                models = []
                for norm, g in groups.items():
                    total = max(g['total'], 1)
                    success_rate = min(100.0, round(100.0 * g['success'] / total, 1))
                    continuation_rate = min(100.0, round(100.0 * g['continuation'] / total, 1))
                    rejection_rate = min(100.0, round(100.0 * g['rejection'] / total, 1))
                    sigterm_rate = min(100.0, round(100.0 * g['sigterm'] / total, 1))
                    avg_tok = g['sum_tokens'] / total
                    avg_cst = g['sum_cost'] / total
                    # Skip models with < 3 runs after normalization
                    if total < 3:
                        continue
                    # Token efficiency bonus (log scale)
                    if avg_tok < 1000:
                        tok_bonus = 10
                    elif avg_tok < 5000:
                        tok_bonus = 7
                    elif avg_tok < 20000:
                        tok_bonus = 4
                    elif avg_tok < 100000:
                        tok_bonus = 1
                    else:
                        tok_bonus = 0
                    # Cost efficiency bonus (log scale)
                    if avg_cst < 0.005:
                        cst_bonus = 10
                    elif avg_cst < 0.02:
                        cst_bonus = 7
                    elif avg_cst < 0.10:
                        cst_bonus = 4
                    elif avg_cst < 0.50:
                        cst_bonus = 1
                    else:
                        cst_bonus = 0
                    # Composite score 0-100
                    score = max(0, min(100, round(
                        100
                        - (100 - success_rate) * 0.25
                        - continuation_rate * 0.20
                        - rejection_rate * 0.20
                        - sigterm_rate * 0.15
                        + tok_bonus * 0.10
                        + cst_bonus * 0.10
                    )))
                    # Pick shortest raw model name as display label
                    raw_names = sorted(g['raw_models'], key=len)
                    models.append({
                        "model": norm,
                        "raw_model": raw_names[0],
                        "aliases": list(raw_names[1:]) if len(raw_names) > 1 else [],
                        "total_runs": total,
                        "quality_score": score,
                        "success_rate": success_rate,
                        "continuation_rate": continuation_rate,
                        "rejection_rate": rejection_rate,
                        "sigterm_rate": sigterm_rate,
                        "avg_tokens": int(round(avg_tok)),
                        "avg_cost": round(avg_cst, 6),
                        "total_cost": round(g['sum_cost'], 4),
                    })
                models.sort(key=lambda m: m['quality_score'], reverse=True)
                return self.send_json({"models": models})

            if parsed.path == "/api/secondary":
                where, params = project_filter(parsed)
                return self.send_json({
                    "by_model": rows(f"SELECT a.model_label, COUNT(*) AS count, SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) AS malformed FROM artifacts a JOIN projects p ON p.id = a.project_id WHERE a.is_secondary = 1 {where} GROUP BY a.model_label", params),
                    "by_role": rows(f"SELECT a.role, a.model_label, COUNT(*) AS count, SUM(CASE WHEN a.has_routing = 0 THEN 1 ELSE 0 END) AS malformed FROM artifacts a JOIN projects p ON p.id = a.project_id WHERE a.is_secondary = 1 {where} GROUP BY a.role, a.model_label ORDER BY a.role, a.model_label", params),
                    "merge_terms": rows(f"SELECT mf.classification, mf.disposition, COUNT(*) AS count FROM merge_findings mf JOIN projects p ON p.id = mf.project_id WHERE 1=1 {where} GROUP BY mf.classification, mf.disposition ORDER BY count DESC LIMIT 50", params),
                    "recent": rows(f"""
                      SELECT a.mtime, p.name AS project, a.plan_key, a.role, a.model_label, a.verdict, a.route_to, a.gate, a.has_routing, a.path
                      FROM artifacts a JOIN projects p ON p.id = a.project_id
                      WHERE a.is_secondary = 1 {where} ORDER BY a.mtime DESC LIMIT 100
                    """, params),
                })
            if parsed.path == "/api/malformed":
                where, params = project_filter(parsed)
                return self.send_json(rows(f"""
                  SELECT a.mtime, p.name AS project, a.plan_key, a.role, a.model_label, a.path, a.title
                  FROM artifacts a JOIN projects p ON p.id = a.project_id
                  WHERE a.is_secondary = 1 AND a.has_routing = 0 {where} ORDER BY a.mtime DESC
                """, params))
            if parsed.path == "/api/analysis":
                return self.send_json(analysis_reports())
            if parsed.path == "/api/analysis/plans":
                return self.send_json(analysis_plans())
            if parsed.path == "/api/analysis/document":
                q = parse_qs(parsed.query)
                path = safe_analysis_file(q.get("path", [""])[0])
                if not path:
                    return self.send_json({"error": "analysis document not found"}, 404)
                return self.send_json({"path": str(path.relative_to(ANALYSIS_DIR)), "markdown": path.read_text(encoding="utf-8", errors="replace")})
            if parsed.path == "/api/document":
                q = parse_qs(parsed.query)
                project = q.get("project", [""])[0]
                root = project_root(project)
                if not root:
                    return self.send_json({"error": "unknown project"}, 404)
                path = None
                if q.get("context_file", [""])[0]:
                    path = safe_project_file(root, q.get("context_file", [""])[0])
                elif q.get("plan_key", [""])[0]:
                    path = plan_document_path(root, q.get("plan_key", [""])[0])
                if not path:
                    return self.send_json({"error": "document not found"}, 404)
                return self.send_json({"project": project, "path": str(path), "markdown": path.read_text(encoding="utf-8", errors="replace")})
            if parsed.path == "/api/live":
                where, params = project_filter(parsed)
                return self.send_json(live_state(where, params))
            return self.send_json({"error": "not found"}, 404)
        except Exception as exc:
            return self.send_json({"error": str(exc)}, 500)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=18777)
    args = ap.parse_args()
    PUBLIC.mkdir(parents=True, exist_ok=True)
    print(f"Running Pi analytics: http://{args.host}:{args.port}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
