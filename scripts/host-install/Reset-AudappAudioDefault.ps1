param(
    [switch]$DryRun = $true,
    [switch]$ConfirmHostInstall,
    [string]$EndpointId
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

$log = New-AudappInstallLog -Verb 'reset-default'
$currentDefault = Get-CurrentDefaultRenderEndpoint -Log $log
$candidate = $null

if ($EndpointId) {
    $candidate = @(Get-AudappRenderEndpointInventory | Where-Object { $_.Id -eq $EndpointId -and -not $_.IsAudapp } | Select-Object -First 1)
    if (@($candidate).Count -gt 0) {
        $candidate = [pscustomobject]@{
            Status       = 'OK'
            Id           = $candidate[0].Id
            FriendlyName = $candidate[0].FriendlyName
            InstanceId   = $candidate[0].InstanceId
            Source       = 'explicit-endpoint-id'
            Error        = $null
        }
    } else {
        $candidate = [pscustomobject]@{
            Status       = 'Error'
            Id           = $null
            FriendlyName = $null
            InstanceId   = $null
            Source       = 'explicit-endpoint-id'
            Error        = "Requested endpoint id was not found or is an Audapp endpoint: $EndpointId"
        }
    }
} else {
    $candidate = Get-PhysicalRenderEndpointCandidate -Log $log
}

Write-AudappLog -Log $log -Level INFO -Message ("Current default: {0}" -f ($(if ($currentDefault.Status -eq 'OK') { "$($currentDefault.FriendlyName) [$($currentDefault.Id)]" } else { $currentDefault.Error })))
Write-AudappLog -Log $log -Level INFO -Message ("Candidate physical endpoint: {0}" -f ($(if ($candidate.Status -eq 'OK') { "$($candidate.FriendlyName) [$($candidate.Id)] via $($candidate.Source)" } else { $candidate.Error })))

if ($candidate.Status -ne 'OK') {
    throw $candidate.Error
}

Write-AudappLog -Log $log -Level INFO -Message ("Would set Windows default render endpoint to: {0} [{1}]" -f $candidate.FriendlyName, $candidate.Id)

Invoke-AudappCommandSafely -Log $log -DryRun:$effectiveDryRun -Description ("Set Windows default render endpoint to {0}" -f $candidate.FriendlyName) -Action {
    Set-AudappDefaultRenderEndpointInternal -DeviceId $candidate.Id
}
