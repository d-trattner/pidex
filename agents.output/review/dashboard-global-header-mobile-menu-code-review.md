---
ID: 3
Origin: 3
UUID: 7c9a2d4f
Status: Rejected
---

# Plan reference
- `<pidex-root>/agents.output/planning/dashboard-global-header-mobile-menu-plan.md` (ID 3, UUID 7c9a2d4f)

# Implementation reference
- `<pidex-root>/agents.output/implementation/dashboard-global-header-mobile-menu-implementation.md`

# Date
- 2026-05-12

# Reviewer
- pidex-code-reviewer

## TDD Compliance Check
- Table present: yes
- Required fields complete: yes
- Spot-check: test file updated and command pass confirmed
- Result: PASS

## Overview
UI profile matched broad scope. Build/typecheck/tests pass. Found blocking parity/a11y gaps.

## Files Reviewed
| File | Result |
|---|---|
| `dashboard/components/navigation/global-nav.tsx` | major findings |
| `dashboard/routes/__root.tsx` | pass |
| `dashboard/routes/dashboard.tsx` | minor layout concern |
| `dashboard/routes/dashboard/index.tsx` | major finding (duplicate nav owner) |
| `dashboard/app/styles/theme.css` | pass |
| `dashboard/tests/dashboard-copy-and-interactions.test.mjs` | gap: no focus-trap assertion |
| `dashboard/package.json` | version matches plan |

## Findings

### Critical
- None.

### Major
1. **Mobile sheet misses focus trap contract**  
   - File: `dashboard/components/navigation/global-nav.tsx`  
   - Description: Dialog handles ESC/close/focus return, but no Tab/Shift+Tab trap inside open sheet. Plan/design require focus trap.  
   - Impact: Keyboard user can leave modal context; a11y contract broken.  
   - Recommendation: Add focus trap loop (first/last tabbable cycling) or proven accessible dialog primitive.

2. **Single nav source-of-truth violated; duplicate page-local nav still active**  
   - File: `dashboard/routes/dashboard/index.tsx`  
   - Description: Route still defines local `links` array + header/nav. Conflicts with shared `NAV_LINKS` contract and “remove per-page duplicate nav definitions.”  
   - Impact: `/dashboard/` path can render duplicate/competing nav behavior, drift risk.  
   - Recommendation: Remove local links/header ownership from this route; consume shared header only.

### Minor
1. **Nested `page-shell` risk on dashboard landing**  
   - File: `dashboard/routes/dashboard.tsx`  
   - Description: Root already wraps outlet in `.page-shell`; route adds second `.page-shell`.  
   - Impact: spacing/layout inconsistency on landing only.  
   - Recommendation: Use content container without duplicating top shell.

## Positive Observations
- Shared nav component extracted.
- Root layout mount for header/mobile trigger done.
- Validation commands re-run: pass.

## UI Pattern Parity Review
| Surface | Source pattern checked | Target files checked | Parity result | Findings |
|---|---|---|---|---|
| Global header on all pages | plan UI contract + design spec | `__root.tsx`, `global-nav.tsx`, dashboard routes | partial | duplicate local nav route remains |
| Mobile trigger + sheet behavior | plan mobile contract + a11y baseline | `global-nav.tsx`, `theme.css` | fail | no focus trap |

## Execution Profile Diff Guard
| Approved profile | Actual diff class | Skips affected | Verdict |
|---|---|---|---|
| `ui-heavy` | UI/frontend + tests + styles | none invalidated | profile class OK; implementation incomplete |

## Fallow Evidence
- Command: `npx fallow audit --format json --quiet --explain 2>/dev/null || true`
- Outcome: PASS_WITH_FINDINGS
- Review impact: non-blocking for this plan; existing repo-wide complexity/duplication noted.

## Security Scope Assessment
- No new API/actions/auth/deps/user-input paths in scoped change.
- Security skip criteria mostly met, but verdict rejected for code-quality parity gaps.

## Verdict
REJECTED

## Rationale
A11y contract break + duplicate nav ownership on user-facing route.

## Next Action
Route to pidex-implementer. Fix major items. Re-submit same plan/doc set.

<!-- ROUTING
verdict: REJECTED
route_to: pidex-implementer
reason: Mobile sheet lacks required focus trap; duplicate dashboard route-level nav violates single source-of-truth contract.
context_file: <pidex-root>/agents.output/review/dashboard-global-header-mobile-menu-code-review.md
-->