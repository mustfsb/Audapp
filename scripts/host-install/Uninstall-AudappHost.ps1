param(
    [switch]$DryRun = $true,
    [switch]$ConfirmHostInstall,
    [switch]$CleanStaleEndpoints
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib\AudappHostCommon.ps1')

function Initialize-AudappPolicyConfigInterop {
    [CmdletBinding()]
    param()

    if ('AudappHostInterop.PolicyConfigHelper' -as [type]) {
        return
    }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace AudappHostInterop {
  [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPolicyConfig {
    int GetMixFormat(IntPtr wszDeviceId, out IntPtr ppwfxFormat);
    int GetDeviceFormat(IntPtr wszDeviceId, int dwFlags, out IntPtr ppwfxFormat);
    int ResetDeviceFormat(IntPtr wszDeviceId);
    int SetDeviceFormat(IntPtr wszDeviceId, IntPtr pwfxFormat, IntPtr pwfxFormatReq);
    int GetProcessingPeriod(IntPtr wszDeviceId, int dwFlags, out long phnsDefaultPeriod, out long phnsMinimumPeriod);
    int SetProcessingPeriod(IntPtr wszDeviceId, long hnsPeriod);
    int GetShareMode(IntPtr wszDeviceId, out IntPtr pShareMode);
    int SetShareMode(IntPtr wszDeviceId, IntPtr pShareMode);
    int GetPropertyValue(IntPtr wszDeviceId, IntPtr key, IntPtr pv);
    int SetEndpointVisibility(IntPtr wszDeviceId, int bVisible);
    int SetDefaultEndpoint(IntPtr wszDeviceId, int eRole);
  }

  [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
  public class PolicyConfigClient {
  }

  public static class PolicyConfigHelper {
    public static int SetDefaultEndpointAllRoles(string deviceId) {
      IntPtr pDeviceId = Marshal.StringToCoTaskMemUni(deviceId);
      try {
        IPolicyConfig policy = (IPolicyConfig)(new PolicyConfigClient());
        for (int role = 0; role < 3; role++) {
          int hr = policy.SetDefaultEndpoint(pDeviceId, role);
          if (hr != 0) {
            return hr;
          }
        }
        return 0;
      } finally {
        if (pDeviceId != IntPtr.Zero) {
          Marshal.FreeCoTaskMem(pDeviceId);
        }
      }
    }
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
    $hr = [AudappHostInterop.PolicyConfigHelper]::SetDefaultEndpointAllRoles($DeviceId)
    if ($hr -ne 0) {
        throw ("SetDefaultEndpoint failed with hr=0x{0:X8}" -f ([uint32]$hr))
    }
}

$effectiveDryRun = [bool]$DryRun
if (-not $effectiveDryRun -and -not $ConfirmHostInstall) {
    throw 'Real mode requires both -ConfirmHostInstall and -DryRun:$false.'
}

$cfg = Get-AudappHostConfig
$log = New-AudappInstallLog -Verb 'uninstall'

Write-AudappLog -Log $log -Level INFO -Message ("Mode: {0}" -f $(if ($effectiveDryRun) { 'DRY-RUN' } else { 'REAL' }))

$packages = @(Get-AudappChannelsPublishedDrivers -Log $log)
$devices = @(Get-AudappChannelsDevices -Log $log)
$fallback = Get-PhysicalRenderEndpointCandidate -Log $log

Write-AudappLog -Log $log -Level INFO -Message ("Resolved packages for uninstall: {0}" -f $(if (@($packages).Count -gt 0) { (@($packages | ForEach-Object { $_.PublishedName }) -join ', ') } else { '(none)' }))
Write-AudappLog -Log $log -Level INFO -Message ("Resolved devnodes for uninstall: {0}" -f $(if (@($devices).Count -gt 0) { (@($devices | ForEach-Object { $_.InstanceId }) -join ', ') } else { '(none)' }))
Write-AudappLog -Log $log -Level INFO -Message ("Fallback physical endpoint: {0}" -f $(if ($fallback.Status -eq 'OK') { "$($fallback.FriendlyName) [$($fallback.Id)]" } else { $fallback.Error }))

if (-not $effectiveDryRun -and -not (Test-IsAdministrator)) {
    throw 'Real uninstall requires an elevated PowerShell session.'
}

if (-not $effectiveDryRun -and @($packages).Count -ne 1) {
    throw ("Real uninstall requires exactly one resolved AudappChannels package; found {0}." -f @($packages).Count)
}

if (@($packages).Count -gt 0) {
    foreach ($package in $packages) {
        Assert-ResolvedPackageIsAudappChannels -Package $package -Log $log | Out-Null
    }
}

foreach ($channel in $cfg.Channels) {
    Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description ("Remove Audapp devnode {0}" -f $channel.DeviceInstanceId) -Action {
        & pnputil.exe /remove-device $channel.DeviceInstanceId
    }
}

if (@($packages).Count -gt 0) {
    $packageToDelete = $packages[0]
    Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description ("Delete published driver package {0}" -f $packageToDelete.PublishedName) -Action {
        & pnputil.exe /delete-driver $packageToDelete.PublishedName /uninstall /force
    }
} else {
    Write-AudappLog -Log $log -Level WARN -Message 'No AudappChannels package was resolved, so no delete-driver command was planned.'
}

if ($fallback.Status -eq 'OK') {
    Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description ("Reset Windows default render endpoint to {0}" -f $fallback.FriendlyName) -Action {
        Set-AudappDefaultRenderEndpointInternal -DeviceId $fallback.Id
    }
}

if ($CleanStaleEndpoints) {
    Write-AudappLog -Log $log -Level WARN -Message 'Safe stale MMDevice cleanup is intentionally left as a manual review step in Phase 22B. No cleanup command was executed.'
}

Write-AudappLog -Log $log -Level INFO -Message ("Uninstall scaffold complete. DryRun={0}" -f $effectiveDryRun)
