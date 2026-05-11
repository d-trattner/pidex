# Rule: Large-Diff Batching

PROC-NEW-2 (enforcement) | pidex-code-reviewer

## Rule

**MANDATORY when diff spans 5+ files**: Split files into batches of 3-4. After reading each batch, write findings to the review doc immediately before reading the next batch.

Pattern:
```
Read batch → Write findings → Read next batch → Write findings → ... → Synthesize verdict
```

A review doc with partial findings from 3 batches is recoverable. A review doc with zero findings after reading all files is not.

## Why

This is the Plan 32 stall pattern: pidex-qa entered broad read phase, produced no QA doc findings, stalled. Same applies to code reviewer reading large diffs — open-ended reading loop before Write = primary stall trigger.

## Application

For any implementation touching 5+ files:
1. Split into batches of 3-4 files
2. Read batch 1, write findings immediately
3. Read batch 2, write findings immediately
4. Continue until all batches done
5. Synthesize overall verdict
