$ErrorActionPreference='Stop'
$source=Get-Content -LiteralPath (Join-Path $PSScriptRoot '../packaging/installer/Install.ps1') -Raw -Encoding UTF8
$start=$source.IndexOf('function Get-InstallProbeFailure {')
$end=$source.IndexOf('function Get-InstallFileHash',$start)
if($start -lt 0 -or $end -lt $start){throw 'Installer helper boundary changed'}
function Assert-InstallActive {}
. ([ScriptBlock]::Create($source.Substring($start,$end-$start)))
$node=(Get-Command node.exe).Source
$failure=@(Invoke-InstallChild -File $node -Arguments @('-e',"process.stderr.write('fixture import traceback');process.exit(7)") -Quiet)
if($script:InstallExitCode -ne 7){throw 'Child exit status was lost'}
if(($failure -join "`n") -notmatch 'fixture import traceback'){throw 'Quiet probe hid failure traceback'}
if($script:InstallError -notmatch 'fixture import traceback'){throw 'Final error lost the underlying cause'}
$success=@(Invoke-InstallChild -File $node -Arguments @('-e',"process.stdout.write('fixture success')") -Quiet)
if($script:InstallExitCode -ne 0 -or $success.Count){throw 'Successful quiet probe should stay quiet'}
$memoryError=Get-InstallProbeFailure 'OSError: [WinError 1455] 页面文件太小，无法完成操作。'
if($memoryError -notmatch 'sysdm.cpl' -or $memoryError -notmatch '原始错误'){throw 'Commit limit failure must retain cause and actionable instructions'}
$otherError=Get-InstallProbeFailure 'ModuleNotFoundError: soundfile'
if($otherError -match 'sysdm.cpl'){throw 'Other imports must not be misdiagnosed as commit limit failures'}
Write-Output 'PASS installer probe: failure exit code and stderr retained; successful quiet probe stays silent'
