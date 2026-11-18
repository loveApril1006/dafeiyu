<#
  停止本机运行的 qq-bridge。
  本机没有独立 node.exe，桥接宿主进程名是 "DeepSeek Harness.exe"，
  所以按「锁文件 PID / 控制台端口 3100 占用者 / 启动脚本命令行」三条路一起找。
  仅供 restart.bat 调用。
#>
param([switch]$Quiet)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$lock = Join-Path $root 'state\bridge.lock'
$pids = @()

if (Test-Path $lock) {
  $raw = (Get-Content $lock -Raw).Trim()
  if ($raw -match '^\d+$') { $pids += [int]$raw }
}

$pids += (Get-NetTCPConnection -State Listen -LocalPort 3100 | Select-Object -ExpandProperty OwningProcess)

Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -like '*start-qq-bridge.mjs*' } |
  ForEach-Object { $pids += $_.ProcessId }

# 守护窗口（cmd 跑 start.bat）
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" |
  Where-Object { $_.CommandLine -like '*start.bat*' -and $_.CommandLine -notlike '*restart.bat*' } |
  ForEach-Object { $pids += $_.ProcessId }

$self = $PID
$pids | Sort-Object -Unique | Where-Object { $_ -and $_ -ne $self } | ForEach-Object {
  if (-not $Quiet) { Write-Host ("  kill PID " + $_) }
  Stop-Process -Id $_ -Force
}

Start-Sleep -Seconds 3

$live = Get-NetTCPConnection -State Listen -LocalPort 3100
if ($live) {
  if (-not $Quiet) {
    Write-Host '仍有桥接进程占用 3100：'
    $live | ForEach-Object { Write-Host ('  PID ' + $_.OwningProcess) }
  }
  exit 1
}
exit 0