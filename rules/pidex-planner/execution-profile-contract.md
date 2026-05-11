# Rule: Execution Profile Contract

PROC-NEW-EXECUTION-PROFILE | pidex-planner

## Goal

Make pipeline cost/risk explicit before implementation. This rule documents intended agent budget; it does not by itself change orchestrator behavior.

## Required section

Every plan MUST include an `Execution Profile` section before Testing Strategy or near the plan metadata.

```markdown
## Execution Profile

Profile: <xs-docs | small-fix | standard-feature | api-security | ui-small | ui-heavy | structural | high-risk-release>
Reason: <one sentence tied to risk/scope>

Skipped Agents:
| Agent | Skip? | Reason | Safety condition |
|---|---:|---|---|
```

If no agents are skipped, write:

```markdown
Skipped Agents: none — standard profile requires full listed pipeline.
```

## Profiles

| Profile | Intended pipeline | Required gates |
|---|---|---|
| `xs-docs` | planner-lite → implementer/doc → devops/local | doc exists |
| `small-fix` | planner → implementer → qa-lite → devops | targeted tests |
| `standard-feature` | planner → critic → implementer → code-review → qa → uat → devops | tests + review |
| `api-security` | planner → critic → implementer → code-review → security → qa → uat → devops | security + Fallow |
| `ui-small` | planner → implementer → qa-browser → uat/G9 → devops | browser smoke |
| `ui-heavy` | planner → designer-spec → implementer → code-review → qa-browser → uat/G9 → devops | pattern source + screenshots |
| `structural` | architect → planner → critic → implementer → code-review → security → qa → uat → devops | ADR/architecture |
| `high-risk-release` | full pipeline | full retro + PI/roadmap |

## Mandatory escalation rules

Planner MUST choose at least:

- `ui-heavy` for new page, modal/sheet, form, navigation, mobile layout, or pattern parity work.
- `ui-small` for minor visible UI copy/icon/layout changes.
- `api-security` for API routes, auth, persistence, filesystem, user input, secrets, dependency changes, or outward error behavior.
- `structural` for framework/runtime/db/auth/monorepo migrations or new cross-boundary contracts.
- `high-risk-release` for release gates after G9 rejection, security finding, process finding, multi-agent failure, or user escalation.

## Skip safety rules

Planner MUST NOT mark these skips safe:

| Unsafe skip | When forbidden |
|---|---|
| skip `pidex-security` | API, auth, storage, filesystem, user input, dependency, secrets, outward error changes |
| skip `pidex-designer` | `ui-heavy` profile |
| skip `pidex-qa` | any product code change; may only downgrade to `qa-lite` for docs/test-data-only cases |
| skip `pidex-critic` | medium+ scope, multi-slice plan, API/security, UI-heavy, structural, high-risk release |
| skip `pidex-code-reviewer` | product code, API, persistence, UI-heavy, security-relevant changes |
| skip `pidex-uat` | UI, user-facing behavior, business-value validation |
| skip full retro | G9 rejection, security finding, process finding, multi-agent failure, release close |

## Notes

- This is a declaration contract. Orchestrator behavior remains conservative until a later implementation explicitly consumes the profile.
- If uncertain, choose the higher-risk profile.

## Empirical basis

Harness improvement plan Part A: adaptive agent budget should reduce runtime, but only when skip decisions are explicit and critic-verifiable. This rule adds the contract before any automation changes routing.
