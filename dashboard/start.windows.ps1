# PIDEX dashboard Windows launcher.
# Windows-owned additive entrypoint. Does not install services or Git hooks.
[CmdletBinding()]
param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 18777,
  [string]$Domain = "",
  [switch]$PublicRead,
  [switch]$PublicWrite,
  [switch]$NoBuild,
  [switch]$NoIngest,
  [switch]$Dev
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
  $Global:PSNativeCommandUseErrorActionPreference = $false
}

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Fail([string]$Message) { Write-Host "xx $Message" -ForegroundColor Red; exit 1 }
function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "Command failed with exit ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')" }
}
function Get-CommandPath([string[]]$Names) {
  foreach ($Name in $Names) {
    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($Command) { return $Command.Source }
  }
  return $null
}
function Read-DashboardDomain([string]$PidexRoot) {
  $Value = ""
  foreach ($Rel in @("config/dashboard.json", "config/dashboard.local.json")) {
    $Path = Join-Path $PidexRoot $Rel
    if (-not (Test-Path -LiteralPath $Path)) { continue }
    try {
      $Json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
      if ($Json.domain) { $Value = [string]$Json.domain }
    } catch {}
  }
  return $Value
}

$DashboardRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidexRoot = Split-Path -Parent $DashboardRoot
if (-not $Domain) { $Domain = Read-DashboardDomain $PidexRoot }

$Node = Get-CommandPath @("node")
$Npm = Get-CommandPath @("npm")
if (-not $Node) { Fail "Missing prerequisite: node" }
if (-not $Npm) { Fail "Missing prerequisite: npm" }

$NodeModules = Join-Path $DashboardRoot "node_modules"
if (-not (Test-Path -LiteralPath $NodeModules)) {
  $Lock = Join-Path $DashboardRoot "package-lock.json"
  $InstallCommand = if (Test-Path -LiteralPath $Lock) { "ci" } else { "install" }
  Write-Step "Installing dashboard dependencies (npm $InstallCommand)"
  Invoke-Checked $Npm @("--prefix", $DashboardRoot, $InstallCommand)
}

if (-not $NoIngest) {
  $IngestScript = Join-Path $PidexRoot "scripts/dashboard/ingest.mjs"
  if (Test-Path -LiteralPath $IngestScript) {
    Write-Step "Ingesting dashboard data"
    Invoke-Checked $Node @($IngestScript, "--db", (Join-Path $DashboardRoot "data/pidex.sqlite"), "--project", $PidexRoot)
  } else {
    Write-Step "Ingest script missing; skipping ingest"
  }
}

if (-not $Dev -and -not $NoBuild) {
  Write-Step "Building dashboard"
  Invoke-Checked $Npm @("--prefix", $DashboardRoot, "run", "build")
}

$env:PIDEX_DASHBOARD_ROOT = $DashboardRoot
$env:PIDEX_DASHBOARD_DB = Join-Path $DashboardRoot "data/pidex.sqlite"
$env:PIDEX_PROVIDER_LIMITS_PUBLIC_READ = if ($PublicRead) { "1" } else { "0" }
$env:PIDEX_PROVIDER_LIMITS_PUBLIC_WRITE = if ($PublicWrite) { "1" } else { "0" }
$env:PIDEX_DASHBOARD_PUBLIC_BIND = if ($HostName -in @("127.0.0.1", "localhost", "::1")) { "0" } else { "1" }

$Vite = Join-Path $DashboardRoot "node_modules/.bin/vite.cmd"
if (-not (Test-Path -LiteralPath $Vite)) { $Vite = Join-Path $DashboardRoot "node_modules/.bin/vite" }
if (-not (Test-Path -LiteralPath $Vite)) { Fail "Missing Vite binary. Run npm --prefix $DashboardRoot ci" }

Write-Step "Starting dashboard in foreground on ${HostName}:${Port}"
Write-Host "Local:  http://127.0.0.1:$Port/dashboard"
if ($HostName -eq "0.0.0.0" -and $Domain) { Write-Host "Domain: http://$Domain/dashboard" }

if ($Dev) {
  Invoke-Checked $Vite @("--host", $HostName, "--port", [string]$Port, "--strictPort")
} else {
  Invoke-Checked $Vite @("preview", "--host", $HostName, "--port", [string]$Port, "--strictPort")
}
