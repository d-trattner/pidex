# PIDEX Sandbox Runtime

First-party PIDEX module for deterministic Docker/workspace sandbox operations.

Phase 0 provides only the read-only Docker capability probe. Full pipeline integration, workspace lifecycle, command execution, diff/apply, artifact extraction, and cleanup are intentionally deferred to later initiative 021 phases.

## Public default

Sandboxing is disabled by default in `config/sandbox.json`:

```json
{
  "enabled": false,
  "default_mode": "off"
}
```

When `enabled=false` or `default_mode=off`, normal `/pidex` and `/pd` orchestration must not require Docker and should skip Docker probing unless a caller explicitly asks for sandbox capability evidence.

## Local opt-in

Do not edit or publish enabled defaults. Enable locally with ignored `config/sandbox.local.json`:

```json
{
  "enabled": true,
  "default_mode": "hardened-pipeline",
  "profiles": {
    "hardened-pipeline": {
      "enabled": true,
      "image": "node:22-slim",
      "network_default": "none",
      "memory": "4g",
      "cpus": 2,
      "pids_limit": 512,
      "timeout_seconds": 300,
      "preserve_on_failure": true,
      "container_user_mode": "image-default",
      "container_user_enforced": false
    }
  }
}
```

With local opt-in, `/pidex` and `/pd` probe Docker before starting and fail with an actionable reason if Docker is unavailable. Source-changing specialists currently use the sandboxed path for `pidex-implementer`, `pidex-qa`, and `pidex-security`.

Sandbox is a canonical-checkout feature for MVP. It requires the PIDEX runtime checkout at `~/pidex` (or `PIDEX_ROOT` pointing at an equivalent full checkout). The npm package remains a lightweight Pi bootstrap package and does not rely on packed sandbox runtime files. If sandbox is enabled but the runtime module is missing, update/initialize `~/pidex` rather than enabling sandbox from a bootstrap-only package root.

The MVP uses Docker image-default user behavior (`container_user_mode: "image-default"`) and does not pass `--user`; metadata records `container_user_enforced: false`. Non-root container execution is future hardening because it needs image/user/cache/workspace ownership validation.

## Probe

Linux/macOS-like shells:

```bash
node modules/pidex/sandbox-runtime/scripts/sandbox/probe.mjs --json
```

PowerShell:

```powershell
node .\modules\pidex\sandbox-runtime\scripts\sandbox\probe.mjs --json
```

The probe mutates only a temporary probe directory and emits JSON only. It checks:

- Docker CLI availability;
- Docker daemon responsiveness;
- Linux container execution with `node:22-slim`;
- Node inside the Linux container;
- temporary directory mount/write;
- host visibility of the container-written file;
- OS classification (`linux`, `wsl2`, `windows-native`, `windows-git-bash`, or `other`).

On Windows Docker Desktop, `docker info` is not enough: mount/write must pass before `hardened-pipeline` is considered available.

## Safety boundary

The probe does not mount the host repository, host home, Docker socket, SSH agent, provider credentials, or PIDEX host state.

## Copy limits

The runtime excludes known heavy/runtime/secret paths (`.git`, `node_modules`, env files, `agents.output`, `state`, `coverage`, `dist`, etc.). For Git projects, workspace copy is based on `git ls-files -co --exclude-standard`, so tracked files plus untracked non-ignored files are copied while `.gitignore`, `.git/info/exclude`, and global Git excludes are honored. Non-Git projects fall back to the recursive scanner plus the PIDEX denylist. The runtime does not impose a hard file-size or total-size limit by default, because silent or overly aggressive size skipping can make the sandbox workspace semantically different from the host project. If local/future limits are configured, exceeding them fails closed before Docker execution rather than running against an incomplete workspace.
