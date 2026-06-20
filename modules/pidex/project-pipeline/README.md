# PIDEX Project Pipeline

Experimental local-first Project Sandbox runtime for Initiative 021.

This module is separate from `pidex.sandbox-runtime` / agent-pipeline. Project Pipeline manages persistent Docker-backed project environments where source is canonical inside the Project Sandbox.

MVP status: local Docker workflow complete for the current scope. The validated local-first helper/runtime path covers registry, lifecycle, conservative repair, image build/status, mode resolution, local import, Git clone, credentials, project-agent execution, host archive sync, safe run/archive browsing, a fail-closed run-flow facade, and a sequential in-container orchestrator facade with phase-specific role prompts. `/pd` with explicit saved `project-pipeline` mode invokes the typed orchestrator bridge directly instead of host-direct kickoff.

## Safety invariants

- Do not modify `pidex.sandbox-runtime` behavior.
- Do not mirror source to host.
- Host archive sync is limited to `agents.output/**` and `wiki/**` with safe-copy filters.
- Project-agent execution copies only archive-eligible paths out of the persistent container; source remains container-canonical.
- Pi/provider credentials are copied only from explicit allowlisted files after trusted-container acknowledgement and live in the per-project secrets volume.
- Project Pipeline mode is explicit per project; missing mode returns a decision-required result instead of falling back silently.
- Persistent Project Sandbox Docker resources are removed only by explicit project removal.
- Repair is conservative: it can restart/recreate a container only when the existing named volumes are present; it does not recreate missing volumes.

## Validated local flow

```text
/pd in saved project-pipeline mode
→ run project-pipeline.orchestrator
→ create/open persistent Docker Project Sandbox
→ import local source or clone Git source into /workspace
→ optionally copy selected Pi/provider credentials after trusted-container acknowledgement
→ run the configured child Pi phase chain in the container with phase-specific role guidance
→ sync only agents.output/** and wiki/** back to <pidex-root>/state/project-archives/<project-id>/
```

The local MVP has been validated with live Docker UAT for direct run-flow execution, `/pd` orchestration, local management commands, credential reset/status, run metadata summaries, safe artifact listing, conservative repair behavior, and role-guided sequential orchestration. Deferred work includes external Docker hosts, PR automation, and dashboard/archive browsing UX.
