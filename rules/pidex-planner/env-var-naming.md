# Rule: Environment Variable Naming Must Be Exact

**Applies to:** pidex-planner writing plans with environment variable references

**Status:** Active  
**Introduced:** Plan 52 (2026-04-29)  
**Evidence:** Plan 52 said "embed NPM proxy IP env var at request time" without naming the var; critic rejected on first cycle

## Trigger

Plan text contains ANY reference to:
- Environment variables
- Configuration keys
- Named settings or parameters

## Rule

### Name Exactly, Everywhere

Never write:
- "the npm proxy env var" → write `$NPM_PROXY_IP`
- "the system prompt config" → write `config.systemPrompt`
- "the env var" → write actual identifier

ALWAYS:
1. **Check codebase first** — does the var/config already exist?
   ```bash
   grep -r "NPM_PROXY_IP" <project>/src <project>/config
   grep -r "systemPrompt" <project>/src <project>/config
   ```
2. **Name consistently** — use the exact name from first reference to last
3. **Declare new names upfront** — if introducing new env var, state it clearly
4. **List in a table** — if plan references 3+ vars, create "Environment Variables" section

### Plan Checklist

Before plan submitted for critic approval, verify:

- [ ] All env var references use exact identifier (e.g., `$NPM_PROXY_IP`, not "the npm proxy var")
- [ ] All config key references use exact path (e.g., `config.systemPrompt`, not "the system prompt")
- [ ] If 3+ vars/keys referenced, create "Environment Variables" table with name, type, default, source
- [ ] Verify against codebase: no invented names that don't exist in config
- [ ] Consistent naming across all references (no "NPM_PROXY_IP" in one place, "npm proxy IP" in another)

### Example Plan Section

```markdown
## Implementation Requirements

**Environment Variables:**
| Name | Type | Default | Source |
|------|------|---------|--------|
| `$NPM_PROXY_IP` | string | (required) | Config at `config.npmProxyIp` |
| `$REPAIR_RETRY_MS` | number | 2000 | Config at `config.repairRetryMs` |

**Changes:**
- At request time, inject `$NPM_PROXY_IP` into system prompt (AP-50-1)
- Use `$REPAIR_RETRY_MS` for DNS undo-before-redo wait duration (BD-5)
```

## Impact

Eliminates first-cycle clarifications from critic. Plan is self-documenting; critic can approve configuration upfront without asking "which env var?"

## Related

- Plan 52 retrospective: "Environment Variable Naming Must Be Exact" (section: "Planning Insights")
- Rule: pidex-planner/bd-binding-review-contract.md (companion specificity rule)
- Rule: orchestrator/background-agent-watchdog.md (from same retrospective)
