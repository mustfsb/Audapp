param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x64",
    [string]$SignToolPath = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.28000.0\x64\signtool.exe",
    [string]$CertSubject = "CN=Audapp VM Test Code Signing",
    [string]$CertExportDir = "$env:USERPROFILE\Documents\Audapp\driver-test-signing",
    [switch]$SignSys,
    [switch]$ForceNewCertificate
)

# Audapp Multi (Phase 21C) — sign AudioMulti.cat (and optionally AudioMulti.sys)
# with the VM test code-signing cert. ELEVATED / VM-ONLY.
# Retarget of Sign-Catalog.ps1 for the AudioMulti / ROOT\AudappMulti identity.
# Reuses the same "Audapp VM Test Code Signing" cert as the Audapp Input package
# (already trusted in this VM, which is why the live self-signed driver loads).
# Touches ONLY AudioMulti files; never AudioCodec / Audapp Input / oem19.inf.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Fail([string]$Message) { Write-Error $Message; exit 1 }

function Require-Admin {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Fail "This script must run in an elevated (Run as Administrator) PowerShell session for LocalMachine cert stores and signtool /sm."
    }
}

Require-Admin

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$stageDir = Join-Path $scriptRoot "package\$Configuration\$Platform"
if (-not (Test-Path -LiteralPath $stageDir)) { Fail "Staged package directory was not found at $stageDir. Run build-multi.ps1 + Generate-Catalog-multi.ps1 first." }

$sysPath = Join-Path $stageDir "AudioMulti.sys"
$infPath = Join-Path $stageDir "AudioMulti.inf"
$catPath = Join-Path $stageDir "AudioMulti.cat"

if (-not (Test-Path -LiteralPath $sysPath)) { Fail "Expected staged driver binary was not found at $sysPath" }
if (-not (Test-Path -LiteralPath $infPath)) { Fail "Expected staged INF was not found at $infPath" }
if (-not (Test-Path -LiteralPath $catPath)) { Fail "AudioMulti.cat not found at $catPath. Run Generate-Catalog-multi.ps1 first." }

# Safety: directive-level identity check (ignore comments).
$infDirectives = ((Get-Content -LiteralPath $infPath) | Where-Object { $_ -notmatch '^\s*;' }) -join "`n"
if ($infDirectives -notmatch 'ROOT\\AudappMulti') { Fail "Staged INF is missing ROOT\AudappMulti." }
if ($infDirectives -match 'ROOT\\AudappInput' -or $infDirectives -match 'DeviceDesc\s*=\s*"Audapp Input"') {
    Fail "SAFETY STOP: staged INF has a directive referencing the live Audapp Input identity. Aborting."
}

if (-not (Test-Path -LiteralPath $SignToolPath)) { Fail "signtool.exe was not found at $SignToolPath" }

New-Item -ItemType Directory -Force -Path $CertExportDir | Out-Null
$cerPath = Join-Path $CertExportDir "AudappDriverTest.cer"

$cert = $null
if (-not $ForceNewCertificate) {
    $cert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq $CertSubject } | Select-Object -First 1
}
if (-not $cert) {
    Write-Output "Creating VM test code-signing certificate: $CertSubject"
    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $CertSubject `
        -CertStoreLocation "Cert:\LocalMachine\My" -KeyAlgorithm RSA -KeyLength 4096 `
        -HashAlgorithm SHA256 -NotAfter (Get-Date).AddYears(2)
}
else {
    Write-Output "Using existing certificate: $CertSubject ($($cert.Thumbprint))"
}

Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\LocalMachine\TrustedPublisher" | Out-Null
Write-Output "Imported public cert to LocalMachine\Root and LocalMachine\TrustedPublisher"

Write-Output "Signing catalog: $catPath"
& $SignToolPath sign /fd SHA256 /sha1 $cert.Thumbprint /sm /s My /v $catPath
if ($LASTEXITCODE -ne 0) { Fail "signtool sign failed for catalog with exit code $LASTEXITCODE" }

if ($SignSys) {
    Write-Output "Signing driver binary: $sysPath"
    & $SignToolPath sign /fd SHA256 /sha1 $cert.Thumbprint /sm /s My /v $sysPath
    if ($LASTEXITCODE -ne 0) { Fail "signtool sign failed for SYS with exit code $LASTEXITCODE" }
}

Write-Output "Verifying catalog signature..."
& $SignToolPath verify /pa /v $catPath
if ($LASTEXITCODE -ne 0) { Fail "signtool verify failed for catalog with exit code $LASTEXITCODE" }

Write-Output "Catalog signing succeeded."
Write-Output "  Subject: $($cert.Subject)"
Write-Output "  Thumbprint: $($cert.Thumbprint)"
Write-Output "  Catalog: $catPath"
