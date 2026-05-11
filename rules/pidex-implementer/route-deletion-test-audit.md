# Rule: Route-Deletion Test-Reference Audit

PROC-NEW-21 | pidex-implementer

## Rule

**Before executing any slice that deletes route constants, route path strings, or named route entries from a module: grep all test files for the deleted string values and update or remove matching references in the same slice.**

A route-deletion slice is not complete until test-file references are resolved. Do NOT commit the deletion without resolving the grep results.

## Steps

1. Identify all string values being deleted (e.g., `"/services"`, `"/issues"`, `"/agents"`).
2. For each deleted string, run:
   ```bash
   grep -rn "<deleted-string>" <project-root>/src/ --include="*.test.*"
   grep -rn "<deleted-string>" <project-root>/src/ --include="*.spec.*"
   grep -rn "<deleted-string>" <project-root>/test*/ 2>/dev/null
   ```
3. For each match:
   - If the test asserts the route EXISTS: delete the assertion or replace with the new route.
   - If the test navigates to the route: update to the replacement route.
   - If the test imports a constant that no longer exists: remove the import and the test that depends on it, or update to the replacement constant.
4. Include all test-file edits in the same git commit as the deletion.

## Scope

This rule applies when the plan:
- Removes route entries from a route config file (e.g., `nav-routes.ts`, `routes.tsx`)
- Deletes a route path constant (e.g., `ROUTES.services = "/services"`)
- Removes a named export that was a route string

This is **distinct** from the existing alias/import audit. Alias audit = TypeScript `import` statements. This audit = test file string literals and constant references.

## Empirical basis

Plan 34 (plan-d-nextjs-removal): Deleted `/services`, `/issues`, `/agents` from `nav-routes.ts`. Three test files (`nav-routes.test.ts`, `shell.test.tsx`, `route-card.test.tsx`) still asserted on these route strings. Orchestrator fixed under Rule 10a — 30 min unplanned remediation. All three fixes belonged in the deletion slice.
