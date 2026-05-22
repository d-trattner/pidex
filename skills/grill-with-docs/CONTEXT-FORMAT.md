# PIDEX CONTEXT.md Format

PIDEX uses Matt Pocock's `CONTEXT.md` format without PIDEX-specific baseline extensions. The file is a domain language aid, not a project database, task spec, roadmap, workflow document, or architecture document.

## Location

Single-context project:

```text
<project-root>/pidex/context/CONTEXT.md
```

Multi-context project:

```text
<project-root>/pidex/context/CONTEXT-MAP.md
<project-root>/pidex/context/contexts/<name>/CONTEXT.md
```

## Structure

```md
# {Context Name}

{One or two sentence description of what this context covers.}

## Language

**Order**:
{A concise description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request

**Customer**:
A person or organization that places orders.
_Avoid_: Client, buyer, account

## Relationships

- An **Order** produces one or more **Invoices**
- An **Invoice** belongs to exactly one **Customer**

## Example Dialogue

> **Dev:** "When a **Customer** places an **Order**, do we create the **Invoice** immediately?"
> **Domain expert:** "No — an **Invoice** is only generated once a **Fulfillment** is confirmed."

## Flagged Ambiguities

- "account" was used to mean both **Customer** and **User** — resolved: these are distinct concepts.
```

## Rules

- **User owns truth.** Agents may update context from confirmed user statements or clear code evidence. If unsure, ask.
- **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others as aliases to avoid.
- **Flag conflicts explicitly.** If a term is used ambiguously, call it out in `Flagged Ambiguities` with a clear resolution or open question.
- **Keep definitions tight.** One sentence max. Define what it is, not what it does.
- **Show relationships.** Use bold term names and express cardinality where obvious.
- **Only include terms specific to this project's context.** General programming concepts do not belong even if the project uses them extensively.
- **Do not store task specs here.** Acceptance criteria, implementation plans, roadmap items, workflows, architecture notes, operational constraints, and release decisions belong in project docs/artifacts, not `CONTEXT.md`.
- **Write an example dialogue** when it helps demonstrate how terms interact naturally.

## Single vs multi-context repos

**Single context:** Use one `pidex/context/CONTEXT.md`.

**Multiple contexts:** Use `pidex/context/CONTEXT-MAP.md` to list contexts, where they live, and how they relate:

```md
# Context Map

## Contexts

- [Ordering](./contexts/ordering/CONTEXT.md) — receives and tracks customer orders
- [Billing](./contexts/billing/CONTEXT.md) — generates invoices and processes payments
- [Fulfillment](./contexts/fulfillment/CONTEXT.md) — manages warehouse picking and shipping

## Relationships

- **Ordering → Fulfillment**: Ordering emits `OrderPlaced` events; Fulfillment consumes them to start picking
- **Fulfillment → Billing**: Fulfillment emits `ShipmentDispatched` events; Billing consumes them to generate invoices
- **Ordering ↔ Billing**: Shared types for `CustomerId` and `Money`
```

The skill infers which structure applies:

- If `pidex/context/CONTEXT-MAP.md` exists, read it to find contexts.
- If only `pidex/context/CONTEXT.md` exists, use single context.
- If neither exists, create `pidex/context/CONTEXT.md` lazily when the first term is resolved.
- When multiple contexts exist, infer which one the topic relates to. If unclear, ask.
