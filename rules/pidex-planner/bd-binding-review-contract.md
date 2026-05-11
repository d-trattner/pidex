# Rule: BD Binding Review Contract Required

**Applies to:** pidex-planner writing plans with behavioral bindings

**Status:** Active  
**Introduced:** Plan 52 (2026-04-29)  
**Evidence:** Plan 52 critic rejected 4 times on binding format clarity; implementer had to iterate on fixture strings

## Definition

**Behavioral binding (BD):** A binding that specifies NOT input/output types, but semantic or instruction-based behavior. Examples:
- "DNS undo-before-redo recovery" (instruction on when/how to retry)
- "Embedding NPM proxy IP at request time" (timing/context specification)
- "Deterministic test fixture format" (expected structure for test data)

## Trigger

Plan includes any binding with:
- Conditional behavior ("if X, then Y")
- Timing constraints ("before Z happens")
- Format specifications ("must match pattern")
- Retry or recovery instructions

## Rule

Before plan reaches approval, declare EXACTLY ONE of:

### Option A: Verbatim Fixture Format (PREFERRED)

Provide concrete, deterministic string the implementation must match. Include placeholders for dynamic parts:

```markdown
## Behavioral Binding BD-5: DNS Undo-Before-Redo

**Format (verbatim):**
```
recoveryFlow = [
  { action: 'undo', target: 'DNS', method: 'restore-previous' },
  { action: 'wait', duration: 200 },
  { action: 'redo', target: 'DNS', method: 'update-new' }
]
```

**Dynamic parts:** `{{ duration }}` default 200ms; settable in config.

**Acceptance:** Critic accepts fixture strings upfront; code review validates exact match.
```

### Option B: Explicit Open-to-Iteration Statement

If exact format cannot be determined upfront, declare it explicitly:

```markdown
## Behavioral Binding BD-6: NPM Proxy Embedding

**Status:** Open-to-iteration

**Reason:** Exact embedding point depends on request context discovery during implementation. 
Format will be validated in code review against acceptance criteria:
- AC-1: Proxy IP must be injected before HTTP request send
- AC-2: No hardcoded IP (must read from $NPM_PROXY_IP env var)
- AC-3: Injection point logged for debugging

**Review contract:** Code review will validate all three acceptance criteria; implementer free to choose 
embedding location within those constraints.
```

## Plan Checklist

Before plan submitted for critic approval, verify:

- [ ] All behavioral bindings listed with explicit header (e.g., "BD-5:", "BD-6:")
- [ ] Each binding has EITHER:
  - Verbatim fixture format (preferred), OR
  - Explicit "open-to-iteration" statement with reason + acceptance criteria
- [ ] No informal binding descriptions ("the DNS recovery should work" → must be formalized)
- [ ] Acceptance criteria clear enough that code reviewer can validate without ambiguity

## Impact

Eliminates critic cycles on binding specificity. Critic either:
- Approves verbatim fixture (lowest ambiguity, fastest path)
- Approves open-to-iteration + acceptance criteria (explicit scope boundaries, code review validates)

No more back-and-forth on "what exactly does this binding mean?"

## Related

- Plan 52 retrospective: "BD binding format ambiguity" (5 critic rejection cycles)
- Rule: pidex-planner/env-var-naming.md (companion specificity rule)
- Rule: orchestrator/background-agent-watchdog.md (from same retrospective)
