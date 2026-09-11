# Working baseline (opt-in, Linux-first)

A source checkout, a loaded Pi extension, its effective configuration, and an
accepted working baseline are **four different facts**. A Git branch name, a
successful test log, `/reload`, or `selected.json` alone proves none of the other
three.

Existing, unbound sessions remain compatible. They are `unregistered` or
`experimental`, never `ready`. This feature does not install, update, commit,
release, switch a checkout, or accept an operational baseline automatically.

## Read-only diagnosis

From the candidate checkout:

```sh
node scripts/runtime/status.mjs --pidex-root "$PWD" --json
node scripts/runtime/baseline.mjs inspect --pidex-root "$PWD" --json
```

These commands do not create a baseline store or call a provider. Disk status
cannot prove what an existing Pi process loaded. In a Pi process that actually
loaded the new extension, `/pdstatus` displays that process's own observation.

Bound-session priority:

| Status | Meaning |
| --- | --- |
| `invalid` | Invalid record/configuration, unsafe path, or conflicting roots |
| `unconfirmed` | Incomplete observation or no controlled process-local load |
| `restart_required` | Source differs from the pinned or loaded source |
| `configuration_changed` | Effective configuration differs |
| `scope_not_accepted` | Platform, architecture, Node, Pi, or PIDEX mode differs |
| `ready` | All observations match this process's accepted baseline |

All observed reasons remain visible. A selection change does not rebind an
existing process. Reload invalidates its assurance; another status process does
not restore it. Guards precede PIDEX kickoff, primary/secondary host dispatch,
review/hold work, container branches, and each configured provider attempt.
Drift blocks the next dispatch, not an already running agent.

## Supported observation boundary

Inventory v1 covers Git-indexed runtime code under `extensions/`, `scripts/`,
`modules/`, `agents/`, `prompts/`, `skills/`, and `rules/`, plus `package.json` and
`pnpm-lock.yaml`. Module knowledge and skill/prompt Markdown are inputs, including
resource READMEs. Top-level project documentation/wiki, tests, and the known
`scripts/quality/fixtures/` test tree are not runtime inputs. New untracked or
ignored runtime resources produce incomplete coverage **without opening their
contents**; staging makes them observable, but acceptance still requires clean,
committed source. Do not stage private data to work around a refusal.

File symlinks, hardlinks, unsafe directories, unknown excluded resource trees,
oversized files, and changed-during-read files are refused. Root aliases are
canonicalized. Limits: 20,000 files, 16 MiB/file, 256 MiB total, 1 MiB per
config/record, a five-second source-observation budget, and bounded Git calls.
A synchronous call on a hung mount can still block: this is not an OS-enforced
snapshot or a guarantee against hostile same-user mutation/ABA.

Configuration is projected semantically, not hashed as arbitrary raw JSON:

- Agent routing, tools, principals, permissions and configured fallback.
- Shared sandbox merge, module-entry merge/effective enablement, parallel-agent
  precedence and normalization, and manual-only governor normalization.
- Bundled rule seed, default balance configuration, public dashboard domain,
  and supported runtime flags.
- Unknown fields, external config/loader overrides and unsupported values are
  visible refusals, not silent defaults.

Local pricing, balance, dashboard, and operator-contract files currently have no
closed adapter: their presence yields `CONFIG_UNCOVERED` without opening them.
Do not delete real configuration to obtain `ready`. Extend/review its adapter
first. Balance/status caches are not acceptance evidence. Credentials, provider
authentication state, project work products, external services, and Pi's own
installation bytes are not attested. Pi/Node identity is version-scoped.

Flag projection preserves existing semantics: `PIDEX_ALLOW_ANTHROPIC` requires
`1`; the existing lifecycle-action seam treats **any supported nonempty value**,
including `0` and `false`, as truthy. This feature does not change that policy.

## Explicit acceptance

The APIs live in `scripts/runtime/{identity,config-observation,baseline,status}.mjs`.
Use `currentCandidate(roots, env)` and `previewDigest(candidate)` to obtain the
candidate fingerprint. Evidence must describe actual validation of that exact
candidate, not an earlier checkout or a search result containing `PASS`.

A candidate descriptor has exactly:

```text
{
  schema_version: 1,
  roots: { bootstrapRoot, runtimeRoot, stateRoot }, // absolute local paths
  accepted_scopes: [{ platform, arch, node_version, pi_version, mode }],
  evidence: [{
    kind: "validation", root, path, sha256, candidate_fingerprint,
    scope, exit_code, limitations
  }],
  rollback: { target_id, data_compatibility, evidence }
}
```

Each referenced UTF-8 JSON manifest contains exactly `schema_version: 1`,
`candidate_fingerprint`, `scope`, `commands`, and `limitations`; a rollback
manifest additionally contains `rollback: {target_id, data_compatibility}`.
Commands are `{command, exit_code}` records from real completed checks. Successful
acceptance requires zero exit codes, matching scope/fingerprint, a matching file
SHA-256 and explicit limitations. Do not include credentials or secret command
arguments. No log contents are embedded in baseline records.

```sh
node scripts/runtime/baseline.mjs preview --candidate /absolute/candidate.json
node scripts/runtime/baseline.mjs accept --candidate /absolute/candidate.json \
  --confirm <exact-preview-digest> --expected-selection <baseline-id-or-none>
```

Preview is read-only. Its digest includes source/configuration, scopes, evidence,
rollback and selection generation. Acceptance observes them again under the
selection lock. Confirmation is an operator attestation, not an independent
signature or permission to publish. Dirty or changed candidates are refused.

## Controlled start

After a separately authorized acceptance:

```sh
node scripts/runtime/start.mjs --baseline selected \
  --pidex-root /absolute/pidex --project "/absolute/project with spaces"
```

The executable `pi` must be on PATH. The record must accept the exact local
platform/architecture/Node/Pi versions and `host-direct`. Existing project trust
is a prerequisite, or the operator must answer Pi's trust prompt within the
startup timeout. The launcher **never grants project trust automatically**.

The launcher starts a fresh offline Pi process with one explicit PIDEX entry,
disables automatic extension/skill/template/theme discovery, and explicitly
loads this root's skills/prompts plus enabled module skill packages. A dedicated
inherited IPC channel binds launch ID, child PID, generation, command origins,
source/configuration and scope. Parent observations before/after loading and a
matching confirm/ack complete the contract. No disk receipt can grant assurance.

Handshake timeout is 15 seconds. Before dispatch is granted, failure terminates
only the owned unconfirmed child. Once a grant was sent, handshake uncertainty
must not kill potentially running work; the parent reports the error and retains
its child lifecycle until exit. Operator termination remains explicit. IPC is
retained until child exit: early disconnect caused unsettled close accounting in
a real Node/Pi probe. Reload/duplicate generations cannot reuse a grant.

The implemented adapter was exercised with real RPC and terminal starts on
Linux. Native Windows process, junction, rename/CAS and restart acceptance remain
open. Neither Linux fixtures nor a scope field authorizes Windows/container use.

## Store and rollback

State root precedence is `PIDEX_STATE_DIR`, `RUNNING_PI_STATE_DIR`, then
`<runtime-root>/state`. Baseline data lives only beneath `runtime-baselines/`:

- `records/<64-hex>.json`: immutable, content-addressed records.
- `selected.json`: `{schema_version: 1, id, generation}`.
- `.selection.lock/`: exclusively acquired, owner-checked write lock.

Writers use exclusive record creation, file fsync, same-directory atomic pointer
rename and directory fsync where supported. A crash can leave an unselected
record, temporary pointer or stale lock; readers never repair these. No stale
lock takeover is automatic. On a write error, inspect first: the pointer may
already have been atomically replaced. Windows directory-fsync limitations and
actual power-loss behavior are not hidden by an unconditional durability claim.

Rollback installs nothing. Separately restore the intended source/configuration
using the operator's approved integration procedure, then:

```sh
node scripts/runtime/baseline.mjs select --pidex-root /absolute/pidex \
  --id <target-id> --confirm <same-target-id> --expected-selection <current-id>
```

The current record must name that target and `compatible`. Its rollback evidence
must be `sha256:<digest>` referring to one of its candidate-bound validation
manifests, whose structured rollback claim names the same target. Those bytes
are rechecked before selection. `unknown`, a plain PASS label, a changed manifest,
or unsupported scope is not a safe rollback. Retain the referenced evidence.
No unrelated state is deleted or migrated. A fresh controlled start is still
required after selection; existing sessions stay pinned.

JSON diagnostics emit one JSON object. Exit codes: 0 diagnosis/operation success,
2 syntax, 3 refusal, 4 invalid data/I/O/start timeout, 5 selection/lock conflict.
A confirmed launcher mirrors its child's exit status. No force, automatic yes,
watcher, updater, global rebinding or persisted last-start authority is provided.
