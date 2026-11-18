param([string]$Root=$PSScriptRoot,[ValidateRange(1,600)][int]$WaitSeconds=90,[int]$Port=3100)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Runtime-Common.ps1')
. (Join-Path $PSScriptRoot 'Backend-Common.ps1')
$root=[IO.Path]::GetFullPath($Root).TrimEnd('\')
Initialize-BackendControl $root
$before=Get-XiaogePorts $root
$qqWasRunning=(Get-BackendState $root 'qq' $before.web).running
if(-not $PSBoundParameters.ContainsKey('Port')){Initialize-XiaogePorts $root;$Port=(Get-XiaogePorts $root).bridge}
if($qqWasRunning -and -not(Get-BackendState $root 'qq' (Get-XiaogePorts $root).web).running){& (Join-Path $root 'Start-QQ.ps1') -Root $root -Port (Get-XiaogePorts $root).web}
$child=$null
$state=Get-BackendState $root 'bridge' $Port
if($state.foreign){throw '3100控制台端口被其他程序占用。'}
if(-not$state.running){
  $cfg=Get-Content -LiteralPath (Join-Path $root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
  if($cfg.consolePort -and [int]$cfg.consolePort -ne $Port){throw '控制台端口与配置不一致，未启动重复实例。'}
  Initialize-BackendControl $root
  $logs=Join-Path $root 'logs';[IO.Directory]::CreateDirectory($logs)|Out-Null
  Remove-Item -LiteralPath (Join-Path $root 'runtime-control\bridge.stopped') -ErrorAction SilentlyContinue
  $names=@('XIAOGE_BACKEND_ROOT','XIAOGE_BACKEND_SERVICE','DSH_HOME','DSH_PROFILE','DSH_WEB_URL','PATH','XIAOGE_DSH_EXE','NODE_OPTIONS','NODE_PATH','ELECTRON_RUN_AS_NODE');$saved=@{}
  foreach($name in $names){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
  try{
    $env:XIAOGE_BACKEND_ROOT=$root;$env:XIAOGE_BACKEND_SERVICE='bridge';$env:DSH_WEB_URL=$cfg.dsh.baseUrl
    if(Test-Path -LiteralPath (Join-Path $root 'engine-home')){$env:DSH_HOME=Join-Path $root 'engine-home';$env:DSH_PROFILE='web'}
    $env:PATH=(Join-Path $root 'qq-bridge\bin')+';'+$env:PATH
    if(Test-Path -LiteralPath (Join-Path $root 'engine\DeepSeek Harness.exe')){$env:XIAOGE_DSH_EXE=Join-Path $root 'engine\DeepSeek Harness.exe'}
    Remove-Item Env:NODE_OPTIONS,Env:NODE_PATH,Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
    $child=Start-Process -FilePath (Get-SuiteNode $root) -ArgumentList @('--require',('"'+(Join-Path $root 'backend-control.cjs')+'"'),'--expose-internals',('"'+(Join-Path $root 'qq-bridge\start-qq-bridge.mjs')+'"')) -WorkingDirectory (Join-Path $root 'qq-bridge') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'bridge.log') -RedirectStandardError (Join-Path $logs 'bridge-error.log')
  }finally{foreach($name in $names){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}}
}
# Use elapsed seconds and refresh the credential after the server creates it.
$watch=[Diagnostics.Stopwatch]::StartNew()
$lastHint='进程仍在初始化，尚未监听网页端口'
while($watch.Elapsed.TotalSeconds -lt $WaitSeconds){
  if($child){$child.Refresh();if($child.HasExited){throw ('QQ Bridge启动后退出，代码'+$child.ExitCode+'，请查看logs\bridge-error.log和logs\bridge.log。')}}
  $state=Get-BackendState $root 'bridge' $Port
  if($state.foreign){throw ('控制台端口'+$Port+'被其他程序占用；未连接到本安装的Bridge。')}
  if($state.ready){
    $response=$null
    try{
      $cfg=Get-Content -LiteralPath (Join-Path $root 'qq-bridge\config.json') -Raw -Encoding UTF8|ConvertFrom-Json
      $token=([string]$cfg.consoleToken).Trim()
      # Match the backend's validation; an invalid manual value falls back to state.
      if($token.Length -lt 16 -or $token.Length -gt 128 -or $token -notmatch '^[A-Za-z0-9_-]+$'){
        $token='';try{$token=[IO.File]::ReadAllText((Join-Path $root 'qq-bridge\state\console-token')).Trim()}catch{}
      }
      if(-not$token){$lastHint='网页已监听，正在等待首次生成控制台登录令牌'}
      else{
        $request=[Net.HttpWebRequest]::Create(('http://127.0.0.1:'+$Port+'/api/status'));$request.Proxy=$null
        $remaining=[Math]::Max(1,[int](($WaitSeconds-$watch.Elapsed.TotalSeconds)*1000))
        $request.Timeout=[Math]::Min(1500,$remaining);$request.ReadWriteTimeout=$request.Timeout
        $request.AllowAutoRedirect=$false;$request.Headers.Add('X-Console-Token',$token)
        $response=$request.GetResponse()
        $reader=[IO.StreamReader]::new($response.GetResponseStream())
        try{$status=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}
        if($status.dshReady -isnot [bool] -or -not($status.qqGateway -or $status.snowluma)){throw '本机端口未返回Bridge运行状态'}
        Write-Output 'QQ Bridge已启动。';return
      }
    }catch{
      $failure=$_.Exception
      while(-not$failure.Response -and $failure.InnerException){$failure=$failure.InnerException}
      $httpCode=0;try{$httpCode=[int]$failure.Response.StatusCode}catch{}
      if($httpCode -eq 401 -or $httpCode -eq 403){$lastHint='网页已启动，但登录凭据校验尚未通过（HTTP '+$httpCode+'）；正在重新读取令牌'}
      elseif($httpCode){$lastHint='网页接口暂不可用（HTTP '+$httpCode+'）'}
      else{$lastHint='网页已监听，但运行状态检查尚未通过'}
      if($failure.Response){$failure.Response.Close()}
    }finally{if($response){$response.Close()}}
  }
  if($watch.Elapsed.TotalSeconds -lt $WaitSeconds){Start-Sleep -Milliseconds 500}
}
throw ('QQ Bridge网页等待'+$WaitSeconds+'秒后尚未就绪：'+$lastHint+'。地址：http://127.0.0.1:'+$Port+'/。请同时查看logs\bridge-error.log和logs\bridge.log；错误日志为空时，启动过程通常记录在bridge.log。')
