param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x64"
)

# Audapp Channels (Phase 21F) compile-only build.
#
# Builds the experimental separate-root multi-endpoint driver into
# AudappChannels.sys and stages AudappChannels.sys + AudioChannels.inf under
# package\<Configuration>\<Platform>.
#
# COMPILE-ONLY. Does NOT install, load, sign-for-install, run devgen/pnputil/
# devcon, or touch the live driver store. Uses the final AudioChannels INF
# directly (no Apply-PackageIdentity patching).

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

# Identity guard: the separate-root package must never reference the live
# Audapp Input identity or the earlier single-devnode AudioMulti identity.
# Evaluate directive lines only (strip ';' comments) so the descriptive header
# (which names those packages) does not trip a false positive.
function Assert-ChannelsIdentity([string]$InfPath) {
    if (-not (Test-Path -LiteralPath $InfPath)) { Fail "INF not found for identity guard: $InfPath" }
    $directives = ((Get-Content -LiteralPath $InfPath) | Where-Object { $_ -notmatch '^\s*;' }) -join "`n"
    foreach ($bad in @('ROOT\\AudappInput', 'ROOT\\AudappMulti')) {
        if ($directives -match $bad) { Fail "SAFETY STOP: AudioChannels.inf directive references forbidden hardware id ($bad)." }
    }
    if ($directives -match 'DeviceDesc\s*=\s*"Audapp Input"') { Fail "SAFETY STOP: AudioChannels.inf references the live 'Audapp Input' DeviceDesc." }
    if ($directives -match 'DeviceDesc\s*=\s*"Audapp Multi"') { Fail "SAFETY STOP: AudioChannels.inf references the 'Audapp Multi' DeviceDesc." }
    foreach ($hw in @('ROOT\\AudappGeneral', 'ROOT\\AudappMusic', 'ROOT\\AudappGame', 'ROOT\\AudappBrowser')) {
        if ($directives -notmatch $hw) { Fail "AudioChannels.inf is missing expected hardware id ($hw)." }
    }
    if ($directives -notmatch 'AddService\s*=\s*AudappChannels') { Fail "AudioChannels.inf is missing the AudappChannels service." }
}

function Get-VsInstallationPath {
    param([string]$VsWherePath)
    $vs18 = & $VsWherePath -latest -products * -version "[18.0,19.0)" -property installationPath
    if ($vs18) { return $vs18 }
    return (& $VsWherePath -latest -products * -property installationPath)
}

function Get-WdkBuildVersion {
    param([string]$WdkBuildRoot)
    $versions = @(Get-ChildItem -LiteralPath $WdkBuildRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
        Sort-Object { [version]$_.Name } -Descending)
    if ($versions.Count -eq 0) { return $null }
    return $versions[0].Name
}

function Get-WdkTaskVersion {
    param([string]$WdkBuildRoot, [string]$ResolvedWdkVersion)
    $binRoot = Join-Path $WdkBuildRoot "$ResolvedWdkVersion\\bin"
    $taskDll = Get-ChildItem -LiteralPath $binRoot -Filter 'Microsoft.DriverKit.Build.Tasks.*.dll' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^Microsoft\.DriverKit\.Build\.Tasks\.(\d+\.\d+)\.dll$' } |
        Sort-Object {
            if ($_.Name -match '^Microsoft\.DriverKit\.Build\.Tasks\.(\d+\.\d+)\.dll$') { [version]$matches[1] }
        } -Descending |
        Select-Object -First 1
    if (-not $taskDll) { return $null }
    if ($taskDll.Name -match '^Microsoft\.DriverKit\.Build\.Tasks\.(\d+\.\d+)\.dll$') { return $matches[1] }
    return $null
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Join-Path $scriptRoot "project"
$targetRoot = Join-Path $projectRoot "upstream-audiocodec"
$solutionPath = Join-Path $targetRoot "AudioCodec.sln"
$infSourcePath = Join-Path $targetRoot "AudioChannels.inf"

if (-not (Test-Path -LiteralPath $solutionPath)) {
    Fail "Driver source was not found at $solutionPath. Reproduce the scaffold by copying driver/scaffold/audapp-multi into audapp-channels and applying the Phase 21F edits."
}
if (-not (Test-Path -LiteralPath $infSourcePath)) {
    Fail "AudioChannels.inf was not found at $infSourcePath."
}

# Guard BEFORE building.
Assert-ChannelsIdentity $infSourcePath

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\\Installer\\vswhere.exe"
if (-not (Test-Path -LiteralPath $vswhere)) { Fail "vswhere.exe was not found." }

$installationPath = Get-VsInstallationPath -VsWherePath $vswhere
if (-not $installationPath) { Fail "Visual Studio installation was not found by vswhere." }

$vsDevCmd = Join-Path $installationPath "Common7\\Tools\\VsDevCmd.bat"
if (-not (Test-Path -LiteralPath $vsDevCmd)) { Fail "VsDevCmd.bat was not found at $vsDevCmd" }

$wdkBuildRoot = "C:\Program Files (x86)\Windows Kits\10\build"
if (-not (Test-Path -LiteralPath $wdkBuildRoot)) { Fail "Windows Kits build tools were not found at $wdkBuildRoot" }

$wdkVersion = Get-WdkBuildVersion -WdkBuildRoot $wdkBuildRoot
if (-not $wdkVersion) { Fail "No WDK build version directories were found under $wdkBuildRoot" }

$visualStudioVersion = Get-WdkTaskVersion -WdkBuildRoot $wdkBuildRoot -ResolvedWdkVersion $wdkVersion
if (-not $visualStudioVersion) { Fail "No Microsoft.DriverKit.Build.Tasks.*.dll found under $wdkBuildRoot\\$wdkVersion\\bin" }

$msbuildPath = Join-Path $installationPath "MSBuild\\Current\\Bin\\amd64\\MSBuild.exe"
if (-not (Test-Path -LiteralPath $msbuildPath)) { Fail "MSBuild.exe was not found at $msbuildPath" }

$buildLogDir = Join-Path $projectRoot "build"
New-Item -ItemType Directory -Force -Path $buildLogDir | Out-Null
$binlogPath = Join-Path $buildLogDir "AudappChannels-$Configuration-$Platform.binlog"
$cmdPath = Join-Path $buildLogDir "invoke-msbuild-channels.cmd"

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
$sysPath = Join-Path $buildOutputDir "AudappChannels.sys"
$infPath = Join-Path $buildOutputDir "AudioChannels.inf"

if (-not (Test-Path -LiteralPath $sysPath)) { Fail "Expected driver binary was not found at $sysPath" }
if (-not (Test-Path -LiteralPath $infPath)) {
    # Some configs leave the stamped INF beside the source; fall back to source INF.
    if (Test-Path -LiteralPath $infSourcePath) { $infPath = $infSourcePath }
    else { Fail "Expected stamped INF was not found at $infPath" }
}

$stageDir = Join-Path $scriptRoot "package\$Configuration\$Platform"
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Copy-Item -LiteralPath $sysPath -Destination (Join-Path $stageDir "AudappChannels.sys") -Force
Copy-Item -LiteralPath $infPath -Destination (Join-Path $stageDir "AudioChannels.inf") -Force

# Guard AFTER staging the (possibly stamped) INF too.
Assert-ChannelsIdentity (Join-Path $stageDir "AudioChannels.inf")

$manifestPath = Join-Path $stageDir "package-manifest.txt"
$manifest = @(
    "Audapp Channels driver package (compile-only stage, Phase 21F)",
    "Timestamp: $(Get-Date -Format o)",
    "Configuration: $Configuration",
    "Platform: $Platform",
    "SourceBuildOutput: $buildOutputDir",
    "PackageDisplayName: Audapp Channels",
    "Service: AudappChannels",
    "Binary: AudappChannels.sys",
    "HardwareIds: ROOT\AudappGeneral, ROOT\AudappMusic, ROOT\AudappGame, ROOT\AudappBrowser",
    "Endpoints (render): Audapp General, Audapp Music, Audapp Game, Audapp Browser",
    "Endpoints (capture): NONE (render-only)",
    "Artifacts:",
    "- AudappChannels.sys",
    "- AudioChannels.inf",
    "Catalog:",
    "- Run Generate-Catalog-channels.ps1 to produce AudappChannels.cat (unsigned) if needed"
)
Set-Content -LiteralPath $manifestPath -Value $manifest -Encoding ascii

Write-Output "Compile-only build succeeded. Binlog: $binlogPath"
Write-Output "Staged package: $stageDir"
