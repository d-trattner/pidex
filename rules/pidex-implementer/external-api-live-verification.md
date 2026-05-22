# Rule: Live Verification Before Writing External Adapter Code

PROC-NEW-50-9 | pidex-implementer

## Rule

When implementing a method on an adapter to a real external service (Pi-hole, nginx-proxy-manager,
UniFi, Home Assistant, or any service running in the homelab), before writing the adapter method:

1. Run a live curl test against the actual running service instance
2. Confirm: HTTP method, URL, auth pattern, request body shape, response shape
3. Document the curl command and response in the implementation doc under "API Verification"

  ### API Verification — [ServiceName].[methodName]
  ```
  curl -X PUT "http://<service-host>/api/config/dns/hosts/my.domain.com" \
    -H "Authorization: Bearer $PIHOLE_PASSWORD" \
    -H "Content-Type: application/json"
  # Response: 200 {"took":0.001}
  ```

If the live response differs from the plan's assumed endpoint:
- Update the implementation to match the live API
- Note the deviation in the implementation doc
- Notify orchestrator via routing context (the plan's endpoint assumption was wrong)

## Priority rule

Live curl beats documentation beats plan assumption. Do not defer to documentation when
you can curl the actual running service in 30 seconds.

## Trigger condition

Apply when implementing ANY method that sends real HTTP requests to a homelab service
(not a mocked endpoint, not a third-party hosted API with a stable SDK).

## Why this matters

Plan 50 (execute-plan, 2026-04-29): Pi-hole adapter was written against /api/dns/custom
(POST) per the plan. Actual Pi-hole v6 API requires PUT /api/config/dns/hosts/<encoded>.
The error cost a full round-trip through implementation, review, and live testing. A 30-second
curl test before writing the adapter method would have prevented this entirely.
