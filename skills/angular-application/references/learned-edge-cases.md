# Evidence-backed Angular edge cases

Status: four Angular programming rules admitted from comparative benchmark evidence.

## Bind deferred Router leave authorization to the exact destination

When a dirty-state `CanDeactivate` flow postpones Angular Router navigation for an in-app stay/discard decision, never resume it through an unscoped one-shot boolean such as `allowNext`. Another navigation can consume that boolean before the intended retry and bypass the guard for the wrong destination.

Prefer returning the decision asynchronously from the original guard. If the application must retry navigation after the decision, store authorization for the exact serialized target URL or `UrlTree`, consume it only when the next guard invocation matches that target, and invalidate it on stay, superseding intent, cancellation, or component destruction. Keep the latest pending destination separate from the one-use authorization. Preserve established route grammar and every task-required destination while changing guard mechanics. Verify that two pending destinations select the latest, while an unrelated navigation cannot spend the authorization or bypass dirty-state protection.

Evidence: two independent DepotFlow Stage 04 official-skill implementations used target-unbound one-shot booleans (`allowNext` and `allowDiscardNavigation`); one also placed leave protection only on selected destination `canActivate` routes. The no-skill control used exact URL matching and passed 49/49. The first exact candidate fixed target binding and passed S02 41/41, but a repeat changed the required transfer URL and was rejected. The preservation-strengthened exact candidate then passed Stage 04 twice at 47/49 with all critical programming, route-contract, build, test, Nx, and write-boundary checks passing, plus unaffected S02 at 41/41.

## Rebase asynchronous snapshots against accepted local mutations

In a root-scoped signal store that combines asynchronously loaded snapshots with optimistic operations, committed operations, or live events, do not blindly replace the authoritative base when a load completes. The response may represent state from before locally accepted changes and can erase them even when request-generation guards correctly reject responses for the wrong route.

Capture a mutation revision or event cursor when each load starts. When its snapshot completes, either prove that it is newer than the local base, or install it and replay/rebase every accepted mutation after that cursor before deriving the visible signal state. Keep still-pending optimistic deltas separate so each completion or rollback remains operation-scoped. Verify navigation or refresh completion after a committed operation and after a live event, including a pending operation, without losing or duplicating any accepted delta.

Evidence: two independent official-skill implementations and the no-skill control used operation-aware state but called unconditional `load`/`replaceBase` from route refresh completion, allowing a later snapshot to erase committed transfer and live-event changes. The exact completion-gated candidate produced two independent implementations with mutation revision/cursor capture and reject-or-replay handling; all critical programming checks passed in both, and the unaffected Stage 05 control passed 49/49.

## Treat Angular templates as compiler-typed contracts

Angular templates are not unrestricted JavaScript. Every expression resolves against template locals and component or iterable-item members, and every reactive-form directive has a concrete control-type contract. Do not reference implicit JavaScript globals such as `Math`, `Number`, `Object`, or `JSON`; compute the value in TypeScript or expose a narrow component member. Do not bind a `FormArray` to `[formGroup]`; bind it through its parent with `formArrayName`, then bind each child group with the matching group directive and stable row identity. Check every binding name against the exact view-model interface.

Run the real affected application build after template or form wiring and treat every template diagnostic as a blocking programming error. TypeScript-only checks and authored test files do not prove that Angular's template compiler accepts the application.

Evidence: two independent DepotFlow Stage 12 official-skill implementations failed production application compilation. One referenced implicit `Math` from a template (`TS2339`); the other passed a typed `FormArray` where the form directive required a `FormGroup` (`TS2739`). A first narrow candidate was rejected after product-behavior regressions. The strengthened fail-closed template-contract candidate produced two independent implementations whose production application builds passed. Their remaining failures were confined to provider-authored tests using `Array.prototype.at` outside the workspace test target and were not reclassified as production failures or promoted as guidance. The unaffected Stage 11 control passed build, tests, and evaluator. Independent audit: PASS, with the exact-item-name clause treated as supporting compiler-contract guidance rather than a separately proven failure class.

## Bind framework migrations to the exact destination toolchain

A React-to-Angular migration is incomplete when only source files are translated. Establish one coherent Angular workspace authority: destination manifest, Angular workspace and TypeScript configuration, browser entry point, regenerated lockfile, and removal of the old React runtime entry points. When the target defines an exact compatibility tuple, use those exact coordinates rather than selecting the first installable release from the requested major. Complete the migration only after the destination Angular build and tests run successfully.

Keep this rule narrow. It does not require a full rewrite over an incremental migration, prescribe unrelated redesign, or prove one specific lockfile command. It requires that the chosen cutover unit has one runtime authority, an internally consistent exact target toolchain, and executable destination validation. Never hide incompatibility with force or legacy-peer bypasses.

Evidence: after adding an unconfounded, bounded dependency-migration harness, two independent official-skill React-to-Angular implementations selected Angular `22.0.0` despite the fixture's required core/common/compiler/forms/router `22.1.4` and CLI/build `22.1.6` tuple; one also failed the production build. The strengthened candidate produced two independent migrations with the exact tuple, regenerated lockfiles, and passing Angular builds/tests; all critical evaluator checks passed (54/54 and 52/54, with only one important test-evidence wording gap). An unaffected S02 async-signals control passed 41/41. Independent audit: PASS for the narrow destination-toolchain rule; command-level lockfile provenance and clause-by-clause ablation remain explicitly unclaimed.

## Admission policy

Future additions require a reproducible fixture or redacted real-project case, repeated official-baseline programming failure, one narrow guidance change, repeated improvement, no material regression on an unaffected case, source review, and a normal PIDEX commit. Testing-only omissions, project preferences, one-off defects, benchmark defects, and unsupported assumptions must not become global programming guidance.
