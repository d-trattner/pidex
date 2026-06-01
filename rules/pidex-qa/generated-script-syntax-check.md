# Generated QA Script Syntax Check

**ID:** QA-GENERATED-SCRIPT-CHECK  
**Owner:** pidex-qa  
**Status:** active  
**Created:** 2026-06-01  
**Source:** Highest scenario QA incident (`highest-roadmap-and-feature-evolution`)

## Rule

Before executing any QA-generated helper script, `pidex-qa` must validate that the script is syntactically valid for the runtime that will execute it.

This applies to generated servers, smoke specs, one-off browser harnesses, and temporary API/UI helpers.

## Required checks

For JavaScript ESM/CommonJS helpers:

```bash
node --check path/to/helper.mjs
node --check path/to/helper.js
```

For TypeScript helpers executed directly by Node strip-types or a project runner, use a bounded runtime-mode check, for example:

```bash
timeout 10 node --experimental-strip-types --check path/to/helper.ts
```

If the chosen runner does not support `--check`, run the smallest bounded import/compile check available and record the command.

## Failure handling

If syntax/runtime-mode validation fails:

1. stop the dependent QA path immediately;
2. record the failure in the QA report;
3. classify it as `FAILED_INFRA` or `BLOCKED_INFRA` unless feature code caused the generated invalid script;
4. do not launch dependent servers or browser tests after the failed syntax check.

## Required evidence

QA report must include one of:

- generated script syntax/runtime check command(s) and result(s); or
- `GENERATED-SCRIPT-CHECK-N/A` with reason no QA helper script was generated.
