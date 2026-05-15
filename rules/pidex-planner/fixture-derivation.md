# Rule: Domain Fixture Derivation (Agent and Service Identifiers)

PROC-NEW-X1 | pidex-planner

## Rule

When plan includes any fixture containing **agent identifiers, service names, or interface names** (e.g., a Permissions matrix, agent-capability table, or entity-registry seed), the planner MUST:

1. **Grep existing domain fixture / seed files** in the project before authoring fixture data:
   - Search for established identifier patterns (agent names, service names, entity IDs)
   - Project-specific grep command and file paths: `pidex/rules/pidex-planner.md`
2. **Use the discovered identifiers** as the source of truth for the fixture. Do NOT invent new names.
3. **Cite the source file** in the plan's fixture seed data table:

| Column | Value | Source |
|--------|-------|--------|
| agentId | `<discovered-name>` | `<source-fixture-file>` |

**Red flag**: developer-internal or tooling names appearing in user-visible fixture data. These are meaningless to the end user of the application. Replace with domain-appropriate names from existing fixture files.

## Scope

Applies when plan fixture seed data contains any identifier column (agent name, service name, interface name). Does NOT apply to structural/shape fixtures with no named entities.

## Project-specific extension

If the active project has `pidex/rules/pidex-planner.md`, load it for:
- The project-specific grep command and fixture file paths
- Known domain identifier lists
- Project-specific red flags for bad identifier patterns

## Empirical basis

A plan specified internal tooling names as user-visible agent identifiers in a Permissions fixture. Structurally valid; semantically wrong for the domain user. G9 rejected twice before domain fixtures were grepped and correct names substituted. A single grep at planning time prevents this class of G9 rejection entirely.
