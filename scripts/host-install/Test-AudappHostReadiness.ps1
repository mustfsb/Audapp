param(
    [switch]$ValidateInstallReadiness = $true,
    [string]$PayloadPath,
    [string]$DevgenPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'lib\AudappHostCommon.ps1')

function Add-ReadinessBlocker {
    param(
        [Parameter(Mandatory)][string]$Message,
        $Log
    )

    $script:ReadinessBlockers += $Message
    Write-AudappLog -Log $Log -Level ERROR -Message $Message
}

function Add-ReadinessWarning {
    param(
        [Parameter(Mandatory)][string]$Message,
        $Log
    )

    $script:ReadinessWarnings += $Message
    Write-AudappLog -Log $Log -Level WARN -Message $Message
}

function Write-ReadinessValue {
    param(
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][string]$Value,
        $Log
    )

    Write-AudappLog -Log $Log -Level INFO -Message ("{0}: {1}" -f $Label, $Value)
}

function Get-SystemRestoreStatus {
    [CmdletBinding()]
    param()

    $checkpointAvailable = $null -ne (Get-Command Checkpoint-Computer -ErrorAction SilentlyContinue)
    $restorePointAvailable = $null -ne (Get-Command Get-ComputerRestorePoint -ErrorAction SilentlyContinue)

    if (-not $restorePointAvailable) {
        return [pscustomobject]@{
            Status  = 'Unknown'
            Message = 'Get-ComputerRestorePoint is not available on this host.'
        }
    }

    try {
        $points = @(Get-ComputerRestorePoint -ErrorAction Stop)
        if (@($points).Count -gt 0) {
            return [pscustomobject]@{
                Status  = 'OK'
                Message = "{0} restore point(s) visible. Checkpoint-Computer available={1}" -f @($points).Count, $checkpointAvailable
            }
        }

        return [pscustomobject]@{
            Status  = 'Warning'
            Message = "No restore points are currently listed. Checkpoint-Computer available={0}" -f $checkpointAvailable
        }
    } catch {
        return [pscustomobject]@{
            Status  = 'Unknown'
            Message = $_.Exception.Message
        }
    }
}

function Get-BitLockerStatus {
    [CmdletBinding()]
    param(
        [string]$MountPoint = $env:SystemDrive
    )

    if (-not (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue)) {
        return [pscustomobject]@{
            Status  = 'Unknown'
            Message = 'Get-BitLockerVolume is not available on this host.'
        }
    }

    try {
        $volume = Get-BitLockerVolume -MountPoint $MountPoint -ErrorAction Stop
        return [pscustomobject]@{
            Status  = 'OK'
            Message = "ProtectionStatus={0}; VolumeStatus={1}; EncryptionPercentage={2}" -f $volume.ProtectionStatus, $volume.VolumeStatus, $volume.EncryptionPercentage
        }
    } catch {
        return [pscustomobject]@{
            Status  = 'Unknown'
            Message = $_.Exception.Message
        }
    }
}

function Get-RepoStatusSummary {
    [CmdletBinding()]
    param(
        [string]$RepoRoot
    )

    try {
        $status = & git -C $RepoRoot status --short 2>$null
        if ($LASTEXITCODE -ne 0) {
            return [pscustomobject]@{
                Status  = 'Unknown'
                Message = 'git status failed.'
            }
        }

        if (-not $status) {
            return [pscustomobject]@{
                Status  = 'Clean'
                Message = 'Working tree is clean.'
            }
        }

        return [pscustomobject]@{
            Status  = 'Dirty'
            Message = ($status -join '; ')
        }
    } catch {
        return [pscustomobject]@{
            Status  = 'Unknown'
            Message = $_.Exception.Message
        }
    }
}

$layout = Get-AudappScriptLayout
$cfg = Get-AudappHostConfig
if (-not $PayloadPath) {
    $PayloadPath = $layout.PayloadDir
}
if (-not $DevgenPath) {
    $DevgenPath = Join-Path $layout.BinDir 'devgen.exe'
}

$script:ReadinessBlockers = @()
$script:ReadinessWarnings = @()
$log = New-AudappInstallLog -Verb 'readiness'

Write-AudappLog -Log $log -Level INFO -Message 'Starting read-only host readiness report.'
Write-ReadinessValue -Label 'Script path' -Value $PSCommandPath -Log $log
Write-ReadinessValue -Label 'Host-install root' -Value $layout.HostInstallRoot -Log $log
Write-ReadinessValue -Label 'Payload path' -Value $PayloadPath -Log $log
Write-ReadinessValue -Label 'Devgen path' -Value $DevgenPath -Log $log

$os = Get-CimInstance Win32_OperatingSystem
$computerSystem = Get-CimInstance Win32_ComputerSystem
$systemDrive = if ($env:SystemDrive) { $env:SystemDrive } else { 'C:' }
$disk = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='{0}'" -f $systemDrive)

Write-ReadinessValue -Label 'Windows' -Value ("{0}; version={1}; build={2}" -f $os.Caption, $os.Version, $os.BuildNumber) -Log $log
Write-ReadinessValue -Label 'Computer' -Value $computerSystem.Name -Log $log
if ($disk) {
    $freeGb = [math]::Round(($disk.FreeSpace / 1GB), 2)
    $sizeGb = [math]::Round(($disk.Size / 1GB), 2)
    Write-ReadinessValue -Label 'Free disk space' -Value ("{0} GB free of {1} GB on {2}" -f $freeGb, $sizeGb, $systemDrive) -Log $log
}

$admin = Test-IsAdministrator
Write-ReadinessValue -Label 'Administrator' -Value $admin -Log $log
if (-not $admin) {
    Add-ReadinessBlocker -Message 'Install readiness requires an elevated PowerShell session.' -Log $log
}

$secureBoot = Get-AudappSecureBootState
Write-ReadinessValue -Label 'Secure Boot' -Value ("status={0}; enabled={1}; detail={2}" -f $secureBoot.Status, $secureBoot.Enabled, $secureBoot.Message) -Log $log
if ($secureBoot.Status -eq 'OK' -and $secureBoot.Enabled) {
    Add-ReadinessBlocker -Message 'Secure Boot is enabled. The current test-signing path requires Secure Boot OFF.' -Log $log
} elseif ($secureBoot.Status -ne 'OK') {
    Add-ReadinessWarning -Message "Secure Boot state could not be confirmed: $($secureBoot.Message)" -Log $log
}

$testSigning = Get-AudappTestSigningState
Write-ReadinessValue -Label 'Test-signing' -Value ("status={0}; enabled={1}; detail={2}" -f $testSigning.Status, $testSigning.Enabled, $testSigning.Message) -Log $log
if ($testSigning.Status -eq 'OK' -and -not $testSigning.Enabled) {
    Add-ReadinessBlocker -Message 'Windows test-signing is OFF. Real install must stop until the user enables it and reboots.' -Log $log
} elseif ($testSigning.Status -ne 'OK') {
    Add-ReadinessWarning -Message "Test-signing state could not be confirmed: $($testSigning.Message)" -Log $log
}

$restore = Get-SystemRestoreStatus
Write-ReadinessValue -Label 'System Restore' -Value ("status={0}; detail={1}" -f $restore.Status, $restore.Message) -Log $log
if ($restore.Status -eq 'Unknown') {
    Add-ReadinessWarning -Message "System Restore availability is unknown: $($restore.Message)" -Log $log
}

$bitLocker = Get-BitLockerStatus
Write-ReadinessValue -Label 'BitLocker' -Value ("status={0}; detail={1}" -f $bitLocker.Status, $bitLocker.Message) -Log $log
if ($bitLocker.Status -eq 'Unknown') {
    Add-ReadinessWarning -Message "BitLocker status is unavailable: $($bitLocker.Message)" -Log $log
}

$defaultRender = Get-CurrentDefaultRenderEndpoint -Log $log
if ($defaultRender.Status -eq 'OK') {
    Write-ReadinessValue -Label 'Current default render endpoint' -Value ("{0} [{1}]" -f $defaultRender.FriendlyName, $defaultRender.Id) -Log $log
} else {
    Add-ReadinessBlocker -Message ("Current default render endpoint could not be captured: {0}" -f $defaultRender.Error) -Log $log
}

$renderInventory = @(Get-AudappRenderEndpointInventory)
$physicalRender = @($renderInventory | Where-Object { $_.Status -eq 'OK' -and -not $_.IsAudapp })
$audappRender = @($renderInventory | Where-Object { $_.IsAudapp })

Write-ReadinessValue -Label 'Physical render endpoints' -Value ("count={0}; {1}" -f @($physicalRender).Count, (@($physicalRender | ForEach-Object { $_.FriendlyName }) -join ', ')) -Log $log
Write-ReadinessValue -Label 'Audapp render endpoints' -Value ("count={0}; {1}" -f @($audappRender).Count, (@($audappRender | ForEach-Object { $_.FriendlyName }) -join ', ')) -Log $log
if (@($physicalRender).Count -eq 0) {
    Add-ReadinessBlocker -Message 'No physical non-Audapp render endpoint is available.' -Log $log
}

$drivers = @(Get-AudappChannelsPublishedDrivers -Log $log)
$driverNames = if (@($drivers).Count -gt 0) { @($drivers | ForEach-Object { $_.PublishedName }) -join ', ' } else { '(none)' }
Write-ReadinessValue -Label 'AudappChannels published packages' -Value ("count={0}; {1}" -f @($drivers).Count, $driverNames) -Log $log

$devices = @(Get-AudappChannelsDevices -Log $log)
$deviceNames = if (@($devices).Count -gt 0) { @($devices | ForEach-Object { $_.InstanceId }) -join ', ' } else { '(none)' }
Write-ReadinessValue -Label 'AudappChannels devnodes' -Value ("count={0}; {1}" -f @($devices).Count, $deviceNames) -Log $log

$payloadFiles = @(Get-AudappPayloadFiles -PayloadPath $PayloadPath)
foreach ($payloadFile in $payloadFiles) {
    Write-ReadinessValue -Label ("Payload file {0}" -f $payloadFile.Name) -Value ("exists={0}; path={1}" -f $payloadFile.Exists, $payloadFile.Path) -Log $log
    if ($ValidateInstallReadiness -and -not $payloadFile.Exists -and $payloadFile.Name -ne $cfg.InfFileName) {
        Add-ReadinessBlocker -Message ("Required payload file is missing: {0}" -f $payloadFile.Path) -Log $log
    }
}

$infPath = Join-Path $PayloadPath $cfg.InfFileName
if (Test-Path -LiteralPath $infPath) {
    try {
        Assert-AudappChannelsInfIdentity -InfPath $infPath -Log $log | Out-Null
    } catch {
        Add-ReadinessBlocker -Message $_.Exception.Message -Log $log
    }
} else {
    Add-ReadinessBlocker -Message "Payload INF is missing: $infPath" -Log $log
}

foreach ($payloadFile in $payloadFiles | Where-Object { $_.Exists -and $_.Name -ne $cfg.InfFileName }) {
    $sig = Get-AudappAuthenticodeStatus -Path $payloadFile.Path
    Write-ReadinessValue -Label ("Signature {0}" -f $payloadFile.Name) -Value ("status={0}; signer={1}; detail={2}" -f $sig.Status, $sig.Signer, $sig.StatusMessage) -Log $log
    if ($ValidateInstallReadiness -and $sig.Status -notin @('Valid', 'NotSigned')) {
        Add-ReadinessWarning -Message ("Signature check for {0} returned {1}: {2}" -f $payloadFile.Name, $sig.Status, $sig.StatusMessage) -Log $log
    }
}

if (-not (Test-Path -LiteralPath $DevgenPath)) {
    Add-ReadinessBlocker -Message "Bundled devgen.exe is missing: $DevgenPath" -Log $log
} else {
    $devgenSig = Get-AudappAuthenticodeStatus -Path $DevgenPath
    Write-ReadinessValue -Label 'devgen.exe signature' -Value ("status={0}; signer={1}; detail={2}" -f $devgenSig.Status, $devgenSig.Signer, $devgenSig.StatusMessage) -Log $log
    if ($ValidateInstallReadiness -and $devgenSig.Status -notin @('Valid', 'UnknownError')) {
        Add-ReadinessWarning -Message ("devgen.exe signature status is {0}: {1}" -f $devgenSig.Status, $devgenSig.StatusMessage) -Log $log
    }
}

$repo = Get-RepoStatusSummary -RepoRoot (Split-Path -Parent $layout.HostInstallRoot)
Write-ReadinessValue -Label 'Repo state' -Value ("status={0}; detail={1}" -f $repo.Status, $repo.Message) -Log $log
if ($repo.Status -eq 'Dirty') {
    Add-ReadinessWarning -Message 'Repository has uncommitted changes. Review before any real host install.' -Log $log
}

Write-AudappLog -Log $log -Level INFO -Message ("Readiness blockers: {0}" -f @($script:ReadinessBlockers).Count)
Write-AudappLog -Log $log -Level INFO -Message ("Readiness warnings: {0}" -f @($script:ReadinessWarnings).Count)

if (@($script:ReadinessBlockers).Count -gt 0) {
    Write-AudappLog -Log $log -Level ERROR -Message 'Host readiness result: BLOCKED'
    exit 1
}

Write-AudappLog -Log $log -Level OK -Message 'Host readiness result: READY'
