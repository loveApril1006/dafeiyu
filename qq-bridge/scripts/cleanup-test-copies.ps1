param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$bridgeRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$installRoot = [IO.Path]::GetFullPath((Join-Path $bridgeRoot '..')).TrimEnd('\')
$maintenanceRoot = Join-Path $installRoot 'maintenance'
$outputRoot = Join-Path $bridgeRoot 'state\system-audit'
$plan = Get-Content -LiteralPath (Join-Path $outputRoot 'cleanup-plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$comparison = [StringComparison]::OrdinalIgnoreCase

function Assert-InTree([string]$ItemPath, [string]$TreePath) {
    $absolute = [IO.Path]::GetFullPath($ItemPath).TrimEnd('\')
    if (-not $absolute.StartsWith(($TreePath.TrimEnd('\') + '\'), $comparison)) {
        throw 'Cleanup path escaped the approved tree.'
    }
    return $absolute
}

# Validate the complete plan before removing even one file. The accepted
# patterns cover test copies only; all release directories are retained.
$targets = @()
foreach ($row in $plan.targets) {
    $target = Assert-InTree ([string]$row.path) $maintenanceRoot
    $relative = $target.Substring($maintenanceRoot.Length + 1)
    $approved = $relative -match '^full-installer-v(?:18|20|21)\\(?:full-acceptance|[^\\]*fixture[^\\]*)$' -or
        $relative -match '^universal-repair-20261026\\(?:case-[^\\]+|legacy-rpc-[^\\]+|live-v13-[^\\]+|live v13 [^\\]+)$' -or
        $relative -match '^qq-startup-20261026\\[^\\]*fixture[^\\]*$' -or
        $relative -match '^dsh-health-20261026\\(?:engine-fixture-[^\\]+|help-home)$'
    if (-not $approved) { throw "Unapproved cleanup target: $relative" }
    $ancestor = $target
    while ($ancestor.Length -ge $maintenanceRoot.Length) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Cleanup root or ancestor is a link: $relative"
            }
            if (-not $item.PSIsContainer) { throw "Expected a test directory: $relative" }
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    $targets += [pscustomobject]@{ path = $target; bytes = [long]$row.bytes }
}
if (($targets.path | Sort-Object -Unique).Count -ne $targets.Count) { throw 'Duplicate cleanup targets.' }
$processes = Get-CimInstance Win32_Process
foreach ($target in $targets) {
    foreach ($running in $processes) {
        if (([string]$running.CommandLine).IndexOf($target.path, $comparison) -ge 0 -or
            ([string]$running.ExecutablePath).StartsWith(($target.path + '\'), $comparison)) {
            throw 'A running process references an approved test copy. No deletion performed.'
        }
    }
}
if (-not $Apply) {
    [pscustomobject]@{ mode = 'validated-plan-only'; targets = $targets.Count; GiB = [math]::Round($plan.totalBytes / 1GB, 2) }
    exit 0
}

Add-Type -Path (Join-Path $PSScriptRoot 'maintenance-cleaner.cs')
$nativeCleaner = [Xiaoge.Maintenance.TestTreeCleaner]::new()

$diskRoot = [IO.Path]::GetPathRoot($installRoot)
$reportFile = Join-Path $outputRoot 'cleanup-result.json'
$previous = $null
if (Test-Path -LiteralPath $reportFile) {
    $candidate = Get-Content -LiteralPath $reportFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($candidate.mode -eq 'applied-user-approved-plan' -and
        (-not $candidate.planAt -or $candidate.planAt -eq $plan.at) -and
        @($candidate.removed | Where-Object {$_.path -notin $targets.path}).Count -eq 0) { $previous = $candidate }
}
$report = [ordered]@{
    at = [DateTime]::UtcNow.ToString('o'); mode = 'applied-user-approved-plan'
    planAt = $plan.at
    freeBytesBefore = $(if ($previous) {$previous.freeBytesBefore} else {[IO.DriveInfo]::new($diskRoot).AvailableFreeSpace})
    freeBytesAfter = $null; removed = @($previous.removed | Where-Object {$_}); missing = @($previous.missing | Where-Object {$_}); failed = @()
    removedFiles = 0; removedDirectories = 0; removedLinks = 0
}
$completed = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($row in $report.removed) {$null = $completed.Add($row.path)}
foreach ($row in $report.missing) {$null = $completed.Add($row)}
foreach ($target in $targets) {
    if ($completed.Contains($target.path)) {continue}
    try {
        if (-not (Test-Path -LiteralPath $target.path)) { $report.missing += $target.path }
        else {
            $nativeCleaner.Remove($target.path, $target.path)
            $report.removed += $target
        }
        Write-Output ('CLEANUP ' + ($report.removed.Count + $report.missing.Count) + '/' + $targets.Count)
    } catch {
        $report.failed += [pscustomobject]@{ path = $target.path; error = $_.Exception.Message }
        Write-Output ('FAILED target ' + ($report.removed.Count + $report.missing.Count + $report.failed.Count))
    }
    $report.removedFiles = $nativeCleaner.Files + [long]$previous.removedFiles
    $report.removedDirectories = $nativeCleaner.Directories + [long]$previous.removedDirectories
    $report.removedLinks = $nativeCleaner.Links + [long]$previous.removedLinks
    $report.freeBytesAfter = [IO.DriveInfo]::new($diskRoot).AvailableFreeSpace
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportFile -Encoding UTF8
}
Write-Output ('Removed=' + $report.removed.Count + '; missing=' + $report.missing.Count + '; failed=' + $report.failed.Count)
if ($report.failed.Count) { exit 1 }
