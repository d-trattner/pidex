#!/usr/bin/env python3
"""Initialize PIDEX project context templates.

Creates <project-root>/pidex/context/CONTEXT.md for single-context projects,
or CONTEXT-MAP.md plus an example bounded context for multi-context projects.
Does not overwrite existing files unless --force is provided.
"""
from __future__ import annotations

import argparse
import datetime as dt
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE_ROOT = ROOT / "templates" / "project-context"


def render(text: str, project: Path, context_name: str = "Example") -> str:
    return (
        text.replace("__PROJECT_NAME__", project.name)
        .replace("__PROJECT_ROOT__", str(project))
        .replace("__CONTEXT_NAME__", context_name)
        .replace("__DATE__", dt.date.today().isoformat())
    )


def write_template(src: Path, dest: Path, project: Path, *, force: bool, context_name: str = "Example") -> bool:
    if dest.exists() and not force:
        print(f"skip existing: {dest}")
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    text = src.read_text(encoding="utf-8")
    dest.write_text(render(text, project, context_name), encoding="utf-8")
    print(f"wrote: {dest}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="Initialize <project-root>/pidex/context templates")
    ap.add_argument("project", help="Project root")
    ap.add_argument("--multi", action="store_true", help="Initialize CONTEXT-MAP.md and contexts/<name>/CONTEXT.md")
    ap.add_argument("--context-name", default="Example", help="Initial bounded context name for --multi")
    ap.add_argument("--force", action="store_true", help="Overwrite existing context files")
    args = ap.parse_args()

    project = Path(args.project).expanduser().resolve()
    if not project.exists() or not project.is_dir():
        print(f"error: project root does not exist or is not a directory: {project}", file=sys.stderr)
        return 2
    if not TEMPLATE_ROOT.exists():
        print(f"error: template root missing: {TEMPLATE_ROOT}", file=sys.stderr)
        return 2

    context_root = project / "pidex" / "context"
    if args.multi:
        context_slug = args.context_name.strip().lower().replace(" ", "-") or "example"
        write_template(TEMPLATE_ROOT / "CONTEXT-MAP.md", context_root / "CONTEXT-MAP.md", project, force=args.force)
        write_template(
            TEMPLATE_ROOT / "contexts" / "example" / "CONTEXT.md",
            context_root / "contexts" / context_slug / "CONTEXT.md",
            project,
            force=args.force,
            context_name=args.context_name,
        )
    else:
        write_template(TEMPLATE_ROOT / "CONTEXT.md", context_root / "CONTEXT.md", project, force=args.force)

    readme_src = TEMPLATE_ROOT / "README.md"
    if readme_src.exists():
        shutil.copyfile(readme_src, context_root / "README.template.md")
        print(f"wrote: {context_root / 'README.template.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
