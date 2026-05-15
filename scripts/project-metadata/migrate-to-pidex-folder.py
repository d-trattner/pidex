#!/usr/bin/env python3
"""Migrate project-local PIDEX metadata out of wiki/ and into pidex/."""
from __future__ import annotations

import argparse
import filecmp
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

TARGET_DIRS = ["pidex/rules", "pidex/state", "pidex/config", "pidex/prompts"]


def rel(project: Path, path: Path) -> str:
    return path.relative_to(project).as_posix()


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.name
    parent = path.parent
    for i in range(1, 1000):
        candidate = parent / f"{stem}.{i}"
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"could not find unique archive path for {path}")


def same_file_bytes(a: Path, b: Path) -> bool:
    return a.is_file() and b.is_file() and filecmp.cmp(a, b, shallow=False)


def copy_dir_no_overwrite(src: Path, dst: Path, errors: list[str], planned: list[dict[str, str]], dry_run: bool, project: Path) -> None:
    for item in sorted(src.rglob("*")):
        if item.is_dir():
            continue
        rel_item = item.relative_to(src)
        target = dst / rel_item
        planned.append({"action": "copy", "from": rel(project, item), "to": rel(project, target)})
        if target.exists() and not same_file_bytes(item, target):
            errors.append(f"conflict: {rel(project, target)} exists with different content")
            continue
        if not dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(item, target)


def migrate_project(project_arg: str, dry_run: bool) -> dict[str, Any]:
    project = Path(project_arg).expanduser().resolve()
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    archive_root = project / ".wiki-migration" / "archive" / stamp / "pidex-metadata"
    result: dict[str, Any] = {
        "ok": True,
        "project": str(project),
        "dry_run": dry_run,
        "created_dirs": [],
        "migrations": [],
        "warnings": [],
        "errors": [],
    }
    if not project.exists():
        result["ok"] = False
        result["errors"].append("project root does not exist")
        return result

    for d in TARGET_DIRS:
        path = project / d
        if not path.exists():
            result["created_dirs"].append(d)
            if not dry_run:
                path.mkdir(parents=True, exist_ok=True)

    legacy_rules = project / "wiki" / "rules"
    target_rules = project / "pidex" / "rules"
    if legacy_rules.exists():
        if not legacy_rules.is_dir():
            result["errors"].append("wiki/rules exists but is not a directory")
        else:
            copy_dir_no_overwrite(legacy_rules, target_rules, result["errors"], result["migrations"], dry_run, project)
            archive_rules = unique_path(archive_root / "wiki-rules")
            result["migrations"].append({"action": "archive", "from": "wiki/rules", "to": rel(project, archive_rules)})
            if not dry_run and not result["errors"]:
                archive_rules.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(legacy_rules), str(archive_rules))
    else:
        result["warnings"].append("no legacy wiki/rules directory")

    legacy_state = project / "wiki" / ".hygiene-state.json"
    target_state = project / "pidex" / "state" / "wiki-hygiene.json"
    if legacy_state.exists():
        if not legacy_state.is_file():
            result["errors"].append("wiki/.hygiene-state.json exists but is not a file")
        elif target_state.exists() and not same_file_bytes(legacy_state, target_state):
            result["errors"].append("conflict: pidex/state/wiki-hygiene.json exists with different content")
        else:
            result["migrations"].append({"action": "copy", "from": "wiki/.hygiene-state.json", "to": "pidex/state/wiki-hygiene.json"})
            archive_state = unique_path(archive_root / "hygiene-state.json")
            result["migrations"].append({"action": "archive", "from": "wiki/.hygiene-state.json", "to": rel(project, archive_state)})
            if not dry_run:
                target_state.parent.mkdir(parents=True, exist_ok=True)
                if not target_state.exists():
                    shutil.copy2(legacy_state, target_state)
                archive_state.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(legacy_state), str(archive_state))
    else:
        result["warnings"].append("no legacy wiki/.hygiene-state.json")

    if result["errors"]:
        result["ok"] = False
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", help="Emit JSON only (default also emits JSON).")
    parser.add_argument("projects", nargs="+")
    args = parser.parse_args()
    results = [migrate_project(p, args.dry_run) for p in args.projects]
    payload = {"ok": all(r["ok"] for r in results), "dry_run": args.dry_run, "projects": results}
    print(json.dumps(payload, indent=2))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
