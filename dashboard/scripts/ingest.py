#!/usr/bin/env python3
"""Ingest Running Pi metrics/artifacts into SQLite.

No third-party deps. Re-runnable; uses upserts keyed by source path.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
ANALYTICS = ROOT / "dashboard"
DEFAULT_DB = ANALYTICS / "data" / "pidex.sqlite"
PROVIDER_HISTORICAL_PATHS = ("claude", "gemini", "openrouter", "spark")
STATE_DIR = Path(os.environ.get("RUNNING_PI_STATE_DIR", str(ROOT / "state")))
METRICS_DIR = STATE_DIR / "metrics"
PIPELINE_EVENTS_DIR = STATE_DIR / "pipeline-events"

ROLES = {"critic", "critiques", "code-review", "security", "qa", "uat", "planning", "deployment"}

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  plan_key TEXT NOT NULL,
  timestamp TEXT,
  agent TEXT,
  provider TEXT,
  model TEXT,
  verdict TEXT,
  route_to TEXT,
  gate TEXT,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  cost_usd REAL,
  context_file TEXT,
  exit_code INTEGER,
  fallback_from TEXT,
  tool_count INTEGER,
  routing_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project_plan ON agent_runs(project_id, plan_key);
CREATE INDEX IF NOT EXISTS idx_agent_runs_model ON agent_runs(model);
CREATE INDEX IF NOT EXISTS idx_agent_runs_timestamp ON agent_runs(timestamp);

CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  plan_key TEXT,
  role TEXT,
  model_label TEXT,
  is_secondary INTEGER NOT NULL DEFAULT 0,
  has_routing INTEGER NOT NULL DEFAULT 0,
  verdict TEXT,
  route_to TEXT,
  gate TEXT,
  title TEXT,
  mtime TEXT,
  bytes INTEGER,
  content_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_plan ON artifacts(project_id, plan_key);
CREATE INDEX IF NOT EXISTS idx_artifacts_secondary ON artifacts(is_secondary, model_label);

CREATE TABLE IF NOT EXISTS merge_findings (
  id INTEGER PRIMARY KEY,
  artifact_path TEXT NOT NULL,
  row_index INTEGER NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  plan_key TEXT,
  source TEXT,
  severity TEXT,
  classification TEXT,
  disposition TEXT,
  summary TEXT,
  UNIQUE(artifact_path, row_index)
);
CREATE INDEX IF NOT EXISTS idx_merge_findings_class ON merge_findings(classification, disposition);

CREATE TABLE IF NOT EXISTS pipeline_events (
  id INTEGER PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  source_hash TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  project_path TEXT NOT NULL,
  project_slug TEXT,
  pipeline_id TEXT NOT NULL,
  plan_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT,
  actor TEXT,
  message TEXT,
  metadata_json TEXT,
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_project_plan ON pipeline_events(project_id, plan_key);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_pipeline ON pipeline_events(pipeline_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_status ON pipeline_events(status);
"""


def utc_from_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def safe_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", "ignore")).hexdigest()


def db_connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def project_id(conn: sqlite3.Connection, project_path: str) -> int:
    p = str(Path(project_path).expanduser())
    name = Path(p).name or p.replace("/", "-")
    conn.execute("INSERT OR IGNORE INTO projects(path, name) VALUES (?, ?)", (p, name))
    row = conn.execute("SELECT id FROM projects WHERE path = ?", (p,)).fetchone()
    return int(row["id"])


def metric_project_from_slug(slug: str) -> str:
    # metrics dir uses safePathSegment(cwd), e.g. home-daniel-projects-local-forge.ng
    if slug.startswith("home-"):
        return "/" + slug.replace("-", "/", 2).replace("/projects/local/", "/projects/local/", 1)
    return slug.replace("-", "/")


def normalize_plan_number(value: str) -> str:
    if len(value) < 3 and value.isdigit():
        return value.zfill(3)
    return value


def normalize_plan_key(rec: dict, fallback: str) -> str:
    explicit_plan = rec.get("plan")
    plan = explicit_plan or fallback
    context = rec.get("context_file") or ""
    m = re.search(r"(?:^|/)(\d{1,3})[-_]", context)
    if m and (not explicit_plan or plan in {"plan-1", "unknown-plan"} or plan == fallback):
        return f"plan-{normalize_plan_number(m.group(1))}"
    return plan


def is_historical_provider(value: str) -> bool:
    value = (value or "").strip().lower()
    if not value:
        return False
    if "codex" in value:
        return False
    return any(path in value for path in PROVIDER_HISTORICAL_PATHS)


def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def include_historical_provider_records() -> bool:
    return parse_bool(os.environ.get("PIDEX_INCLUDE_HISTORICAL_PROVIDERS"), default=False)


def ingest_metrics(conn: sqlite3.Connection) -> int:
    count = 0
    if not METRICS_DIR.exists():
        return 0
    for file in sorted(METRICS_DIR.glob("*/*.jsonl")):
        fallback_project = metric_project_from_slug(file.parent.name)
        plan_key = file.stem
        with file.open("r", encoding="utf-8", errors="ignore") as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                if not include_historical_provider_records() and is_historical_provider(rec.get("provider") or ""):
                    continue
                project_path = rec.get("project") or fallback_project
                pid = project_id(conn, project_path)
                normalized_plan = normalize_plan_key(rec, plan_key)
                source_hash = safe_hash(f"{file}:{line_no}:{line}")
                conn.execute(
                    """
                    INSERT OR REPLACE INTO agent_runs(
                      source_path, source_line, source_hash, project_id, plan_key, timestamp,
                      agent, provider, model, verdict, route_to, gate, duration_ms,
                      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                      cost_usd, context_file, exit_code, fallback_from, tool_count, routing_reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(file), line_no, source_hash, pid, normalized_plan, rec.get("timestamp"),
                        rec.get("agent"), rec.get("provider"), rec.get("model"), rec.get("agent_verdict"),
                        rec.get("route_to"), rec.get("gate"), rec.get("duration_ms"),
                        rec.get("input_tokens_estimate"), rec.get("output_tokens_estimate"),
                        rec.get("cache_read_tokens"), rec.get("cache_write_tokens"), rec.get("cost_usd_estimate"),
                        rec.get("context_file"), rec.get("exit_code"), rec.get("fallback_from"), rec.get("tool_count"),
                        rec.get("routing_reason"),
                    ),
                )
                count += 1
    return count


def normalize_pipeline_plan_key(value: str | None) -> str:
    plan = (value or "unknown-plan").strip() or "unknown-plan"
    m = re.fullmatch(r"(?:plan-)?(\d{1,3})", plan, re.I)
    if m:
        return f"plan-{normalize_plan_number(m.group(1))}"
    m = re.match(r"(?:plan-)?(\d{1,3})[-_]", plan, re.I)
    if m:
        return f"plan-{normalize_plan_number(m.group(1))}"
    if plan.lower().startswith("plan-"):
        return "plan-" + plan[5:]
    return plan


def ingest_pipeline_events(conn: sqlite3.Connection) -> int:
    count = 0
    if not PIPELINE_EVENTS_DIR.exists():
        return 0
    for file in sorted(PIPELINE_EVENTS_DIR.glob("*/*.jsonl")):
        with file.open("r", encoding="utf-8", errors="ignore") as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                project_path = rec.get("project_path") or rec.get("project")
                if not project_path:
                    continue
                timestamp = rec.get("timestamp") or utc_from_ts(file.stat().st_mtime)
                pipeline_id = rec.get("pipeline_id") or file.stem
                event_type = rec.get("event_type") or rec.get("event")
                if not pipeline_id or not event_type:
                    continue
                normalized_plan = normalize_pipeline_plan_key(rec.get("plan_key") or rec.get("plan"))
                pid = project_id(conn, project_path)
                metadata = rec.get("metadata")
                if metadata is None:
                    metadata_json = rec.get("metadata_json")
                else:
                    metadata_json = json.dumps(metadata, separators=(",", ":"), sort_keys=True)
                source_hash = safe_hash(f"{file}:{line_no}:{line}")
                conn.execute(
                    """
                    INSERT OR REPLACE INTO pipeline_events(
                      source_path, source_line, source_hash, timestamp, project_id, project_path,
                      project_slug, pipeline_id, plan_key, event_type, status, actor, message,
                      metadata_json, source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(file), line_no, source_hash, timestamp, pid, str(Path(project_path).expanduser()),
                        rec.get("project_slug"), pipeline_id, normalized_plan, event_type,
                        rec.get("status"), rec.get("actor"), rec.get("message"), metadata_json, rec.get("source"),
                    ),
                )
                count += 1
    return count


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


def extract_plan_key(path: Path, text: str) -> str | None:
    m = re.search(r"\b(?:plan|id|origin)\s*[:=]\s*([0-9][A-Za-z0-9._-]*)", text, re.I)
    if m:
        return "plan-" + m.group(1).lower().removeprefix("plan-")
    m = re.match(r"([0-9][A-Za-z0-9._-]*)[-_]", path.name)
    if m:
        return "plan-" + m.group(1).lower().removeprefix("plan-")
    return None


def artifact_role(path: Path) -> str | None:
    parts = list(path.parts)
    if "agents.output" not in parts:
        return None
    idx = parts.index("agents.output")
    return parts[idx + 1] if idx + 1 < len(parts) else None


def model_label(path: Path) -> str | None:
    name = path.name.lower()
    if ".deepseek.md" in name:
        return "deepseek"
    if ".minimax.md" in name:
        return "minimax"
    return None


def is_merge_artifact(path: Path, text: str) -> bool:
    name = path.name.lower()
    return ("merge" in name and ("summary" in name or name.endswith("-merge.md"))) or "parallel secondary" in text.lower()


def parse_markdown_table_rows(text: str) -> Iterable[list[str]]:
    for line in text.splitlines():
        line = line.strip()
        if not (line.startswith("|") and line.endswith("|")):
            continue
        if re.fullmatch(r"\|[\s:\-|]+\|", line):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) >= 3:
            yield cells


def ingest_merge_rows(conn: sqlite3.Connection, path: Path, pid: int, plan_key: str | None, text: str) -> int:
    conn.execute("DELETE FROM merge_findings WHERE artifact_path = ?", (str(path),))
    count = 0
    for idx, cells in enumerate(parse_markdown_table_rows(text), 1):
        joined = " | ".join(cells)
        low = joined.lower()
        if idx == 1 and ("source" in low or "finding" in low):
            continue
        if not any(t in low for t in ["secondary", "confirmed", "malformed", "contradicted", "accepted", "deferred", "critical", "high", "medium", "low", "minor"]):
            continue
        source = cells[0] if cells else ""
        severity = next((c for c in cells if re.search(r"\b(critical|high|medium|low|minor|info)\b", c, re.I)), "")
        classification = next((c for c in cells if re.search(r"secondary-only|confirmed-by|primary-only|duplicate|contradicted|malformed|no-evidence", c, re.I)), "")
        disposition = next((c for c in cells if re.search(r"accepted|deferred|duplicate|rejected|needs-primary|no-evidence", c, re.I)), "")
        summary = joined[:1000]
        conn.execute(
            """
            INSERT OR REPLACE INTO merge_findings(artifact_path, row_index, project_id, plan_key, source, severity, classification, disposition, summary)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (str(path), idx, pid, plan_key, source, severity, classification, disposition, summary),
        )
        count += 1
    return count


def discover_projects(args_projects: list[str]) -> list[Path]:
    projects = [Path(p).expanduser() for p in args_projects]
    for p in [Path("/home/daniel/projects/local/forge.ng"), Path("/home/daniel/homelab")]:
        if p.exists() and p not in projects:
            projects.append(p)
    # Include projects observed in metrics if they still exist.
    if METRICS_DIR.exists():
        for file in METRICS_DIR.glob("*/*.jsonl"):
            try:
                for line in file.read_text(errors="ignore").splitlines()[:5]:
                    rec = json.loads(line)
                    proj = rec.get("project")
                    if proj and Path(proj).exists() and Path(proj) not in projects:
                        projects.append(Path(proj))
                    break
            except Exception:
                pass
    return projects


def ingest_artifacts(conn: sqlite3.Connection, projects: list[Path]) -> tuple[int, int]:
    artifact_count = merge_count = 0
    for project in projects:
        out = project / "agents.output"
        if not out.exists():
            continue
        pid = project_id(conn, str(project))
        for path in sorted(out.rglob("*.md")):
            try:
                stat = path.stat()
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            routing = parse_routing(text)
            title = next((line.strip("# ").strip() for line in text.splitlines() if line.startswith("#")), path.stem)
            role = artifact_role(path)
            label = model_label(path)
            secondary = 1 if label else 0
            merge = is_merge_artifact(path, text)
            if not secondary and not merge:
                # Keep DB focused for phase 1.
                continue
            plan_key = extract_plan_key(path, text)
            conn.execute(
                """
                INSERT OR REPLACE INTO artifacts(path, project_id, plan_key, role, model_label, is_secondary, has_routing, verdict, route_to, gate, title, mtime, bytes, content_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(path), pid, plan_key, role, label, secondary, 1 if routing else 0,
                    routing.get("verdict"), routing.get("route_to"), routing.get("gate"), title[:300],
                    utc_from_ts(stat.st_mtime), stat.st_size, safe_hash(text),
                ),
            )
            artifact_count += 1
            if merge:
                merge_count += ingest_merge_rows(conn, path, pid, plan_key, text)
    return artifact_count, merge_count


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB))
    ap.add_argument("--project", action="append", default=[], help="Project root with agents.output; repeatable")
    args = ap.parse_args()

    conn = db_connect(Path(args.db))
    projects = discover_projects(args.project)
    metric_count = ingest_metrics(conn)
    pipeline_event_count = ingest_pipeline_events(conn)
    artifact_count, merge_count = ingest_artifacts(conn, projects)
    conn.commit()
    print(json.dumps({
        "db": str(Path(args.db)),
        "projects": [str(p) for p in projects],
        "agent_runs": metric_count,
        "pipeline_events": pipeline_event_count,
        "artifacts": artifact_count,
        "merge_findings": merge_count,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
