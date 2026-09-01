# PIDEX Angular module

Optional, reversible profile selection and source-integrity mechanics for the `angular-application` skill.

Capabilities:

- `angular.source-check` — verifies pinned Angular, Material and Nx references and attribution.
- `angular.inspect` — reads bounded workspace metadata to detect Angular, Material and Nx versions/profiles.

Both capabilities are read-only. This module does not provide an Angular build, test, lint, affected, generator, package-manager, Git, network, or benchmark runner. Application work uses the project's existing tools through normal coding-agent facilities and explicit user authority.

Use capabilities through `scripts/modules/run-check.mjs`. Do not call module scripts directly from agents, rules, skills, or public documentation.

Disable with a local module override:

```json
{
  "modules": {
    "pidex.angular": { "enabled": false }
  }
}
```

When disabled, capability discovery fails closed and the skill gate tells the model not to apply the packaged Angular guidance. Pi may still list the statically packaged skill until `/reload`; a normal Git/package rollback removes it entirely.

MCP, WebMCP, generated Angular/Nx AI configuration, Nx Cloud automation, global Angular installation, dependency installation, and unadmitted test-derived edge cases are outside this module.
