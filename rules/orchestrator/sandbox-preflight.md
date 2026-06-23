# Sandbox preflight rule

This rule covers the temporary hardened agent sandbox (`hardened-pipeline`). It is separate from Project Pipeline (`project-pipeline`), which is an explicit user-selected persistent Docker Project Sandbox workflow.

- Public defaults for the hardened agent sandbox remain `enabled=false` and `default_mode=off`.
- When hardened sandbox config is disabled/off, do not probe Docker during normal `/pidex` or `/pd` preflight.
- When `hardened-pipeline` is explicitly active in local policy, run the sandbox runtime probe before sandboxed phases.
- When `project-pipeline` is selected, the extension should already route `/pd` through the Project Pipeline orchestrator; do not reinterpret it as the temporary hardened agent sandbox.
- If the probe reports unavailable, fail with the probe's actionable reason; do not ask mid-run configuration questions.
- The orchestrator still chooses concrete routing dynamically; sandbox mode must not impose a fixed agent route or new normal-run user gate.

Phase 0 only provides probe evidence. Full active sandbox context, tool-call hardening, Docker command execution, patch apply, artifact extraction, and cleanup are deferred to later initiative 021 phases.
