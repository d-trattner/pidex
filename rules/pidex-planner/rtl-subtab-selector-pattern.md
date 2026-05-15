# RTL Sub-Tab Selector Pattern: `.submenu-item` + textContent (PROC-NEW-46-5)

**Applies to:** pidex-planner, pidex-implementer
**Load when:** writing a plan that adds a new sub-tab navigation entry (any entry rendered within a `SubmenuPanel` or equivalent nav sub-list), OR any plan that includes RTL tests for sub-tab navigation.

---

## The Pattern (binding)

When writing RTL tests that click or assert on a sub-tab navigation button, use the **CSS selector + textContent** pattern — NOT `findByRole('button', {name: ...})`.

**WRONG (causes "found multiple elements" error):**
```tsx
const agentTab = await screen.findByRole('button', { name: /agent/i });
```

**CORRECT:**
```tsx
const submenuItems = container.querySelectorAll('.submenu-item');
const agentTab = Array.from(submenuItems).find(
  el => el.textContent?.includes('Agents')
);
expect(agentTab).toBeDefined();
await userEvent.click(agentTab!);
```

## Why `findByRole` fails in sub-tab context

The app shell renders multiple nav elements simultaneously: top-level nav items AND sub-tab items. In an RTL test that mounts the full shell, `findByRole('button', {name: /agent/i})` will match:

- The top-level nav entry (if it exists)
- The sub-tab entry
- Any button within the rendered page content that contains the word "agent"

This causes RTL to throw `TestingLibraryElementError: Found multiple elements with role "button" and name matching /agent/i`.

The `.submenu-item` CSS class is the canonical discriminator for sub-tab buttons. It is applied by `SubmenuPanel` to every entry it renders. The `textContent` match narrows within that selector.

## Required plan annotation

Any plan that adds a new sub-tab AND includes an RTL test for that sub-tab's navigation MUST include in the Test Strategy or Implementation Notes:

```
RTL nav selector: use `.submenu-item` querySelectorAll + textContent match for the new
<SubTabName> sub-tab. Do NOT use findByRole('button', {name: /<SubTabName>/i}) — it
matches multiple elements in the full-shell RTL context.
```

## Empirical basis

This pattern was first established in Plans 24–25 (Shell V2, sub-tab navigation). It was documented in the wiki (`rtl-waitfor-element-capture-rule.md`) but not referenced in subsequent plans that added sub-tabs.

Plan 46 (Agents sub-tab): the implementer re-discovered the pattern after `findByRole` failed with multiple matches. Resolution was correct but added an undocumented detour in the implementation.

Plans that bind this pattern in the plan body: zero re-discoveries. Plans that do not bind it: one re-discovery per new sub-tab.

## Related

- `wiki/concepts/rtl-waitfor-element-capture-rule.md` — full RTL capture patterns including waitFor, element re-query, and selector discipline.
- `wiki/concepts/app-shell-layout-pattern.md` — SubmenuPanel rendering structure.
