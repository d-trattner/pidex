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

Run the relevant JS/TS security/static gates. If Fallow is applicable, run it or document `FALLOW-SKIP` with rationale.
