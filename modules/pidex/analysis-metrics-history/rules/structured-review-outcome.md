# Structured Review Outcome Contract (module-scoped rendering)

The following canonical producer contract is injected at the Project Pipeline run-agent boundary.

## Binding mode-specific finding shape

Read the injected `Lifecycle review context` before writing the payload. For `initial` and `review1`, every assigned active finding MUST contain exactly these seven keys and no archive fields: `findingId`, `relation`, `class`, `reproductionState`, `causedByCorrection`, `severity`, `disposition`. Do not include `title`, `shortDescription`, `originEpic`, `reviewArtifact`, `affectedIdentifiers`, `deferredReason`, or `nextAnalysisOrDisconfirmingTest` on a non-final active finding. For `review2`, assigned active findings MUST use the full archive shape shown in the canonical example below. New `tbr_immediate` findings always use the full archive shape.

# Structured Review Outcome Contract (pidex-review-outcome-v1)

Plan 059 (Initiative 046). Every **lifecycle-tracked primary review** — `critic`, `code-review`, `security`, `qa` — must place **exactly one bounded `pidex-review-outcome-v1` fenced JSON block** in its exact assigned review artifact, in every execution mode (host-direct, hardened-pipeline, project-pipeline). The artifact stays human-readable Markdown; the structured payload is the only authority for finding classification and must agree with the ROUTING verdict/context. The canonical completion boundary (`completeStructuredReviewOutcome`) enforces this contract before any lifecycle event; prompt-only classification is never load-bearing.

These are concise producer instructions only. The runtime validator in `scripts/quality/structured-review.mjs` (reusing the existing `tbr.mjs` finding validators) is the schema authority — do not re-implement validation in prose.

## Required payload

One fenced block with info string exactly `` ```pidex-review-outcome-v1 ``:

Example (code-review gate; review2 terminal-close semantics — active findings must carry the full archive fields, and every field stays within the unsafe-content/path limits):

```pidex-review-outcome-v1
{
  "schemaVersion": "pidex-review-outcome-v1",
  "verdict": "REJECTED",
  "contractDisposition": "in_contract",
  "findings": [
    {
      "findingId": "F-assigned-01",
      "relation": "assigned",
      "class": "Product",
      "reproductionState": "not_tested",
      "causedByCorrection": false,
      "severity": "High",
      "disposition": "active",
      "title": "Assigned in-contract defect",
      "shortDescription": "Repairs the assigned defect inside the approved contract.",
      "originEpic": "initiative-059",
      "reviewArtifact": "agents.output/code-review/059.md",
      "affectedIdentifiers": ["scripts/quality/tbr.mjs"],
      "deferredReason": "Archived with full evidence at review2 terminal close.",
      "nextAnalysisOrDisconfirmingTest": "Read the terminal TBR archive item."
    },
    {
      "findingId": "F-immediate-01",
      "relation": "new",
      "class": "Product",
      "reproductionState": "reproduced",
      "causedByCorrection": false,
      "severity": "Medium",
      "disposition": "tbr_immediate",
      "title": "Unrelated finding archived immediately",
      "shortDescription": "New unrelated finding outside the current correction contract.",
      "originEpic": "initiative-059",
      "reviewArtifact": "agents.output/code-review/059.md",
      "affectedIdentifiers": ["extensions/pidex/review-budget.ts"],
      "deferredReason": "New findings cannot extend the current gate.",
      "nextAnalysisOrDisconfirmingTest": "Validate the canonical payload against the archive."
    }
  ]
}
```

This exact example passes the runtime validator at review2 (`archiveActive`), where active findings require the archive fields shown; in earlier non-final modes the validator accepts active findings without the archive-only fields. Copy the fenced block and replace the findings with your own strictly validated ones — never emit placeholders.

- `verdict` — your gate's own verdict vocabulary only:
  - critic / code-review: `APPROVED` | `APPROVED_WITH_COMMENTS` | `REJECTED`
  - security: `APPROVED` | `APPROVED_WITH_CONTROLS` | `REJECTED`
  - qa: `COMPLETE` | `FAILED`
- `contractDisposition` — exactly one of: `in_contract` | `scope_expansion` | `architecture_expansion` | `acceptance_expansion` | `evidence_expansion` | `threat_model_expansion`.
- `findings` — zero to twenty strictly validated findings using the existing canonical finding schema (identity, relation, class, reproduction, causality, severity, disposition, bounded archive fields). No credentials, prompt bodies, absolute paths, raw logs, HTML instructions, or uncontrolled free-form payloads.

## Classification rules

- `in_contract` rejection with one or more active findings: non-final `CHANGES_REQUESTED`; new unrelated re-review findings must be classified `tbr_immediate` (archived immediately); only assigned findings and reproduced correction-caused Critical/Security regressions may remain active.
- `in_contract` rejection with zero active findings: invalid — approve with immediate findings when no blocker remains.
- Approved verdict with any active finding: invalid.
- `review2` rejection: every remaining active and immediate finding is archived, the lifecycle completes `closed`, and the typed status is `CLOSED_WITH_TBR` — the gate advances exactly once; no correction3/review3/fourth reviewer.
- Any expansion disposition stops for an explicit user decision with typed `USER_DECISION_REQUIRED`; no correction is spawned.

## Corrections

Corrections (`correction1`, `correction2`) carry **no structured payload** — they remain ordinary handoffs that route back to the same reviewer gate. The typed status is authoritative over contradictory ROUTING text: `CLOSED_WITH_TBR` and `USER_DECISION_REQUIRED` override any rejection route and never auto-correct.

## Failure modes

Missing, duplicate, mismatched, oversized, malformed, unsafe, or contradictory structured outcomes fail before lifecycle completion with zero-guess typed errors; no false terminal outcome is appended.
