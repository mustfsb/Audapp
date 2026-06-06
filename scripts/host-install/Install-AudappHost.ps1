param(
    [switch]$DryRun = $true,
    [switch]$ConfirmHostInstall,
    [string]$PayloadPath,
    [string]$DevgenPath,
    [switch]$SkipWasapiProbe
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib\AudappHostCommon.ps1')

function Initialize-AudappPolicyConfigInterop {
    [CmdletBinding()]
    param()

    if ('AudappHost.IPolicyConfig' -as [type]) {
        return
    }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace AudappHost {
  [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    int GetMixFormat(IntPtr deviceName, IntPtr format);
    int GetDeviceFormat(IntPtr deviceName, int defaultOnly, IntPtr format);
    int SetDeviceFormat(IntPtr deviceName, IntPtr endpointFormat, IntPtr mixFormat);
    int GetProcessingPeriod(IntPtr deviceName, int defaultOnly, IntPtr defaultPeriod, IntPtr minimumPeriod);
    int SetProcessingPeriod(IntPtr deviceName, IntPtr processingPeriod);
    int GetShareMode(IntPtr deviceName, IntPtr mode);
    int SetShareMode(IntPtr deviceName, IntPtr mode);
    int GetPropertyValue(IntPtr deviceName, IntPtr key, IntPtr value);
    int SetPropertyValue(IntPtr deviceName, IntPtr key, IntPtr value);
    int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int role);
    int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string deviceId, int visible);
  }

  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
  public class PolicyConfigClient {
  }
}
'@ -ErrorAction Stop
}

function Set-AudappDefaultRenderEndpointInternal {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DeviceId
    )

    Initialize-AudappPolicyConfigInterop
    $client = New-Object AudappHost.PolicyConfigClient
    $policy = [AudappHost.IPolicyConfig]$client
    foreach ($role in 0, 1, 2) {
        $hr = $policy.SetDefaultEndpoint($DeviceId, $role)
        if ($hr -ne 0) {
            throw ("SetDefaultEndpoint failed for role {0} with hr=0x{1:X8}" -f $role, ([uint32]$hr))
        }
    }
}

function Add-InstallBlocker {
    param(
        [Parameter(Mandatory)][string]$Message,
        $Log
    )

    $script:InstallBlockers += $Message
    Write-AudappLog -Log $Log -Level WARN -Message $Message
}

$effectiveDryRun = [bool]$DryRun
if (-not $effectiveDryRun -and -not $ConfirmHostInstall) {
    throw 'Real mode requires both -ConfirmHostInstall and -DryRun:$false.'
}

$layout = Get-AudappScriptLayout
$cfg = Get-AudappHostConfig
if (-not $PayloadPath) {
    $PayloadPath = $layout.PayloadDir
}
if (-not $DevgenPath) {
    $DevgenPath = Join-Path $layout.BinDir 'devgen.exe'
}

$log = New-AudappInstallLog -Verb 'install'
$script:InstallBlockers = @()

Write-AudappLog -Log $log -Level INFO -Message ("Mode: {0}" -f $(if ($effectiveDryRun) { 'DRY-RUN' } else { 'REAL' }))
Write-AudappLog -Log $log -Level INFO -Message ("Payload path: {0}" -f $PayloadPath)
Write-AudappLog -Log $log -Level INFO -Message ("Devgen path: {0}" -f $DevgenPath)

$admin = Test-IsAdministrator
if (-not $admin) {
    Add-InstallBlocker -Message 'Real install requires an elevated PowerShell session.' -Log $log
}

$secureBoot = Get-AudappSecureBootState
Write-AudappLog -Log $log -Level INFO -Message ("Secure Boot: status={0}; enabled={1}; detail={2}" -f $secureBoot.Status, $secureBoot.Enabled, $secureBoot.Message)
if ($secureBoot.Status -eq 'OK' -and $secureBoot.Enabled) {
    Add-InstallBlocker -Message 'Secure Boot is enabled. This test-signing path requires Secure Boot OFF.' -Log $log
}

$testSigning = Get-AudappTestSigningState
Write-AudappLog -Log $log -Level INFO -Message ("Test-signing: status={0}; enabled={1}; detail={2}" -f $testSigning.Status, $testSigning.Enabled, $testSigning.Message)
if ($testSigning.Status -ne 'OK' -or -not $testSigning.Enabled) {
    Add-InstallBlocker -Message 'Windows test-signing is not confirmed ON. The script will not enable it automatically.' -Log $log
}

$defaultRender = Get-CurrentDefaultRenderEndpoint -Log $log
if ($defaultRender.Status -ne 'OK') {
    Add-InstallBlocker -Message ("Current default render endpoint could not be captured: {0}" -f $defaultRender.Error) -Log $log
} else {
    Write-AudappLog -Log $log -Level INFO -Message ("Captured current default render endpoint: {0} [{1}]" -f $defaultRender.FriendlyName, $defaultRender.Id)
}

$physicalCandidate = Get-PhysicalRenderEndpointCandidate -Log $log
if ($physicalCandidate.Status -ne 'OK') {
    Add-InstallBlocker -Message ("No safe physical fallback endpoint is available: {0}" -f $physicalCandidate.Error) -Log $log
} else {
    Write-AudappLog -Log $log -Level INFO -Message ("Physical fallback endpoint: {0} [{1}] via {2}" -f $physicalCandidate.FriendlyName, $physicalCandidate.Id, $physicalCandidate.Source)
}

$payloadFiles = @(Get-AudappPayloadFiles -PayloadPath $PayloadPath)
foreach ($payloadFile in $payloadFiles) {
    Write-AudappLog -Log $log -Level INFO -Message ("Payload file {0}: exists={1}; path={2}" -f $payloadFile.Name, $payloadFile.Exists, $payloadFile.Path)
    if (-not $payloadFile.Exists) {
        Add-InstallBlocker -Message ("Required payload file is missing: {0}" -f $payloadFile.Path) -Log $log
    }
}

$infPath = Join-Path $PayloadPath $cfg.InfFileName
if (Test-Path -LiteralPath $infPath) {
    try {
        Assert-AudappChannelsInfIdentity -InfPath $infPath -Log $log | Out-Null
    } catch {
        Add-InstallBlocker -Message $_.Exception.Message -Log $log
    }
}

foreach ($payloadFile in $payloadFiles | Where-Object { $_.Exists -and $_.Name -ne $cfg.InfFileName }) {
    $sig = Get-AudappAuthenticodeStatus -Path $payloadFile.Path
    Write-AudappLog -Log $log -Level INFO -Message ("Signature {0}: status={1}; signer={2}; detail={3}" -f $payloadFile.Name, $sig.Status, $sig.Signer, $sig.StatusMessage)
}

if (-not (Test-Path -LiteralPath $DevgenPath)) {
    Add-InstallBlocker -Message "Bundled devgen.exe is missing: $DevgenPath" -Log $log
} else {
    $devgenSig = Get-AudappAuthenticodeStatus -Path $DevgenPath
    Write-AudappLog -Log $log -Level INFO -Message ("devgen.exe signature: status={0}; signer={1}; detail={2}" -f $devgenSig.Status, $devgenSig.Signer, $devgenSig.StatusMessage)
}

$existingDrivers = @(Get-AudappChannelsPublishedDrivers -Log $log)
$existingDevices = @(Get-AudappChannelsDevices -Log $log)
$existingEndpoints = @(Get-AudappRenderEndpoints -Log $log)
Write-AudappLog -Log $log -Level INFO -Message ("Existing state before install: packages={0}; devnodes={1}; Audapp render endpoints={2}" -f @($existingDrivers).Count, @($existingDevices).Count, @($existingEndpoints).Count)

if (-not $effectiveDryRun -and @($script:InstallBlockers).Count -gt 0) {
    throw ('Real install aborted before mutation because {0} blocker(s) were found.' -f @($script:InstallBlockers).Count)
}

$certPath = Join-Path $PayloadPath $cfg.PublicCertFile
Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description 'Import the public driver test certificate into LocalMachine\Root' -Action {
    Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
}
Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description 'Import the public driver test certificate into LocalMachine\TrustedPublisher' -Action {
    Import-Certificate -FilePath $certPath -CertStoreLocation 'Cert:\LocalMachine\TrustedPublisher' | Out-Null
}
Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description 'Publish AudioChannels.inf into the driver store' -Action {
    & pnputil.exe /add-driver $infPath
}

foreach ($channel in $cfg.Channels) {
    Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description ("Create Audapp devnode {0}" -f $channel.DeviceInstanceId) -Action {
        & $DevgenPath /add /bus ROOT /hardwareid $channel.HardwareId /instanceid $channel.InstanceTag
    }
}

Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description 'Install the published AudioChannels driver onto present devices' -Action {
    & pnputil.exe /add-driver $infPath /install
}
Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description 'Rescan devices after Audapp devnode creation' -Action {
    & pnputil.exe /scan-devices
}

if (-not $SkipWasapiProbe) {
    Write-AudappLog -Log $log -Level INFO -Message 'WASAPI probe is part of the install design, but no probe binary is bundled in Phase 22B.'
}

if ($physicalCandidate.Status -eq 'OK') {
    Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description ("Reset Windows default render endpoint back to {0}" -f $physicalCandidate.FriendlyName) -Action {
        Set-AudappDefaultRenderEndpointInternal -DeviceId $physicalCandidate.Id
    }
}

if (-not $effectiveDryRun) {
    $resolvedDrivers = @(Get-AudappChannelsPublishedDrivers -Log $log)
    $resolvedDevices = @(Get-AudappChannelsDevices -Log $log)
    if (@($resolvedDevices).Count -ne 4) {
        throw ("Expected 4 AudappChannels devnodes after install; found {0}." -f @($resolvedDevices).Count)
    }
    $badDevice = @($resolvedDevices | Where-Object { $_.ProblemCode -ne 0 -or $_.Service -ne $cfg.Service })
    if (@($badDevice).Count -gt 0) {
        throw 'One or more installed AudappChannels devnodes did not validate cleanly.'
    }
    Write-AudappLog -Log $log -Level OK -Message ("Resolved published package(s): {0}" -f (@($resolvedDrivers | ForEach-Object { $_.PublishedName }) -join ', '))
}

Write-AudappLog -Log $log -Level INFO -Message ("Install scaffold complete. DryRun={0}; blockerCount={1}" -f $effectiveDryRun, @($script:InstallBlockers).Count)
