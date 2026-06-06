# Docker sandbox

PIDEX includes an optional Docker-backed sandbox runtime for selected source-changing pipeline steps. It is internal execution hardening, not a separate user workflow: `/pidex` and `/pd` stay the normal entrypoints.

## Status

- Public default: off.
- MVP mode: `hardened-pipeline`.
- Runtime requirement: canonical PIDEX checkout at `~/pidex` or `PIDEX_ROOT` pointing at an equivalent full checkout.
- npm package role: lightweight Pi bootstrap only; sandbox runtime is a canonical-checkout feature.
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

Run the full project check:

```bash
pnpm run check
```

## Security boundary notes

Docker improves host protection but is not a perfect boundary for hostile arbitrary code because normal containers share the host kernel. PIDEX uses copy-in/copy-out workspaces, Docker hardening flags, env/secret guards, patch validation, artifact allowlists, cleanup confinement, and host tool-call guards as defense in depth.

Non-root container execution and dashboard control are future hardening items.
