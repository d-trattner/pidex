# Gate G9 Applicability Declaration (PROC-NEW-51-2)

**Applies to:** pidex-planner
**Load when:** writing or reviewing any plan's Testing Strategy section.

---

## Rule

Every plan's **Testing Strategy** section MUST include a "Gate G9" line explicitly declaring
whether the preview gate applies:

```
**Gate G9**: required — <reason for UI surface change>
```
OR
```
**Gate G9**: not applicable — <reason no UI surface is changed>
```

This line must appear before the V-matrix table or at the start of the Testing Strategy section.

## Valid reasons

**Required:**
- New page, tab, sub-tab, or modal rendered in the browser
- API response shape change consumed by a React Query hook
- Component prop change visible to the user
- CSS / layout change

**Not applicable:**
- Pure adapter change with no HTTP surface change (e.g., adding a new backend write target)
- Purely internal utility / type change not touched by UI code
- Test-only change

## Conservative default

If the orchestrator cannot locate a Gate G9 line in the plan's Testing Strategy, it MUST
treat the plan as **G9: required**. Absence of the declaration is not evidence of G9 being
skipped — it is a documentation gap that requires the conservative default.

## Empirical basis

- Plan 51 (pihole-fanout-writes, 2026-04-29): Pure adapter change. G9 correctly skipped by
  orchestrator inference. No paper trail in the plan doc. A future plan with a subtle HTTP
  surface side effect could have the same "backend-only" label but genuinely require G9.
  The declaration requirement closes this documentation gap.
