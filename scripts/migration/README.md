# pidex migration helpers

This folder contains small, deterministic migration tooling for bootstrap and repeatable pidex updates.

## Baseline (JUNK16)

```bash
bash scripts/migration/replay-running-pi-to-pidex.sh baseline --source <running-pi-root> --target <pidex-root>
```

Generates `analysis/scope-baseline.md` with:

- legacy-pattern scan output (`rp-`, `runningpi`, `running-pi`, `spark`, `claude`, `gemini`, `openrouter`)
- `.git` depth-2 inventory
- provider-mention scan (`\brp-[a-z]`, `gpt-5.3-codex-spark`, `gpt-5.4-mini`, legacy provider refs)

## Sync (JUNK18)

```bash
bash scripts/migration/replay-running-pi-to-pidex.sh sync --dry-run
```

- `--dry-run` prints planned writes without changing files.
- without `--force`, existing target files are kept to avoid overwriting local pidex hardening.
- `--force` overwrites existing files for full re-seed.

## Notes

- Run sync from a clean target for full seeded import.
- Prefer normalizing output through this script once, then keep pidex-specific edits in pidex-only assets.
