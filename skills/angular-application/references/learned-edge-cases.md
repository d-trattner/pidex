# Evidence-backed Angular edge cases

Status: one Angular programming rule admitted from comparative benchmark evidence.

## Bind deferred Router leave authorization to the exact destination

When a dirty-state `CanDeactivate` flow postpones Angular Router navigation for an in-app stay/discard decision, never resume it through an unscoped one-shot boolean such as `allowNext`. Another navigation can consume that boolean before the intended retry and bypass the guard for the wrong destination.

Prefer returning the decision asynchronously from the original guard. If the application must retry navigation after the decision, store authorization for the exact serialized target URL or `UrlTree`, consume it only when the next guard invocation matches that target, and invalidate it on stay, superseding intent, cancellation, or component destruction. Keep the latest pending destination separate from the one-use authorization. Preserve established route grammar and every task-required destination while changing guard mechanics. Verify that two pending destinations select the latest, while an unrelated navigation cannot spend the authorization or bypass dirty-state protection.

Evidence: two independent DepotFlow Stage 04 official-skill implementations used target-unbound one-shot booleans (`allowNext` and `allowDiscardNavigation`); one also placed leave protection only on selected destination `canActivate` routes. The no-skill control used exact URL matching and passed 49/49. The first exact candidate fixed target binding and passed S02 41/41, but a repeat changed the required transfer URL and was rejected. The preservation-strengthened exact candidate then passed Stage 04 twice at 47/49 with all critical programming, route-contract, build, test, Nx, and write-boundary checks passing, plus unaffected S02 at 41/41.

## Admission policy

Future additions require a reproducible fixture or redacted real-project case, repeated official-baseline programming failure, one narrow guidance change, repeated improvement, no material regression on an unaffected case, source review, and a normal PIDEX commit. Testing-only omissions, project preferences, one-off defects, benchmark defects, and unsupported assumptions must not become global programming guidance.
