param([string]$Root=$PSScriptRoot,[switch]$Restart)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Backend-Common.ps1')
$connectLock=$null
try{
 $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
 if(-not(Test-SuiteInstallation $Root)){throw '大肥鱼安装目录不完整，请修复安装。'}
 $connectLock=Enter-XiaogeServiceLock $Root 'qq-bridge-connect'
 $officialFile=Join-Path $Root 'qq-bridge\state\qq-official\config.json';$officialMode=$false
 if(Test-Path -LiteralPath $officialFile){$officialMode=[bool](Get-Content -LiteralPath $officialFile -Raw -Encoding UTF8|ConvertFrom-Json).enabled}
 if(-not $officialMode -and -not(Test-ExternalQQGateway $Root)){throw '请先保存QQ接口配置。'}
 $helper=Join-Path $Root 'Manage-QQFramework.ps1'
 if(Test-Path -LiteralPath $helper){$framework=& $helper -Root $Root -Action start|ConvertFrom-Json;if(-not$framework.ok){throw $framework.error}}
 $node=Get-SuiteNode $Root
 # Official QQ authenticates in its own reconnecting client. A transient failure
 # of an extra REST probe must not keep a saved transport change unapplied.
 if(-not $officialMode){
  $probe=& $node (Join-Path $Root 'qq-gateway.mjs') probe $Root|ConvertFrom-Json
  if(-not$probe.ok){throw $probe.error}
 }
 $ports=Get-XiaogePorts $Root
 $state=Get-BackendState $Root 'bridge' $ports.bridge
 if($state.foreign){throw '桥接控制台端口属于另一套程序，请先处理端口冲突。'}
 if($Restart -and $state.running){
  if(-not$state.managed){throw '这套桥接由旧入口启动，无法安全重载。请先关闭原桥接窗口，再点“保存并连接”；不用关闭外部QQ框架。'}
  Send-BackendControl $Root 'bridge' $state.pid
  for($i=0;$i -lt 40;$i++){if(-not(Get-CimInstance Win32_Process -Filter ('ProcessId='+$state.pid))){break};Start-Sleep -Milliseconds 250}
  if(Get-CimInstance Win32_Process -Filter ('ProcessId='+$state.pid)){throw '桥接仍在保存状态，暂未启动新实例，请稍后重试。'}
 }
 & (Join-Path $Root 'Start-Bridge.ps1') -Root $Root|Out-Null
 $result=$null
 for($i=0;$i -lt 60;$i++){
  $result=& $node (Join-Path $Root 'qq-gateway.mjs') bridge-status $Root|ConvertFrom-Json
  if($result.ok -and $result.connected){break}
  Start-Sleep -Milliseconds 500
 }
 if(-not$result.ok -or -not$result.connected){throw '凭据/接口测试通过，但桥接尚未收到登录就绪确认。官方QQ请检查平台事件权限、发布与沙箱范围；OneBot请检查事件上报、地址和Token。详见桥接日志。'}
 [pscustomobject]@{ok=$true;connected=$true;dshReady=[bool]$result.dshReady;authorized=[bool]$result.authorized;ownerConfigured=[bool]$result.ownerConfigured}|ConvertTo-Json -Compress
}catch{[pscustomobject]@{ok=$false;connected=$false;error=$_.Exception.Message}|ConvertTo-Json -Compress;exit 1}

finally{if($connectLock){$connectLock.ReleaseMutex();$connectLock.Dispose()}}
