# Project Pipeline

Project Pipeline is PIDEX's local Docker-backed Project Sandbox mode. It is separate from the existing hardened agent sandbox. For a comparison with `host-direct` and `hardened-pipeline`, see [Project modes](modes.md).

In Project Pipeline mode, the project source lives and runs inside persistent Docker container volumes. Safe reviewable artifacts publish first to the authoritative PIDEX archive, then mirror into the registered host project for every normal `/pd` project.

## Status

- Local Docker workflow: complete for the current MVP.
- Linux validation: highest real `/pd` scenario passed with two Project Pipeline runs in one Project Sandbox.
- Native Windows validation: focused `/pd` Project Pipeline runs passed with Docker Desktop Linux containers, including automatic managed preview gates and host-side browser-smoke checks for simple and dashboard-style Vite React UI fixtures.
- Entry point: `/pd` with saved `project-pipeline` mode.
- Management command: `/pdproject`.
- In-container multi-agent orchestration: local facade and `/pd` bridge wired with phase-specific role prompts.
- Safe run/archive browsing: `runs`, `show-run`, and `artifacts` are available.
- Project Pipeline browser-smoke: QA/UAT/devops can request deterministic host-side browser checks through module-scoped rules; the host bridge resolves the managed preview URL from the Project Pipeline registry and writes archive evidence under `browser-smoke/**`.
- External Docker hosts: deferred.
- PR automation/review branches: deferred.
- Dashboard/archive browsing UI: deferred.

## Mental model

```text
host project path
→ /pd project-pipeline mode
→ persistent Docker Project Sandbox
→ source imported/cloned into /workspace
→ Pi runs inside the container
→ safe agents.output/** and wiki/** publish to the authoritative host archive
→ the validated archive mirrors into the registered host project
```

Project source is not mirrored back to the host by PIDEX. If you want source changes outside the container, use Git/PR workflows manually until PR automation is implemented.

## Safety invariants

- Project Pipeline mode is explicit per project.
- Missing mode asks once instead of silently falling back.
- Project Pipeline failures do not automatically fall back to host-direct or hardened-pipeline.
- Host archive sync is limited to `agents.output/**` and `wiki/**` with safe-copy filters.
- Every normal `/pd` Project Pipeline project requires a safe host-project mirror of those filtered trees; missing/unsafe/conflicting roots are reported as degraded, never as fully synchronized.
- Source files, `.env`, secrets, runtime files, and executable/code-like archive paths are not synced back as artifacts.
- Pi/provider credentials are copied only from explicit allowlisted files after trusted persistent container acknowledgement.
- Persistent Docker resources are removed only by explicit confirmed removal.

## Requirements

- Canonical PIDEX runtime checkout at `~/pidex` on Linux/WSL2 or `$HOME\pidex` for the experimental Windows bootstrap.
- Docker Engine/Desktop with Linux containers.
- Pi credentials configured on the host if you choose to copy them into the Project Sandbox.

The default local Project Pipeline Docker image is auto-built by the orchestrator when missing. It can also be built manually through the image helper for troubleshooting.

On Linux, if the current shell has not picked up Docker group membership yet, use a fresh login shell or `newgrp docker`.

## Choosing Project Pipeline mode

From a project directory, run normal `/pd`:

```text
/pd Describe the work you want done
```

From a non-project directory such as `$HOME`, `/pd` starts the orchestrator/chat-style project interview. Recent PIDEX projects are supplied as interview context so the orchestrator can list/group/filter them naturally instead of forcing a large extension select menu. After the project is selected, if no mode is saved for that project, PIDEX asks once and saves the choice:

```text
host-direct / hardened-pipeline / project-pipeline / Cancel
```

Choose `project-pipeline` for the persistent Docker Project Sandbox workflow. PIDEX then continues the same `/pd` task through the Project Pipeline orchestrator for the selected project.

For deterministic setup, tests, or explicit switching, you can also save mode before running `/pd`:

```text
/pdproject use project-pipeline
```

The mode can also be set to `host-direct` or `hardened-pipeline` with `/pdproject use ...`.

When Project Pipeline mode is active, `/pd` invokes the typed `project-pipeline.orchestrator` bridge. It does not start the host-direct orchestrator and does not fall back automatically.

## Credential prompt

Project Pipeline runs Pi inside the container. If you want the containerized Pi to use your host Pi auth/settings, choose `Copy Pi credentials` when prompted.

This copies selected allowlisted files into the per-project Docker secrets volume. It does not copy your whole home directory.

Current security model: the Project Sandbox protects the host from project code; it does not protect copied credentials from code running inside that trusted project container.

### Windows Git Credential Manager bridge

Windows GitHub credentials usually live in Windows Credential Manager via Git Credential Manager, not as a normal file that Docker can mount. For private GitHub remotes or container-side fetch/push, use the Windows-owned GCM bridge after the Project Sandbox exists:

```powershell
.\scripts\windows\project-pipeline-git-gcm-bridge.ps1 `
  -ProjectId <project-id> `
  -RemoteUrl https://github.com/<owner>/<repo>.git
```

The bridge asks Windows Git/GCM for the existing HTTPS credential, writes a temporary `.git-credentials` file under `<pidex-root>\state\secrets\git`, copies it into the per-project Docker secrets volume as `/pidex-secrets/git/.git-credentials`, configures the container Git credential helper to use that file, then deletes the temporary host file unless `-KeepTempSecret` is supplied. It does not print the token.

If GCM is not already signed in for the remote, `git credential fill` may prompt or trigger browser sign-in. SSH remotes are not handled by this bridge; use the existing explicit SSH key credential flow instead.

## Artifacts and archive

After a Project Pipeline run, authoritative host-visible evidence is under:

```text
~/pidex/state/project-archives/<project-id>/
```

For every normal `/pd` Project Pipeline project, the same filtered `agents.output/**` and `wiki/**` files are also mirrored into the registered project directory. The archive remains authoritative. A strictly schema-, project-, and root-bound PIDEX hash manifest tracks only files previously mirrored by Project Pipeline. Existing independently changed or unowned host files—including changes detected immediately before replacement or deletion—are preserved and reported as conflicts rather than overwritten. A file removed from the archive is deleted from the host mirror only when it is manifest-owned and still matches its last mirrored hash; unowned or host-edited files are never deleted. Mirror reads independently enforce archive file/depth/byte limits and require each source file to match the completed archive publication report while being read through a stable no-follow descriptor. Portable filesystem APIs cannot eliminate the final same-user check/use interval completely; detectable changes fail closed, while hostile same-user kernel/filesystem manipulation is outside the supported threat model.

Expected archive contents:

```text
agents.output/**
wiki/**
archive-sync-report.json
```

Do not expect host source files to appear there. Source code is never mirrored back. `/pdproject runs`, `show-run`, `status`, and `diagnose` distinguish archive completion from project-mirror completion or degradation.

## Manage local Project Sandboxes

List all registered local Project Sandboxes:

```text
/pdproject status
```

Show one sandbox:

```text
/pdproject status <project-id>
```

Run a no-Bash diagnostic for native Windows/desktop troubleshooting:

```text
/pdproject diagnose <project-id>
```

`diagnose` uses PIDEX Node helpers and Docker CLI directly. It summarizes registry state, Docker container/volume health, run count, archive presence, dashboard DB visibility, and safe next actions without relying on the Pi `bash` tool.

For orchestrator-driven troubleshooting, PIDEX also exposes a read-only `pidex_project` tool that wraps the same safe `/pdproject` logic. The orchestrator should use that tool for Project Pipeline diagnostics instead of spawning specialist agents just to inspect Docker/registry/archive state.

Show recent Project Pipeline runs:

```text
/pdproject runs <project-id>
```

Show one run with allowlisted metadata only:

```text
/pdproject show-run <project-id> <run-id>
```

`show-run` may report `archive_context=available`, but it does not print the host archive path, raw child output, fingerprints, or helper JSON.

List archived artifact filenames and sizes without reading file contents:

```text
/pdproject artifacts <project-id>
```

`artifacts` lists only archive files under `agents.output/**` and `wiki/**`. It does not print file contents or host archive paths.

Start/open an existing sandbox container:

```text
/pdproject open <project-id>
```

Repair a stopped or missing container when all three persistent volumes still exist:

```text
/pdproject repair <project-id> --confirm <project-id>
```

Repair is conservative. It may restart an existing container or recreate the container attached to the existing workspace/secrets/cache volumes. It will not recreate missing volumes or delete source; missing volumes are reported as a blocked repair and require an explicit remove/recreate decision.

Show copied credential state without printing fingerprints or secret values:

```text
/pdproject credentials status <project-id>
```

Reset copied credentials from the sandbox secrets volume and registry metadata:

```text
/pdproject credentials reset <project-id> --confirm <project-id>
```

For UI tasks, Project Pipeline attempts to start a managed preview automatically after a successful run and presents a browser URL for approval/rejection. Validation agents may also emit Project Pipeline browser-smoke request artifacts; when a managed preview is running, the host bridge runs deterministic browser checks with PIDEX-local Playwright and archives sanitized evidence. If automatic startup cannot be used, start a browser preview from inside the sandbox with an explicit command:

```text
/pdproject preview start <project-id> -- pnpm exec vite --host 0.0.0.0 --port $PORT
```

Inspect or stop preview:

```text
/pdproject preview status <project-id>
/pdproject preview logs <project-id>
/pdproject preview stop <project-id>
```

Preview reserves a high host port range per Project Sandbox and publishes it on container create/recreate. Existing published preview ranges are adopted when safe. Local Docker Desktop/native runs prefer `localhost`. Remote/headless Linux may bind all Docker-host interfaces and shows a browser URL using `PIDEX_PROJECT_PIPELINE_PREVIEW_HOST`, saved project host, or one detected LAN IPv4. PIDEX never shows `0.0.0.0` as browser URL, never opens cloud firewalls/tunnels, and does not copy credentials for preview setup. Preview helpers expand `$PORT`, `${PORT}`, and `%PORT%` before process start, and Docker CLI calls are guarded against Git Bash/MSYS path conversion. Summaries omit raw Docker commands, helper JSON, absolute secret paths, and unbounded logs.

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

### Image missing or image build fails

The orchestrator auto-builds the local image when missing. If that fails or you want to preflight manually, build the local image through the module helper:

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

- `pidex_project` is currently read-only. Actions such as repair, remove, open, and preview start remain explicit `/pdproject` commands while confirmation and safety UX are designed.
- Project source is not exported back to host by PIDEX.
- External Docker hosts are intentionally deferred and require user/admin preparation for a dedicated non-root `pidex@host` Docker-capable account.
- PR creation/review automation is deferred.
- Dashboard views for Project Pipeline archives/runs are deferred; use `/pdproject runs`, `/pdproject show-run`, and `/pdproject artifacts` locally.
