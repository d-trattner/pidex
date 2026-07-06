# Project Pipeline browser-smoke verdict rules for UAT

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

When the orchestrator provides browser-smoke result context, UAT owns the final user-facing interpretation.

Rules:

- Read only the sanitized archive-relative result references supplied by the orchestrator.
- Do not copy host absolute paths into UAT artifacts.
- Do not modify source files during the verdict step.
- Write the final verdict under `agents.output/uat/**`.
- If the result is `BROWSER-SMOKE-PASS`, record concise acceptance evidence.
- If the result is `BROWSER-SMOKE-FAILED-FEATURE`, route correction with the visible failure symptoms.
- If the result is skipped or blocked, state the limitation and whether manual user preview approval is still required.
