# Structural Code Search Default

PROC-AST-GREP-1

When searching code structure, prefer `ast-grep` over broad text grep.

Use `ast-grep` for:
- Function/hook/component calls, declarations, imports, exports, classes, methods, routes, API handlers
- Queries involving code inside/outside another structure
- Presence/absence checks such as async functions with `await` but no `try/catch`
- Any search where `rg` would match imports, comments, strings, generated output, or unrelated text

Use `rg` for:
- Literal strings, documentation text, config keys, fixture names, log messages
- Fast first-pass existence checks where structural false positives are unlikely

Required behavior:
1. Load/use the `ast-grep` skill for non-trivial structural searches.
2. Start with a small pattern or inline rule, test it, then scan the target scope.
3. Exclude generated/vendor output where appropriate (`dist`, `node_modules`, coverage, build artifacts).
4. In evidence blocks, include the exact `ast-grep run`/`ast-grep scan` command or explicitly state why `rg` was more appropriate.

Examples:

```bash
ast-grep run --pattern 'useState($$$ARGS)' --lang tsx dashboard/routes dashboard/components
ast-grep run --pattern 'createFileRoute($ROUTE)' --lang tsx dashboard/routes
ast-grep scan --inline-rules 'id: async-await
language: typescript
rule:
  kind: function_declaration
  has:
    pattern: await $EXPR
    stopBy: end' src
```
