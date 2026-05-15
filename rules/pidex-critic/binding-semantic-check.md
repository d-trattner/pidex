# Rule: Binding Fixture Identifier Semantic Check

PROC-NEW-X3 | pidex-critic

## Rule

For any plan with a **binding fixture table** containing identifier columns (agent names, service names, interface names, entity IDs):

1. Verify identifiers are **semantically appropriate** for the domain — not just structurally valid.
2. Developer-internal names (pipeline tooling names, framework names, infra names) in user-visible fixture data = **CRITICAL** finding.
   - End users see these in the UI; internal names are meaningless/misleading.
3. Domain identifiers should derive from existing fixture/seed files in the project.
   - If plan does NOT cite a source fixture file for its identifiers, flag as MEDIUM finding: "Fixture identifiers lack derivation source — planner must cite source file."
4. Ask: "Do these identifier values make sense to the application's end user, or are they internal/developer names?"

## Finding format

**CRITICAL** (developer-internal names in user-visible fixture):
```
Finding: Developer-internal names in user-visible fixture data
Severity: CRITICAL
Details: Plan uses <internal-names> as domain identifiers in <fixture name>.
These are internal names, not domain entities. User-visible UI will display meaningless values.
Recommendation: Grep domain fixture files for established identifiers; replace before implementation.
```

**MEDIUM** (missing source citation):
```
Finding: Fixture identifiers lack derivation source
Severity: MEDIUM
Details: Plan specifies domain names in binding fixture but does not cite source fixture file.
Recommendation: Planner must grep existing domain fixtures and cite source file in plan.
```

## Project-specific extension

Load `pidex/rules/pidex-critic.md` for:
- Project-specific known-bad identifier patterns (e.g., specific framework or tooling names that should never appear in domain fixtures)
- Known domain identifier lists against which to cross-check

## Empirical basis

A plan marked a Permissions fixture as "Binding — pidex-uat will assert exact matches" with internal tooling names as domain identifiers. Structurally valid; semantically wrong. The binding enforced implementation-to-plan alignment, but the plan itself was wrong. G9 rejected twice. The critic gate is the correct place to catch this before implementation begins.
