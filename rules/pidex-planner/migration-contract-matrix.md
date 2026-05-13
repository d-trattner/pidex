# Migration Contract Matrix

PROC-NEW-88-1 | pidex-planner

## Trigger
Any plan that migrates or rewires API endpoints/response handling and moves between contract versions or runtime shapes.

## Rule
Planner MUST add a `Migration Contract Matrix` section in plan preamble before implementation routing. For each migrated endpoint include fixed columns:

- `Endpoint`
- `Response shape contract`
- `Action contract` (`read`, `approve`, `plan`, `execution`)
- `Required DTO fields` (fixture/payload fields that must exist)
- `Status matrix` (e.g., `200/201/202/409` boundaries)
- `Security contract` (authn/z expectations + trusted-origin/referrer assertions)
- `Acceptance evidence`
- `Failure trigger`

## Example

**After**

```md
## Migration Contract Matrix
| Endpoint | Response shape contract | Action contract (`read`, `approve`, `plan`, `execution`) | Required DTO fields | Status matrix | Security contract | Acceptance evidence | Failure trigger |
|---|---|---|---|---|---|---|---|
| `GET /network` | `{tickets:number, nodes:string[]}` only; no additional top-level keys | `read` must return ticket list + schema tag; `approve` must include `{ok,ticketId}`; `plan` must include deterministic ETA field; `execution` must return execution result summary | `ticketId`, `status`, `createdAt` for `tickets` | `read -> 200`, `approve -> 200`, `plan -> 202`, `execution -> 201`, conflict -> `409` | `origin/referrer` must match allowlist, mutation routes require session + ownership, no mutable host trust fallback in production mode | `npm test -- run network`; inspect fixture `network.response.schema.json`; curl smoke against `/network?scope=...`; evidence hashes recorded | If response adds new top-level key, omits required DTO field, returns unexpected status, or mutates without auth/origin checks |
| `POST /network/approve` | `{ok,approved:boolean,errorCode?}` | `approve` must only mutate when `ok` truthy and return request id | `requestId`, `ticketId`, `status` | `200` success, `400` malformed payload, `409` conflict duplicate | Session + ownership required; host-derived origin allowed only via explicit allowlist | `npm run qa:smoke`; mutation route regression logs; auth middleware smoke | Any response missing `requestId` or malformed error shape |
```

## Acceptance checks

- Matrix present before handoff to implementer.
- Every migrated endpoint has a non-empty row.
- Columns are all present and populated.
- Security contract is explicit, testable, and tied to evidence (assertion command or fixture).
- Failure triggers are explicit and actionable.

## Fail criteria
- Missing matrix section.
- Missing any required column.
- “Acceptance evidence” uses only prose without commands/files.
- Matrix includes no `Security contract` or `Failure trigger` column.
