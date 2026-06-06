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
