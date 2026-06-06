# Sandbox workspace rule

When a hardened-pipeline sandbox context is active:

- Treat `sandbox_workspace` as the only writable project root.
- Do not write/edit the host `project_root`.
- Project commands must run through PIDEX sandbox runtime helpers, not raw host shell in the host project.
- Reads of env/secret/runtime paths are blocked with explicit reasons.
- Report sandbox evidence or `SANDBOX-SKIP` in final output.

Phase 0-3 runtime scripts exist in the sandbox-runtime module. Full Pi tool-call hardening is fixed-core/extension responsibility and must not be replaced by agent self-declaration.
