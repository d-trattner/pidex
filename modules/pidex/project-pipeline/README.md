# PIDEX Project Pipeline

Experimental local-first Project Sandbox runtime for Initiative 021.

This module is separate from `pidex.sandbox-runtime` / agent-pipeline. Project Pipeline manages persistent Docker-backed project environments where source is canonical inside the Project Sandbox.

MVP status: validated local-first helper/runtime path for registry, lifecycle, image build/status, mode resolution, local import, Git clone, credentials, project-agent execution, host archive sync, and a fail-closed run-flow facade. `/pd` with explicit saved `project-pipeline` mode now invokes the typed run-flow bridge directly instead of host-direct kickoff.

## Safety invariants

- Do not modify `pidex.sandbox-runtime` behavior.
- Do not mirror source to host.
- Host archive sync is limited to `agents.output/**` and `wiki/**` with safe-copy filters.
- Project-agent execution copies only archive-eligible paths out of the persistent container; source remains container-canonical.
- Pi/provider credentials are copied only from explicit allowlisted files after trusted-container acknowledgement and live in the per-project secrets volume.
- Project Pipeline mode is explicit per project; missing mode returns a decision-required result instead of falling back silently.
- Persistent Project Sandbox Docker resources are removed only by explicit project removal.

## Validated local flow

```text
/pd in saved project-pipeline mode
→ run project-pipeline.run-flow
→ create/open persistent Docker Project Sandbox
→ import local source or clone Git source into /workspace
→ optionally copy selected Pi/provider credentials after trusted-container acknowledgement
→ run child Pi in the container
→ sync only agents.output/** and wiki/** back to <pidex-root>/state/project-archives/<project-id>/
```

The local MVP has been validated with live Docker UAT for both direct run-flow execution and the `/pd` command bridge. Deferred work includes external Docker hosts, PR automation, dashboard/archive browsing UX, and fuller in-container multi-agent orchestration beyond the current planner/run-flow entrypoint.
