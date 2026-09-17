# Angular source integrity on Windows Git checkouts

`ANGULAR_SOURCE_MEMBER_DIGEST` is a byte-integrity failure, not a request to
regenerate the source lock. With `core.autocrlf=true`, Git can otherwise turn the
pinned LF references into CRLF during checkout. The bytes then legitimately fail
the unchanged size/SHA-256 gate.

The repository `.gitattributes` marks the complete locked Angular, Material, Nx
and upstream attribution trees, plus the source-lock JSON, as `-text`. This
preserves **exact Git blob bytes**, not just normalized text, irrespective of
`core.autocrlf`/`core.eol`. It also preserves any intentionally pinned upstream
CRLF bytes in future snapshots. The digest algorithm, lock values, mirror check
and member closure are not changed. Other project files keep their existing Git
policy; no global Git configuration change is required.

## Existing Windows checkout

Pull the fixed PIDEX source first. A changed `.gitattributes` does not necessarily
rewrite already present, unchanged files. If the gate still reports a digest
failure, use the following **in the native Windows PIDEX checkout**, with no
concurrent editor/Git operation. Review the paths before running it.

`text: unset`, a clean Git diff, or a completed `git restore` is not proof of the
actual disk bytes. The reported case has 10,760 bytes/143 CRLF pairs instead of the
pinned 10,617 bytes. Use the binary maintenance helper rather than repeating Git
restore or redirecting `git show` through PowerShell text output:

```powershell
node scripts/maintenance/restore-angular-source-bytes.mjs --check
node scripts/maintenance/restore-angular-source-bytes.mjs --apply
```

Default/`--check` only plans and reports byte counts. `--apply` repeats all checks
before writing. It pins HEAD, reads raw blobs using binary `git cat-file` output,
and proves the complete candidate with the **unchanged** source-lock verifier.
The selected index entries must exactly match HEAD (including modes), regardless
of assume-unchanged/stat-cache state. Every existing file is read directly; only
exact bytes or CRLF-to-LF-only drift relative to that proven blob are accepted.
Replacement bytes come from the Git blob, never from text decoding/normalization.

All locked members and both lock copies are preflighted before the first write.
Real/staged edits, missing/extra members, unsafe links, a corrupt HEAD corpus,
active index/repair locks and partial clones are refused. No fetch or global Git
configuration change is performed. An owned lock lives at the checkout's Git-dir
`pidex-angular-source-restore.lock`; unknown owners are not removed automatically.
HEAD/index, directory identity and file bytes are rechecked before each atomic
replacement, and the original verifier runs again afterwards. Only existing,
validated source paths are replaced; the index and unrelated files are untouched.

Stop on `blocked`, `held-partial` or `held-cleanup`. A late edit/I/O failure can
leave some files already repaired; the result lists them. No automatic rollback
may overwrite concurrent edits, and no pipeline is resumed. The pipeline must
remain HOLD even when byte repair succeeds. Back up and inspect real changes
separately; never discard them to make the gate pass. Verify again through
the normal module gate (replace the project placeholder with the original
application project, so its module configuration remains authoritative):

```powershell
node scripts/modules/run-check.mjs --capability angular.source-check --agent orchestrator --phase preflight --project "<absolute-application-project-root>"
```

Use the actual agent/phase if different. If verification still fails, stop and
investigate; do not recalculate hashes, normalize bytes in the verifier, disable
the module gate, delete extra files blindly or resume a held pipeline. Source
repair is not pipeline-continuation authorization. These instructions do not
perform a remote repair on another PC.

## Regression evidence

The source-lock tests create an isolated local Git repository and exercise real
checkout/index operations with `core.autocrlf=true`, `input` and `false`, including
`core.eol=crlf`. An unprotected text-file control really becomes CRLF, while every
locked member and both lock copies remain byte-identical and pass the gate.
Forced CRLF edits still fail the digest check. The binary-helper regression
reproduces the exact 10,760/10,617-byte case: a fixture skip-worktree flag makes
Git restore succeed without repairing the bytes, while the binary helper restores
them exactly and leaves the index unchanged. This demonstrates the failure mode;
it does not establish which Git flags caused the user's reported failure. It also covers every
locked member and both lock copies, corrupt HEAD blobs, real/staged edits, links,
extra files, active locks, concurrent edits, partial completion and changed lock
ownership. Test-only repositories are local fixtures. No network, model calls,
product commits or global Git configuration changes are needed. This is checkout-conversion regression evidence,
not a claim that the user's Windows machine was repaired or live-tested.
