# Sandbox QA evidence

For sandbox-related QA, include:

- sandbox mode (`off` or `hardened-pipeline`);
- run id and workspace path when applicable;
- probe result and actionable unavailable reason when Docker cannot run;
- Docker command/log evidence for sandboxed checks;
- patch generation/apply validation evidence;
- artifact extraction evidence;
- cleanup status.

In hardened sandbox context, run project validation commands through the canonical helper shape supplied in the task. It starts with `node <sandbox-exec-helper>` and passes `--project <SANDBOX_WORKSPACE> --pidex-root <PIDEX_ROOT> --mode hardened-pipeline --phase test --json -- npm test`. Do not mutate source in QA/security validation mode; if a source change is required, route back to implementer.

Run the relevant JS/TS static/test gates. If Fallow is applicable, run it or document `FALLOW-SKIP` with rationale.
