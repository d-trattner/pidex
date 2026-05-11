# Fan-out Mandatory Smoke + All-Fail Evidence

PROC-NEW: 71-2

## Trigger
Plan includes fan-out route or aggregate UI consuming multiple domain calls.

## Rule
QA cannot mark `COMPLETE` unless both evidence items exist:
1. Browser smoke proof (live route render + no blocking console/runtime error).
2. Explicit all-fail case proof (all upstream domains fail; UI/API returns degraded envelope/fallback per AC).

Missing either item => verdict `FAILED` (or `BLOCKED` only if environment prevents execution with clear blocker evidence).

## Evidence
QA doc rows for `fanout-browser-smoke` and `fanout-all-fail` with validation token + command/proof artifact refs.
