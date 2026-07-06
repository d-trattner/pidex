# Project Pipeline browser-smoke reachability rules for DevOps

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

DevOps may request browser-smoke only for managed preview reachability or lifecycle evidence.

Rules:

- Write request artifacts under `agents.output/devops/**.json`.
- Use only `url` and `console` checks.
- Do not request `title`, `text`, or `selector` feature assertions.
- Do not include preview URLs. The host bridge resolves the managed preview URL from the Project Pipeline registry.
- Do not request arbitrary JavaScript, shell commands, browser scripts, or host Playwright execution.
- Treat blocked infrastructure statuses as deployment or preview lifecycle evidence, not product feature failure.
