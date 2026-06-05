param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x64",
    [string]$Inf2CatPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x86\Inf2Cat.exe",
    [string]$OsTarget = "10_VB_X64"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stageDir = Join-Path $scriptRoot "package\$Configuration\$Platform"

if (-not (Test-Path -LiteralPath $stageDir)) {
    Fail "Staged package directory was not found at $stageDir. Run build.ps1 first."
}

$sysPath = Join-Path $stageDir "AudioCodec.sys"
$infPath = Join-Path $stageDir "AudioCodec.inf"

if (-not (Test-Path -LiteralPath $sysPath)) {
    Fail "Expected staged driver binary was not found at $sysPath"
}

if (-not (Test-Path -LiteralPath $infPath)) {
    Fail "Expected staged INF was not found at $infPath"
}

$infText = Get-Content -LiteralPath $infPath -Raw
if ($infText -notmatch 'Audapp Input') {
    Fail "Staged INF is missing expected package display name (Audapp Input)."
}
if ($infText -notmatch 'ROOT\\AudappInput') {
    Fail "Staged INF is missing expected hardware ID (ROOT\AudappInput)."
}
if ($infText -notmatch 'CatalogFile\s*=\s*AudioCodec\.cat') {
    Fail "Staged INF is missing expected catalog file reference (CatalogFile=AudioCodec.cat)."
}

if (-not (Test-Path -LiteralPath $Inf2CatPath)) {
    Fail "Inf2Cat.exe was not found at $Inf2CatPath"
}

$driverArg = "/driver:`"$stageDir`""
$osArg = "/os:$OsTarget"

Write-Output "Generating catalog with Inf2Cat..."
Write-Output "  Inf2Cat: $Inf2CatPath"
Write-Output "  Package: $stageDir"
Write-Output "  OS target: $OsTarget"

& $Inf2CatPath $driverArg $osArg /uselocaltime /verbose
if ($LASTEXITCODE -ne 0) {
    Fail "Inf2Cat failed with exit code $LASTEXITCODE. Try a different -OsTarget (run Inf2Cat /? for valid values)."
}

$catPath = Join-Path $stageDir "AudioCodec.cat"
if (-not (Test-Path -LiteralPath $catPath)) {
    Fail "Inf2Cat reported success but AudioCodec.cat was not found at $catPath"
}

$manifestPath = Join-Path $stageDir "package-manifest.txt"
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw
    if ($manifest -notmatch "AudioCodec\.cat") {
        Add-Content -LiteralPath $manifestPath -Value "- AudioCodec.cat (generated $(Get-Date -Format o) via Generate-Catalog.ps1, OsTarget=$OsTarget)"
    }
}

Write-Output "Catalog generation succeeded."
Write-Output "  Catalog: $catPath"
Write-Output "  OsTarget: $OsTarget"
