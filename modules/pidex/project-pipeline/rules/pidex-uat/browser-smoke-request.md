# Project Pipeline browser-smoke request rules for UAT

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

UAT may emit a browser-smoke request JSON artifact for user-visible acceptance evidence.

Rules:

- Write request artifacts under `agents.output/uat/**.json`.
- Request only checks that reflect user-facing acceptance behavior.
- Use only allowlisted check types: `title`, `text`, `selector`, `url`, and `console`.
- Do not include preview URLs. The host bridge resolves the managed preview URL from the Project Pipeline registry.
- Do not ask the user to manually run browser-smoke or preview commands as the primary path.
- Do not request arbitrary JavaScript, shell commands, browser scripts, or host Playwright execution.
