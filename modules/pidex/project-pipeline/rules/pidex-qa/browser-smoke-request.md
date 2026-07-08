# Project Pipeline browser-smoke request rules for QA

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

QA may emit a browser-smoke request JSON artifact when browser-visible UI behavior matters for acceptance.

Rules:

- Write request artifacts under `agents.output/qa/**.json`.
- The request artifact MUST use browser-smoke request schema version `1` exactly as shown below.
- Do not invent alternate schema keys. In particular, do NOT use `request_type`, `project`, `expected`, `expected_text`, `selector`, or `level`.
- Use `project_id`, not `project`.
- The `project_id` value MUST exactly match the canonical Project Pipeline registry project_id shown in the phase prompt. Do not derive it from the app name, folder name, package name, route, or user-facing project title.
- Use `contains` for `title` and `text` checks.
- Use `exists` for `selector` checks.
- Use `path_contains` or `path_equals` for `url` checks; do not use `contains`, `expected`, or other ad-hoc keys for `url`.
- Use `errors: "none"` for `console` checks.
- Use only allowlisted check types: `title`, `text`, `selector`, `url`, and `console`.
- Do not include or invent preview URLs. The host bridge resolves the managed preview URL from the Project Pipeline registry.
- Do not ask the user to manually run browser-smoke or preview commands as the primary path.
- Do not request arbitrary JavaScript, shell commands, browser scripts, or host Playwright execution.
- Treat `BROWSER-SMOKE-SKIP-NOT-CONFIGURED` as evidence to document, not a reason to install browsers in the Project Sandbox.

Canonical request template:

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
    {
      "type": "title",
      "contains": "<expected page title text>"
    },
    {
      "type": "text",
      "contains": "<expected visible body text>"
    },
    {
      "type": "selector",
      "exists": ".status-card"
    },
    {
      "type": "url",
      "path_contains": "/"
    },
    {
      "type": "console",
      "errors": "none"
    }
  ],
  "capture": {
    "screenshot": true,
    "console_errors": true
  },
  "timeout_ms": 30000,
  "reason": "QA browser-visible acceptance evidence for this Project Pipeline task."
}
```

If a check is not applicable, omit that check object rather than changing its key names. Keep `checks` between 1 and 25 items.
