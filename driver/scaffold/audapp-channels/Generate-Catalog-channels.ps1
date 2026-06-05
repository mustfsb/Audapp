param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x64",
    [string]$Inf2CatPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe",
    [string]$OsTarget = "10_VB_X64"
)

# Audapp Channels (Phase 21F) — generate AudappChannels.cat for the staged package.
# Non-elevated (Inf2Cat only writes a .cat file; no system/store changes).
# Retarget of Generate-Catalog-multi.ps1 for the AudappChannels / ROOT\Audapp* identity.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) { Write-Error $Message; exit 1 }

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stageDir = Join-Path $scriptRoot "package\$Configuration\$Platform"

if (-not (Test-Path -LiteralPath $stageDir)) {
    Fail "Staged package directory was not found at $stageDir. Run build-channels.ps1 first."
}

$sysPath = Join-Path $stageDir "AudappChannels.sys"
$infPath = Join-Path $stageDir "AudioChannels.inf"

if (-not (Test-Path -LiteralPath $sysPath)) { Fail "Expected staged driver binary was not found at $sysPath" }
if (-not (Test-Path -LiteralPath $infPath)) { Fail "Expected staged INF was not found at $infPath" }

$infText = Get-Content -LiteralPath $infPath -Raw
if ($infText -notmatch 'CatalogFile\s*=\s*AudappChannels\.cat') { Fail "Staged INF is missing expected catalog reference (CatalogFile=AudappChannels.cat)." }

# Directive-level identity guard (ignore ';' comment header lines).
$infDirectives = ((Get-Content -LiteralPath $infPath) | Where-Object { $_ -notmatch '^\s*;' }) -join "`n"
foreach ($hw in @('ROOT\\AudappGeneral', 'ROOT\\AudappMusic', 'ROOT\\AudappGame', 'ROOT\\AudappBrowser')) {
    if ($infDirectives -notmatch $hw) { Fail "Staged INF is missing expected hardware id ($hw)." }
}
if ($infDirectives -match 'ROOT\\AudappInput' -or $infDirectives -match 'ROOT\\AudappMulti') {
    Fail "SAFETY STOP: staged INF references a forbidden hardware id (AudappInput/AudappMulti). Aborting."
}
if ($infDirectives -match 'DeviceDesc\s*=\s*"Audapp Input"' -or $infDirectives -match 'DeviceDesc\s*=\s*"Audapp Multi"') {
    Fail "SAFETY STOP: staged INF references a forbidden DeviceDesc (Audapp Input/Audapp Multi). Aborting."
}

if (-not (Test-Path -LiteralPath $Inf2CatPath)) { Fail "Inf2Cat.exe was not found at $Inf2CatPath" }

Write-Output "Generating catalog with Inf2Cat..."
& $Inf2CatPath "/driver:`"$stageDir`"" "/os:$OsTarget" /uselocaltime /verbose
if ($LASTEXITCODE -ne 0) { Fail "Inf2Cat failed with exit code $LASTEXITCODE. Try a different -OsTarget (Inf2Cat /? for valid values)." }

$catPath = Join-Path $stageDir "AudappChannels.cat"
if (-not (Test-Path -LiteralPath $catPath)) { Fail "Inf2Cat reported success but AudappChannels.cat was not found at $catPath" }

Write-Output "Catalog generation succeeded."
Write-Output "  Catalog: $catPath"
Write-Output "  OsTarget: $OsTarget"
