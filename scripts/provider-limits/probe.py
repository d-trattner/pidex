#!/usr/bin/env python3
"""Minimal provider-limits probe helper.

This keeps pidex scripts that previously expected dashboard/provider-limits tooling
usable with the new symlinked database layout.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "state" / "provider-limits"
ALERT_STATE = STATE / "alert-state.json"
PROFILES = ROOT / "config" / "profiles"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value):
    if value is None:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def reset_bucket(value) -> str:
    dt = parse_time(value)
    if not dt:
        return "unknown"
    return dt.replace(second=0, microsecond=0).isoformat().replace("+00:00", "Z")


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def duration_text(seconds) -> str:
    if seconds is None:
        return "unknown"
    try:
        seconds = max(0, int(seconds))
    except Exception:
        return "unknown"
    hours, rem = divmod(seconds, 3600)
    minutes = rem // 60
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def list_profiles() -> list[str]:
    return sorted([p.stem for p in PROFILES.glob("*.json")])


def active_profile() -> str:
    active = STATE / "active-profile.json"
    data = load_json(active)
    if data.get("active_profile") in list_profiles():
        return data["active_profile"]
    return "codex-optimized"


def native_records() -> list[dict]:
    source = STATE / "native-records.json"
    data = load_json(source)
    rows = data.get("records") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def latest_snapshot() -> dict:
    latest = STATE / "latest.json"
    data = load_json(latest)
    if not data:
        data = {
            "active_profile": active_profile(),
            "profiles": list_profiles(),
            "records": [],
            "generated_at": now_iso(),
            "latest": now_iso(),
        }
    data.setdefault("profiles", list_profiles())
    if "active_profile" not in data:
        data["active_profile"] = active_profile()
    if "records" not in data or not isinstance(data.get("records"), list) or not data.get("records"):
        data["records"] = native_records()
    data.pop("recommended_profile", None)
    STATE.mkdir(parents=True, exist_ok=True)
    latest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def alert(dry_run: bool = False) -> dict:
    payload = latest_snapshot()
    state = load_json(ALERT_STATE)
    once_until_reset = env_bool("PIDEX_PROVIDER_ALERT_ONCE_UNTIL_RESET", True)
    sent: list[str] = []

    for record in payload.get("records", []):
        if not isinstance(record, dict) or record.get("used_percent") is None:
            continue
        used = float(record.get("used_percent"))
        projected = bool(record.get("projected_before_reset"))
        limit_reached = bool(record.get("limit_reached"))
        level = None
        if limit_reached or used >= 95 or projected:
            level = "danger"
        elif used >= 80:
            level = "warning"
        if not level:
            continue

        if once_until_reset:
            key = f"limit-once:{record.get('provider')}:{record.get('window')}:{reset_bucket(record.get('resets_at'))}"
        else:
            key = f"limit:{record.get('provider')}:{record.get('window')}:{record.get('resets_at')}:{level}"
        if state.get(key) == "sent":
            continue

        reset = parse_time(record.get("resets_at"))
        reset_after = int((reset - datetime.now(timezone.utc)).total_seconds()) if reset else None
        forecast = ""
        if record.get("forecast_confidence") not in (None, "none"):
            forecast = f" Forecast: {record.get('forecast_confidence')} confidence, burn {record.get('burn_percent_per_hour')}%/h, exhaustion {record.get('projected_exhaustion_at') or 'not before reset'}."
        msg = (f"{level.upper()}: {record.get('provider')} {record.get('window')} quota is at {used:g}%. "
               f"Reset: {record.get('resets_at') or 'unknown'} (in {duration_text(reset_after)}).{forecast}")
        if dry_run:
            print(msg)
        else:
            subprocess.run([
                str(ROOT / "scripts" / "telegram" / "notify.sh"),
                "--optional", "--project", str(ROOT),
                "--needs", "Provider limit attention",
                "--context", msg,
            ], check=False)
            state[key] = "sent"
        sent.append(key)

    if not dry_run:
        STATE.mkdir(parents=True, exist_ok=True)
        ALERT_STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"sent": sent, "count": len(sent)}


def set_profile(profile: str) -> dict:
    profiles = list_profiles()
    if profile not in profiles:
        raise ValueError(f"unknown profile: {profile}")
    payload = latest_snapshot()
    payload["active_profile"] = profile
    payload.pop("recommended_profile", None)
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / "active-profile.json").write_text(json.dumps({"active_profile": profile, "updated": now_iso()}, ensure_ascii=False), encoding="utf-8")
    if payload.get("latest") is None:
        payload["latest"] = now_iso()
    (STATE / "latest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=False)
    latest = sub.add_parser("latest")
    latest.set_defaults(func=lambda _args: latest_snapshot())
    use = sub.add_parser("use")
    use.add_argument("profile")
    use.set_defaults(func=lambda args: set_profile(args.profile))
    alert_parser = sub.add_parser("alert")
    alert_parser.add_argument("--dry-run", action="store_true")
    alert_parser.set_defaults(func=lambda args: alert(args.dry_run))
    args = parser.parse_args(argv)

    if not args.command:
        data = latest_snapshot()
        print(json.dumps(data, ensure_ascii=False))
        return 0

    result = args.func(args)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
