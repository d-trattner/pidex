# Project Pipeline browser-smoke request rules for QA

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

QA may emit browser-smoke request JSON under `agents.output/qa/**.json` for browser-visible acceptance evidence.

## Schema choice

- Schema 1 remains available for simple checks. Use its existing canonical template and allowlisted `title`, `text`, `selector`, `url`, and `console` checks unchanged.
- MUST use schema 2 when acceptance needs rich acceptance such as Weborder Plan036 viewports, interactions, or layout assertions.
- Derive safe selectors and numeric bounds from acceptance and project evidence; never invent URL, credentials, JavaScript, or project specification.
- Managed preview resolves host URL. No sandbox browser or install fallback. Do not request arbitrary JavaScript, shell commands, browser scripts, host Playwright, or manual browser-smoke as primary path.
- Schema 2 request keys, viewport keys, and operation keys are closed. Omit inapplicable operations; do not add keys.

Schema 1 rules:

- Use `project_id`, not `project`. The `project_id` value MUST exactly match the canonical Project Pipeline registry project_id shown in the phase prompt. Do not derive it from app name, folder name, package name, route, or user-facing project title.
- Use `contains` for `title` and `text` checks.
- Use `exists` for `selector` checks.
- Use `path_contains` or `path_equals` for `url` checks; do not use `contains`, `expected`, or other ad-hoc keys for `url`.
- Use `errors: "none"` for `console` checks.
- Use only allowlisted check types: `title`, `text`, `selector`, `url`, and `console`.
- Do not invent alternate schema keys. In particular, do NOT use `request_type`, `project`, `expected`, `expected_text`, `selector`, or `level`.
- Do not include or invent preview URLs. The host bridge resolves managed preview URL from Project Pipeline registry.

Canonical schema 1 template:

```json
{
  "schema": 1,
  "requester": "pidex-qa",
  "project_id": "<canonical Project Pipeline registry project_id from the phase prompt>",
  "request_id": "qa-browser-smoke-<stable-unique-id>",
  "phase_run_id": "<current-phase-or-run-id>/pidex-qa",
  "created_at": "<ISO-8601 timestamp>",
  "preview": {
    "managed": true,
    "process": "preview"
  },
  "checks": [
    { "type": "title", "contains": "<expected page title text>" },
    { "type": "text", "contains": "<expected visible body text>" },
    { "type": "selector", "exists": ".status-card" },
    { "type": "url", "path_contains": "/" },
    { "type": "console", "errors": "none" }
  ],
  "capture": { "screenshot": true, "console_errors": true },
  "timeout_ms": 30000,
  "reason": "QA browser-visible acceptance evidence for this Project Pipeline task."
}
```

Canonical closed schema 2 template:

```json
{
  "schema": 2,
  "requester": "pidex-qa",
  "project_id": "<canonical-project-id-from-phase-prompt>",
  "request_id": "qa-browser-smoke-<stable-unique-id>",
  "phase_run_id": "<current-phase-or-run-id>/pidex-qa",
  "created_at": "<ISO-8601-timestamp>",
  "preview": { "managed": true, "process": "preview" },
  "viewports": [
    {
      "id": "desktop-1280",
      "width": 1280,
      "height": 800,
      "route": "/safe-route-from-acceptance",
      "preconditions": [{ "type": "selector_present", "selector": ".safe-page-root" }],
      "actions": [
        { "type": "hover", "selector": ".safe-hover-target" },
        { "type": "focus", "selector": ".safe-focus-target" }
      ],
      "checks": [
        { "type": "selector_present", "selector": ".safe-page-root" },
        { "type": "aria_describedby", "trigger_selector": ".safe-help-trigger", "description_selector": ".safe-help-description" },
        { "type": "dimension", "selector": ".safe-layout-track", "property": "clientWidth", "operator": "lte", "value": 1280 },
        { "type": "bounding_box", "subject_selector": ".safe-panel", "reference_selector": ".safe-page-root", "relation": "contained_by" },
        { "type": "console", "errors": "none" }
      ],
      "capture": { "screenshot": true, "console_errors": true }
    },
    {
      "id": "desktop-1440",
      "width": 1440,
      "height": 900,
      "route": "/safe-route-from-acceptance",
      "preconditions": [{ "type": "auth_state", "authenticated_selector": ".safe-authenticated-state", "login_selector": ".safe-login-state" }],
      "actions": [
        { "type": "keyboard", "key": "Tab", "selector": ".safe-focus-target" },
        { "type": "scroll_into_view", "selector": ".safe-scroll-target", "block": "center", "inline": "nearest" }
      ],
      "checks": [
        { "type": "selector_present", "selector": ".safe-page-root" },
        { "type": "dimension", "selector": ".safe-layout-track", "property": "clientWidth", "operator": "lte", "value": 1440 },
        { "type": "console", "errors": "none" }
      ],
      "capture": { "screenshot": true, "console_errors": true }
    }
  ],
  "timeout_ms": 30000
}
```

Only schema 2 operations shown above are allowed: `selector_present`, `auth_state`, `hover`, `focus`, `keyboard`, `scroll_into_view`, `aria_describedby`, `dimension`, `bounding_box`, and `console`. Actions precede checks; separate viewport states may cover hover and keyboard/focus because actions precede checks.

For schema 1, keep `checks` between 1 and 25 items. For schema 2, use one to four evidence-backed viewports and at most 40 total preconditions, actions, and checks per viewport.