$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'maintenance-cleaner.cs')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('qq-cleanup-fixture-' + [Guid]::NewGuid().ToString('N'))
$approved = Join-Path $testRoot 'approved'
$outside = Join-Path $testRoot 'protected'
[IO.Directory]::CreateDirectory((Join-Path $approved 'nested')) | Out-Null
[IO.Directory]::CreateDirectory($outside) | Out-Null
$sentinel = Join-Path $outside 'keep.txt'
[IO.File]::WriteAllText($sentinel, 'protected fixture')
$readOnlyFile = Join-Path $approved 'nested\read-only.txt'
[IO.File]::WriteAllText($readOnlyFile, 'disposable fixture')
[IO.File]::SetAttributes($readOnlyFile, [IO.FileAttributes]::ReadOnly)
New-Item -ItemType Junction -Path (Join-Path $approved 'outside-link') -Target $outside | Out-Null
$cleaner = [Xiaoge.Maintenance.TestTreeCleaner]::new()
$escaped = $false
try { $cleaner.Remove($outside, $approved) } catch { $escaped = $true }
if (-not $escaped) { throw 'Escaped path was not rejected.' }
$cleaner.Remove($approved, $approved)
if (Test-Path -LiteralPath $approved) { throw 'Approved fixture was not removed.' }
if ([IO.File]::ReadAllText($sentinel) -ne 'protected fixture') { throw 'Junction target was modified.' }
if ($cleaner.Links -ne 1 -or $cleaner.Files -ne 1) { throw 'Unexpected traversal counts.' }
$resolved = [IO.Path]::GetFullPath($testRoot)
if (-not $resolved.StartsWith(([IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture path escaped temp.' }
Remove-Item -LiteralPath $sentinel -Force
[IO.Directory]::Delete($outside, $false)
[IO.Directory]::Delete($testRoot, $false)
Write-Output 'PASS cleanup: path escape rejected, readonly file removed, junction unlinked and external sentinel preserved.'
