# Slice Completion Self-Check: Re-Read Modified Files (PROC-NEW-46-2)

**Applies to:** pidex-implementer
**Load when:** completing any implementation slice before writing the slice entry to the impl doc.

---

## Rule

Before writing the impl doc entry for a completed slice, **re-read every source file listed in that slice's "Files Modified" section** and verify that the impl doc description matches the actual file content.

This is a 1-tool-call Read per file per slice. Do not skip it.

## What to verify

For each modified file in the slice:

1. **Schema fields present or absent** — if the impl doc says "removed field X" or "tightened to enum", confirm the file shows the removal/enum constraint.
2. **Function signatures** — if the impl doc says "added function foo(bar: Baz): Qux", confirm the signature exists in the file.
3. **Import changes** — if the impl doc says "imports X from module Y", confirm the import statement is in the file.
4. **Status flags** — if the impl doc says a feature is "complete" or "enabled", confirm the relevant code path exists.

## The gap this closes

Plans 45 and 46 both had code review findings (Major severity) where the impl doc stated a schema was tightened (e.g., "removed `done` field, tightened `status` to enum") but the live file still had the old schema (`z.boolean().optional()` + `z.string().optional()`). The implementer had written the description anticipating a change that was either not executed or was reverted.

Code review caught this in both cases, but a self-check at implementation time costs 1 Read call vs. a backward loop (implementer fix round + re-review).

## Procedure

After the final `git commit` for a slice but before writing the impl doc summary entry for that slice:

```
For each file in this slice's modified list:
  Read the file
  Confirm each claim in my planned impl doc entry is true of the actual file
  If a claim is false: fix the file (or fix the claim)
```

## Exemptions

- Documentation files (`.md`, wiki, CHANGELOG) — self-evident from the write.
- Test files where the assertion is the test code itself (the test IS the claim).
- Generated files (e.g., `package-lock.json`, `dist/`) — not described in impl doc entries.

## Empirical basis

- Plan 45: F-1 Major in code review — impl doc stated schema change not present in live file.
- Plan 46: F-1 Major in code review — `items.$id.ts` described as "tightened to z.enum" but live file had `z.string().optional()`. One backward loop, pre-QA fix.

In both cases: ~3 tool_uses to catch and fix the discrepancy during code review. Self-check cost: 1 Read call at slice commit time.
