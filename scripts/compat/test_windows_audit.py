#!/usr/bin/env python3
"""Unit checks for scripts/compat/windows-audit.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path


SCRIPT = Path(__file__).with_name("windows-audit.py")
SPEC = importlib.util.spec_from_file_location("windows_audit", SCRIPT)
assert SPEC is not None
windows_audit = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(windows_audit)


def test_report_is_read_only_and_has_expected_sections() -> None:
    report = windows_audit.build_report()

    assert report["read_only"] is True
    assert report["audit"] == "pidex-windows-compatibility"
    assert "environment" in report
    assert "commands" in report
    assert "path_shape" in report
    assert "dashboard" in report
    assert "known_unsupported_or_risky_entrypoints" in report
    assert "findings" in report


def test_risky_entrypoints_preserve_platform_separation_guidance() -> None:
    report = windows_audit.build_report()
    entries = {entry["path"]: entry for entry in report["known_unsupported_or_risky_entrypoints"]}

    assert entries["install.sh"]["status"] == "linux-owned"
    assert "install.windows.ps1" in entries["install.sh"]["windows_guidance"]
    assert entries["dashboard/start.sh"]["status"] == "linux-owned"
    assert "start.windows" in entries["dashboard/start.sh"]["windows_guidance"]


def test_json_mode_exits_successfully() -> None:
    import contextlib
    import io

    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        exit_code = windows_audit.main(["--json"])

    assert exit_code == 0
    assert '"read_only": true' in stdout.getvalue()


if __name__ == "__main__":
    test_report_is_read_only_and_has_expected_sections()
    test_risky_entrypoints_preserve_platform_separation_guidance()
    test_json_mode_exits_successfully()
    print("windows-audit tests passed")
