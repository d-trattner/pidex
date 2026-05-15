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
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / "state" / "provider-limits"
ALERT_STATE = STATE / "alert-state.json"
HISTORY = STATE / "history.jsonl"
PROFILES = ROOT / "config" / "profiles"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), timezone.utc)
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
    profiles = list_profiles()
    if data.get("active_profile") in profiles:
        return data["active_profile"]
    return profiles[0] if profiles else "custom"


def native_records() -> list[dict]:
    source = STATE / "native-records.json"
    data = load_json(source)
    rows = data.get("records") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def codex_token() -> str | None:
    if os.environ.get("CODEX_TOKEN"):
        return os.environ["CODEX_TOKEN"]
    path = Path(os.environ.get("CODEX_AUTH_FILE", str(Path.home() / ".codex" / "auth.json")))
    data = load_json(path)
    return ((data.get("tokens") or {}).get("access_token") or data.get("access_token"))


def get_json(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "pidex-provider-limits/0.1",
        },
    )
    with urllib.request.urlopen(req, timeout=12) as res:
        return json.loads(res.read().decode("utf-8", "replace"))


def codex_additional_provider_name(limit: dict) -> str:
    name = str(limit.get("limit_name") or limit.get("metered_feature") or "additional").strip().lower()
    if "spark" in name or "bengalfox" in name:
        return "codex-spark"
    slug = "".join(ch if ch.isalnum() else "-" for ch in name).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return f"codex-{slug or 'additional'}"


def append_codex_rate_limit(out: list[dict], data: dict, rl: dict, provider: str, limit_name: str | None = None, metered_feature: str | None = None) -> None:
    for source, name in [(rl.get("primary_window") or {}, "five_hour"), (rl.get("secondary_window") or {}, "seven_day")]:
        reset_at = parse_time(source.get("reset_at")) if source.get("reset_at") else None
        out.append({
            "provider": provider,
            "window": name,
            "used_percent": source.get("used_percent"),
            "resets_at": reset_at.isoformat().replace("+00:00", "Z") if reset_at else None,
            "allowed": rl.get("allowed"),
            "limit_reached": rl.get("limit_reached"),
            "plan": data.get("plan_type"),
            "limit_name": limit_name,
            "metered_feature": metered_feature,
        })


def probe_codex() -> list[dict]:
    tok = codex_token()
    if not tok:
        return [{"provider": "codex", "window": "auth", "error": "missing Codex token"}]
    try:
        data = get_json("https://chatgpt.com/backend-api/wham/usage", tok)
    except Exception as exc:
        return [{"provider": "codex", "window": "auth", "error": f"Codex usage probe failed: {exc}"}]
    out: list[dict] = []
    append_codex_rate_limit(out, data, data.get("rate_limit") or {}, "codex")
    for limit in data.get("additional_rate_limits") or []:
        if not isinstance(limit, dict):
            continue
        append_codex_rate_limit(
            out,
            data,
            limit.get("rate_limit") or {},
            codex_additional_provider_name(limit),
            limit.get("limit_name"),
            limit.get("metered_feature"),
        )
    return out


def write_history(records: list[dict], captured_at: str) -> None:
    STATE.mkdir(parents=True, exist_ok=True)
    with HISTORY.open("a", encoding="utf-8") as fh:
        for record in records:
            row = dict(record)
            row["captured_at"] = captured_at
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def refresh_snapshot() -> dict:
    captured_at = now_iso()
    records = probe_codex()
    for record in records:
        record["captured_at"] = captured_at
    payload = {
        "active_profile": active_profile(),
        "profiles": list_profiles(),
        "records": records,
        "generated_at": captured_at,
        "latest": captured_at,
    }
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / "latest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    write_history(records, captured_at)
    payload = auto_switch_if_needed(payload)
    (STATE / "latest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


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
    profiles = list_profiles()
    data["profiles"] = profiles
    if data.get("active_profile") not in profiles:
        data["active_profile"] = active_profile()
    if "records" not in data or not isinstance(data.get("records"), list) or not data.get("records"):
        data["records"] = native_records()
    data.pop("recommended_profile", None)
    data = auto_switch_if_needed(data)
    STATE.mkdir(parents=True, exist_ok=True)
    latest.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def active_profile_uses_spark(profile: str | None = None) -> bool:
    current = profile or active_profile()
    if "no-spark" in current:
        return False
    if "spark" in current:
        return True
    data = load_json(PROFILES / f"{current}.json")
    text = json.dumps(data).lower() if data else ""
    return "codex-spark" in text


def should_alert_record(record: dict, payload: dict) -> bool:
    if record.get("provider") != "codex-spark":
        return True
    if env_bool("PIDEX_PROVIDER_ALERT_SPARK_WHEN_INACTIVE", False):
        return True
    return active_profile_uses_spark(str(payload.get("active_profile") or active_profile()))


def alert(dry_run: bool = False) -> dict:
    payload = latest_snapshot()
    state = load_json(ALERT_STATE)
    once_until_reset = env_bool("PIDEX_PROVIDER_ALERT_ONCE_UNTIL_RESET", True)
    sent: list[str] = []

    for record in payload.get("records", []):
        if not isinstance(record, dict) or not should_alert_record(record, payload):
            continue
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


def apply_routing_profile(profile: str) -> None:
    source = (PROFILES / f"{profile}.json").resolve()
    try:
        source.relative_to(PROFILES.resolve())
    except ValueError:
        raise ValueError(f"invalid profile path: {profile}")
    raw = source.read_text(encoding="utf-8")
    json.loads(raw)
    target = ROOT / "config" / "agents.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".agents.json.", suffix=".tmp", dir=target.parent, text=True)
    with os.fdopen(fd, "w", encoding="utf-8") as tmp:
        tmp.write(raw if raw.endswith("\n") else raw + "\n")
    os.replace(tmp_name, target)


def set_profile(profile: str) -> dict:
    profiles = list_profiles()
    if profile not in profiles:
        raise ValueError(f"unknown profile: {profile}")
    apply_routing_profile(profile)
    payload = latest_snapshot()
    payload["active_profile"] = profile
    payload.pop("recommended_profile", None)
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / "active-profile.json").write_text(json.dumps({"active_profile": profile, "updated": now_iso()}, ensure_ascii=False), encoding="utf-8")
    if payload.get("latest") is None:
        payload["latest"] = now_iso()
    (STATE / "latest.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def spark_limit_hit(records: list[dict]) -> bool:
    for record in records:
        if record.get("provider") != "codex-spark":
            continue
        used = record.get("used_percent")
        try:
            used_num = float(used) if used is not None else None
        except Exception:
            used_num = None
        if record.get("limit_reached") or record.get("allowed") is False or (used_num is not None and used_num >= 99):
            return True
    return False


def non_spark_fallback_profile(current: str, profiles: list[str]) -> str | None:
    no_spark = [profile for profile in profiles if "no-spark" in profile]
    if not no_spark:
        return None
    if current in no_spark:
        return None
    exact = current.replace("plus-spark", "no-spark")
    if exact in no_spark:
        return exact
    if current.startswith("5.3") and "5.3-no-spark-balanced" in no_spark:
        return "5.3-no-spark-balanced"
    if current.startswith("5.5") and "5.5-no-spark-balanced" in no_spark:
        return "5.5-no-spark-balanced"
    return no_spark[0]


def auto_switch_if_needed(payload: dict) -> dict:
    if env_bool("PIDEX_PROVIDER_LIMITS_DISABLE_AUTO_SWITCH", False):
        return payload
    records = payload.get("records") if isinstance(payload.get("records"), list) else []
    if not spark_limit_hit(records):
        return payload
    profiles = list_profiles()
    current = str(payload.get("active_profile") or active_profile())
    target = non_spark_fallback_profile(current, profiles)
    if not target:
        return payload
    switched = set_profile(target)
    switched["auto_profile_switch"] = {
        "reason": "codex-spark-limit-hit",
        "from": current,
        "to": target,
        "updated": now_iso(),
    }
    return switched


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=False)
    latest = sub.add_parser("latest")
    latest.set_defaults(func=lambda _args: latest_snapshot())
    refresh = sub.add_parser("refresh")
    refresh.set_defaults(func=lambda _args: refresh_snapshot())
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
