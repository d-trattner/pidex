# Evidence-backed Angular edge cases

Status: two Angular programming rules admitted from comparative benchmark evidence.

## Bind deferred Router leave authorization to the exact destination

When a dirty-state `CanDeactivate` flow postpones Angular Router navigation for an in-app stay/discard decision, never resume it through an unscoped one-shot boolean such as `allowNext`. Another navigation can consume that boolean before the intended retry and bypass the guard for the wrong destination.

Prefer returning the decision asynchronously from the original guard. If the application must retry navigation after the decision, store authorization for the exact serialized target URL or `UrlTree`, consume it only when the next guard invocation matches that target, and invalidate it on stay, superseding intent, cancellation, or component destruction. Keep the latest pending destination separate from the one-use authorization. Preserve established route grammar and every task-required destination while changing guard mechanics. Verify that two pending destinations select the latest, while an unrelated navigation cannot spend the authorization or bypass dirty-state protection.

Evidence: two independent DepotFlow Stage 04 official-skill implementations used target-unbound one-shot booleans (`allowNext` and `allowDiscardNavigation`); one also placed leave protection only on selected destination `canActivate` routes. The no-skill control used exact URL matching and passed 49/49. The first exact candidate fixed target binding and passed S02 41/41, but a repeat changed the required transfer URL and was rejected. The preservation-strengthened exact candidate then passed Stage 04 twice at 47/49 with all critical programming, route-contract, build, test, Nx, and write-boundary checks passing, plus unaffected S02 at 41/41.

## Rebase asynchronous snapshots against accepted local mutations

In a root-scoped signal store that combines asynchronously loaded snapshots with optimistic operations, committed operations, or live events, do not blindly replace the authoritative base when a load completes. The response may represent state from before locally accepted changes and can erase them even when request-generation guards correctly reject responses for the wrong route.

Capture a mutation revision or event cursor when each load starts. When its snapshot completes, either prove that it is newer than the local base, or install it and replay/rebase every accepted mutation after that cursor before deriving the visible signal state. Keep still-pending optimistic deltas separate so each completion or rollback remains operation-scoped. Verify navigation or refresh completion after a committed operation and after a live event, including a pending operation, without losing or duplicating any accepted delta.

Evidence: two independent official-skill implementations and the no-skill control used operation-aware state but called unconditional `load`/`replaceBase` from route refresh completion, allowing a later snapshot to erase committed transfer and live-event changes. The exact completion-gated candidate produced two independent implementations with mutation revision/cursor capture and reject-or-replay handling; all critical programming checks passed in both, and the unaffected Stage 05 control passed 49/49.

## Admission policy

Future additions require a reproducible fixture or redacted real-project case, repeated official-baseline programming failure, one narrow guidance change, repeated improvement, no material regression on an unaffected case, source review, and a normal PIDEX commit. Testing-only omissions, project preferences, one-off defects, benchmark defects, and unsupported assumptions must not become global programming guidance.
