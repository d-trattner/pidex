# Docker sandbox

PIDEX includes Docker-backed sandboxing in two related but separate tracks:

- **hardened agent sandbox** (`hardened-pipeline`): optional internal execution hardening for selected source-changing pipeline steps, with host source remaining canonical.
- **Project Pipeline** (`project-pipeline`): persistent Docker Project Sandbox where project source and Pi run inside the container; safe artifacts/wiki publish to the authoritative host archive and then mirror into the registered host project.

This page focuses on the hardened agent sandbox. See [Project Pipeline](project-pipeline.md) for the persistent project workflow.

## Status

- Public default: off.
- Agent-sandbox MVP mode: `hardened-pipeline`.
- Project Pipeline local MVP: validated separately; see [Project Pipeline](project-pipeline.md).
- Runtime requirement: canonical PIDEX checkout at `~/pidex` / `$HOME\pidex`, or `PIDEX_ROOT` pointing at an equivalent full checkout.
- npm package role: lightweight Pi bootstrap only; sandbox runtime is a canonical-checkout feature.
- Linux/direct-mode validation: real `/pd` small pipeline passed end-to-end with sandbox enabled.
- Native Windows validation: Docker helper runtime smoke passed from PowerShell with Docker Desktop Linux containers; Project Pipeline has a separate native Windows low `/pd` smoke pass. Broader native Windows pipeline evidence is still pending.
- Dashboard settings integration: deferred.

## What the sandbox protects

When enabled locally, PIDEX creates a temporary copied workspace, runs selected risky/source-changing work through Docker-backed helpers, then applies validated source patches and assigned artifacts back to the host project.

The MVP avoids mounting these host resources into Docker:

- host repository as a writeable mount;
- host home directory;
- Docker socket;
- SSH agent;
- provider auth and cloud credentials;
- `.env`, `.npmrc`, and other secret/runtime files.

## Local opt-in

`config/sandbox.json` is safe by default:

```json
{
  "enabled": false,
  "default_mode": "off"
}
```

Use ignored local config for experimentation:

```json
{
  "enabled": true,
  "default_mode": "hardened-pipeline",
  "profiles": {
    "hardened-pipeline": {
      "enabled": true
    }
  }
}
```

Save that as:

```text
config/sandbox.local.json
```

Do not commit local sandbox overrides.

## Validation

Probe Docker support through the sandbox runtime helper in a canonical checkout, or just run the full project check, which includes sandbox runtime contract tests.

Run the full project check on Linux/WSL/Git Bash-capable environments:

```bash
pnpm run check
```

Native PowerShell can run the Docker probe and targeted Node-based sandbox checks directly. The full `pnpm run check` command is Bash-backed and has passed on native Windows with Git Bash available, but it is still not a pure PowerShell validation path.

Docker probe through the module capability runner:

```powershell
node scripts/modules/run-check.mjs --capability sandbox.probe --agent orchestrator --phase preflight --project $PWD -- --json
```

For development checkouts, targeted Node-based sandbox and extension TDD scripts can also be run directly from native PowerShell. Keep those direct script paths as developer-local commands rather than package-facing documentation.

A focused native Windows helper smoke has passed with Docker Desktop Linux containers: sandbox command execution edited a copied workspace, diff generation produced a source-only patch while excluding gitignored `agents.output/**`, patch apply updated the host fixture, assigned artifact extraction copied `agents.output/implementation/test.md`, cleanup removed the workspace, and no labeled sandbox containers remained.

## Security boundary notes

Docker improves host protection but is not a perfect boundary for hostile arbitrary code because normal containers share the host kernel. PIDEX uses copy-in/copy-out workspaces, Docker hardening flags, env/secret guards, patch validation, artifact allowlists, cleanup confinement, and host tool-call guards as defense in depth.

Non-root container execution and dashboard control are future hardening items.
