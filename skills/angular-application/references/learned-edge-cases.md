# Evidence-backed Angular edge cases

Status: one technical rule admitted from comparative benchmark evidence.

## Test both completion directions for latest-intent asynchronous state

When Angular state can receive out-of-order asynchronous completions, do not infer safety from one race direction or from symmetric-looking request-generation code. Before implementation, reserve separate controllable tests for both:

1. an older success completing after the newer failure must not replace the newer error or intent;
2. an older failure completing after the newer success must not replace the newer data or intent.

Also prove that a stale completion cannot clear the current request's pending state, enable an action from stale validity, or mutate a newer draft. Prefer controllable deferred operations over equal-delay timers. Bind both success and failure handlers to the same request generation, abort identity, or equivalent latest-intent guard, and preserve all pre-existing required journey tests.

Evidence: in DepotFlow Stage 03, the official skill omitted the required two-direction completion matrix in two independent runs while its builds and project-authored tests passed. A first broad overlay was unstable and a narrow top-level overlay did not reproduce reliably. The exact learned-layer candidate then scored 44/44 twice on the discriminating scenario and 41/41 on the unaffected async-signals control, with builds, tests, critical acceptance, and write boundaries passing throughout.

## Admission policy

Future additions require a reproducible fixture or redacted real-project case, repeated official-baseline failure, one narrow guidance change, repeated improvement, no material regression on an unaffected case, source review, and a normal PIDEX commit. Project preferences, one-off defects, benchmark defects, and unsupported assumptions must not become global guidance.
