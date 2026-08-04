# Structured Review Outcome Contract (module-scoped rendering)

Binding producer contract for lifecycle-tracked primary reviews in every execution mode: place **exactly one bounded `pidex-review-outcome-v1` fenced JSON block** in the exact assigned review artifact, with your gate's verdict vocabulary, exactly one contract disposition from `in_contract` | `scope_expansion` | `architecture_expansion` | `acceptance_expansion` | `evidence_expansion` | `threat_model_expansion`, and strictly validated findings using the existing finding schema (new unrelated findings classified `tbr_immediate`; `review2` rejection terminalizes as `CLOSED_WITH_TBR`, advancing exactly once).

Corrections carry **no structured payload** and route back to the same reviewer gate. Typed completion status is authoritative over ROUTING text; `CLOSED_WITH_TBR`/`USER_DECISION_REQUIRED` override any rejection route and never auto-correct. The canonical completion boundary rejects missing, duplicate, mismatched, oversized, malformed, unsafe, or contradictory payloads before any lifecycle event.

Concise producer instructions and the fenced template: `rules/shared/structured-review-outcome.md` (Core rules). Runtime validation authority lives in the canonical lifecycle boundary; do not re-implement schema in prose.
