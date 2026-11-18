param([string]$Root=$PSScriptRoot,[int]$WaitSeconds=60)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$Root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
. (Join-Path $Root 'Backend-Common.ps1')
Initialize-BackendControl $Root
$lock=Enter-XiaogeServiceLock $Root 'engine'
try{
  $config=Get-Content -LiteralPath (Join-Path $Root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  $url=[Uri]$config.dsh.baseUrl
  if($url.Scheme -ne 'http' -or -not $url.IsLoopback -or $url.Query -or $url.UserInfo -or $url.Fragment){throw '聊天引擎地址必须是本机HTTP地址。'}
  $exe=Join-Path $Root 'engine\DeepSeek Harness.exe'
  $cli=Join-Path $Root 'engine\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'
  $node=Get-SuiteNode $Root
  $launch=Join-Path $Root 'engine-launch.mjs'
  $listeners=@(Get-NetTCPConnection -LocalPort $url.Port -State Listen -ErrorAction SilentlyContinue)
  if($listeners.Count){
    foreach($listener in $listeners){$owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess);if($owner.ExecutablePath -ne $exe -or -not $owner.CommandLine -or $owner.CommandLine.IndexOf($cli,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'DSH端口属于其他安装或程序，未操作该进程。'}}
    & $node $launch probe $Root
    if($LASTEXITCODE -ne 0){throw '本安装DSH进程存在，但接口尚未就绪；请稍后重试，或查看logs/engine-error.log。'}
    Write-Output '本安装DSH聊天引擎已运行，接口检查通过。';return
  }
  foreach($file in @($exe,$node,$launch,(Join-Path $Root 'backend-control.cjs'))){if(-not(Test-Path -LiteralPath $file)){throw ('缺少聊天引擎启动文件：'+$file)}}
  & $node $launch prepare $Root
  if($LASTEXITCODE -ne 0){throw 'DSH Web启动配置检查失败，未启动引擎。'}
  $logs=Join-Path $Root 'logs';[IO.Directory]::CreateDirectory($logs)|Out-Null
  Remove-Item -LiteralPath (Join-Path $Root 'runtime-control\engine.stopped') -ErrorAction SilentlyContinue
  $names=@('DSH_HOME','DSH_PROFILE','ELECTRON_RUN_AS_NODE','XIAOGE_BACKEND_ROOT','XIAOGE_BACKEND_SERVICE','NODE_OPTIONS','NODE_PATH');$saved=@{}
  foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
  try{
    $env:DSH_HOME=Join-Path $Root 'engine-home';$env:DSH_PROFILE='web';$env:ELECTRON_RUN_AS_NODE='1'
    $env:XIAOGE_BACKEND_ROOT=$Root;$env:XIAOGE_BACKEND_SERVICE='engine'
    Remove-Item Env:NODE_OPTIONS,Env:NODE_PATH -ErrorAction SilentlyContinue
    $child=Start-Process -FilePath $exe -ArgumentList @('--require',('"'+(Join-Path $Root 'backend-control.cjs')+'"'),'--expose-internals',('"'+$cli+'"'),'--profile','web','--patch',('"'+(Join-Path $Root 'runtime-control\engine-launch.patch.json')+'"')) -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'engine.log') -RedirectStandardError (Join-Path $logs 'engine-error.log') -PassThru
    [void]$child.Handle
  }finally{foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
  $clock=[Diagnostics.Stopwatch]::StartNew()
  while($clock.Elapsed.TotalSeconds -lt $WaitSeconds){
    if($child.HasExited){throw ('DSH启动退出，代码'+$child.ExitCode+'，请查看logs/engine-error.log。')}
    if(Get-NetTCPConnection -LocalPort $url.Port -State Listen -ErrorAction SilentlyContinue){
      $probe=& $node $launch probe $Root 2>&1
      if($LASTEXITCODE -eq 0){Write-Output 'DSH聊天引擎已启动，接口检查通过。';return}
    }
    Start-Sleep -Seconds 1
  }
  throw 'DSH启动超时，请查看logs/engine-error.log。'
}finally{$lock.ReleaseMutex();$lock.Dispose()}
