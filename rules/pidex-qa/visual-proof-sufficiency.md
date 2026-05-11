# Visual Proof Sufficiency Gate

For UI-heavy, UI-parity, or G9-corrective plans, QA MUST prove the specific visual claim. A generic screenshot is insufficient when the acceptance criterion is about placement, hierarchy, table readability, mobile behavior, or pattern parity.

## Required QA section

Add a `## Visual Proof Sufficiency` section before `QA Complete`.

Minimum table:

```markdown
## Visual Proof Sufficiency

| Claim | Selector / evidence | Container boundary | Placement relation | Viewport | Artifact | Verdict |
|---|---|---|---|---|---|---|
```

## Required proof dimensions

For each disputed or acceptance-critical UI claim, record:

- target selector/locator exists;
- target element is inside/outside the intended container;
- placement relationship is proven relative to a named element (`above`, `below`, `left of`, `right of`, `top-level`, `inside card`, `outside card`, etc.);
- relevant label/text/affordance is visible;
- desktop screenshot exists;
- mobile screenshot or pan/scroll proof exists when responsive behavior matters;
- DOM snapshot or locator output exists when placement/container boundary is the claim;
- console noise is classified as blocker, dev-only non-blocker, or host-config issue.

## Table/list UI additions

When the UI claim involves tables/lists, also prove:

- column names and count;
- semantic table/list primitive evidence when the plan requires it;
- wrapping/truncation behavior;
- horizontal/vertical overflow behavior;
- action column reachability;
- mobile pan/scroll proof when table width exceeds viewport.

## Truthfulness fixture audit

When a table/list shows derived counts, filtered rows, recommendation labels, pending/degraded status, or include/exclude logic, QA must run a deterministic truth audit before first UAT handoff.

Required evidence:

| Claim | Source-of-truth field | Positive fixture rows | Negative/excluded rows | Expected output | Actual output | Verdict |
|---|---|---|---|---|---|---|

Negative rows must cover plausible false positives such as already-latest rows, generic/device-like rows, hidden rows, or out-of-scope statuses. If the audit is missing or ambiguous, route `BLOCKED` to `pidex-implementer` or `pidex-planner` rather than sending to UAT.

## Blocking rule

QA MUST NOT emit `QA Complete` for a UI-heavy/G9-corrective plan when:

- screenshots exist but do not show the target element;
- screenshots show the element but not the required container boundary;
- mobile/table behavior is claimed without viewport or pan/scroll evidence;
- semantic table/list behavior is claimed without primitive/DOM or role evidence;
- derived counts/filter/status truthfulness is claimed without positive and negative fixture evidence;
- console errors relevant to the changed UI are unclassified.

Route to `pidex-implementer` for implementation gaps, `pidex-planner`/`pidex-designer` for ambiguous intent, or `orchestrator`/`user` when a UI Intent Contract is missing.
