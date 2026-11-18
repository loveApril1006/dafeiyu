$ErrorActionPreference='Stop'
$suiteRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
. (Join-Path $suiteRoot 'Runtime-Common.ps1')
function Assert-SuiteStarting {if($env:XIAOGE_STACK_CANCEL_FILE -and (Test-Path -LiteralPath $env:XIAOGE_STACK_CANCEL_FILE)){throw '已请求关闭全部，停止继续启动。'}}
Assert-SuiteStarting
$root=$PSScriptRoot
$installRoot=[IO.Path]::GetFullPath((Join-Path $root '..\..'))
if(Test-Path -LiteralPath (Join-Path $installRoot 'engine-home')){
  $env:DSH_HOME=Join-Path $installRoot 'engine-home';$env:DSH_PROFILE='web'
  $env:XIAOGE_DSH_EXE=Join-Path $installRoot 'engine\DeepSeek Harness.exe'
}
$env:PATH=(Join-Path $installRoot 'qq-bridge\bin')+';'+$env:PATH
$entry=Join-Path $root 'companion-service.mjs'
$node=Get-SuiteNode $suiteRoot
$connections=@(Get-NetTCPConnection -LocalPort 17867 -State Listen -ErrorAction SilentlyContinue)
foreach($connection in $connections){
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$connection.OwningProcess)
  if(-not(Test-SuiteNodePath $installRoot $process.ExecutablePath) -or $process.CommandLine.IndexOf($entry,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw '17867端口属于其他生活服务，未启动重复实例。'}
}
if(-not $connections.Count){
  Start-Process -FilePath $node -ArgumentList @('--expose-internals',('"'+$entry+'"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'companion.log') -RedirectStandardError (Join-Path $root 'companion-error.log')|Out-Null
}
for($i=0;$i -lt 30;$i++){
  Assert-SuiteStarting
  try{$health=Invoke-RestMethod 'http://127.0.0.1:17867/health' -TimeoutSec 2;if($health.ok -and $health.desktopPet -eq $false){Write-Output '独立QQ生活服务已就绪（没有桌宠或麦克风监听）';return}}catch{}
  Assert-SuiteStarting
  Start-Sleep -Seconds 1
}
throw '生活服务启动未完成，请查看 companion-error.log。'
