import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('./windows-alias-acceptance.ps1', import.meta.url), 'utf8');

test('Windows alias acceptance harness anchors checkout and confines explicit fixtures before mapping', () => {
  assert.match(script, /\$PSScriptRoot/);
  assert.match(script, /\$checkoutRoot/);
  assert.match(script, /Push-Location \$checkoutRoot/);
  assert.match(script, /function Test-SafeRelativeFixture/);
  assert.match(script, /ExistingRelativePath/);
  assert.match(script, /OutsideUncPath/);
  assert.match(script, /SiblingUncProjectRoot/);
  assert.match(script, /UnavailableRelativePath/);
  assert.match(script, /Test-Path -LiteralPath \$mappedExisting/);
  assert.match(script, /Test-Path -LiteralPath \$mappedUnavailable/);
  assert.match(script, /immutable SHA mismatch/);
  assert.match(script, /Get-PSDrive -Name \$DriveName/);
  assert.match(script, /New-PSDrive[\s\S]*\$createdDrive = \$true/);
  assert.match(script, /if \(\$createdDrive\) \{ Remove-PSDrive/);
});

test('Windows alias acceptance harness probes both aliases plus required negatives with redacted JSON-only output', () => {
  for (const token of ['outside decision', 'sibling decision', 'unavailable evidence decision', 'prospective alias decision', 'mapped_form', 'unc_form', 'existing_form', "[Console]::Error.WriteLine('Windows alias acceptance failed.')"]) assert.match(script, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(script, /\| node --experimental-strip-types --input-type=module 1>\$null 2>\$null/);
  assert.doesNotMatch(script, /Write-Host|Write-Output/);
  assert.doesNotMatch(script, /password|credential|token/i);
  assert.match(script, /ConvertTo-Json -Compress/);
});
