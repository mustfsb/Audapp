param(
    [string]$InfPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $InfPath) {
    $InfPath = Join-Path $scriptRoot "project\upstream-audiocodec\AudioCodec.inf"
}

if (-not (Test-Path -LiteralPath $InfPath)) {
    Fail "INF not found at $InfPath. Run prepare.ps1 first."
}

$content = Get-Content -LiteralPath $InfPath -Raw

if ($content -match 'Audapp Input') {
    Write-Output "Package identity already applied: $InfPath"
    return
}

$replacements = @(
    @{ Pattern = 'ProviderName = "VS_Microsoft"'; Replacement = 'ProviderName = "Audapp"' }
    @{ Pattern = 'StdMfg = "AudioCodec Device"'; Replacement = 'StdMfg = "Audapp"' }
    @{ Pattern = 'DiskId1 = "AudioCodec Installation Disk"'; Replacement = 'DiskId1 = "Audapp Input Installation Disk"' }
    @{ Pattern = 'AudioCodec\.DeviceDesc = "AudioCodec Device"'; Replacement = 'AudioCodec.DeviceDesc = "Audapp Input"' }
    @{ Pattern = 'Audio_Device\.Speaker\.szPname="AudioCodec Speaker"'; Replacement = 'Audio_Device.Speaker.szPname="Audapp Input Speaker"' }
    @{ Pattern = 'Audio_Device\.Microphone\.szPname="AudioCodec Microphone"'; Replacement = 'Audio_Device.Microphone.szPname="Audapp Input Microphone"' }
    @{ Pattern = 'ROOT\\AudioCodec'; Replacement = 'ROOT\AudappInput' }
)

$updated = $content
foreach ($entry in $replacements) {
    $updated = [regex]::Replace($updated, $entry.Pattern, $entry.Replacement)
}

if ($updated -eq $content) {
    Fail "Package identity patch made no changes. INF may already be patched or upstream format changed: $InfPath"
}

[System.IO.File]::WriteAllText($InfPath, $updated)
Write-Output "Applied Audapp Input package identity to $InfPath"
