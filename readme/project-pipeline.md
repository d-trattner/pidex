# Project Pipeline

Project Pipeline is PIDEX's local Docker-backed Project Sandbox mode. It is separate from the existing hardened agent sandbox.

In Project Pipeline mode, the project source lives and runs inside a persistent Docker container/volumes. The host receives only reviewable artifacts from the container archive sync.

## Status

- Local Docker MVP: validated.
- Entry point: `/pd` with saved `project-pipeline` mode.
- Management command: `/pdproject`.
- External Docker hosts: deferred.
- PR automation/review branches: deferred.
- Dashboard/archive browsing: deferred.
- Full in-container multi-agent orchestration beyond the current planner/run-flow entrypoint: deferred.

## Mental model

```text
host project path
→ /pd project-pipeline mode
→ persistent Docker Project Sandbox
→ source imported/cloned into /workspace
→ Pi runs inside the container
→ only agents.output/** and wiki/** sync back to host archive
```

Project source is not mirrored back to the host by PIDEX. If you want source changes outside the container, use Git/PR workflows manually until PR automation is implemented.

## Safety invariants

- Project Pipeline mode is explicit per project.
- Missing mode asks once instead of silently falling back.
- Project Pipeline failures do not automatically fall back to host-direct or hardened-pipeline.
- Host archive sync is limited to `agents.output/**` and `wiki/**` with safe-copy filters.
- Source files, `.env`, secrets, runtime files, and executable/code-like archive paths are not synced back as artifacts.
- Pi/provider credentials are copied only from explicit allowlisted files after trusted persistent container acknowledgement.
- Persistent Docker resources are removed only by explicit confirmed removal.

## Requirements

- Canonical PIDEX runtime checkout at `~/pidex`.
- Docker Engine/Desktop with Linux containers.
- Built local Project Pipeline image: PIDEX namespace `pidex`, image tag `project-node22:local`.
- Pi credentials configured on the host if you choose to copy them into the Project Sandbox.

On Linux, if the current shell has not picked up Docker group membership yet, use a fresh login shell or `newgrp docker`.

## Choosing Project Pipeline mode

From a project directory, run:

```text
/pd Describe the work you want done
```

If no mode is saved for the project, PIDEX asks once:

```text
host-direct / hardened-pipeline / project-pipeline
```

Choose `project-pipeline` for the persistent Docker Project Sandbox workflow.

When Project Pipeline mode is active, `/pd` invokes the typed `project-pipeline.run-flow` bridge directly. It does not start the host-direct orchestrator.

## Credential prompt

Project Pipeline runs Pi inside the container. If you want the containerized Pi to use your host Pi auth/settings, choose `Copy Pi credentials` when prompted.

This copies selected allowlisted files into the per-project Docker secrets volume. It does not copy your whole home directory.

Current security model: the Project Sandbox protects the host from project code; it does not protect copied credentials from code running inside that trusted project container.

## Artifacts and archive

After a Project Pipeline run, host-visible artifacts are under:

```text
~/pidex/state/project-archives/<project-id>/
```

Expected archive contents:

```text
agents.output/**
wiki/**
archive-sync-report.json
```

Do not expect host source files to appear there.

## Manage local Project Sandboxes

List all registered local Project Sandboxes:

```text
/pdproject status
```

Show one sandbox:

```text
/pdproject status <project-id>
```

Show recent Project Pipeline runs:

```text
/pdproject runs <project-id>
```

Start/open an existing sandbox container:

```text
/pdproject open <project-id>
```

Show copied credential state without printing fingerprints or secret values:

```text
/pdproject credentials status <project-id>
```

Reset copied credentials from the sandbox secrets volume and registry metadata:

```text
/pdproject credentials reset <project-id> --confirm <project-id>
```

Remove a persistent sandbox explicitly:

```text
/pdproject remove <project-id> --confirm <project-id>
```

Removal deletes the Docker container and named volumes for that Project Sandbox and removes its registry record. It does not delete archived host artifacts under `state/project-archives/<project-id>/`.

## Troubleshooting

### Docker permission denied

If Docker works in your user shell but not in a tool/subprocess shell, start a fresh login shell or run the command through:

```bash
newgrp docker -c '...'
```

### Image missing

Build the local image through the module helper:

```bash
node scripts/modules/run-check.mjs --capability project-pipeline.image --agent orchestrator --phase preflight --project . -- build --json
```

### Mode/helper missing

If `/pd` reports a missing Project Pipeline helper, update or initialize the canonical runtime checkout:

```text
/pidex-init-home
```

or update `~/pidex` from Git.

## Current limitations

- `/pd project-pipeline` currently enters the container through a planner/run-flow entrypoint. Full multi-agent in-container orchestration is the next major local-completion milestone.
- Project source is not exported back to host by PIDEX.
- External Docker hosts are intentionally deferred until local Docker is fully polished.
- PR creation/review automation is deferred.
- Dashboard views for Project Pipeline archives/runs are deferred.
