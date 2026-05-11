# Third-Party Package Registry Check

When plan specifies **third-party package by exact name** (especially major integrations, framework adoptions, pinned versions), include registry status checkpoint in plan's Pre-Implementation section:

**Check:** Is package still active under specified name, or renamed/deprecated/split upstream?

```bash
npm info <package-name> dist-tags
# If "npm info" returns "404 Not Found" or "deprecated", the package has moved.
# Check the deprecation message for the canonical replacement name.
```

**When mandatory:**
- Plan installs new framework or major runtime dependency by exact name
- Plan pins specific version (e.g., `@tanstack/start@1.120.20`)
- Plan references recently released or rapidly-developing package

**Why:** Package renames not backwards-compatible at registry level. Plan specifying `@tanstack/start` when canonical name is `@tanstack/react-start` requires flexibility clause (R-B0-2) to absorb discovery at implementation. One-line `npm info` during planning lets plan specify correct name from start.

**Format:** Add "Registry Status" row to plan's dependency table or pre-implementation notes:

| Package | Specified Name | Registry Status | Canonical Name | Checked |
|---|---|---|---|---|
| TanStack Start | `@tanstack/start` | RENAMED | `@tanstack/react-start@1.167.42` | 2026-04-21 |
