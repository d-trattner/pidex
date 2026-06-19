# PIDEX Project Pipeline

Experimental local-first Project Sandbox runtime for Initiative 021.

This module is separate from `pidex.sandbox-runtime` / agent-pipeline. Project Pipeline manages persistent Docker-backed project environments where source is canonical inside the Project Sandbox.

MVP status: scaffolding plus local helper slices for registry, lifecycle, image build/status, local import, Git clone, credentials, project-agent execution, and host archive sync.

## Safety invariants

- Do not modify `pidex.sandbox-runtime` behavior.
- Do not mirror source to host.
- Host archive sync is limited to `agents.output/**` and `wiki/**` with safe-copy filters.
- Project-agent execution copies only archive-eligible paths out of the persistent container; source remains container-canonical.
- Persistent Project Sandbox Docker resources are removed only by explicit project removal.
