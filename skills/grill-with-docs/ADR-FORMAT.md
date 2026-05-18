# PIDEX ADR Format

Adapted from Matt Pocock's ADR format for PIDEX project-local context.

## Location

Single-context project:

```text
<project-root>/pidex/context/adr/
```

Multi-context project:

```text
<project-root>/pidex/context/contexts/<name>/adr/
```

Create the `adr/` directory lazily — only when the first ADR is needed.

## Template

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's it. An ADR can be a single paragraph. The value is in recording *that* a decision was made and *why* — not in filling out sections.

## Optional sections

Only include these when they add genuine value. Most ADRs won't need them.

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — useful when decisions are revisited.
- **Considered Options** — only when rejected alternatives are worth remembering.
- **Consequences** — only when non-obvious downstream effects need to be called out.

## Numbering

Scan the target `adr/` directory for the highest existing number and increment by one:

```text
0001-slug.md
0002-slug.md
```

## When to offer an ADR

All three of these must be true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful.
2. **Surprising without context** — a future reader will wonder why it was done this way.
3. **The result of a real trade-off** — there were genuine alternatives and one was chosen for specific reasons.

If a decision is easy to reverse, skip it. If it is not surprising, skip it. If there was no real alternative, skip it.

## What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library — just choices that would be costly to swap.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only."
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X."
- **Constraints not visible in code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If GraphQL was considered and REST was chosen for subtle reasons, record it.
