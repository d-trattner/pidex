# Rule: Follow-up Roadmap Suggestion at Pipeline Close

PROC-NEW-FOLLOWUP-G10 | orchestrator

## Trigger

Run when a PIDEX pipeline reaches terminal completion, release hold, or G10 next-epic decision. Always give the user a next-action choice set, even when no follow-ups are found. Also run the follow-up scan when any artifact mentions follow-up / deferred / carry-forward / open item / future work.

## Rule

Do not merely report follow-ups. Give the user an explicit recommended next action and a compact choice set. Never end a pipeline closeout with only "done" or a passive summary; include what the user can do next.

If follow-ups are product/runtime/user-value work, suggest creating or updating a roadmap epic. If follow-ups are small technical debt or test gaps, suggest adding to `wiki/open-items.md` or bundling into a maintenance epic. If follow-ups are process/rule improvements, suggest routing to `pidex-pi` or applying the approved rule update path.

## Minimal scan

Use targeted snippets, not full artifact sweeps. Check, when present:

- final roadmap summary / G10 output
- `wiki/open-items.md`
- current deployment/devops doc
- current QA/UAT doc
- current retrospective/PI doc
- merge/adjudication summaries from parallel agents

Search terms:

```text
follow-up|followup|deferred|carry-forward|open item|future plan|future epic|backlog|maintenance|TODO|PIF
```

## Classification

Classify each follow-up:

| Class | Examples | Suggested action |
|---|---|---|
| Product epic | user-visible feature, missing capability, workflow improvement | "Create/update roadmap epic" |
| Maintenance epic | cleanup across files, test hardening, migration, reliability work | "Create maintenance epic" |
| Open item | small non-blocking task, single test gap, minor TODO | "Track in wiki/open-items.md" |
| Process improvement | PIDEX rule/gate/agent behavior | "Route to pidex-pi / approve process update" |
| No action | already tracked, duplicate, intentionally out of scope forever | "No new epic needed" |

## Final prompt shape

At pipeline close, include a short section:

```text
Follow-ups found:
- <item> — class: <class> — source: <artifact/path>

Recommendation:
- I recommend creating a <roadmap|maintenance> epic for <item/reason>.

Choose next:
A) Create/update roadmap epic now
B) Track as wiki/open-items only
C) Defer/no action
D) Continue with existing next roadmap epic
```

If no follow-ups exist:

```text
Follow-ups: none found.
Recommendation: continue with the existing roadmap, inspect the next epic, or stop.

Choose next:
A) Show more detail on the next roadmap epic
B) Start pre-flight for the next roadmap epic
C) Run a quick roadmap/open-work status check
D) Stop here
```

When follow-ups do exist, still include an option that lets the user inspect the next existing roadmap epic before committing to work.

## TBR closeout

For `wiki/tbr/index.md`, show at most a few relevant open IDs as optional candidates. Never treat age, severity, or reviewer source as promotion authority. Offer: analyze selected ID, promote selected ID to roadmap candidate, or leave archive unchanged.

## Important

- Do not create a new epic without user confirmation.
- Do not bury the recommendation inside a long delivery summary.
- If several follow-ups exist, group duplicates and recommend one bundled epic when they share a theme.
- `agents.output/**` remains generated; durable roadmap/open-items changes belong in `wiki/` or roadmap source per normal PIDEX flow.
