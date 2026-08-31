# PIDEX Angular module

Optional, reversible mechanics for the `angular-application` skill.

Capabilities:

- `angular.source-check` — verifies pinned Angular/Material/Nx references and attribution.
- `angular.inspect` — detects Angular, Material and Nx workspace/version/graph state.
- `angular.verify` — runs only declared build/test/lint/affected targets through structured argv.

Use capabilities through `scripts/modules/run-check.mjs`. Do not call module scripts directly from agents, rules, skills, or public documentation.

Disable with a local module override:

```json
{
  "modules": {
    "pidex.angular": { "enabled": false }
  }
}
```

When disabled, capability discovery fails closed and the skill's mandatory module gate tells the model not to apply the PIDEX Angular optimization layer. Pi may still list the statically packaged skill until `/reload`; a normal Git/package rollback removes it entirely.

MCP, WebMCP, generated Angular/Nx AI configuration, Nx Cloud automation, global Angular installation, and dependency installation are outside this module.
