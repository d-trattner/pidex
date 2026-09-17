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

The checks stop on staged changes or content changes other than CR-at-EOL. They
must not be removed. Back up and inspect real edits separately; do not overwrite
them to make the gate pass.

```powershell
$locked = @(
  "skills/angular-application/references/official-angular",
  "skills/angular-application/references/official-material",
  "skills/angular-application/references/official-nx",
  "skills/angular-application/references/upstream",
  "modules/pidex/angular/config/source-lock.json"
)

git diff --cached --quiet -- $locked
if ($LASTEXITCODE -ne 0) { throw "Stop: staged changes or Git error" }

git diff --ignore-cr-at-eol --quiet -- $locked
if ($LASTEXITCODE -ne 0) { throw "Stop: real local edits or Git error; preserve them" }

git restore --source=HEAD --worktree -- $locked
if ($LASTEXITCODE -ne 0) { throw "Stop: source restore failed" }
```

Only the listed tracked source paths are restored from the current commit. The
index, other project files and global Git settings are untouched. This does not
remove untracked/extra files or grant an exception for them. Verify again through
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
Forced CRLF edits still fail the digest check. Targeted restore is tested against
an immutable tree; staged and unstaged content edits are detected rather than
silently discarded. No network, model calls, product commits or global Git
configuration changes are needed. This is checkout-conversion regression evidence,
not a claim that the user's Windows machine was repaired or live-tested.
