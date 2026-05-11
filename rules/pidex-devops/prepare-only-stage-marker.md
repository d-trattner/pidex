# Prepare-Only Stage Marker (PROC-NEW-2)

Stage 1 is prepare-only. No release-state mutation allowed.

## Mandatory Stage 1 marker row

Use fixed checklist row in deployment doc Stage 1 section:

`- [ ] PREPARE-ONLY: local commit allowed; tag/push/publish forbidden until Stage 2 user approval.`

## Enforcement

1. During Stage 1, allow local commits and artifact closure only.
2. Forbid `git tag`, `git push`, publish commands, release-state status flip to `Released`.
3. If any release mutation needed, stop Stage 1 and wait Stage 2 approval.
