# Project Pipeline browser-smoke verdict rules for QA

These module-scoped rules apply only in Project Pipeline mode when `project-pipeline.browser-smoke` is available.

When the orchestrator provides browser-smoke result context, QA owns the final interpretation.

Rules:

- Read only the sanitized archive-relative result references supplied by the orchestrator.
- Do not copy host absolute paths into QA artifacts.
- Do not modify source files during the verdict step.
- Write the final verdict under `agents.output/qa/**`.
- Interpret statuses as follows:
  - `BROWSER-SMOKE-PASS`: browser evidence supports the relevant acceptance criteria.
  - `BROWSER-SMOKE-FAILED-FEATURE`: user-visible behavior failed; route correction with concise visible symptoms.
  - `BROWSER-SMOKE-SKIP-NOT-CONFIGURED`: browser runtime missing; document limitation and any fallback evidence.
  - `BROWSER-SMOKE-BLOCKED-INFRA`: request, preview, or infrastructure problem; do not call the feature passed.
