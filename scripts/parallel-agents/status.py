#!/usr/bin/env python3
"""PIDEX optional parallel agents config/status helper."""
from __future__ import annotations

import argparse, datetime as dt, json, os, re, subprocess, sys, tempfile
from pathlib import Path
from typing import Any

SUPPORTED_AGENTS = {"pidex-critic", "pidex-code-reviewer"}
WARNING_TYPES = {"usage-limit-or-balance", "auth-failed", "provider-unavailable", "timeout", "tooling-error", "unknown-error"}
CRED_KEYS = re.compile(r"(api[_-]?key|token|secret|password|credential)", re.I)
TOKEN_RE = re.compile(r"([A-Za-z0-9_-]{4})[A-Za-z0-9_./+=:-]{16,}([A-Za-z0-9_-]{4})")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def root_from_script() -> Path:
    return Path(__file__).resolve().parents[2]


def paths(root: Path) -> tuple[Path, Path, Path]:
    return root / "config" / "parallel-agents.json", root / "state" / "parallel-agents" / "status.json", root / "state" / "telegram" / "parallel-agent-warnings.json"


def load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default
    except Exception:
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent, text=True)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def lane_id(agent: str, provider: str, model: str) -> str:
    return f"{agent}:{provider}:{model}"


def redact(value: str, max_len: int = 500) -> str:
    value = TOKEN_RE.sub(lambda m: f"{m.group(1)}…{m.group(2)}", value or "")
    return value[:max_len]


def validate_no_creds(obj: Any, path: str = "") -> list[str]:
    errors: list[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            child = f"{path}.{k}" if path else str(k)
            if CRED_KEYS.search(str(k)):
                errors.append(f"credential-like field not allowed: {child}")
            errors.extend(validate_no_creds(v, child))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            errors.extend(validate_no_creds(v, f"{path}[{i}]"))
    return errors


def normalize_config(raw: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    errors.extend(validate_no_creds(raw))
    cfg = {
        "schema_version": int(raw.get("schema_version") or 1),
        "enabled": bool(raw.get("enabled", False)),
        "default_mode": raw.get("default_mode") or "opportunistic",
        "dedupe_hours": int(raw.get("dedupe_hours") or 6),
        "max_provider_models_per_agent": int(raw.get("max_provider_models_per_agent") or 2),
        "agents": {},
    }
    if cfg["max_provider_models_per_agent"] != 2:
        errors.append("max_provider_models_per_agent must be 2")
        cfg["max_provider_models_per_agent"] = 2
    agents = raw.get("agents") or {}
    for agent in agents:
        if agent not in SUPPORTED_AGENTS:
            errors.append(f"unsupported agent: {agent}")
    for agent in sorted(SUPPORTED_AGENTS):
        a = agents.get(agent) or {}
        pms = a.get("provider_models") or []
        if not isinstance(pms, list):
            errors.append(f"{agent}.provider_models must be a list")
            pms = []
        if len(pms) > 2:
            errors.append(f"{agent} has more than 2 provider_models")
            pms = pms[:2]
        seen = set()
        clean_pms = []
        for idx, pm in enumerate(pms):
            if not isinstance(pm, dict):
                errors.append(f"{agent}.provider_models[{idx}] must be object")
                continue
            provider, model = str(pm.get("provider") or "").strip(), str(pm.get("model") or "").strip()
            if not provider or not model:
                errors.append(f"{agent}.provider_models[{idx}] requires provider and model")
                continue
            key = (provider, model)
            if key in seen:
                errors.append(f"duplicate provider/model for {agent}: {provider}/{model}")
                continue
            seen.add(key)
            clean_pms.append({"provider": provider, "model": model, "effort": str(pm.get("effort") or "medium"), "enabled": bool(pm.get("enabled", True))})
        mode = str(a.get("mode") or cfg["default_mode"])
        if mode != "opportunistic":
            errors.append(f"unsupported mode for {agent}: {mode}")
            mode = "opportunistic"
        cfg["agents"][agent] = {
            "enabled": bool(a.get("enabled", False)),
            "trigger": str(a.get("trigger") or ("after-plan" if agent == "pidex-critic" else "after-implementation")),
            "mode": mode,
            "timeout_seconds": int(a.get("timeout_seconds") or 600),
            "notify_on_unavailable": bool(a.get("notify_on_unavailable", True)),
            "provider_models": clean_pms,
        }
    return cfg, errors


def load_config(root: Path) -> tuple[dict[str, Any], list[str]]:
    config_path, _, _ = paths(root)
    return normalize_config(load_json(config_path, {}))


def merge_status(root: Path) -> dict[str, Any]:
    config_path, state_path, _ = paths(root)
    cfg, errors = load_config(root)
    state = load_json(state_path, {})
    lanes_state = state.get("lanes") or {}
    agents = []
    warnings = state.get("warnings") or []
    for agent, a in cfg["agents"].items():
        pms = []
        for pm in a.get("provider_models", []):
            lid = lane_id(agent, pm["provider"], pm["model"])
            st = lanes_state.get(lid, {})
            pms.append({**pm, "lane_id": lid, "last_attempt_at": st.get("last_attempt_at"), "last_success_at": st.get("last_success_at"), "last_failure_at": st.get("last_failure_at"), "last_status": st.get("last_status"), "last_message": st.get("last_message"), "warning_active": bool(st.get("warning_active", False)), "warning_type": st.get("warning_type"), "telegram_notified_at": st.get("telegram_notified_at")})
        agents.append({**a, "agent": agent, "provider_models": pms})
    return {"ok": not errors and config_path.exists(), "errors": errors, "config_path": str(config_path), "state_path": str(state_path), "enabled": cfg["enabled"], "updated_at": state.get("updated_at"), "agents": agents, "warnings": warnings}


def classify_msg(msg: str) -> str:
    s = msg.lower()
    if re.search(r"usage limit|rate limit|quota|insufficient balance|no balance|billing|payment required|subscription|limit reached|\b429\b", s): return "usage-limit-or-balance"
    if re.search(r"auth|authentication|unauthorized|forbidden|\b401\b|\b403\b|login required", s): return "auth-failed"
    if re.search(r"timeout|timed out|deadline exceeded", s): return "timeout"
    if re.search(r"provider unavailable|service unavailable|\b503\b|connection refused|network", s): return "provider-unavailable"
    return "unknown-error"


def update_lane(root: Path, lid: str, status: str, message: str = "", wtype: str | None = None, no_telegram: bool = False) -> dict[str, Any]:
    cfg, _ = load_config(root)
    _, state_path, _ = paths(root)
    state = load_json(state_path, {"schema_version": 1, "lanes": {}, "warnings": []})
    state.setdefault("schema_version", 1); state["enabled"] = cfg.get("enabled", False); state["updated_at"] = now(); state.setdefault("lanes", {}); state.setdefault("warnings", [])
    parts = lid.split(":", 2)
    agent, provider, model = (parts + ["", "", ""])[:3]
    lane = state["lanes"].setdefault(lid, {"configured": False, "enabled": False})
    lane.update({"agent": agent, "provider": provider, "model": model, "last_attempt_at": now(), "last_status": status, "last_message": redact(message)})
    if status == "success":
        lane.update({"last_success_at": now(), "warning_active": False, "warning_type": None})
        state["warnings"] = [w for w in state.get("warnings", []) if w.get("lane") != lid]
    else:
        wtype = wtype or classify_msg(message)
        lane.update({"last_failure_at": now(), "warning_active": True, "warning_type": wtype})
        state["warnings"] = [w for w in state.get("warnings", []) if not (w.get("lane") == lid and w.get("type") == wtype)]
        state["warnings"].append({"lane": lid, "type": wtype, "message": redact(message), "last_seen": now()})
    # Overlay configured details
    a = cfg.get("agents", {}).get(agent)
    if a:
        lane.update({"configured": True, "enabled": bool(a.get("enabled")), "trigger": a.get("trigger")})
    write_json(state_path, state)
    if status != "success" and not no_telegram:
        maybe_telegram(root, cfg, lid, wtype or "unknown-error", redact(message), state)
    return state


def clear_lane(root: Path, lid: str) -> dict[str, Any]:
    _, state_path, _ = paths(root)
    state = load_json(state_path, {"schema_version": 1, "lanes": {}, "warnings": []})
    lane = state.setdefault("lanes", {}).setdefault(lid, {"configured": False, "enabled": False})
    lane.update({"warning_active": False, "warning_type": None, "last_status": "cleared"})
    state["warnings"] = [w for w in state.get("warnings", []) if w.get("lane") != lid]
    state["updated_at"] = now()
    write_json(state_path, state)
    return state


def maybe_telegram(root: Path, cfg: dict[str, Any], lid: str, wtype: str, msg: str, state: dict[str, Any]) -> None:
    if os.environ.get("PIDEX_TELEGRAM_PARALLEL_WARNINGS", "1").lower() in {"0", "false", "no", "off"}: return
    agent = lid.split(":", 1)[0]
    if not cfg.get("agents", {}).get(agent, {}).get("notify_on_unavailable", True): return
    _, _, dedupe_path = paths(root)
    dedupe = load_json(dedupe_path, {})
    key = f"{lid}:{wtype}"
    last = dedupe.get(key)
    hours = int(cfg.get("dedupe_hours") or 6)
    if last:
        try:
            if (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last.replace("Z", "+00:00"))).total_seconds() < hours * 3600: return
        except Exception: pass
    script = root / "scripts" / "telegram" / "notify.sh"
    if script.exists():
        try:
            subprocess.run([str(script), f"PIDEX parallel lane warning\nlane: {lid}\nstatus: {wtype}\nmessage: {msg}"], cwd=root, timeout=10, capture_output=True, text=True)
            dedupe[key] = now(); write_json(dedupe_path, dedupe)
            lane = state.get("lanes", {}).get(lid)
            if lane:
                lane["telegram_notified_at"] = dedupe[key]
                write_json(paths(root)[1], state)
        except Exception: pass


def pi_auth_provider_present(provider: str) -> bool:
    auth_path = Path.home() / ".pi" / "agent" / "auth.json"
    try:
        data = json.loads(auth_path.read_text(encoding="utf-8"))
        entry = data.get(provider.lower())
        return isinstance(entry, dict) and bool(entry.get("type"))
    except Exception:
        return False


def provider_auth(provider: str) -> dict[str, Any]:
    p = provider.lower()
    if pi_auth_provider_present(p):
        return {"authenticated": True, "auth_reason": "Pi auth store has provider credentials"}
    if p == "openai-codex":
        auth_file = Path.home() / ".codex" / "auth.json"
        ok = bool(os.environ.get("OPENAI_API_KEY")) or auth_file.exists()
        return {"authenticated": ok, "auth_reason": "OPENAI_API_KEY or ~/.codex/auth.json" if ok else "missing OPENAI_API_KEY / codex login"}
    env_by_provider = {
        "google": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
        "openrouter": ["OPENROUTER_API_KEY"],
        "deepseek": ["DEEPSEEK_API_KEY"],
        "minimax": ["MINIMAX_API_KEY"],
        "anthropic": ["ANTHROPIC_API_KEY"],
    }
    envs = env_by_provider.get(p, [f"{p.upper().replace('-', '_')}_API_KEY"])
    ok = any(os.environ.get(env) for env in envs)
    return {"authenticated": ok, "auth_reason": f"env present: {', '.join(envs)}" if ok else f"missing auth env: {', '.join(envs)}"}


def model_entry(provider: str, model: str) -> dict[str, Any]:
    auth = provider_auth(provider)
    return {"provider": provider, "model": model, "id": f"{provider}/{model}", "label": f"{provider}/{model}", **auth}


def model_options(root: Path) -> dict[str, Any]:
    models = []
    source = "pi --list-models"
    try:
        cp = subprocess.run(["pi", "--list-models"], cwd=root, text=True, capture_output=True, timeout=20)
        if cp.returncode == 0:
            for line in f"{cp.stdout}\n{cp.stderr}".splitlines():
                cols = line.split()
                if len(cols) >= 2 and cols[0] != "provider" and not cols[0].startswith("-"):
                    provider, model = cols[0], cols[1]
                    models.append(model_entry(provider, model))
    except Exception as e:
        source = f"fallback: {e}"
    if not models:
        cfg, _ = load_config(root)
        for a in cfg.get("agents", {}).values():
            for pm in a.get("provider_models", []):
                models.append(model_entry(pm["provider"], pm["model"]))
        try:
            acfg = load_json(root / "config" / "agents.json", {})
            for r in (acfg.get("agents") or {}).values():
                m = r.get("model")
                if isinstance(m, str) and "/" in m:
                    provider, model = m.split("/", 1); models.append(model_entry(provider, model))
        except Exception: pass
    seen = set(); unique = []
    for m in models:
        if m["id"] not in seen:
            seen.add(m["id"]); unique.append(m)
    return {"ok": bool(unique), "source": source, "models": unique}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=str(root_from_script()))
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ["show", "config", "models"]:
        s = sub.add_parser(name); s.add_argument("--json", action="store_true")
    s = sub.add_parser("save-config"); s.add_argument("--config-json", required=True)
    s = sub.add_parser("classify"); s.add_argument("--message", required=True); s.add_argument("--json", action="store_true")
    s = sub.add_parser("warn"); s.add_argument("--lane", required=True); s.add_argument("--type", choices=sorted(WARNING_TYPES)); s.add_argument("--message", required=True); s.add_argument("--no-telegram", action="store_true")
    s = sub.add_parser("success"); s.add_argument("--lane", required=True); s.add_argument("--message", default="success")
    s = sub.add_parser("clear"); s.add_argument("--lane", required=True)
    args = p.parse_args(); root = Path(args.root).expanduser().resolve()
    config_path, _, _ = paths(root)
    if args.cmd == "show":
        data = merge_status(root); print(json.dumps(data, indent=None if args.json else 2)); return 0 if data["ok"] else 1
    if args.cmd == "config":
        cfg, errors = load_config(root); out = {"ok": not errors and config_path.exists(), "errors": errors, "config": cfg}; print(json.dumps(out, indent=None if args.json else 2)); return 0 if out["ok"] else 1
    if args.cmd == "models":
        print(json.dumps(model_options(root), indent=None if args.json else 2)); return 0
    if args.cmd == "save-config":
        raw_arg = args.config_json
        raw = Path(raw_arg[1:]).read_text(encoding="utf-8") if raw_arg.startswith("@") else raw_arg
        cfg, errors = normalize_config(json.loads(raw))
        if errors:
            print(json.dumps({"ok": False, "errors": errors}), file=sys.stderr); return 2
        write_json(config_path, cfg); print(json.dumps({"ok": True, "config_path": str(config_path)})); return 0
    if args.cmd == "classify":
        out = {"ok": True, "type": classify_msg(args.message)}; print(json.dumps(out) if args.json else out["type"]); return 0
    if args.cmd == "warn":
        st = update_lane(root, args.lane, args.type or classify_msg(args.message), args.message, args.type, args.no_telegram); print(json.dumps({"ok": True, "state_path": str(paths(root)[1])})); return 0
    if args.cmd == "success":
        update_lane(root, args.lane, "success", args.message); print(json.dumps({"ok": True})); return 0
    if args.cmd == "clear":
        clear_lane(root, args.lane); print(json.dumps({"ok": True})); return 0
    return 2

if __name__ == "__main__": raise SystemExit(main())
