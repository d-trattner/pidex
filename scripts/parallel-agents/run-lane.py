#!/usr/bin/env python3
"""Manual PIDEX parallel lane test scaffold."""
from __future__ import annotations
import argparse, subprocess, sys
from pathlib import Path


def root_from_script() -> Path: return Path(__file__).resolve().parents[2]
def lane_id(agent: str, provider: str, model: str) -> str: return f"{agent}:{provider}:{model}"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=str(root_from_script()))
    p.add_argument("--lane")
    p.add_argument("--agent")
    p.add_argument("--provider")
    p.add_argument("--model")
    p.add_argument("--project", required=True)
    p.add_argument("--task")
    p.add_argument("--task-text")
    p.add_argument("--force", action="store_true")
    args = p.parse_args()
    root = Path(args.root).expanduser().resolve()
    lid = args.lane or lane_id(args.agent or "", args.provider or "", args.model or "")
    if not lid or lid.count(":") < 2:
        print("run-lane.py requires --lane or --agent/--provider/--model", file=sys.stderr)
        return 2
    msg = "manual lane runner scaffold: provider invocation is not enabled yet; status path validated"
    subprocess.run([sys.executable, str(root / "scripts" / "parallel-agents" / "status.py"), "warn", "--root", str(root), "--lane", lid, "--type", "tooling-error", "--message", msg, "--no-telegram"], cwd=root, text=True)
    print(msg)
    return 1

if __name__ == "__main__": raise SystemExit(main())
