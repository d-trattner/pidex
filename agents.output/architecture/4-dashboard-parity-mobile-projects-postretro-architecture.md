---
ID: 4
Origin: 4-dashboard-parity-mobile-projects
UUID: 5098e241
Status: Complete
---

# Post-Retro Architecture Notes

## Dashboard query-state pattern
Use URL query state as the canonical global dashboard scope. `project` must be preserved by nav links and data fetches; changing project resets route-specific paging keys (`page`, `page_week`, `page_month`).

## Token pagination pattern
Keep week/month page windows server-side and return explicit metadata (`page`, `has_older`, `has_newer`, `start`, `end`) for both granularities. UI controls should use separate keys (`page_week`, `page_month`) to avoid coupling week and month navigation.

## Responsive proof pattern
Responsive dashboard claims require cascade-aware CSS tests or browser/computed evidence. Class existence is insufficient because base utility rules such as `.glass-card` can override route-specific mobile behavior.

## G9 preview infrastructure pattern
For PIDEX dashboard G9, `pi.lan` is nginx-fronted and proxies to upstream `0.0.0.0:18777`. Preview setup must prove upstream bind plus local/LAN/domain health before the user gate.

<!-- ROUTING -->
verdict: COMPLETE
route_to: orchestrator
context_file: agents.output/architecture/4-dashboard-parity-mobile-projects-postretro-architecture.md
gate: none
reason: Architecture patterns captured from full retro.
<!-- /ROUTING -->
