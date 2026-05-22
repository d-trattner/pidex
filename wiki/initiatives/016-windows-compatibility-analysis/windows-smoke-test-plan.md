---
title: Windows Smoke Test Plan
type: test-plan
status: draft
created: 2026-05-22
updated: 2026-05-22
tags: [pidex, windows, smoke-test, validation, laptop]
---

# Windows Smoke Test Plan

## Purpose

Define a safe, repeatable checklist for later laptop validation on WSL2, Windows + Git Bash, and native PowerShell/CMD.

This plan does not claim Windows support. It gathers evidence for the compatibility matrix and future implementation planning.

## Safety rules

1. Prefer a disposable clone or branch.
2. Do not run global Git hook install tests on the real user profile until explicitly approved.
3. Do not run destructive uninstall tests unless the install path is disposable.
4. Capture command output to files where possible.
5. Keep Linux-owned files unchanged; test current behavior only.
6. Treat native PowerShell as audit-only unless a later Windows-owned wrapper exists.

## Test branch

Use the Windows initiative branch until merged:

```bash
git switch initiative-016-windows-milestone-a
```

If already merged, use the target merged branch and record the commit SHA.

Record:

```bash
git rev-parse --short HEAD
git status --short
```

Expected:

- commit is known
- working tree is clean before smoke unless intentionally testing local edits

## Evidence storage

Save outputs outside the PIDEX repo or under an untracked local folder. Do not commit machine-local evidence unless sanitized and explicitly requested.

Suggested local folder:

```text
~/pidex-windows-smoke/<environment>/<timestamp>/
```

Suggested files:

```text
audit.json
audit.txt
node-npm-python-git-pi.txt
public-check.txt
public-check-dirty-ok.txt
dashboard-typecheck.txt
dashboard-build.txt
pi-package-load.txt
pidex-command-smoke.md
notes.md
```

## Environment A — WSL2 smoke

### A0. Setup notes

Record:

```bash
uname -a
cat /etc/os-release 2>/dev/null || true
pwd
which bash node npm python3 git pi || true
node --version
npm --version
python3 --version
git --version
pi --version || true
```

### A1. Clone/checkout

Preferred path inside WSL:

```bash
git clone https://github.com/d-trattner/pidex.git ~/pidex
cd ~/pidex
git switch initiative-016-windows-milestone-a
```

If repo already exists:

```bash
cd ~/pidex
git fetch
git switch initiative-016-windows-milestone-a
git pull --ff-only
```

### A2. Read-only audit

```bash
cd ~/pidex
python3 scripts/compat/windows-audit.py | tee ~/pidex-windows-smoke/wsl2/audit.txt
python3 scripts/compat/windows-audit.py --json | tee ~/pidex-windows-smoke/wsl2/audit.json
python3 -m json.tool ~/pidex-windows-smoke/wsl2/audit.json >/dev/null
```

Expected:

- audit exits 0
- JSON is valid
- environment likely reports `wsl` or Linux-like markers
- findings do not indicate native PowerShell support

### A3. Linux-like validation gates

```bash
cd ~/pidex
npm run public:check | tee ~/pidex-windows-smoke/wsl2/public-check.txt
npm --prefix dashboard run typecheck | tee ~/pidex-windows-smoke/wsl2/dashboard-typecheck.txt
npm --prefix dashboard run build | tee ~/pidex-windows-smoke/wsl2/dashboard-build.txt
bash scripts/doctor.sh | tee ~/pidex-windows-smoke/wsl2/doctor.txt
python3 scripts/wiki/hygiene.py audit --project ~/pidex | tee ~/pidex-windows-smoke/wsl2/wiki-hygiene.txt
```

Expected:

- same expectations as Linux baseline, unless global Git hook is intentionally not installed
- any doctor hook warning/failure must be recorded as WSL2-specific evidence

### A4. Pi package load smoke

```bash
cd ~/pidex
pi -e "$PWD" --list-models __pidex_wsl_probe__ | tee ~/pidex-windows-smoke/wsl2/pi-package-load.txt
```

Expected:

- Pi starts and package load does not crash
- if provider auth/model listing fails for unrelated reasons, record stderr separately

### A5. Optional `/pidex` manual smoke

In Pi launched from WSL2, run:

```text
/reload
/pidex Smoke test only for PIDEX Windows initiative. Use ~/pidex as project. Do not edit files; confirm command discovery and pre-flight only.
```

Expected:

- `/pidex` command is available
- pre-flight starts
- no unexpected path corruption
- stop before delegating agents unless intentionally testing full pipeline

## Environment B — Windows + Git Bash smoke

### B0. Setup notes

Open Git Bash. Record:

```bash
uname -a
pwd
echo "HOME=$HOME"
echo "MSYSTEM=$MSYSTEM"
echo "MINGW_PREFIX=$MINGW_PREFIX"
which bash node npm python3 python git pi || true
node --version
npm --version
(python3 --version || python --version)
git --version
pi --version || true
```

### B1. Clone/checkout

Preferred Git Bash path:

```bash
git clone https://github.com/d-trattner/pidex.git ~/pidex
cd ~/pidex
git switch initiative-016-windows-milestone-a
```

If `~/pidex` is not appropriate, record the actual path and why.

### B2. Read-only audit

Try both interpreter names if available:

```bash
cd ~/pidex
python3 scripts/compat/windows-audit.py | tee ~/pidex-windows-smoke/git-bash/audit-python3.txt
python3 scripts/compat/windows-audit.py --json | tee ~/pidex-windows-smoke/git-bash/audit-python3.json
```

If `python3` is missing:

```bash
python scripts/compat/windows-audit.py | tee ~/pidex-windows-smoke/git-bash/audit-python.txt
python scripts/compat/windows-audit.py --json | tee ~/pidex-windows-smoke/git-bash/audit-python.json
```

Expected:

- audit exits 0 with at least one interpreter
- environment reports `windows-git-bash` or Git Bash markers if Python exposes them
- missing tools are listed as findings, not crashes

### B3. Non-mutating checks

Start with low-risk checks:

```bash
cd ~/pidex
bash -n install.sh uninstall.sh dashboard/start.sh scripts/release/public-readiness.sh scripts/doctor.sh scripts/smoke-test.sh
npm --prefix dashboard run typecheck | tee ~/pidex-windows-smoke/git-bash/dashboard-typecheck.txt
npm --prefix dashboard run build | tee ~/pidex-windows-smoke/git-bash/dashboard-build.txt
```

Expected:

- syntax check may pass under Git Bash
- dashboard typecheck/build may pass if dependencies install correctly
- failures should be captured, not worked around yet

### B4. Public/readiness gate cautiously

Run only after B2/B3 succeed:

```bash
cd ~/pidex
bash scripts/release/public-readiness.sh --dirty-ok --skip-check | tee ~/pidex-windows-smoke/git-bash/public-readiness-skip-check.txt
```

Expected:

- may pass or reveal path/package assumptions
- do not treat pass as full support

Only if dependencies and prior gates look safe:

```bash
npm run public:check | tee ~/pidex-windows-smoke/git-bash/public-check.txt
```

Expected:

- experimental; failures become evidence for future wrappers/docs

### B5. Pi package load smoke

```bash
cd ~/pidex
pi -e "$PWD" --list-models __pidex_git_bash_probe__ | tee ~/pidex-windows-smoke/git-bash/pi-package-load.txt
```

Expected:

- validates Pi package/resource load from Git Bash path
- does not prove pipeline support yet

### B6. Install dry-run only

```bash
cd ~/pidex
./install.sh --dry-run | tee ~/pidex-windows-smoke/git-bash/install-dry-run.txt
```

Expected:

- dry run prints `pi install ...`
- no install occurs
- path shape is recorded

Do not run `./install.sh` real install until explicitly approved after reviewing smoke evidence.

### B7. Optional `/pidex` manual smoke

Only if Pi package load/install is intentionally tested and reversible:

```text
/reload
/pidex Smoke test only. Do not edit files. Confirm pre-flight starts, then stop.
```

Expected:

- command discovery works
- pre-flight starts
- no path corruption

## One-line Windows bootstrap validation

`install.windows.ps1` is the Windows-owned native PowerShell bootstrap. It is additive and must not call Linux `install.sh`.

Target UX examples:

Convenient one-liner:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/master/install.windows.ps1 | iex
```

Branch-test one-liner:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/initiative-016-windows-milestone-a/install.windows.ps1 | iex
```

Safer inspect-first form:

```powershell
irm https://raw.githubusercontent.com/d-trattner/pidex/master/install.windows.ps1 -OutFile install.windows.ps1
notepad .\install.windows.ps1
powershell -ExecutionPolicy Bypass -File .\install.windows.ps1
```

Expected installer behavior:

- clone or verify `$HOME\pidex`
- check Git, Node, npm, Python/py, Pi, and Git Bash
- run `scripts/compat/windows-audit.py`
- install dashboard dependencies when missing
- run `pi install <pidex-root>` unless explicitly skipped
- skip global Git hook installation by default
- not call `install.sh`
- not modify Linux-owned runtime files

Dry-run / no-install validation:

```powershell
$env:PIDEX_INSTALL_DRY_RUN='1'; irm https://raw.githubusercontent.com/d-trattner/pidex/initiative-016-windows-milestone-a/install.windows.ps1 | iex
```

Skip Pi install while still checking clone/audit/deps:

```powershell
$env:PIDEX_SKIP_PI_INSTALL='1'; irm https://raw.githubusercontent.com/d-trattner/pidex/initiative-016-windows-milestone-a/install.windows.ps1 | iex
```

## Environment C — native PowerShell/CMD audit-only

### C0. Setup notes

PowerShell:

```powershell
$PSVersionTable
Get-Location
Get-Command node,npm,python,py,git,pi -ErrorAction SilentlyContinue
node --version
npm --version
python --version
python -c "import sys; print(sys.executable)"
git --version
pi --version
```

### C1. Clone/checkout

PowerShell example:

```powershell
git clone https://github.com/d-trattner/pidex.git $HOME\pidex
Set-Location $HOME\pidex
git switch initiative-016-windows-milestone-a
```

Record actual path. Paths with spaces are useful evidence but may expose additional risks.

### C2. Read-only audit only

```powershell
Set-Location $HOME\pidex
python scripts/compat/windows-audit.py
python scripts/compat/windows-audit.py --json | Out-File -Encoding utf8 $HOME\pidex-windows-smoke\powershell\audit.json
python -m json.tool $HOME\pidex-windows-smoke\powershell\audit.json > $null
```

If Python launcher is `py`:

```powershell
py scripts/compat/windows-audit.py --json
```

Expected:

- audit exits 0
- environment reports `windows-native`
- runtime support remains not claimed

### C3. Do not run Linux-owned scripts natively

Do **not** run these from native PowerShell/CMD as support evidence:

- `./install.sh`
- `./uninstall.sh`
- `dashboard/start.sh`
- `npm run public:check`
- `bash scripts/doctor.sh` unless explicitly testing a Bash environment
- global Git hook install/uninstall scripts

Native PowerShell remains audit-only until separate Windows-owned wrappers exist.

## Optional disposable Git hook test

Only after explicit approval. Use a throwaway Windows user/repo or disposable Git config scope if possible.

Goal: determine whether Git for Windows can execute PIDEX hook scripts and scanner, without modifying the real global Git config.

Potential safer direction:

```bash
mkdir -p /tmp/pidex-hook-smoke
cd /tmp/pidex-hook-smoke
git init
git config core.hooksPath ~/pidex/scripts/git-hooks/global
```

Then stage a fake token file and run commit/pre-commit behavior. Do not set `git config --global core.hooksPath` in this smoke unless explicitly approved.

## Pass/fail recording template

For each command, record:

```text
Environment:
Command:
Exit code:
Pass/fail:
Important stdout:
Important stderr:
Path observations:
Follow-up needed:
```

## Minimum evidence package before docs update

Before strengthening public docs, collect at least:

- WSL2 audit JSON
- Git Bash audit JSON
- PowerShell audit JSON
- dashboard typecheck/build results from WSL2 and/or Git Bash
- Pi package load result from WSL2 and/or Git Bash
- install dry-run result from Git Bash
- notes on Python command name (`python3`, `python`, or `py`)
- notes on `~/pidex` path behavior

## Stop conditions

Stop testing and report evidence if any of these happen:

- command attempts to modify global Git config unexpectedly
- install/uninstall would affect a non-disposable Pi setup unexpectedly
- path contains secrets or private data in generated output
- a command hangs on process cleanup
- dashboard leaves orphan processes that cannot be stopped easily
- Pi package load errors indicate extension execution failure

## Phase 5 conclusion criteria

This plan is complete when a user can later run WSL2/Git Bash/PowerShell checks and return enough evidence to decide whether docs can be strengthened or wrappers should be built.

## Navigation

- Initiative index: [[index]]
- Implementation plan: [[implementation-plan]]
- Phase 0 baseline: [[linux-feature-baseline]]
- Phase 1 Pi baseline: [[pi-windows-baseline]]
- Phase 2 entrypoint inventory: [[entrypoint-inventory]]
- Phase 3 static audit: [[static-portability-audit]]
- Phase 4 matrix: [[compatibility-matrix]]
