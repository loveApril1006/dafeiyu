param([string]$Root=$PSScriptRoot,[ValidateSet('status','start','stop')][string]$Action='status',[ValidateSet('bridge','qq')][string]$Service='bridge',[int]$BridgePort=3100,[int]$QQPort=5099)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Backend-Common.ps1')
$root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
try{
  $ports=Get-XiaogePorts $root
  if(-not $PSBoundParameters.ContainsKey('BridgePort')){$BridgePort=$ports.bridge}
  if(-not $PSBoundParameters.ContainsKey('QQPort')){$QQPort=$ports.web}
  $port=if($Service -eq 'bridge'){$BridgePort}else{$QQPort}
  $state=Get-BackendState $root $Service $port
  if($Service -eq 'qq' -and (Test-ExternalQQGateway $root)){
    if($Action -eq 'stop'){throw '外部QQ框架由用户自行管理，请在框架自己的窗口关闭；大肥鱼不会结束其进程。'}
    [pscustomobject]@{ok=$true;bridge=(Get-BackendState $root 'bridge' $ports.bridge);qq=$state}|ConvertTo-Json -Depth 5 -Compress
    exit 0
  }
  if($Action -eq 'stop' -and $state.foreign){throw '端口属于另一套程序，未操作该进程。'}
  if($Action -eq 'start'){
    if($Service -eq 'bridge'){& (Join-Path $PSScriptRoot 'Start-Bridge.ps1') -Root $root}
    else{& (Join-Path $PSScriptRoot 'Start-QQ.ps1') -Root $root}
  }elseif($Action -eq 'stop' -and $state.running){
    if(-not$state.managed){throw ('当前后台由旧方式启动（PID '+$state.pid+'）。请先手动退出这一项，再用本窗口“启动”；以后可直接点击“关闭”。')}
    Send-BackendControl $root $Service $state.pid
    for($i=0;$i -lt 40;$i++){
      if(-not(Get-CimInstance Win32_Process -Filter ('ProcessId='+$state.pid))){break}
      Start-Sleep -Milliseconds 250
    }
    if(Get-CimInstance Win32_Process -Filter ('ProcessId='+$state.pid)){throw '后台仍在保存或退出，未强制结束；请稍后刷新状态。'}
  }
  $ports=Get-XiaogePorts $root
  [pscustomobject]@{ok=$true;bridge=(Get-BackendState $root 'bridge' $ports.bridge);qq=(Get-BackendState $root 'qq' $ports.web)}|ConvertTo-Json -Depth 5 -Compress
}catch{[pscustomobject]@{ok=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress;exit 1}
