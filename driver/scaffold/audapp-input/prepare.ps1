param(
    [Parameter(Mandatory = $true)]
    [string]$SampleRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

$resolvedSampleRoot = Resolve-Path -LiteralPath $SampleRoot -ErrorAction SilentlyContinue
if (-not $resolvedSampleRoot) {
    Fail "SampleRoot does not exist: $SampleRoot"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Join-Path $scriptRoot "project"
$targetRoot = Join-Path $projectRoot "upstream-audiocodec"
$sourceDriverRoot = Join-Path $resolvedSampleRoot.Path "audio\\Acx\\Samples\\AudioCodec\\Driver"

if (-not (Test-Path -LiteralPath $sourceDriverRoot)) {
    Fail "Expected ACX sample path was not found: $sourceDriverRoot"
}

$requiredFiles = @(
    "AudioCodec.inf",
    "AudioCodec.sln",
    "AudioCodec.vcxproj",
    "AudioCodec.vcxproj.Filters",
    "Device.cpp",
    "Driver.cpp",
    "DriverSettings.h",
    "ReadMe.txt",
    "Resources.rc"
)

foreach ($file in $requiredFiles) {
    $candidate = Join-Path $sourceDriverRoot $file
    if (-not (Test-Path -LiteralPath $candidate)) {
        Fail "Required upstream file is missing: $candidate"
    }
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

foreach ($file in $requiredFiles) {
    Copy-Item -LiteralPath (Join-Path $sourceDriverRoot $file) -Destination (Join-Path $targetRoot $file) -Force
}

$reportPath = Join-Path $projectRoot "import-report.txt"
$report = @(
    "Imported upstream sample files",
    "Timestamp: $(Get-Date -Format o)",
    "SourceRoot: $sourceDriverRoot",
    "TargetRoot: $targetRoot",
    "Files:"
) + ($requiredFiles | ForEach-Object { "- $_" })

Set-Content -LiteralPath $reportPath -Value $report -Encoding ascii
Write-Output "Prepared compile-only sample snapshot at $targetRoot"
