# Sandbox QA evidence

For sandbox-related QA, include:

- sandbox mode (`off` or `hardened-pipeline`);
- run id and workspace path when applicable;
- probe result and actionable unavailable reason when Docker cannot run;
- Docker command/log evidence for sandboxed checks;
- patch generation/apply validation evidence;
- artifact extraction evidence;
- cleanup status.

Run the relevant JS/TS static/test gates. If Fallow is applicable, run it or document `FALLOW-SKIP` with rationale.
