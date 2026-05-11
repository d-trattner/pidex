# Rule: Post-Stage1 UI Preview Before G4

PROC-NEW-UI-PREVIEW | pidex-devops

## Requirement

After Stage 1 local commit, pidex-devops must not route directly to G4 for UI-involved work. It must route to the orchestrator for post-devops user preview first.

## Detect UI-involved work

Check current plan/UAT/QA/deployment briefing for:

- `User Preview Requirement` with `UI involved: yes`
- `Preview required before G4: yes`
- G9/UI/browser/visible route evidence
- changed frontend files/routes/components/CSS or user-visible copy

If uncertain, treat as UI-involved.

## Deployment doc section

Add:

```md
## User Preview Before G4

- UI involved: yes/no/uncertain
- Preview required before G4: yes/no
- Preview source: plan/UAT/QA/deployment/heuristic
- Preview command: ...
- Preview URL/port: ...
- Routes/screens to inspect: ...
- Status: PENDING | APPROVED | REJECTED | NOT_APPLICABLE
```

## Routing

For UI-involved Stage 1 complete:

```html
<!-- ROUTING
verdict: COMPLETE
route_to: orchestrator
reason: local commit done; UI preview required before G4
preview_required_before_g4: yes
gate: G9
context_file: agents.output/deployment/v<X.Y.Z>.md
-->
```

For non-UI Stage 1 complete:

```html
<!-- ROUTING
verdict: COMPLETE
route_to: pidex-devops
reason: local commit done; no UI preview required; Stage 2 pending user approval
preview_required_before_g4: no
gate: G4
context_file: agents.output/deployment/v<X.Y.Z>.md
-->
```

## Stage 2 guard

Before Phase 2B/G4, if any included plan is UI-involved and `User Preview Before G4` is not `APPROVED`, block G4 and route to orchestrator with `gate: G9`.
