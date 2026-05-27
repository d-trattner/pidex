# PIDEX Windows bootstrap installer.
# Windows-owned additive entrypoint. Does not call install.sh and does not install Git hooks.
[CmdletBinding()]
param(
  [string]$RepoUrl = $(if ($env:PIDEX_REPO_URL) { $env:PIDEX_REPO_URL } else { "https://github.com/d-trattner/pidex.git" }),
  [string]$Branch = $(if ($env:PIDEX_INSTALL_BRANCH) { $env:PIDEX_INSTALL_BRANCH } else { "" }),
  [string]$PidexRoot = $(if ($env:PIDEX_ROOT) { $env:PIDEX_ROOT } else { Join-Path $HOME "pidex" }),
  [switch]$DryRun = $($env:PIDEX_INSTALL_DRY_RUN -in @("1", "true", "yes", "on")),
  [switch]$SkipDashboardDeps = $($env:PIDEX_SKIP_DASHBOARD_DEPS -in @("1", "true", "yes", "on")),
  [switch]$SkipPiInstall = $($env:PIDEX_SKIP_PI_INSTALL -in @("1", "true", "yes", "on"))
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
  $Global:PSNativeCommandUseErrorActionPreference = $false
}

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Warn([string]$Message) {
  Write-Host "!! $Message" -ForegroundColor Yellow
}

function Fail([string]$Message) {
  Write-Host "xx $Message" -ForegroundColor Red
  exit 1
}

function Get-CommandPath([string[]]$Names) {
  foreach ($Name in $Names) {
    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($Command) { return $Command.Source }
  }
  return $null
}

function Require-Command([string[]]$Names, [string]$InstallHint) {
  $Path = Get-CommandPath $Names
  if (-not $Path) {
    Fail "Missing prerequisite: $($Names -join ' or '). $InstallHint"
  }
  return $Path
}

function Find-GitBash {
  $Candidates = @()
  if ($env:ProgramFiles) { $Candidates += Join-Path $env:ProgramFiles "Git\bin\bash.exe" }
  $ProgramFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
  if ($ProgramFilesX86) { $Candidates += Join-Path $ProgramFilesX86 "Git\bin\bash.exe" }
  foreach ($Candidate in $Candidates) {
    if (Test-Path -LiteralPath $Candidate) { return $Candidate }
  }
  $Bash = Get-CommandPath @("bash.exe", "bash")
  if ($Bash) { return $Bash }
  return $null
}

function Get-PythonCommand {
  $Python = Get-CommandPath @("python", "python3")
  if ($Python) { return @{ Command = $Python; Prefix = @() } }
  $Py = Get-CommandPath @("py")
  if ($Py) { return @{ Command = $Py; Prefix = @("-3") } }
  return $null
}

function Assert-NodeVersion([string]$NodePath) {
  $VersionText = (& $NodePath --version).Trim().TrimStart('v')
  $Parts = $VersionText.Split('.')
  if ($Parts.Length -lt 2) { Fail "Could not parse Node version: $VersionText" }
  $Major = [int]$Parts[0]
  $Minor = [int]$Parts[1]
  if (($Major -lt 22) -or (($Major -eq 22) -and ($Minor -lt 12))) {
    Fail "PIDEX Windows bootstrap requires Node >=22.12.0. Current Node is v$VersionText. Install/switch Node 22.12+ and reinstall Pi with: npm install -g @earendil-works/pi-coding-agent"
  }
  return "v$VersionText"
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "Command failed with exit ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

function Invoke-PythonScript([hashtable]$Python, [string[]]$Arguments) {
  $AllArgs = @($Python.Prefix) + $Arguments
  Invoke-Checked $Python.Command $AllArgs
}

$PidexRoot = [System.IO.Path]::GetFullPath($PidexRoot)
$ExpectedRoot = [System.IO.Path]::GetFullPath((Join-Path $HOME "pidex"))

Write-Step "PIDEX Windows bootstrap"
Write-Host "Repo:   $RepoUrl"
Write-Host "Branch: $(if ($Branch) { $Branch } else { '<default>' })"
Write-Host "Root:   $PidexRoot"

if ($PidexRoot -ne $ExpectedRoot) {
  Fail "PIDEX v0.1 Windows bootstrap expects `$HOME\pidex: $ExpectedRoot (got $PidexRoot). Set PIDEX_ROOT only for explicit experiments."
}

$Git = Require-Command @("git") "Install Git for Windows: https://git-scm.com/download/win"
$Node = Require-Command @("node") "Install Node.js LTS: https://nodejs.org/"
$Npm = Require-Command @("npm") "Install Node.js/npm: https://nodejs.org/"
$Pi = Require-Command @("pi") "Install Pi first: npm install -g @earendil-works/pi-coding-agent"
$Python = Get-PythonCommand
$GitBash = Find-GitBash
if (-not $GitBash) {
  Fail "Missing Bash required by Pi on Windows. Install Git for Windows: https://git-scm.com/download/win"
}
$NodeVersion = Assert-NodeVersion $Node

Write-Step "Prerequisites found"
Write-Host "git:    $Git"
Write-Host "node:   $Node ($NodeVersion)"
Write-Host "npm:    $Npm"
if ($Python) {
  Write-Host "python: $($Python.Command) $($Python.Prefix -join ' ')"
} else {
  Write-Host "python: <optional; not found>"
}
Write-Host "pi:     $Pi"
Write-Host "bash:   $GitBash"

$GitBashDir = Split-Path -Parent $GitBash
$PathParts = @($env:Path -split ';' | Where-Object { $_ })
$GitBashOnPath = $PathParts | Where-Object { $_ -ieq $GitBashDir } | Select-Object -First 1
if (-not $GitBashOnPath) {
  $env:Path = "$GitBashDir;$env:Path"
  Write-Step "Added Git Bash to PATH for this installer session"
  Write-Host "bash PATH entry: $GitBashDir"
}

if (-not (Test-Path -LiteralPath $PidexRoot)) {
  Write-Step "Cloning PIDEX into $PidexRoot"
  if ($DryRun) {
    Write-Host "DRY-RUN: git clone $RepoUrl $PidexRoot"
  } else {
    Invoke-Checked $Git @("clone", $RepoUrl, $PidexRoot)
  }
} else {
  Write-Step "PIDEX root already exists"
}

if (-not $DryRun) {
  if (-not (Test-Path -LiteralPath (Join-Path $PidexRoot ".git"))) {
    Fail "Existing path is not a Git checkout: $PidexRoot"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $PidexRoot "package.json"))) {
    Fail "Existing path does not look like PIDEX: missing package.json"
  }
}

if ($Branch) {
  Write-Step "Checking out branch $Branch"
  if ($DryRun) {
    Write-Host "DRY-RUN: git -C $PidexRoot fetch origin $Branch"
    Write-Host "DRY-RUN: git -C $PidexRoot switch $Branch"
  } else {
    Invoke-Checked $Git @("-C", $PidexRoot, "fetch", "origin", $Branch)
    $LocalBranchExists = $false
    & $Git -C $PidexRoot rev-parse --verify $Branch *> $null
    if ($LASTEXITCODE -eq 0) { $LocalBranchExists = $true }
    if ($LocalBranchExists) {
      Invoke-Checked $Git @("-C", $PidexRoot, "switch", $Branch)
      Invoke-Checked $Git @("-C", $PidexRoot, "pull", "--ff-only")
    } else {
      Invoke-Checked $Git @("-C", $PidexRoot, "switch", "-c", $Branch, "--track", "origin/$Branch")
    }
  }
}

$AuditScript = Join-Path $PidexRoot "scripts\compat\windows-audit.mjs"
if (-not $DryRun -and -not (Test-Path -LiteralPath $AuditScript)) {
  Fail "Missing audit script: $AuditScript"
}

Write-Step "Running read-only Windows audit"
if ($DryRun) {
  Write-Host "DRY-RUN: node scripts/compat/windows-audit.mjs"
} else {
  Push-Location $PidexRoot
  try {
    Invoke-Checked $Node @($AuditScript)
  } finally {
    Pop-Location
  }
}

$DashboardDir = Join-Path $PidexRoot "dashboard"
$DashboardNodeModules = Join-Path $DashboardDir "node_modules"
if (-not $SkipDashboardDeps -and -not (Test-Path -LiteralPath $DashboardNodeModules)) {
  Write-Step "Installing dashboard dependencies"
  $DashboardLock = Join-Path $DashboardDir "package-lock.json"
  $NpmInstallCommand = if (Test-Path -LiteralPath $DashboardLock) { "ci" } else { "install" }
  if ($DryRun) {
    Write-Host "DRY-RUN: npm --prefix $DashboardDir $NpmInstallCommand"
  } else {
    Invoke-Checked $Npm @("--prefix", $DashboardDir, $NpmInstallCommand)
  }
} elseif ($SkipDashboardDeps) {
  Write-Step "Skipping dashboard dependency install"
} else {
  Write-Step "Dashboard dependencies already present"
}

Write-Step "Installing PIDEX package into Pi settings"
if ($SkipPiInstall) {
  Write-Warn "Skipping pi install because SkipPiInstall/PIDEX_SKIP_PI_INSTALL is set"
} elseif ($DryRun) {
  Write-Host "DRY-RUN: pi install $PidexRoot"
} else {
  Invoke-Checked $Pi @("install", $PidexRoot)
}

Write-Step "Windows bootstrap complete"
Write-Host ""
Write-Host "Global Git hooks were intentionally not installed on Windows."
Write-Host "Next steps:"
Write-Host "  1. Open Pi and run: /reload"
Write-Host "  2. Try: /pidex <your task>"
Write-Host "  3. For this PowerShell session, expose Git Bash before npm checks:"
Write-Host "     `$env:Path = `"$GitBashDir;`$env:Path`""
Write-Host "  4. Run checks: npm run public:check; npm --prefix dashboard run typecheck; npm --prefix dashboard run build"
