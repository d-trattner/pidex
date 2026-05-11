# Root Validation Command First

PROC-NEW: 74-2

## Rule
Run plan-defined root validation command set first. Use app-local or narrowed commands only when plan explicitly allows override.

## Enforcement
- If root command fails from environment mismatch, document failure + reason in implementation doc before trying override.
- If override used without plan allowance, route back for plan clarification.

## Why
Avoid false failures from local command drift.
