# Table UI Checklist + Copy Semantics Contract

When a plan touches table/list UI or copy that implies agent/AI/audit behavior, the plan MUST bind layout and wording expectations before implementation.

## Trigger

Use this rule when the plan includes:

- table, list, grid, columns, rows, action column, overflow, wrap, readability, mobile table;
- words such as `agent`, `AI`, `LLM`, `audit`, `analysis`, `automation`, `smart`, `assistant`, or similar in UI copy.

## Table/list checklist

Add a `## Table UI Checklist` section for table/list work. This extends, rather than duplicates, the derived-display and screenshot-matrix rules: keep layout, semantic markup, mobile proof, and derived/count truth checks in one table checklist when all apply.

```markdown
## Table UI Checklist

| Item | Decision |
|---|---|
| Column names/count | |
| Min/max widths | |
| Wrap/truncation behavior | |
| Horizontal/vertical overflow | |
| Mobile scroll/pan proof | |
| Empty/loading/error states | |
| Action column behavior | |
| Density/readability target | |
| Semantic markup primitive | `Table*` / real `<table>` / justified exception |
| No div-grid substitute | yes/no + exception reference |
| Existing shared primitive inventory | files/components checked |
| Derived/count/filter truth matrix | source field + positive/negative fixture rows |
```

Semantic table/list expectations:

- If the UI is presented as a data table, default to semantic `Table*` primitives or real `<table>/<thead>/<tbody>/<tr>/<th>/<td>` markup.
- `div` grid/card substitutes are prohibited unless the plan documents an exception with reason, risk, and rollback.
- For table-derived values such as counts, filtered rows, badges, pending labels, degraded flags, or include/exclude behavior, include a truth matrix with source-of-truth field(s), positive fixture rows, negative/excluded fixture rows, and expected outputs.

## Copy semantics contract

Add a `## Copy Semantics Contract` section when copy could imply agent/AI behavior:

```markdown
## Copy Semantics Contract

| UI phrase/surface | Actual behavior | Allowed wording | Prohibited implication |
|---|---|---|---|
```

Classify actual behavior as one of:

- deterministic server computation;
- scripted audit/check;
- LLM/agent-driven analysis;
- future/disabled capability.

UI copy MUST NOT imply LLM/agent behavior unless that path is active in the implementation scope. If behavior is deterministic, use wording such as `server check`, `audit check`, `rule-based audit`, or project-approved equivalent, not `agent ran` / `AI analyzed`.

## Acceptance

- Plans with table/list work have concrete layout proof requirements.
- Plans with agent/audit/AI wording make operator expectations explicit before implementation.
- Critic should reject missing sections when this rule is triggered.
