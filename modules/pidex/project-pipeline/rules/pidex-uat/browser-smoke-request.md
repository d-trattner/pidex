# Project Pipeline browser-smoke request rules for UAT

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

UAT may emit a browser-smoke request JSON artifact for user-visible acceptance evidence.

Rules:

- Write request artifacts under `agents.output/uat/**.json`.
- Request only checks that reflect user-facing acceptance behavior.
- The request artifact MUST use browser-smoke request schema version `1` exactly as shown below.
- Do not invent alternate schema keys. In particular, do NOT use `request_type`, `project`, `expected`, `expected_text`, `selector`, or `level`.
- Use `project_id`, not `project`.
- The `project_id` value MUST exactly match the canonical Project Pipeline registry project_id shown in the phase prompt. Do not derive it from the app name, folder name, package name, route, or user-facing project title.
- Use `contains` for `title` and `text` checks.
- Use `exists` for `selector` checks.
- Use `path_contains` or `path_equals` for `url` checks; do not use `contains`, `expected`, or other ad-hoc keys for `url`.
- Use `errors: "none"` for `console` checks.
- Use only allowlisted check types: `title`, `text`, `selector`, `url`, and `console`.
- Do not include preview URLs. The host bridge resolves the managed preview URL from the Project Pipeline registry.
- Do not ask the user to manually run browser-smoke or preview commands as the primary path.
- Do not request arbitrary JavaScript, shell commands, browser scripts, or host Playwright execution.

Canonical request template:

```json
{
  "schema": 1,
  "requester": "pidex-uat",
  "project_id": "<canonical Project Pipeline registry project_id from the phase prompt>",
  "request_id": "uat-browser-smoke-<stable-unique-id>",
  "phase_run_id": "<current-phase-or-run-id>/pidex-uat",
  "created_at": "<ISO-8601 timestamp>",
  "preview": {
    "managed": true,
    "process": "preview"
  },
  "checks": [
    {
      "type": "text",
      "contains": "<expected visible user-facing text>"
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
  "reason": "UAT browser-visible acceptance evidence for this Project Pipeline task."
}
```

If a check is not applicable, omit that check object rather than changing its key names. Keep `checks` between 1 and 25 items.
