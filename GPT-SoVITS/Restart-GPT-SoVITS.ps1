param([string]$ReportPath='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Voice-Service-Common.ps1')
$voiceRoot=[IO.Path]::GetFullPath($PSScriptRoot)
$voiceLock=$null
function Write-VoiceRestartResult($Value){
  $json=$Value|ConvertTo-Json -Compress
  if($ReportPath){
    $report=[IO.Path]::GetFullPath($ReportPath)
    $suite=[IO.Path]::GetFullPath((Join-Path $voiceRoot '..')).TrimEnd('\')+'\'
    if(-not$report.StartsWith($suite,[StringComparison]::OrdinalIgnoreCase)){throw '语音重启结果路径无效。'}
    [IO.File]::WriteAllText($report,$json,[Text.UTF8Encoding]::new($false))
  }
  Write-Output $json
}
try {
  $voiceLock=Enter-VoiceServiceLock $voiceRoot
  if(-not(Test-Path -LiteralPath (Join-Path $voiceRoot 'pet_server.py'))){throw '语音服务文件缺失，请修复安装。'}
  $hosts=@(Get-VoiceHostProcesses $voiceRoot)
  $listeners=@(Get-NetTCPConnection -LocalPort 17866 -State Listen -ErrorAction SilentlyContinue)
  foreach($listener in $listeners){if($hosts.ProcessId -notcontains $listener.OwningProcess){throw '17866 端口属于其他程序或另一套安装，已保留该进程，请先检查端口占用。'}}
  $health=$null
  try{$health=Invoke-RestMethod 'http://127.0.0.1:17866/health' -TimeoutSec 2}catch{}
  if($health.modelState -in @('busy','loading')){throw '语音模型正在合成或加载，请等当前语音完成后重启。'}
  # Snapshot only the exact host and its Python children. Never stop by process name or port alone.
  $owned=@($hosts)
  if($hosts.Count){
    $all=@(Get-CimInstance Win32_Process -Filter "Name='python.exe'")
    for($depth=0;$depth -lt 4;$depth++){
      $children=@($all|Where-Object{$_.ParentProcessId -in $owned.ProcessId -and $_.ExecutablePath -in $hosts.ExecutablePath -and $_.ProcessId -notin $owned.ProcessId})
      if(-not$children.Count){break};$owned+= $children
    }
    $tokenFile=Join-Path $voiceRoot 'service-token'
    if($listeners.Count -and (Test-Path -LiteralPath $tokenFile)){
      try{Invoke-RestMethod 'http://127.0.0.1:17866/shutdown' -Method Post -Headers @{'x-service-token'=[IO.File]::ReadAllText($tokenFile).Trim()} -TimeoutSec 3|Out-Null}catch{}
    }
    for($i=0;$i -lt 30;$i++){
      if(-not@(Get-VoiceHostProcesses $voiceRoot).Count){break};Start-Sleep -Milliseconds 250
    }
    [array]::Reverse($owned)
    foreach($item in $owned){
      $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$item.ProcessId)
      if($current -and $current.CreationDate -eq $item.CreationDate -and $current.ExecutablePath -eq $item.ExecutablePath){Stop-Process -Id $item.ProcessId -ErrorAction Stop}
    }
    for($i=0;$i -lt 20;$i++){
      if(-not(Get-NetTCPConnection -LocalPort 17866 -State Listen -ErrorAction SilentlyContinue)){break};Start-Sleep -Milliseconds 250
    }
  }
  # Start also archives the previous logs, and shares this reentrant per-install lock.
  $startOutput=& (Join-Path $voiceRoot 'Start-GPT-SoVITS.ps1') 6>&1 2>&1|Out-String
  $health=Invoke-RestMethod 'http://127.0.0.1:17866/health' -TimeoutSec 3
  if(-not$health.ok -or $health.engine -ne 'gpt-sovits'){throw '语音服务启动后健康检查未通过，请查看语音日志。'}
  Write-VoiceRestartResult ([pscustomobject]@{ok=$true;message='语音服务已重启，健康检查通过。'})
}catch{
  Write-VoiceRestartResult ([pscustomobject]@{ok=$false;error=$_.Exception.Message})
  exit 1
}finally{Exit-VoiceServiceLock $voiceLock}
