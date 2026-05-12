# pidex-devops Rules Index

Last updated: 2026-05-08 (POST-RELEASE-HYGIENE)

## Active Rules

| Rule | File | PROC-NEW | Summary |
|------|------|----------|---------|
| Post-Release Artifact Hygiene | [post-release-artifact-hygiene.md](post-release-artifact-hygiene.md) | POST-RELEASE-HYGIENE | After selective release staging leaves dirty docs/artifacts, classify every remaining path and either commit/delete hygiene safely or stop/ask for non-artifact scope |
| Post-Push Release Coherence Checklist | [post-push-release-coherence-checklist.md](post-push-release-coherence-checklist.md) | 027-PI-1 | After push/tag success, require closure checklist for remote proof, roadmap/wiki coherence, and retro/PI artifact presence before release close |
| Pre-Push Artifact Hygiene Gate | [pre-push-artifact-hygiene-gate.md](pre-push-artifact-hygiene-gate.md) | 71-3 | Before push, verify transient/runtime artifact paths not staged/tracked and block release on hygiene failures |
| Release Preflight Proof Line | [release-preflight-proof-line.md](release-preflight-proof-line.md) | 026-3 | Release/tag/push flows require compact proof line with validation taxonomy, gate summary, push evidence, and dirty-tree state |
| E2E Port-Owner Preflight Evidence | [e2e-port-owner-preflight-evidence.md](e2e-port-owner-preflight-evidence.md) | 026-2 | E2E runs on fixed ports require owner detect/cleanup/recheck plus deployment evidence line before gate run |
| Clean-Tree Reconciliation Evidence | [clean-tree-reconciliation-evidence.md](clean-tree-reconciliation-evidence.md) | 6 | Require `reconcile_commits` hash list evidence before tag/push block |
| Write Skeleton First | (inline in agent .md) | 3 | Write deployment doc skeleton as FIRST tool_use before git ops |
| Commit Skeleton Immediately | (inline in agent .md) | 8 | Commit skeleton immediately after writing; before any other git ops |
| Single Combined Batch Close | (inline in agent .md) | 3 (close) | Close pipeline docs in single combined Bash call, not per-file |
| Post-G9 Fix Test Required | [post-g9-fix-test-required.md](post-g9-fix-test-required.md) | 44d | If post-G9 code changes exist, require targeted test run confirmation before Stage 1 — zero test validation is not acceptable for any post-G9 production code change |
| G9 Pre-flight Kill Stale Vite | [g9-preflight-kill-vite.md](g9-preflight-kill-vite.md) | 48-4 | Run `pkill -f "vite.*--host" \|\| true` before starting dev server for G9 preview to clear stale processes |
| G9 Preview Upstream Reachability | [g9-preview-upstream-reachability.md](g9-preview-upstream-reachability.md) | G9-UPSTREAM | Before presenting a LAN/domain G9 URL, prove listener bind, local upstream, LAN upstream, and user-facing domain/proxy reachability |
| Post-Stage1 UI Preview Before G4 | [post-stage1-ui-preview-before-g4.md](post-stage1-ui-preview-before-g4.md) | UI-PREVIEW | UI-involved work must route to orchestrator G9 preview after Stage 1 local commit and before G4 |
| Suppress Gate Notifications in Direct Mode | [suppress-gate-in-direct-mode.md](suppress-gate-in-direct-mode.md) | 49-3 | No Telegram/external G4 notifications when orchestrator is in direct interactive terminal session with user |
| running-pi Install Propagation | [running-pi-install-propagation.md](running-pi-install-propagation.md) | 53-1 | After Stage 1 commit, run `bash ~/running-pi/install.sh` when plan touched any `~/running-pi/` source file; log result in deployment doc |
| DevOps Execution Profile Diff Guard | [execution-profile-diff-guard.md](execution-profile-diff-guard.md) | DEVOPS-EXECUTION-PROFILE-DIFF | Final changed-file/profile consistency check before local commit/release when fast paths may skip gates |
| Prepare-Only Stage Marker | [prepare-only-stage-marker.md](prepare-only-stage-marker.md) | 2 | Stage 1 must carry fixed prepare-only marker; tag/push/publish forbidden until Stage 2 approval |
| Dirty Tree Triage Report | [dirty-tree-triage-report.md](dirty-tree-triage-report.md) | RELEASE-DIRTY-TREE | Dirty workspaces before Stage 1/2 require include/exclude triage and selective-staging evidence before tag/push |
| QA Status Reconciliation Preflight | [qa-status-reconciliation-preflight.md](qa-status-reconciliation-preflight.md) | DEVOPS-QA-STATUS | Before release/local readiness, verify QA status/evidence/ROUTING align or block for reconciliation |

## Notes

PROC-NEW-3 and PROC-NEW-8 are structurally core to the two-stage release model and remain inline in the agent .md. They define the devops workflow itself, not learned edge cases.

## How to use

Read this index at task start. Load specific rule files when relevant to current task.
