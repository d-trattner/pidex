# __PROJECT_NAME__ Context Map

Use this file only when the project has multiple bounded contexts. If the project has one cohesive domain, use `pidex/context/CONTEXT.md` instead.

> Truth policy: user/domain expert owns meaning. Agents may add confirmed facts or clear code-evidenced facts. Guesses stay in each context's **Open Questions / Needs User Review** section.

## Contexts

- [Example Context](./contexts/example/CONTEXT.md) — TODO one-sentence purpose.

## Relationships

<!-- Describe cross-context dependencies, events, shared types, or ownership boundaries. -->

- **Context A → Context B**: TODO producer/consumer relationship.
- **Context A ↔ Context B**: TODO shared concept or bidirectional dependency.

## Routing Guidance for Agents

<!-- Help agents choose which context file to read/update. -->

- Use `contexts/example/CONTEXT.md` when working on TODO paths/features.
- Ask the user when a task touches multiple contexts and ownership is unclear.

## Shared Constraints

<!-- Constraints that apply to all contexts. -->

- TODO

## Open Questions / Needs User Review

- TODO
