param([string]$Root=$PSScriptRoot,[int]$WaitSeconds=60,[ValidateRange(1,65535)][int]$Port=5099,[switch]$OpenBrowser,[switch]$CopyPassword)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
. (Join-Path $root 'Runtime-Common.ps1')
 $officialFile=Join-Path $root 'qq-bridge\state\qq-official\config.json'
if(Test-Path -LiteralPath $officialFile){$official=Get-Content -LiteralPath $officialFile -Raw -Encoding UTF8|ConvertFrom-Json;if($official.enabled){Write-Output 'STATUS|5|腾讯官方QQ机器人会随QQ桥接连接，无需登录个人QQ框架。';if($OpenBrowser){& (Join-Path $root 'Open-Console.ps1') -Root $root -View 'qq-official'};return}}
if(Test-ExternalQQGateway $root){
  $helper=Join-Path $root 'Manage-QQFramework.ps1'
  if(Test-Path -LiteralPath $helper){
    try{$reply=& $helper -Root $root -Action start|ConvertFrom-Json;$message=if($reply.ok){$reply.message}else{'QQ框架未能随启动：'+$reply.error};Write-Output ('STATUS|5|'+$message);if(-not$reply.message){$reply|Add-Member -NotePropertyName message -NotePropertyValue $message -Force};$statusFile=Join-Path $root 'runtime-control\external-qq-framework-status.json';[IO.Directory]::CreateDirectory((Split-Path $statusFile -Parent))|Out-Null;[IO.File]::WriteAllText($statusFile,($reply|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))}catch{Write-Output ('STATUS|5|QQ框架检测未完成：'+$_.Exception.Message)}
  }else{Write-Output 'STATUS|5|请自行安装QQ框架，并在连接QQ页面指定正式启动入口。'}
  if($OpenBrowser){$meta=Get-Content -LiteralPath (Join-Path $root 'external-qq-gateway.json') -Raw -Encoding UTF8|ConvertFrom-Json;if($meta.webUrl){Start-Process ([string]$meta.webUrl)}else{Write-Output '请在大肥鱼设置中打开“QQ框架连接”，填写接口地址；框架下载和登录需自行完成。'}}
  return
}
$snow=Join-Path $root 'SnowLuma'
$node=Join-Path $snow 'node.exe'
$logs=Join-Path $root 'logs'
. (Join-Path $root 'Backend-Common.ps1')
Initialize-BackendControl $root
$startupLock=Enter-XiaogeServiceLock $root 'qq'
try{
$before=Get-XiaogePorts $root
$bridgeWasRunning=(Get-BackendState $root 'bridge' $before.bridge).running
if(-not $PSBoundParameters.ContainsKey('Port')){Initialize-XiaogePorts $root;$Port=(Get-XiaogePorts $root).web}
$url='http://127.0.0.1:'+$Port+'/'
function Test-QQPage {
  $response=$null
  try{
    $request=[Net.HttpWebRequest]::Create($url);$request.Proxy=$null;$request.Timeout=2000;$request.ReadWriteTimeout=2000
    $response=$request.GetResponse()
    return ([int]$response.StatusCode -eq 200)
  }catch{return $false}finally{if($response){$response.Close()}}
}
function Assert-QQPortOwner {
  $connection=Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if(-not$connection){return}
  foreach($item in $connection){
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$item.OwningProcess)
    if($process.ExecutablePath -ne $node -or $process.CommandLine -notmatch '(?:\s|["\\/])index\.mjs(?:["\s]|$)'){throw ($Port.ToString()+'端口被其他程序占用（进程'+$item.OwningProcess+'）。请关闭占用程序后重试。')}
  }
}
foreach($file in @($node,(Join-Path $snow 'index.mjs'),(Join-Path $snow 'config\webui.json'),(Join-Path $PSScriptRoot 'Backend-Common.ps1'),(Join-Path $root 'backend-control.cjs'))){if(-not(Test-Path -LiteralPath $file)){throw ('启动文件不完整，缺少 '+$file+'。请运行最新版“修复QQ登录.cmd”补齐；完整运行环境缺失时再修复安装。')}}
Assert-QQPortOwner
foreach($relative in @('native\snowluma-win32-x64.dll','native\snowluma-win32-x64.node','native\websocket-win32-x64.node','native\ffmpeg\ffmpegAddon.win32.x64.node')){
  if(-not(Test-Path -LiteralPath (Join-Path $snow $relative))){throw ('SnowLuma缺少原生组件：'+$relative+'。请完整解压最新版“SnowLuma启动修复包”后运行“修复QQ登录.cmd”。')}
}
$child=$null
if(-not(Test-QQPage)){
  New-Item -ItemType Directory -Path $logs -Force|Out-Null
  $existing=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.ExecutablePath -eq $node -and $_.CommandLine -match 'index\.mjs'})
  if($existing.Count -and (Test-Path -LiteralPath (Join-Path $root 'runtime-control\qq.stopped'))){
    Write-Output 'STATUS|14|旧QQ后台已收到退出请求且网页端口已释放，启动新后台；不强制结束旧进程'
    $existing=@()
  }
  if(-not$existing.Count){
    Write-Output 'STATUS|15|正在单独启动QQ登录服务'
    # Pin only this child to the documented local endpoint, regardless of inherited environment.
    . (Join-Path $PSScriptRoot 'Backend-Common.ps1')
    Initialize-BackendControl $root
    Remove-Item -LiteralPath (Join-Path $root 'runtime-control\qq.stopped') -ErrorAction SilentlyContinue
    $names=@('SNOWLUMA_WEBUI_PORT','SNOWLUMA_WEBUI_HOST','NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE','XIAOGE_BACKEND_ROOT','XIAOGE_BACKEND_SERVICE')
    $saved=@{};foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
    try{
       $env:SNOWLUMA_WEBUI_PORT=[string]$Port;$env:SNOWLUMA_WEBUI_HOST='127.0.0.1'
      $env:XIAOGE_BACKEND_ROOT=$root;$env:XIAOGE_BACKEND_SERVICE='qq'
      Remove-Item Env:NODE_OPTIONS,Env:NODE_PATH,Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
      $child=Start-Process -FilePath $node -ArgumentList @('--require',('"'+(Join-Path $root 'backend-control.cjs')+'"'),'index.mjs') -WorkingDirectory $snow -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'qq-start.log') -RedirectStandardError (Join-Path $logs 'qq-start-error.log')
      [void]$child.Handle
    }finally{foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
  }else{Write-Output 'STATUS|15|QQ进程已存在，正在检查登录页面'}
}
$steady=0
for($i=0;$i -lt [Math]::Max(2,$WaitSeconds);$i++){
  if($env:XIAOGE_STACK_CANCEL_FILE -and (Test-Path -LiteralPath $env:XIAOGE_STACK_CANCEL_FILE)){throw '已请求关闭全部，停止启动QQ后台。'}
  if($child -and $child.HasExited){$child.WaitForExit();throw ('QQ服务启动后退出（代码'+$child.ExitCode+'）。具体原因见 logs\qq-start-error.log。')}
  Assert-QQPortOwner
  if(Test-QQPage){$steady++;if($steady -ge 2){break}}else{$steady=0}
  Start-Sleep -Seconds 1
}
if($steady -lt 2){throw 'QQ登录页面未稳定就绪。请查看 logs\qq-start-error.log，或运行修复QQ登录.cmd生成诊断结果；现有进程不会被强制结束。'}
if($CopyPassword){
  try{$info=Get-Content -LiteralPath (Join-Path $root '安装信息.json') -Raw -Encoding UTF8|ConvertFrom-Json;Add-Type -AssemblyName System.Windows.Forms;[Windows.Forms.Clipboard]::SetText([string]$info.qqWebPassword);Write-Output '网页登录密码已复制，打开后粘贴即可。'}catch{Write-Output '未能复制密码，可在安装信息.json中查看。'}
}
Write-Output ('STATUS|30|QQ登录页已经就绪：'+$url)
$upstreamScript=Join-Path $root 'qq-upstream.mjs'
if(Test-Path -LiteralPath $upstreamScript){
  . (Join-Path $PSScriptRoot 'Backend-Common.ps1')
  Initialize-BackendControl $root
  $backend=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)[0]
  $parentPattern='--parent\s+"?'+$backend.OwningProcess+'"?(?:\s|$)'
  $assistants=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.ExecutablePath -eq $node -and $_.CommandLine -and $_.CommandLine.IndexOf($upstreamScript,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $_.CommandLine -match $parentPattern})
  if(-not$assistants.Count){
    $savedNodeOptions=$env:NODE_OPTIONS;$savedNodePath=$env:NODE_PATH;$savedElectronMode=$env:ELECTRON_RUN_AS_NODE
    try{
      [Environment]::SetEnvironmentVariable('NODE_OPTIONS',$null,'Process')
      [Environment]::SetEnvironmentVariable('NODE_PATH',$null,'Process')
      [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE',$null,'Process')
      Start-Process -FilePath $node -ArgumentList @(('"'+$upstreamScript+'"'),'--root',('"'+$root+'"'),'--parent',([string]$backend.OwningProcess),'--port',([string]$Port)) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'qq-upstream.log') -RedirectStandardError (Join-Path $logs 'qq-upstream-error.log')
    }finally{$env:NODE_OPTIONS=$savedNodeOptions;$env:NODE_PATH=$savedNodePath;$env:ELECTRON_RUN_AS_NODE=$savedElectronMode}
  }
  Write-Output ('STATUS|32|QQ连接助手已启动；首次打开'+$url+'确认协议并在QQ客户端扫码，随后自动连接')
  try{
    $upstream=Get-Content -LiteralPath (Join-Path $root 'runtime-control\qq-upstream-status.json') -Raw -Encoding UTF8 -ErrorAction Stop|ConvertFrom-Json
    $age=([DateTimeOffset]::UtcNow-[DateTimeOffset]::Parse([string]$upstream.at)).TotalSeconds
    if([int]$upstream.parentPid -eq $backend.OwningProcess -and $age -ge 0 -and $age -lt 40){Write-Output ('STATUS|34|'+$upstream.message)}
  }catch{}
}
if($bridgeWasRunning -and -not(Get-BackendState $root 'bridge' (Get-XiaogePorts $root).bridge).running){& (Join-Path $root 'Start-Bridge.ps1') -Root $root}
if($OpenBrowser){Start-Process $url}
}finally{$startupLock.ReleaseMutex();$startupLock.Dispose()}
