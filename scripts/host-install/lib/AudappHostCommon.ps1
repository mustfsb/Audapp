<#
    AudappHostCommon.ps1 - shared helper library for the Phase 22B
    host-install scaffold.

    DESIGN CONTRACT
    ---------------
    * Dot-sourcing this file must never mutate driver, device, boot, or audio
      state.
    * Helpers are read-only except for log-file creation and log writes.
    * Real mutation must be routed through Invoke-AudappCommandSafely and must
      be explicitly requested with -DryRun:$false by the caller.
    * Guard helpers fail closed on ambiguity or forbidden identities.
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:AudappHostCommonRoot = if ($PSCommandPath) {
    Split-Path -Parent $PSCommandPath
} else {
    Split-Path -Parent $MyInvocation.MyCommand.Path
}

function Get-AudappScriptLayout {
    [CmdletBinding()]
    param()

    $hostInstallRoot = Split-Path -Parent $script:AudappHostCommonRoot
    return [pscustomobject]@{
        HostInstallRoot = $hostInstallRoot
        LibraryRoot     = $script:AudappHostCommonRoot
        PayloadDir      = Join-Path $hostInstallRoot 'payload'
        BinDir          = Join-Path $hostInstallRoot 'bin'
        ReadmePath      = Join-Path $hostInstallRoot 'README.md'
    }
}

function Get-AudappHostConfig {
    [CmdletBinding()]
    param()

    return [pscustomobject]@{
        InfFileName          = 'AudioChannels.inf'
        InfOriginalName      = 'audiochannels.inf'
        Provider             = 'Audapp'
        ClassName            = 'MEDIA'
        ClassGuid            = '{4d36e96c-e325-11ce-bfc1-08002be10318}'
        Service              = 'AudappChannels'
        CatalogFile          = 'AudappChannels.cat'
        DriverBinary         = 'AudappChannels.sys'
        PublicCertFile       = 'AudappChannels.cer'
        ExpectedPayloadFiles = @(
            'AudioChannels.inf',
            'AudappChannels.sys',
            'AudappChannels.cat',
            'AudappChannels.cer'
        )
        Channels             = @(
            [pscustomobject]@{ Key = 'general'; HardwareId = 'ROOT\AudappGeneral'; InstanceTag = 'AUDAPPGENERAL0001'; DeviceInstanceId = 'ROOT\DEVGEN\AUDAPPGENERAL0001'; EndpointName = 'Audapp General' }
            [pscustomobject]@{ Key = 'music';   HardwareId = 'ROOT\AudappMusic';   InstanceTag = 'AUDAPPMUSIC0001';   DeviceInstanceId = 'ROOT\DEVGEN\AUDAPPMUSIC0001';   EndpointName = 'Audapp Music' }
            [pscustomobject]@{ Key = 'game';    HardwareId = 'ROOT\AudappGame';    InstanceTag = 'AUDAPPGAME0001';    DeviceInstanceId = 'ROOT\DEVGEN\AUDAPPGAME0001';    EndpointName = 'Audapp Game' }
            [pscustomobject]@{ Key = 'browser'; HardwareId = 'ROOT\AudappBrowser'; InstanceTag = 'AUDAPPBROWSER0001'; DeviceInstanceId = 'ROOT\DEVGEN\AUDAPPBROWSER0001'; EndpointName = 'Audapp Browser' }
        )
        ForbiddenHardwareIds = @('ROOT\AudappInput', 'ROOT\AudappMulti')
        ForbiddenNames       = @('Audapp Input', 'Audapp Multi', 'AudioMulti')
        ForbiddenServices    = @('AudioCodec', 'AudioMulti')
        ForbiddenInfNames    = @('audiocodec.inf', 'audiomulti.inf')
        ProtectedOemPackages = @('oem19.inf')
        LogDirectory         = Join-Path $env:USERPROFILE 'Documents\Audapp\host-install-logs'
    }
}

function New-AudappInstallLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Verb
    )

    $cfg = Get-AudappHostConfig
    if (-not (Test-Path -LiteralPath $cfg.LogDirectory)) {
        New-Item -ItemType Directory -Force -Path $cfg.LogDirectory | Out-Null
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $path = Join-Path $cfg.LogDirectory ("audapp-{0}-{1}.log" -f $Verb, $stamp)
    $log = [pscustomobject]@{
        Path    = $path
        Verb    = $Verb
        Started = Get-Date
    }

    Set-Content -LiteralPath $path -Value ("# Audapp host-install log - verb={0} started={1}" -f $Verb, (Get-Date -Format o)) -Encoding utf8
    return $log
}

function Write-AudappLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('INFO', 'PLAN', 'EXEC', 'WARN', 'ERROR', 'OK')][string]$Level = 'INFO',
        $Log
    )

    $line = "[{0}] [{1,-5}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
    if ($Log -and $Log.Path -and (Test-Path -LiteralPath (Split-Path -Parent $Log.Path))) {
        Add-Content -LiteralPath $Log.Path -Value $line -Encoding utf8
    }

    $color = switch ($Level) {
        'PLAN' { 'Cyan' }
        'EXEC' { 'Magenta' }
        'WARN' { 'Yellow' }
        'ERROR' { 'Red' }
        'OK' { 'Green' }
        default { 'Gray' }
    }
    Write-Host $line -ForegroundColor $color
}

function Test-IsAdministrator {
    [CmdletBinding()]
    param()

    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-AudappChannelsInfIdentity {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InfPath,
        $Log
    )

    if (-not (Test-Path -LiteralPath $InfPath)) {
        throw "SAFETY STOP: INF not found for identity guard: $InfPath"
    }

    $directives = ((Get-Content -LiteralPath $InfPath) | Where-Object { $_ -notmatch '^\s*;' }) -join "`n"

    foreach ($hw in @('ROOT\\AudappGeneral', 'ROOT\\AudappMusic', 'ROOT\\AudappGame', 'ROOT\\AudappBrowser')) {
        if ($directives -notmatch $hw) {
            throw "SAFETY STOP: $InfPath is missing required hardware id ($($hw -replace '\\\\','\'))."
        }
    }
    if ($directives -notmatch 'AddService\s*=\s*AudappChannels') {
        throw "SAFETY STOP: $InfPath is missing 'AddService = AudappChannels'."
    }
    if ($directives -notmatch 'CatalogFile\s*=\s*AudappChannels\.cat') {
        throw "SAFETY STOP: $InfPath is missing 'CatalogFile = AudappChannels.cat'."
    }

    foreach ($bad in @('ROOT\\AudappInput', 'ROOT\\AudappMulti')) {
        if ($directives -match $bad) {
            throw "SAFETY STOP: $InfPath references forbidden hardware id ($($bad -replace '\\\\','\'))."
        }
    }
    if ($directives -match 'DeviceDesc\s*=\s*"Audapp Input"') {
        throw "SAFETY STOP: $InfPath references the live 'Audapp Input' DeviceDesc."
    }
    if ($directives -match 'DeviceDesc\s*=\s*"Audapp Multi"') {
        throw "SAFETY STOP: $InfPath references the 'Audapp Multi' DeviceDesc."
    }
    foreach ($svc in @('AddService\s*=\s*AudioCodec', 'AddService\s*=\s*AudioMulti')) {
        if ($directives -match $svc) {
            throw "SAFETY STOP: $InfPath references a forbidden service ($svc)."
        }
    }

    if ($Log) {
        Write-AudappLog -Log $Log -Level OK -Message "INF identity guard PASSED for $InfPath (AudappChannels only)."
    }
    return $true
}

function Assert-NotAudappInputOrAudioMulti {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Reference,
        $Log
    )

    $cfg = Get-AudappHostConfig
    $forbidden = @(
        'ROOT\AUDAPPINPUT',
        'ROOT\AUDAPPMULTI',
        'AUDAPPINPUT0',
        'AUDAPPMULTI',
        'AUDAPP12G',
        'AUDIOMULTI',
        'AUDIOCODEC',
        'AUDAPP INPUT',
        'AUDAPP MULTI'
    ) + ($cfg.ProtectedOemPackages | ForEach-Object { $_.ToUpperInvariant() })

    foreach ($ref in $Reference) {
        if ([string]::IsNullOrWhiteSpace($ref)) {
            continue
        }

        $upper = $ref.ToUpperInvariant()
        foreach ($token in $forbidden) {
            if ($upper.Contains($token)) {
                throw "SAFETY STOP: reference '$ref' matches forbidden Audapp Input / AudioMulti / protected-package identity ('$token'). Aborting."
            }
        }
    }

    if ($Log) {
        Write-AudappLog -Log $Log -Level OK -Message ("Forbidden-identity guard PASSED for {0} reference(s)." -f @($Reference).Count)
    }
    return $true
}

function Get-AudappChannelsPublishedDrivers {
    [CmdletBinding()]
    param($Log)

    $cfg = Get-AudappHostConfig
    $raw = & pnputil.exe /enum-drivers 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        if ($Log) {
            Write-AudappLog -Log $Log -Level WARN -Message "pnputil /enum-drivers returned no data."
        }
        return @()
    }

    $text = $raw -join "`n"
    $blocks = $text -split "(\r?\n){2,}"
    $results = @()

    foreach ($block in $blocks) {
        if ([string]::IsNullOrWhiteSpace($block)) {
            continue
        }

        $values = @()
        foreach ($line in ($block -split "`r?`n")) {
            $index = $line.IndexOf(':')
            if ($index -ge 0 -and $index -lt ($line.Length - 1)) {
                $values += $line.Substring($index + 1).Trim()
            }
        }
        if (@($values).Count -eq 0) {
            continue
        }

        $published = @($values | Where-Object { $_ -match '^oem\d+\.inf$' } | Select-Object -First 1)
        if (@($published).Count -eq 0) {
            continue
        }

        $hasOriginal = @($values | Where-Object { $_.ToLowerInvariant() -eq $cfg.InfOriginalName }).Count -gt 0
        $hasProvider = @($values | Where-Object { $_ -eq $cfg.Provider }).Count -gt 0
        $looksForbidden = @($values | Where-Object { $cfg.ForbiddenInfNames -contains $_.ToLowerInvariant() }).Count -gt 0

        if ($hasOriginal -and $hasProvider -and -not $looksForbidden) {
            $results += [pscustomobject]@{
                PublishedName = $published[0]
                OriginalName  = $cfg.InfOriginalName
                Provider      = $cfg.Provider
                RawBlock      = $block.Trim()
            }
        }
    }

    if ($Log) {
        $names = @($results | ForEach-Object { $_.PublishedName }) -join ', '
        Write-AudappLog -Log $Log -Level INFO -Message ("Dynamic OEM resolution found {0} AudappChannels package(s): {1}" -f @($results).Count, $names)
    }
    return $results
}

function Assert-ResolvedPackageIsAudappChannels {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Package,
        $Log
    )

    $cfg = Get-AudappHostConfig
    if (-not $Package -or -not $Package.PublishedName) {
        throw 'SAFETY STOP: no resolved package supplied to delete.'
    }
    if ($Package.PublishedName -notmatch '^oem\d+\.inf$') {
        throw "SAFETY STOP: resolved package name '$($Package.PublishedName)' is not an oemNN.inf name."
    }
    if ($cfg.ProtectedOemPackages -contains $Package.PublishedName) {
        throw "SAFETY STOP: resolved package '$($Package.PublishedName)' is a protected package. Aborting."
    }
    if ($Package.OriginalName -ne $cfg.InfOriginalName) {
        throw "SAFETY STOP: resolved package OriginalName '$($Package.OriginalName)' != '$($cfg.InfOriginalName)'."
    }

    Assert-NotAudappInputOrAudioMulti -Reference @($Package.RawBlock) -Log $Log | Out-Null
    if ($Log) {
        Write-AudappLog -Log $Log -Level OK -Message "Resolved package $($Package.PublishedName) confirmed as AudappChannels."
    }
    return $true
}

function Get-AudappChannelsDevices {
    [CmdletBinding()]
    param($Log)

    $cfg = Get-AudappHostConfig
    $wanted = $cfg.Channels.DeviceInstanceId
    $devices = @()

    foreach ($pnp in (Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $wanted -contains $_.InstanceId })) {
        $problem = $null
        $service = $null
        try {
            $problem = (Get-PnpDeviceProperty -InstanceId $pnp.InstanceId -KeyName 'DEVPKEY_Device_ProblemCode' -ErrorAction SilentlyContinue).Data
            $service = (Get-PnpDeviceProperty -InstanceId $pnp.InstanceId -KeyName 'DEVPKEY_Device_Service' -ErrorAction SilentlyContinue).Data
        } catch {
        }

        $devices += [pscustomobject]@{
            InstanceId   = $pnp.InstanceId
            FriendlyName = $pnp.FriendlyName
            Status       = $pnp.Status
            ProblemCode  = $problem
            Service      = $service
        }
    }

    if ($Log) {
        Write-AudappLog -Log $Log -Level INFO -Message ("Found {0} AudappChannels devnode(s)." -f @($devices).Count)
    }
    return $devices
}

function Test-IsAudappEndpointName {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($Name)) {
        return $false
    }
    return $Name.ToLowerInvariant().Contains('audapp')
}

function Get-AudappRenderEndpoints {
    [CmdletBinding()]
    param($Log)

    $audapp = @(Get-AudappRenderEndpointInventory | Where-Object { $_.IsAudapp })
    if ($Log) {
        Write-AudappLog -Log $Log -Level INFO -Message ("Found {0} Audapp render endpoint(s)." -f @($audapp).Count)
    }
    return $audapp
}

function Get-AudappRenderEndpointInventory {
    [CmdletBinding()]
    param()

    $items = @()
    $endpoints = Get-PnpDevice -Class 'AudioEndpoint' -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceId -match 'MMDEVAPI\\\{0\.0\.0\.00000000\}' }

    foreach ($endpoint in $endpoints) {
        $id = $endpoint.InstanceId -replace '^.*MMDEVAPI\\', ''
        $items += [pscustomobject]@{
            Id           = $id
            FriendlyName = $endpoint.FriendlyName
            InstanceId   = $endpoint.InstanceId
            Status       = $endpoint.Status
            IsAudapp     = Test-IsAudappEndpointName -Name $endpoint.FriendlyName
        }
    }

    return $items
}

function Initialize-AudappMMDeviceInterop {
    [CmdletBinding()]
    param()

    if ('AudappHost.IMMDeviceEnumerator' -as [type]) {
        return
    }

    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace AudappHost {
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    [PreserveSig] int Activate(IntPtr iid, int clsCtx, IntPtr activationParams, out IntPtr interfacePtr);
    [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
    [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    [PreserveSig] int GetState(out int state);
  }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),
   InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
    [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class MMDeviceEnumeratorComObject {
  }

  public static class MMDeviceInterop {
    public static string GetDefaultRenderEndpointId() {
      IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device;
      int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      if (hr != 0 || device == null) {
        Marshal.ThrowExceptionForHR(hr);
      }

      string id;
      hr = device.GetId(out id);
      if (hr != 0) {
        Marshal.ThrowExceptionForHR(hr);
      }

      return id;
    }
  }
}
'@ -ErrorAction Stop
}

function Get-CurrentDefaultRenderEndpoint {
    [CmdletBinding()]
    param($Log)

    try {
        Initialize-AudappMMDeviceInterop
        $id = [AudappHost.MMDeviceInterop]::GetDefaultRenderEndpointId()

        $match = @(Get-AudappRenderEndpointInventory | Where-Object { $_.Id.ToUpperInvariant() -eq $id.ToUpperInvariant() } | Select-Object -First 1)
        $friendly = if (@($match).Count -gt 0) { $match[0].FriendlyName } else { '(friendly name unavailable)' }
        $instanceId = if (@($match).Count -gt 0) { $match[0].InstanceId } else { $null }

        return [pscustomobject]@{
            Status       = 'OK'
            Id           = $id
            FriendlyName = $friendly
            InstanceId   = $instanceId
            IsAudapp     = Test-IsAudappEndpointName -Name $friendly
            Error        = $null
        }
    } catch {
        $message = "Could not read current default render endpoint: $($_.Exception.Message)"
        if ($Log) {
            Write-AudappLog -Log $Log -Level WARN -Message $message
        }
        return [pscustomobject]@{
            Status       = 'Error'
            Id           = $null
            FriendlyName = $null
            InstanceId   = $null
            IsAudapp     = $null
            Error        = $message
        }
    }
}

function Get-PhysicalRenderEndpointCandidate {
    [CmdletBinding()]
    param($Log)

    $current = Get-CurrentDefaultRenderEndpoint -Log $Log
    if ($current.Status -eq 'OK' -and -not $current.IsAudapp -and $current.Id) {
        return [pscustomobject]@{
            Status       = 'OK'
            Id           = $current.Id
            FriendlyName = $current.FriendlyName
            InstanceId   = $current.InstanceId
            Source       = 'current-default'
            Error        = $null
        }
    }

    $pick = @(Get-AudappRenderEndpointInventory |
            Where-Object { $_.Status -eq 'OK' -and -not $_.IsAudapp } |
            Select-Object -First 1)
    if (@($pick).Count -eq 0) {
        $message = 'No physical (non-Audapp) render endpoint found.'
        if ($Log) {
            Write-AudappLog -Log $Log -Level WARN -Message $message
        }
        return [pscustomobject]@{
            Status       = 'Error'
            Id           = $null
            FriendlyName = $null
            InstanceId   = $null
            Source       = $null
            Error        = $message
        }
    }

    return [pscustomobject]@{
        Status       = 'OK'
        Id           = $pick[0].Id
        FriendlyName = $pick[0].FriendlyName
        InstanceId   = $pick[0].InstanceId
        Source       = 'first-ok-physical'
        Error        = $null
    }
}

function Get-AudappSecureBootState {
    [CmdletBinding()]
    param()

    try {
        $enabled = Confirm-SecureBootUEFI
        return [pscustomobject]@{
            Status  = 'OK'
            Enabled = [bool]$enabled
            Message = if ($enabled) { 'Secure Boot is enabled.' } else { 'Secure Boot is disabled.' }
        }
    } catch {
        return [pscustomobject]@{
            Status  = 'Unknown'
            Enabled = $null
            Message = $_.Exception.Message
        }
    }
}

function Get-AudappTestSigningState {
    [CmdletBinding()]
    param()

    try {
        $raw = & bcdedit.exe /enum '{current}' 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $raw) {
            return [pscustomobject]@{
                Status  = 'Unknown'
                Enabled = $null
                Message = 'bcdedit did not return boot configuration output.'
                Raw     = $raw
            }
        }

        $line = @($raw | Where-Object { $_ -match '^\s*testsigning\s+' } | Select-Object -First 1)
        if (@($line).Count -eq 0) {
            return [pscustomobject]@{
                Status  = 'Unknown'
                Enabled = $null
                Message = 'No testsigning field was found in the current boot entry.'
                Raw     = $raw
            }
        }

        $enabled = $line[0] -match '\b(Yes|On|True)\b'
        return [pscustomobject]@{
            Status  = 'OK'
            Enabled = [bool]$enabled
            Message = if ($enabled) { 'Windows test-signing is enabled.' } else { 'Windows test-signing is disabled.' }
            Raw     = $raw
        }
    } catch {
        return [pscustomobject]@{
            Status  = 'Unknown'
            Enabled = $null
            Message = $_.Exception.Message
            Raw     = $null
        }
    }
}

function Get-AudappAuthenticodeStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return [pscustomobject]@{
            Path          = $Path
            Exists        = $false
            Status        = 'Missing'
            StatusMessage = 'File not found.'
            Signer        = $null
            Thumbprint    = $null
        }
    }

    try {
        $signature = Get-AuthenticodeSignature -LiteralPath $Path
        $signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
        $thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
        return [pscustomobject]@{
            Path          = $Path
            Exists        = $true
            Status        = [string]$signature.Status
            StatusMessage = $signature.StatusMessage
            Signer        = $signer
            Thumbprint    = $thumbprint
        }
    } catch {
        return [pscustomobject]@{
            Path          = $Path
            Exists        = $true
            Status        = 'Error'
            StatusMessage = $_.Exception.Message
            Signer        = $null
            Thumbprint    = $null
        }
    }
}

function Get-AudappPayloadFiles {
    [CmdletBinding()]
    param(
        [string]$PayloadPath
    )

    $layout = Get-AudappScriptLayout
    $cfg = Get-AudappHostConfig
    if (-not $PayloadPath) {
        $PayloadPath = $layout.PayloadDir
    }

    $results = @()
    foreach ($name in $cfg.ExpectedPayloadFiles) {
        $path = Join-Path $PayloadPath $name
        $results += [pscustomobject]@{
            Name   = $name
            Path   = $path
            Exists = Test-Path -LiteralPath $path
        }
    }
    return $results
}

function Invoke-AudappCommandSafely {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Description,
        [Parameter(Mandatory)][scriptblock]$Action,
        [bool]$DryRun = $true,
        $Log
    )

    $commandText = $Action.ToString().Trim()
    if ($DryRun) {
        Write-AudappLog -Log $Log -Level PLAN -Message "[DRY-RUN] WOULD: $Description"
        Write-AudappLog -Log $Log -Level PLAN -Message "[DRY-RUN]   cmd: $commandText"
        return [pscustomobject]@{
            Executed    = $false
            Description = $Description
            Command     = $commandText
            ExitCode    = $null
            Output      = $null
        }
    }

    Write-AudappLog -Log $Log -Level EXEC -Message "EXECUTING: $Description"
    Write-AudappLog -Log $Log -Level EXEC -Message "  cmd: $commandText"

    $global:LASTEXITCODE = 0
    $output = & $Action 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if ($output) {
        Write-AudappLog -Log $Log -Level INFO -Message $output.Trim()
    }
    if ($exitCode -ne 0) {
        Write-AudappLog -Log $Log -Level ERROR -Message "Command failed (exit $exitCode): $Description"
        throw "Command failed (exit $exitCode): $Description"
    }

    Write-AudappLog -Log $Log -Level OK -Message "Done: $Description"
    return [pscustomobject]@{
        Executed    = $true
        Description = $Description
        Command     = $commandText
        ExitCode    = $exitCode
        Output      = $output
    }
}
