# __PROJECT_NAME__ Context Map

Use this file only when the project has multiple bounded contexts. If the project has one cohesive domain, use `pidex/context/CONTEXT.md` instead.

## Contexts

- [Example Context](./contexts/example/CONTEXT.md) — TODO one-sentence purpose.

## Relationships

<!-- Describe cross-context relationships using context names and domain terms. -->

- **Context A → Context B**: TODO producer/consumer relationship.
- **Context A ↔ Context B**: TODO shared concept or bidirectional relationship.

## Routing Guidance for Agents

<!-- Help agents choose which context file to read/update. -->

- Use `contexts/example/CONTEXT.md` when working on TODO paths/features.
- Ask the user when a task touches multiple contexts and ownership is unclear.
