# Bridge an existing Windows Git Credential Manager HTTPS credential into a PIDEX Project Pipeline container.
# Secrets are never printed; a temporary git-credentials file is deleted after copy unless -KeepTempSecret is set.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string]$ProjectId,
  [string]$RemoteUrl = "",
  [string]$PidexRoot = $(if ($env:PIDEX_ROOT) { $env:PIDEX_ROOT } else { Join-Path $HOME "pidex" }),
  [Alias("Host")]
  [string]$GitHost = "",
  [Alias("Path")]
  [string]$RepoPath = "",
  [switch]$KeepTempSecret
)

$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host "xx $Message" -ForegroundColor Red
  exit 1
}

function Require-CommandPath([string]$Name, [string]$Hint) {
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $Command) { Fail "Missing prerequisite: $Name. $Hint" }
  return $Command.Source
}

function ConvertTo-CredentialQuery([string]$Url, [string]$ExplicitHost, [string]$ExplicitPath) {
  if ($ExplicitHost) {
    return @{ Protocol = "https"; Host = $ExplicitHost; Path = $ExplicitPath.TrimStart('/') }
  }
  if (-not $Url) { Fail "Provide -RemoteUrl or -Host [-Path]." }
  $Uri = [Uri]$Url
  if ($Uri.Scheme -ne "https") { Fail "Only HTTPS remotes are supported by the Windows GCM bridge. Remote scheme: $($Uri.Scheme)" }
  return @{ Protocol = $Uri.Scheme; Host = $Uri.Host; Path = $Uri.AbsolutePath.TrimStart('/') }
}

function Escape-GitCredentialPart([string]$Value) {
  return [Uri]::EscapeDataString($Value)
}

$Git = Require-CommandPath "git" "Install Git for Windows and sign in via Git Credential Manager."
$Node = Require-CommandPath "node" "Install Node.js."
$PidexRoot = [System.IO.Path]::GetFullPath($PidexRoot)
$CredentialsScript = Join-Path $PidexRoot "modules\pidex\project-pipeline\scripts\project-pipeline\credentials.mjs"
if (-not (Test-Path -LiteralPath $CredentialsScript -PathType Leaf)) { Fail "PIDEX credentials helper not found: $CredentialsScript" }

$Query = ConvertTo-CredentialQuery $RemoteUrl $GitHost $RepoPath
$InputText = "protocol=$($Query.Protocol)`nhost=$($Query.Host)`n"
if ($Query.Path) { $InputText += "path=$($Query.Path)`n" }
$InputText += "`n"

Write-Host "==> Requesting credential from Windows Git Credential Manager for $($Query.Host)" -ForegroundColor Cyan
$Filled = $InputText | & $Git credential fill
if ($LASTEXITCODE -ne 0) { Fail "git credential fill failed. Sign in with Git Credential Manager, then retry." }

$Map = @{}
foreach ($Line in ($Filled -split "`r?`n")) {
  if ($Line -match "^([^=]+)=(.*)$") { $Map[$Matches[1]] = $Matches[2] }
}
if (-not $Map.ContainsKey("username") -or -not $Map.ContainsKey("password")) {
  Fail "Git Credential Manager did not return username/password for $($Query.Host)."
}

$SecretDir = Join-Path $PidexRoot "state\secrets\git"
New-Item -ItemType Directory -Force -Path $SecretDir | Out-Null
$TempSecret = Join-Path $SecretDir "$ProjectId.$($Query.Host).git-credentials"
$CredentialUrl = "$($Query.Protocol)://$(Escape-GitCredentialPart $Map['username']):$(Escape-GitCredentialPart $Map['password'])@$($Query.Host)"
Set-Content -LiteralPath $TempSecret -Value ($CredentialUrl + "`n") -NoNewline

try {
  Write-Host "==> Copying credential into Project Pipeline secrets volume" -ForegroundColor Cyan
  & $Node $CredentialsScript copy-git --pidex-root $PidexRoot --project-id $ProjectId --git-credentials $TempSecret --acknowledge-trusted-persistent-container --json | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "PIDEX credential copy failed." }
  Write-Host "OK: Git credentials configured for Project Pipeline project $ProjectId (secret value not printed)." -ForegroundColor Green
} finally {
  if (-not $KeepTempSecret -and (Test-Path -LiteralPath $TempSecret)) {
    Remove-Item -LiteralPath $TempSecret -Force
  }
}
