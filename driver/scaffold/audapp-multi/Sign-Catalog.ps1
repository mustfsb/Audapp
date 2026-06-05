param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x64",
    [string]$SignToolPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe",
    [string]$CertSubject = "CN=Audapp VM Test Code Signing",
    [string]$CertExportDir = "$env:USERPROFILE\Documents\Audapp\driver-test-signing",
    [switch]$SignSys,
    [switch]$ForceNewCertificate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) {
    Write-Error $Message
    exit 1
}

function Require-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Fail "This script must run in an elevated (Run as Administrator) PowerShell session for LocalMachine certificate stores and signtool /sm."
    }
}

Require-Admin

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stageDir = Join-Path $scriptRoot "package\$Configuration\$Platform"

if (-not (Test-Path -LiteralPath $stageDir)) {
    Fail "Staged package directory was not found at $stageDir. Run build.ps1 and Generate-Catalog.ps1 first."
}

$sysPath = Join-Path $stageDir "AudioCodec.sys"
$infPath = Join-Path $stageDir "AudioCodec.inf"

if (-not (Test-Path -LiteralPath $sysPath)) {
    Fail "Expected staged driver binary was not found at $sysPath"
}

if (-not (Test-Path -LiteralPath $infPath)) {
    Fail "Expected staged INF was not found at $infPath"
}

$catFile = Get-ChildItem -LiteralPath $stageDir -Filter "*.cat" | Select-Object -First 1
if (-not $catFile) {
    Fail "No catalog file (*.cat) found in $stageDir. Run Generate-Catalog.ps1 first."
}
$catPath = $catFile.FullName

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

if (-not (Test-Path -LiteralPath $SignToolPath)) {
    Fail "signtool.exe was not found at $SignToolPath"
}

New-Item -ItemType Directory -Force -Path $CertExportDir | Out-Null
$cerPath = Join-Path $CertExportDir "AudappDriverTest.cer"

$cert = $null
if (-not $ForceNewCertificate) {
    $cert = Get-ChildItem Cert:\LocalMachine\My |
        Where-Object { $_.Subject -eq $CertSubject } |
        Select-Object -First 1
}

if (-not $cert) {
    Write-Output "Creating VM test code-signing certificate: $CertSubject"
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $CertSubject `
        -CertStoreLocation "Cert:\LocalMachine\My" `
        -KeyAlgorithm RSA `
        -KeyLength 4096 `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(2)
}
else {
    Write-Output "Using existing certificate: $CertSubject"
}

Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Write-Output "Exported public certificate to $cerPath"

Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null
Write-Output "Imported public certificate to LocalMachine\Root and LocalMachine\TrustedPublisher"

Write-Output "Signing catalog: $catPath"
& $SignToolPath sign /fd SHA256 /sha1 $cert.Thumbprint /sm /s My /v $catPath
if ($LASTEXITCODE -ne 0) {
    Fail "signtool sign failed for catalog with exit code $LASTEXITCODE"
}

if ($SignSys) {
    Write-Output "Signing driver binary: $sysPath"
    & $SignToolPath sign /fd SHA256 /sha1 $cert.Thumbprint /sm /s My /v $sysPath
    if ($LASTEXITCODE -ne 0) {
        Fail "signtool sign failed for SYS with exit code $LASTEXITCODE"
    }
}

Write-Output "Verifying catalog signature..."
& $SignToolPath verify /pa /v $catPath
if ($LASTEXITCODE -ne 0) {
    Fail "signtool verify failed for catalog with exit code $LASTEXITCODE"
}

if ($SignSys) {
    Write-Output "Verifying SYS signature..."
    & $SignToolPath verify /pa /v $sysPath
    if ($LASTEXITCODE -ne 0) {
        Fail "signtool verify failed for SYS with exit code $LASTEXITCODE"
    }
}

$manifestPath = Join-Path $stageDir "package-manifest.txt"
if (Test-Path -LiteralPath $manifestPath) {
    $stamp = Get-Date -Format o
    $note = "- Catalog signed ($stamp) thumbprint=$($cert.Thumbprint) via Sign-Catalog.ps1"
    $manifest = Get-Content -LiteralPath $manifestPath -Raw
    if ($manifest -notmatch [regex]::Escape($cert.Thumbprint)) {
        Add-Content -LiteralPath $manifestPath -Value $note
    }
    if ($SignSys -and $manifest -notmatch "AudioCodec\.sys.*signed") {
        Add-Content -LiteralPath $manifestPath -Value "- AudioCodec.sys signed ($stamp) via Sign-Catalog.ps1 -SignSys"
    }
}

Write-Output "Catalog signing succeeded."
Write-Output "  Subject: $($cert.Subject)"
Write-Output "  Thumbprint: $($cert.Thumbprint)"
Write-Output "  Catalog: $catPath"
Write-Output "  Public cert: $cerPath"
Write-Output "  SignSys: $([bool]$SignSys)"
