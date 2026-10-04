# PIDEX Analysis, Metrics, and History Module

Owns small observability/history surfaces as one module to avoid tiny-module fragmentation.

## Module-owned implementation

- `modules/pidex/analysis-metrics-history/scripts/analysis/**`
- `modules/pidex/analysis-metrics-history/scripts/metrics/**`
- `modules/pidex/analysis-metrics-history/scripts/history/**`
- `modules/pidex/analysis-metrics-history/scripts/pipeline/**`

## Compatibility wrappers

- root history/pipeline wrappers retired; use `analysis-metrics-history.*` capabilities through `scripts/modules/run-check.mjs`.
- root metrics wrappers retired; use `analysis-metrics-history.metrics-*` capabilities or module-owned scripts.
- The former root analysis wrapper and root metrics Node wrappers have been retired; use module-owned implementations.

## History runtime

History append/list capabilities use dependency-free Node entrypoints; `jq` is not required. Module-owned `scripts/history/append.sh` and `list.sh` remain compatibility entrypoints. Their small Node bridge receives shell paths as arguments (allowing Git Bash's normal native-path conversion) without changing the caller's environment. Direct Node callers supply native filesystem paths. Platform declarations and capability argument/confinement policies are unchanged; Unicode text is supported, but the existing capability `--cwd` policy remains ASCII-only.

Both commands use the shared state resolver: nonempty `PIDEX_STATE_DIR`, then nonempty `RUNNING_PI_STATE_DIR`, otherwise this checkout's `state`. Append writes compact UTF-8 JSON plus LF, with a generated UTC-seconds timestamp and string field values, and no success stdout. Direct extra fields retain hyphen-to-underscore names and last-value semantics; `--ts` cannot replace the generated timestamp. Invalid input fails without appending a row. This is not a crash-safe or exactly-once history store.

List retains exact-cwd grouping, latest timestamp selection (last input wins equal timestamps), descending timestamp/cwd tie order and string-based temporary-path exclusion. No filesystem existence, case folding, realpath or project filter is added. `--project` remains unsupported by the backend. Missing/zero-byte history produces no output even with `--json`; whitespace-only history yields `[]` in JSON mode. Input is a strict JSON stream, including pretty objects, adjacent objects, CRLF and an initial UTF-8 BOM; malformed input fails rather than being ignored.

The default limit is five. Legacy JSON numeric slice behavior (including fractional/negative limits and `null` for all) remains; invalid limits fail. Text labels remain A–J and requesting more than ten available entries in text mode fails after those ten; use `--json` for larger lists. Machine-readable JSON uses two-space indentation and a trailing newline. Successful output/exit parity is checked against the former jq implementation without making jq a test-suite prerequisite.

`append.tdd.test.mjs` imports the companion list/portability suite, so both ordinary quality and existing `modules:test` entrypoints cover it without changing command inventory. Native Windows validation remains separate from local Unix shell-wrapper coverage.

Dashboard ingestion remains dashboard host/core until dashboard contribution loader design exists.
