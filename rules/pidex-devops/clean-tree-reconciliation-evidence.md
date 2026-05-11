# Clean-Tree Reconciliation Evidence (PROC-NEW-6)

## Rule
Before any tag/push command block, record reconciliation evidence for dirty-tree cleanup.

## Required evidence field
- `reconcile_commits: [<hash1>, <hash2>, ...]`

## Usage
If working tree was dirty and reconciled, list commit hashes that produced clean state.
If tree already clean, set `reconcile_commits: []`.

## Enforcement
Tag/push blocked until evidence field present in deployment artifact.
