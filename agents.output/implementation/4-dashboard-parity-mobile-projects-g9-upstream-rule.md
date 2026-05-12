---
ID: 4
Origin: 4-dashboard-parity-mobile-projects
UUID: 5098e241
Status: Active
---

# G9 Upstream Reachability Rule Added

## Problem
During G9 preview, `http://pi.lan/quality` returned 502 because the dashboard upstream had been started on `127.0.0.1:18777` while the user-facing preview goes through nginx/`pi.lan` and expects an upstream reachable at `0.0.0.0:18777`.

## Change
Added devops rule:
- `rules/pidex-devops/g9-preview-upstream-reachability.md`

Updated rule index:
- `rules/pidex-devops/index.md`

## New Requirement
Before presenting a LAN/domain G9 URL, pidex-devops/orchestrator must prove:
- listener bind is externally reachable (`0.0.0.0:18777` for PIDEX dashboard),
- local upstream returns 2xx/3xx,
- LAN upstream returns 2xx/3xx,
- user-facing domain/proxy returns 2xx/3xx or Host-header proxy limitation is documented.

## Current Preview Fix
Dashboard upstream restarted with:

```bash
./dashboard/start.sh --dev --no-build --no-ingest --host 0.0.0.0 --port 18777 --public-read
```

Validated:
- `ss`: `0.0.0.0:18777`
- `http://10.0.0.103:18777/quality`: 200
- `http://10.0.0.103:18777/api/summary`: 200

<!-- ROUTING -->
verdict: COMPLETE
route_to: orchestrator
context_file: agents.output/implementation/4-dashboard-parity-mobile-projects-g9-upstream-rule.md
gate: none
reason: Added G9 upstream reachability rule and indexed it to prevent pi.lan/nginx 502 preview loops.
<!-- /ROUTING -->
