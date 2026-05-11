# Mutation-Route Security/Authz Checklist

PROC-NEW-026-1

## Trigger

Apply when an implementation adds or changes any state-mutating API route, server action, or service path (`POST`, `PUT`, `PATCH`, `DELETE`) that can create/update/delete pipeline, project, ticket, run, stage, artifact, auth, provider, release, or user-owned data.

## Rule

Before first code-review handoff, the implementer must add a short `Mutation Route Security/Authz Checklist` section to the implementation artifact.

The checklist must explicitly answer:

1. **Session/auth gate** — route rejects unauthenticated callers.
2. **Project/resource ownership gate** — route verifies the target resource belongs to the authorized project/user before mutation.
3. **Cross-project negative proof** — a test proves another project/user cannot mutate or observe the resource.
4. **Non-enumerating error** — unauthorized/cross-project/not-found responses do not reveal whether the target resource exists.
5. **Mutation-before-auth guard** — tests or code evidence show mutation functions are not called before authz passes.
6. **Sanitized provider/DB errors** — outward errors do not leak secrets, prompts, raw provider payloads, SQL, paths, or topology.

## Evidence Required

At least one of these must be present before handoff:

- DB-backed integration test for resource ownership; or
- route-level test plus service/unit test of the real ownership helper; or
- explicit `SECURITY-AUTHZ-SKIP` with reason why no user/project resource boundary exists.

Mock-only route denial tests are not sufficient when the real ownership helper contains SQL/schema logic.

## Rejectable If Missing

If the trigger applies and the implementation artifact lacks this checklist or lacks cross-project/resource negative proof, code review should reject unless the route is demonstrably non-user/non-project scoped and documented as `SECURITY-AUTHZ-SKIP`.
