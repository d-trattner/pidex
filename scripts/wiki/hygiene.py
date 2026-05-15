#!/usr/bin/env python3
"""PIDEX wiki hygiene audit/cadence helper."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}
SCORE_COST = {"critical": 25, "high": 10, "medium": 4, "low": 1}
EXCLUDE_DIRS = {"node_modules", ".git", "dist", "build", ".cache", "coverage", ".wiki-migration"}
ROOT_EXEMPT_RE = re.compile(r"^(wiki/(index\.md|log\.md|session-memory/index\.md)|wiki/hygiene/)")
ALLOW_RE = re.compile(r"(\$\{|\$\(|\$[A-Z_]|YOUR_|CHANGE_?ME|PLACEHOLDER|EXAMPLE|changeme|dummy|fake[_-]|test[_-]|sample|<YOUR|\{\{|\{%|xxxxxxx|0{8,}|1{8,})")
SECRET_PATTERNS = [
    ("private-key", re.compile(r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY BLOCK-----")),  # PIDEX_SECRET_PATTERN_LITERAL
    ("aws-token", re.compile(r"(AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}")),
    ("gcp-api-key", re.compile(r"AIza[A-Za-z0-9_-]{35}")),
    ("stripe-token", re.compile(r"[sr]k_(live|test)_[a-zA-Z0-9]{24,99}|whsec_[a-zA-Z0-9]{32,64}")),
    ("github-token", re.compile(r"ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|ghs_[A-Za-z0-9]{36}|ghr_[A-Za-z0-9]{76}|github_pat_[A-Za-z0-9_]{82}")),
    ("gitlab-token", re.compile(r"glpat-[A-Za-z0-9_-]{20}|glptt-[a-f0-9]{40}|gldt-[A-Za-z0-9_-]{20}")),
    ("slack-token", re.compile(r"xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}|xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[a-f0-9]{32}|hooks\.slack\.com/services/T[A-Z0-9]{8,10}/B[A-Z0-9]{8,10}/[A-Za-z0-9]{24}")),
    ("telegram-token", re.compile(r"[0-9]{8,10}:[A-Za-z0-9_-]{35}")),
    ("discord-webhook", re.compile(r"discord(app)?\.com/api/webhooks/[0-9]{17,19}/[A-Za-z0-9_-]{68}")),
    ("openai-token", re.compile(r"sk-proj-[A-Za-z0-9_-]{48,}")),
    ("anthropic-token", re.compile(r"sk-ant-api03-[A-Za-z0-9_-]{93}")),
    ("npm-token", re.compile(r"npm_[A-Za-z0-9]{36}")),
    ("pypi-token", re.compile(r"pypi-[A-Za-z0-9_-]{50,}")),
    ("connection-string", re.compile(r"(postgres(ql)?|mysql|redis|amqps?)://[^:]+:[^@]+@[^\s)\]\"']+|mongodb(\+srv)?://[^:]+:[^@]+@[^\s)\]\"']+")),
]
MD_LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
WIKI_LINK_RE = re.compile(r"(!?)\[\[([^\]]+)\]\]")
FRONT_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)


def utc_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")


def rel(project: Path, p: Path) -> str:
    return p.resolve().relative_to(project.resolve()).as_posix()


def parse_frontmatter(text: str) -> dict[str, Any]:
    m = FRONT_RE.match(text)
    if not m:
        return {}
    out: dict[str, Any] = {}
    for raw in m.group(1).splitlines():
        if ":" not in raw or raw.lstrip().startswith("#"):
            continue
        k, v = raw.split(":", 1)
        key = k.strip()
        val = v.strip().strip('"\'')
        if val.startswith("[") and val.endswith("]"):
            val = [x.strip().strip('"\'') for x in val[1:-1].split(",") if x.strip()]
        out[key] = val
    return out


def title_for(path: Path, text: str, fm: dict[str, Any]) -> str:
    if isinstance(fm.get("title"), str) and fm["title"].strip():
        return fm["title"].strip()
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem.replace("-", " ").replace("_", " ").title()


def classify(rp: str, fm: dict[str, Any], title: str) -> str:
    low = f"{rp} {fm.get('type','')} {title}".lower()
    if rp == "wiki/index.md": return "index"
    if rp == "wiki/log.md": return "log"
    if "session-memory/" in rp: return "session-memory"
    if "hygiene/" in rp or fm.get("type") == "wiki-hygiene-report": return "hygiene-report"
    if "out-of-scope" in low: return "out-of-scope"
    if "open-item" in low or "open-items" in low: return "open-item"
    if "retrospective" in low or "retro" in low: return "retrospective"
    if "adr" in low: return "adr"
    if fm.get("type") == "decision" or "decisions/" in rp: return "decision"
    if "rule" in low: return "rule"
    if fm.get("type") in {"concept", "entity", "migration-note"}: return str(fm["type"])
    return "unknown"


def git_date(project: Path, file: Path) -> str | None:
    try:
        cp = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(file)], cwd=project, text=True, capture_output=True, timeout=3)
        return cp.stdout.strip() or None
    except Exception:
        return None


def iter_md(wiki: Path, include_archives: bool) -> list[Path]:
    if not wiki.exists():
        return []
    files: list[Path] = []
    for p in wiki.rglob("*.md"):
        parts = set(p.relative_to(wiki).parts)
        if not include_archives and parts & EXCLUDE_DIRS:
            continue
        files.append(p)
    return sorted(files)


def redact_line(line: str) -> str:
    def repl(m: re.Match[str]) -> str:
        s = m.group(0)
        if len(s) <= 12:
            return "<redacted>"
        return s[:4] + "…" + s[-4:]
    for _, pat in SECRET_PATTERNS:
        line = pat.sub(repl, line)
    return line


def normalize_title(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def add_finding(findings: list[dict[str, Any]], counters: dict[str, int], severity: str, category: str, file: str, line: int | None, evidence: str, recommendation: str, safe_action: str = "manual-review") -> None:
    counters[severity] += 1
    prefix = {"critical":"WH-C", "high":"WH-H", "medium":"WH-M", "low":"WH-L"}[severity]
    findings.append({
        "id": f"{prefix}{counters[severity]:03d}", "severity": severity, "category": category,
        "file": file, "line": line, "evidence": evidence[:500], "recommendation": recommendation, "safe_action": safe_action,
    })


def resolve_md_link(project: Path, wiki: Path, source: Path, target: str, md_files: list[Path]) -> tuple[bool, str, bool]:
    target = target.split("#", 1)[0].split("?", 1)[0].strip()
    if not target or target.startswith("#") or re.match(r"^(https?|mailto|tel):", target):
        return True, target, False
    candidate = (source.parent / target).resolve()
    if candidate.exists():
        return True, rel(project, candidate), False
    return False, target, False


def resolve_wikilink(project: Path, wiki: Path, target: str, md_files: list[Path]) -> tuple[bool, str, bool]:
    target = target.split("|", 1)[0].split("#", 1)[0].strip()
    if not target:
        return True, target, False
    cands = [wiki / target, wiki / (target + ".md")]
    for c in cands:
        if c.exists():
            return True, rel(project, c), False
    stem = Path(target).stem.lower()
    matches = [p for p in md_files if p.stem.lower() == stem]
    if len(matches) == 1:
        return True, rel(project, matches[0]), False
    if len(matches) > 1:
        return False, target, True
    return False, target, False


def audit(args: argparse.Namespace) -> int:
    project = Path(args.project).expanduser().resolve()
    wiki = project / "wiki"
    out_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else project / "agents.output" / "wiki-hygiene"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = utc_stamp()
    report_md = out_dir / f"{stamp}-report.md"
    report_json = out_dir / f"{stamp}-report.json"
    findings: list[dict[str, Any]] = []
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    inventory: list[dict[str, Any]] = []
    outgoing: dict[str, set[str]] = {}
    incoming: dict[str, set[str]] = {}
    md_files = iter_md(wiki, args.include_archives)
    links_checked = 0

    if not wiki.exists():
        add_finding(findings, counts, "critical", "structure", "wiki/", None, "wiki directory missing", "Create canonical <project-root>/wiki/ with index.md and log.md")
    else:
        if not (wiki / "index.md").exists():
            add_finding(findings, counts, "critical", "structure", "wiki/index.md", None, "index.md missing", "Create wiki/index.md")
        if not (wiki / "log.md").exists():
            add_finding(findings, counts, "high", "structure", "wiki/log.md", None, "log.md missing", "Create wiki/log.md")

    by_title: dict[str, list[str]] = {}
    by_norm: dict[str, list[str]] = {}
    file_texts: dict[str, str] = {}

    for p in md_files:
        rp = rel(project, p)
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            add_finding(findings, counts, "high", "unreadable", rp, None, str(e), "Fix file permissions/encoding")
            continue
        file_texts[rp] = text
        fm = parse_frontmatter(text)
        title = title_for(p, text, fm)
        klass = classify(rp, fm, title)
        by_title.setdefault(title.lower(), []).append(rp)
        by_norm.setdefault(normalize_title(title), []).append(rp)
        outgoing.setdefault(rp, set())
        incoming.setdefault(rp, set())
        updated = fm.get("updated") or git_date(project, p) or dt.datetime.fromtimestamp(p.stat().st_mtime).date().isoformat()
        inventory.append({
            "path": rp, "title": title, "type": fm.get("type"), "status": fm.get("status"),
            "created": fm.get("created"), "updated": updated, "tags": fm.get("tags") or [],
            "size_bytes": p.stat().st_size, "line_count": len(text.splitlines()),
            "frontmatter_present": bool(fm), "linked_from_count": 0, "outgoing_links_count": 0, "classification": klass,
        })
        # secrets and legacy refs
        secret_hits = 0
        for i, line in enumerate(text.splitlines(), 1):
            if "agents.wiki" in line:
                sev = "critical" if re.search(r"write|create|update|save", line, re.I) else "medium"
                add_finding(findings, counts, sev, "legacy-path", rp, i, line.strip(), "Update active references to canonical wiki/")
            if ".wiki-migration/archive" in line or "~/obsidian-wikis/wiki-" in line:
                add_finding(findings, counts, "low", "legacy-path", rp, i, line.strip(), "Ensure reference is historical/migration-only")
            for cat, pat in SECRET_PATTERNS:
                if pat.search(line) and not ALLOW_RE.search(line):
                    secret_hits += 1
                    if secret_hits <= 3:
                        add_finding(findings, counts, "critical", "possible-secret", rp, i, redact_line(line.strip()), f"Remove or rotate suspected {cat}; keep only placeholders")
        # links
        for m in MD_LINK_RE.finditer(text):
            target = m.group(1).strip()
            ok, resolved, ambiguous = resolve_md_link(project, wiki, p, target, md_files)
            if target.startswith("#") or re.match(r"^(https?|mailto|tel):", target):
                continue
            links_checked += 1
            if ok:
                if resolved.startswith("wiki/"):
                    outgoing[rp].add(resolved); incoming.setdefault(resolved, set()).add(rp)
            else:
                sev = "high" if rp == "wiki/index.md" else "medium"
                add_finding(findings, counts, sev, "broken-link", rp, text[:m.start()].count("\n")+1, target, "Update or remove broken Markdown link")
        for m in WIKI_LINK_RE.finditer(text):
            target = m.group(2).strip()
            ok, resolved, ambiguous = resolve_wikilink(project, wiki, target, md_files)
            links_checked += 1
            if ok:
                if resolved.startswith("wiki/"):
                    outgoing[rp].add(resolved); incoming.setdefault(resolved, set()).add(rp)
            else:
                add_finding(findings, counts, "medium", "ambiguous-link" if ambiguous else "broken-wikilink", rp, text[:m.start()].count("\n")+1, target, "Resolve wikilink target or make path explicit")

    # post inventory
    inv_by_path = {x["path"]: x for x in inventory}
    for rp, srcs in incoming.items():
        if rp in inv_by_path:
            inv_by_path[rp]["linked_from_count"] = len(srcs)
    for rp, dests in outgoing.items():
        if rp in inv_by_path:
            inv_by_path[rp]["outgoing_links_count"] = len(dests)
    for title, paths in by_title.items():
        if len(paths) > 1:
            add_finding(findings, counts, "medium", "duplicate-title", paths[0], None, f"Duplicate title in: {', '.join(paths)}", "Review duplicate titles")
    for norm, paths in by_norm.items():
        if norm and len(paths) > 1:
            active_decisions = [p for p in paths if inv_by_path.get(p, {}).get("classification") in {"decision", "adr"} and (inv_by_path.get(p, {}).get("status") in {"active", None, ""})]
            add_finding(findings, counts, "high" if len(active_decisions) > 1 else "medium", "duplicate-normalized-title", paths[0], None, f"Similar title/path in: {', '.join(paths)}", "Review possible duplicate/conflict")
    now = dt.datetime.now(dt.timezone.utc).date()
    for item in inventory:
        rp = item["path"]
        if not ROOT_EXEMPT_RE.match(rp) and item["linked_from_count"] == 0:
            sev = "medium" if item["frontmatter_present"] or item["title"] else "low"
            add_finding(findings, counts, sev, "orphan", rp, None, "No incoming links from non-hygiene wiki pages", "Link from index/MOC or mark archival")
        updated = str(item.get("updated") or "")[:10]
        try:
            age = (now - dt.date.fromisoformat(updated)).days
        except Exception:
            age = -1
        if age >= args.stale_days:
            klass = item["classification"]
            sev = "medium" if klass in {"decision", "adr", "rule", "open-item"} else "low"
            text = file_texts.get(rp, "")
            if klass == "session-memory" and not re.search(r"TODO|FIXME|open item|next step|blocked|pending", text, re.I):
                sev = "low"
            add_finding(findings, counts, sev, "stale-page", rp, None, f"updated={updated}, age_days={age}", "Review freshness or update frontmatter")
        if re.search(r"TODO|FIXME|open item|next step|blocked|pending", file_texts.get(rp, ""), re.I) and age >= args.stale_days:
            add_finding(findings, counts, "medium", "stale-open-item", rp, None, f"open-item marker older than {args.stale_days} days", "Review whether item is still open")

    score = max(0, 100 - sum(counts[s] * SCORE_COST[s] for s in counts))
    findings.sort(key=lambda f: (SEV_ORDER[f["severity"]], f["id"]))
    data = {
        "schema_version": 1, "project_root": str(project), "wiki_root": str(wiki), "created_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "mode": "audit", "score": score,
        "summary": {"files_scanned": len(md_files), "links_checked": links_checked, **counts},
        "findings": findings, "inventory": inventory, "safe_fixes": [],
    }
    report_json.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    if not args.json_only:
        report_md.write_text(render_md(project, data), encoding="utf-8")
    result = {"ok": True, "report_md": str(report_md), "report_json": str(report_json), "critical": counts["critical"], "high": counts["high"], "score": score}
    print(f"Wiki hygiene audit complete: {report_md}")
    print("PIDEX_WIKI_HYGIENE_RESULT=" + json.dumps(result, separators=(",", ":")))
    if args.fail_on_critical and counts["critical"]:
        return 1
    return 0


def render_md(project: Path, data: dict[str, Any]) -> str:
    name = project.name
    s = data["summary"]
    lines = [
        "---", f"title: Wiki Hygiene Report — {name}", "type: wiki-hygiene-report", "status: draft", f"created: {data['created_at'][:10]}", f"project: {name}", "mode: audit", f"score: {data['score']}", "---", "", f"# Wiki Hygiene Report — {name}", "", "## Summary", "", f"- score: {data['score']}/100", f"- critical: {s['critical']}", f"- high: {s['high']}", f"- medium: {s['medium']}", f"- low: {s['low']}", f"- files scanned: {s['files_scanned']}", f"- links checked: {s['links_checked']}", "",
    ]
    groups = [("Critical findings", "critical"), ("High findings", "high"), ("Medium findings", "medium"), ("Low findings", "low")]
    for title, sev in groups:
        lines += [f"## {title}", ""]
        fs = [f for f in data["findings"] if f["severity"] == sev]
        if not fs:
            lines += ["None.", ""]
        for f in fs:
            loc = f["file"] + (f":{f['line']}" if f.get("line") else "")
            lines += [f"### {f['id']} — {f['category']}", "", f"- severity: {f['severity']}", f"- file: `{loc}`", f"- evidence: `{f['evidence']}`", f"- recommendation: {f['recommendation']}", f"- safe action: {f['safe_action']}", ""]
    for title, cat in [("Broken links", "broken"), ("Orphans", "orphan"), ("Stale pages", "stale"), ("Legacy path references", "legacy-path"), ("Possible secrets", "possible-secret")]:
        lines += [f"## {title}", ""]
        fs = [f for f in data["findings"] if cat in f["category"]]
        if not fs: lines += ["None.", ""]
        else:
            for f in fs[:50]: lines += [f"- {f['id']} `{f['file']}` — {f['recommendation']}"]
            lines.append("")
    lines += ["## Suggested safe fixes", "", "No changes executed. Review findings above.", "", "## Apply plan", "", "Not executed. Apply mode requires explicit user approval.", ""]
    return "\n".join(lines)


def cadence(args: argparse.Namespace) -> int:
    project = Path(args.project).expanduser().resolve()
    wiki = project / "wiki"
    if not wiki.exists():
        return 0
    state = wiki / ".hygiene-state.json"
    try:
        data = json.loads(state.read_text(encoding="utf-8")) if state.exists() else {}
        data.setdefault("schema_version", 1)
        data.setdefault("pipeline_runs_since_hygiene", 0)
        data.setdefault("last_hygiene_at", None)
        data.setdefault("last_hygiene_report", None)
        data.setdefault("last_hygiene_status", "never-run")
        data.setdefault("cadence_runs", 10)
        data["pipeline_runs_since_hygiene"] = int(data.get("pipeline_runs_since_hygiene") or 0) + 1
        data["last_terminal_event"] = args.terminal_event
        data["last_plan"] = args.plan
        data["last_pipeline_id"] = args.pipeline_id
        data["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
        state.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        if data["pipeline_runs_since_hygiene"] >= int(data.get("cadence_runs") or 10):
            print(f"wiki hygiene cadence reached for {project}: run /pdwiki {project}", file=sys.stderr)
        return 0
    except Exception as e:
        print(f"wiki hygiene cadence update failed: {e}", file=sys.stderr)
        return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("audit")
    a.add_argument("--project", required=True)
    a.add_argument("--output-dir")
    a.add_argument("--json-only", action="store_true")
    a.add_argument("--include-archives", action="store_true")
    a.add_argument("--stale-days", type=int, default=90)
    a.add_argument("--fail-on-critical", action="store_true")
    c = sub.add_parser("cadence")
    c.add_argument("--project", required=True)
    c.add_argument("--terminal-event", required=True)
    c.add_argument("--plan", default="unknown-plan")
    c.add_argument("--pipeline-id", default="")
    ap = sub.add_parser("apply-safe")
    ap.add_argument("--project", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--approved-gate", required=True)
    args = parser.parse_args()
    if args.cmd == "audit": return audit(args)
    if args.cmd == "cadence": return cadence(args)
    if args.cmd == "apply-safe":
        print("apply-safe is not implemented yet; run audit and present user gate first.", file=sys.stderr)
        return 2
    return 2

if __name__ == "__main__":
    raise SystemExit(main())
