param([string]$Root=$PSScriptRoot,[ValidateSet('detect','start')][string]$Action='detect')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
. (Join-Path $PSScriptRoot 'Port-Common.ps1')
$lock=$null
try{
 $Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
 $officialFile=Join-Path $Root 'qq-bridge\state\qq-official\config.json'
 if(Test-Path -LiteralPath $officialFile){$official=Get-Content -LiteralPath $officialFile -Raw -Encoding UTF8|ConvertFrom-Json;if($official.enabled){[pscustomobject]@{ok=$true;state='official';autoStart=$false;found=$false;message='使用腾讯官方QQ机器人，由QQ桥接直接连接，无需启动第三方框架。'}|ConvertTo-Json -Compress;return}}
 $raw=& (Get-SuiteNode $Root) (Join-Path $Root 'qq-framework.mjs') $Root
 $plan=$raw|ConvertFrom-Json
 if(-not$plan.ok){throw $plan.error}
 if($Action -eq 'detect'){$plan|ConvertTo-Json -Depth 4 -Compress;return}
 if(-not$plan.autoStart){[pscustomobject]@{ok=$true;state='manual';message='QQ框架随启动已关闭，请自行运行框架。'}|ConvertTo-Json -Compress;return}
 if(Test-Path -LiteralPath (Join-Path $Root 'qq-gateway.mjs')){
  try{$online=& (Get-SuiteNode $Root) (Join-Path $Root 'qq-gateway.mjs') probe $Root|ConvertFrom-Json;if($online.ok){[pscustomobject]@{ok=$true;state='connected';message='已检测到QQ接口在线，沿用现有连接，未重复启动框架。'}|ConvertTo-Json -Compress;return}}catch{}
 }
 if(-not$plan.found){[pscustomobject]@{ok=$true;state='missing';message=$plan.message+'；可在连接QQ页面复制给DeepSeek的安装说明。'}|ConvertTo-Json -Compress;return}
 $lock=Enter-XiaogeServiceLock $Root 'external-qq-framework'
 $directory=([string]$plan.cwd).TrimEnd('\')+'\'
 $recordFile=Join-Path $Root 'runtime-control\external-qq-framework.json'
 $existing=@(Get-CimInstance Win32_Process | Where-Object {
  $command=[string]$_.CommandLine
  $suite=$command.IndexOf((Join-Path $Root 'qq-bridge\'),[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $command.IndexOf((Join-Path $Root 'desktop-pet\'),[StringComparison]::OrdinalIgnoreCase) -ge 0
  -not$suite -and (($_.ExecutablePath -and $_.ExecutablePath.StartsWith($directory,[StringComparison]::OrdinalIgnoreCase)) -or $command.IndexOf([string]$plan.entry,[StringComparison]::OrdinalIgnoreCase) -ge 0)
 })
 if($existing.Count){[pscustomobject]@{ok=$true;state='running';message='QQ框架已有进程，未重复启动；请完成框架中的QQ登录并检查接口。'}|ConvertTo-Json -Compress;return}
 if(Test-Path -LiteralPath $recordFile){
  $record=Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8|ConvertFrom-Json
  if($record.entry -eq $plan.entry -and ([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse($record.at)).TotalSeconds -lt 45){[pscustomobject]@{ok=$true;state='starting';message='QQ框架刚收到启动请求，请等待登录界面与接口就绪，未重复启动。'}|ConvertTo-Json -Compress;return}
 }
 $executable=[string]$plan.executable;$arguments=@();$style='Normal'
 if($plan.kind -eq 'node'){$arguments=@(('"'+$plan.entry+'"'));$style='Hidden'}
 elseif($plan.kind -eq 'ps1'){$executable=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe';$arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$plan.entry+'"'))}
 elseif($plan.kind -in @('cmd','bat')){$executable=Join-Path $env:WINDIR 'System32\cmd.exe';$arguments=@('/d','/s','/c',('""'+$plan.entry+'""'))}
 elseif($plan.kind -ne 'exe'){throw '未知QQ框架启动文件类型。'}
 $saved=@{};foreach($name in @('NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE')){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$null,'Process')}
 try{
  $start=@{FilePath=$executable;WorkingDirectory=[string]$plan.cwd;WindowStyle=$style;PassThru=$true}
  if($arguments.Count){$start.ArgumentList=$arguments}
  if($style -eq 'Hidden'){$logs=Join-Path $Root 'logs';[IO.Directory]::CreateDirectory($logs)|Out-Null;$start.RedirectStandardOutput=Join-Path $logs 'qq-framework.log';$start.RedirectStandardError=Join-Path $logs 'qq-framework-error.log'}
  $child=Start-Process @start
  if($child -is [Diagnostics.Process] -and $child.WaitForExit(200) -and $child.ExitCode -ne 0){throw ('QQ框架启动后退出，代码'+$child.ExitCode+'；请查看 logs\qq-framework-error.log 或框架自己的启动窗口。')}
 }finally{foreach($name in $saved.Keys){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
 [IO.Directory]::CreateDirectory((Split-Path $recordFile -Parent))|Out-Null
 [IO.File]::WriteAllText($recordFile,(@{entry=$plan.entry;pid=$child.Id;at=[DateTimeOffset]::UtcNow.ToString('o')}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
 [pscustomobject]@{ok=$true;state='started';message='已启动目录中的QQ框架，请在框架中完成QQ登录；接口就绪后桥接会自动重连。'}|ConvertTo-Json -Compress
}catch{[pscustomobject]@{ok=$false;state='error';error=$_.Exception.Message}|ConvertTo-Json -Compress}
finally{if($lock){$lock.ReleaseMutex();$lock.Dispose()}}
