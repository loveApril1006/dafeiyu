param([switch]$CheckOnly,[switch]$PreserveStopRequest)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
trap { Write-Output ('ERROR|'+$_.Exception.Message); exit 1 }
$root=$PSScriptRoot
. (Join-Path $root 'Backend-Common.ps1')
Initialize-BackendControl $root
$env:XIAOGE_STACK_CANCEL_FILE=Join-Path $root 'runtime-control\stack.stopped'
if(-not $PreserveStopRequest){Remove-Item -LiteralPath $env:XIAOGE_STACK_CANCEL_FILE -ErrorAction SilentlyContinue}
function Assert-StackActive {if(Test-Path -LiteralPath $env:XIAOGE_STACK_CANCEL_FILE){throw '已请求关闭全部，停止继续启动。'}}
$env:DSH_HOME=Join-Path $root 'engine-home'
$env:DSH_PROFILE='web'
$env:PATH=(Join-Path $root 'qq-bridge\bin')+';'+$env:PATH
$env:XIAOGE_DSH_EXE=Join-Path $root 'engine\DeepSeek Harness.exe'
$env:PYTHONUTF8='1'
$env:PYTHONIOENCODING='utf-8'
$env:DSH_WEB_URL='http://127.0.0.1:17860'
$logs=Join-Path $root 'logs'
New-Item -ItemType Directory -Path $logs -Force|Out-Null
function Progress($percent,$message){Assert-StackActive;Write-Output ('STATUS|'+$percent+'|'+$message)}
function Health($url){try{Invoke-RestMethod $url -TimeoutSec 2}catch{$null}}
function Listen($port){[bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)}
# QQ can be reached even if model/voice startup later fails.
$officialQQ=$false;$officialFile=Join-Path $root 'qq-bridge\state\qq-official\config.json'
if(Test-Path -LiteralPath $officialFile){$officialQQ=[bool](Get-Content -LiteralPath $officialFile -Raw -Encoding UTF8|ConvertFrom-Json).enabled}
if(-not$CheckOnly){
  $settings=Get-SuiteInstallOptions $root
  $qqEnabled=[bool]$settings.qqEnabled -or $officialQQ
  if($qqEnabled){if(Test-ExternalQQGateway $root){Progress 5 '正在检测并启动目录中的QQ框架'}else{Progress 5 '正在启动 QQ 后台'};& (Join-Path $root 'Start-QQ.ps1') -Root $root}
  else{Progress 5 '设置中未启用QQ，已跳过QQ框架；可在大肥鱼设置中启用QQ并保存。'}
}
$ports=Get-XiaogePorts $root
$suitePorts=@(17860,17866,17867,$ports.bridge);if(-not(Test-ExternalQQGateway $root)){$suitePorts+=,$ports.web}
foreach($port in $(if($CheckOnly){@()}else{$suitePorts})){
  $connection=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if($connection){$process=Get-CimInstance Win32_Process -Filter ('ProcessId='+@($connection)[0].OwningProcess);if(-not $process.CommandLine -or $process.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw ('端口'+$port+'已由其他程序占用。请先退出另一套大肥鱼或占用程序，再启动。')}}
}
function Wait-Port($port,$seconds){for($i=0;$i -lt $seconds;$i++){Assert-StackActive;if(Listen $port){return};Start-Sleep -Seconds 1};throw ('服务启动超时，端口 '+$port+'；请查看 logs 文件夹')}
foreach($relative in @('runtime\node.exe','engine\DeepSeek Harness.exe','GPT-SoVITS\runtime\python.exe','local-tts\runtime\python.exe')){if(-not(Test-Path -LiteralPath (Join-Path $root $relative))){throw ('缺少文件：'+$relative+'。请重新运行安装工具修复。')}}
if($CheckOnly){Progress 100 '运行文件检查通过';return}
$node=Get-SuiteNode $root
$petEnabled=Test-XiaogePetPreference $root
Progress 8 '正在启动QQ桥接；模型未就绪时会等待连接'
& (Join-Path $root 'Start-Bridge.ps1') -Root $root
$ports=Get-XiaogePorts $root
if($petEnabled){
  Progress 9 '正在检查桌宠注册'
  & (Join-Path $root 'Repair-PetRegistration.ps1') -Root $root -NoShow
}
Progress 10 '正在启动聊天引擎'
if(Test-Path -LiteralPath (Join-Path $root 'Reuse-DeepSeekAccount.ps1')){try{& (Join-Path $root 'Reuse-DeepSeekAccount.ps1') -Root $root}catch{Progress 10 '本机账号复用未完成，可在DSH网页手动登录后继续使用。'}}
& (Join-Path $root 'Start-Engine.ps1') -Root $root -WaitSeconds 90
Progress 40 '正在启动胡桃语音（无可用显卡时使用CPU）'
& (Join-Path $root 'GPT-SoVITS\Start-GPT-SoVITS.ps1')
Progress 65 '正在启动独立QQ生活服务'
& (Join-Path $root 'qq-bridge\companion\Start-Companion.ps1')
Progress 80 'QQ桥接已准备；正在完成其他服务检查'
$voice=Health 'http://127.0.0.1:17866/health'
if($qqEnabled -and -not(Test-ExternalQQGateway $root)){
  Progress 98 '正在再次确认 QQ框架 网页可访问'
  & (Join-Path $root 'Start-QQ.ps1') -Root $root | Out-Null
}
if($petEnabled){
  Progress 99 '正在启动新版大肥鱼桌宠'
  & (Join-Path $root 'desktop-pet\Start-Pet.ps1') -NoBackends
  if($LASTEXITCODE -ne 0){throw '新版桌宠启动未完成，请查看desktop-pet使用说明。'}
}
$upstreamNote=''
if($qqEnabled){try{$upstream=Get-Content -LiteralPath (Join-Path $root 'runtime-control\qq-upstream-status.json') -Raw -Encoding UTF8 -ErrorAction Stop|ConvertFrom-Json;$upstreamNote='；'+$upstream.message}catch{$upstreamNote='；QQ上游正在准备，首次请到5099确认协议并在QQ窗口扫码'}}
$petNote='（桌宠未启用）'
if($petEnabled){$petNote='，新版桌宠已加载'}
if($officialQQ){Progress 100 ('本套程序服务已就绪'+$petNote+'；腾讯官方QQ机器人随桥接连接，请在后台检查平台权限、会话授权与连接状态。语音设备：'+$voice.device)}
elseif(Test-ExternalQQGateway $root){$frameworkNote='请在连接QQ页面检查框架、登录与接口';try{$frameworkNote=(Get-Content -LiteralPath (Join-Path $root 'runtime-control\external-qq-framework-status.json') -Raw -Encoding UTF8|ConvertFrom-Json).message}catch{};Progress 100 ('本套程序服务已就绪'+$petNote+'；'+$frameworkNote+'。语音设备：'+$voice.device)}
else{Progress 100 ('QQ与语音后台已启动'+$petNote+'。语音设备：'+$voice.device+$(if($qqEnabled){'；QQ框架：http://127.0.0.1:'+$ports.web+'/'}else{'；QQ未启用，QQ框架没有启动。'})+$upstreamNote)}
