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

    $vs18 = & $VsWherePath -latest -products * -version "[18.0,19.0)" -property installationPath
    if ($vs18) {
        return $vs18
    }

    return (& $VsWherePath -latest -products * -property installationPath)
}

function Get-WdkBuildVersion {
    param(
        [string]$WdkBuildRoot
    )

    $versions = @(Get-ChildItem -LiteralPath $WdkBuildRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
        Sort-Object { [version]$_.Name } -Descending)

    if ($versions.Count -eq 0) {
        return $null
    }

    return $versions[0].Name
}

function Get-WdkTaskVersion {
    param(
        [string]$WdkBuildRoot,
        [string]$ResolvedWdkVersion
    )

    $binRoot = Join-Path $WdkBuildRoot "$ResolvedWdkVersion\\bin"
    $taskDll = Get-ChildItem -LiteralPath $binRoot -Filter 'Microsoft.DriverKit.Build.Tasks.*.dll' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^Microsoft\.DriverKit\.Build\.Tasks\.(\d+\.\d+)\.dll$' } |
        Sort-Object {
            if ($_.Name -match '^Microsoft\.DriverKit\.Build\.Tasks\.(\d+\.\d+)\.dll$') {
                [version]$matches[1]
            }
        } -Descending |
        Select-Object -First 1

    if (-not $taskDll) {
        return $null
    }

    if ($taskDll.Name -match '^Microsoft\.DriverKit\.Build\.Tasks\.(\d+\.\d+)\.dll$') {
        return $matches[1]
    }

    return $null
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

$applyIdentityScript = Join-Path $scriptRoot "Apply-PackageIdentity.ps1"
if (-not (Test-Path -LiteralPath $applyIdentityScript)) {
    Fail "Apply-PackageIdentity.ps1 was not found at $applyIdentityScript"
}

& $applyIdentityScript

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

$wdkVersion = Get-WdkBuildVersion -WdkBuildRoot $wdkBuildRoot
if (-not $wdkVersion) {
    Fail "No WDK build version directories were found under $wdkBuildRoot"
}

$visualStudioVersion = Get-WdkTaskVersion -WdkBuildRoot $wdkBuildRoot -ResolvedWdkVersion $wdkVersion
if (-not $visualStudioVersion) {
    Fail "No Microsoft.DriverKit.Build.Tasks.*.dll file was found under $wdkBuildRoot\\$wdkVersion\\bin"
}

$msbuildPath = Join-Path $installationPath "MSBuild\\Current\\Bin\\amd64\\MSBuild.exe"
if (-not (Test-Path -LiteralPath $msbuildPath)) {
    Fail "MSBuild.exe was not found at $msbuildPath"
}

$buildLogDir = Join-Path $projectRoot "build"
New-Item -ItemType Directory -Force -Path $buildLogDir | Out-Null
$binlogPath = Join-Path $buildLogDir "AudioCodec-$Configuration-$Platform.binlog"
$cmdPath = Join-Path $buildLogDir "invoke-msbuild.cmd"

$cmdLines = @(
    '@echo off',
    "call `"$vsDevCmd`" >nul",
    "cd /d `"$scriptRoot`"",
    "`"$msbuildPath`" `"$solutionPath`" /m /restore /p:Configuration=$Configuration /p:Platform=$Platform /p:VisualStudioVersion=$visualStudioVersion /p:WindowsTargetPlatformVersion=$wdkVersion /p:SignMode=Off /p:DriverPackage=False /p:SupportsPackaging=false /bl:`"$binlogPath`""
)

Set-Content -LiteralPath $cmdPath -Value $cmdLines -Encoding ascii
cmd.exe /c "`"$cmdPath`""
if ($LASTEXITCODE -ne 0) {
    Fail "msbuild failed with exit code $LASTEXITCODE"
}

$buildOutputDir = Join-Path $targetRoot "$Platform\$Configuration"
$sysPath = Join-Path $buildOutputDir "AudioCodec.sys"
$infPath = Join-Path $buildOutputDir "AudioCodec.inf"

if (-not (Test-Path -LiteralPath $sysPath)) {
    Fail "Expected driver binary was not found at $sysPath"
}

if (-not (Test-Path -LiteralPath $infPath)) {
    Fail "Expected stamped INF was not found at $infPath"
}

$stageDir = Join-Path $scriptRoot "package\$Configuration\$Platform"
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Copy-Item -LiteralPath $sysPath -Destination (Join-Path $stageDir "AudioCodec.sys") -Force
Copy-Item -LiteralPath $infPath -Destination (Join-Path $stageDir "AudioCodec.inf") -Force

$manifestPath = Join-Path $stageDir "package-manifest.txt"
$manifest = @(
    "Audapp Input driver package (compile-only stage)",
    "Timestamp: $(Get-Date -Format o)",
    "Configuration: $Configuration",
    "Platform: $Platform",
    "SourceBuildOutput: $buildOutputDir",
    "PackageDisplayName: Audapp Input",
    "HardwareId: ROOT\AudappInput",
    "Artifacts:",
    "- AudioCodec.sys",
    "- AudioCodec.inf",
    "Catalog:",
    "- Run Generate-Catalog.ps1 to produce AudioCodec.cat (unsigned)"
)
Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding ascii

Write-Output "Compile-only build succeeded. Binlog: $binlogPath"
Write-Output "Staged package: $stageDir"
