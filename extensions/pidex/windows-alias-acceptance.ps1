[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\\\\[^\\]+\\[^\\]+')][string]$UncProjectRoot,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Za-z]$')][string]$DriveName,
  [Parameter(Mandatory = $true)][string]$ExistingRelativePath,
  [Parameter(Mandatory = $true)][ValidatePattern('^\\\\[^\\]+\\[^\\]+')][string]$OutsideUncPath,
  [Parameter(Mandatory = $true)][ValidatePattern('^\\\\[^\\]+\\[^\\]+')][string]$SiblingUncProjectRoot,
  [Parameter(Mandatory = $true)][string]$UnavailableRelativePath,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedSha
)

$ErrorActionPreference = 'Stop'
$createdDrive = $false
$pushedLocation = $false
$failed = $false

function Test-SafeRelativeFixture([string]$Value) {
  return -not [string]::IsNullOrWhiteSpace($Value) -and
    -not [IO.Path]::IsPathRooted($Value) -and
    $Value -notmatch '(^|[\\/])\.\.?([\\/]|$)|[:\x00]'
}

function Test-UnderRoot([string]$Root, [string]$Candidate) {
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\\', '/') + '\\'
  $candidateFull = [IO.Path]::GetFullPath($Candidate)
  return $candidateFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)
}

try {
  $checkoutRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  Push-Location $checkoutRoot
  $pushedLocation = $true
  $actualSha = (git rev-parse HEAD 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or $actualSha -ne $ExpectedSha) { throw 'immutable SHA mismatch' }
  if (-not (Test-SafeRelativeFixture $ExistingRelativePath) -or -not (Test-SafeRelativeFixture $UnavailableRelativePath)) { throw 'unsafe fixture' }
  if (-not (Test-Path -LiteralPath $UncProjectRoot) -or -not (Test-Path -LiteralPath $OutsideUncPath) -or -not (Test-Path -LiteralPath $SiblingUncProjectRoot)) { throw 'missing fixture' }
  if (Test-UnderRoot $UncProjectRoot $OutsideUncPath -or Test-UnderRoot $UncProjectRoot $SiblingUncProjectRoot) { throw 'unconfined fixture' }
  if (Get-PSDrive -Name $DriveName -ErrorAction SilentlyContinue) { throw 'occupied drive' }
  New-PSDrive -Name $DriveName -PSProvider FileSystem -Root $UncProjectRoot -Persist -Scope Global | Out-Null
  $createdDrive = $true

  $mappedRoot = "${DriveName}:\\"
  $mappedExisting = Join-Path $mappedRoot $ExistingRelativePath
  $mappedUnavailable = Join-Path $mappedRoot $UnavailableRelativePath
  $uncExisting = Join-Path $UncProjectRoot $ExistingRelativePath
  $siblingExisting = Join-Path $SiblingUncProjectRoot $ExistingRelativePath
  if (-not (Test-Path -LiteralPath $mappedExisting) -or -not (Test-Path -LiteralPath $uncExisting) -or -not (Test-Path -LiteralPath $siblingExisting)) { throw 'missing fixture' }
  if (Test-Path -LiteralPath $mappedUnavailable -or Test-Path -LiteralPath (Join-Path $UncProjectRoot $UnavailableRelativePath)) { throw 'unavailable fixture exists' }
  if (-not (Test-UnderRoot $mappedRoot $mappedExisting) -or -not (Test-UnderRoot $UncProjectRoot $uncExisting)) { throw 'unconfined fixture' }

  $env:PIDEX_WINDOWS_ALIAS_ROOT = $mappedRoot
  $env:PIDEX_WINDOWS_ALIAS_UNC_ROOT = $UncProjectRoot
  $env:PIDEX_WINDOWS_ALIAS_EXISTING = $ExistingRelativePath
  $env:PIDEX_WINDOWS_ALIAS_OUTSIDE = $OutsideUncPath
  $env:PIDEX_WINDOWS_ALIAS_SIBLING = $siblingExisting
  $env:PIDEX_WINDOWS_ALIAS_UNAVAILABLE = $mappedUnavailable
  $probe = @'
import assert from 'node:assert/strict';
import { inspectProjectBoundaryToolCall } from './extensions/pidex/index.ts';
const mappedRoot = process.env.PIDEX_WINDOWS_ALIAS_ROOT;
const uncRoot = process.env.PIDEX_WINDOWS_ALIAS_UNC_ROOT;
const existing = process.env.PIDEX_WINDOWS_ALIAS_EXISTING;
const outside = process.env.PIDEX_WINDOWS_ALIAS_OUTSIDE;
const sibling = process.env.PIDEX_WINDOWS_ALIAS_SIBLING;
const unavailable = process.env.PIDEX_WINDOWS_ALIAS_UNAVAILABLE;
const mappedExisting = `${mappedRoot}\\${existing}`;
const uncExisting = `${uncRoot}\\${existing}`;
const mustBlock = (target, cwd, label) => assert.equal(inspectProjectBoundaryToolCall({ toolName: 'read', input: { path: target } }, { cwd })?.block, true, label);
for (const [projectRoot, cwd, target] of [[mappedRoot, mappedRoot, uncExisting], [uncRoot, uncRoot, mappedExisting]]) {
  process.env.PIDEX_PROJECT_BOUNDARY_CONTEXT = JSON.stringify({ active: true, projectRoot, pidexRoot: projectRoot, startedCwd: cwd });
  for (const toolName of ['read', 'edit', 'write']) assert.equal(inspectProjectBoundaryToolCall({ toolName, input: { path: target } }, { cwd }), undefined, `${toolName} alias decision`);
  assert.equal(inspectProjectBoundaryToolCall({ toolName: 'write', input: { path: `${target}.pidex-alias-prospective\\child` } }, { cwd }), undefined, 'prospective alias decision');
  mustBlock(outside, cwd, 'outside decision');
  mustBlock(sibling, cwd, 'sibling decision');
  mustBlock(unavailable, cwd, 'unavailable evidence decision');
}
'@
  $probe | node --experimental-strip-types --input-type=module 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'structured tool probe failed' }
  [pscustomobject]@{ sha = $actualSha; mapped_form = 'drive'; unc_form = 'unc'; existing_form = 'relative'; result = 'pass' } | ConvertTo-Json -Compress
} catch {
  $failed = $true
} finally {
  Remove-Item Env:PIDEX_WINDOWS_ALIAS_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:PIDEX_WINDOWS_ALIAS_UNC_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:PIDEX_WINDOWS_ALIAS_EXISTING -ErrorAction SilentlyContinue
  Remove-Item Env:PIDEX_WINDOWS_ALIAS_OUTSIDE -ErrorAction SilentlyContinue
  Remove-Item Env:PIDEX_WINDOWS_ALIAS_SIBLING -ErrorAction SilentlyContinue
  Remove-Item Env:PIDEX_WINDOWS_ALIAS_UNAVAILABLE -ErrorAction SilentlyContinue
  if ($createdDrive) { Remove-PSDrive -Name $DriveName -Force -ErrorAction SilentlyContinue }
  if ($pushedLocation) { Pop-Location }
}
if ($failed) {
  [Console]::Error.WriteLine('Windows alias acceptance failed.')
  exit 1
}
