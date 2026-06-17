# Sandbox workspace rule

When a hardened-pipeline sandbox context is active:

- Treat `sandbox_workspace` as the only writable project root.
- Do not write/edit the host `project_root`.
- Project commands must run through PIDEX sandbox runtime helpers, not raw host shell in the host project.
- For validation commands, use the canonical helper shape supplied in the task. It starts with `node <sandbox-exec-helper>` and passes `--project <SANDBOX_WORKSPACE> --pidex-root <PIDEX_ROOT> --mode hardened-pipeline --phase test --json -- npm test`.
- Do not use `git commit`, host `git status`, or raw host bash as a completion gate. The sandbox wrapper owns diff generation, host patch apply, and artifact extraction after final ROUTING.
- If source changes and required validation are complete inside the sandbox, return `verdict: COMPLETE` and route normally (usually `pidex-code-reviewer`), even though no host commit exists yet.
- Reads of env/secret/runtime paths are blocked with explicit reasons.
- Report sandbox evidence or `SANDBOX-SKIP` in final output.

Phase 0-3 runtime scripts exist in the sandbox-runtime module. Full Pi tool-call hardening is fixed-core/extension responsibility and must not be replaced by agent self-declaration.
