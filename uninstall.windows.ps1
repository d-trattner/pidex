# PIDEX Windows uninstall helper.
# Windows-owned additive entrypoint. Does not call uninstall.sh and does not manage Git hooks.
[CmdletBinding()]
param(
  [string]$PidexRoot = $(if ($env:PIDEX_ROOT) { $env:PIDEX_ROOT } else { Join-Path $HOME "pidex" }),
  [switch]$DryRun = $($env:PIDEX_UNINSTALL_DRY_RUN -in @("1", "true", "yes", "on")),
  [switch]$RemoveAstGrep = $($env:PIDEX_UNINSTALL_AST_GREP -in @("1", "true", "yes", "on")),
  [switch]$RemoveCheckout = $($env:PIDEX_UNINSTALL_REMOVE_CHECKOUT -in @("1", "true", "yes", "on"))
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
  $Global:PSNativeCommandUseErrorActionPreference = $false
}

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Warn([string]$Message) { Write-Host "!! $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "xx $Message" -ForegroundColor Red; exit 1 }
function Get-CommandPath([string[]]$Names) {
  foreach ($Name in $Names) {
    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($Command) { return $Command.Source }
  }
  return $null
}
function Require-Command([string[]]$Names, [string]$InstallHint) {
  $Path = Get-CommandPath $Names
  if (-not $Path) { Fail "Missing prerequisite: $($Names -join ' or '). $InstallHint" }
  return $Path
}
function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "Command failed with exit ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')" }
}

$PidexRoot = [System.IO.Path]::GetFullPath($PidexRoot)
$ExpectedRoot = [System.IO.Path]::GetFullPath((Join-Path $HOME "pidex"))

Write-Step "PIDEX Windows uninstall"
Write-Host "Root: $PidexRoot"

if ($PidexRoot -ne $ExpectedRoot) {
  Write-Warn "PIDEX v0.1 normally uses `$HOME\pidex: $ExpectedRoot"
  Write-Warn "Proceeding with explicit root: $PidexRoot"
}

$Pi = Require-Command @("pi") "Install Pi or remove PIDEX from Pi settings manually."
$Npm = Get-CommandPath @("npm")

if (Test-Path -LiteralPath $PidexRoot) {
  $PackageJson = Join-Path $PidexRoot "package.json"
  if ((Test-Path -LiteralPath $PackageJson) -and -not ((Get-Content -LiteralPath $PackageJson -Raw) -match '"name"\s*:\s*"pidex"')) {
    Fail "Target does not look like a PIDEX checkout: package.json name is not pidex"
  }
} else {
  Write-Warn "Checkout path does not exist; still attempting pi uninstall"
}

Write-Step "Removing PIDEX package from Pi settings"
if ($DryRun) {
  Write-Host "DRY-RUN: pi uninstall $PidexRoot"
} else {
  Invoke-Checked $Pi @("uninstall", $PidexRoot)
}

$AstGrepMarker = Join-Path $PidexRoot "state\skills\ast-grep-cli-installed-by-pidex"
if ($RemoveAstGrep) {
  if (-not $Npm) {
    Write-Warn "npm unavailable; cannot remove @ast-grep/cli"
  } elseif (Test-Path -LiteralPath $AstGrepMarker) {
    Write-Step "Removing PIDEX-installed ast-grep CLI (@ast-grep/cli)"
    if ($DryRun) {
      Write-Host "DRY-RUN: npm uninstall --global @ast-grep/cli"
    } else {
      & $Npm uninstall --global @ast-grep/cli
      if ($LASTEXITCODE -ne 0) { Write-Warn "npm uninstall @ast-grep/cli failed; leaving CLI in place" }
      Remove-Item -LiteralPath $AstGrepMarker -Force -ErrorAction SilentlyContinue
    }
  } else {
    Write-Step "Preserving ast-grep CLI (PIDEX install marker not found)"
  }
} else {
  Write-Step "Preserving ast-grep CLI by default"
  Write-Host "Use -RemoveAstGrep to remove it only when the PIDEX install marker exists."
}

if ($RemoveCheckout) {
  if (Test-Path -LiteralPath $PidexRoot) {
    Write-Step "Removing checkout directory"
    if ($DryRun) {
      Write-Host "DRY-RUN: Remove-Item -Recurse -Force $PidexRoot"
    } else {
      Remove-Item -LiteralPath $PidexRoot -Recurse -Force
    }
  } else {
    Write-Step "Checkout directory already absent"
  }
} else {
  Write-Step "Leaving checkout directory in place"
  Write-Host "Use -RemoveCheckout to delete: $PidexRoot"
}

Write-Step "Windows uninstall complete"
Write-Host "Run in Pi: /reload"
