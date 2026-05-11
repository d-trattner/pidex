# Transitive Mock Dependency Audit in Test Strategy (PROC-NEW-46-3)

**Applies to:** pidex-planner
**Load when:** writing a plan that introduces a new route, handler, or service module that imports from existing project modules.

---

## Rule

When a plan introduces a new route or module that imports from existing project modules, the plan's **Test Strategy section** MUST include a "Mock Dependencies" note that identifies the full transitive import chain and flags any storage, I/O, or side-effect classes that will need `vi.mock` entries in the test files.

## What to include

Add a row to the Test Strategy table (or a sub-section under "Test Strategy"):

```
**Mock Dependencies (transitive audit)**:
- `new-route.ts` imports `helperFn` from `existing-module.ts`
- `existing-module.ts` imports `StorageClass` from `storage.ts`
- → `vi.mock('../storage.ts')` required in `new-route.test.ts` to prevent real I/O in unit tests
```

If the chain is clean (no storage/I/O imports in the transitive tree), write:
```
**Mock Dependencies**: No transitive storage/I/O imports — only vi.mock for direct API dependencies.
```

## Why this matters

`vi.mock` in Vitest is file-scope. When `new-route.ts` imports `helperFn` from `existing-module.ts`, and `existing-module.ts` instantiates a `StorageClass` at module level, Vitest will run `StorageClass`'s constructor during the test unless `storage.ts` is mocked. This causes:

- File system reads/writes in unit tests
- SQLite open() calls in unit test runs
- Network calls in unit test runs
- Non-deterministic test behavior

The implementer can discover this at test-write time, but it adds undocumented complexity. A 5-minute planning-time audit of the import chain prevents this discovery from appearing as a surprise in the implementation doc.

## How to audit at planning time

1. Open the existing module(s) the new route will import from.
2. Scan their imports for: `Storage`, `Database`, `fs`, `path.resolve`, `new Class()` at module level.
3. Follow the chain one level deeper for any hits.
4. List everything that needs `vi.mock` in the plan's Test Strategy.

## Empirical basis

Plan 46: `analyze.test.ts` needed `vi.mock('../storage/network-audit-storage.ts')` because `analyze.ts` → `audit.ts` → `NetworkAuditStorage` (instantiated at module level in `audit.ts`'s `getStorage()` factory). This was not in the plan's test strategy. The implementer resolved it in-place, but it added an undocumented `vi.mock` entry and a note in the implementation doc.

This same class of issue appears across Plans 40, 45, and 46 wherever a new route imports from the `audit.ts` module family.
