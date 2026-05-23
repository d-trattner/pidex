#!/usr/bin/env python3
"""Read-only Windows compatibility audit for PIDEX.

This script reports local environment readiness signals only. It must not install,
start, delete, or modify anything.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


COMMANDS = ("bash", "node", "npm", "python3", "python", "git", "pi")
RISKY_ENTRYPOINTS = (
    {
        "path": "install.sh",
        "status": "linux-owned",
        "windows_guidance": "Prefer a future install.windows.ps1; do not add inline Windows branches to install.sh.",
    },
    {
        "path": "uninstall.sh",
        "status": "linux-owned",
        "windows_guidance": "Prefer a future uninstall.windows.ps1.",
    },
    {
        "path": "dashboard/start.sh",
        "status": "linux-owned",
        "windows_guidance": "Prefer a future dashboard/start.windows.mjs or dashboard/start.windows.ps1.",
    },
    {
        "path": "scripts/release/public-readiness.sh",
        "status": "linux-owned",
        "windows_guidance": "Use this read-only audit or a future public-readiness.windows.py for Windows checks.",
    },
    {
        "path": "scripts/git-hooks/install-global.sh",
        "status": "linux-owned",
        "windows_guidance": "Use a future Windows-specific hook installer or document unsupported behavior.",
    },
)


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def git_bash_candidates() -> list[str]:
    candidates: list[str] = []
    for env_name in ("ProgramFiles", "ProgramFiles(x86)"):
        base = os.environ.get(env_name)
        if base:
            candidates.append(str(Path(base) / "Git" / "bin" / "bash.exe"))
    return candidates


def resolve_command(command: str) -> str | None:
    found = shutil.which(command)
    if found:
        return found
    if command == "bash" and platform.system().lower() == "windows":
        for candidate in git_bash_candidates():
            if Path(candidate).is_file():
                return candidate
    return None


def command_version(command: str, executable: str) -> tuple[str | None, bool]:
    version_args = {
        "bash": ["--version"],
        "node": ["--version"],
        "npm": ["--version"],
        "python3": ["--version"],
        "python": ["--version"],
        "git": ["--version"],
        "pi": ["--version"],
    }[command]
    try:
        completed = subprocess.run(
            [executable, *version_args],
            check=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None, False
    output = (completed.stdout or completed.stderr).strip().splitlines()
    version = output[0] if output else None
    if completed.returncode != 0:
        return version, False
    return version, True


def audit_commands() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for command in COMMANDS:
        found = resolve_command(command)
        version: str | None = None
        executable_works = False
        if found:
            version, executable_works = command_version(command, found)
        result[command] = {
            "available": bool(found) and (executable_works or command == "pi"),
            "path": found,
            "version": version,
            "executable_works": executable_works,
        }
    return result


def detect_environment() -> dict[str, Any]:
    system = platform.system().lower()
    release = platform.release()
    env = {key: os.environ.get(key) for key in ("MSYSTEM", "MINGW_PREFIX", "WSL_DISTRO_NAME", "WT_SESSION") if os.environ.get(key)}
    is_wsl = bool(env.get("WSL_DISTRO_NAME")) or "microsoft" in release.lower()
    is_git_bash = bool(env.get("MSYSTEM") or env.get("MINGW_PREFIX"))

    if is_wsl:
        kind = "wsl"
    elif system == "windows" and is_git_bash:
        kind = "windows-git-bash"
    elif system == "windows":
        kind = "windows-native"
    elif is_git_bash:
        kind = "git-bash-like"
    elif system == "linux":
        kind = "linux"
    elif system == "darwin":
        kind = "macos"
    else:
        kind = system or "unknown"

    return {
        "kind": kind,
        "platform_system": platform.system(),
        "platform_release": release,
        "platform_version": platform.version(),
        "machine": platform.machine(),
        "python_executable": sys.executable,
        "environment_markers": env,
    }


def path_shape(root: Path) -> dict[str, Any]:
    root_text = str(root)
    home = str(Path.home())
    return {
        "repo_root": root_text,
        "home": home,
        "is_expected_linux_checkout": root_text == str(Path.home() / "pidex"),
        "contains_backslashes": "\\" in root_text,
        "contains_spaces": " " in root_text,
        "has_drive_prefix": len(root_text) >= 2 and root_text[1] == ":",
        "starts_with_slash": root_text.startswith("/"),
    }


def dashboard_prerequisites(root: Path, commands: dict[str, dict[str, Any]]) -> dict[str, Any]:
    dashboard = root / "dashboard"
    package_json = dashboard / "package.json"
    node_modules = dashboard / "node_modules"
    return {
        "dashboard_dir_exists": dashboard.is_dir(),
        "package_json_exists": package_json.is_file(),
        "node_available": commands["node"]["available"],
        "npm_available": commands["npm"]["available"],
        "node_modules_present": node_modules.is_dir(),
        "suggested_checks": [
            "npm --prefix dashboard run typecheck",
            "npm --prefix dashboard run build",
        ],
    }


def risky_entrypoints(root: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for item in RISKY_ENTRYPOINTS:
        path = root / item["path"]
        entries.append({**item, "exists": path.exists()})
    return entries


def parse_node_major_minor(version: str | None) -> tuple[int, int] | None:
    if not version:
        return None
    text = version.strip().lstrip("v")
    parts = text.split(".")
    try:
        return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
    except Exception:
        return None


def findings(environment: dict[str, Any], commands: dict[str, dict[str, Any]], paths: dict[str, Any]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    kind = environment["kind"]
    if kind == "linux":
        items.append({"level": "info", "message": "Linux detected; this is PIDEX's canonical currently tested path."})
    elif kind == "wsl":
        items.append({"level": "info", "message": "WSL detected; this is the safest Windows recommendation for now, pending explicit PIDEX smoke evidence."})
    elif kind == "windows-git-bash":
        items.append({"level": "warning", "message": "Windows Git Bash detected; Pi supports a Git Bash path, but PIDEX support is still experimental."})
    elif kind == "windows-native":
        items.append({"level": "warning", "message": "Native Windows detected; PIDEX does not currently claim PowerShell/CMD support."})
    else:
        items.append({"level": "warning", "message": f"Unvalidated platform detected: {kind}."})

    for command in ("bash", "node", "npm", "git", "pi"):
        if not commands[command]["available"]:
            items.append({"level": "warning", "message": f"Required or expected command not found on PATH: {command}."})
    if not (commands["python3"]["available"] or commands["python"]["available"]):
        items.append({"level": "warning", "message": "Neither python3 nor python was found on PATH."})

    node_version = parse_node_major_minor(commands["node"].get("version"))
    if node_version and node_version < (22, 12):
        items.append({"level": "warning", "message": "Dashboard dependencies require Node >=22.12.0; current node appears older."})

    if paths["contains_spaces"]:
        items.append({"level": "warning", "message": "PIDEX checkout path contains spaces; this is not yet validated for Windows support."})
    if not paths["is_expected_linux_checkout"]:
        items.append({"level": "info", "message": "PIDEX v0.1 documents ~/pidex as the expected checkout path."})

    return items


def build_report() -> dict[str, Any]:
    root = repo_root()
    environment = detect_environment()
    commands = audit_commands()
    paths = path_shape(root)
    return {
        "audit": "pidex-windows-compatibility",
        "read_only": True,
        "support_summary": {
            "linux": "supported/currently tested",
            "wsl2": "safest Windows recommendation for now",
            "windows_git_bash": "experimental/under analysis",
            "native_powershell_cmd": "not claimed",
        },
        "environment": environment,
        "commands": commands,
        "path_shape": paths,
        "dashboard": dashboard_prerequisites(root, commands),
        "known_unsupported_or_risky_entrypoints": risky_entrypoints(root),
        "findings": findings(environment, commands, paths),
    }


def print_text(report: dict[str, Any]) -> None:
    print("PIDEX Windows compatibility audit (read-only)")
    print("=" * 47)
    print(f"Environment: {report['environment']['kind']} ({report['environment']['platform_system']} {report['environment']['platform_release']})")
    print(f"Repo root: {report['path_shape']['repo_root']}")
    print("\nSupport summary:")
    for key, value in report["support_summary"].items():
        print(f"  - {key}: {value}")
    print("\nCommands:")
    for command, info in report["commands"].items():
        status = "found" if info["available"] else "missing"
        suffix = f" — {info['version']}" if info.get("version") else ""
        print(f"  - {command}: {status}{suffix}")
    print("\nDashboard prerequisites:")
    for key, value in report["dashboard"].items():
        if key != "suggested_checks":
            print(f"  - {key}: {value}")
    print("\nKnown unsupported/risky entrypoints:")
    for entry in report["known_unsupported_or_risky_entrypoints"]:
        print(f"  - {entry['path']}: {entry['status']} ({'exists' if entry['exists'] else 'missing'})")
    print("\nFindings:")
    for item in report["findings"]:
        print(f"  - [{item['level']}] {item['message']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only PIDEX Windows compatibility audit.")
    parser.add_argument("--json", action="store_true", help="print machine-readable JSON")
    args = parser.parse_args(argv)

    report = build_report()
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print_text(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
