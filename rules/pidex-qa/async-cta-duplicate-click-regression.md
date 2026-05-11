# Async CTA Duplicate-Click Regression

PROC-NEW: 80-3

## Rule
For each new/changed async CTA, QA must run duplicate-click regression.

Required checks per CTA:
- trigger rapid double-click while pending
- verify only one request or one side effect executed
- verify CTA disabled/pending guard active until settle

## Enforcement
If any async CTA lacks duplicate-click evidence, QA cannot mark COMPLETE.
