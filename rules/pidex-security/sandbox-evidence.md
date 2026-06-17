# Sandbox security evidence

For sandbox security review, verify and document:

- no host repo write mount;
- no host home mount;
- no Docker socket mount;
- no provider auth in Docker;
- env files only for runner-validated env-enabled phases;
- secret/runtime reads blocked with explicit reason;
- source patch rejects env/secret/runtime/artifact paths;
- lifecycle hook, suspicious executable payload, and GitHub Actions secret-exfil patterns are blocked or flagged;
- artifact extraction promotes only orchestrator-assigned `agents.output/**` paths;
- cleanup target confinement.

In hardened sandbox context, run project validation/security commands through the canonical helper shape supplied in the task. It starts with `node <sandbox-exec-helper>` and passes `--project <SANDBOX_WORKSPACE> --pidex-root <PIDEX_ROOT> --mode hardened-pipeline --phase test --json -- npm test`. Do not mutate source in security validation mode; if a remediation is required, route back to implementer.

Run the relevant JS/TS security/static gates. If Fallow is applicable, run it or document `FALLOW-SKIP` with rationale.
