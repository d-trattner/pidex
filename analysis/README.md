# pidex analysis output

This folder stores optional post-run advisory analysis artifacts.

Recommended commands:

- `scripts/analysis/run-pipeline-analysis.sh --project <project> --plan <plan-id>`
- `scripts/migration/replay-running-pi-to-pidex.sh baseline --source /home/daniel/running-pi --target /home/daniel/pidex`
- `scripts/migration/replay-running-pi-to-pidex.sh sync [--source ...] [--target ...] --dry-run` (deterministic migration sync plan)

Outputs are markdown reports with a trailing ROUTING block for follow-up.

`analysis/scope-baseline.md` contains the initial source inventory snapshot required by JUNK16.

The analysis package is intentionally minimal in the pidex fork and keeps no hard runtime dependencies.
