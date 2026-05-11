# 503 All-Unavailable Nav Assertion

PROC-NEW: 74-3

## Rule
When API can degrade/unavailable (503 path), review must verify explicit nav/shell assertion for all-unavailable scenario. Static fallback counts in this path are reject-level finding.

## Enforcement
- Require test/assertion evidence that unavailable DTO drives degraded/unavailable badge/copy.
- If static counts shown during valid unavailable payload, mark finding and block pass.

## Why
Prevents false all-clear UI on outage paths.
