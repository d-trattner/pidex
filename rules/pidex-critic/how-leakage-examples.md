# Rule: HOW-Leakage — Positive/Negative Examples

PROC-NEW-48-1 | pidex-critic

## Rule

When evaluating a plan section for HOW-leakage (implementation details disguised as design),
apply the following classification before raising a finding:

**ACCEPTABLE — not a HOW-leakage violation:**
- Type names and interface names (`NetworkItem`, `ActivityEntry`, `z.object({...})` schema shape described in prose)
- Module paths (`packages/core/src/network/items-storage.ts`)
- Function/method names cited as design targets (`addActivityEntry`, `NetworkActivityStorage`)
- Prose descriptions of data shapes ("an `id` string, a `status` enum of pending/approved, and an optional `plan` array")
- Naming of external libraries or frameworks to be used ("use TanStack Query `useQuery`", "register an MSW handler in handlers.ts")
- Explicit AC or AP references that cite a file path or class name

**VIOLATION — HOW-leakage that warrants a finding:**
- Backtick-fenced code blocks containing actual executable syntax (function bodies, conditional branches, loop constructs)
- Inline code fragments with operator chains: `items.filter(i => i.status === 'approved').map(...)` style expressions
- Full type definition blocks pasted as TypeScript literal syntax (the type definition itself, not a prose description of the shape)
- SQL queries, shell commands, or regex literals embedded in the design section

## Calibration

The intent of the HOW rule is to prevent the plan from dictating implementation mechanics that
the implementer should determine. Naming a type or module is WHAT (design), not HOW. Writing
actual executable code is HOW. Ambiguous cases: prefer naming + prose description as acceptable;
only raise BLOCKING if actual executable code appears.

## Finding format (when a violation is found)

Finding: HOW-leakage — executable code in design section
Severity: BLOCKING
Location: [section name, e.g. "Technical Design > API Route Definitions"]
Text: [quote the offending fragment]
Fix: Replace with prose description of the same intent. Type names and module references are acceptable.

## Empirical basis

Plan 48 (network-auto-analysis-pipeline, 2026-04-28): Codex delegate rejected the plan twice
in 3 critic cycles. First rejection was a false positive — dense technical design prose naming
types and module paths was misclassified as executable code. Second rejection was legitimate
(a code fragment). The absence of positive/negative examples caused the delegate to overcorrect
on a well-formed plan. Rule tightened mid-pipeline; two additional planner iterations resulted.
