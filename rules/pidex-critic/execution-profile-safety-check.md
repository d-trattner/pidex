# Rule: Execution Profile Safety Check

PROC-NEW-EXECUTION-PROFILE-SAFETY | pidex-critic

## Trigger

Load for every plan review.

## Rule

pidex-critic MUST verify the plan's `Execution Profile` and `Skipped Agents` declarations are present and safe. This rule does not require the orchestrator to skip agents; it prevents unsafe skip declarations from becoming accepted process guidance.

## Required checks

1. Plan contains `## Execution Profile`.
2. Profile is one of:
   - `xs-docs`
   - `small-fix`
   - `standard-feature`
   - `api-security`
   - `ui-small`
   - `ui-heavy`
   - `structural`
   - `high-risk-release`
3. Plan contains `Skipped Agents` table or explicitly says no agents are skipped.
4. Profile matches scope/risk.
5. Skips do not violate mandatory safety rules.

## Mandatory safety rejections

| Finding | Severity | Required verdict |
|---|---|---|
| Missing Execution Profile | MEDIUM | REJECTED unless legacy plan explicitly exempted by orchestrator |
| UI-heavy work skips `pidex-designer` | CRITICAL | REJECTED |
| API/user input/auth/storage/filesystem/dependency/secrets skips `pidex-security` | CRITICAL | REJECTED |
| Product code skips all QA | CRITICAL | REJECTED |
| Structural work lacks `pidex-architect` profile/path | CRITICAL | REJECTED |
| UI/G9 work skips browser QA/UAT | CRITICAL | REJECTED |
| G9 rejection/security/process finding skips full retro | MEDIUM | REJECTED or APPROVED_WITH_COMMENTS only with user override |
| Small docs change uses full pipeline | LOW | APPROVED_WITH_COMMENTS; suggest lower profile |

## Structural architect satisfaction

If task opened with `pidex-architect` and an ADR/findings doc already exists, that satisfies the `structural` profile's architect path. Do not require a duplicate architect pass unless the plan changed architecture scope after the ADR or critique finds a new unresolved architecture gap.

## UI profile escalation

`ui-small` is valid only for trivial copy/icon/minor layout work with no new interaction model. Upgrade to `ui-heavy` when any of these appear:

- Screenshot Matrix with multiple interactive states
- Mobile UI Contract for form, modal, sheet, drawer, navigation, or overlay
- Accessibility Baseline for dialog/form focus or status/error announcement behavior
- new validation/loading/error/success states
- pattern parity beyond a simple text/icon substitution

If plan declares `ui-small` while these signals exist, raise profile mismatch and require `pidex-designer` unless user explicitly narrows scope.

## Scope-to-profile hints

- Docs-only → `xs-docs`
- One localized bugfix with tests → `small-fix`
- Normal product feature → `standard-feature`
- Route/auth/storage/user input/dependency/security surface → `api-security`
- Minor UI text/icon/layout → `ui-small`
- New UI flow/form/modal/navigation/mobile/pattern parity → `ui-heavy`
- Migration/new architecture/cross-boundary contract → `structural`
- Release after rejection/security/process incident → `high-risk-release`

## Review output

Critique should include `Execution Profile Assessment` with:

- declared profile
- expected profile if different
- skipped-agent risks
- verdict impact

## Empirical basis

Adaptive agent budget reduces runtime only if skip decisions are explicit and safe. Past G9 loops show UI-heavy without designer/browser evidence is unsafe. API/user-input plans without security review are similarly unsafe.
