# Rule: User Preview Requirement

PROC-NEW-UI-PREVIEW | pidex-planner

## Requirement

Every plan must declare whether user-visible UI is involved and whether a user preview is required before G4 release disposition.

Add this section to every plan:

```md
## User Preview Requirement

| Field | Value |
|---|---|
| UI involved | yes/no |
| Preview required before G4 | yes/no |
| Preview command | `<command>` or `TBD/none` |
| Preview URL/port | `<url>` or `TBD/none` |
| Routes/screens to inspect | `<route list>` or `none` |
| Mobile viewport needed | yes/no |
```

## Policy

- If `UI involved: yes`, then `Preview required before G4: yes`.
- User preview is mandatory after `pidex-devops` Stage 1 local commit and before G4 (`push/local/hold/abort`).
- QA browser evidence and UAT approval do not replace this user preview.
- If preview command/port is unknown, mark `TBD` and include a planning/open-question item to resolve it before UAT/devops.
- If no UI is involved, state `UI involved: no` and `Preview required before G4: no` with reason.

## UI involved triggers

Treat as UI-involved when plan changes or creates:

- browser-rendered pages/routes/components
- CSS/layout/tokens/visual state
- navigation, forms, tables/lists, modals/sheets, cards, status strips
- user-visible copy/icons/badges/counts/empty states
- frontend data binding that changes what user sees

## Rationale

G4 is release disposition, not visual acceptance. User must preview final local committed UI outcome before deciding push/local/hold/abort.
