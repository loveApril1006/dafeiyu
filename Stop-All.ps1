param([string]$Root=$PSScriptRoot,[int]$QQPort=5099,[int]$BridgePort=3100,[int]$EnginePort=0,[int]$VoicePort=17866,[int]$CompanionPort=17867,[int]$DouyinPort=17869,[switch]$Inspect,[int]$DelayMilliseconds=0,[switch]$KeepExternalQQ)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
$script:StopStatusFile=Join-Path $Root 'runtime-control\stop-all-status.json'
$script:KnownDsh=''
$script:TrackedProcesses=@{}
try{$candidate=[string]((Get-Content -LiteralPath (Join-Path $Root 'desktop-pet\deployment.json') -Raw -Encoding UTF8|ConvertFrom-Json).dshExe);if([IO.Path]::IsPathRooted($candidate) -and [IO.Path]::GetFileName($candidate) -eq 'DeepSeek Harness.exe'){$script:KnownDsh=[IO.Path]::GetFullPath($candidate)}}catch{}
if(-not$EnginePort){try{$uri=[Uri]((Get-Content -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json).dsh.baseUrl);if($uri.IsLoopback){$EnginePort=$uri.Port}}catch{}}
if(-not$EnginePort){$EnginePort=17860}
function Test-SuitePath([string]$Value,[string]$Relative){
  if(-not$Value){return $false}
  $prefix=(Join-Path $Root $Relative).TrimEnd('\')+'\'
  return $Value.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)
}
function Test-SuiteProcess($Process){
  if(-not$Process -or $Process.ProcessId -eq $PID -or -not$Process.ExecutablePath){return $false}
  if(($KeepExternalQQ -or (Test-ExternalQQGateway $Root)) -and (Test-SuitePath $Process.ExecutablePath 'SnowLuma')){
    $ownScript=$Process.CommandLine -and @('qq-bridge\','desktop-pet\'|Where-Object {$Process.CommandLine.IndexOf((Join-Path $Root $_),[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count
    if(-not$ownScript){return $false}
  }
  if($Process.ExecutablePath -eq (Join-Path $Root 'runtime\node.exe')){return [bool]($Process.CommandLine -and @('qq-bridge\','desktop-pet\','engine-launch.mjs','backend-control.cjs'|Where-Object {$Process.CommandLine.IndexOf((Join-Path $Root $_),[StringComparison]::OrdinalIgnoreCase) -ge 0}).Count)}
  $tracked=$script:TrackedProcesses[[string]$Process.ProcessId]
  if($tracked -and $tracked.CreationDate -eq $Process.CreationDate -and $tracked.ExecutablePath -eq $Process.ExecutablePath){return $true}
  if($script:KnownDsh -and $Process.ExecutablePath -eq $script:KnownDsh){return $true}
  if($Process.Name -in @('msedge.exe','chrome.exe')){return [bool]($Process.CommandLine -and $Process.CommandLine.IndexOf((Join-Path $Root 'qq-bridge\companion\douyin-data'),[StringComparison]::OrdinalIgnoreCase) -ge 0)}
  if($Process.Name -notin @('node.exe','python.exe','pythonw.exe','electron.exe','DeepSeek Harness.exe','ffmpeg.exe','ffprobe.exe','mnemon.exe')){return $false}
  foreach($directory in @('SnowLuma','engine','GPT-SoVITS','local-tts','engine-home','desktop-pet','qq-bridge\integrations','qq-bridge\bin')){if(Test-SuitePath $Process.ExecutablePath $directory){return $true}}
  foreach($entry in @('GPT-SoVITS\pet_server.py','local-tts\server.py','qq-bridge\src\mcp-','qq-bridge\companion\')){if($Process.CommandLine -and $Process.CommandLine.IndexOf((Join-Path $Root $entry),[StringComparison]::OrdinalIgnoreCase) -ge 0){return $true}}
  return $false
}
function Suite-Processes { @(Get-CimInstance Win32_Process|Where-Object{Test-SuiteProcess $_}) }
function Track-SuiteChildren {
  $all=@(Get-CimInstance Win32_Process)
  foreach($process in $all){if(Test-SuiteProcess $process){$script:TrackedProcesses[[string]$process.ProcessId]=$process}}
  for($round=0;$round -lt 12;$round++){
    $changed=$false
    foreach($process in $all){if($process.ProcessId -ne $PID -and $process.Name -in @('node.exe','python.exe','pythonw.exe','electron.exe','DeepSeek Harness.exe','ffmpeg.exe','ffprobe.exe','mnemon.exe','msedge.exe','chrome.exe') -and $script:TrackedProcesses.ContainsKey([string]$process.ParentProcessId) -and -not$script:TrackedProcesses.ContainsKey([string]$process.ProcessId)){$script:TrackedProcesses[[string]$process.ProcessId]=$process;$changed=$true}}
    if(-not$changed){break}
  }
}
function Owned-Port([int]$Port){
  foreach($connection in @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)){
    $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$connection.OwningProcess)
    if(Test-SuiteProcess $process){return $process}
  }
  return $null
}
function Write-StopStatus([string]$State,[int]$Percent,[string]$Message,$Remaining=@()){
  $value=@{version=1;state=$State;percent=$Percent;message=$Message;at=[DateTimeOffset]::UtcNow.ToString('o');remaining=@($Remaining|ForEach-Object{@{name=$_.Name;pid=$_.ProcessId}})}
  $temporary=$script:StopStatusFile+'.tmp'
  [IO.File]::WriteAllText($temporary,($value|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporary -Destination $script:StopStatusFile -Force
  Write-Output ('STATUS|'+$Percent+'|'+$Message)
}
function Stop-Post([int]$Port,[string]$Header,[string]$Token){
  if(-not(Owned-Port $Port)){return}
  $request=[Net.HttpWebRequest]::Create(('http://127.0.0.1:'+$Port+'/shutdown'));$request.Proxy=$null;$request.Timeout=8000;$request.KeepAlive=$false;$request.Method='POST';$request.ContentType='application/json'
  if($Token){$request.Headers.Add($Header,$Token)}
  $bytes=[Text.Encoding]::UTF8.GetBytes('{}');$request.ContentLength=$bytes.Length;$stream=$request.GetRequestStream();$stream.Write($bytes,0,$bytes.Length);$stream.Close();$response=$request.GetResponse();$response.Close()
}
function Stop-ControlPipe([string]$Service,$Process){
  if(-not$Process){return $false}
  $record=Get-Content -LiteralPath (Join-Path $Root ('runtime-control\'+$Service+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
  if([int]$record.pid -ne $Process.ProcessId -or $record.service -ne $Service -or $record.pipeName -notmatch '^xiaoge-[a-f0-9]{16}-(bridge|qq|engine)-[a-f0-9]{16}$'){throw '本安装的控制记录不匹配'}
  $pipe=New-Object IO.Pipes.NamedPipeClientStream('.',([string]$record.pipeName),[IO.Pipes.PipeDirection]::InOut)
  $writer=$null;$reader=$null
  try{
    $pipe.Connect(2000);$writer=New-Object IO.StreamWriter($pipe,([Text.UTF8Encoding]::new($false)),1024,$true);$reader=New-Object IO.StreamReader($pipe,([Text.UTF8Encoding]::new($false)),$false,1024,$true);$writer.AutoFlush=$true
    $writer.WriteLine((@{action='stop';token=[string]$record.token}|ConvertTo-Json -Compress));$read=$reader.ReadLineAsync()
    if(-not$read.Wait(5000)){throw '关闭请求超时'}
    if(-not($read.Result|ConvertFrom-Json).ok){throw '关闭请求未被服务接受'}
    return $true
  }finally{if($writer){$writer.Dispose()};if($reader){$reader.Dispose()};$pipe.Dispose()}
}
function Stop-NodeAction([string]$Action,[int]$Port){
  $node=Get-SuiteNode $Root;if(-not(Test-Path -LiteralPath $node)){return}
  & $node (Join-Path $PSScriptRoot 'stop-suite-runtime.mjs') $Action $Root ([string]$Port) 2>$null|Out-Null
}
function Close-SuiteWindows {
  foreach($process in (Suite-Processes|Where-Object {$_.Name -in @('DeepSeek Harness.exe','electron.exe','msedge.exe','chrome.exe')})){
    try{$app=Get-Process -Id $process.ProcessId -ErrorAction Stop;if($app.MainWindowHandle -ne 0){$null=$app.CloseMainWindow()}}catch{}
  }
}
function Test-ProtectedProcess($Process){
  # Older migrated headless engines have no control pipe. After graceful attempts,
  # allow the explicitly requested full stop for this root's CLI engine only.
  if($Process.Name -eq 'DeepSeek Harness.exe' -and (Test-SuitePath $Process.ExecutablePath 'engine') -and $Process.CommandLine -and $Process.CommandLine.IndexOf((Join-Path $Root 'engine\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'),[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $Process.CommandLine -match '(?:^|\s)--no-open(?:\s|$)'){return $false}
  if($Process.Name -eq 'DeepSeek Harness.exe' -or ($script:KnownDsh -and $Process.ExecutablePath -eq $script:KnownDsh)){return $true}
  return [bool]($Process.Name -eq 'node.exe' -and $Process.CommandLine -and ($Process.CommandLine -match '(?:["\\/\s])index\.mjs(?:["\s]|$)' -or $Process.CommandLine.IndexOf((Join-Path $Root 'qq-bridge\start-qq-bridge.mjs'),[StringComparison]::OrdinalIgnoreCase) -ge 0))
}
function Invoke-XiaogeStop {
  $mutex=$null;$locked=$false
  try{
    if($Root.Length -le 3 -or (-not(Test-SuiteInstallation $Root) -and -not(Test-Path -LiteralPath (Join-Path $Root 'Start-All.ps1')))){throw '这不是大肥鱼安装目录，未操作进程。'}
    if($Inspect){@{root=$Root;enginePort=$EnginePort;processes=@(Suite-Processes|ForEach-Object{@{pid=$_.ProcessId;name=$_.Name;protected=[bool](Test-ProtectedProcess $_)}})}|ConvertTo-Json -Depth 5;return 0}
    $hash=[Security.Cryptography.SHA256]::Create();try{$key=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())))).Replace('-','').Substring(0,24)}finally{$hash.Dispose()}
    $mutex=New-Object Threading.Mutex($false,('Local\XiaogeStopAll-'+$key));$locked=$mutex.WaitOne(0)
    if(-not$locked){throw '关闭操作已在进行，请等待上一次关闭完成。'}
    $control=Join-Path $Root 'runtime-control';[IO.Directory]::CreateDirectory($control)|Out-Null
    $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false);$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')));[IO.Directory]::SetAccessControl($control,$acl)
    if($DelayMilliseconds -gt 0){Start-Sleep -Milliseconds ([Math]::Min($DelayMilliseconds,3000))}
    Track-SuiteChildren
    foreach($service in @('stack','qq','bridge')){[IO.File]::WriteAllText((Join-Path $control ($service+'.stopped')),'stop all')}
    Write-StopStatus 'running' 5 '正在停止自动重启与QQ机器人桥接'
    . (Join-Path $Root 'Port-Common.ps1')
    $localPorts=Get-XiaogePorts $Root
    if(-not $PSBoundParameters.ContainsKey('BridgePort')){$BridgePort=$localPorts.bridge}
    if(-not $PSBoundParameters.ContainsKey('QQPort')){$QQPort=$localPorts.web}
    $bridge=Owned-Port $BridgePort
    if(-not$bridge){$bridge=Suite-Processes|Where-Object {$_.CommandLine -and $_.CommandLine.IndexOf((Join-Path $Root 'qq-bridge\start-qq-bridge.mjs'),[StringComparison]::OrdinalIgnoreCase) -ge 0}|Select-Object -First 1}
    if($bridge){try{$null=Stop-ControlPipe 'bridge' $bridge}catch{Stop-NodeAction 'bridge' $BridgePort}}
    Write-StopStatus 'running' 20 '正在停止桌宠及其自动任务'
    if(Owned-Port $EnginePort){try{Stop-NodeAction 'pet' $EnginePort}catch{}}
    Write-StopStatus 'running' 35 '正在停止抖音、B站与生活服务'
    $token='';try{$token=[IO.File]::ReadAllText((Join-Path $Root 'qq-bridge\companion\companion-token')).Trim()}catch{}
    if($token){foreach($port in @($DouyinPort,$CompanionPort)){try{Stop-Post $port 'x-companion-token' $token}catch{}}}
    Write-StopStatus 'running' 50 '正在卸载GPT-SoVITS及旧语音模型'
    try{$voiceToken=[IO.File]::ReadAllText((Join-Path $Root 'GPT-SoVITS\service-token')).Trim();Stop-Post $VoicePort 'x-service-token' $voiceToken}catch{}
    Write-StopStatus 'running' 65 '正在卸载QQ连接并关闭QQ后台'
    $qq=Owned-Port $QQPort
    if($qq){try{Stop-NodeAction 'unload-qq' $QQPort}catch{};try{$null=Stop-ControlPipe 'qq' $qq}catch{}}
    Write-StopStatus 'running' 75 '正在关闭聊天引擎与专用浏览器'
    $engine=Owned-Port $EnginePort;if($engine){try{$null=Stop-ControlPipe 'engine' $engine}catch{}}
    Close-SuiteWindows
    for($i=0;$i -lt 16;$i++){if(-not(Suite-Processes).Count){break};Start-Sleep -Milliseconds 500}
    Write-StopStatus 'running' 90 '正在检查剩余模型与后台进程'
    foreach($process in (Suite-Processes)){
      if(Test-ProtectedProcess $process){continue}
      $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$process.ProcessId)
      if(-not$current -or $current.CreationDate -ne $process.CreationDate -or $current.ExecutablePath -ne $process.ExecutablePath -or -not(Test-SuiteProcess $current)){continue}
      Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue
    }
    for($i=0;$i -lt 12;$i++){if(-not(Suite-Processes).Count){break};Start-Sleep -Milliseconds 250}
    $left=Suite-Processes
    if($left.Count){$message='部分后台未退出：'+(($left|ForEach-Object {$_.Name+' PID '+$_.ProcessId}) -join '，')+'。请正常退出这些窗口后再点关闭。';Write-StopStatus 'failed' 90 $message $left;throw $message}
    $dll=Join-Path $Root 'SnowLuma\native\snowluma-win32-x64.dll'
    if(-not$KeepExternalQQ -and -not(Test-ExternalQQGateway $Root) -and (Test-Path -LiteralPath $dll)){try{$handle=[IO.File]::Open($dll,'Open','ReadWrite','None');$handle.Dispose()}catch{throw '后台已退出，但QQ客户端仍占用连接组件。请正常退出QQ后再更新或删除。'}}
    Write-StopStatus 'complete' 100 '全部机器人功能已关闭，语音与本机模型已卸载。配置、账号和记录已保留。'
    return 0
  }catch{
    $failure=$_.Exception.Message
    if($locked -and (Test-Path -LiteralPath (Split-Path -Parent $script:StopStatusFile))){try{Write-StopStatus 'failed' 90 $failure (Suite-Processes)}catch{}}
    Write-Output ('ERROR|'+$failure);return 1
  }finally{if($locked){$mutex.ReleaseMutex()};if($mutex){$mutex.Dispose()}}
}
if($MyInvocation.InvocationName -ne '.'){$result=Invoke-XiaogeStop; $code=0;foreach($entry in @($result)){if($entry -is [int]){$code=$entry}else{Write-Output $entry}};exit $code}
