# Rule: Tool Registry Naming Table

PROC-NEW-50-3 | pidex-planner

## Rule

When a plan introduces a tool registry (a dispatch map from LLM-emitted tool name strings to
adapter method calls), the plan MUST include a binding table in the "Tool Surface" section:

  | Tool Registry Key | Adapter Method | Description |
  |-------------------|---------------|-------------|
  | pihole.add_custom_dns | PiholeAdapter.addCustomDns() | Add A-record for host |
  | pihole.remove_custom_dns | PiholeAdapter.removeCustomDns() | Remove A-record |
  | nginx_pm.create_proxy | NginxPMAdapter.createProxyHost() | Create proxy entry |

This table is BINDING. The exact strings in "Tool Registry Key" must appear in:
- The tool registry's dispatch object keys
- The system prompt's tool surface description (if LLM-directed)
- Test expectations that assert tool dispatch

"Adapter Method" is the implementation target. "Description" is used verbatim in the system prompt.

## Trigger condition

Apply when the plan contains ALL of:
1. A new tool registry module (or extending an existing one)
2. LLM or external caller dispatches actions by string key name

## Why this matters

Plan 50 (execute-plan, 2026-04-29): The plan described "4 PiHole write methods" by adapter
names, but the registry used different key strings. The implementer had to guess the mapping.
The disconnect caused a code-review blocking finding. A single binding table at plan time
collapses this failure class to zero.
