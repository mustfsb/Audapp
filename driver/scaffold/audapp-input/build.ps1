param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x64",
    [string]$SampleRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

function Get-VsInstallationPath {
    param(
        [string]$VsWherePath
    )

    $vs2022 = & $VsWherePath -latest -products * -version "[17.0,18.0)" -property installationPath
    if ($vs2022) {
        return $vs2022
    }

    return (& $VsWherePath -latest -products * -property installationPath)
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Join-Path $scriptRoot "project"
$targetRoot = Join-Path $projectRoot "upstream-audiocodec"
$solutionPath = Join-Path $targetRoot "AudioCodec.sln"

if ($SampleRoot) {
    & (Join-Path $scriptRoot "prepare.ps1") -SampleRoot $SampleRoot
}

if (-not (Test-Path -LiteralPath $solutionPath)) {
    Fail "Prepared sample files were not found. Run prepare.ps1 with -SampleRoot first."
}

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\\Installer\\vswhere.exe"
if (-not (Test-Path -LiteralPath $vswhere)) {
    Fail "vswhere.exe was not found. Visual Studio detection cannot continue."
}

$installationPath = Get-VsInstallationPath -VsWherePath $vswhere
if (-not $installationPath) {
    Fail "Visual Studio installation was not found by vswhere."
}

$vsDevCmd = Join-Path $installationPath "Common7\\Tools\\VsDevCmd.bat"
if (-not (Test-Path -LiteralPath $vsDevCmd)) {
    Fail "VsDevCmd.bat was not found at $vsDevCmd"
}

$wdkBuildRoot = "C:\Program Files (x86)\Windows Kits\10\build"
if (-not (Test-Path -LiteralPath $wdkBuildRoot)) {
    Fail "Windows Kits build tools were not found at $wdkBuildRoot"
}

$buildLogDir = Join-Path $projectRoot "build"
New-Item -ItemType Directory -Force -Path $buildLogDir | Out-Null
$binlogPath = Join-Path $buildLogDir "AudioCodec-$Configuration-$Platform.binlog"

$cmd = @(
    "`"$vsDevCmd`"",
    ">nul",
    "&&",
    "msbuild",
    "`"$solutionPath`"",
    "/m",
    "/restore",
    "/p:Configuration=$Configuration",
    "/p:Platform=$Platform",
    "/bl:`"$binlogPath`""
) -join " "

cmd.exe /c $cmd
if ($LASTEXITCODE -ne 0) {
    Fail "msbuild failed with exit code $LASTEXITCODE"
}

Write-Output "Compile-only build succeeded. Binlog: $binlogPath"
