param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x64",
    [string]$Inf2CatPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe",
    [string]$OsTarget = "10_VB_X64"
)

# Audapp Multi (Phase 21C) — generate AudioMulti.cat for the staged package.
# Non-elevated (Inf2Cat only writes a .cat file; no system/store changes).
# Retarget of Generate-Catalog.ps1 for the AudioMulti / ROOT\AudappMulti identity.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) { Write-Error $Message; exit 1 }

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stageDir = Join-Path $scriptRoot "package\$Configuration\$Platform"

if (-not (Test-Path -LiteralPath $stageDir)) {
    Fail "Staged package directory was not found at $stageDir. Run build-multi.ps1 first."
}

$sysPath = Join-Path $stageDir "AudioMulti.sys"
$infPath = Join-Path $stageDir "AudioMulti.inf"

if (-not (Test-Path -LiteralPath $sysPath)) { Fail "Expected staged driver binary was not found at $sysPath" }
if (-not (Test-Path -LiteralPath $infPath)) { Fail "Expected staged INF was not found at $infPath" }

$infText = Get-Content -LiteralPath $infPath -Raw
if ($infText -notmatch 'Audapp Multi')          { Fail "Staged INF is missing expected package display name (Audapp Multi)." }
if ($infText -notmatch 'ROOT\\AudappMulti')      { Fail "Staged INF is missing expected hardware ID (ROOT\AudappMulti)." }
if ($infText -notmatch 'CatalogFile\s*=\s*AudioMulti\.cat') { Fail "Staged INF is missing expected catalog reference (CatalogFile=AudioMulti.cat)." }
# Safety: never let the multi package overlap the live Audapp Input identity.
# Evaluate only directive lines (strip ';' comment lines) so descriptive header
# comments that mention "Audapp Input" do not trip a false positive.
$infDirectives = ((Get-Content -LiteralPath $infPath) | Where-Object { $_ -notmatch '^\s*;' }) -join "`n"
if ($infDirectives -match 'ROOT\\AudappInput' -or $infDirectives -match 'DeviceDesc\s*=\s*"Audapp Input"') {
    Fail "SAFETY STOP: staged INF has a directive referencing the live Audapp Input identity. Aborting."
}

if (-not (Test-Path -LiteralPath $Inf2CatPath)) { Fail "Inf2Cat.exe was not found at $Inf2CatPath" }

Write-Output "Generating catalog with Inf2Cat..."
& $Inf2CatPath "/driver:`"$stageDir`"" "/os:$OsTarget" /uselocaltime /verbose
if ($LASTEXITCODE -ne 0) { Fail "Inf2Cat failed with exit code $LASTEXITCODE. Try a different -OsTarget (Inf2Cat /? for valid values)." }

$catPath = Join-Path $stageDir "AudioMulti.cat"
if (-not (Test-Path -LiteralPath $catPath)) { Fail "Inf2Cat reported success but AudioMulti.cat was not found at $catPath" }

Write-Output "Catalog generation succeeded."
Write-Output "  Catalog: $catPath"
Write-Output "  OsTarget: $OsTarget"
