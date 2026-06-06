# Sandbox preflight rule

Sandbox mode is internal execution hardening, not a user workflow change.

- Public defaults remain `enabled=false` and `default_mode=off`.
- When sandbox config is disabled/off, do not probe Docker during normal `/pidex` or `/pd` preflight.
- When `hardened-pipeline` is explicitly active in local policy, run the sandbox runtime probe before sandboxed phases.
- If the probe reports unavailable, fail with the probe's actionable reason; do not ask mid-run configuration questions.
- The orchestrator still chooses concrete routing dynamically; sandbox mode must not impose a fixed agent route or new normal-run user gate.

Phase 0 only provides probe evidence. Full active sandbox context, tool-call hardening, Docker command execution, patch apply, artifact extraction, and cleanup are deferred to later initiative 021 phases.
