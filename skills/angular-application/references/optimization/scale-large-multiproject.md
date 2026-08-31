# Large and multi-project Angular optimization

For L/XL work, derive domains and dependency direction from product language and existing code. Prefer clear app, feature, data-access, UI/design-system, utility, and integration boundaries only where they provide ownership or change-locality value.

For Nx:

- inspect the resolved project graph and inferred targets;
- use tags and enforceable dependency constraints;
- keep applications composition-focused;
- expose deliberate library public APIs;
- avoid a generic `shared` dumping ground;
- configure named inputs/outputs only from actual task behavior;
- compare focused/affected verification with full regression gates;
- verify one representative cross-layer follow-up change.

A shared Material design-system library owns theme, tokens, common composition and test harness conventions. It must not become a business-domain dependency sink.

Passing one topology does not prove universal enterprise architecture. Record supported scale and known limitations honestly.
