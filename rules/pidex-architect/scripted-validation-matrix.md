# Rule: Scripted Validation Matrix for User-Visible Behavior

PROC-NEW-ARCH-SCRIPTED-VALIDATION | pidex-architect

## Trigger

Architecture review covers user-visible behavior: HTTP routes, UI components, CLI commands, SSE/WS endpoints, background jobs with user-visible result, or anything user/client can trigger over wire.

## Rule

For each validation row representing user-visible behavior, verification MUST be scripted and non-interactive.

Allowed examples:
- `curl` / `wget`
- vitest/Jest HTTP test
- headless Playwright test
- named test harness command
- dev-server script with explicit boot/kill, e.g. `npm run dev & sleep 5; curl ...; kill %1`

Disallowed as sufficient verification:
- "manual optional"
- "curl if time permits"
- "maintainer verifies visually"
- "build-level check sufficient"
- typecheck/grep/build-only for user-visible behavior

Build/typecheck/grep are acceptable only for non-user-visible invariants, e.g. stale imports, strict mode, generated types.

## Why

Plan 15 shipped user-visible regressions (cwd-relative wiki path, `/v2` bare redirect) past automated gates because validation allowed build-level checks plus optional manual curl.
