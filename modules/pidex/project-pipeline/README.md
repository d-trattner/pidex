# PIDEX Project Pipeline

Experimental local-first Project Sandbox runtime for Initiative 021.

This module is separate from `pidex.sandbox-runtime` / agent-pipeline. Project Pipeline manages persistent Docker-backed project environments where source is canonical inside the Project Sandbox.

MVP status: scaffolding, registry, and archive sync helpers.

## Safety invariants

- Do not modify `pidex.sandbox-runtime` behavior.
- Do not mirror source to host.
- Host archive sync is limited to `agents.output/**` and `wiki/**` with safe-copy filters.
- Persistent Project Sandbox Docker resources are removed only by explicit project removal.
