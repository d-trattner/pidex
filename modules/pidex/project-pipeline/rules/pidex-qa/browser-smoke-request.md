# Project Pipeline browser-smoke request rules for QA

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

QA may emit a browser-smoke request JSON artifact when browser-visible UI behavior matters for acceptance.

Rules:

- Write request artifacts under `agents.output/qa/**.json`.
- Use only allowlisted check types: `title`, `text`, `selector`, `url`, and `console`.
- Do not include or invent preview URLs. The host bridge resolves the managed preview URL from the Project Pipeline registry.
- Do not ask the user to manually run browser-smoke or preview commands as the primary path.
- Do not request arbitrary JavaScript, shell commands, browser scripts, or host Playwright execution.
- Treat `BROWSER-SMOKE-SKIP-NOT-CONFIGURED` as evidence to document, not a reason to install browsers in the Project Sandbox.
